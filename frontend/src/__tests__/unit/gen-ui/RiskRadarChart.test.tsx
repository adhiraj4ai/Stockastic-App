import { describe, it, expect } from 'vitest';
import { toRadarPoints } from '@/components/chat/gen-ui/charts/RiskRadarChart';

describe('toRadarPoints', () => {
    it('keeps axes with a positive fullMark', () => {
        const pts = toRadarPoints([
            { axis: 'Concentration', value: 6, fullMark: 10 },
            { axis: 'Liquidity', value: 3, fullMark: 10 },
        ]);
        expect(pts).toHaveLength(2);
        expect(pts[0]).toEqual({ axis: 'Concentration', value: 6, fullMark: 10 });
    });

    it('drops axes with a non-positive fullMark', () => {
        const pts = toRadarPoints([{ axis: 'X', value: 1, fullMark: 0 }]);
        expect(pts).toEqual([]);
    });
});
