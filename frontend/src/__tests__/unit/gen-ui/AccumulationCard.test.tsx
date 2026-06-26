import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AccumulationCard } from '@/components/chat/gen-ui/SimpleCards';

vi.mock('@/components/chat/gen-ui/charts/AccumulationTrendChart', () => ({
    __esModule: true,
    default: () => <div data-testid="accumulation-trend" />,
}));

const rows = [{ entity_id: '1', transaction_date: '2026-06-01', cumulative_buy: 100, cumulative_sell: 40, cumulative_net: 60 }];
const series = [{ date: '2026-06-01', net: 60 }, { date: '2026-06-02', net: 80 }];

describe('AccumulationCard', () => {
    it('renders the trend chart when series is present and keeps the broker table', () => {
        render(<AccumulationCard symbol="NABIL" rows={rows} series={series} />);
        expect(screen.getByTestId('accumulation-trend')).toBeInTheDocument();
        expect(screen.getByText('#1')).toBeInTheDocument(); // broker row retained
    });

    it('omits the trend chart when there is no series', () => {
        render(<AccumulationCard symbol="NABIL" rows={rows} />);
        expect(screen.queryByTestId('accumulation-trend')).not.toBeInTheDocument();
    });
});
