'use client';

import { BrainCircuit, Info, ShieldCheck, AlertTriangle, Zap, ArrowUpRight, ArrowDownRight, TrendingUp, TrendingDown, Briefcase, Eye, Star, Target } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatRupees } from '@/lib/formatters';

interface PortfolioPosition {
    ticker: string;
    quantity: number;
    buy_price: number;
    wacc: number;
    stop_loss_price?: number | null;
    target_price?: number | null;
    tags?: string[];
}

interface WatchlistInfo {
    ticker: string;
    target_price?: number | null;
    stop_loss_price?: number | null;
    notes?: string | null;
}

interface IntelligenceGlassProps {
    symbol?: string;
    name?: string;
    price?: number;
    change?: number;
    percentChange?: number;
    signal?: 'BUY' | 'SELL';
    fundamentalScore: number;
    technicalScore: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    macd: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    reason?: string;
    portfolioPosition?: PortfolioPosition | null;
    watchlistItem?: WatchlistInfo | null;
}

export function IntelligenceGlass({
    symbol,
    name,
    price,
    change,
    percentChange,
    signal,
    fundamentalScore,
    technicalScore,
    riskLevel,
    macd,
    reason,
    portfolioPosition,
    watchlistItem,
}: IntelligenceGlassProps) {
    const combinedScore = (fundamentalScore + technicalScore) / 2;
    const isPositive = (change || 0) >= 0;

    const getVerdict = () => {
        if (combinedScore > 75) return { label: 'Strong Outperform', color: 'text-emerald-600 dark:text-emerald-400', glow: 'soft-glow-emerald', icon: ShieldCheck, status: 'OPTIMAL' };
        if (combinedScore > 60) return { label: 'Bullish Momentum', color: 'text-blue-600 dark:text-blue-400', glow: 'soft-glow-blue', icon: BrainCircuit, status: 'FAVORABLE' };
        if (combinedScore > 40) return { label: 'Market Consensus', color: 'text-slate-600 dark:text-slate-400', glow: '', icon: Info, status: 'NEUTRAL' };
        return { label: 'High Fragility', color: 'text-rose-600 dark:text-rose-400', glow: 'soft-glow-rose', icon: AlertTriangle, status: 'BEARISH' };
    };

    const verdict = getVerdict();

    // Portfolio P&L calculations
    const portfolioPnl = portfolioPosition && price
        ? ((price - portfolioPosition.wacc) / portfolioPosition.wacc) * 100
        : null;

    return (
        <div className="glass-card-light rounded-2xl border dark:border-slate-800/50 overflow-hidden p-6 space-y-5 h-full relative group">
            <div className="absolute top-0 right-0 p-4 opacity-50">
                <Zap size={20} className="text-slate-200 group-hover:text-amber-500/40 transition-colors" />
            </div>

            {/* Combined Header: Identity + Intelligence */}
            <div className="space-y-4">
                {symbol ? (
                    <div className="flex items-start justify-between">
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{symbol}</h1>
                                {signal && (
                                    <Badge className={cn(
                                        "px-1.5 py-0 rounded-[4px] text-[9px] font-bold border h-5",
                                        signal === 'BUY' ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800" : "bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800"
                                    )}>
                                        {signal}
                                    </Badge>
                                )}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                                <div className={cn("p-1 rounded bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm", verdict.color)}>
                                    <verdict.icon size={14} />
                                </div>
                                <span className={cn("text-sm font-bold", verdict.color)}>{verdict.label}</span>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                                {formatRupees(price)}
                            </div>
                            <div className={cn("flex items-center justify-end gap-1 text-xs font-bold", isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                                {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                <span>{isPositive ? '+' : ''}{change?.toFixed(2)}</span>
                                <span className="opacity-60">({percentChange?.toFixed(2)}%)</span>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center gap-3">
                        <div className={cn("p-2.5 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm", verdict.color)}>
                            <verdict.icon size={22} />
                        </div>
                        <div>
                            <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">Cognitive intelligence</p>
                            <h2 className={cn("text-2xl font-bold tracking-tight", verdict.color)}>{verdict.label}</h2>
                        </div>
                    </div>
                )}
            </div>

            {/* Portfolio / Watchlist Status Badges */}
            {(portfolioPosition || watchlistItem) && (
                <div className="flex flex-wrap gap-2">
                    {portfolioPosition && (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-50/80 dark:bg-indigo-900/20 border border-indigo-200/60 dark:border-indigo-800/40 w-full">
                            <Briefcase size={14} className="text-indigo-500 shrink-0" />
                            <div className="flex items-center gap-3 flex-wrap text-[11px] font-bold flex-1 min-w-0">
                                <span className="text-indigo-700 dark:text-indigo-300">In Portfolio</span>
                                <span className="text-slate-500 dark:text-slate-400 font-mono">{portfolioPosition.quantity} units</span>
                                <span className="text-slate-500 dark:text-slate-400 font-mono">@ {formatRupees(portfolioPosition.wacc)}</span>
                                {portfolioPnl !== null && (
                                    <span className={cn(
                                        "px-1.5 py-0.5 rounded font-mono font-black text-[10px]",
                                        portfolioPnl >= 0
                                            ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                                            : "bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400"
                                    )}>
                                        {portfolioPnl >= 0 ? '+' : ''}{portfolioPnl.toFixed(2)}%
                                    </span>
                                )}
                            </div>
                        </div>
                    )}

                    {watchlistItem && !portfolioPosition && (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50/80 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-800/40 w-full">
                            <Eye size={14} className="text-amber-500 shrink-0" />
                            <div className="flex items-center gap-3 flex-wrap text-[11px] font-bold flex-1 min-w-0">
                                <span className="text-amber-700 dark:text-amber-300">On Watchlist</span>
                                {watchlistItem.target_price && (
                                    <span className="text-emerald-600 dark:text-emerald-400 font-mono flex items-center gap-1">
                                        <Target size={10} /> {formatRupees(watchlistItem.target_price)}
                                    </span>
                                )}
                                {watchlistItem.stop_loss_price && (
                                    <span className="text-rose-600 dark:text-rose-400 font-mono flex items-center gap-1">
                                        SL {formatRupees(watchlistItem.stop_loss_price)}
                                    </span>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Data Layer */}
            <div className="grid grid-cols-1 gap-4">
                <div className="space-y-1.5">
                    <div className="flex justify-between items-end">
                        <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">Fundamental Alpha</span>
                        <span className="text-base font-bold text-slate-900 dark:text-slate-100 tabular-nums">{fundamentalScore}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full transition-all duration-1500" style={{ width: `${fundamentalScore}%` }} />
                    </div>
                </div>

                <div className="space-y-1.5">
                    <div className="flex justify-between items-end">
                        <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">Technical Strength</span>
                        <span className="text-base font-bold text-slate-900 dark:text-slate-100 tabular-nums">{technicalScore}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full transition-all duration-1500" style={{ width: `${technicalScore}%` }} />
                    </div>
                </div>
            </div>

            {/* Signals Grid */}
            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <div className="p-3 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 space-y-0.5">
                    <p className="text-[9px] font-semibold text-slate-400 dark:text-slate-500">Trend</p>
                    <div className="flex items-center gap-1.5">
                        {macd === 'BULLISH' ? <ArrowUpRight size={14} className="text-emerald-500" /> : <ArrowDownRight size={14} className="text-rose-500" />}
                        <span className="font-bold text-xs text-slate-800 dark:text-slate-200">{macd.charAt(0) + macd.slice(1).toLowerCase()}</span>
                    </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50/50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 space-y-0.5">
                    <p className="text-[9px] font-semibold text-slate-400 dark:text-slate-500">Risk</p>
                    <div className="flex items-center gap-1.5">
                        <div className={cn(
                            "w-1.5 h-1.5 rounded-full",
                            riskLevel === 'LOW' ? "bg-emerald-500" : riskLevel === 'MEDIUM' ? "bg-amber-500" : "bg-rose-500"
                        )} />
                        <span className="font-bold text-xs text-slate-800 dark:text-slate-200">{riskLevel.charAt(0) + riskLevel.slice(1).toLowerCase()}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
