import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { TechnicalsSection } from '@/components/analysis/TechnicalsSection';

const baseData = {
    price: { cmp: 548 }, live: { rsi: 25, macd: 2, macdSignal: 1, macdHist: 1, roc: 5, trend5d: 1, trend10d: 1, trend1m: 1 },
    technicals: { sma50: 510, sma200: 500, atr: 12, adx: 32, vwap: 545, bbp: 0.6, pivotP: 548, pivotS1: 530, pivotR1: 560, cci: -150, williamsR: -90, mfi: 10, ultimateOsc: 55, stochK: 10, stochD: 12, aroonUp: 70, aroonDown: 30, psar: 540, cmf: 0.1, obv: 1000 },
    fundamentals: {}, accumulation: null, fibonacci: null, generatedSignals: [], history: [], brokers: [], company: {},
} as never;

describe('TechnicalsSection', () => {
    it('renders the technical-bias rating and an oscillator label', () => {
        render(<TechnicalsSection data={baseData} />);
        expect(screen.getByText('Strong Buy')).toBeInTheDocument();
        expect(screen.getByText('RSI')).toBeInTheDocument();
    });

    it('shows N/A when a nullable oscillator (cci) is null', () => {
        const data = {
            ...baseData,
            technicals: { ...(baseData as never as { technicals: object }).technicals, cci: null },
        } as never;
        render(<TechnicalsSection data={data} />);
        // CCI gauge renders its value via fmt(); null → 'N/A'
        const naElements = screen.getAllByText('N/A');
        expect(naElements.length).toBeGreaterThan(0);
    });
});
