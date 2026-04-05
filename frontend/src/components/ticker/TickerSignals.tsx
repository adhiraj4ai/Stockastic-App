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
import { InfoTooltip } from '@/components/ui/InfoTooltip';

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
    'PRICE_ACTION': 'Price Action',
    'MEAN_REVERSAL': 'Mean Reversal',
    'RSI_DIVERGENCE': 'RSI Divergence',
    'MACD_DIVERGENCE': 'MACD Divergence',
    'DOW_SIGNAL': 'Dow Signal',
};

const SOURCE_ICONS: Record<string, any> = {
    'SMART_MONEY': Zap,
    'BROKER_ACCUMULATION': BarChart3,
    'SMART_CROSSOVER': Activity,
    'ICHIMOKU': Layers,
    'PRICE_ACTION': Zap,
    'MEAN_REVERSAL': Brain,
    'RSI_DIVERGENCE': Activity,
    'MACD_DIVERGENCE': Activity,
    'DOW_SIGNAL': Shield,
};

const SOURCE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    'SMART_MONEY': { 
        bg: 'bg-amber-50 dark:bg-amber-900/10', 
        text: 'text-amber-700 dark:text-amber-400', 
        border: 'border-amber-100 dark:border-amber-800/40'
    },
    'BROKER_ACCUMULATION': { 
        bg: 'bg-blue-50 dark:bg-blue-900/10', 
        text: 'text-blue-700 dark:text-blue-400', 
        border: 'border-blue-100 dark:border-blue-800/40'
    },
    'SMART_CROSSOVER': { 
        bg: 'bg-violet-50 dark:bg-violet-900/10', 
        text: 'text-violet-700 dark:text-violet-400', 
        border: 'border-violet-100 dark:border-violet-800/40'
    },
    'ICHIMOKU': { 
        bg: 'bg-cyan-50 dark:bg-cyan-900/10', 
        text: 'text-cyan-700 dark:text-cyan-400', 
        border: 'border-cyan-100 dark:border-cyan-800/40'
    },
    'PRICE_ACTION': {
        bg: 'bg-emerald-50 dark:bg-emerald-900/10',
        text: 'text-emerald-700 dark:text-emerald-400',
        border: 'border-emerald-100 dark:border-emerald-800/40'
    },
    'MEAN_REVERSAL': {
        bg: 'bg-rose-50 dark:bg-rose-900/10',
        text: 'text-rose-700 dark:text-rose-400',
        border: 'border-rose-100 dark:border-rose-800/40'
    },
    'RSI_DIVERGENCE': {
        bg: 'bg-indigo-50 dark:bg-indigo-900/10',
        text: 'text-indigo-700 dark:text-indigo-400',
        border: 'border-indigo-100 dark:border-indigo-800/40'
    },
    'MACD_DIVERGENCE': {
        bg: 'bg-blue-50 dark:bg-blue-900/10',
        text: 'text-blue-700 dark:text-blue-400',
        border: 'border-blue-100 dark:border-blue-800/40'
    },
    'DOW_SIGNAL': {
        bg: 'bg-slate-50 dark:bg-slate-800/40',
        text: 'text-slate-700 dark:text-slate-300',
        border: 'border-slate-200 dark:border-slate-700'
    }
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
            'inline-flex items-center gap-1 rounded-full font-bold tracking-tight border',
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
            {label && <span className="text-[9px] font-medium text-slate-400 tracking-tight">{label}</span>}
            <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all duration-700", color)} style={{ width: `${Math.min(value, 100)}%` }} />
                </div>
                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 tabular-nums w-8 text-right tracking-tight">{value.toFixed(0)}%</span>
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
        <span className={cn("px-2 py-0.5 rounded text-[9px] font-semibold tracking-tight border", action.color)}>
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
                "px-2 py-0.5 rounded text-[10px] font-bold tabular-nums border tracking-tight",
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

// ─── Consensus Hero ───────────────────────────────────────────────────────────

