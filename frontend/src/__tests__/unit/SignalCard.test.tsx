// frontend/src/__tests__/unit/SignalCard.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SignalCard } from '@/components/signals/SignalCard';
import type { SignalCardData } from '@/types/signals-board';

const base: SignalCardData = {
    source: 'SMART_MONEY', family: 'accumulation', symbol: 'NABIL', direction: 'BUY',
    strength: 88, tier: 'Platinum Buy', entry_price: '520.00', stop_loss_price: '500.00',
    target_price: '560.00', conditions: [], validation_state: null, freshness_date: '2026-06-15',
    strategy_name: 'Smart money', rationale: '',
};

describe('SignalCard', () => {
    it('renders symbol, levels, and a consensus chip at >=2 families', () => {
        render(<SignalCard card={base} consensusCount={2} glossary={null} onOpen={vi.fn()} />);
        expect(screen.getByText('NABIL')).toBeInTheDocument();
        expect(screen.getByText('560.00')).toBeInTheDocument();
        expect(screen.getByText(/confirmed by 2 families/i)).toBeInTheDocument();
    });
    it('shows close-on-flip for user strategies (no stop/target) and fires onOpen', () => {
        const onOpen = vi.fn();
        const strat = { ...base, source: 'USER_STRATEGY', family: 'your_strategies' as const, stop_loss_price: null, target_price: null };
        render(<SignalCard card={strat} consensusCount={1} glossary={null} onOpen={onOpen} />);
        expect(screen.getByText(/close on flip/i)).toBeInTheDocument();
        expect(screen.queryByText(/confirmed by/i)).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button'));
        expect(onOpen).toHaveBeenCalledWith(strat);
    });
});
