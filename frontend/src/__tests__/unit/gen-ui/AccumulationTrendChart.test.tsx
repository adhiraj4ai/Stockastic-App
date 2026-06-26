import { describe, it, expect } from 'vitest';
import { toTrendPoints } from '@/components/chat/gen-ui/charts/AccumulationTrendChart';

describe('toTrendPoints', () => {
    it('coerces net to number and keeps dated points', () => {
        expect(toTrendPoints([{ date: '2026-06-01', net: 10 }, { date: '2026-06-02', net: 20 }]))
            .toEqual([{ date: '2026-06-01', net: 10 }, { date: '2026-06-02', net: 20 }]);
    });

    it('drops undated points', () => {
        expect(toTrendPoints([{ date: '', net: 5 }])).toEqual([]);
    });
});
