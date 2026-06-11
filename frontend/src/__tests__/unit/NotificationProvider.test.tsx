/**
 * NotificationProvider behavior tests.
 *
 * Architecture notes for fake-timer usage:
 *
 * The provider's tick() is called directly from useEffect (not via setTimeout).
 * It awaits fetchNotifications(), then schedules the NEXT tick via setTimeout(tick, 20000).
 *
 * To drive this in tests:
 *   - Initial tick: flush microtasks via `await act(async () => {})` – no timer advance needed.
 *   - Subsequent polls: `await act(async () => { await vi.advanceTimersByTimeAsync(20_000) })`
 *     fires the scheduled setTimeout, which awaits the next api.get, then re-schedules.
 *
 * We do NOT use vi.runAllTimersAsync() — it infinite-loops because tick() always
 * re-schedules itself.
 *
 * waitFor is avoided after fake-timer advances because its internal setTimeout
 * is also faked. All asserts are made synchronously inside act().
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import type { AppNotification } from '@/lib/notifications/config';

// ---------------------------------------------------------------------------
// Mocks — all vi.fn() calls live INSIDE factory bodies (hoisting-safe)
// ---------------------------------------------------------------------------

vi.mock('@/lib/api', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
        delete: vi.fn(),
    },
}));

vi.mock('sonner', () => ({
    toast: {
        custom: vi.fn(),
        message: vi.fn(),
        error: vi.fn(),
        dismiss: vi.fn(),
    },
}));

vi.mock('next/navigation', () => ({
    useRouter: vi.fn(() => ({ push: vi.fn() })),
}));

// ---------------------------------------------------------------------------
// Import SUT and mocked modules AFTER vi.mock declarations
// ---------------------------------------------------------------------------
import { NotificationProvider, useNotifications } from '@/components/notifications/NotificationProvider';
import api from '@/lib/api';
import { toast } from 'sonner';

const mockGet = vi.mocked(api.get);
const mockPost = vi.mocked(api.post);
const toastCustom = vi.mocked(toast.custom);
const toastError = vi.mocked(toast.error);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNotification(overrides: Partial<AppNotification> & { id: number }): AppNotification {
    return {
        title: `Notification ${overrides.id}`,
        message: 'Test message',
        type: 'STOP_LOSS_HIT',
        ticker: 'NABIL',
        read: false,
        created_at: '2026-06-11T10:00:00Z',
        ...overrides,
    } as AppNotification;
}

/** Small consumer that renders unreadCount and per-notification read state. */
function Consumer() {
    const { notifications, unreadCount } = useNotifications();
    return (
        <div>
            <span data-testid="unread-count">{unreadCount}</span>
            {notifications.map(n => (
                <span key={n.id} data-testid={`notif-${n.id}`} data-read={String(n.read)}>
                    {n.id}
                </span>
            ))}
        </div>
    );
}

function renderWithProvider() {
    return render(
        <NotificationProvider>
            <Consumer />
        </NotificationProvider>,
    );
}

/**
 * Flush the initial tick.
 * tick() is called synchronously from useEffect, but awaits api.get() internally.
 * `act(async () => {})` drains the microtask queue so the resolved Promise
 * propagates and React commits the state updates.
 */
async function flushInitialTick() {
    await act(async () => {
        // drain microtasks — the pending api.get() Promise resolves here
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
    });
}

/**
 * Advance the fake clock by 20 s (one poll interval) and wait for the
 * resulting fetch to complete and React to commit state updates.
 */
async function advancePoll() {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(20_000);
    });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    vi.useFakeTimers();
    mockGet.mockResolvedValue({ data: [] });
    mockPost.mockResolvedValue({ data: {} });
});

