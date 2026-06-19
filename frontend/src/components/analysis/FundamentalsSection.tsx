'use client';

import type { TickerAnalysisData } from '@/hooks/useTickerAnalysis';
import { computeHealthScore } from '@/lib/tickerAnalysis';
import { cn } from '@/lib/utils';

// ── Constants ──────────────────────────────────────────────────────────────────
const NA = 'N/A';
const DEBT_THRESHOLD = 1.5;
const ROE_GOOD = 12;
const ROE_EQUITY = 10;
const PE_VALUE = 30;

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmt(v: number | null | undefined, dp = 1): string {
    if (v == null) return NA;
    return v.toFixed(dp);
}

function headlineLabel(pe: number | null, eps: number | null): string {
    if (pe != null && pe > 0 && pe < PE_VALUE) return 'Quality value';
    if (pe != null && pe >= PE_VALUE) return 'Growth premium';
    if (eps != null && eps > 0) return 'Stable core';
    return 'Neutral outlook';
}

function verdictLabel(pe: number | null, roe: number | null): string {
    return pe != null && pe > 0 && roe != null && roe > ROE_GOOD ? 'Accumulate' : 'Monitor';
}

// ── Intelligence hero ──────────────────────────────────────────────────────────
interface HeroProps { pe: number | null; eps: number | null; roe: number | null; de: number | null }

function IntelligenceHero({ pe, eps, roe, de }: HeroProps) {
    const verdict = verdictLabel(pe, roe);
    const isValue = pe != null && pe < 20;
    const highRoe = roe != null && roe > 15;
    const lowDe = de != null && de < 1.2;
    const posEps = eps != null && eps > 0;

    return (
        <div className="md:col-span-8 p-6 rounded-2xl bg-primary text-primary-foreground relative overflow-hidden shadow-sm shadow-primary/20 dark:shadow-none">
            <div className="relative z-10">
                <p className="text-[10px] font-semibold tracking-[0.2em] mb-6 opacity-80">
                    Fundamental intelligence
                </p>
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <HeroBody isValue={isValue} highRoe={highRoe} lowDe={lowDe} posEps={posEps} roe={roe} de={de} pe={pe} />
                    <VerdictBadge verdict={verdict} />
                </div>
            </div>
            <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
        </div>
    );
}

interface HeroBodyProps { isValue: boolean; highRoe: boolean; lowDe: boolean; posEps: boolean; roe: number | null; de: number | null; pe: number | null }

function HeroBody({ isValue, highRoe, lowDe, posEps, roe, de, pe }: HeroBodyProps) {
    const headline = headlineLabel(pe, null);
    return (
        <div>
            <h2 className="text-3xl font-semibold tracking-tighter mb-2">{headline}</h2>
            <div className="flex items-center gap-4 mb-3">
                <span className="px-3 py-1 rounded-full bg-white/10 border border-white/20 text-[10px] font-semibold">
                    ROE: {fmt(roe, 1)}%
                </span>
                <span className="px-3 py-1 rounded-full bg-white/10 border border-white/20 text-[10px] font-semibold">
                    D/E: {fmt(de, 1)}
                </span>
            </div>
            <p className="text-[13px] font-medium text-white/75 max-w-lg leading-relaxed">
                A <span className="text-white font-bold">{isValue ? 'value-oriented' : 'growth-centric'}</span> profile
                with {highRoe ? 'top-tier' : 'stable'} return on equity of {fmt(roe, 1)}%
                and {lowDe ? 'conservative' : 'managed'} debt.
                The fundamental core is {posEps ? 'highly resilient' : 'under evaluation'}.
            </p>
        </div>
    );
}

function VerdictBadge({ verdict }: { verdict: string }) {
    return (
        <div className="px-5 py-3 rounded-[1.5rem] bg-white text-primary shadow-xl shadow-primary/20 shrink-0">
            <div className="text-[9px] font-semibold opacity-60 mb-0.5 whitespace-nowrap tracking-wide">
                Strategic verdict
            </div>
            <div className="text-xl font-semibold">{verdict}</div>
        </div>
    );
}

// ── Health donut ───────────────────────────────────────────────────────────────
function HealthDonut({ roe, pe, de }: { roe: number | null; pe: number | null; de: number | null }) {
    const score = computeHealthScore(roe, pe, de);
    const dash = `${Math.min(100, score)}, 100`;

    return (
        <div className="md:col-span-4 p-6 rounded-2xl bg-white dark:bg-card border border-border dark:border-slate-800 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-semibold text-slate-400 tracking-wider">Financial health</span>
            </div>
            <div className="flex-1 flex flex-col justify-center items-center py-4">
                <div className="relative w-24 h-24">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                        <path className="stroke-slate-100 dark:stroke-slate-800" strokeWidth="3" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                        <path className="stroke-emerald-500 transition-all duration-1000" strokeWidth="3" strokeDasharray={dash} strokeLinecap="round" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-2xl font-semibold text-slate-800 dark:text-slate-100">{score}</span>
                        <span className="text-[8px] font-semibold text-slate-400">Score</span>
                    </div>
                </div>
            </div>
            <div className="text-center text-[10px] font-bold text-slate-400">Based on 12 fundamental check-points</div>
        </div>
    );
}

