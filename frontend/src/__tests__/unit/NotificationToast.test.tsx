import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NotificationToast } from '@/components/notifications/NotificationToast';
import type { AppNotification } from '@/lib/notifications/config';

const base: AppNotification = {
    id: 1, title: 'Stop loss hit', message: 'Closed below your stop of Rs. 480.',
    type: 'STOP_LOSS_HIT', ticker: 'NABIL', read: false,
    created_at: '2026-06-11T10:00:00Z', severity: 'critical',
    metadata: { price: 471.1, level: 480, level_type: 'stop', change_pct: -8.2 },
};

describe('NotificationToast', () => {
    it('card variant: title, ticker chip, metrics strip, actions', () => {
        render(<NotificationToast notification={base} onDismiss={() => {}} onNavigate={() => {}} />);
        expect(screen.getByText('Stop loss hit')).toBeInTheDocument();
        expect(screen.getByText('NABIL')).toBeInTheDocument();
        expect(screen.getByText('LTP')).toBeInTheDocument();
        expect(screen.getByText('Stop')).toBeInTheDocument();
        expect(screen.getByText('Dismiss')).toBeInTheDocument();
        expect(screen.getByText('View')).toBeInTheDocument();
    });

    it('line variant: compact, no metrics labels, no Dismiss button', () => {
        const n: AppNotification = {
            ...base, type: 'SIGNAL_BUY', severity: 'normal',
            title: 'Buy signal', metadata: { price: 612 },
        };
        render(<NotificationToast notification={n} onDismiss={() => {}} onNavigate={() => {}} />);
        expect(screen.getByText('Buy signal')).toBeInTheDocument();
        expect(screen.queryByText('LTP')).not.toBeInTheDocument();
        expect(screen.queryByText('Dismiss')).not.toBeInTheDocument();
    });

    it('panel variant: symbol chips and quick actions', () => {
        const n: AppNotification = {
            ...base, type: 'DAILY_PLAN_READY', ticker: null, severity: 'high',
            title: "Tomorrow's plan is ready", redirect_url: '/chat?session=42',
            metadata: { symbols: ['SHIVM', 'HDHPC', 'NICA'] },
        };
        render(<NotificationToast notification={n} onDismiss={() => {}} onNavigate={() => {}} />);
        expect(screen.getByText('SHIVM')).toBeInTheDocument();
        expect(screen.getByText('Open briefing')).toBeInTheDocument();
        expect(screen.getByText('View plan')).toBeInTheDocument();
    });

    it('dismiss calls onDismiss, primary action navigates', () => {
        const onDismiss = vi.fn();
        const onNavigate = vi.fn();
        render(<NotificationToast notification={base} onDismiss={onDismiss} onNavigate={onNavigate} />);
        fireEvent.click(screen.getByText('Dismiss'));
        expect(onDismiss).toHaveBeenCalled();
        fireEvent.click(screen.getByText('View'));
        expect(onNavigate).toHaveBeenCalledWith('/ticker/NABIL');
    });
});