afterEach(() => {
    vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NotificationProvider', () => {
    /**
     * 1. First fetch never toasts.
     *
     * On mount the provider marks all incoming notifications as "seen" without
     * calling toast.custom. unreadCount still reflects the real unread count.
     */
    it('first fetch: populates unreadCount without toasting', async () => {
        const n1 = makeNotification({ id: 1, read: false });
        mockGet.mockResolvedValue({ data: [n1] });

        renderWithProvider();
        await flushInitialTick();

        expect(screen.getByTestId('unread-count').textContent).toBe('1');
        expect(toastCustom).not.toHaveBeenCalled();
    });

    /**
     * 2. Subsequent poll toasts only new unseen unread notifications.
     *
     * First fetch: [n1]. Second fetch: [n1, n2(unread, STOP_LOSS_HIT)].
     * n2 is new and unseen → toast.custom called exactly once.
     */
    it('second poll: toasts only the new unseen unread notification', async () => {
        const n1 = makeNotification({ id: 1, read: false });
        const n2 = makeNotification({ id: 2, read: false, type: 'STOP_LOSS_HIT' });

        mockGet
            .mockResolvedValueOnce({ data: [n1] })
            .mockResolvedValueOnce({ data: [n1, n2] });

        renderWithProvider();
        await flushInitialTick();
        await advancePoll();

        expect(toastCustom).toHaveBeenCalledTimes(1);
    });

    /**
     * 3. Seen-set suppresses re-toast across polls.
     *
     * After toasting n2 on the second poll, a third poll returning the same
     * data must NOT call toast.custom again (n2 is already in seenIds).
     */
    it('seen-set: suppresses re-toasting across polls', async () => {
        const n1 = makeNotification({ id: 1, read: false });
        const n2 = makeNotification({ id: 2, read: false, type: 'STOP_LOSS_HIT' });

        mockGet
            .mockResolvedValueOnce({ data: [n1] })
            .mockResolvedValueOnce({ data: [n1, n2] })
            .mockResolvedValue({ data: [n1, n2] });

        renderWithProvider();
        await flushInitialTick();
        await advancePoll();   // second poll — toasts n2 once
        await advancePoll();   // third poll  — n2 already seen, no toast

        expect(toastCustom).toHaveBeenCalledTimes(1);
    });

    /**
     * 4. markRead optimistic update + rollback on API failure.
     *
     * markRead(id) immediately flips read→true optimistically.
     * When api.post rejects, the notification reverts to read=false
     * and toast.error is called.
     */
    it('markRead: optimistic update then rollback on API failure', async () => {
        const n1 = makeNotification({ id: 10, read: false });
        mockGet.mockResolvedValue({ data: [n1] });
        mockPost.mockRejectedValueOnce(new Error('Network error'));

        function ConsumerWithMarkRead() {
            const { notifications, unreadCount, markRead } = useNotifications();
            return (
                <div>
                    <span data-testid="unread-count">{unreadCount}</span>
                    {notifications.map(n => (
                        <span key={n.id} data-testid={`notif-${n.id}`} data-read={String(n.read)}>
                            {n.id}
                        </span>
                    ))}
                    <button onClick={() => markRead(10)}>Mark read</button>
                </div>
            );
        }

        render(
            <NotificationProvider>
                <ConsumerWithMarkRead />
            </NotificationProvider>,
        );

        await flushInitialTick();
        expect(screen.getByTestId('unread-count').textContent).toBe('1');

        // markRead sets optimistic state synchronously, then awaits a rejected POST.
        // We capture an intermediate snapshot to verify the optimistic flip happened.
        let optimisticCount: string | null = null;

        await act(async () => {
            screen.getByText('Mark read').click();
            // Yield to let the synchronous setState run and React commit
            await Promise.resolve();
            optimisticCount = screen.getByTestId('unread-count').textContent;
            // Now let the rejection propagate and trigger rollback setState
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();
        });

        // The optimistic flip did go to 0 mid-flight
        expect(optimisticCount).toBe('0');
        // After the rejected POST, rolled back to 1
        expect(screen.getByTestId('unread-count').textContent).toBe('1');
        expect(toastError).toHaveBeenCalledWith('Could not mark notification as read');
    });

    /**
     * 5. Variant 'none' never toasts.
     *
     * PORTFOLIO_DIVERSITY has variant='none' in the config registry.
     * selectPopups() filters variant-none notifications out, so toast.custom
     * must not be called even when such a notification is new and unread.
     */
    it('variant-none: new unread notification with variant none is never toasted', async () => {
        const n1 = makeNotification({ id: 1, read: false });
        const nNone = makeNotification({
            id: 99,
            read: false,
            type: 'PORTFOLIO_DIVERSITY',
            ticker: null,
        });

        mockGet
            .mockResolvedValueOnce({ data: [n1] })
            .mockResolvedValueOnce({ data: [n1, nNone] });

        renderWithProvider();
        await flushInitialTick();
        await advancePoll();

        expect(toastCustom).not.toHaveBeenCalled();
    });
});
