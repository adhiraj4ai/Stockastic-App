import { describe, it, expect, vi, beforeEach } from 'vitest';
import api from '@/lib/api';
import { draftTradePlan } from '@/lib/draftTradePlan';

vi.mock('@/lib/api', () => ({
    default: { get: vi.fn(), post: vi.fn() },
}));

describe('draftTradePlan', () => {
    beforeEach(() => vi.clearAllMocks());

    it('posts the trade-plans contract with one full-allocation leg', async () => {
        vi.mocked(api.post).mockResolvedValue({ data: { id: 7 } });
        const res = await draftTradePlan({
            ticker: 'NABIL', accountId: 3, riskPct: 1.0,
            entry: 612, stop: 585, target: 640, thesis: 'verdict 81/100',
        });
        expect(api.post).toHaveBeenCalledWith('/api/stocks/trade-plans/', {
            ticker: 'NABIL',
            account: 3,
            risk_budget_pct: '1.00',
            target_price: '640.00',
            thesis: 'verdict 81/100',
            legs: [{
                leg_number: 1,
                price_target: '612.00',
                allocation_pct: '100',
                stop_loss_price: '585.00',
            }],
        });
        expect(res.id).toBe(7);
    });

    it('sends null target_price and account when absent', async () => {
        vi.mocked(api.post).mockResolvedValue({ data: { id: 8 } });
        await draftTradePlan({ ticker: 'X', accountId: null, riskPct: 2, entry: 100, stop: 95, target: null, thesis: '' });
        const payload = vi.mocked(api.post).mock.calls[0][1] as Record<string, unknown>;
        expect(payload.target_price).toBeNull();
        expect(payload.account).toBeNull();
    });
});
