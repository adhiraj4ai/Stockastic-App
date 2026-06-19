import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import api from '@/lib/api';

// Mock axios.post and axios.get but keep the rest (like create) intact
vi.mock('axios', async (importOriginal) => {
    const original = await importOriginal<typeof import('axios')>();
    const mockAxios = { ...original.default };
    mockAxios.post = vi.fn();
    mockAxios.get = vi.fn();
    return {
        ...original,
        default: mockAxios,
    };
});

describe('Axios Token Refresh Interceptor Queueing', () => {
    const originalLocation = window.location;

    beforeEach(() => {
        vi.clearAllMocks();
        // Setup window.location mock
        delete (window as any).location;
        window.location = { href: '' } as any;

        // Mock localStorage globally
        const mockStorage: Record<string, string> = {};
        global.localStorage = {
            getItem: (key: string) => mockStorage[key] || null,
            setItem: (key: string, value: string) => { mockStorage[key] = value; },
            removeItem: (key: string) => { delete mockStorage[key]; },
            clear: () => { for (const key in mockStorage) { delete mockStorage[key]; } },
            length: 0,
            key: (index: number) => null,
        } as any;

        // Mock document globally if needed
        if (typeof global.document === 'undefined') {
            global.document = { cookie: '' } as any;
        }
    });

    afterEach(() => {
        window.location = originalLocation;
    });

    it('queues parallel 401 requests, refreshes token once, and retries all requests', async () => {
        let refreshCalled = 0;
        const requestAttempts: Record<string, number> = {
            '/api/req1': 0,
            '/api/req2': 0,
            '/api/req3': 0,
        };

        // Mock axios.post to simulate successful token refresh
        vi.mocked(axios.post).mockImplementation(async (url) => {
            if (url.includes('/api/auth/token/refresh/')) {
                refreshCalled++;
                // Wait a tiny bit to simulate async network call
                await new Promise((resolve) => setTimeout(resolve, 50));
                return { status: 200, data: {} };
            }
            return { status: 200, data: {} };
        });

        // Set up the custom adapter on the `api` Axios instance
        api.defaults.adapter = async (config) => {
            const url = config.url || '';
            requestAttempts[url] = (requestAttempts[url] || 0) + 1;

            // First attempt fails with 401
            if (requestAttempts[url] === 1) {
                const err = new Error('Unauthorized') as any;
                err.config = config;
                err.response = { status: 401, data: { detail: 'Unauthorized' } };
                throw err;
            }

            // Retry attempt succeeds
            return {
                status: 200,
                data: { success: true, url },
                headers: {},
                config,
            } as any;
        };

        // Fire 3 requests in parallel
        const p1 = api.get('/api/req1');
        const p2 = api.get('/api/req2');
        const p3 = api.get('/api/req3');

        const results = await Promise.all([p1, p2, p3]);

        // Assert refresh was called exactly once
        expect(refreshCalled).toBe(1);
        expect(axios.post).toHaveBeenCalledTimes(1);

        // Assert all requests resolved successfully with retry data
        expect(results[0].data).toEqual({ success: true, url: '/api/req1' });
        expect(results[1].data).toEqual({ success: true, url: '/api/req2' });
        expect(results[2].data).toEqual({ success: true, url: '/api/req3' });

        // Assert adapter was called twice for each url (1st: 401, 2nd: 200 retry)
        expect(requestAttempts['/api/req1']).toBe(2);
        expect(requestAttempts['/api/req2']).toBe(2);
        expect(requestAttempts['/api/req3']).toBe(2);
    });

    it('rejects queued requests and logs out when token refresh fails', async () => {
        let refreshCalled = 0;
        const requestAttempts: Record<string, number> = {
            '/api/req1': 0,
            '/api/req2': 0,
        };

        // Mock axios.post to fail token refresh
        vi.mocked(axios.post).mockImplementation(async (url) => {
            if (url.includes('/api/auth/token/refresh/')) {
                refreshCalled++;
                await new Promise((resolve) => setTimeout(resolve, 50));
                throw new Error('Refresh token expired');
            }
            return { status: 200, data: {} };
        });

        api.defaults.adapter = async (config) => {
            const url = config.url || '';
            requestAttempts[url] = (requestAttempts[url] || 0) + 1;

            const err = new Error('Unauthorized') as any;
            err.config = config;
            err.response = { status: 401, data: { detail: 'Unauthorized' } };
            throw err;
        };

        const p1 = api.get('/api/req1');
        const p2 = api.get('/api/req2');

        // allSettled (not Promise.all): the leader rejects only AFTER logout +
        // redirect complete, so this guarantees window.location.href is set.
        const results = await Promise.allSettled([p1, p2]);
        expect(results.every((r) => r.status === 'rejected')).toBe(true);

        expect(refreshCalled).toBe(1);

        // Assert logout and redirect occurred
        expect(window.location.href).toBe('/login');

        // Since it failed, retry attempts should not have run
        expect(requestAttempts['/api/req1']).toBe(1);
        expect(requestAttempts['/api/req2']).toBe(1);
    });

    it('clears server-side HttpOnly cookies via backend logout before redirecting', async () => {
        // Refresh fails (session truly expired); every protected request 401s.
        vi.mocked(axios.post).mockImplementation(async (url) => {
            if (url.includes('/api/auth/token/refresh/')) {
                throw new Error('Refresh token expired');
            }
            return { status: 200, data: {} } as any; // logout endpoint succeeds
        });

        api.defaults.adapter = async (config) => {
            const err = new Error('Unauthorized') as any;
            err.config = config;
            err.response = { status: 401, data: { detail: 'Unauthorized' } };
            throw err;
        };

        await api.get('/api/protected').catch(() => { /* expected */ });

        // The refresh_token cookie is HttpOnly — only the server can expire it.
        // A failed refresh MUST call the backend logout endpoint, or middleware
        // keeps treating the (by-exp) session as live and bounces /login → /market.
        expect(axios.post).toHaveBeenCalledWith(
            expect.stringContaining('/api/auth/logout/'),
            expect.anything(),
            expect.anything(),
        );
        expect(window.location.href).toBe('/login');
    });

    it('does not re-enter refresh when a retried request still 401s (no refresh storm)', async () => {
        let refreshCalled = 0;

        // Refresh always "succeeds" (e.g. refresh cookie is fine) — but the
        // protected endpoints keep rejecting. This is the production storm case
        // that drove POST /api/auth/token/refresh/ into 429 Too Many Requests.
        vi.mocked(axios.post).mockImplementation(async (url) => {
            if (url.includes('/api/auth/token/refresh/')) {
                refreshCalled++;
                // Safety valve: if the interceptor loops, fail fast instead of hanging the test.
                if (refreshCalled > 5) throw new Error('refresh storm: re-entered refresh path');
                await new Promise((resolve) => setTimeout(resolve, 10));
                return { status: 200, data: {} } as any;
            }
            return { status: 200, data: {} } as any;
        });

        // Every request — including retries — 401s.
        api.defaults.adapter = async (config) => {
            const err = new Error('Unauthorized') as any;
            err.config = config;
            err.response = { status: 401, data: { detail: 'Unauthorized' } };
            throw err;
        };

        // Three concurrent requests: one leads the refresh, two are queued followers.
        const reqs = [api.get('/api/a'), api.get('/api/b'), api.get('/api/c')];
        await Promise.allSettled(reqs);

        // A single batch of 401s must trigger exactly ONE refresh, then give up.
        expect(refreshCalled).toBe(1);
    });
});
