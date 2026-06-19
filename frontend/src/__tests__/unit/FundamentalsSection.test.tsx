import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { FundamentalsSection } from '@/components/analysis/FundamentalsSection';

const data = {
    fundamentals: { pe: 14, eps: 38, bookValue: 290, priceToBook: 1.9, roe: 18, divYield: 2, marketCap: 1e9, yoyGrowth: 12, qoqGrowth: 4, debtEquity: 0.4, sector: 'Banking', indicators: [] },
    price: {}, live: {}, technicals: {}, accumulation: null, fibonacci: null, generatedSignals: [], history: [], brokers: [], company: {},
} as never;

describe('FundamentalsSection', () => {
    it('renders the health score and valuation values', () => {
        render(<FundamentalsSection data={data} />);
        // computeHealthScore(18,14,0.4) = 58
        expect(screen.getByText('58')).toBeInTheDocument();
        expect(screen.getByText(/14/)).toBeInTheDocument(); // P/E
    });
    it('shows N/A for a missing metric', () => {
        const d = { ...data, fundamentals: { ...data.fundamentals, priceToBook: null } };
        render(<FundamentalsSection data={d} />);
        expect(screen.getAllByText('N/A').length).toBeGreaterThan(0);
    });
});
