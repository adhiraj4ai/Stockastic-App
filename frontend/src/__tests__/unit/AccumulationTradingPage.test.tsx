import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import AccumulationTradingPage from '@/app/(authenticated)/accumulation/trading/page';
import { accumulationApi } from '@/lib/api';

vi.mock('@/lib/api', () => ({
    __esModule: true,
    default: { get: vi.fn().mockResolvedValue({ data: [] }) },
    accumulationApi: { listCandidates: vi.fn() },
}));

describe('AccumulationTradingPage', () => {
    afterEach(() => vi.clearAllMocks());

    it('renders the ranked candidates returned by the api', async () => {
        (accumulationApi.listCandidates as ReturnType<typeof vi.fn>).mockResolvedValue({
            data: [{
                id: 1, symbol: 'NABIL', scan_date: '2026-06-26', score: '82.00',
                factors: { concentration: 0.9, coiling: 0.7, breakout: 1, score: 82 },
                suggested_entry: '520.00', suggested_stop: '500.00',
                suggested_target: '560.00', validation_state: 'validated',
                status: 'ACTIVE', suggested_qty: 100,
            }],
        });
        render(<AccumulationTradingPage />);
        await waitFor(() => expect(screen.getByText('NABIL')).toBeInTheDocument());
    });
});
