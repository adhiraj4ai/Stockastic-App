import { describe, it, expect } from 'vitest';
import { buildActionItems, type SignalEpisodeItem, type RecommendationItem } from '@/lib/homeDigest';

const episode = (over: Partial<SignalEpisodeItem> = {}): SignalEpisodeItem => ({
    symbol: 'NABIL',
    signal: 'BUY',
    source: 'SMART_MONEY',
    entry_price: '512.5',
    target_price: 560,
    stop_loss_price: 490,
    entry_strength: 80,
    signal_tier: 'Gold Signal',
    start_date: '2026-06-09',
    ...over,
});

const rec = (over: Partial<RecommendationItem> = {}): RecommendationItem => ({
    symbol: 'SHIVM',
    signal: 'BUY',
    strength: 70,
    reason: 'Bullish MACD',
    close: 645,
    date: '2026-06-09',
    ...over,
});

describe('buildActionItems', () => {
    it('maps episodes and recommendations into unified action items', () => {
        const items = buildActionItems([episode()], [{ label: 'Broker Accumulation', items: [rec()] }]);
        expect(items).toHaveLength(2);
        const nabil = items.find(i => i.symbol === 'NABIL')!;
        expect(nabil.action).toBe('BUY');
        expect(nabil.source).toBe('Smart Money');
        expect(nabil.conviction).toBe(80);
        expect(nabil.price).toBe(512.5);
        expect(nabil.target).toBe(560);
        expect(nabil.stop).toBe(490);
        expect(nabil.detail).toBe('Gold Signal');
        const shivm = items.find(i => i.symbol === 'SHIVM')!;
        expect(shivm.source).toBe('Broker Accumulation');
        expect(shivm.detail).toBe('Bullish MACD');
        expect(shivm.price).toBe(645);
    });

    it('dedupes same symbol+action keeping the highest conviction', () => {
        const items = buildActionItems(
            [episode({ symbol: 'NABIL', entry_strength: 60 })],
            [{ label: 'Ichimoku', items: [rec({ symbol: 'NABIL', strength: 90, reason: 'Cloud breakout' })] }]
        );
        expect(items).toHaveLength(1);
        expect(items[0].conviction).toBe(90);
        expect(items[0].source).toBe('Ichimoku');
    });

    it('keeps opposite actions on the same symbol as separate rows', () => {
        const items = buildActionItems(
            [episode({ symbol: 'NABIL', signal: 'BUY' })],
            [{ label: 'Ichimoku', items: [rec({ symbol: 'NABIL', signal: 'SELL' })] }]
        );
        expect(items).toHaveLength(2);
    });

    it('sorts by conviction descending and applies the limit', () => {
        const recs = Array.from({ length: 10 }, (_, i) =>
            rec({ symbol: `S${i}`, strength: i * 10 })
        );
        const items = buildActionItems([], [{ label: 'Broker Accumulation', items: recs }], 3);
        expect(items).toHaveLength(3);
        expect(items.map(i => i.conviction)).toEqual([90, 80, 70]);
    });

    it('returns [] for empty inputs and labels unknown episode sources verbatim', () => {
        expect(buildActionItems([], [])).toEqual([]);
        const items = buildActionItems([episode({ source: 'NEW_ENGINE' })], []);
        expect(items[0].source).toBe('NEW_ENGINE');
    });

    it('nulls out non-numeric entry prices instead of propagating NaN', () => {
        const items = buildActionItems([episode({ entry_price: 'not-a-number' })], []);
        expect(items[0].price).toBeNull();
    });
});
