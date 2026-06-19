import { describe, it, expect } from 'vitest';
import {
    computeRiskReward, computeDayPercent, computeHoldingDays, buildPriceLadder,
} from '@/lib/holdingSnapshot';

describe('computeRiskReward', () => {
    it('computes reward over risk to 1 dp', () => {
        expect(computeRiskReward(520, 480, 600)).toBe(2);
    });
    it('returns null when stop-loss or target missing', () => {
        expect(computeRiskReward(520, undefined, 600)).toBeNull();
        expect(computeRiskReward(520, 480, undefined)).toBeNull();
    });
    it('returns null when risk is not positive (wacc <= stopLoss)', () => {
        expect(computeRiskReward(480, 480, 600)).toBeNull();
    });
});

describe('computeDayPercent', () => {
    it('computes percent against prior value', () => {
        expect(computeDayPercent(4800, 274000)).toBe(1.8);
    });
    it('returns null on zero prior value', () => {
        expect(computeDayPercent(100, 100)).toBeNull();
    });
    it('returns null when inputs missing', () => {
        expect(computeDayPercent(undefined, 100)).toBeNull();
    });
});

describe('computeHoldingDays', () => {
    it('counts whole days between dates', () => {
        expect(computeHoldingDays('2026-01-01T00:00:00Z', new Date('2026-01-11T00:00:00Z'))).toBe(10);
    });
    it('is 0 on the same day', () => {
        expect(computeHoldingDays('2026-01-01T00:00:00Z', new Date('2026-01-01T05:00:00Z'))).toBe(0);
    });
});

describe('buildPriceLadder', () => {
    const full = {
        stop_loss_price: 480, wacc: 520, current_price: 548,
        target_price: 600, target_price_2: 650, target_price_3: 700,
    } as never;

    it('returns all present points ascending by price', () => {
        expect(buildPriceLadder(full).map(p => p.key)).toEqual(['sl', 'entry', 'cmp', 't1', 't2', 't3']);
    });
    it('omits missing optional points but keeps entry + cmp', () => {
        const minimal = { wacc: 520, current_price: 548 } as never;
        expect(buildPriceLadder(minimal).map(p => p.key)).toEqual(['entry', 'cmp']);
    });
    it('keeps order with only a stop-loss set', () => {
        const slOnly = { stop_loss_price: 480, wacc: 520, current_price: 548 } as never;
        expect(buildPriceLadder(slOnly).map(p => p.key)).toEqual(['sl', 'entry', 'cmp']);
    });
});
