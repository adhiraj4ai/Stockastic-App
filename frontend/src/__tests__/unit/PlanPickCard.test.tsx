import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PickCard, type PlanPick } from '@/components/plan/PickCard';

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
