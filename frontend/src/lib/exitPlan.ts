export function computeExitRiskReward(
    cmp?: number, stopLoss?: number, target?: number,
): number | null {
    if (cmp == null || stopLoss == null || target == null) return null;
    const risk = cmp - stopLoss;
    if (risk <= 0) return null;
    return Math.round(((target - cmp) / risk) * 100) / 100;
}

export interface ExitLadderPoint {
    key: 'sl' | 'entry' | 'cmp' | 't1' | 't2' | 't3';
    label: string;
    price: number;
}

export function buildExitLadder(v: {
    stopLoss?: number; entry?: number; cmp?: number; t1?: number; t2?: number; t3?: number;
}): ExitLadderPoint[] {
    const always = new Set<ExitLadderPoint['key']>(['entry', 'cmp']);
    const candidates: Array<[ExitLadderPoint['key'], string, number | undefined]> = [
        ['t3', 'T3', v.t3], ['t2', 'T2', v.t2], ['t1', 'T1', v.t1],
        ['cmp', 'CMP', v.cmp], ['entry', 'Entry', v.entry], ['sl', 'SL', v.stopLoss],
    ];
    return candidates
        .filter(([key, , value]) => always.has(key) || value != null)
        .map(([key, label, value]) => ({ key, label, price: Number(value) }))
        .filter(point => Number.isFinite(point.price))
        .sort((a, b) => b.price - a.price);
}
