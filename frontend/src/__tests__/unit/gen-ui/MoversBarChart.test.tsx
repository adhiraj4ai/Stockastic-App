import { describe, it, expect } from 'vitest';
import { toMoverBars } from '@/components/chat/gen-ui/charts/MoversBarChart';

describe('toMoverBars', () => {
    it('combines top gainers (desc) then losers (asc) with a positive flag', () => {
        const bars = toMoverBars(
            [{ symbol: 'A', price_change: 5 }, { symbol: 'B', price_change: 8 }],
            [{ symbol: 'C', price_change: -3 }, { symbol: 'D', price_change: -7 }],
            2,
        );
        expect(bars.map((b) => b.symbol)).toEqual(['B', 'A', 'D', 'C']);
        expect(bars[0]).toEqual({ symbol: 'B', change: 8, positive: true });
        expect(bars[3]).toEqual({ symbol: 'C', change: -3, positive: false });
    });

    it('returns an empty array when both sides are empty', () => {
        expect(toMoverBars([], [])).toEqual([]);
    });
});
