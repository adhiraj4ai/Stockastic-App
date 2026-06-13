/**
 * Regression test: the authenticated home page lives at the root route,
 * OUTSIDE the (authenticated) route group whose layout mounts
 * NotificationProvider. Its tree (TickerLanding → DashboardLayout →
 * AlertsDropdown) calls useNotifications(), so the page itself must
 * provide the notification context or SSR crashes with
 * "useNotifications must be used within NotificationProvider".
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

vi.mock('@/lib/api', () => ({
    default: {
        get: vi.fn().mockResolvedValue({ data: [] }),
        post: vi.fn(),
        delete: vi.fn(),
    },
}));

vi.mock('sonner', () => ({
    toast: Object.assign(vi.fn(), {
        custom: vi.fn(),
        message: vi.fn(),
        error: vi.fn(),
        dismiss: vi.fn(),
    }),
}));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('next/headers', () => ({
    cookies: vi.fn().mockResolvedValue({
        get: (name: string) =>
            name === 'access_token' ? { name, value: 'test-token' } : undefined,
    }),
}));

// Probe standing in for TickerLanding: consumes the notification context
// exactly like AlertsDropdown does inside DashboardLayout.
vi.mock('@/components/TickerLanding', async () => {
    const { useNotifications } = await import('@/components/notifications/NotificationProvider');
    function Probe() {
        useNotifications();
        return <div data-testid="notifications-probe">ok</div>;
    }
    return { TickerLanding: Probe };
});

vi.mock('@/components/PublicLayout', () => ({
    default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/MarketSummary', () => ({
    MarketSummary: () => <div data-testid="market-summary" />,
}));

import Home from '@/app/page';

describe('authenticated home page providers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('provides notification context to the authenticated tree', async () => {
        const jsx = await Home();
        await act(async () => {
            render(jsx);
        });
        expect(screen.getByTestId('notifications-probe')).toBeInTheDocument();
    });
});
