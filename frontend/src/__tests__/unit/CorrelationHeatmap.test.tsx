// frontend/src/__tests__/unit/CorrelationHeatmap.test.tsx
import { render, screen } from '@testing-library/react';
import CorrelationHeatmap from '@/components/CorrelationHeatmap';

test('renders a cell per ticker pair', () => {
    render(<CorrelationHeatmap tickers={['AAA', 'BBB']} matrix={[[1, 0.82], [0.82, 1]]} />);
    expect(screen.getAllByText('AAA').length).toBeGreaterThan(0);
    expect(screen.getAllByText('0.82').length).toBeGreaterThan(0);
});

test('renders nothing for a single ticker', () => {
    const { container } = render(<CorrelationHeatmap tickers={['AAA']} matrix={[[1]]} />);
    expect(container).toBeEmptyDOMElement();
});
