'use client';

import type { TickerAnalysisData } from '@/hooks/useTickerAnalysis';
import { formatNepaliNumber, formatRupees } from '@/lib/formatters';
import { computeTechnicalBias } from '@/lib/tickerAnalysis';
import { cn } from '@/lib/utils';

// ── Constants ──────────────────────────────────────────────────────────────────
const NA = 'N/A';

// ── Helpers ────────────────────────────────────────────────────────────────────
function n(v: number | null | undefined): number { return v ?? 0; }
function fmt(v: number | null | undefined, dp = 1): string {
    if (v == null) return NA;
    return v.toFixed(dp);
}

// ── Sub-components ─────────────────────────────────────────────────────────────
interface OscGaugeProps {
    label: string;
    value: number | null;
    min: number;
    max: number;
    oversold: number;
    overbought: number;
    invert?: boolean;
}

function OscGauge({ label, value, min, max, oversold, overbought, invert }: OscGaugeProps) {
    const val = value ?? 0;
    const range = max - min;
    const pct = range > 0 ? Math.min(Math.max(((val - min) / range) * 100, 2), 98) : 50;
    const isOS = invert ? val > overbought : val < oversold;
    const isOB = invert ? val < oversold : val > overbought;
    const dotColor = isOS ? 'bg-emerald-500' : isOB ? 'bg-rose-500' : 'bg-slate-500 dark:bg-slate-300';
    const valColor = isOS ? 'text-emerald-500' : isOB ? 'text-rose-500' : 'text-slate-700 dark:text-slate-200';
    return (
        <div className="p-3 bg-white dark:bg-card rounded-2xl border border-border dark:border-slate-800/60">
            <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-slate-400 tracking-wider">{label}</span>
                <span className={cn('text-xs font-semibold tabular-nums', valColor)}>{fmt(value)}</span>
            </div>
            <div className="relative h-1.5 bg-gradient-to-r from-emerald-200 via-slate-100 to-rose-200 dark:from-emerald-900/40 dark:via-slate-700 dark:to-rose-900/40 rounded-full overflow-visible">
                <div className={cn('absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white dark:border-slate-800 shadow', dotColor)}
                    style={{ left: `calc(${pct}% - 6px)` }} />
            </div>
            <div className="flex justify-between mt-1.5 text-[9px] font-bold text-slate-300 dark:text-slate-600">
                <span>{invert ? 'OB' : 'OS'}</span>
                <span className={cn('text-[10px]', isOS ? 'text-emerald-500' : isOB ? 'text-rose-500' : 'text-slate-400')}>
                    {isOS ? 'Oversold' : isOB ? 'Overbought' : 'Neutral'}
                </span>
                <span>{invert ? 'OS' : 'OB'}</span>
            </div>
        </div>
    );
}

interface MomentumGridProps {
    t: TickerAnalysisData['technicals'];
    rsi: number | null;
    roc: number | null;
}

function MomentumGrid({ t, rsi, roc }: MomentumGridProps) {
    const rocVal = roc ?? 0;
    return (
        <div className="lg:col-span-8 bg-white dark:bg-card rounded-xl border border-border dark:border-slate-800/60 p-5">
            <div className="text-[10px] font-semibold text-slate-400 tracking-wider mb-4">Momentum oscillators</div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                <OscGauge label="RSI" value={rsi} min={0} max={100} oversold={30} overbought={70} />
                <OscGauge label="Stoch %K" value={t.stochK} min={0} max={100} oversold={20} overbought={80} />
                <OscGauge label="CCI" value={t.cci} min={-200} max={200} oversold={-100} overbought={100} />
                <OscGauge label="MFI" value={t.mfi} min={0} max={100} oversold={20} overbought={80} />
                <OscGauge label="Williams %R" value={t.williamsR} min={-100} max={0} oversold={-80} overbought={-20} invert />
                {t.ultimateOsc != null && (
                    <OscGauge label="Ultimate osc" value={t.ultimateOsc} min={0} max={100} oversold={30} overbought={70} />
                )}
                <RocCard roc={rocVal} />
                <StochDCard value={t.stochD} />
            </div>
        </div>
    );
}

function RocCard({ roc }: { roc: number }) {
    return (
        <div className="p-3 bg-slate-50/50 dark:bg-slate-800/40 rounded-2xl flex flex-col justify-center border border-border dark:border-slate-800/50">
            <div className="text-[9px] font-semibold text-slate-400 mb-1">ROC (14)</div>
            <div className={cn('text-sm font-semibold tabular-nums', roc > 0 ? 'text-emerald-500' : 'text-rose-500')}>
                {roc > 0 ? '+' : ''}{roc.toFixed(1)}%
            </div>
        </div>
    );
}

