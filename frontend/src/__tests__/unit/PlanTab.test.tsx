import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PlanTab } from '@/components/exit/PlanTab';

const baseProps = {
    strategies: { fixed: { name: 'Fixed', sl: 494, tp: 602, desc: 'Fixed % plan' } },
    healthWarnings: [],
    currentPrice: 548, wacc: 520,
    sl: '480', tp: '600', tp2: '', tp3: '', thesis: '',
    selectedStrategy: 'MANUAL',
    onApplyStrategy: vi.fn(),
    onField: vi.fn(),
};

describe('PlanTab', () => {
    it('renders a game-plan card and applies it on click', () => {
        const onApplyStrategy = vi.fn();
        render(<PlanTab {...baseProps} onApplyStrategy={onApplyStrategy} />);
        fireEvent.click(screen.getByText('Fixed'));
        expect(onApplyStrategy).toHaveBeenCalledWith('fixed');
    });

    it('renders the live risk/reward from current inputs', () => {
        render(<PlanTab {...baseProps} />);
        // (600-548)/(548-480) = 0.76
        expect(screen.getByText('1:0.76')).toBeInTheDocument();
    });

    it('renders ladder markers including CMP and SL', () => {
        render(<PlanTab {...baseProps} />);
        expect(screen.getByText('CMP')).toBeInTheDocument();
        expect(screen.getByText('SL')).toBeInTheDocument();
    });

    it('omits T2 and T3 markers when tp2 and tp3 are blank', () => {
        render(<PlanTab {...baseProps} sl="480" tp="600" tp2="" tp3="" />);
        expect(screen.getByText('CMP')).toBeInTheDocument();
        expect(screen.getByText('SL')).toBeInTheDocument();
        expect(screen.getByText('T1')).toBeInTheDocument();
        expect(screen.queryByText('T2')).not.toBeInTheDocument();
        expect(screen.queryByText('T3')).not.toBeInTheDocument();
    });
});
