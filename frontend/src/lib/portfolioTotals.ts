import type { PortfolioItem } from '@/components/PortfolioTable';

export interface GroupTotals {
    invested: number;
    current: number;
    gainLoss: number;
}

export interface SplitTotals {
    investment: GroupTotals;
    trading: GroupTotals;
}

const empty = (): GroupTotals => ({ invested: 0, current: 0, gainLoss: 0 });

export function splitTotalsByClassification(items: PortfolioItem[]): SplitTotals {
    const totals: SplitTotals = { investment: empty(), trading: empty() };
    for (const item of items) {
        const group = item.classification === 'investment' ? totals.investment : totals.trading;
        group.invested += Number(item.investment_value);
        group.current += Number(item.current_value);
        group.gainLoss += Number(item.gain_loss);
    }
    return totals;
}
