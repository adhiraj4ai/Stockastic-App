import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { HoldingSnapshot } from '@/components/HoldingSnapshot';

const base = {
    id: 1, account: 1, ticker: 'NABIL', quantity: 500, buy_price: 500, wacc: 520,
    current_price: 548, current_value: 274000, investment_value: 260000,
    gain_loss: 14000, gain_loss_percent: 12.4, day_gain_loss: 4800,
    sector: 'Banking', volatility: 28, stop_loss_price: 480, target_price: 600,
    target_price_2: 650, health_score: 78,
    fundamental_metrics: { pe: 14.2, pb: 1.9, roe: 18, growth: 12, de: 0.4 },
    signals: { latest_date: '2026-06-18', summary: 'BUY' as const, details: [], buy_count: 4 },
    classification: 'investment' as const, tags: ['Core'], purchased_at: '2026-01-01T00:00:00Z',
} as never;

describe('HoldingSnapshot', () => {
    it('shows P/L percent and the signal pill', () => {
        render(<HoldingSnapshot item={base} />);
        expect(screen.getByText('+12.4%')).toBeInTheDocument();
        expect(screen.getByText('BUY 4/5')).toBeInTheDocument();
    });

    it('renders N/A for a missing fundamental', () => {
        const item = { ...base, fundamental_metrics: { pe: null, pb: 1.9, roe: 18, growth: 12, de: 0.4 } };
        render(<HoldingSnapshot item={item} />);
        expect(screen.getByText('P/E N/A')).toBeInTheDocument();
    });

    it('renders ladder markers for present points', () => {
        render(<HoldingSnapshot item={base} />);
        expect(screen.getByText('CMP')).toBeInTheDocument();
        expect(screen.getByText('SL')).toBeInTheDocument();
        expect(screen.getByText('T1')).toBeInTheDocument();
    });

    it('renders headline P/L percent when DRF sends decimal fields as strings', () => {
        // DRF DecimalField serialises to JSON strings at runtime (e.g. "12.40").
        // This test guards against the signed() helper calling .toFixed on a string
        // (TypeError: v.toFixed is not a function).
        const stringShapeItem = {
            ...base,
            gain_loss_percent: '12.4' as never,
            gain_loss: '14000' as never,
            current_value: '274000' as never,
        };
        render(<HoldingSnapshot item={stringShapeItem} />);
        expect(screen.getByText('+12.4%')).toBeInTheDocument();
    });
});
