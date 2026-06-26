import { describe, it, expect } from 'vitest';
import { toAllocationSegments } from '@/components/chat/gen-ui/charts/AllocationDonut';

describe('toAllocationSegments', () => {
    it('computes weights as a percentage of total value', () => {
        const seg = toAllocationSegments([
            { ticker: 'A', current_value: 75 },
            { ticker: 'B', current_value: 25 },
        ]);
        expect(seg).toEqual([
            { name: 'A', value: 75, weight: 75 },
            { name: 'B', value: 25, weight: 25 },
        ]);
    });

    it('groups slices beyond the cap into an "Other" segment', () => {
        const rows = Array.from({ length: 8 }, (_, i) => ({ ticker: `T${i}`, current_value: 10 }));
        const seg = toAllocationSegments(rows, 6);
        expect(seg).toHaveLength(7);
        expect(seg[6]).toEqual({ name: 'Other', value: 20, weight: 25 });
    });

    it('returns an empty array when there is no value', () => {
        expect(toAllocationSegments([])).toEqual([]);
        expect(toAllocationSegments([{ ticker: 'A', current_value: 0 }])).toEqual([]);
    });
});
