export interface IndicatorRow { name: string; value: string; raw_value?: string | number; }
export type Lean = 'bullish' | 'bearish' | 'neutral';

export function findIndicator(rows: IndicatorRow[] | undefined, ...needles: string[]): number | null {
    if (!rows) return null;
    const upper = needles.map(n => n.toUpperCase());
    const row = rows.find(r => upper.some(n => r.name?.toUpperCase().includes(n)));
    if (!row) return null;
    const v = Number(row.raw_value ?? row.value);
    return Number.isFinite(v) ? v : null;
}

export interface BiasInput {
    rsi: number | null; macd: number | null; macdSignal: number | null; stochK: number | null;
    cci: number | null; williamsR: number | null; mfi: number | null; roc: number | null;
    adx: number | null; trend5d: number | null; sma50: number | null; sma200: number | null;
    cmf: number | null; cmp: number | null;
}
export interface BiasResult {
    rating: 'Strong Buy' | 'Buy' | 'Neutral' | 'Sell' | 'Strong Sell';
    bull: number; bear: number; neutral: number; total: number;
}

const lean = (bull: boolean, bear: boolean): Lean => (bull ? 'bullish' : bear ? 'bearish' : 'neutral');
const gt = (a: number | null, b: number | null) => a != null && b != null && a > b;

function biasLeans(i: BiasInput): Lean[] {
    return [
        lean(i.rsi != null && i.rsi < 30, i.rsi != null && i.rsi > 70),
        lean(gt(i.macd, i.macdSignal), gt(i.macdSignal, i.macd)),
        lean(i.stochK != null && i.stochK < 20, i.stochK != null && i.stochK > 80),
        lean(i.cci != null && i.cci < -100, i.cci != null && i.cci > 100),
        lean(i.williamsR != null && i.williamsR < -80, i.williamsR != null && i.williamsR > -20),
        lean(i.mfi != null && i.mfi < 20, i.mfi != null && i.mfi > 80),
        lean(i.roc != null && i.roc > 2, i.roc != null && i.roc < -2),
        lean(gt(i.adx, 25) && gt(i.trend5d, 0), gt(i.adx, 25) && gt(0, i.trend5d)),
        lean(gt(i.cmp, i.sma50) && gt(i.sma50, i.sma200), gt(i.sma50, i.cmp) && gt(i.sma200, i.sma50)),
        lean(i.cmf != null && i.cmf > 0.05, i.cmf != null && i.cmf < -0.05),
    ];
}

function rate(bull: number, bear: number): BiasResult['rating'] {
    if (bull > bear + 2) return 'Strong Buy';
    if (bull > bear) return 'Buy';
    if (bear > bull + 2) return 'Strong Sell';
    if (bear > bull) return 'Sell';
    return 'Neutral';
}

export function computeTechnicalBias(i: BiasInput): BiasResult {
    const leans = biasLeans(i);
    const bull = leans.filter(l => l === 'bullish').length;
    const bear = leans.filter(l => l === 'bearish').length;
    return { rating: rate(bull, bear), bull, bear, neutral: leans.length - bull - bear, total: leans.length };
}

export function computeHealthScore(roe?: number | null, pe?: number | null, de?: number | null): number {
    const base = (Number(roe) || 0) + ((pe ?? 99) < 25 ? 20 : 0) + ((de ?? 99) < 1 ? 20 : 0);
    return Math.min(100, Math.max(0, Math.round(base)));
}

export function computeConfluence(signals: { signal: string }[], direction: string): { agree: number; total: number } {
    return { agree: signals.filter(s => s.signal === direction).length, total: signals.length };
}

export function pctReturn(price?: number | null, entry?: number | null): number | null {
    if (price == null || entry == null || entry === 0) return null;
    return Math.round(((price - entry) / entry) * 1000) / 10;
}
