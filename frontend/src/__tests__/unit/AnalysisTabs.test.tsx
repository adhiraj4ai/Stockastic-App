import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/hooks/useTickerAnalysis', () => ({ useTickerAnalysis: () => ({ loading: false, error: false, data: {} }) }));
vi.mock('@/components/analysis/SignalsSection', () => ({ SignalsSection: () => <div>signals-body</div> }));
vi.mock('@/components/analysis/TechnicalsSection', () => ({ TechnicalsSection: () => <div>technicals-body</div> }));
vi.mock('@/components/analysis/FundamentalsSection', () => ({ FundamentalsSection: () => <div>fundamentals-body</div> }));
vi.mock('@/components/analysis/AccumulationSection', () => ({ AccumulationSection: () => <div>accumulation-body</div> }));

import { AnalysisTabs } from '@/components/analysis/AnalysisTabs';

describe('AnalysisTabs', () => {
    it('renders a single flat tab list of the four analysis sections', () => {
        render(<AnalysisTabs symbol="NABIL" ladder={{ cmp: 548, entry: 520, direction: 'BUY' }} />);
        const tabs = screen.getAllByRole('tab');
        expect(tabs.map(t => t.textContent)).toEqual(['Signals', 'Technicals', 'Fundamentals', 'Accumulation']);
    });
});
