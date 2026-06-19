'use client';

import type { TickerAnalysisData } from '@/hooks/useTickerAnalysis';
import { pctReturn, computeConfluence } from '@/lib/tickerAnalysis';
import { formatRupees } from '@/lib/formatters';

// ── Prop types ────────────────────────────────────────────────────────────────
export interface LadderProps {
    cmp?: number;
    entry?: number;
    stopLoss?: number;
    tp1?: number;
    tp2?: number;
    tp3?: number;
    direction: 'BUY' | 'SELL';
}

export interface SignalsSectionProps {
    data: TickerAnalysisData;
    ladder: LadderProps;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const LABEL_SL = 'SL';
const LABEL_ENTRY = 'Entry';
const LABEL_CMP = 'CMP';
const LABEL_TP1 = 'T1';
const LABEL_TP2 = 'T2';
const LABEL_TP3 = 'T3';

type DotVariant = 'danger' | 'entry' | 'live' | 'tp' | 'tp-hi';

const DOT_CLS: Record<DotVariant, string> = {
    danger: 'bg-rose-400',
    entry: 'bg-slate-600',
    live: 'bg-amber-400',
    tp: 'bg-emerald-400',
    'tp-hi': 'bg-sky-400',
};

const LABEL_CLS: Record<DotVariant, string> = {
    danger: 'text-rose-500',
    entry: 'text-slate-500',
    live: 'text-amber-500',
    tp: 'text-emerald-600',
    'tp-hi': 'text-sky-500',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function safeNum(v?: number | null, fallback = 0): number {
    return Number.isFinite(v as number) ? (v as number) : fallback;
}

function pctStr(price?: number | null, entry?: number | null): string {
    const r = pctReturn(price, entry);
    if (r == null) return '';
    return `${r > 0 ? '+' : ''}${r}%`;
}

// ── SignalLadder ──────────────────────────────────────────────────────────────
function LadderNode({ label, variant, pct }: { label: string; variant: DotVariant; pct: number }) {
    const isLive = variant === 'live';
    return (
        <div className="absolute -translate-x-1/2" style={{ left: `${pct}%` }}>
            <div className={`w-3 h-3 rounded-full border-2 border-white mx-auto ${DOT_CLS[variant]} ${isLive ? 'animate-pulse' : ''}`} />
            <div className={`text-center mt-1 text-[10px] font-bold whitespace-nowrap ${LABEL_CLS[variant]}`}>{label}</div>
        </div>
    );
}

function SignalLadder({ ladder }: { ladder: LadderProps }) {
    const entry = safeNum(ladder.entry, safeNum(ladder.cmp));
    const cmp = safeNum(ladder.cmp, entry);
    const sl = safeNum(ladder.stopLoss) > 0 ? safeNum(ladder.stopLoss) : entry * 0.96;
    const tp1 = safeNum(ladder.tp1) > 0 ? safeNum(ladder.tp1) : entry * 1.03;
    const tp2 = safeNum(ladder.tp2) > 0 ? safeNum(ladder.tp2) : entry * 1.06;
    const tp3 = safeNum(ladder.tp3) > 0 ? safeNum(ladder.tp3) : entry * 1.10;

    const nodes: Array<{ price: number; label: string; variant: DotVariant }> = [
        { price: sl, label: LABEL_SL, variant: 'danger' },
        { price: entry, label: LABEL_ENTRY, variant: 'entry' },
        { price: cmp, label: LABEL_CMP, variant: 'live' },
        { price: tp1, label: LABEL_TP1, variant: 'tp' },
        { price: tp2, label: LABEL_TP2, variant: 'tp' },
        { price: tp3, label: LABEL_TP3, variant: 'tp-hi' },
    ];

    const prices = nodes.map(n => n.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = (max - min) || 1;
    const toPct = (v: number) => ((v - min) / range) * 100;

    return (
        <div className="px-6 pt-4 pb-10 bg-slate-50/50 dark:bg-card rounded-2xl border border-border dark:border-slate-800/50">
            <div className="text-[10px] font-bold text-slate-400 mb-3 tracking-wider">Price ladder</div>
            <div className="relative h-8">
                <div className="absolute left-0 right-0 h-0.5 bg-slate-100 dark:bg-slate-800 rounded-full top-3" />
                <div className="absolute h-0.5 bg-rose-200 rounded-full top-3"
                    style={{ left: `${Math.min(toPct(sl), toPct(entry))}%`, width: `${Math.abs(toPct(entry) - toPct(sl))}%` }} />
                <div className="absolute h-0.5 bg-emerald-200 rounded-full top-3"
                    style={{ left: `${Math.min(toPct(entry), toPct(tp3))}%`, width: `${Math.abs(toPct(tp3) - toPct(entry))}%` }} />
                {nodes.map(n => (
                    <LadderNode key={n.label} label={n.label} variant={n.variant} pct={toPct(n.price)} />
                ))}
            </div>
        </div>
    );
}

// ── ConfluenceCard ────────────────────────────────────────────────────────────
function ConfluenceCard({ signals, direction }: { signals: TickerAnalysisData['generatedSignals']; direction: string }) {
    if (!signals.length) return null;
    const { agree, total } = computeConfluence(signals, direction);
    const highConviction = agree >= 2;

    return (
        <div className="p-4 rounded-2xl border border-border dark:border-slate-800 bg-white dark:bg-card">
            <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-bold text-slate-500 tracking-wider">Signal confluence</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${highConviction ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>
                    {agree} / {total} agree
                </span>
            </div>
            <div className="space-y-1.5">
                {signals.map((sig, i) => {
                    const agrees = sig.signal === direction;
                    return (
                        <div key={`${sig.source}-${sig.signal_tier}-${i}`} className={`flex items-center justify-between px-3 py-2 rounded-xl border ${agrees ? 'bg-emerald-50/50 border-emerald-100 dark:bg-emerald-950/10 dark:border-emerald-900/30' : 'bg-slate-50/50 border-border dark:bg-slate-800/30 dark:border-slate-800/50'}`}>
                            <div className="flex items-center gap-2 min-w-0">
                                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${agrees ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{sig.source}</span>
                                {sig.signal_tier && <span className="text-[9px] text-slate-400 font-medium hidden sm:inline">{sig.signal_tier}</span>}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${sig.signal === 'BUY' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400'}`}>{sig.signal}</span>
                                <div className="w-10 h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full ${agrees ? 'bg-emerald-400' : 'bg-slate-300 dark:bg-slate-600'}`} style={{ width: `${Math.min(sig.strength, 100)}%` }} />
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ── FlowCard ──────────────────────────────────────────────────────────────────
function FlowCard({ accumulation }: { accumulation: NonNullable<TickerAnalysisData['accumulation']> }) {
    const isAccumulating = accumulation.netQty > 0;
    const label = isAccumulating ? 'Accumulating' : 'Distributing';
    const barCls = isAccumulating ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' : 'bg-gradient-to-r from-rose-400 to-rose-500';
    const textCls = isAccumulating ? 'text-emerald-500' : 'text-rose-500';

    return (
        <div className="p-4 bg-slate-50/50 dark:bg-card rounded-2xl border border-border dark:border-slate-800/50">
            <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-slate-400 tracking-wider">Institutional flow</span>
                <span className={`text-[10px] font-semibold tabular-nums ${textCls}`}>{label}</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800">
                <div className={`h-full rounded-full transition-all duration-700 ${barCls}`} style={{ width: `${accumulation.ratio}%` }} />
            </div>
            <div className="flex justify-between mt-1 text-[9px] font-bold text-slate-400">
                <span>{accumulation.ratio}% buy pressure</span>
                <span>{accumulation.netQty.toLocaleString()} net qty</span>
            </div>
        </div>
    );
}

// ── TargetsCard ───────────────────────────────────────────────────────────────
function TargetsCard({ ladder }: { ladder: LadderProps }) {
    const entry = ladder.entry;
    const targets = [
        { label: LABEL_TP1, price: ladder.tp1, cls: 'text-emerald-500', dotCls: 'bg-emerald-500' },
        { label: LABEL_TP2, price: ladder.tp2, cls: 'text-indigo-500', dotCls: 'bg-indigo-500' },
        { label: LABEL_TP3, price: ladder.tp3, cls: 'text-sky-500', dotCls: 'bg-sky-500' },
    ].filter(t => t.price != null && safeNum(t.price) > 0);

    if (!targets.length) return null;

    return (
        <div className="p-4 bg-slate-50/50 dark:bg-card rounded-2xl border border-border dark:border-slate-800/50">
            <div className="text-[10px] font-bold text-slate-400 tracking-wider mb-3">Trade targets</div>
            <div className="grid grid-cols-3 gap-2">
                {targets.map(t => (
                    <div key={t.label} className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                            <div className={`w-1.5 h-1.5 rounded-full ${t.dotCls}`} />
                            <span className="text-[10px] font-semibold text-slate-400 opacity-60">{t.label}</span>
                        </div>
                        <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-100 tabular-nums">{formatRupees(safeNum(t.price))}</div>
                        <div className={`text-[9px] font-bold ${t.cls}`}>{pctStr(t.price, entry)}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── FibonacciCard ─────────────────────────────────────────────────────────────
function FibonacciCard({ fibonacci }: { fibonacci: NonNullable<TickerAnalysisData['fibonacci']> }) {
    const trendCls = fibonacci.trend === 'UPTREND' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600';

    return (
        <div className="p-4 bg-slate-50/50 dark:bg-card rounded-2xl border border-border dark:border-slate-800/50">
            <div className="flex items-center justify-between mb-3 text-[10px] font-semibold text-slate-400 tracking-wider">
                <span>Fibonacci levels</span>
                <span className={`px-1.5 py-0.5 rounded capitalize ${trendCls}`}>{fibonacci.trend.toLowerCase()}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
                {fibonacci.nearestSupport > 0 && (
                    <div className="p-2 bg-rose-50/30 dark:bg-rose-950/10 rounded-xl">
                        <div className="text-[9px] text-rose-400 font-bold">Support</div>
                        <div className="text-[11px] font-semibold tabular-nums text-rose-600 dark:text-rose-400">{formatRupees(fibonacci.nearestSupport)}</div>
                    </div>
                )}
                {fibonacci.nearestResistance > 0 && (
                    <div className="p-2 bg-emerald-50/30 dark:bg-emerald-950/10 rounded-xl">
                        <div className="text-[9px] text-emerald-500 font-bold">Resistance</div>
                        <div className="text-[11px] font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{formatRupees(fibonacci.nearestResistance)}</div>
                    </div>
                )}
            </div>
            {fibonacci.levels.length > 0 && (
                <div className="border border-border dark:border-slate-800 rounded-2xl overflow-hidden">
                    {fibonacci.levels.map((lv, i) => (
                        <div key={`${lv.ratio}-${lv.price}`} className={`flex items-center justify-between px-3 py-1.5 text-xs ${i > 0 ? 'border-t border-border dark:border-slate-800' : ''} ${!lv.is_above ? 'bg-rose-50/30 dark:bg-rose-950/10' : ''}`}>
                            <div className="flex items-center gap-2">
                                <div className={`w-1.5 h-1.5 rounded-full ${lv.is_above ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                                <span className="text-slate-400 font-medium">{lv.ratio != null ? `${(lv.ratio * 100).toFixed(1)}%` : '—'}</span>
                            </div>
                            <span className="font-bold tabular-nums text-slate-700 dark:text-slate-200">{formatRupees(lv.price)}</span>
                            {lv.distance_pct != null && (
                                <span className={`tabular-nums font-semibold ${lv.is_above ? 'text-emerald-500' : 'text-rose-500'}`}>
                                    {lv.is_above ? '+' : ''}{lv.distance_pct.toFixed(1)}%
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── PivotCluster ──────────────────────────────────────────────────────────────
function PivotCluster({ technicals }: { technicals: TickerAnalysisData['technicals'] }) {
    const pivotP = safeNum(technicals.pivotP);
    if (!pivotP) return null;

    const pivots = [
        { label: 'S1', val: safeNum(technicals.pivotS1), color: 'bg-rose-400' },
        { label: 'P', val: pivotP, color: 'bg-amber-400' },
        { label: 'R1', val: safeNum(technicals.pivotR1), color: 'bg-emerald-400' },
    ];

    return (
        <div className="p-4 bg-slate-50/50 dark:bg-card rounded-2xl border border-border dark:border-slate-800/50">
            <div className="text-[10px] font-semibold text-slate-400 tracking-wider mb-3">Pivot cluster</div>
            <div className="flex gap-1">
                {pivots.map(p => (
                    <div key={p.label} className="flex-1 text-center p-1.5 rounded-xl bg-white dark:bg-card border border-border dark:border-slate-800/40">
                        <div className={`w-1.5 h-1.5 rounded-full mx-auto mb-0.5 ${p.color}`} />
                        <div className="text-[8px] font-semibold mb-0.5 opacity-60">{p.label}</div>
                        <div className="text-[10px] font-semibold text-slate-700 dark:text-slate-200 tabular-nums">{p.val.toLocaleString()}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── VolatilityMini ────────────────────────────────────────────────────────────
function VolatilityMini({ technicals }: { technicals: TickerAnalysisData['technicals'] }) {
    const atr = safeNum(technicals.atr);
    const adx = safeNum(technicals.adx);
    const isStrong = adx > 30;

    return (
        <div className="grid grid-cols-2 gap-2">
            <div className="p-3 bg-slate-50/50 dark:bg-card rounded-2xl border border-border dark:border-slate-800/50">
                <div className="text-[9px] font-semibold text-slate-400 tracking-tighter mb-1">ATR (14)</div>
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 tabular-nums">{atr.toFixed(1)}</div>
            </div>
            <div className="p-3 bg-slate-50/50 dark:bg-card rounded-2xl border border-border dark:border-slate-800/50">
                <div className="text-[9px] font-semibold text-slate-400 tracking-tighter mb-1">Trend strength</div>
                <div className={`text-xs font-semibold ${isStrong ? 'text-emerald-500' : 'text-slate-400'}`}>{isStrong ? 'Strong' : 'Ranging'}</div>
            </div>
        </div>
    );
}

// ── HistoryList ───────────────────────────────────────────────────────────────
function HistoryList({ history }: { history: TickerAnalysisData['history'] }) {
    const filtered = history.filter(h => h.signal === 'BUY' || h.signal === 'SELL').slice(0, 5);
    if (!filtered.length) return null;

    return (
        <div className="flex flex-col gap-2">
            <div className="text-[10px] font-semibold text-slate-400 tracking-wider px-1">Signal history</div>
            {filtered.map((h) => {
                const isBuy = h.signal === 'BUY';
                return (
                    <div key={`${h.date}-${h.strategy_name}`} className="p-3 bg-white dark:bg-card rounded-2xl border border-border dark:border-slate-800/50 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-bold ${isBuy ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-500' : 'bg-rose-50 dark:bg-rose-900/20 text-rose-500'}`}>
                                {isBuy ? '▲' : '▼'}
                            </div>
                            <div className="min-w-0">
                                <div className="text-[11px] font-bold text-slate-700 dark:text-slate-200 truncate">{h.strategy_name}</div>
                                <div className="text-[9px] text-slate-400 font-medium tabular-nums">{h.date}</div>
                            </div>
                        </div>
                        <div className="text-[10px] font-semibold tabular-nums text-slate-800 dark:text-slate-100">{formatRupees(Number(h.last_close))}</div>
                    </div>
                );
            })}
        </div>
    );
}

// ── SignalsSection ────────────────────────────────────────────────────────────
export function SignalsSection({ data, ladder }: SignalsSectionProps) {
    return (
        <div className="flex flex-col gap-4">
            <SignalLadder ladder={ladder} />
            <ConfluenceCard signals={data.generatedSignals} direction={ladder.direction} />
            {data.accumulation && <FlowCard accumulation={data.accumulation} />}
            <TargetsCard ladder={ladder} />
            {data.fibonacci && <FibonacciCard fibonacci={data.fibonacci} />}
            <PivotCluster technicals={data.technicals} />
            <VolatilityMini technicals={data.technicals} />
            <HistoryList history={data.history} />
        </div>
    );
}