function ConsensusHero({ consensus, buyPct, sellPct, total, intelCount }: { consensus: string; buyPct: number; sellPct: number; total: number; intelCount: number }) {
    const isBuy = consensus === 'BUY';
    const isSell = consensus === 'SELL';

    return (
        <div className="glass-card-light dark:bg-slate-900/40 rounded-2xl border border-slate-200 dark:border-slate-800/50 p-6 flex flex-col md:flex-row gap-6 items-center">
            <div className="flex-1 flex items-center gap-4">
                <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center shadow-sm",
                    isBuy ? "bg-emerald-500 text-white" : isSell ? "bg-rose-500 text-white" : "bg-slate-200 dark:bg-slate-800 text-slate-500"
                )}>
                    {isBuy ? <TrendingUp size={24} /> : isSell ? <TrendingDown size={24} /> : <Activity size={24} />}
                </div>
                <div>
                    <p className="text-[10px] font-medium tracking-tight text-slate-400 dark:text-slate-500">Market consensus</p>
                    <h2 className={cn(
                        "text-xl font-bold tracking-tight",
                        isBuy ? "text-emerald-600 dark:text-emerald-400" : isSell ? "text-rose-600 dark:text-rose-400" : "text-slate-800 dark:text-slate-200"
                    )}>
                        {consensus} {isBuy ? 'Signal' : isSell ? 'Alert' : 'Sentiment'}
                    </h2>
                </div>
            </div>

            <div className="flex items-center gap-6">
                <div className="w-48 space-y-1.5">
                    <div className="flex justify-between text-[9px] font-medium text-slate-400 tracking-tight">
                        <span className="text-emerald-500">Bullish {buyPct.toFixed(0)}%</span>
                        <span className="text-rose-500">{sellPct.toFixed(0)}% Bearish</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full flex overflow-hidden">
                        <div className="h-full bg-emerald-500 transition-all duration-1000" style={{ width: `${buyPct}%` }} />
                        <div className="h-full bg-rose-500 transition-all duration-1000" style={{ width: `${sellPct}%` }} />
                    </div>
                </div>
                
                <div className="flex items-center gap-3 border-l border-slate-200 dark:border-slate-800 pl-6">
                    <div className="text-center">
                        <div className="text-[9px] font-medium text-slate-400 tracking-tight">Engines</div>
                        <div className="text-sm font-bold text-slate-700 dark:text-slate-300 tracking-tight">{total}</div>
                    </div>
                    <div className="text-center">
                        <div className="text-[9px] font-medium text-slate-400 tracking-tight">Intel</div>
                        <div className="text-sm font-bold text-slate-700 dark:text-slate-300 tracking-tight">{intelCount}</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function TickerSignals({ symbol, currentPrice, intelligence, fundamental }: { symbol: string; currentPrice?: number; intelligence?: any; fundamental?: any }) {
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

    // Derived visibility for strategy list (Technical Signals)
    const visibleStrats = useMemo(() => {
        if (showHistoricalStrats) return strategySignals;
        return strategySignals.filter(s => {
            const freshness = getFreshness(s.date);
            const action = getActionability(parseFloat(s.last_close), currentPrice, s.signal, intelligence);
            return freshness.status !== 'historical' && (!action || action.status === 'valid');
        });
    }, [strategySignals, currentPrice, showHistoricalStrats, intelligence]);
    
    const hiddenStratsCount = strategySignals.length - visibleStrats.length;

    // Categorization for Intelligence signals
    const { buySellSignals, accumulationSignals, institutionalAlerts } = useMemo(() => {
        const buySellSources = ['SMART_CROSSOVER', 'ICHIMOKU'];
        const accumulationSources = ['SMART_MONEY', 'BROKER_ACCUMULATION'];
        const institutionalSources = ['PRICE_ACTION', 'MEAN_REVERSAL', 'RSI_DIVERGENCE', 'MACD_DIVERGENCE', 'DOW_SIGNAL'];

        const buySellMap = new Map<string, GeneratedSignal[]>();
        const accMap = new Map<string, GeneratedSignal[]>();
        const instMap = new Map<string, GeneratedSignal[]>();

        for (const sig of intelSignals) {
            if (buySellSources.includes(sig.source)) {
                const arr = buySellMap.get(sig.source) ?? [];
                arr.push(sig);
                buySellMap.set(sig.source, arr);
            } else if (accumulationSources.includes(sig.source)) {
                const arr = accMap.get(sig.source) ?? [];
                arr.push(sig);
                accMap.set(sig.source, arr);
            } else if (institutionalSources.includes(sig.source)) {
                const arr = instMap.get(sig.source) ?? [];
                arr.push(sig);
                instMap.set(sig.source, arr);
            }
        }

        const filterVisible = (map: Map<string, GeneratedSignal[]>) => {
            const entries = Array.from(map.entries());
            if (showHistoricalIntel) return entries;
            
            return entries.filter(([_, signals]) => {
                const latest = [...signals].sort((a, b) => b.generated_date.localeCompare(a.generated_date))[0];
                const freshness = getFreshness(latest.generated_date);
                const action = getActionability(parseFloat(latest.ltp), currentPrice, latest.signal, intelligence);
                return freshness.status !== 'historical' && (!action || action.status === 'valid');
            });
        };

        return {
            buySellSignals: filterVisible(buySellMap),
            accumulationSignals: filterVisible(accMap),
            institutionalAlerts: filterVisible(instMap),
        };
    }, [intelSignals, currentPrice, showHistoricalIntel, intelligence]);

    if (loading) {
        return (
            <div className="flex justify-center items-center py-24">
                <StockLoader size="md" />
            </div>
        );
    }

    const hasSignals = strategySignals.length > 0 || intelSignals.length > 0 || fundamental;

    return (
        <div className="space-y-10">
            {!hasSignals ? (
                <div className="flex flex-col items-center justify-center py-24 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                    <Radar className="w-10 h-10 text-slate-300 dark:text-slate-700 mb-4" />
                    <p className="text-base font-bold text-slate-500 dark:text-slate-400 tracking-tight">No active signals found for {symbol}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Run the intelligence pipeline to generate signals.</p>
                </div>
            ) : (
                <>
                    {/* 1. TECHNICAL SIGNALS (Strategies Table) */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-2">
                                <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                    <Layers size={16} />
                                </div>
                                <div>
                                    <div className="flex items-center gap-1">
                                        <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base tracking-tight">Technical signals</h3>
                                        <InfoTooltip content="Algorithmic signals generated by pre-defined technical strategies (e.g. Cross-overs, Volatility Breakouts)." />
                                    </div>
                                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium tracking-tight">Strategy engines & backtests</p>
                                </div>
                            </div>
                            {hiddenStratsCount > 0 && (
                                <button 
                                    onClick={() => setShowHistoricalStrats(!showHistoricalStrats)}
                                    className="text-[10px] font-bold tracking-tight text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                                >
                                    {showHistoricalStrats ? `Hide ${hiddenStratsCount}` : `Show ${hiddenStratsCount} legacy`}
                                </button>
                            )}
                        </div>

                        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40">
                            <table className="w-full text-xs">
                                <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                                    <tr>
                                        <th className="px-4 py-3 text-left font-semibold text-slate-400 tracking-tight text-[9px]">Strategy</th>
                                        <th className="px-4 py-3 text-center font-semibold text-slate-400 tracking-tight text-[9px]">Status</th>
                                        <th className="px-4 py-3 text-center font-semibold text-slate-400 tracking-tight text-[9px]">Signal</th>
                                        <th className="px-4 py-3 text-center font-semibold text-slate-400 tracking-tight text-[9px]">Action</th>
                                        <th className="px-4 py-3 text-center font-semibold text-slate-400 tracking-tight text-[9px]">Price</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {visibleStrats.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="py-8 text-center text-slate-400 italic">No active technical strategies.</td>
                                        </tr>
                                    )}
                                    {visibleStrats.map(sig => {
                                        const freshness = getFreshness(sig.date);
                                        return (
                                            <tr key={sig.id} className={cn("transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/50", freshness.status === 'historical' && "opacity-40")}>
                                                <td className="px-4 py-3">
                                                    <div className="font-semibold text-slate-700 dark:text-slate-200 tracking-tight">{sig.strategy_name}</div>
                                                    <div className="text-[10px] text-slate-400 truncate max-w-[150px] tracking-tight">{sig.strategy_description}</div>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <div className={cn("inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded text-[8px] font-bold border tracking-tight", freshness.color)}>
                                                        <freshness.icon size={8} />
                                                        {freshness.label}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-center"><SignalBadge signal={sig.signal} /></td>
                                                <td className="px-4 py-3 text-center">
                                                    <PerformanceBadge signalPrice={parseFloat(sig.last_close)} currentPrice={currentPrice} signal={sig.signal} intelligence={intelligence} />
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <div className="font-semibold text-slate-700 dark:text-slate-300 tracking-tight">{formatRupees(parseFloat(sig.last_close))}</div>
                                                    <div className="text-[9px] text-slate-400">{sig.date}</div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* 2. FUNDAMENTAL SIGNALS (Core Health Summary) */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 px-1">
                            <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                <Activity size={16} />
                            </div>
                            <div>
                                <div className="flex items-center gap-1">
                                    <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base tracking-tight">Fundamental signals</h3>
                                    <InfoTooltip content="Core business health indicators including Profitability (ROE), Value (P/E), and Yield." />
                                </div>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium tracking-tight">Business health & metrics</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="md:col-span-1 rounded-xl border p-4 bg-white dark:bg-slate-900/50 flex flex-col justify-between">
                                <span className="text-[9px] font-medium text-slate-400 tracking-tight leading-none">Fundamental score</span>
                                <div className="flex items-baseline gap-1 mt-2">
                                    <span className="text-3xl font-bold text-slate-800 dark:text-white tabular-nums tracking-tight">{intelligence?.fundamentalScore || 0}</span>
                                    <span className="text-xs font-medium text-slate-400 tracking-tight">/ 100</span>
                                </div>
                                <div className="h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mt-4">
                                    <div 
                                        className={cn("h-full rounded-full", (intelligence?.fundamentalScore || 0) > 70 ? 'bg-emerald-500' : 'bg-amber-500')} 
                                        style={{ width: `${intelligence?.fundamentalScore || 0}%` }} 
                                    />
                                </div>
                            </div>

                            <div className="md:col-span-3 grid grid-cols-3 gap-4">
                                {[
                                    { label: 'P/E ratio', value: fundamental?.pe_ratio ? fundamental.pe_ratio.toFixed(2) : 'N/A', sub: 'Price/Earnings' },
                                    { label: 'ROE', value: fundamental?.fundamental_indicators?.find((i: any) => i.name.includes('ROE'))?.value || 'N/A', sub: 'Return on Equity' },
                                    { label: 'Div yield', value: fundamental?.dividend_yield ? fundamental.dividend_yield.toFixed(2) + '%' : 'N/A', sub: 'Sector comparison' }
                                ].map((m, idx) => (
                                    <div key={idx} className="rounded-xl border border-slate-100 dark:border-slate-800 p-4 bg-slate-50/30 dark:bg-slate-800/20">
                                        <span className="text-[8px] font-medium text-slate-400 tracking-tight">{m.label}</span>
                                        <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 mt-1 tracking-tight">{m.value}</div>
                                        <div className="text-[8px] text-slate-400 mt-0.5 tracking-tight">{m.sub}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* 3. INSTITUTIONAL ALERTS (Intelligence Grid) */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 px-1">
                            <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800">
                                <Shield size={16} />
                            </div>
                            <div>
                                <div className="flex items-center gap-1">
                                    <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base tracking-tight">Institutional alerts</h3>
                                    <InfoTooltip content="High-fidelity alerts for Price Action, Mean Reversal, Divergences, and multi-day Structure Breaks (Dow)." />
                                </div>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium tracking-tight">Advanced technical pulse</p>
                            </div>
                        </div>

                        {institutionalAlerts.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {institutionalAlerts.map(([source, signals]) => (
                                    <IntelCard key={source} source={source} signals={signals} currentPrice={currentPrice} intelligence={intelligence} />
                                ))}
                            </div>
                        ) : (
                            <div className="py-8 text-center text-sm text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">No active institutional alerts.</div>
                        )}
                    </div>

                    {/* 3. BUY/SELL SIGNALS (Intelligence Grid) */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 px-1">
                            <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                <Zap size={16} />
                            </div>
                            <div>
                                <div className="flex items-center gap-1">
                                    <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base tracking-tight">Buy/sell signals</h3>
                                    <InfoTooltip content="Momentum-based signals from the Intelligence Engine (Smart Crossover & Ichimoku)." />
                                </div>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium tracking-tight">Trend & momentum crossovers</p>
                            </div>
                        </div>

                        {buySellSignals.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {buySellSignals.map(([source, signals]) => (
                                    <IntelCard key={source} source={source} signals={signals} currentPrice={currentPrice} intelligence={intelligence} />
                                ))}
                            </div>
                        ) : (
                            <div className="py-8 text-center text-sm text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">No active trend signals.</div>
                        )}
                    </div>

                    {/* 4. ACCUMULATION SIGNALS (Intelligence Grid) */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 px-1">
                            <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                <BarChart3 size={16} />
                            </div>
                            <div>
                                <div className="flex items-center gap-1">
                                    <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base tracking-tight">Accumulation signals</h3>
                                    <InfoTooltip content="Quantitative signals tracking institutional net-buying and smart money markup phases." />
                                </div>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium tracking-tight">Institutional volume & whale watch</p>
                            </div>
                        </div>

                        {accumulationSignals.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {accumulationSignals.map(([source, signals]) => (
                                    <IntelCard key={source} source={source} signals={signals} currentPrice={currentPrice} intelligence={intelligence} />
                                ))}
                            </div>
                        ) : (
                            <div className="py-8 text-center text-sm text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">No active accumulation signals.</div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

// ─── Helper Component: IntelCard ──────────────────────────────────────────

function IntelCard({ source, signals, currentPrice, intelligence }: { source: string; signals: GeneratedSignal[]; currentPrice?: number; intelligence?: any }) {
    const SourceIcon = SOURCE_ICONS[source] || Activity;
    const colors = SOURCE_COLORS[source] || SOURCE_COLORS['SMART_MONEY'];
    const latestSignal = [...signals].sort((a, b) => b.generated_date.localeCompare(a.generated_date))[0];
    const freshness = getFreshness(latestSignal.generated_date);

    return (
        <div className={cn("rounded-xl border p-4 transition-all duration-300 bg-white dark:bg-slate-900/50", colors.border, freshness.status === 'historical' && "opacity-60")}>
            <div className="space-y-4">
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                        <div className={cn("p-2 rounded-lg border", colors.bg, colors.border)}><SourceIcon size={16} className={colors.text} /></div>
                        <div>
                        <div className="flex items-center gap-1">
                             <h4 className="font-semibold text-sm text-slate-800 dark:text-slate-100 leading-tight tracking-tight">{SOURCE_LABELS[source] || source}</h4>
                             <InfoTooltip content={source === 'SMART_MONEY' ? 'Institutional markup tracking.' : 'Volume-weighted accumulation detection.'} />
                        </div>
                            <div className={cn("inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded text-[8px] font-bold border tracking-tight", freshness.color)}>
                                <freshness.icon size={8} />{freshness.label}
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                        <SignalBadge signal={latestSignal.signal} size="sm" />
                        <PerformanceBadge signalPrice={parseFloat(latestSignal.ltp)} currentPrice={currentPrice} signal={latestSignal.signal} intelligence={intelligence} />
                    </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800">
                     <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-normal line-clamp-2 tracking-tight">{latestSignal.rationale || 'Quantitative intelligence signal.'}</p>
                </div>
            </div>
        </div>
    );
}
