import { describe, it, expect } from 'vitest';
import { toCandleSeries } from '@/components/chat/gen-ui/charts/CandlestickChart';

describe('toCandleSeries', () => {
    it('maps OHLCV rows to echarts series in [open, close, low, high] order', () => {
        const rows = [
            { date: '2026-06-01', open: 100, high: 110, low: 95, close: 105, volume: 1000 },
            { date: '2026-06-02', open: '105', high: '112', low: '104', close: '108', volume: '2000' },
        ];
        const { dates, ohlc, volumes } = toCandleSeries(rows);
        expect(dates).toEqual(['2026-06-01', '2026-06-02']);
        expect(ohlc).toEqual([[100, 105, 95, 110], [105, 108, 104, 112]]);
        expect(volumes).toEqual([1000, 2000]);
    });

    it('coerces missing numeric fields to 0', () => {
        const { ohlc, volumes } = toCandleSeries([{ date: 'd' }]);
        expect(ohlc).toEqual([[0, 0, 0, 0]]);
        expect(volumes).toEqual([0]);
    });
});
