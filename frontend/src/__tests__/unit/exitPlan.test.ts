import { describe, it, expect } from 'vitest';
import { computeExitRiskReward, buildExitLadder } from '@/lib/exitPlan';

describe('computeExitRiskReward', () => {
    it('computes reward over risk vs CMP to 2 dp', () => {
        expect(computeExitRiskReward(548, 480, 600)).toBeCloseTo(0.76, 2);
    });
    it('returns null when inputs missing', () => {
        expect(computeExitRiskReward(undefined, 480, 600)).toBeNull();
        expect(computeExitRiskReward(548, undefined, 600)).toBeNull();
    });
    it('returns null when risk is not positive', () => {
        expect(computeExitRiskReward(480, 480, 600)).toBeNull();
    });
});

describe('buildExitLadder', () => {
    it('orders present points descending by price', () => {
        const out = buildExitLadder({ stopLoss: 480, entry: 520, cmp: 548, t1: 600, t2: 650, t3: 700 });
        expect(out.map(p => p.key)).toEqual(['t3', 't2', 't1', 'cmp', 'entry', 'sl']);
    });
    it('omits missing optional points but keeps entry + cmp', () => {
        const out = buildExitLadder({ entry: 520, cmp: 548 });
        expect(out.map(p => p.key)).toEqual(['cmp', 'entry']);
    });
    it('drops non-finite values (empty inputs)', () => {
        const out = buildExitLadder({ stopLoss: NaN, entry: 520, cmp: 548, t1: 600 });
        expect(out.map(p => p.key)).toEqual(['t1', 'cmp', 'entry']);
    });
});
