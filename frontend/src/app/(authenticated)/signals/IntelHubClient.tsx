'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import DashboardLayout from '@/components/DashboardLayout';
import {
    TrendingUp, TrendingDown, Zap, Radar, Layers,
    Search, ArrowRight, Activity, ChevronRight,
    Globe, Binary, BarChart3
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { StockLoader, PageLoader } from '@/components/ui/StockLoader';
import Link from 'next/link';
import { Progress } from '@/components/ui/progress';
import { DailySignalStatus } from '@/components/signals/DailySignalStatus';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { 
    Gauge, ArrowUpRight, ArrowDownRight, 
    MousePointer2, Briefcase, History, 
    Signal as SignalIcon, Info 
} from 'lucide-react';

// ─── Shared types ──────────────────────────────────────────────────────────────

/** Stored signal from GeneratedSignal model */
interface GeneratedSignal {
    id: number;
    source: 'SMART_MONEY' | 'BROKER_ACCUMULATION' | 'SMART_CROSSOVER' | 'ICHIMOKU';
    symbol: string;
    signal: 'BUY' | 'SELL';
    signal_tier: string;
    strength: number;
    ltp: string;
    target_price?: number;
    stop_loss_price?: number;
    status: 'ACTIVE' | 'WON' | 'LOST' | 'CLOSED_MANUAL';
    pnl_percent?: number;
    closed_date?: string;
    rationale: string;
    metadata: any;
    generated_date: string;
}

interface StrategySignal {
    id: number; strategy_name: string; strategy_description: string;
    symbol: string; date: string; signal: 'BUY' | 'SELL' | 'HOLD' | 'NEUTRAL';
    last_close: string; metadata: any;
}

// ─── Normalised unified signal ─────────────────────────────────────────────────

interface UnifiedSignal {
    symbol: string;
    direction: 'BUY' | 'SELL';
    ltp: number;
    target_price?: number;
    stop_loss_price?: number;
    tp1?: number;
    tp2?: number;
    tp3?: number;
    status?: 'ACTIVE' | 'WON' | 'LOST' | 'CLOSED_MANUAL';
    smartMoney?: { tier: string; markup: number; rationale: string; brokers: number };
    strategy?: { names: string[]; count: number; date: string };
    whale?: { engine: string; strength: number; reason: string; rsi?: number };
    conviction: number; // 1–3, number of agreeing sources
}

const SOURCE_LABELS: Record<string, string> = {
    'SMART_MONEY': 'Smart Money',
    'BROKER_ACCUMULATION': 'Broker Accumulation',
    'SMART_CROSSOVER': 'Smart Crossover',
    'ICHIMOKU': 'Ichimoku',
};

const WHALE_SOURCES = ['BROKER_ACCUMULATION', 'SMART_CROSSOVER', 'ICHIMOKU'] as const;

interface BatchIndicatorData {
    trends: {
        '5d': number;
        '10d': number;
        '1m': number;
    };
    rsi: number | null;
    macd: number | null;
    macd_signal: number | null;
    macd_hist: number | null;
    roc: number | null;
}

// ─── Freshness Utility ────────────────────────────────────────────────────────
const getFreshness = (dateString?: string) => {
    if (!dateString) return { status: 'historical', label: 'Historical', color: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' };
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    
    if (diffDays <= 1) return { status: 'active', label: 'Active', color: 'bg-black text-white dark:bg-white dark:text-black border border-slate-900 dark:border-white' };
    if (diffDays <= 3) return { status: 'recent', label: 'Recent', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800' };
    return { status: 'historical', label: 'Historical', color: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700' };
};

// ─── Actionability Utility ────────────────────────────────────────────────────
const getActionability = (signalPrice: number, currentPrice?: number, signal?: string) => {
    if (!currentPrice || signal === 'HOLD' || signal === 'NEUTRAL') return null;
    const change = ((currentPrice - signalPrice) / signalPrice) * 100;
    const isBuy = signal === 'BUY';
    const isSell = signal === 'SELL';
    
    if (isBuy) {
        if (change < -5) return { label: 'Invalidated', color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400 border-rose-200', status: 'invalid' };
        if (change > 3) return { label: 'Entry Missed', color: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border-slate-200', status: 'missed' };
        return { label: 'In Entry Zone', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 border-emerald-200', status: 'valid' };
    }
    if (isSell) {
        if (change > 5) return { label: 'Invalidated', color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400 border-rose-200', status: 'invalid' };
        if (change < -3) return { label: 'Entry Missed', color: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border-slate-200', status: 'missed' };
        return { label: 'In Entry Zone', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 border-emerald-200', status: 'valid' };
    }
    return null;
};

// ─── Filter Utility ───────────────────────────────────────────────────────────
const isSignalActionable = (signalPrice: number, currentPrice?: number, signalDirection?: 'BUY'|'SELL', date?: string) => {
    const freshness = getFreshness(date);
    if (freshness.status === 'historical') return false;
    if (signalDirection) {
        const action = getActionability(signalPrice, currentPrice, signalDirection);
        if (action && action.status !== 'valid') return false;
    }
    return true;
};

// ─── Helper UI pieces ──────────────────────────────────────────────────────────

function SignalBadge({ direction }: { direction: 'BUY' | 'SELL' }) {
    return (
        <span className={cn(
            'px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide',
            direction === 'BUY'
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                : 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
        )}>
            {direction === 'BUY' ? '▲ Buy' : '▼ Sell'}
        </span>
    );
}

const CONVICTION_META = [
    { label: '', color: '' },
    { label: 'Single Source', color: 'text-slate-500 dark:text-slate-400' },
    { label: 'Dual Confirmation', color: 'text-amber-600 dark:text-amber-400' },
    { label: 'Triple Conviction', color: 'text-emerald-600 dark:text-emerald-400' },
];

interface EnginePerformance {
    source: string;
    total: number;
    won: number;
    lost: number;
    active: number;
    win_rate: number;
    avg_pnl: number;
}

function SignalPerformanceStats({ stats }: { stats: EnginePerformance[] }) {
    if (!stats || stats.length === 0) return null;

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {stats.map((s) => (
                <div key={s.source} className="group relative rounded-2xl border border-slate-200/60 dark:border-slate-800/50 p-5 bg-white/50 dark:bg-slate-900/40 backdrop-blur-xl transition-all hover:shadow-xl hover:bg-white dark:hover:bg-slate-900/60">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <h4 className="text-[10px] font-bold text-slate-400 mb-1">{SOURCE_LABELS[s.source] || s.source}</h4>
                            <div className="flex items-baseline gap-2">
                                <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tighter">{s.win_rate}%</span>
                                <span className="text-[10px] font-bold text-slate-400">Win rate</span>
                            </div>
                        </div>
                        <div className={cn(
                            "px-2 py-1 rounded-lg text-[10px] font-black tracking-wider border",
                            s.avg_pnl >= 0 
                                ? "bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-900/20 dark:border-emerald-800/30" 
                                : "bg-rose-50 text-rose-600 border-rose-100 dark:bg-rose-900/20 dark:border-rose-800/30"
                        )}>
                            {s.avg_pnl > 0 ? '+' : ''}{s.avg_pnl}% Avg
                        </div>
                    </div>
                    
                    <div className="space-y-3">
                        <div className="flex justify-between items-center text-[10px] font-bold text-slate-500">
                            <span>Accuracy meter</span>
                            <span className="text-slate-400">{s.won}W / {s.lost}L</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                            <div 
                                className="h-full bg-emerald-500 transition-all duration-1000" 
                                style={{ width: `${s.win_rate}%` }} 
                            />
                            <div 
                                className="h-full bg-rose-500 transition-all duration-1000" 
                                style={{ width: `${s.total > 0 ? (s.lost / (s.won + s.lost || 1)) * 100 : 0}%` }} 
                            />
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-[10px] font-bold text-slate-400">Active setups</span>
                            <div className="flex -space-x-1">
                                {[...Array(3)].map((_, i) => (
                                    <div key={i} className={cn("w-1.5 h-1.5 rounded-full border border-white dark:border-slate-900", i < Math.ceil(s.win_rate / 33) ? "bg-black dark:bg-white" : "bg-slate-200 dark:bg-slate-700")} />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

function UnifiedSignalCard({ 
    symbol, 
    direction, 
    ltp, 
    currentPrice,
    indicators,
    date,
    strength, 
    reason, 
    tagline, 
    conviction,
    targetPrice,
    stopLoss,
    tp1,
    tp2,
    tp3,
    status,
    smartMoneyMetadata,
    onSelect 
}: { 
    symbol: string; 
    direction: 'BUY' | 'SELL'; 
    ltp: number; 
    currentPrice?: number;
    indicators?: BatchIndicatorData;
    date?: string;
    strength?: number; 
    reason?: string; 
    tagline?: string; 
    conviction?: number;
    targetPrice?: number;
    stopLoss?: number;
    tp1?: number;
    tp2?: number;
    tp3?: number;
    status?: 'ACTIVE' | 'WON' | 'LOST' | 'CLOSED_MANUAL';
    smartMoneyMetadata?: any;
    onSelect: (s: any) => void;
}) {
    const freshness = getFreshness(date);
    const action = getActionability(ltp, currentPrice, direction);
    const change = currentPrice ? ((currentPrice - ltp) / ltp) * 100 : null;
    const isSuccess = status === 'WON' || (currentPrice && ((direction === 'BUY' && change! > 0) || (direction === 'SELL' && change! < 0)));
    
    const resolvedActionLabel = status === 'WON' ? 'Target hit' : status === 'LOST' ? 'Stopped out' : action?.label;
    const resolvedActionColor = status === 'WON' ? 'bg-emerald-500 text-white' : status === 'LOST' ? 'bg-rose-500 text-white' : action?.color;

    return (
        <div 
            onClick={() => onSelect({ symbol, ltp, currentPrice, strength: strength || 50, direction, targetPrice, stopLoss, tp1, tp2, tp3, status })}
            className={cn(
                'group relative rounded-3xl border p-5 cursor-pointer transition-all hover:shadow-2xl hover:-translate-y-0.5 bg-white/70 dark:bg-slate-900/50 backdrop-blur-xl flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-6 overflow-hidden',
                direction === 'BUY' ? 'border-emerald-500/10 hover:border-emerald-500/30' : 'border-rose-500/10 hover:border-rose-500/30',
                (status === 'LOST' || (action && action.status !== 'valid' && status !== 'WON')) && 'opacity-60 hover:opacity-100'
            )}>
            

            {/* Col 1: Symbol & Context */}
            <div className="flex items-center gap-5 w-full xl:w-48 shrink-0">
                <div className="space-y-2 w-full">
                    <div className="flex items-center justify-between xl:justify-start gap-3">
                        <Link href={`/ticker/${symbol}`} onClick={(e) => e.stopPropagation()} className="text-xl font-black tracking-tighter text-slate-900 dark:text-slate-100 hover:text-black dark:hover:text-white transition-colors">
                            {symbol}
                        </Link>
                        <SignalBadge direction={direction} />
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {tagline && <span className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-900/70 dark:text-slate-300/60 text-[9px] font-bold">{tagline}</span>}
                        {conviction !== undefined && conviction > 1 && (
                            <span className={cn('px-2 py-0.5 rounded-lg text-[9px] font-black tracking-tight border', conviction >= 3 ? 'bg-amber-50 text-amber-600 border-amber-200/50' : 'bg-slate-50 text-slate-500 border-slate-200/50')}>
                                {conviction >= 3 ? 'Platinum setup' : 'Dual confirmation'}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Col 2: Rationale & Intelligence */}
            <div className="flex-1 min-w-0 flex flex-col justify-center">
                <p className="text-xs font-bold text-slate-900/60 dark:text-slate-300/40 leading-relaxed line-clamp-2 mb-2 italic">
                    &ldquo;{reason}&rdquo;
                </p>
                <div className="flex items-center gap-3">
                    {date && <span className={cn("px-2 py-0.5 rounded-lg text-[10px] font-bold", freshness.color)}>{freshness.label}</span>}
                    {smartMoneyMetadata?.cluster_count && (
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-900 dark:text-slate-200">
                            <Briefcase size={12} strokeWidth={2.5} />
                            {smartMoneyMetadata.cluster_count} brokers
                        </div>
                    )}
                </div>
            </div>

            {/* Col 3: Technical Vitals */}
            <div className="shrink-0 grid grid-cols-3 gap-6 px-6 border-x border-slate-100 dark:border-slate-800/40">
                <div className="flex flex-col items-center justify-center">
                    <span className="text-[9px] font-bold text-slate-900/40 mb-1">RSI</span>
                    <span className={cn(
                        "text-sm font-black font-mono",
                        indicators?.rsi && indicators.rsi > 70 ? "text-rose-500" : indicators?.rsi && indicators.rsi < 30 ? "text-emerald-500" : "text-slate-900 dark:text-slate-100"
                    )}>
                        {indicators?.rsi?.toFixed(1) || '--'}
                    </span>
                </div>
                <div className="flex flex-col items-center justify-center">
                    <span className="text-[9px] font-bold text-slate-900/40 mb-1">MACD</span>
                    <span className={cn(
                        "text-sm font-black font-mono",
                        indicators?.macd_hist && indicators.macd_hist > 0 ? "text-emerald-500" : "text-rose-500"
                    )}>
                        {indicators?.macd?.toFixed(1) || '--'}
                    </span>
                </div>
                <div className="flex flex-col items-center justify-center">
                    <span className="text-[9px] font-bold text-slate-900/40 mb-1">ROC</span>
                    <span className={cn(
                        "text-sm font-black font-mono",
                        indicators?.roc && indicators.roc > 0 ? "text-emerald-500" : "text-rose-500"
                    )}>
                        {indicators?.roc?.toFixed(1) || '--'}
                    </span>
                </div>
            </div>

            {/* Col 4: Performance Strides */}
            <div className="shrink-0 flex items-center gap-6 pr-6 border-r border-slate-100 dark:border-slate-800/40">
                {[
                    { label: '5d', val: indicators?.trends['5d'] },
                    { label: '10d', val: indicators?.trends['10d'] },
                    { label: '1m', val: indicators?.trends['1m'] }
                ].map(t => (
                    <div key={t.label} className="flex flex-col min-w-[32px]">
                        <span className="text-[8px] font-bold text-slate-900/40 uppercase">{t.label}</span>
                        <div className={cn(
                            "text-[10px] font-black font-mono flex items-center gap-0.5",
                            t.val !== undefined && t.val > 0 ? "text-emerald-500" : t.val !== undefined && t.val < 0 ? "text-rose-500" : "text-slate-400"
                        )}>
                            {t.val !== undefined ? (t.val > 0 ? '▲' : '▼') : ''}
                            {t.val !== undefined ? Math.abs(t.val).toFixed(0) : '--'}%
                        </div>
                    </div>
                ))}
            </div>

            {/* Col 5: Levels & Entry */}
            <div className="shrink-0 flex items-center gap-8">
                <div className="space-y-1 text-right">
                    <div className="text-[10px] font-bold text-slate-900/50 leading-none">Entry setup</div>
                    <div className="text-xl font-black font-mono text-slate-900 dark:text-slate-100 tracking-tighter leading-none">Rs. {ltp.toLocaleString()}</div>
                    {currentPrice && (
                        <div className="flex items-center justify-end gap-2 mt-1">
                            <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-black border", isSuccess ? "bg-emerald-50 text-emerald-600 border-emerald-100" : "bg-rose-50 text-rose-600 border-rose-100")}>
                                {change! > 0 ? '+' : ''}{change!.toFixed(1)}%
                            </span>
                            {resolvedActionLabel && (
                                <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-black", resolvedActionColor)}>
                                    {resolvedActionLabel}
                                </span>
                            )}
                        </div>
                    )}
                </div>
                
                <div className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-200 group-hover:bg-black dark:group-hover:bg-white dark:group-hover:text-black transition-all shadow-sm">
                    <ArrowRight size={18} strokeWidth={3} />
                </div>
            </div>
        </div>
    );
}

// ─── ALL SOURCES VIEW (reads from stored data) ────────────────────────────────

interface BaseSignalViewProps {
    onSelect: (signal: any) => void;
    liveMarketMap: Record<string, number>;
    batchIndicators: Record<string, BatchIndicatorData>;
    fetchBatchIndicators: (symbols: string[]) => Promise<void>;
    showHistorical: boolean;
}

function AllSourcesView({ onSelect, liveMarketMap, batchIndicators, fetchBatchIndicators, showHistorical }: BaseSignalViewProps) {
    const [loading, setLoading] = useState(true);
    const [unified, setUnified] = useState<UnifiedSignal[]>([]);
    const [search, setSearch] = useState('');
    const [dirFilter, setDirFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
    const [minConviction, setMinConviction] = useState(1);
    const [generatedDate, setGeneratedDate] = useState<string | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            const map = new Map<string, UnifiedSignal>();

            const upsert = (symbol: string, dir: 'BUY' | 'SELL', ltp: number) => {
                const existing = map.get(symbol);
                if (!existing) map.set(symbol, { symbol, direction: dir, ltp, conviction: 0 });
                return map.get(symbol)!;
            };

            try {
                const [genRes, stRes] = await Promise.all([
                    api.get('/api/stocks/generated-signals/latest/').catch(() => null),
                    api.get('/api/stocks/signals/', { params: { page_size: 500 } }).catch(() => null),
                ]);

                // Process stored generated signals (Smart Money + Whale Watch)
                if (genRes?.data) {
                    for (const sig of genRes.data as GeneratedSignal[]) {
                        const ltp = parseFloat(sig.ltp) || 0;
                        const u = upsert(sig.symbol, sig.signal, ltp);
                        
                        // Push up the tracking fields to Unified Signal
                        if (sig.target_price) u.target_price = sig.target_price;
                        if (sig.stop_loss_price) u.stop_loss_price = sig.stop_loss_price;
                        if (sig.status) u.status = sig.status;

                        if (sig.source === 'SMART_MONEY') {
                            u.smartMoney = {
                                tier: sig.signal_tier,
                                markup: sig.metadata?.markup_percent || 0,
                                rationale: sig.rationale,
                                brokers: sig.metadata?.cluster_count || 0,
                            };
                            u.conviction++;
                        } else {
                            // Whale Watch engines
                            u.whale = {
                                engine: SOURCE_LABELS[sig.source] || sig.source,
                                strength: sig.strength,
                                reason: sig.rationale,
                                rsi: sig.metadata?.rsi,
                            };
                            u.conviction++;
                        }

                        // Extract detailed trade plan from metadata
                        if (sig.metadata?.tp1) u.tp1 = sig.metadata.tp1;
                        if (sig.metadata?.tp2) u.tp2 = sig.metadata.tp2;
                        if (sig.metadata?.tp3) u.tp3 = sig.metadata.tp3;
                        if (sig.metadata?.sl) u.stop_loss_price = sig.metadata.sl;

                        if (!generatedDate && sig.generated_date) {
                            setGeneratedDate(sig.generated_date);
                        }
                    }
                }

                // Process strategy signals (already stored in StrategySignal model)
                if (stRes?.data?.results) {
                    const grouped = new Map<string, { dir: 'BUY' | 'SELL'; names: string[]; date: string; ltp: number }>();
                    for (const s of stRes.data.results as StrategySignal[]) {
                        if (s.signal !== 'BUY' && s.signal !== 'SELL') continue;
                        const existing = grouped.get(s.symbol);
                        if (!existing) {
                            grouped.set(s.symbol, { dir: s.signal, names: [s.strategy_name], date: s.date, ltp: parseFloat(s.last_close) });
                        } else {
                            existing.names.push(s.strategy_name);
                            if (s.signal === 'BUY') existing.dir = 'BUY';
                        }
                    }
                    for (const [symbol, data] of grouped) {
                        const u = upsert(symbol, data.dir, data.ltp);
                        u.strategy = { names: data.names, count: data.names.length, date: data.date };
                        u.conviction++;
                    }
                }
            } catch (_) { }

            const sorted = [...map.values()].sort((a, b) => b.conviction - a.conviction || b.ltp - a.ltp);
            setUnified(sorted);
            // Trigger batch fetch for technicals
            const symbols = Array.from(new Set(sorted.map(s => s.symbol)));
            fetchBatchIndicators(symbols);
            setLoading(false);
        };
        fetchData();
    }, []);

    const filtered = useMemo(() => unified.filter(u => {
        if (u.conviction < minConviction) return false;
        if (dirFilter !== 'ALL' && u.direction !== dirFilter) return false;
        if (search && !u.symbol.toLowerCase().includes(search.toLowerCase())) return false;
        if (!showHistorical) {
            const actionable = isSignalActionable(u.ltp, liveMarketMap[u.symbol], u.direction, u.strategy?.date || generatedDate || undefined);
            if (!actionable) return false;
        }
        return true;
    }), [unified, search, dirFilter, minConviction, showHistorical, liveMarketMap, generatedDate]);

    const buys = unified.filter(u => u.direction === 'BUY').length;
    const sells = unified.filter(u => u.direction === 'SELL').length;
    const multiSource = unified.filter(u => u.conviction >= 2).length;

    if (loading) return <PageLoader text="Loading stored intelligence…" />;

    return (
        <div className="space-y-6">
            {generatedDate && (
                <div className="text-[10px] font-black text-slate-400 tracking-widest">
                    Intelligence data from {generatedDate}
                </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Buy Signals', value: buys, icon: <TrendingUp size={14} />, color: 'text-emerald-500', bg: 'bg-emerald-500/10 border-emerald-500/20' },
                    { label: 'Sell Signals', value: sells, icon: <TrendingDown size={14} />, color: 'text-rose-500', bg: 'bg-rose-500/10 border-rose-500/20' },
                    { label: 'Multi-Source', value: multiSource, icon: <Activity size={14} />, color: 'text-amber-500', bg: 'bg-amber-500/10 border-amber-500/20' },
                    { label: 'Intelligence', value: unified.length, icon: <Radar size={14} />, color: 'text-slate-900 dark:text-white', bg: 'bg-slate-900/10 dark:bg-white/10 border-slate-900/20 dark:border-white/20' },
                ].map(m => (
                    <div key={m.label} className={cn('rounded-2xl border p-5 backdrop-blur-xl transition-all hover:scale-[1.02]', m.bg)}>
                        <div className="flex justify-between items-center mb-2">
                            <span className={cn('p-1.5 rounded-lg bg-white/50 dark:bg-slate-900/50', m.color)}>{m.icon}</span>
                            <div className={cn('text-2xl font-black', m.color)}>{m.value}</div>
                        </div>
                        <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400">{m.label}</div>
                    </div>
                ))}
            </div>

            <div className="flex flex-wrap gap-4 items-center justify-between">
                <div className="flex flex-wrap gap-4 items-center">
                    <div className="flex p-1 bg-slate-100/50 dark:bg-slate-800/40 rounded-xl border border-slate-200/50 dark:border-slate-700/50 backdrop-blur-sm">
                        {(['ALL', 'BUY', 'SELL'] as const).map(d => (
                            <button key={d} onClick={() => setDirFilter(d)}
                                className={cn('px-4 py-2 rounded-lg text-xs font-bold transition-all',
                                    dirFilter === d ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm border border-slate-200/50 dark:border-slate-600/50' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200')}>
                                {d}
                            </button>
                        ))}
                    </div>
                </div>
                
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 p-1 bg-slate-100/50 dark:bg-slate-800/40 rounded-xl border border-slate-200/50 dark:border-slate-700/50 backdrop-blur-sm">
                        <span className="text-[10px] font-bold text-slate-400 px-2">Threshold</span>
                        {[1, 2, 3].map(n => (
                            <button key={n} onClick={() => setMinConviction(n)}
                                className={cn('w-8 h-8 rounded-lg text-xs font-black transition-all flex items-center justify-center',
                                    minConviction === n ? 'bg-black text-white dark:bg-white dark:text-black shadow-lg shadow-slate-200 border-slate-900' : 'text-slate-500 hover:text-black dark:hover:text-white')}>
                                {n}
                            </button>
                        ))}
                    </div>
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" strokeWidth={2.5} />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Symbol…"
                            className="pl-9 pr-4 py-2 text-xs font-medium rounded-xl border border-slate-200/50 dark:border-slate-700/50 bg-white/50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-slate-900/30 w-64" />
                    </div>
                </div>
            </div>

            {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-3xl">
                    <Layers className="w-8 h-8 text-slate-200 dark:text-slate-700 mb-3" />
                    <p className="text-xs font-bold text-slate-400">No matching intelligence found</p>
                    <p className="text-[10px] text-slate-400 mt-2">Run &quot;Generate All Intel Signals&quot; from the Pipeline page to populate data.</p>
                </div>
            ) : (
                <div className="grid gap-3 animate-in fade-in slide-in-from-top-2 duration-500">
                    {filtered.map(u => (
                        <UnifiedSignalCard 
                            key={u.symbol}
                            symbol={u.symbol}
                            direction={u.direction}
                            ltp={u.ltp}
                            currentPrice={liveMarketMap[u.symbol]}
                            date={u.strategy?.date || generatedDate || undefined}
                            strength={u.whale?.strength || (u.smartMoney ? u.smartMoney.markup + 50 : 50)}
                            conviction={u.conviction}
                            reason={u.smartMoney?.rationale || u.whale?.reason || u.strategy?.names.join(' · ') || 'System Breakout'}
                            tagline={u.smartMoney?.tier || (u.strategy ? `${u.strategy.count} Strategies` : 'Whale Accumulation')}
                            targetPrice={u.target_price}
                            stopLoss={u.stop_loss_price}
                            tp1={u.tp1}
                            tp2={u.tp2}
                            tp3={u.tp3}
                            status={u.status}
                            indicators={batchIndicators[u.symbol]}
                            smartMoneyMetadata={u.smartMoney}
                            onSelect={onSelect}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── SMART MONEY VIEW (reads from stored GeneratedSignal with source=SMART_MONEY) ─

function SmartMoneyView({ onSelect, liveMarketMap, batchIndicators, fetchBatchIndicators, showHistorical }: BaseSignalViewProps) {
    const [signals, setSignals] = useState<GeneratedSignal[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeSection, setActiveSection] = useState('platinum');

    useEffect(() => {
        api.get('/api/stocks/generated-signals/latest/', { params: { source: 'SMART_MONEY' } })
            .then(r => setSignals(r.data ?? []))
            .catch(() => { })
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <Loader size />;

    const filterFn = (s: GeneratedSignal, tier: string) => {
        if (s.signal_tier !== tier) return false;
        if (!showHistorical && !isSignalActionable(parseFloat(s.ltp) || 0, liveMarketMap[s.symbol], s.signal, s.generated_date)) return false;
        return true;
    };

    const sections = [
        { id: 'platinum', label: 'Platinum', badge: 'Optimal Entry', dot: 'bg-black dark:bg-white', badgeCls: 'bg-slate-950 text-white border-slate-800 dark:bg-white dark:text-black dark:border-slate-200', items: signals.filter(s => filterFn(s, 'Platinum Buy')) },
        { id: 'gold', label: 'Gold', badge: 'High Conviction', dot: 'bg-amber-500', badgeCls: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300', items: signals.filter(s => filterFn(s, 'Gold Signal')) },
        { id: 'silver', label: 'Silver', badge: 'Institutional Entry', dot: 'bg-slate-400', badgeCls: 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300', items: signals.filter(s => filterFn(s, 'Silver Signal')) },
        { id: 'divergence', label: 'Divergence', badge: 'Bullish Divergence', dot: 'bg-emerald-500', badgeCls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300', items: signals.filter(s => filterFn(s, 'Bullish Divergence')) },
    ];

    const current = sections.find(s => s.id === activeSection) || sections[0];

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap gap-2 p-1 bg-slate-100/50 dark:bg-slate-800/40 rounded-xl w-fit border border-slate-200/50 dark:border-slate-700/50 backdrop-blur-sm">
                {sections.map(s => (
                    <button
                        key={s.id}
                        onClick={() => setActiveSection(s.id)}
                        className={cn(
                            'flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all',
                            activeSection === s.id
                                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm border border-slate-200/50 dark:border-slate-600/50'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                        )}
                    >
                        <span className={cn('w-2 h-2 rounded-full shadow-sm', s.dot)} />
                        {s.label}
                        <span className="ml-1 opacity-50 px-1.5 py-0.5 rounded-md bg-slate-200/50 dark:bg-slate-900/50 text-[10px]">{s.items.length}</span>
                    </button>
                ))}
            </div>

            <div className="animate-in fade-in slide-in-from-top-2 duration-500">
                <div className="flex items-center gap-2 mb-5">
                    <h3 className="text-sm font-bold text-slate-400">{current.label} setups</h3>
                    <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full border', current.badgeCls)}>{current.badge}</span>
                </div>
                
                {current.items.length === 0
                    ? <Empty label={`No ${current.label} signals right now`} />
                    : <div className="grid grid-cols-1 gap-3">
                        {current.items.map(sig => (
                            <UnifiedSignalCard 
                                key={sig.symbol}
                                symbol={sig.symbol}
                                direction={sig.signal}
                                ltp={parseFloat(sig.ltp) || 0}
                                currentPrice={liveMarketMap[sig.symbol]}
                                date={sig.generated_date}
                                strength={sig.strength}
                                reason={sig.rationale}
                                tagline={sig.signal_tier}
                                conviction={sig.signal_tier === 'Platinum Buy' ? 3 : sig.signal_tier === 'Gold Signal' ? 2 : 1}
                                targetPrice={sig.target_price}
                                stopLoss={sig.stop_loss_price}
                                status={sig.status}
                                indicators={batchIndicators[sig.symbol]}
                                smartMoneyMetadata={sig.metadata}
                                onSelect={onSelect}
                            />
                        ))}
                    </div>
                }
            </div>
        </div>
    );
}


// ─── STRATEGIES VIEW (already reads from stored StrategySignal) ───────────────

function StrategiesView({ onSelect, liveMarketMap, batchIndicators, fetchBatchIndicators, showHistorical }: BaseSignalViewProps) {
    const [signals, setSignals] = useState<StrategySignal[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<'ALL' | 'BUY' | 'SELL' | 'HOLD'>('ALL');
    const router = useRouter();

    useEffect(() => {
        api.get('/api/stocks/signals/', { params: { page_size: 500 } })
            .then(r => setSignals(r.data?.results ?? []))
            .catch(() => { })
            .finally(() => setLoading(false));
    }, []);

    const groups = useMemo(() => {
        const map = new Map<string, StrategySignal[]>();
        for (const s of signals) {
            if (filter !== 'ALL' && s.signal !== filter) continue;
            if (search && !s.symbol.toLowerCase().includes(search.toLowerCase())) continue;
            if (!showHistorical && !isSignalActionable(parseFloat(s.last_close) || 0, liveMarketMap[s.symbol], s.signal as 'BUY'|'SELL', s.date)) continue;
            (map.get(s.symbol) ?? map.set(s.symbol, []).get(s.symbol)!).push(s);
        }
        return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
    }, [signals, filter, search, showHistorical, liveMarketMap]);

    if (loading) return <Loader size />;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap gap-4 items-center justify-between">
                <div className="flex p-1 bg-slate-100/50 dark:bg-slate-800/40 rounded-xl border border-slate-200/50 dark:border-slate-700/50 backdrop-blur-sm">
                    {(['ALL', 'BUY', 'SELL', 'HOLD'] as const).map(d => (
                        <button key={d} onClick={() => setFilter(d)}
                            className={cn('px-4 py-2 rounded-lg text-xs font-bold transition-all',
                                filter === d ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm border border-slate-200/50 dark:border-slate-600/50' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200')}>
                            {d}
                        </button>
                    ))}
                </div>
                <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" strokeWidth={2.5} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter symbol…"
                        className="pl-9 pr-4 py-2 text-xs font-medium rounded-xl border border-slate-200/50 dark:border-slate-700/50 bg-white/50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-slate-900/30 w-64 backdrop-blur-sm transition-all" />
                </div>
            </div>

            {groups.length === 0 ? <Empty label="No strategy signals match filters" /> : (
                <div className="grid gap-3 animate-in fade-in slide-in-from-top-2 duration-500">
                    {groups.map(([symbol, sigs]) => {
                        const buySigs = sigs.filter(s => s.signal === 'BUY');
                        const sellSigs = sigs.filter(s => s.signal === 'SELL');
                        const dominant = buySigs.length >= sellSigs.length ? 'BUY' : 'SELL';
                        const ltp = parseFloat(sigs[0]?.last_close ?? '0');
                        return (
                            <UnifiedSignalCard 
                                key={symbol}
                                symbol={symbol}
                                direction={dominant as 'BUY' | 'SELL'}
                                ltp={ltp}
                                currentPrice={liveMarketMap[symbol]}
                                date={sigs[0]?.date}
                                strength={70}
                                reason={sigs[0]?.strategy_description || sigs.map(s => s.strategy_name).join(' · ')}
                                tagline={`${sigs.length} Strategy Signals`}
                                indicators={batchIndicators[symbol]}
                                onSelect={onSelect}
                            />
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ─── WHALE WATCH VIEW (reads from stored GeneratedSignal with whale sources) ──

function WhaleWatchView({ onSelect, liveMarketMap, batchIndicators, fetchBatchIndicators, showHistorical }: BaseSignalViewProps) {
    const [sourceIdx, setSourceIdx] = useState(0);
    const [signals, setSignals] = useState<GeneratedSignal[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    const currentSource = WHALE_SOURCES[sourceIdx];

    useEffect(() => {
        setLoading(true);
        api.get('/api/stocks/generated-signals/latest/', { params: { source: currentSource } })
            .then(r => setSignals(r.data ?? []))
            .catch(() => setSignals([]))
            .finally(() => setLoading(false));
    }, [currentSource]);

    const filtered = useMemo(() =>
        signals.filter(s => {
            if (search && !s.symbol.toLowerCase().includes(search.toLowerCase())) return false;
            if (!showHistorical && !isSignalActionable(parseFloat(s.ltp) || 0, liveMarketMap[s.symbol], s.signal, s.generated_date)) return false;
            return true;
        }).sort((a, b) => b.strength - a.strength),
        [signals, search, showHistorical, liveMarketMap]);

    const buys = filtered.filter(r => r.signal === 'BUY');
    const sells = filtered.filter(r => r.signal === 'SELL');

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap gap-4 items-center justify-between">
                <div className="flex flex-wrap gap-2 p-1 bg-slate-100/50 dark:bg-slate-800/40 rounded-xl border border-slate-200/50 dark:border-slate-700/50 backdrop-blur-sm">
                    {WHALE_SOURCES.map((src, i) => (
                        <button key={src} onClick={() => setSourceIdx(i)}
                            className={cn('px-4 py-2 rounded-lg text-xs font-bold transition-all',
                                sourceIdx === i 
                                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm border border-slate-200/50 dark:border-slate-600/50' 
                                    : 'text-slate-900/50 dark:text-slate-400/40 hover:text-black dark:hover:text-white')}>
                            {SOURCE_LABELS[src]}
                        </button>
                    ))}
                </div>
                
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-900/40 dark:text-slate-400/40" strokeWidth={2.5} />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter symbol…"
                            className="pl-9 pr-4 py-2 text-xs font-medium rounded-xl border border-slate-200/50 dark:border-slate-700/50 bg-white/50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-slate-900/30 w-64 backdrop-blur-sm transition-all" />
                    </div>
                </div>
            </div>

            <div className="flex gap-4 text-[10px] font-black tracking-widest">
                <div className="flex items-center gap-1.5 text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-100 dark:border-emerald-500/20">{buys.length} Buy signals</div>
                <div className="flex items-center gap-1.5 text-rose-500 bg-rose-50 dark:bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-100 dark:border-rose-500/20">{sells.length} Sell signals</div>
            </div>

            {loading ? <Loader size /> : filtered.length === 0 ? <Empty label="No signals from this engine. Run pipeline to generate." /> : (
                <div className="grid gap-2 animate-in fade-in slide-in-from-top-2 duration-500">
                    {filtered.map(sig => (
                        <UnifiedSignalCard 
                            key={sig.symbol}
                            symbol={sig.symbol}
                            direction={sig.signal}
                            ltp={parseFloat(sig.ltp) || 0}
                            currentPrice={liveMarketMap[sig.symbol]}
                            date={sig.generated_date}
                            strength={sig.strength}
                            reason={sig.rationale}
                            tagline={SOURCE_LABELS[sig.source]}
                            targetPrice={sig.target_price}
                            stopLoss={sig.stop_loss_price}
                            status={sig.status}
                            indicators={batchIndicators[sig.symbol]}
                            onSelect={onSelect}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Micro helpers ─────────────────────────────────────────────────────────────

function Loader({ size }: { size?: boolean }) {
    return (
        <div className="flex justify-center items-center py-16">
            <StockLoader size={size ? 'md' : 'sm'} />
        </div>
    );
}

function Empty({ label }: { label: string }) {
    return (
        <div className="flex items-center justify-center py-16 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
            <p className="text-sm text-slate-900/40 dark:text-slate-400/40">{label}</p>
        </div>
    );
}

// ─── ROOT ──────────────────────────────────────────────────────────────────────

const TABS = [
    { key: 'all', label: 'Command Center', icon: <Radar size={16} />, desc: 'Stored alpha discovery from across the market ecosystem.' },
    { key: 'smart', label: 'Smart Money', icon: <Zap size={16} />, desc: 'Institutional broker flow and professional accumulation zones.' },
    { key: 'whale', label: 'Whale Watch', icon: <Activity size={16} />, desc: 'Deep technical analysis and large order execution tracking.' },
    { key: 'strategies', label: 'Strategies', icon: <Binary size={16} />, desc: 'Quantitative signal engines and automated technical setups.' },
];

export default function IntelHubClient() {
    const [tab, setTab] = useState('all');
    const [selectedSignal, setSelectedSignal] = useState<{ 
        symbol: string; 
        ltp: number; 
        currentPrice?: number;
        strength: number; 
        direction: 'BUY' | 'SELL';
        targetPrice?: number;
        stopLoss?: number;
        tp1?: number;
        tp2?: number;
        tp3?: number;
        status?: string;
    } | null>(null);
    const [liveMarketMap, setLiveMarketMap] = useState<Record<string, number>>({});
    const [batchIndicators, setBatchIndicators] = useState<Record<string, BatchIndicatorData>>({});
    const [showHistorical, setShowHistorical] = useState(false);
    const [performance, setPerformance] = useState<EnginePerformance[]>([]);

    // ─── Batch Indicator Logic ───
    const fetchBatchIndicators = async (symbols: string[]) => {
        if (!symbols.length) return;
        try {
            const res = await api.get('/api/stocks/batch-indicators/', {
                params: { symbols: symbols.join(',') }
            });
            setBatchIndicators(prev => ({ ...prev, ...res.data }));
        } catch (err) {
            console.error("Failed to fetch batch indicators", err);
        }
    };

    useEffect(() => {
        // Fetch live prices
        api.get('/api/stocks/summary/').then(res => {
            const d = res.data;
            const map: Record<string, number> = {};
            [...(d.top_gainers||[]), ...(d.top_losers||[]), ...(d.top_volume||[]), ...(d.top_turnover||[])].forEach((s: any) => {
                if (s.ticker && s.close) map[s.ticker] = s.close;
            });
            setLiveMarketMap(map);
        }).catch(err => console.error("Failed fetching summary for live prices", err));

        // Fetch engine performance
        api.get('/api/stocks/generated-signals/performance/')
            .then(res => setPerformance(res.data || []))
            .catch(err => console.error("Failed fetching performance stats", err));
    }, []);

    // Effect to trigger batch fetch when signals might have changed or tab changed
    // We'll trust the individual views to tell us which symbols they need, or just fetch all unique symbols once data is loaded.
    // Simplifying: the views fetch their own data, so we might need a way to bubble up symbols.
    // For now, let's keep it simple and the views can call the shared fetchBatchIndicators.

    return (
        <DashboardLayout
            title={<span className="flex items-center gap-3 text-3xl font-black tracking-tighter text-slate-900 dark:text-white">Signal Intelligence</span>}
            subtitle={TABS.find(t => t.key === tab)?.desc}
        >
            <div className="space-y-8 pb-20">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    {/* Navigation bar */}
                    <div className="flex flex-wrap gap-2 p-1.5 bg-slate-100/50 dark:bg-slate-900/50 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 backdrop-blur-xl w-fit">
                        {TABS.map(t => (
                            <button
                                key={t.key}
                                onClick={() => setTab(t.key)}
                                className={cn(
                                    'flex items-center gap-2.5 px-6 py-3 rounded-xl text-xs font-black transition-all group overflow-hidden relative',
                                    tab === t.key
                                        ? 'bg-white dark:bg-slate-800 text-black dark:text-white shadow-xl shadow-slate-200/30 dark:shadow-none border border-slate-200/50 dark:border-slate-700/50'
                                        : 'text-slate-900/40 dark:text-slate-400/40 hover:text-black dark:hover:text-white hover:bg-white/50 dark:hover:bg-slate-800/50'
                                )}
                            >
                                <span className={cn('transition-transform duration-500 group-hover:scale-125', tab === t.key ? 'text-black dark:text-white' : 'text-slate-400/50')}>
                                    {t.icon}
                                </span>
                                <span className="relative z-10">{t.label}</span>
                                {tab === t.key && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-black/50 dark:bg-white/50" />}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-2 px-2">
                        <span className="text-xs font-bold text-slate-900/40 dark:text-slate-400/30 tracking-widest hidden sm:block uppercase">Historical</span>
                        <button
                            onClick={() => setShowHistorical(!showHistorical)}
                            className={cn(
                                "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black border border-transparent shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]",
                                showHistorical ? "bg-black dark:bg-white" : "bg-slate-200 dark:bg-slate-700"
                            )}
                            role="switch"
                            aria-checked={showHistorical}
                        >
                            <span className="sr-only">Toggle historical signals</span>
                            <span 
                                className={cn(
                                    "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                                    showHistorical ? "translate-x-2" : "-translate-x-2"
                                ) || ""} 
                            />
                        </button>
                    </div>
                </div>

                {/* Performance Dashboard */}
                <SignalPerformanceStats stats={performance} />

                {/* Main Content Area with staggered animation */}
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-700">
                    {tab === 'all'        && <AllSourcesView onSelect={setSelectedSignal} liveMarketMap={liveMarketMap} batchIndicators={batchIndicators} fetchBatchIndicators={fetchBatchIndicators} showHistorical={showHistorical} />}
                    {tab === 'smart'      && <SmartMoneyView onSelect={setSelectedSignal} liveMarketMap={liveMarketMap} batchIndicators={batchIndicators} fetchBatchIndicators={fetchBatchIndicators} showHistorical={showHistorical} />}
                    {tab === 'strategies' && <StrategiesView onSelect={setSelectedSignal} liveMarketMap={liveMarketMap} batchIndicators={batchIndicators} fetchBatchIndicators={fetchBatchIndicators} showHistorical={showHistorical} />}
                    {tab === 'whale'      && <WhaleWatchView onSelect={setSelectedSignal} liveMarketMap={liveMarketMap} batchIndicators={batchIndicators} fetchBatchIndicators={fetchBatchIndicators} showHistorical={showHistorical} />}
                </div>
            </div>

            {/* Premium Details Modal */}
            <Dialog open={!!selectedSignal} onOpenChange={() => setSelectedSignal(null)}>
                <DialogContent className="w-[90vw] h-[90vh] max-w-none sm:max-w-none p-0 overflow-hidden border-none bg-transparent shadow-none">
                    {selectedSignal && (
                        <DailySignalStatus 
                            symbol={selectedSignal.symbol}
                            cmp={selectedSignal.currentPrice || selectedSignal.ltp}
                            entryPrice={selectedSignal.ltp}
                            strength={selectedSignal.strength}
                            direction={selectedSignal.direction}
                            targetPrice={selectedSignal.targetPrice}
                            stopLoss={selectedSignal.stopLoss}
                            tp1={selectedSignal.tp1}
                            tp2={selectedSignal.tp2}
                            tp3={selectedSignal.tp3}
                            status={selectedSignal.status}
                            className="shadow-2xl border-slate-200 dark:border-slate-800"
                        />
                    )}
                </DialogContent>
            </Dialog>
        </DashboardLayout>
    );
}
