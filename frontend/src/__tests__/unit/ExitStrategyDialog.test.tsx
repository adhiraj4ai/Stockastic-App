import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import api from '@/lib/api';
import { ExitStrategyDialog } from '@/components/ExitStrategyDialog';

vi.mock('@/lib/api', () => ({ default: { get: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));
vi.mock('@/components/signals/DailySignalStatus', () => ({ DailySignalStatus: () => <div>analysis-engine</div> }));

const item = { id: 5, ticker: 'NABIL', quantity: 100, gain_loss: 0, gain_loss_percent: 0 } as never;

describe('ExitStrategyDialog', () => {
    afterEach(() => vi.clearAllMocks());

    it('renders a single flat tab list: Plan, Transactions, Analysis', async () => {
        (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
            data: { current_price: 548, wacc: 520, is_underwater: false, strategies: {}, health_warnings: [], transactions: [] },
        });
        render(<ExitStrategyDialog open onOpenChange={vi.fn()} portfolioItem={item} onSave={vi.fn()} accounts={[]} />);
        const tabs = await screen.findAllByRole('tab');
        expect(tabs.map(t => t.textContent)).toEqual(['Plan', 'Transactions', 'Analysis']);
    });
});
