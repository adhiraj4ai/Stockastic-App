import api from '@/lib/api';

export interface DraftTradePlanArgs {
    ticker: string;
    accountId: number | null;
    riskPct: number;
    entry: number;
    stop: number;
    target: number | null;
    thesis: string;
}

// The trade-plans serializer expects string decimals and legs summing to 100%.
export async function draftTradePlan(args: DraftTradePlanArgs) {
    const res = await api.post('/api/stocks/trade-plans/', {
        ticker: args.ticker,
        account: args.accountId,
        risk_budget_pct: args.riskPct.toFixed(2),
        target_price: args.target != null ? args.target.toFixed(2) : null,
        thesis: args.thesis,
        legs: [{
            leg_number: 1,
            price_target: args.entry.toFixed(2),
            allocation_pct: '100',
            stop_loss_price: args.stop.toFixed(2),
        }],
    });
    return res.data;
}
