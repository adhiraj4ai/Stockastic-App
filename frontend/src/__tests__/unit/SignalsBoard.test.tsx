// frontend/src/__tests__/unit/SignalsBoard.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
vi.mock('@/components/DashboardLayout', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/analysis/AnalysisTabs', () => ({ AnalysisTabs: () => <div>analysis</div> }));
vi.mock('@/lib/api', () => ({
    __esModule: true, default: { get: vi.fn() },
    signalsApi: {
        board: vi.fn().mockResolvedValue({ data: { cards: [
            { source:'SMART_MONEY', family:'accumulation', symbol:'NABIL', direction:'BUY', strength:88, tier:'Platinum Buy', entry_price:'520', stop_loss_price:'500', target_price:'560', conditions:[], validation_state:null, freshness_date:'2026-06-15', strategy_name:'Smart money', rationale:'' },
        ], consensus: { NABIL: { families:['accumulation'], count:1 } } } }),
        glossary: vi.fn().mockResolvedValue({ data: { sources:{}, tiers:{}, terms:{} } }),
    },
}));
import SignalsBoard from '@/components/signals/SignalsBoard';

describe('SignalsBoard', () => {
    afterEach(() => vi.clearAllMocks());
    it('renders the three lanes and a fetched card', async () => {
        render(<SignalsBoard />);
        await waitFor(() => expect(screen.getByText('NABIL')).toBeInTheDocument());
        expect(screen.getByText('Accumulation')).toBeInTheDocument();
        expect(screen.getByText('Technical')).toBeInTheDocument();
        expect(screen.getByText('Your strategies')).toBeInTheDocument();
    });
});
