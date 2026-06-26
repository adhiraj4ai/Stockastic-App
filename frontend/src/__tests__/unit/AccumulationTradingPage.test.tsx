import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import AccumulationTradingPage from '@/app/(authenticated)/accumulation/trading/page';
import { accumulationApi } from '@/lib/api';

const mockPost = vi.fn().mockResolvedValue({ data: {} });
const mockGet = vi.fn();

vi.mock('@/lib/api', () => ({
    __esModule: true,
    default: {
        get: (...args: unknown[]) => mockGet(...args),
        post: (...args: unknown[]) => mockPost(...args),
    },
    accumulationApi: { listCandidates: vi.fn() },
}));

const PAPER_ACCOUNTS = [
    { id: 7, name: 'Paper Alpha', account_type: 'PAPER', balance: '100000', default_risk_percentage: 2 },
];

const VALIDATED_CANDIDATE = {
    id: 1, symbol: 'NABIL', scan_date: '2026-06-26', score: '82.00',
    factors: { concentration: 0.9, coiling: 0.7, breakout: 1, score: 82 },
    suggested_entry: '520.00', suggested_stop: '500.00',
    suggested_target: '560.00', validation_state: 'validated',
    status: 'ACTIVE', suggested_qty: 100,
};

describe('AccumulationTradingPage', () => {
    afterEach(() => vi.clearAllMocks());

    it('renders the ranked candidates returned by the api', async () => {
        mockGet.mockResolvedValue({ data: PAPER_ACCOUNTS });
        (accumulationApi.listCandidates as ReturnType<typeof vi.fn>).mockResolvedValue({
            data: [VALIDATED_CANDIDATE],
        });
        render(<AccumulationTradingPage />);
        await waitFor(() => expect(screen.getByText('NABIL')).toBeInTheDocument());
    });

    it('shows a note when no paper accounts exist', async () => {
        mockGet.mockResolvedValue({ data: [] });
        (accumulationApi.listCandidates as ReturnType<typeof vi.fn>).mockResolvedValue({
            data: [VALIDATED_CANDIDATE],
        });
        render(<AccumulationTradingPage />);
        await waitFor(() =>
            expect(screen.getByText(/create a paper account/i)).toBeInTheDocument()
        );
    });

    it('disables confirm buy and shows note when suggested_qty is null', async () => {
        const nullQtyCandidate = { ...VALIDATED_CANDIDATE, suggested_qty: null };
        mockGet.mockResolvedValue({ data: PAPER_ACCOUNTS });
        (accumulationApi.listCandidates as ReturnType<typeof vi.fn>).mockResolvedValue({
            data: [nullQtyCandidate],
        });
        render(<AccumulationTradingPage />);
        await waitFor(() => screen.getByText('NABIL'));

        fireEvent.click(screen.getByRole('button', { name: /place paper trade/i }));
        await waitFor(() => screen.getByRole('button', { name: /confirm buy/i }));

        expect(screen.getByRole('button', { name: /confirm buy/i })).toBeDisabled();
        expect(screen.getByText(/quantity not available/i)).toBeInTheDocument();
    });

    it('posts the trade when confirm buy is clicked', async () => {
        mockGet.mockResolvedValue({ data: PAPER_ACCOUNTS });
        (accumulationApi.listCandidates as ReturnType<typeof vi.fn>).mockResolvedValue({
            data: [VALIDATED_CANDIDATE],
        });
        render(<AccumulationTradingPage />);
        await waitFor(() => screen.getByText('NABIL'));

        fireEvent.click(screen.getByRole('button', { name: /place paper trade/i }));
        await waitFor(() => screen.getByRole('button', { name: /confirm buy/i }));

        fireEvent.click(screen.getByRole('button', { name: /confirm buy/i }));
        await waitFor(() =>
            expect(mockPost).toHaveBeenCalledWith('/api/stocks/transactions/', {
                ticker: 'NABIL',
                transaction_type: 'BUY',
                quantity: 100,
                rate: '520.00',
                account: 7,
            })
        );
    });
});
