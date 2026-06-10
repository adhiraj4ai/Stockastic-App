import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import api from '@/lib/api';
import TickerVerdict from '@/components/ticker/TickerVerdict';

vi.mock('@/lib/api', () => ({
    default: { get: vi.fn(), post: vi.fn() },
}));

const verdict = {
    symbol: 'NABIL', as_of: '2026-06-10', confluence_score: 81,
    components: {
        engine_agreement: { score: 75, active_buy_sources: ['SMART_MONEY', 'ICHIMOKU', 'VOLUME_BREAKOUT'], conflicting_sources: [] },
        opportunity: { score: 100, trust: 'CONFIRMED', edge: 0.15, pvalue: 0.02 },
        accumulation: { score: 100 },
        sector: { score: 100, acc_intensity: 12.4 },
    },
    entry: { price: 612, zone_low: 598.4, zone_high: 625.6, status: 'IN_ZONE', last_signal_age_days: 1, latest_close: 610 },
    targets: { tp1: 640, sl: 585 },
    episodes: [], analog: { n: 14, fwd_1d_median_pct: 0.8, fwd_3d_median_pct: 2.1, fwd_5d_median_pct: 2.9, win_rate_3d: 0.64 },
    catalyst: { type: 'BOOK_CLOSE', date: '2026-06-18', days_away: 6, detail: 'x' },
    sizing: { shares: 200, risk_amount: 10000, position_value: 122400, risk_pct: 1.0, entry: 610, stop: 585, account_id: 3, account_name: 'Live' },
};

describe('TickerVerdict', () => {
    beforeEach(() => vi.clearAllMocks());

    it('renders score, chips, sizing and drafts a trade plan', async () => {
        vi.mocked(api.get).mockResolvedValue({ data: verdict });
        vi.mocked(api.post).mockResolvedValue({ data: { id: 9 } });
        render(<TickerVerdict symbol="NABIL" />);
        expect(await screen.findByText('81')).toBeInTheDocument();
        expect(screen.getByText(/3 engines/i)).toBeInTheDocument();
        expect(screen.getByText(/CONFIRMED/)).toBeInTheDocument();
        expect(screen.getByText(/in zone/i)).toBeInTheDocument();
        expect(screen.getByText(/200 shares/i)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /draft trade plan/i }));
        await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
        const payload = vi.mocked(api.post).mock.calls[0][1] as Record<string, unknown>;
        expect(payload.ticker).toBe('NABIL');
        expect(payload.account).toBe(3);
    });

    it('renders empty state without active setups and no draft button without sizing', async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: { ...verdict, confluence_score: 5, entry: null, sizing: null, analog: null, catalyst: null },
        });
        render(<TickerVerdict symbol="EMPTY" />);
        expect(await screen.findByText(/no active setups/i)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /draft trade plan/i })).not.toBeInTheDocument();
    });
});
