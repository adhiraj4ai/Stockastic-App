import { render, screen } from '@testing-library/react';
import { MarketRiskCards } from '@/components/RiskRadar';

const marketRisk = {
  window: 180,
  portfolio_beta: 1.24,
  beta_confidence: 'full' as const,
  value_at_risk: { var_95_1d: 0.032, var_99_1d: 0.051, var_95_1w: 0.072 },
  max_drawdown: -0.28,
  correlation: { tickers: [], matrix: [], average_correlation: null },
  per_holding: [],
};

test('renders beta, VaR and drawdown', () => {
  render(<MarketRiskCards data={marketRisk} />);
  expect(screen.getByText(/1.24/)).toBeInTheDocument();
  expect(screen.getByText(/3.2%/)).toBeInTheDocument();      // VaR 95% 1d
  expect(screen.getByText(/28.0%/)).toBeInTheDocument();     // max drawdown
});

test('shows placeholder when beta is null', () => {
  render(<MarketRiskCards data={{ ...marketRisk, portfolio_beta: null }} />);
  expect(screen.getByText(/not enough history/i)).toBeInTheDocument();
});
