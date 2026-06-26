import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import MarketSummary from '@/components/chat/gen-ui/MarketSummary';

vi.mock('@/components/chat/gen-ui/charts/MoversBarChart', () => ({
    __esModule: true,
    default: () => <div data-testid="movers-bar" />,
}));

describe('MarketSummary', () => {
    it('renders the movers bar chart alongside the gainer/loser lists', () => {
        render(<MarketSummary market_index={1.2} top_gainers={[{ symbol: 'A', price_change: 5 }]} top_losers={[{ symbol: 'B', price_change: -4 }]} />);
        expect(screen.getByTestId('movers-bar')).toBeInTheDocument();
        expect(screen.getByText('A')).toBeInTheDocument();
        expect(screen.getByText('B')).toBeInTheDocument();
    });

    it('omits the chart when both lists are empty', () => {
        render(<MarketSummary top_gainers={[]} top_losers={[]} />);
        expect(screen.queryByTestId('movers-bar')).not.toBeInTheDocument();
    });
});