function StochDCard({ value }: { value: number | null }) {
    return (
        <div className="p-3 bg-slate-50/50 dark:bg-slate-800/40 rounded-2xl flex flex-col justify-center border border-border dark:border-slate-800/50">
            <div className="text-[9px] font-semibold text-slate-400 mb-1">Stoch %D</div>
            <div className="text-sm font-semibold tabular-nums text-slate-700 dark:text-slate-200">{fmt(value)}</div>
        </div>
    );
}

interface TrendCardProps {
    macd: number | null;
    macdSignal: number | null;
    macdHist: number | null;
    adx: number | null;
    sma50: number | null;
    sma200: number | null;
    psar: number | null;
    aroonUp: number | null;
    aroonDown: number | null;
    cmp: number | null;
}

function TrendCard({ macd, macdSignal, macdHist, adx, sma50, sma200, psar, aroonUp, aroonDown, cmp }: TrendCardProps) {
    const macdVal = n(macd);
    const macdSig = n(macdSignal);
    const crossover = macdVal > macdSig ? 'Bullish' : macdVal < macdSig ? 'Bearish' : 'Neutral';
    const crossColor = crossover === 'Bullish' ? 'bg-emerald-50/50 text-emerald-600 border-emerald-100' : 'bg-rose-50/50 text-rose-500 border-rose-100';
    const smaLabel = sma50 == null || sma200 == null ? NA : n(sma50) > n(sma200) ? 'Golden cross' : 'Death cross';
    const smaColor = sma50 == null || sma200 == null ? 'text-slate-400' : n(sma50) > n(sma200) ? 'text-emerald-500' : 'text-rose-500';
    return (
        <div className="bg-white dark:bg-card rounded-xl border border-border dark:border-slate-800/60 p-5">
            <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-semibold text-slate-400 tracking-wider">Trend intelligence</span>
                <div className={cn('text-[9px] font-semibold px-1.5 py-0.5 rounded-lg border', crossColor)}>MACD: {crossover}</div>
            </div>
            <div className="space-y-3">
                <MacdRow macdVal={macdVal} macdSig={macdSig} macdHist={macdHist} />
                <div className="space-y-2">
                    <TrendRow label="ADX strength" value={`${fmt(adx)} (${n(adx) > 25 ? 'Strong' : 'Weak'})`} color={n(adx) > 25 ? 'text-emerald-500' : 'text-slate-400'} />
                    <TrendRow label="SMA structure" value={smaLabel} color={smaColor} />
                    {psar != null && (
                        <TrendRow label="Parabolic SAR" value={n(cmp) > n(psar) ? 'Bullish' : 'Bearish'} color={n(cmp) > n(psar) ? 'text-emerald-500' : 'text-rose-500'} />
                    )}
                    {aroonUp != null && (
                        <TrendRow label="Aroon bias" value={n(aroonUp) > n(aroonDown) ? 'Bullish' : 'Bearish'} color={n(aroonUp) > n(aroonDown) ? 'text-emerald-500' : 'text-rose-500'} />
                    )}
                </div>
            </div>
        </div>
    );
}

function MacdRow({ macdVal, macdSig, macdHist }: { macdVal: number; macdSig: number; macdHist: number | null }) {
    return (
        <div className="p-3 bg-slate-50/50 dark:bg-slate-800/40 rounded-2xl border border-border dark:border-slate-800/50">
            <div className="grid grid-cols-3 divide-x divide-slate-200 dark:divide-slate-700">
                <div className="px-2">
                    <div className="text-[8px] font-semibold text-slate-400 mb-1">MACD</div>
                    <div className={cn('text-[11px] font-semibold tabular-nums', macdVal > 0 ? 'text-emerald-500' : 'text-rose-500')}>{macdVal.toFixed(2)}</div>
                </div>
                <div className="px-2">
                    <div className="text-[8px] font-semibold text-slate-400 mb-1">Signal</div>
                    <div className="text-[11px] font-semibold tabular-nums text-slate-700 dark:text-slate-200">{macdSig.toFixed(2)}</div>
                </div>
                <div className="px-2">
                    <div className="text-[8px] font-semibold text-slate-400 mb-1">Hist</div>
                    <div className={cn('text-[11px] font-semibold tabular-nums', n(macdHist) > 0 ? 'text-emerald-500' : 'text-rose-500')}>{fmt(macdHist, 2)}</div>
                </div>
            </div>
        </div>
    );
}

