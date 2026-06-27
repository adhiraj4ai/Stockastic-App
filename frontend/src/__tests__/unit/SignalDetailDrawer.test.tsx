// frontend/src/__tests__/unit/SignalDetailDrawer.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
vi.mock('@/components/analysis/AnalysisTabs', () => ({ AnalysisTabs: () => <div>analysis</div> }));
import { SignalDetailDrawer } from '@/components/signals/SignalDetailDrawer';
import type { SignalCardData } from '@/types/signals-board';

const card = (over: Partial<SignalCardData>): SignalCardData => ({
    source: 'SMART_MONEY', family: 'accumulation', symbol: 'NABIL', direction: 'BUY',
    strength: 88, tier: 'Platinum Buy', entry_price: '520', stop_loss_price: '500',
    target_price: '560', conditions: ['4 smart-money brokers clustered near cost'],
    validation_state: null, freshness_date: '2026-06-15', strategy_name: 'Smart money', rationale: '', ...over });

describe('SignalDetailDrawer', () => {
    it('lists each engine and its conditions', () => {
        render(<SignalDetailDrawer symbol="NABIL" open cards={[card({})]} onClose={vi.fn()} />);
        expect(screen.getByText('Smart money')).toBeInTheDocument();
        expect(screen.getByText(/4 smart-money brokers/)).toBeInTheDocument();
    });
    it('disables paper trade when a contributing card is research-only', () => {
        render(<SignalDetailDrawer symbol="NABIL" open onClose={vi.fn()}
            cards={[card({ source: 'ACCUMULATION_STRATEGY', validation_state: 'research', strategy_name: 'Accumulation strategy' })]} />);
        expect(screen.getByRole('button', { name: /place paper trade/i })).toBeDisabled();
    });
});
