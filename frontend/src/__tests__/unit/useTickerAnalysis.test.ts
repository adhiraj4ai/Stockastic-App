import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import api from '@/lib/api';
import { useTickerAnalysis } from '@/hooks/useTickerAnalysis';

vi.mock('@/lib/api', () => ({ default: { get: vi.fn() } }));

function routeGet(url: string) {
    if (url.includes('/details/')) return Promise.resolve({ data: {
        price: { close: 548, high: 555, low: 540, volume: 1000, turnover: 50000 },
        fundamental: { pe_ratio: 14.2, eps: 38, ro_equity: 18, debt_to_equity: 0.4, dividend_yield: 2.1, sector: 'Banking', fifty_two_week_high: 700, fifty_two_week_low: 400, fundamental_indicators: [], broker_accumulation: { '1M': [], AT: [] } },
        company: { name: 'Nabil Bank', sector: 'Banking' },
        technical_indicators: [{ name: '50-Day SMA', value: '510', raw_value: 510 }, { name: 'ATR (14)', value: '12', raw_value: 12 }],
    } });
    if (url.includes('/signals/')) return Promise.resolve({ data: { results: [{ date: '2026-06-10', signal: 'BUY', strategy_name: 'X', last_close: '540' }] } });
    if (url.includes('/batch-indicators/')) return Promise.resolve({ data: { NABIL: { rsi: 60, macd: 2, macd_signal: 1, macd_hist: 1, roc: 3, trends: { '5d': 1, '10d': 2, '1m': 5 } } } });
    if (url.includes('/companies/accumulation/')) return Promise.resolve({ data: [{ symbol: 'NABIL', accumulation_ratio: 65, net_qty: 1200 }] });
    if (url.includes('/fibonacci/')) return Promise.resolve({ data: { trend: 'UPTREND', nearest_support: 530, nearest_resistance: 560, levels: [] } });
    if (url.includes('/generated-signals/')) return Promise.resolve({ data: [{ symbol: 'NABIL', source: 'eng', signal: 'BUY', signal_tier: 'A', strength: 80 }] });
    return Promise.resolve({ data: {} });
}

describe('useTickerAnalysis', () => {
    afterEach(() => vi.clearAllMocks());

    it('normalises the six calls into structured data', async () => {
        (api.get as ReturnType<typeof vi.fn>).mockImplementation((url: string) => routeGet(url));
        const { result } = renderHook(() => useTickerAnalysis('NABIL'));
        await waitFor(() => expect(result.current.loading).toBe(false));
        const d = result.current.data!;
        expect(d.price.cmp).toBe(548);
        expect(d.technicals.sma50).toBe(510);
        expect(d.technicals.atr).toBe(12);
        expect(d.fundamentals.roe).toBe(18);
        expect(d.accumulation).toEqual({ ratio: 65, netQty: 1200 });
        expect(d.generatedSignals).toHaveLength(1);
        expect(d.history).toHaveLength(1);
        expect(result.current.error).toBe(false);
    });

    it('sets error when a core call fails', async () => {
        (api.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
        const { result } = renderHook(() => useTickerAnalysis('NABIL'));
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.error).toBe(true);
    });
});
