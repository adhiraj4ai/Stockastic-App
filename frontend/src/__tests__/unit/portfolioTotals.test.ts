import { describe, it, expect } from 'vitest';
import { splitTotalsByClassification } from '@/lib/portfolioTotals';

describe('splitTotalsByClassification', () => {
    const items = [
        { classification: 'investment', investment_value: 1000, current_value: 1200, gain_loss: 200 },
        { classification: 'trading', investment_value: 500, current_value: 450, gain_loss: -50 },
        { classification: 'trading', investment_value: 300, current_value: 360, gain_loss: 60 },
    ];

    it('sums invested, current and gain/loss per group', () => {
        const totals = splitTotalsByClassification(items as never);
        expect(totals.investment).toEqual({ invested: 1000, current: 1200, gainLoss: 200 });
        expect(totals.trading).toEqual({ invested: 800, current: 810, gainLoss: 10 });
    });

    it('treats a missing classification as trading', () => {
        const totals = splitTotalsByClassification([{ investment_value: 100, current_value: 110, gain_loss: 10 }] as never);
        expect(totals.trading.invested).toBe(100);
        expect(totals.investment.invested).toBe(0);
    });
});
