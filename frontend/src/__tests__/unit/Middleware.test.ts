import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

// Build a JWT-shaped token whose payload carries the given exp (seconds).
const b64url = (obj: object) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const jwt = (expSeconds: number) => `header.${b64url({ exp: expSeconds })}.signature`;

const nowSec = () => Math.floor(Date.now() / 1000);
const future = jwt(nowSec() + 3600);
const expired = jwt(nowSec() - 3600);

const request = (path: string, cookie?: string) =>
    new NextRequest(`http://localhost:3000${path}`, {
        headers: cookie ? { cookie } : {},
    });

const locationOf = (res: ReturnType<typeof middleware>) => res.headers.get('location');

describe('auth middleware honours token expiry, not mere presence', () => {
    it('redirects to /login when access_token cookie is present but expired (the loop case)', () => {
        const res = middleware(request('/market', `access_token=${expired}`));
        expect(locationOf(res)).toContain('/login');
    });

    it('does NOT bounce /login -> /market when the cookie is present but expired', () => {
        const res = middleware(request('/login', `access_token=${expired}`));
        expect(locationOf(res)).toBeNull();
    });

    it('keeps an authenticated user (valid refresh_token) on a protected route', () => {
        const res = middleware(request('/market', `refresh_token=${future}`));
        expect(locationOf(res)).toBeNull();
    });

    it('redirects a logged-in user (valid refresh_token) away from /login', () => {
        const res = middleware(request('/login', `refresh_token=${future}`));
        expect(locationOf(res)).toContain('/market');
    });

    it('redirects to /login when no cookies are present on a protected route', () => {
        const res = middleware(request('/portfolio'));
        expect(locationOf(res)).toContain('/login');
    });
});
