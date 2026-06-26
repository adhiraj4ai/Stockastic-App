import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PriceHistoryCard } from '@/components/chat/gen-ui/SimpleCards';

vi.mock('@/components/chat/gen-ui/charts/CandlestickChart', () => ({
    __esModule: true,
    default: () => <div data-testid="candlestick-chart" />,
}));

const rows = [
    { date: '2026-06-01', open: 100, high: 110, low: 95, close: 105, volume: 1000 },
    { date: '2026-06-02', open: 105, high: 112, low: 104, close: 108, volume: 2000 },
];

describe('PriceHistoryCard', () => {
    it('renders the candlestick chart and an OHLCV row table', () => {
        render(<PriceHistoryCard symbol="NABIL" rows={rows} />);
        expect(screen.getByTestId('candlestick-chart')).toBeInTheDocument();
        expect(screen.getByText('Volume')).toBeInTheDocument(); // new table header
        expect(screen.getByText('2,000')).toBeInTheDocument();   // volume cell, formatted
    });

    it('returns null for empty rows', () => {
        const { container } = render(<PriceHistoryCard symbol="NABIL" rows={[]} />);
        expect(container).toBeEmptyDOMElement();
    });
});