function TrendRow({ label, value, color }: { label: string; value: string; color: string }) {
    return (
        <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-bold text-slate-500">{label}</span>
            <span className={cn('text-[10px] font-semibold', color)}>{value}</span>
        </div>
    );
}

interface VolumeCardProps {
    cmf: number | null;
    obv: number | null;
    cmp: number | null;
    vwap: number | null;
}

function VolumeCard({ cmf, obv, cmp, vwap }: VolumeCardProps) {
    const cmfVal = n(cmf);
    const cmfColor = cmfVal > 0 ? 'text-emerald-500' : 'text-rose-500';
    const cmfBarColor = cmfVal > 0 ? 'bg-emerald-500' : 'bg-rose-500';
    const vwapDist = n(vwap) > 0 ? ((n(cmp) - n(vwap)) / n(vwap)) * 100 : 0;
    const vwapColor = n(cmp) > n(vwap) ? 'text-emerald-500' : 'text-rose-500';
    const obvLabel = obv == null ? NA : formatNepaliNumber(Math.round(obv));
    return (
        <div className="bg-white dark:bg-card rounded-xl border border-border dark:border-slate-800/60 p-5">
            <div className="text-[10px] font-semibold text-slate-400 tracking-wider mb-4">Volume pressure</div>
            <div className="space-y-4">
                <div className="p-4 bg-slate-50/50 dark:bg-slate-800/40 rounded-2xl border border-border dark:border-slate-800/50">
                    <div className="text-[9px] font-semibold text-slate-400 mb-2">Chaikin money flow (CMF)</div>
                    <div className={cn('text-2xl font-semibold tabular-nums', cmfColor)}>{cmfVal > 0 ? '+' : ''}{cmfVal.toFixed(3)}</div>
                    <div className="h-1.5 mt-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div className={cn('h-full transition-all', cmfBarColor)} style={{ width: `${Math.min(Math.abs(cmfVal) * 200, 100)}%` }} />
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-slate-50/50 dark:bg-slate-800/40 rounded-2xl border border-border dark:border-slate-800/50">
                        <div className="text-[9px] font-semibold text-slate-400 mb-1 text-center">OBV</div>
                        <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 text-center tabular-nums">{obvLabel}</div>
                    </div>
                    <div className="p-3 bg-slate-50/50 dark:bg-slate-800/40 rounded-2xl border border-border dark:border-slate-800/50">
                        <div className="text-[9px] font-semibold text-slate-400 mb-1 text-center">VWAP dist</div>
                        <div className={cn('text-xs font-semibold text-center tabular-nums', vwapColor)}>
                            {n(cmp) > n(vwap) ? '+' : ''}{vwapDist.toFixed(2)}%
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

interface VolatilityCardProps {
    atr: number | null;
    cmp: number | null;
    bbp: number | null;
}

function VolatilityCard({ atr, cmp, bbp }: VolatilityCardProps) {
    const atrVal = n(atr);
    const cmpVal = n(cmp);
    const bbpVal = n(bbp);
    const dailyRangePct = cmpVal > 0 ? (atrVal / cmpVal) * 100 : 0;
    const bbPosition = Math.min(Math.max(bbpVal * 100, 2), 97);
    return (
        <div className="bg-white dark:bg-card rounded-xl border border-border dark:border-slate-800/60 p-5">
            <div className="text-[10px] font-semibold text-slate-400 tracking-wider mb-4">Volatility &amp; channels</div>
            <div className="space-y-3">
                <div className="p-4 bg-slate-50/50 dark:bg-slate-800/40 rounded-2xl border border-border dark:border-slate-800/50">
                    <div className="text-[9px] font-semibold text-slate-400 mb-1 text-center">ATR (14) volatility</div>
                    <div className="text-2xl font-semibold text-slate-800 dark:text-slate-100 text-center tabular-nums">
                        {atr == null ? NA : formatRupees(atrVal, 1)}
                    </div>
                    <div className="text-[10px] text-center font-bold text-slate-400 mt-0.5">{dailyRangePct.toFixed(1)}% daily range</div>
                </div>
                <div className="p-3 bg-slate-50/50 dark:bg-slate-800/40 rounded-2xl border border-border dark:border-slate-800/50">
                    <div className="text-[9px] font-semibold text-slate-400 mb-2">Bollinger position (%B)</div>
                    <div className="relative h-2 bg-gradient-to-r from-rose-200 via-slate-100 to-emerald-200 dark:from-rose-900/40 dark:via-slate-700 dark:to-rose-900/40 rounded-full overflow-visible">
                        <div className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white dark:bg-slate-200 rounded-full border-2 border-primary shadow-lg"
                            style={{ left: `calc(${bbPosition}% - 8px)` }} />
                    </div>
                    <div className="flex justify-between mt-2 text-[10px] font-semibold tabular-nums text-slate-500">
                        <span>LB</span>
                        <span className="text-primary">{(bbpVal * 100).toFixed(1)}%</span>
                        <span>UB</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

interface BiasHeroProps {
    rating: string;
    bull: number;
    bear: number;
    neutral: number;
    total: number;
}

function BiasHero({ rating, bull, bear, neutral, total }: BiasHeroProps) {
    const ratingColor = rating.includes('Buy') ? 'text-emerald-500' : rating.includes('Sell') ? 'text-rose-500' : 'text-slate-400';
    const conviction = rating.includes('Strong') ? 'High conviction' : 'Avg conviction';
    const convClass = rating.includes('Buy')
        ? 'bg-emerald-50/50 text-emerald-600 border-emerald-100'
        : rating.includes('Sell')
            ? 'bg-rose-50/50 text-rose-500 border-rose-100'
            : 'bg-slate-50 text-slate-400 border-border';
    return (
        <div className="lg:col-span-4 bg-white dark:bg-card rounded-xl border border-border dark:border-slate-800/60 p-5 flex flex-col justify-between">
            <div className="mb-4">
                <div className="text-[10px] font-semibold text-slate-400 tracking-wider mb-1">Technical bias</div>
                <div className={cn('text-3xl font-semibold tracking-tighter', ratingColor)}>{rating}</div>
                <div className="text-[11px] font-bold text-slate-400 mt-1 opacity-70">Aggregate of {total} indicators</div>
            </div>
            <div className="space-y-3">
                <div className="flex h-1.5 rounded-full overflow-hidden gap-0.5">
                    <div className="bg-emerald-500 rounded-full transition-all" style={{ width: `${(bull / total) * 100}%` }} />
                    <div className="bg-slate-200 dark:bg-slate-700 rounded-full transition-all" style={{ width: `${(neutral / total) * 100}%` }} />
                    <div className="bg-rose-500 rounded-full transition-all" style={{ width: `${(bear / total) * 100}%` }} />
                </div>
                <div className="flex justify-between items-end">
                    <div className="flex items-center gap-3">
                        <ScoreLabel count={bull} label="Buy" color="text-emerald-500" />
                        <ScoreLabel count={neutral} label="Neu" color="text-slate-400" />
                        <ScoreLabel count={bear} label="Sell" color="text-rose-500" />
                    </div>
                    <div className={cn('px-2 py-1 rounded-xl text-[10px] font-semibold border', convClass)}>{conviction}</div>
                </div>
            </div>
        </div>
    );
}

function ScoreLabel({ count, label, color }: { count: number; label: string; color: string }) {
    return (
        <div className="text-center">
            <div className={cn('text-[14px] font-semibold', color)}>{count}</div>
            <div className="text-[8px] font-semibold text-slate-400">{label}</div>
        </div>
    );
}

// ── Public component ───────────────────────────────────────────────────────────
export function TechnicalsSection({ data }: { data: TickerAnalysisData }) {
    const { live, technicals: t, price } = data;
    const bias = computeTechnicalBias({
        rsi: live.rsi, macd: live.macd, macdSignal: live.macdSignal, stochK: t.stochK,
        cci: t.cci, williamsR: t.williamsR, mfi: t.mfi, roc: live.roc,
        adx: t.adx, trend5d: live.trend5d, sma50: t.sma50, sma200: t.sma200,
        cmf: t.cmf, cmp: price.cmp,
    });
    return (
        <div className="h-full w-full flex flex-col gap-4 p-4 bg-slate-50/10 dark:bg-slate-950/20">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0">
                <BiasHero rating={bias.rating} bull={bias.bull} bear={bias.bear} neutral={bias.neutral} total={bias.total} />
                <MomentumGrid t={t} rsi={live.rsi} roc={live.roc} />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0">
                <TrendCard macd={live.macd} macdSignal={live.macdSignal} macdHist={live.macdHist}
                    adx={t.adx} sma50={t.sma50} sma200={t.sma200} psar={t.psar}
                    aroonUp={t.aroonUp} aroonDown={t.aroonDown} cmp={price.cmp} />
                <VolumeCard cmf={t.cmf} obv={t.obv} cmp={price.cmp} vwap={t.vwap} />
                <VolatilityCard atr={t.atr} cmp={price.cmp} bbp={t.bbp} />
            </div>
        </div>
    );
}
