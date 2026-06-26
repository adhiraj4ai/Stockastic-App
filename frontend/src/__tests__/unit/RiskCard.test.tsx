import { render, screen } from '@testing-library/react';
import RiskCard from '@/components/chat/gen-ui/RiskCard';

const data = {
    radar_data: [], alerts: [],
    summary: { total_value: 100000, risk_level: 'MEDIUM' as const },
    market_risk: {
        window: 180, portfolio_beta: 1.1, beta_confidence: 'full' as const,
        value_at_risk: { var_95_1d: 0.03, var_99_1d: 0.05, var_95_1w: 0.067 },
        max_drawdown: -0.15,
        correlation: { tickers: [], matrix: [], average_correlation: null }, per_holding: [],
    },
};

test('chat risk card shows market beta', () => {
    render(<RiskCard {...data} />);
    const matches = screen.getAllByText(/1\.10/);
    expect(matches.length).toBeGreaterThan(0);
});