// ── Metric row ──────────────────────────────────────────────────────────────────
interface MetricRowProps { label: string; sub: string; val: string; cls: string }

function MetricRow({ label, sub, val, cls }: MetricRowProps) {
    return (
        <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50/50 dark:bg-slate-800/30 border border-border/50 dark:border-slate-800/50">
            <div>
                <div className="text-[10px] font-semibold text-slate-400 tracking-tight">{label}</div>
                <div className="text-[9px] font-bold opacity-60">{sub}</div>
            </div>
            <div className={cn('px-2.5 py-1 rounded-xl text-xs font-semibold tabular-nums', cls)}>{val}</div>
        </div>
    );
}

// ── Valuation matrix ───────────────────────────────────────────────────────────
interface ValuationProps { pe: number | null; pb: number | null; eps: number | null; divYield: number | null }

function ValuationMatrix({ pe, pb, eps, divYield }: ValuationProps) {
    const rows: MetricRowProps[] = [
        { label: 'P/E ratio', sub: pe != null && pe < 25 ? 'Fairly valued' : 'Premium', val: pe != null ? `${fmt(pe, 1)}x` : NA, cls: pe != null && pe < 25 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500' },
        { label: 'P/B ratio', sub: 'Price/book', val: pb != null ? `${fmt(pb, 1)}x` : NA, cls: 'bg-slate-50 text-slate-600' },
        { label: 'EPS (TTM)', sub: 'Earnings power', val: eps != null ? `Rs.${fmt(eps, 1)}` : NA, cls: 'bg-slate-50 text-slate-600' },
        { label: 'Avg dividend', sub: 'Yield to price', val: divYield != null ? `${fmt(divYield, 1)}%` : NA, cls: 'bg-slate-50 text-slate-600' },
    ];
    return (
        <div className="bg-white dark:bg-card rounded-2xl border border-border dark:border-slate-800/60 overflow-hidden">
            <div className="p-6 border-b border-border dark:border-slate-800">
                <h3 className="text-xs font-semibold tracking-wider text-slate-800 dark:text-slate-100">Valuation matrix</h3>
                <p className="text-[10px] font-bold text-slate-400 tracking-tighter mt-1">Market pricing intelligence</p>
            </div>
            <div className="p-4 space-y-3">
                {rows.map(r => <MetricRow key={r.label} {...r} />)}
            </div>
        </div>
    );
}

// ── Efficiency hub ─────────────────────────────────────────────────────────────
interface EfficiencyProps { roe: number | null; de: number | null; yoy: number | null; qoq: number | null }

function EfficiencyHub({ roe, de, yoy, qoq }: EfficiencyProps) {
    const growthVal = (v: number | null) => v != null ? `${v > 0 ? '+' : ''}${fmt(v, 1)}%` : NA;
    const growthCls = (v: number | null) => v != null && v > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500';

    const rows: MetricRowProps[] = [
        { label: 'ROE', sub: roe != null && roe > 15 ? 'High efficiency' : 'Stable', val: roe != null ? `${fmt(roe, 1)}%` : NA, cls: roe != null && roe > 15 ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-600' },
        { label: 'Debt to equity', sub: de != null && de < DEBT_THRESHOLD ? 'Conservative' : 'Leveraged', val: de != null ? fmt(de, 2) : NA, cls: de != null && de < DEBT_THRESHOLD ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500' },
        { label: 'YoY growth', sub: 'Earnings momentum', val: growthVal(yoy), cls: growthCls(yoy) },
        { label: 'QoQ growth', sub: 'Quarterly speed', val: growthVal(qoq), cls: growthCls(qoq) },
    ];
    return (
        <div className="bg-white dark:bg-card rounded-2xl border border-border dark:border-slate-800/60 overflow-hidden">
            <div className="p-6 border-b border-border dark:border-slate-800">
                <h3 className="text-xs font-semibold tracking-wider text-slate-800 dark:text-slate-100">Efficiency hub</h3>
                <p className="text-[10px] font-bold text-slate-400 tracking-tighter mt-1">Operational competency</p>
            </div>
            <div className="p-4 space-y-3">
                {rows.map(r => <MetricRow key={r.label} {...r} />)}
            </div>
        </div>
    );
}

// ── Benchmark bar ──────────────────────────────────────────────────────────────
interface Indicator { name: string; value: string; sector_high: number; sector_low: number }

function BenchmarkBar({ ind }: { ind: Indicator }) {
    const val = Number(ind.value);
    const range = (ind.sector_high - ind.sector_low) || 1;
    const pct = Math.min(Math.max(((val - ind.sector_low) / range) * 100, 2), 98);
    return (
        <div>
            <div className="flex items-center justify-between mb-1.5 px-0.5">
                <span className="text-[9px] font-semibold text-slate-400">{ind.name}</span>
                <span className="text-[10px] font-semibold tabular-nums text-primary">{ind.value}</span>
            </div>
            <div className="relative h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className="absolute top-0 bottom-0 left-0 bg-primary/20" style={{ width: `${pct}%` }} />
                <div className="absolute top-0 bottom-0 w-1 bg-primary" style={{ left: `${pct}%` }} />
            </div>
        </div>
    );
}

// ── Market benchmarking ────────────────────────────────────────────────────────
function MarketBenchmarking({ indicators }: { indicators: Indicator[] }) {
    const top3 = indicators.slice(0, 3);
    return (
        <div className="flex-1 bg-white dark:bg-card rounded-2xl border border-border dark:border-slate-800/60 p-6">
            <h3 className="text-xs font-semibold tracking-wider text-slate-800 dark:text-slate-100 mb-4">Market benchmarking</h3>
            <div className="space-y-4">
                {top3.length > 0 ? top3.map(ind => <BenchmarkBar key={ind.name} ind={ind} />) : (
                    <div className="py-6 text-center">
                        <div className="text-[10px] font-semibold text-slate-300 tracking-wider">Sector benchmarking unavailable</div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Risk audit ─────────────────────────────────────────────────────────────────
interface RiskCheck { label: string; pass: boolean; val: string }

function RiskAuditItem({ label, pass, val }: RiskCheck) {
    return (
        <div className="p-3 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-between">
            <span className="text-[9px] font-semibold opacity-50">{label}</span>
            <span className={cn('text-[10px] font-semibold', pass ? 'text-emerald-400' : 'text-rose-400')}>{val}</span>
        </div>
    );
}

interface RiskAuditProps { de: number | null; divYield: number | null; roe: number | null; yoy: number | null }

function RiskAudit({ de, divYield, roe, yoy }: RiskAuditProps) {
    const checks: RiskCheck[] = [
        { label: 'Debt', pass: de != null && de < DEBT_THRESHOLD, val: de != null && de > 0 ? 'Safe' : NA },
        { label: 'Payout', pass: divYield != null && divYield > 0, val: divYield != null && divYield > 0 ? 'Paying' : NA },
        { label: 'Equity', pass: roe != null && roe > ROE_EQUITY, val: roe != null && roe > ROE_EQUITY ? 'Good' : 'Low' },
        { label: 'Growth', pass: yoy != null && yoy > 0, val: yoy != null && yoy > 0 ? 'Expand' : 'Stag' },
    ];
    return (
        <div className="bg-slate-900 rounded-2xl p-6 text-white overflow-hidden relative">
            <h3 className="text-xs font-semibold tracking-wider text-white/60 mb-4">Risk audit</h3>
            <div className="grid grid-cols-2 gap-3 relative z-10">
                {checks.map(c => <RiskAuditItem key={c.label} {...c} />)}
            </div>
            <div className="absolute bottom-0 right-0 translate-y-1/2 translate-x-1/2 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl" />
        </div>
    );
}

// ── Public export ──────────────────────────────────────────────────────────────
export function FundamentalsSection({ data }: { data: TickerAnalysisData }) {
    const f = data.fundamentals;
    return (
        <div className="space-y-6 pb-12">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                <IntelligenceHero pe={f.pe} eps={f.eps} roe={f.roe} de={f.debtEquity} />
                <HealthDonut roe={f.roe} pe={f.pe} de={f.debtEquity} />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <ValuationMatrix pe={f.pe} pb={f.priceToBook} eps={f.eps} divYield={f.divYield} />
                <EfficiencyHub roe={f.roe} de={f.debtEquity} yoy={f.yoyGrowth} qoq={f.qoqGrowth} />
                <div className="flex flex-col gap-6">
                    <MarketBenchmarking indicators={f.indicators} />
                    <RiskAudit de={f.debtEquity} divYield={f.divYield} roe={f.roe} yoy={f.yoyGrowth} />
                </div>
            </div>
        </div>
    );
}
