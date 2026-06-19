import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import api from '@/lib/api';
import { useExitStrategy } from '@/hooks/useExitStrategy';

vi.mock('@/lib/api', () => ({ default: { get: vi.fn(), delete: vi.fn() } }));

const suggestResponse = {
    data: {
        current_price: 548, wacc: 520, is_underwater: false,
        strategies: { fixed: { name: 'Fixed', sl: 494, tp: 602, tp2: 650, tp3: null, desc: 'x' } },
        health_warnings: [], transactions: [],
    },
};

describe('useExitStrategy', () => {
    afterEach(() => vi.clearAllMocks());

    it('default-fills SL/TP from strategies.fixed when item has no stop loss', async () => {
        (api.get as ReturnType<typeof vi.fn>).mockResolvedValue(suggestResponse);
        const item = { id: 5, ticker: 'NABIL', quantity: 100 } as never;
        const { result } = renderHook(() => useExitStrategy(item, true));
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.defaults).toEqual({ sl: '494.00', tp: '602.00', tp2: '650.00', tp3: '' });
        expect(result.current.currentPrice).toBe(548);
    });

    it('uses the item\'s saved values when present', async () => {
        (api.get as ReturnType<typeof vi.fn>).mockResolvedValue(suggestResponse);
        const item = { id: 5, ticker: 'NABIL', quantity: 100, stop_loss_price: 500, target_price: 610 } as never;
        const { result } = renderHook(() => useExitStrategy(item, true));
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.defaults.sl).toBe('500');
        expect(result.current.defaults.tp).toBe('610');
    });
});
