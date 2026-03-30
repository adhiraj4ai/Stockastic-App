'use client';

import { useState, useEffect, useMemo } from 'react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatRupees } from '@/lib/formatters';
import {
    Radar, Zap, Activity, TrendingUp, TrendingDown,
    ArrowUpRight, ArrowDownRight, BarChart3, Layers,
    Clock, Shield, Brain,
    CheckCircle2, AlertCircle, History,
    Eye, EyeOff
} from 'lucide-react';
import { StockLoader } from '@/components/ui/StockLoader';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface StrategySignal {
    id: number;
    strategy: number;
    strategy_name: string;
    strategy_description: string;
    symbol: string;
    date: string;
    signal: 'BUY' | 'SELL' | 'HOLD' | 'NEUTRAL';
    last_close: string;
    metadata: any;
}

interface GeneratedSignal {
    id: number;
    source: string;
    symbol: string;
    signal: 'BUY' | 'SELL';
    signal_tier: string;
    strength: number;
    ltp: string;
    rationale: string;
    metadata: any;
    generated_date: string;
}

const SOURCE_LABELS: Record<string, string> = {
    'SMART_MONEY': 'Smart Money',
    'BROKER_ACCUMULATION': 'Broker Accumulation',
    'SMART_CROSSOVER': 'Smart Crossover',
    'ICHIMOKU': 'Ichimoku Cloud',
};

const SOURCE_ICONS: Record<string, typeof Zap> = {
    'SMART_MONEY': Zap,
    'BROKER_ACCUMULATION': BarChart3,
    'SMART_CROSSOVER': Activity,
    'ICHIMOKU': Layers,
};

const SOURCE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    'SMART_MONEY': { bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-200 dark:border-amber-800/40' },
    'BROKER_ACCUMULATION': { bg: 'bg-blue-50 dark:bg-blue-900/20', text: 'text-blue-700 dark:text-blue-400', border: 'border-blue-200 dark:border-blue-800/40' },
    'SMART_CROSSOVER': { bg: 'bg-violet-50 dark:bg-violet-900/20', text: 'text-violet-700 dark:text-violet-400', border: 'border-violet-200 dark:border-violet-800/40' },
    'ICHIMOKU': { bg: 'bg-cyan-50 dark:bg-cyan-900/20', text: 'text-cyan-700 dark:text-cyan-400', border: 'border-cyan-200 dark:border-cyan-800/40' },
};

const TIER_COLORS: Record<string, string> = {
    'Platinum Buy': 'bg-black dark:bg-white text-white dark:text-black border-slate-900 dark:border-white',
    'Gold Signal': 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700',
    'Silver Signal': 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
    'Bullish Divergence': 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700',
};

// ─── Signal Badge ──────────────────────────────────────────────────────────────

function SignalBadge({ signal, size = 'sm' }: { signal: string; size?: 'sm' | 'lg' }) {
    const isBuy = signal === 'BUY';
    const isSell = signal === 'SELL';
    const isHold = signal === 'HOLD';

    return (
        <span className={cn(
            'inline-flex items-center gap-1 rounded-full font-black tracking-wide border',
            size === 'lg' ? 'px-3 py-1 text-xs' : 'px-2 py-0.5 text-[10px]',
            isBuy && 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-700',
            isSell && 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-700',
            isHold && 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-700',
            !isBuy && !isSell && !isHold && 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700',
        )}>
            {isBuy && <ArrowUpRight size={size === 'lg' ? 14 : 10} />}
            {isSell && <ArrowDownRight size={size === 'lg' ? 14 : 10} />}
            {signal}
        </span>
    );
}

// ─── Strength Meter ────────────────────────────────────────────────────────────

