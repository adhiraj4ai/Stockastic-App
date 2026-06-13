import { render, screen } from '@testing-library/react';
import { fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PickCard, type PlanPick } from '@/components/plan/PickCard';
import api from '@/lib/api';

vi.mock('@/lib/api', () => ({
    default: { get: vi.fn(), post: vi.fn() },
}));

const basePick: PlanPick = {
    symbol: 'NABIL',
    direction: 'BUY',
    confluence_score: 91,
    components: {
        engine_agreement: { score: 75, active_buy_sources: ['SMART_MONEY', 'ICHIMOKU', 'VOLUME_BREAKOUT'], conflicting_sources: [] },
        opportunity: { score: 100, trust: 'CONFIRMED', edge: 0.15, pvalue: 0.02 },
        accumulation: { score: 100 },
        sector: { score: 100, acc_intensity: 12.4 },
    },
    entry: { price: 612, zone_low: 598.4, zone_high: 625.6, status: 'IN_ZONE', last_signal_age_days: 1, latest_close: 610 },
    targets: { tp1: 640, sl: 585 },
    analog: { n: 14, fwd_1d_median_pct: 0.8, fwd_3d_median_pct: 2.1, fwd_5d_median_pct: 2.9, win_rate_3d: 0.64 },
    catalyst: { type: 'BOOK_CLOSE', date: '2026-06-18', days_away: 6, detail: 'bonus 10%' },
};

describe('PickCard', () => {
    it('renders symbol, score, entry status, trust and analog base rate', () => {
        render(<PickCard pick={basePick} />);
        expect(screen.getByText('NABIL')).toBeInTheDocument();
        expect(screen.getByText('91')).toBeInTheDocument();
        expect(screen.getByText(/in zone/i)).toBeInTheDocument();
        expect(screen.getByText(/CONFIRMED/)).toBeInTheDocument();
        expect(screen.getByText(/\+2\.1%/)).toBeInTheDocument();   // 3d median
        expect(screen.getByText(/n=14/)).toBeInTheDocument();
        expect(screen.getByText(/book close/i)).toBeInTheDocument();
    });

    it('hides analog section when null and shows extended badge', () => {
        render(<PickCard pick={{ ...basePick, analog: null, entry: { ...basePick.entry, status: 'EXTENDED' } }} />);
        expect(screen.queryByText(/n=/)).not.toBeInTheDocument();
        expect(screen.getByText(/extended/i)).toBeInTheDocument();
    });

    it('links to the ticker page', () => {
        render(<PickCard pick={basePick} />);
        const link = screen.getByRole('link');
        expect(link).toHaveAttribute('href', '/ticker/NABIL');
    });
});

const sizing = { shares: 200, risk_amount: 10000, position_value: 122400, risk_pct: 1.0,
                 entry: 610, stop: 585, account_id: 3, account_name: 'Live' };

describe('PickCard sizing', () => {
    it('shows sizing line and drafts a plan', async () => {
        vi.mocked(api.post).mockResolvedValue({ data: { id: 5 } });
        render(<PickCard pick={basePick} sizing={sizing} />);
        expect(screen.getByText(/200 shares/i)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /draft trade plan/i }));
        await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    });

    it('renders without sizing exactly as before', () => {
        render(<PickCard pick={basePick} />);
        expect(screen.queryByText(/shares/i)).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /draft trade plan/i })).not.toBeInTheDocument();
    });
});
