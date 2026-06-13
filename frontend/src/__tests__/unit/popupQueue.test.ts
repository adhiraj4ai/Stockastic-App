import { describe, it, expect } from 'vitest';
import { selectPopups } from '@/lib/notifications/popupQueue';
import type { AppNotification } from '@/lib/notifications/config';

const make = (id: number, type: string, severity?: any, ticker: string | null = 'NABIL'): AppNotification => ({
    id, title: `n${id}`, message: 'm', type, ticker, read: false,
    created_at: '2026-06-11T10:00:00Z', severity,
});

describe('selectPopups', () => {
    it('skips seen, read, and variant-none notifications', () => {
        const seen = new Set([1]);
        const { popups, overflow } = selectPopups([
            make(1, 'STOP_LOSS_HIT', 'critical'),           // seen
            { ...make(2, 'TARGET_REACHED', 'high'), read: true }, // read
            make(3, 'PORTFOLIO_DIVERSITY', 'low'),          // variant none
            make(4, 'SIGNAL_BUY', 'normal'),
        ], seen);
        expect(popups.map(p => p.id)).toEqual([4]);
        expect(overflow).toBe(0);
    });

    it('caps at 3, highest severity first, rest counted as overflow', () => {
        const { popups, overflow } = selectPopups([
            make(1, 'SIGNAL_BUY', 'normal'),
            make(2, 'STOP_LOSS_HIT', 'critical'),
            make(3, 'VOLUME_SPIKE', 'normal'),
            make(4, 'TARGET_REACHED', 'high'),
            make(5, 'GOLDEN_CROSS', 'normal'),
        ], new Set());
        expect(popups.map(p => p.id)).toEqual([2, 4, 1]);
        expect(overflow).toBe(2);
    });

    it('falls back to registry severity when backend field missing', () => {
        const { popups } = selectPopups(
            [make(1, 'SIGNAL_BUY', undefined), make(2, 'STOP_LOSS_HIT', undefined)],
            new Set(),
        );
        expect(popups[0].id).toBe(2);
    });
});
