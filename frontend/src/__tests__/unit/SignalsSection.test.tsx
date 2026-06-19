import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SignalsSection } from '@/components/analysis/SignalsSection';

const data = {
    price: { cmp: 548, dayHigh: 555, dayLow: 540, w52High: 700, w52Low: 400, volume: 1000, turnover: 50000 },
    live: { rsi: 60, macd: 2, macdSignal: 1, macdHist: 1, roc: 3, trend5d: 1, trend10d: 2, trend1m: 5 },
    fundamentals: { pe: 14, eps: 38, bookValue: null, priceToBook: 1.9, roe: 18, divYield: 2, marketCap: null, yoyGrowth: 12, qoqGrowth: 4, debtEquity: 0.4, sector: 'Banking', indicators: [] },
    technicals: { sma50: 510, sma200: 500, atr: 12, adx: 32, vwap: 545, bbp: 0.6, pivotP: 548, pivotS1: 530, pivotR1: 560, cci: 0, williamsR: -50, mfi: 50, ultimateOsc: 55, stochK: 40, stochD: 42, aroonUp: 70, aroonDown: 30, psar: 540, cmf: 0.1, obv: 1000 },
    accumulation: { ratio: 65, netQty: 1200 },
    fibonacci: { trend: 'UPTREND', nearestSupport: 530, nearestResistance: 560, levels: [] },
    generatedSignals: [{ source: 'eng', signal: 'BUY', signal_tier: 'A', strength: 80 }],
    history: [{ date: '2026-06-10', signal: 'BUY', strategy_name: 'Momentum', last_close: '540' }],
    brokers: [], company: { name: 'Nabil', sector: 'Banking' },
} as never;

const ladder = { cmp: 548, entry: 520, stopLoss: 480, tp1: 600, tp2: 650, direction: 'BUY' as const };

describe('SignalsSection', () => {
    it('renders the ladder, a confluence signal, and institutional flow', () => {
        render(<SignalsSection data={data} ladder={ladder} />);
        expect(screen.getByText('CMP')).toBeInTheDocument();
        expect(screen.getByText(/Accumulating/i)).toBeInTheDocument();
        expect(screen.getByText('Momentum')).toBeInTheDocument();
    });

    it('renders trade-target percentage for T1 (600 entry 520 → +15.4%)', () => {
        render(<SignalsSection data={data} ladder={ladder} />);
        expect(screen.getByText('+15.4%')).toBeInTheDocument();
    });

    it('renders confluence agree/total badge showing 1 / 1 agree', () => {
        render(<SignalsSection data={data} ladder={ladder} />);
        expect(screen.getByText('1 / 1 agree')).toBeInTheDocument();
    });

    it('renders confluence signal source and tier', () => {
        render(<SignalsSection data={data} ladder={ladder} />);
        expect(screen.getByText('eng')).toBeInTheDocument();
        expect(screen.getByText('A')).toBeInTheDocument();
    });
});