function StrengthMeter({ value, label }: { value: number; label?: string }) {
    const color = value >= 70 ? 'bg-emerald-500' : value >= 40 ? 'bg-amber-500' : 'bg-rose-500';
    return (
        <div className="space-y-1">
            {label && <span className="text-[9px] font-bold text-slate-400 tracking-wider">{label}</span>}
            <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all duration-700", color)} style={{ width: `${Math.min(value, 100)}%` }} />
                </div>
                <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 tabular-nums w-8 text-right">{value.toFixed(0)}%</span>
            </div>
        </div>
    );
}

// ─── Freshness Utility ────────────────────────────────────────────────────────
const getFreshness = (dateStr: string) => {
    const sigDate = new Date(dateStr);
    const today = new Date();
    // Normalize to dates
    today.setHours(0, 0, 0, 0);
    sigDate.setHours(0, 0, 0, 0);

    const diffMs = today.getTime() - sigDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays <= 1) return { label: 'Active', color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20', icon: CheckCircle2, status: 'active' };
    if (diffDays <= 3) return { label: 'Recent', color: 'text-amber-500 bg-amber-500/10 border-amber-500/20', icon: AlertCircle, status: 'recent' };
    return { label: 'Historical', color: 'text-slate-400 bg-slate-400/10 border-slate-400/20', icon: History, status: 'historical' };
};

