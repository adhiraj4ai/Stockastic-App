import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import HoldingsCard from '@/components/chat/gen-ui/HoldingsCard';

vi.mock('@/components/chat/gen-ui/charts/AllocationDonut', () => ({
    __esModule: true,
    default: () => <div data-testid="allocation-donut" />,
}));

const holdings = [
    { ticker: 'A', quantity: 10, wacc: 100, current_price: 150, current_value: 1500, gain_loss: 500, gain_loss_pct: 50, day_gain_loss: 0 },
    { ticker: 'B', quantity: 10, wacc: 100, current_price: 50, current_value: 500, gain_loss: -500, gain_loss_pct: -50, day_gain_loss: 0 },
];

describe('HoldingsCard', () => {
    it('renders the allocation donut and a weight column', () => {
        render(<HoldingsCard holdings={holdings} />);
        expect(screen.getByTestId('allocation-donut')).toBeInTheDocument();
        expect(screen.getByText('Weight')).toBeInTheDocument();
        expect(screen.getByText('75.0%')).toBeInTheDocument(); // 1500 / 2000
    });

    it('renders without the donut when there are no holdings', () => {
        render(<HoldingsCard holdings={[]} />);
        expect(screen.queryByTestId('allocation-donut')).not.toBeInTheDocument();
    });
});
