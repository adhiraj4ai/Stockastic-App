import { describe, it, expect } from 'vitest';
import { formatCardText, type SocialCardData } from '@/lib/socialCardText';

const summaryPayload = {
    market_summary: {
        date: '2026-06-10', total_points: 2145.8, points_change: 25.4, percent_change: 1.2,
        total_turnover: 4_200_000_000, total_volume: 9_100_000,
        advancers: 142, decliners: 58, advancers_percent: 71, decliners_percent: 29,
    },
    top_gainers: [{ ticker: 'SHIVM', percent_change: 4.0, close: 645, turnover: 50_000_000, sector: 'Cement' }],
    top_losers: [{ ticker: 'NIFRA', percent_change: -2.2, close: 310, turnover: 30_000_000, sector: 'Finance' }],
    top_turnover: [{ ticker: 'NABIL', percent_change: 1.8, close: 512, turnover: 220_000_000, sector: 'Banks' }],
    sector_summary: [{ name: 'Hydro Power', change: 2.1, turnover: 900_000_000, count: 80 }],
    near_52_high: [{ ticker: 'NLIC', percent_change: 3.1, close: 1200, turnover: 0, sector: 'Insurance' }],
    near_52_low: [{ ticker: 'UNL', percent_change: -1.0, close: 39000, turnover: 0, sector: 'Manufacturing' }],
};

const base: SocialCardData = {
    summary: summaryPayload,
    weekly: summaryPayload,
    signals: [{ symbol: 'NABIL', action: 'BUY', source: 'Smart Money', conviction: 86, price: 512, detail: 'Gold Signal' }],
    accumulation: {
        top: [{ symbol: 'HIDCL', sector: 'Hydro', net_qty: 2_100_000, accumulation_ratio: 12, close: 220 }],
        aggressive: [{ symbol: 'UNL', sector: 'Manufacturing', intensity: 8.2, close: 39000 }],
    },
};

describe('formatCardText', () => {
    it('formats the daily summary', () => {
        const text = formatCardText('summary', base);
        expect(text).toContain('#NEPSE');
        expect(text).toContain('2145.80');
        expect(text).toContain('+25.40');
        expect(text).toContain('420.00 Cr');
        expect(text).toContain('142');
    });

    it('formats gainers, losers and turnover lists', () => {
        expect(formatCardText('gainers', base)).toContain('1. SHIVM: +4.00%');
        expect(formatCardText('losers', base)).toContain('1. NIFRA: -2.20%');
        expect(formatCardText('turnover', base)).toContain('1. NABIL: Rs. 220.0M');
    });

    it('formats sectors', () => {
        expect(formatCardText('sectors', base)).toContain('Hydro Power: +2.10%');
    });

    it('formats signals with action emoji and conviction', () => {
        const text = formatCardText('signals', base);
        expect(text).toContain('🟢 BUY NABIL');
        expect(text).toContain('86/100');
    });

    it('formats smart money and 52-week and weekly', () => {
        expect(formatCardText('smart-money', base)).toContain('HIDCL');
        const ftw = formatCardText('fifty-two-week', base);
        expect(ftw).toContain('NLIC');
        expect(ftw).toContain('UNL');
        expect(formatCardText('weekly', base)).toContain('Weekly');
    });

    it('returns empty string when the required data is missing', () => {
        expect(formatCardText('summary', {})).toBe('');
        expect(formatCardText('signals', { signals: [] })).toBe('');
        expect(formatCardText('smart-money', {})).toBe('');
        expect(formatCardText('weekly', {})).toBe('');
        expect(formatCardText('fifty-two-week', {})).toBe('');
    });
});
