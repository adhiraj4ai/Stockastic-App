import { describe, it, expect } from 'vitest';
import {
    findIndicator, computeTechnicalBias, computeHealthScore, computeConfluence, pctReturn,
} from '@/lib/tickerAnalysis';

const rows = [
    { name: '50-Day SMA', value: '510.0', raw_value: 510 },
    { name: 'ATR (14)', value: '12.3', raw_value: 12.3 },
];

describe('findIndicator', () => {
    it('matches by case-insensitive substring and returns the numeric value', () => {
        expect(findIndicator(rows, '50-DAY SMA')).toBe(510);
        expect(findIndicator(rows, 'ATR')).toBe(12.3);
    });
    it('returns null when no row matches or rows missing', () => {
        expect(findIndicator(rows, 'RSI')).toBeNull();
        expect(findIndicator(undefined, 'ATR')).toBeNull();
    });
});

describe('computeTechnicalBias', () => {
    it('rates Strong Buy when bullish dominates by >2', () => {
        const r = computeTechnicalBias({
            rsi: 25, macd: 2, macdSignal: 1, stochK: 10, cci: -150, williamsR: -90,
            mfi: 10, roc: 5, adx: 30, trend5d: 1, sma50: 510, sma200: 500, cmf: 0.1, cmp: 520,
        });
        expect(r.rating).toBe('Strong Buy');
        expect(r.bull + r.bear + r.neutral).toBe(10);
        expect(r.total).toBe(10);
    });
    it('is Neutral when balanced', () => {
        const r = computeTechnicalBias({
            rsi: 50, macd: 1, macdSignal: 1, stochK: 50, cci: 0, williamsR: -50,
            mfi: 50, roc: 0, adx: 10, trend5d: 0, sma50: 500, sma200: 500, cmf: 0, cmp: 500,
        });
        expect(r.rating).toBe('Neutral');
    });
});

describe('computeHealthScore', () => {
    it('adds PE and D/E bonuses on top of ROE, capped at 100', () => {
        expect(computeHealthScore(18, 14, 0.4)).toBe(58);
        expect(computeHealthScore(90, 10, 0.2)).toBe(100);
    });
    it('treats missing inputs as no bonus', () => {
        expect(computeHealthScore(null, null, null)).toBe(0);
    });
});

describe('computeConfluence', () => {
    it('counts signals agreeing with the direction', () => {
        expect(computeConfluence([{ signal: 'BUY' }, { signal: 'SELL' }, { signal: 'BUY' }], 'BUY'))
            .toEqual({ agree: 2, total: 3 });
    });
});

describe('pctReturn', () => {
    it('computes signed percent to 1 dp', () => {
        expect(pctReturn(600, 520)).toBeCloseTo(15.4, 1);
    });
    it('returns null when inputs missing', () => {
        expect(pctReturn(undefined, 520)).toBeNull();
    });
});
