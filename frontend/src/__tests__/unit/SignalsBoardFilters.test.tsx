// frontend/src/__tests__/unit/SignalsBoardFilters.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
vi.mock('@/components/DashboardLayout', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/analysis/AnalysisTabs', () => ({ AnalysisTabs: () => <div>analysis</div> }));
const board = vi.fn().mockResolvedValue({ data: { cards: [], consensus: {} } });
vi.mock('@/lib/api', () => ({ __esModule: true, default: { get: vi.fn() },
    signalsApi: { board: (...a: unknown[]) => board(...a), glossary: vi.fn().mockResolvedValue({ data: { sources:{}, tiers:{}, terms:{} } }) } }));
import SignalsBoard from '@/components/signals/SignalsBoard';

describe('SignalsBoard filters', () => {
    afterEach(() => vi.clearAllMocks());
    it('re-fetches the board with a direction filter', async () => {
        render(<SignalsBoard />);
        await waitFor(() => expect(board).toHaveBeenCalled());
        fireEvent.click(screen.getByRole('button', { name: /^buy$/i }));
        await waitFor(() => expect(board).toHaveBeenLastCalledWith({ direction: 'BUY' }));
    });
    it('re-fetches the board with a min_families filter', async () => {
        render(<SignalsBoard />);
        await waitFor(() => expect(board).toHaveBeenCalled());
        fireEvent.click(screen.getByRole('button', { name: /^2\+$/i }));
        await waitFor(() => expect(board).toHaveBeenLastCalledWith({ min_families: '2' }));
    });
});
