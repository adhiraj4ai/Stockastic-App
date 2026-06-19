import type { PortfolioItem } from '@/components/PortfolioTable';

const round1 = (v: number): number => Math.round(v * 10) / 10;

export function computeRiskReward(
    wacc?: number, stopLoss?: number, target?: number,
): number | null {
    if (wacc == null || stopLoss == null || target == null) return null;
    const risk = wacc - stopLoss;
    if (risk <= 0) return null;
    return round1((target - wacc) / risk);
}

export function computeDayPercent(
    dayGainLoss?: number, currentValue?: number,
): number | null {
    if (dayGainLoss == null || currentValue == null) return null;
    const prior = currentValue - dayGainLoss;
    if (prior === 0) return null;
    return round1((dayGainLoss / prior) * 100);
}

export function computeHoldingDays(purchasedAt: string, now: Date): number {
    const start = new Date(purchasedAt).getTime();
    const dayMs = 86_400_000;
    return Math.max(0, Math.floor((now.getTime() - start) / dayMs));
}

export interface LadderPoint {
    key: 'sl' | 'entry' | 'cmp' | 't1' | 't2' | 't3';
    label: string;
    price: number;
}

export function buildPriceLadder(item: PortfolioItem): LadderPoint[] {
    const always = new Set(['entry', 'cmp']);
    const candidates: Array<[LadderPoint['key'], string, number | undefined]> = [
        ['sl', 'SL', item.stop_loss_price],
        ['entry', 'Entry', item.wacc],
        ['cmp', 'CMP', item.current_price],
        ['t1', 'T1', item.target_price],
        ['t2', 'T2', item.target_price_2],
        ['t3', 'T3', item.target_price_3],
    ];
    return candidates
        .filter(([key, , value]) => always.has(key) || value != null)
        .map(([key, label, value]) => ({ key, label, price: Number(value) }))
        .filter(point => Number.isFinite(point.price))
        .sort((a, b) => a.price - b.price);
}
