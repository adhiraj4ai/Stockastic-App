import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import RiskCard from '@/components/chat/gen-ui/RiskCard';

vi.mock('@/components/chat/gen-ui/charts/RiskRadarChart', () => ({
    __esModule: true,
    default: () => <div data-testid="risk-radar" />,
}));

const radar_data = [
    { axis: 'Concentration', value: 6, fullMark: 10 },
    { axis: 'Liquidity', value: 3, fullMark: 10 },
    { axis: 'Volatility', value: 5, fullMark: 10 },
];

describe('RiskCard', () => {
    it('renders the radar chart above the existing dimension bars', () => {
        render(<RiskCard radar_data={radar_data} summary={{ total_value: 1, risk_level: 'MEDIUM' }} />);
        expect(screen.getByTestId('risk-radar')).toBeInTheDocument();
        expect(screen.getByText('Concentration')).toBeInTheDocument(); // dimension bar label retained
    });

    it('omits the radar when there is no radar_data', () => {
        render(<RiskCard summary={{ total_value: 1, risk_level: 'LOW' }} />);
        expect(screen.queryByTestId('risk-radar')).not.toBeInTheDocument();
    });
});