// ─── Entry Zone Validation Utility ───────────────────────────────────────────
const getActionability = (signalPrice: number, currentPrice?: number, signal?: string, intelligence?: any) => {
    if (!currentPrice || signal === 'HOLD' || signal === 'NEUTRAL') return null;
    const change = ((currentPrice - signalPrice) / signalPrice) * 100;
    const isBuy = signal === 'BUY';
    const isSell = signal === 'SELL';
    
    // Technical Structural Breakdown check
    if (intelligence) {
        if (isBuy && (intelligence.macd === 'BEARISH' || intelligence.technicalScore < 30)) {
            return { label: 'Setup Broken', color: 'bg-slate-100 dark:bg-slate-900/40 text-slate-700 dark:text-slate-400 border-slate-200 dark:border-slate-800', status: 'invalid' };
        }
        if (isSell && (intelligence.macd === 'BULLISH' || intelligence.technicalScore > 70)) {
            return { label: 'Setup Broken', color: 'bg-slate-100 dark:bg-slate-900/40 text-slate-700 dark:text-slate-400 border-slate-200 dark:border-slate-800', status: 'invalid' };
        }
    }

    if (isBuy) {
        if (change < -5) return { label: 'Invalidated', color: 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800', status: 'invalid' };
        if (change > 3) return { label: 'Entry Missed', color: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700', status: 'missed' };
        return { label: 'In Entry Zone', color: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800', status: 'valid' };
    }
    if (isSell) {
        if (change > 5) return { label: 'Invalidated', color: 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800', status: 'invalid' };
        if (change < -3) return { label: 'Entry Missed', color: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700', status: 'missed' };
        return { label: 'In Entry Zone', color: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800', status: 'valid' };
    }
    return null;
};

// ─── Performance Utility ──────────────────────────────────────────────────────
function VerdictBadge({ signalPrice, currentPrice, signal, intelligence }: { signalPrice: number; currentPrice?: number; signal: string; intelligence?: any }) {
    const action = getActionability(signalPrice, currentPrice, signal, intelligence);
    if (!action) return null;
    return (
        <span className={cn("px-2 py-0.5 rounded text-[9px] font-black tracking-wider border", action.color)}>
            {action.label}
        </span>
    );
}

function PerformanceBadge({ signalPrice, currentPrice, signal, intelligence }: { signalPrice: number; currentPrice?: number; signal: string; intelligence?: any }) {
    if (!currentPrice || signal === 'HOLD' || signal === 'NEUTRAL') return null;

    const change = ((currentPrice - signalPrice) / signalPrice) * 100;
    const isSuccess = (signal === 'BUY' && change > 0) || (signal === 'SELL' && change < 0);

    return (
        <div className="flex flex-col items-center gap-1">
            <div className={cn(
                "px-2 py-0.5 rounded text-[10px] font-bold tabular-nums border",
                isSuccess 
                    ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 border-emerald-100 dark:border-emerald-800/30" 
                    : "bg-rose-50 dark:bg-rose-900/20 text-rose-600 border-rose-100 dark:border-rose-800/30"
            )}>
                {change > 0 ? '+' : ''}{change.toFixed(1)}%
            </div>
            <VerdictBadge signalPrice={signalPrice} currentPrice={currentPrice} signal={signal} intelligence={intelligence} />
        </div>
    );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function TickerSignals({ symbol, currentPrice, intelligence }: { symbol: string; currentPrice?: number; intelligence?: any }) {
    const [strategySignals, setStrategySignals] = useState<StrategySignal[]>([]);
    const [intelSignals, setIntelSignals] = useState<GeneratedSignal[]>([]);
    const [loading, setLoading] = useState(true);
    const [showHistoricalStrats, setShowHistoricalStrats] = useState(false);
    const [showHistoricalIntel, setShowHistoricalIntel] = useState(false);

    useEffect(() => {
        const fetchAll = async () => {
            setLoading(true);
            try {
                const [stratRes, intelRes] = await Promise.all([
                    api.get('/api/stocks/signals/', { params: { symbol, page_size: 100 } }).catch(() => null),
                    api.get('/api/stocks/generated-signals/', { params: { symbol, page_size: 100 } }).catch(() => null),
                ]);

                setStrategySignals(stratRes?.data?.results ?? []);
                setIntelSignals(intelRes?.data?.results ?? []);
            } catch (_) { }
            setLoading(false);
        };
        fetchAll();
    }, [symbol]);

    // Strategy signal analysis (Purified consensus)
    const strategyAnalysis = useMemo(() => {
        // Filter out signals that are old or whose entry windows have passed/invalidated
        const actionableSignals = strategySignals.filter(s => {
            const freshness = getFreshness(s.date);
            const action = getActionability(parseFloat(s.last_close), currentPrice, s.signal, intelligence);
            return freshness.status !== 'historical' && (!action || action.status === 'valid');
        });

        const buys = actionableSignals.filter(s => s.signal === 'BUY');
        const sells = actionableSignals.filter(s => s.signal === 'SELL');
        const holds = actionableSignals.filter(s => s.signal === 'HOLD');
        const total = actionableSignals.length;

        let consensus: 'BUY' | 'SELL' | 'HOLD' | 'NEUTRAL' = 'NEUTRAL';
        if (buys.length > sells.length && buys.length > holds.length) consensus = 'BUY';
        else if (sells.length > buys.length && sells.length > holds.length) consensus = 'SELL';
        else if (holds.length > buys.length && holds.length > sells.length) consensus = 'HOLD';

        const buyPct = total > 0 ? (buys.length / total) * 100 : 0;
        const sellPct = total > 0 ? (sells.length / total) * 100 : 0;

        return { buys, sells, holds, total, consensus, buyPct, sellPct, rawTotal: strategySignals.length };
    }, [strategySignals, currentPrice]);

    // Derived visibility for strategy list
    const visibleStrats = useMemo(() => {
        if (showHistoricalStrats) return strategySignals;
        return strategySignals.filter(s => {
            const freshness = getFreshness(s.date);
            const action = getActionability(parseFloat(s.last_close), currentPrice, s.signal, intelligence);
            return freshness.status !== 'historical' && (!action || action.status === 'valid');
        });
    }, [strategySignals, currentPrice, showHistoricalStrats, intelligence]);
    
    const hiddenStratsCount = strategySignals.length - visibleStrats.length;

    // Intel signal grouping by source
    const intelBySource = useMemo(() => {
        const groups = new Map<string, GeneratedSignal[]>();
        for (const sig of intelSignals) {
            const arr = groups.get(sig.source) ?? [];
            arr.push(sig);
            groups.set(sig.source, arr);
        }
        return groups;
    }, [intelSignals]);

    // Derived visibility for intel sources
    const visibleIntelSources = useMemo(() => {
        const entries = Array.from(intelBySource.entries());
        if (showHistoricalIntel) return entries;
        
        return entries.filter(([_, signals]) => {
            const latestSignal = [...signals].sort((a, b) => b.generated_date.localeCompare(a.generated_date))[0];
            const freshness = getFreshness(latestSignal.generated_date);
            const action = getActionability(parseFloat(latestSignal.ltp), currentPrice, latestSignal.signal, intelligence);
            return freshness.status !== 'historical' && (!action || action.status === 'valid');
        });
    }, [intelBySource, currentPrice, showHistoricalIntel, intelligence]);

    const hiddenIntelCount = intelBySource.size - visibleIntelSources.length;

    if (loading) {
        return (
            <div className="flex justify-center items-center py-24">
                <StockLoader size="md" />
            </div>
        );
    }

    const hasSignals = strategySignals.length > 0 || intelSignals.length > 0;

    return (
        <div className="space-y-10">
            {!hasSignals ? (
                <div className="flex flex-col items-center justify-center py-24 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl">
                    <Radar className="w-10 h-10 text-slate-200 dark:text-slate-700 mb-3" />
                    <p className="text-sm font-bold text-slate-400 dark:text-slate-500">No signals found for {symbol}</p>
                    <p className="text-xs text-slate-400 mt-1">Run the pipeline to generate signals.</p>
                </div>
            ) : (
                <>
                    {/* ─── Section A: Strategy Signals ───────────────────────────────── */}
                    <div className="glass-card-light rounded-2xl border border-slate-200 dark:border-slate-800/50 p-8 shadow-sm space-y-6">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800">
                                    <Brain size={18} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-800 dark:text-slate-100 text-lg">Strategy Signals</h3>
                                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">Consensus based on actionable active signals</p>
                                </div>
                            </div>
                            {strategyAnalysis.total > 0 && (
                                <div className="flex items-center gap-3">
                                    <SignalBadge signal={strategyAnalysis.consensus} size="lg" />
                                    <span className="text-xs font-bold text-slate-400">
                                        {strategyAnalysis.total} actionable
                                    </span>
                                </div>
                            )}
                        </div>

                        {strategyAnalysis.rawTotal > 0 ? (
                            <>
                                {/* Consensus Bar */}
                                <div className="space-y-2">
                                    <div className="flex items-center gap-4 text-[10px] font-black tracking-wider">
                                        <span className="text-emerald-600 dark:text-emerald-400">{strategyAnalysis.buys.length} Buy</span>
                                        <span className="text-rose-600 dark:text-rose-400">{strategyAnalysis.sells.length} Sell</span>
                                        <span className="text-amber-600 dark:text-amber-400">{strategyAnalysis.holds.length} Hold</span>
                                    </div>
                                    <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                                        <div className="h-full bg-emerald-500 transition-all duration-700" style={{ width: `${strategyAnalysis.buyPct}%` }} />
                                        <div className="h-full bg-rose-500 transition-all duration-700" style={{ width: `${strategyAnalysis.sellPct}%` }} />
                                    </div>
                                </div>

                                {/* Strategy Table */}
                                <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                                    <table className="w-full text-sm">
                                        <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                                            <tr>
                                                <th className="px-5 py-3 text-left font-bold text-slate-400 dark:text-slate-500 text-[10px] tracking-wider">Strategy</th>
                                                <th className="px-5 py-3 text-center font-bold text-slate-400 dark:text-slate-500 text-[10px] tracking-wider">Freshness</th>
                                                <th className="px-5 py-3 text-center font-bold text-slate-400 dark:text-slate-500 text-[10px] tracking-wider">Signal</th>
                                                <th className="px-5 py-3 text-center font-bold text-slate-400 dark:text-slate-500 text-[10px] tracking-wider">Change</th>
                                                <th className="px-5 py-3 text-center font-bold text-slate-400 dark:text-slate-500 text-[10px] tracking-wider">Date</th>
                                                <th className="px-5 py-3 text-center font-bold text-slate-400 dark:text-slate-500 text-[10px] tracking-wider">Close @ Sig</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                            {visibleStrats.length === 0 && (
                                                <tr>
                                                    <td colSpan={6} className="py-8 text-center text-sm text-slate-400 italic">
                                                        No immediately actionable signals found.
                                                    </td>
                                                </tr>
                                            )}
                                            {visibleStrats.map(sig => {
                                                const params = sig.metadata?.optimized_params;
                                                const paramStr = params && typeof params === 'object'
                                                    ? Object.entries(params)
                                                        .filter(([k]) => !['orders', 'position_size', 'optimization_scope', 'experiment_id'].includes(k))
                                                        .map(([k, v]) => `${k}: ${v}`)
                                                        .join(' · ')
                                                    : '';
                                                const freshness = getFreshness(sig.date);

                                                return (
                                                    <tr key={sig.id} className={cn(
                                                        "hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors",
                                                        freshness.status === 'historical' && "opacity-50 grayscale-[0.3]"
                                                    )}>
                                                        <td className="px-5 py-3.5">
                                                            <div className="font-bold text-slate-700 dark:text-slate-200 text-sm">{sig.strategy_name}</div>
                                                            <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate max-w-[220px]">{sig.strategy_description}</div>
                                                        </td>
                                                        <td className="px-5 py-3.5 text-center">
                                                            <div className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black border", freshness.color)}>
                                                                <freshness.icon size={10} />
                                                                {freshness.label}
                                                            </div>
                                                        </td>
                                                        <td className="px-5 py-3.5 text-center">
                                                            <SignalBadge signal={sig.signal} />
                                                        </td>
                                                        <td className="px-5 py-3.5 text-center">
                                                            <PerformanceBadge signalPrice={parseFloat(sig.last_close)} currentPrice={currentPrice} signal={sig.signal} intelligence={intelligence} />
                                                        </td>
                                                        <td className="px-5 py-3.5 text-center text-xs text-slate-500 dark:text-slate-400 font-mono">{sig.date}</td>
                                                        <td className="px-5 py-3.5 text-center text-xs font-bold text-slate-700 dark:text-slate-300 font-mono">{formatRupees(parseFloat(sig.last_close))}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                    {hiddenStratsCount > 0 && (
                                        <div className="bg-slate-50/50 dark:bg-slate-900/50 p-2 text-center border-t border-slate-200 dark:border-slate-800">
                                            <button 
                                                onClick={() => setShowHistoricalStrats(!showHistoricalStrats)}
                                                className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors py-1.5 px-3 rounded-lg hover:bg-slate-200/50 dark:hover:bg-slate-800"
                                            >
                                                {showHistoricalStrats ? <EyeOff size={14} /> : <Eye size={14} />}
                                                {showHistoricalStrats ? 'Hide Invalid/Historical Signals' : `Show ${hiddenStratsCount} Invalid/Historical Signals`}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </>
                        ) : (
                            <div className="py-8 text-center text-sm text-slate-400 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-xl">
                                No strategy signals for {symbol}
                            </div>
                        )}
                    </div>

                    {/* ─── Section B: Intel Signals ──────────────────────────────────── */}
                    <div className="glass-card-light rounded-2xl border border-slate-200 dark:border-slate-800/50 p-8 shadow-sm space-y-6">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-900/30 text-slate-900 dark:text-slate-200 border border-slate-200 dark:border-slate-800">
                                    <Radar size={18} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-800 dark:text-slate-100 text-lg">Intelligence Signals</h3>
                                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">Smart Money, Broker Analysis & Technical Engines</p>
                                </div>
                            </div>
                            {intelSignals.length > 0 && (
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-slate-400">{intelSignals.length} signals from {intelBySource.size} sources</span>
                                </div>
                            )}
                        </div>

                        {intelSignals.length > 0 ? (
                            <div className="space-y-4">
                                <div className="grid gap-4">
                                    {visibleIntelSources.length === 0 && (
                                        <div className="py-8 text-center text-sm text-slate-400 italic bg-white/50 dark:bg-slate-900/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                                            No immediately actionable intelligence signals found.
                                        </div>
                                    )}
                                    {visibleIntelSources.map(([source, signals]) => {
                                        const SourceIcon = SOURCE_ICONS[source] || Activity;
                                        const colors = SOURCE_COLORS[source] || SOURCE_COLORS['SMART_MONEY'];
                                        const latestSignal = [...signals].sort((a, b) => b.generated_date.localeCompare(a.generated_date))[0];
                                        const freshness = getFreshness(latestSignal.generated_date);

                                        return (
                                            <div key={source} className={cn(
                                                "rounded-xl border p-5 space-y-4", 
                                                colors.bg, colors.border,
                                                freshness.status === 'historical' && "opacity-60 saturate-[0.8]"
                                            )}>
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <SourceIcon size={16} className={colors.text} />
                                                        <div>
                                                            <h4 className={cn("font-bold text-sm", colors.text)}>{SOURCE_LABELS[source] || source}</h4>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[9px] font-bold text-slate-400 flex items-center gap-1">
                                                                    <Clock size={9} /> {latestSignal.generated_date}
                                                                </span>
                                                                <div className={cn("inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[8px] font-black border", freshness.color)}>
                                                                    <freshness.icon size={8} />
                                                                    {freshness.label}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col items-end gap-1">
                                                        <SignalBadge signal={latestSignal.signal} size="lg" />
                                                        <PerformanceBadge signalPrice={parseFloat(latestSignal.ltp)} currentPrice={currentPrice} signal={latestSignal.signal} intelligence={intelligence} />
                                                    </div>
                                                </div>

                                                {/* Signal Details */}
                                                <div className="space-y-3">
                                                    {signals.slice(0, 3).map(sig => (
                                                        <div key={sig.id} className="flex items-start gap-4 bg-white/50 dark:bg-slate-900/30 rounded-lg p-3 border border-slate-100/50 dark:border-slate-800/50">
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                                                    <SignalBadge signal={sig.signal} />
                                                                    {sig.signal_tier && (
                                                                        <span className={cn("px-2 py-0.5 rounded text-[9px] font-black border", TIER_COLORS[sig.signal_tier] || 'bg-slate-100 dark:bg-slate-800 text-slate-600 border-slate-200')}>
                                                                            {sig.signal_tier}
                                                                        </span>
                                                                    )}
                                                                    <span className="text-[9px] text-slate-400 font-mono">{sig.generated_date}</span>
                                                                </div>
                                                                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-2">
                                                                    {sig.rationale || 'Signal generated from quantitative analysis'}
                                                                </p>
                                                            </div>
                                                            <div className="shrink-0 w-28">
                                                                <StrengthMeter value={sig.strength} label="Strength" />
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                {hiddenIntelCount > 0 && (
                                    <div className="text-center pt-2">
                                        <button 
                                            onClick={() => setShowHistoricalIntel(!showHistoricalIntel)}
                                            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors py-1.5 px-3 rounded-lg hover:bg-slate-200/50 dark:hover:bg-slate-800"
                                        >
                                            {showHistoricalIntel ? <EyeOff size={14} /> : <Eye size={14} />}
                                            {showHistoricalIntel ? 'Hide Invalid/Historical Sources' : `Show ${hiddenIntelCount} Invalid/Historical Sources`}
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="py-8 text-center text-sm text-slate-400 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-xl">
                                No intel signals for {symbol}. Run &quot;Generate All Intel Signals&quot; from Pipeline.
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
