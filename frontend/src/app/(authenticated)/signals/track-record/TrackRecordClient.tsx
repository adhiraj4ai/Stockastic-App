'use client';

import { useState, useEffect, useMemo } from 'react';
import api from '@/lib/api';
import {
    Activity, CheckCircle2, Search, Target, Trophy,
    Shield, TrendingUp, TrendingDown, ArrowRight,
    AlertCircle, BarChart3, Clock, ChevronDown, ChevronUp,
    X, Flame, Zap, Award, Eye
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { num, fixed, formatPrice } from '@/lib/numbers';
import { PageLoader } from '@/components/ui/StockLoader';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────

interface EnginePerformance {
    source: string;
    total: number;
    won: number;
    lost: number;
    active: number;
    win_rate: number;
    avg_pnl: number;
    avg_win_pnl: number;
    avg_loss_pnl: number;
}

interface DetailedEngine {
    source: string; total: number; won: number; lost: number; active: number;
    win_rate: number; avg_win_pnl: number; avg_loss_pnl: number;
    profit_factor: number; expectancy: number;
    max_consecutive_wins: number; max_consecutive_losses: number;
    avg_days_to_close: number; best_signal_pnl: number; worst_signal_pnl: number;
    consistency_score: number;
    monthly_performance: { month: string; won: number; lost: number; pnl: number }[];
    pnl_distribution: Record<string, number>;
    buy_stats: { total: number; won: number; lost: number; active: number; win_rate: number };
    sell_stats: { total: number; won: number; lost: number; active: number; win_rate: number };
    top_symbols: string[]; worst_symbols: string[];
}

interface OverallStats {
    total_signals: number; total_resolved: number; overall_win_rate: number;
    total_profit_pnl: number; total_loss_pnl: number; net_pnl: number;
    best_engine: string | null; worst_engine: string | null;
}

interface GeneratedSignal {
    id: number;
    source: string;
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

// ─── Constants ────────────────────────────────────────────────────

const SOURCE_LABELS: Record<string, string> = {
    SMART_MONEY: 'Smart Money',
    BROKER_ACCUMULATION: 'Broker Accumulation',
    SMART_CROSSOVER: 'Smart Crossover',
    ICHIMOKU: 'Ichimoku',
    PRICE_ACTION: 'Price Action',
    MEAN_REVERSAL: 'Mean Reversal',
    RSI_DIVERGENCE: 'RSI Divergence',
    MACD_DIVERGENCE: 'MACD Divergence',
    DOW_SIGNAL: 'Dow Signal',
};

const SOURCES = Object.entries(SOURCE_LABELS).map(([key, label]) => ({ key, label }));
const STATUSES = ['WON', 'LOST', 'ACTIVE', 'CLOSED_MANUAL'] as const;
const STATUS_LABELS: Record<string, string> = {
    WON: 'Won',
    LOST: 'Lost',
    ACTIVE: 'Active',
    CLOSED_MANUAL: 'Closed',
};

// ─── Helpers ──────────────────────────────────────────────────────

function calcExitPrice(sig: GeneratedSignal): number | null {
    const entry = parseFloat(sig.ltp) || 0;
    const pnl = sig.pnl_percent != null ? parseFloat(sig.pnl_percent as any) : null;
    if (!entry || pnl == null) return null;
    const multiplier = sig.signal === 'BUY' ? (1 + pnl / 100) : (1 - pnl / 100);
    return entry * multiplier;
}

function fmt(n?: number | null): string {
    if (n == null || isNaN(n)) return '—';
    return 'रू' + n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 1 });
}

function resolveHitLevel(sig: GeneratedSignal, exitPrice: number): string | null {
    if (sig.status !== 'WON') return null;
    const isBuy = sig.signal === 'BUY';
    const metadata = sig.metadata || {};
    const tp1 = metadata.tp1 ? parseFloat(metadata.tp1) : null;
    const tp2 = metadata.tp2 ? parseFloat(metadata.tp2) : null;
    const tp3 = metadata.tp3 ? parseFloat(metadata.tp3) : null;
    const target = sig.target_price ? parseFloat(sig.target_price as any) : null;

    const cleared = (level: number) =>
        isBuy ? exitPrice >= level * 0.97 : exitPrice <= level * 1.03;

    if (tp3 && cleared(tp3)) return isBuy ? 'TP3' : 'D3';
    if (tp2 && cleared(tp2)) return isBuy ? 'TP2' : 'D2';
    if (tp1 && cleared(tp1)) return isBuy ? 'TP1' : 'D1';
    if (target && cleared(target)) return isBuy ? 'Target' : 'Demand';
    return 'Partial';
}

// ─── Price Ladder (Horizontal Execution Timeline) ───────────────

function PriceLadder({ sig }: { sig: GeneratedSignal }) {
    const entry = parseFloat(sig.ltp) || 0;
    const exitPrice = calcExitPrice(sig);
    const metadata = sig.metadata || {};
    const tp1 = metadata.tp1 ? parseFloat(metadata.tp1) : null;
    const tp2 = metadata.tp2 ? parseFloat(metadata.tp2) : null;
    const tp3 = metadata.tp3 ? parseFloat(metadata.tp3) : null;
    const sl = sig.stop_loss_price ? parseFloat(sig.stop_loss_price as any) : (metadata.sl ? parseFloat(metadata.sl) : null);
    const target = sig.target_price ? parseFloat(sig.target_price as any) : null;
    const isBuy = sig.signal === 'BUY';
    const isLost = sig.status === 'LOST';

    const tpCleared = (level: number) => {
        if (!exitPrice || sig.status !== 'WON' || isNaN(exitPrice)) return false;
        return isBuy ? exitPrice >= level * 0.97 : exitPrice <= level * 1.03;
    };

    const levels: { label: string; price: number; type: 'tp' | 'sl' | 'entry' }[] = [];

    const getLabel = (base: string) => {
        if (isBuy) return base;
        if (base === 'SL') return 'STOP';
        if (base === 'TP1') return 'D1';
        if (base === 'TP2') return 'D2';
        if (base === 'TP3') return 'D3';
        if (base === 'Target') return 'Demand';
        return base;
    };

    if (sl) levels.push({ label: getLabel('SL'), price: sl, type: 'sl' });
    levels.push({ label: isBuy ? 'Entry' : 'Sell @', price: entry, type: 'entry' });

    if (tp1) levels.push({ label: getLabel('TP1'), price: tp1, type: 'tp' });
    if (tp2) levels.push({ label: getLabel('TP2'), price: tp2, type: 'tp' });
    if (tp3) levels.push({ label: getLabel('TP3'), price: tp3, type: 'tp' });
    if (!tp1 && !tp2 && !tp3 && target) levels.push({ label: getLabel('Target'), price: target, type: 'tp' });

    if (levels.length < 2) {
        return (
            <div className="flex items-center gap-3 py-2">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <AlertCircle size={11} className="text-amber-500" />
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">Awaiting Levels</span>
                </div>
                {entry > 0 && (
                    <span className="text-[10px] font-mono text-slate-500 font-semibold">Entry: {fmt(entry)}</span>
                )}
            </div>
        );
    }

    // Sort by price ascending so the ladder reads low → high visually
    levels.sort((a, b) => a.price - b.price);

    return (
        <div className="relative flex items-center gap-12 py-6 px-2 min-w-[300px]">
            <div className="absolute left-[30px] right-[30px] top-[50%] h-[1px] bg-slate-200 dark:bg-slate-800 -translate-y-1/2" />

            {levels.map(({ label, price, type }) => {
                const isHitTp = type === 'tp' && tpCleared(price);
                const isHitSl = type === 'sl' && isLost;
                const isEntry = type === 'entry';

                return (
                    <div key={label} className="relative flex flex-col items-center flex-1">
                        <div className={cn(
                            "w-2.5 h-2.5 rounded-full border-2 bg-white dark:bg-slate-900 z-10 transition-all",
                            isHitTp ? "border-emerald-500 bg-emerald-500 scale-125" :
                            isHitSl ? "border-rose-500 bg-rose-500 scale-125" :
                            isEntry ? "border-slate-400 bg-slate-400" :
                            "border-slate-200 dark:border-slate-800"
                        )} />

                        <span className={cn(
                            "absolute -top-5 text-[9px] font-bold uppercase tracking-wider whitespace-nowrap",
                            type === 'sl' ? "text-rose-500" :
                            isEntry ? "text-slate-500" :
                            isHitTp ? "text-emerald-500" : "text-slate-400"
                        )}>
                            {label}
                        </span>

                        <span className={cn(
                            "absolute -bottom-5 text-[10px] font-mono font-semibold tabular-nums whitespace-nowrap",
                            isHitTp ? "text-emerald-600 dark:text-emerald-400" :
                            isHitSl ? "text-rose-600 dark:text-rose-400" :
                            isEntry ? "text-slate-900 dark:text-slate-100" :
                            "text-slate-500 dark:text-slate-400"
                        )}>
                            {fmt(price)}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

// ─── Result Cell ──────────────────────────────────────────────────

function ResultCell({ sig }: { sig: GeneratedSignal }) {
    const entry = parseFloat(sig.ltp) || 0;
    const exitPrice = calcExitPrice(sig);
    const hitLevel = exitPrice ? resolveHitLevel(sig, exitPrice) : null;
    const metadata = sig.metadata || {};
    const sl = sig.stop_loss_price ? parseFloat(sig.stop_loss_price as any) : (metadata.sl ? parseFloat(metadata.sl) : null);
    const isBuy = sig.signal === 'BUY';

    if (sig.status === 'ACTIVE') {
        return (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20 w-fit">
                <Activity size={12} className="animate-pulse" />
                <span className="text-[10px] font-bold uppercase tracking-wider">In Progress</span>
            </div>
        );
    }

    if (sig.status === 'WON' && exitPrice) {
        return (
            <div className="space-y-3 flex flex-col items-center">
                <div className={cn(
                    "inline-flex items-center gap-2 px-3 py-1.5 rounded-full border",
                    isBuy ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-blue-500/10 text-blue-500 border-blue-500/20"
                )}>
                    {isBuy ? <Trophy size={11} /> : <AlertCircle size={11} />}
                    <span className="text-[9px] font-bold uppercase tracking-wider">
                        {hitLevel ? `${hitLevel} Hit` : (isBuy ? 'Target Cleared' : 'Demand Reached')}
                    </span>
                </div>
                <div className="flex gap-4 text-[10px] font-mono whitespace-nowrap">
                    <div>
                        <span className="text-slate-400 uppercase text-[8px] mr-1">{isBuy ? 'BUY @:' : 'SELL @:'}</span>
                        <span className="text-slate-900 dark:text-white font-semibold">{fmt(entry)}</span>
                    </div>
                    <div>
                        <span className="text-slate-400 uppercase text-[8px] mr-1">{isBuy ? 'SELL @:' : 'BUYBACK @:'}</span>
                        <span className={cn("font-semibold", isBuy ? "text-emerald-500" : "text-blue-500")}>{fmt(exitPrice)}</span>
                    </div>
                </div>
            </div>
        );
    }

    if (sig.status === 'LOST' && entry) {
        const slPrice = sl || exitPrice;
        return (
            <div className="space-y-3 flex flex-col items-center">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-500/10 text-rose-500 border border-rose-500/20">
                    <Shield size={11} />
                    <span className="text-[9px] font-bold uppercase tracking-wider">
                        {isBuy ? 'Stop Loss Hit' : 'Exit Buffer Hit'}
                    </span>
                </div>
                <div className="flex gap-4 text-[10px] font-mono whitespace-nowrap">
                    <div>
                        <span className="text-slate-400 uppercase text-[8px] mr-1">{isBuy ? 'BUY @:' : 'SELL @:'}</span>
                        <span className="text-slate-900 dark:text-white font-semibold">{fmt(entry)}</span>
                    </div>
                    <div>
                        <span className="text-slate-400 uppercase text-[8px] mr-1">EXIT @:</span>
                        <span className="text-rose-500 font-semibold">{fmt(slPrice || entry)}</span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700 w-fit">
            <span className="text-[9px] font-bold uppercase tracking-wider">Closed</span>
        </div>
    );
}

// ─── Filter pill ──────────────────────────────────────────────────

function FilterPill({ active, onClick, children }: {
    active: boolean; onClick: () => void; children: React.ReactNode;
}) {
    return (
        <button
            onClick={onClick}
            className={cn(
                'px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 relative',
                active
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-lg'
                    : 'bg-white dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
            )}
        >
            {children}
        </button>
    );
}

// ─── Summary Stat (Bento Card) ───────────────────────────────────

function StatCard({ label, value, sub, accent, icon: Icon, tooltip }: {
    label: string; value: string; sub?: string; accent: 'green' | 'red' | 'blue' | 'purple'; icon: any; tooltip?: string;
}) {
    const colors = {
        green: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
        red: 'text-rose-500 bg-rose-500/10 border-rose-500/20',
        blue: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
        purple: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
    };

    return (
        <div className="group relative overflow-hidden flex flex-col justify-between h-32 bg-white dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800/60 rounded-3xl p-6 transition-all hover:border-primary/20">
            <div className={cn(
                "absolute -top-4 -right-4 w-16 h-16 rounded-full blur-2xl opacity-10 transition-all duration-500 group-hover:opacity-20",
                accent === 'green' ? "bg-emerald-500" :
                accent === 'red' ? "bg-rose-500" :
                accent === 'blue' ? "bg-blue-500" : "bg-purple-500"
            )} />

            <div className="flex items-center justify-between">
                <div className={cn("p-2 rounded-xl border", colors[accent])}>
                    <Icon size={18} />
                </div>
                {tooltip && <InfoTooltip content={tooltip} />}
            </div>

            <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</p>
                <div className="flex items-baseline gap-2">
                    <span className={cn("text-2xl font-black tracking-tight", colors[accent].split(' ')[0])}>
                        {value}
                    </span>
                    {sub && <span className="text-[10px] text-slate-400 font-semibold">{sub}</span>}
                </div>
            </div>
        </div>
    );
}

// ─── Engine Performance Row ──────────────────────────────────────

function EngineRow({ stat }: { stat: EnginePerformance }) {
    const resolved = stat.won + stat.lost;
    const winRate = resolved > 0 ? Math.round((stat.won / resolved) * 100) : 0;
    const barWidth = resolved > 0 ? (stat.won / resolved) * 100 : 0;

    return (
        <div className="flex items-center gap-4 py-3 px-4 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-all">
            <div className="w-40 shrink-0">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">
                    {SOURCE_LABELS[stat.source] || stat.source}
                </p>
                <p className="text-[10px] text-slate-400 font-semibold">{stat.total} signals</p>
            </div>

            <div className="flex-1 min-w-0">
                <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
                        style={{ width: `${barWidth}%` }}
                    />
                </div>
            </div>

            <div className="flex items-center gap-6 shrink-0">
                <div className="text-right w-14">
                    <span className={cn(
                        "text-sm font-black tabular-nums",
                        winRate >= 50 ? "text-emerald-500" : "text-rose-500"
                    )}>
                        {winRate}%
                    </span>
                </div>
                <div className="flex gap-3 text-[10px] font-bold tabular-nums">
                    <span className="text-emerald-500">{stat.won}W</span>
                    <span className="text-rose-500">{stat.lost}L</span>
                    {stat.active > 0 && <span className="text-blue-500">{stat.active}A</span>}
                </div>
                <div className="text-right w-16">
                    <span className={cn(
                        "text-xs font-mono font-bold tabular-nums",
                        stat.avg_win_pnl > 0 ? "text-emerald-500" : "text-slate-400"
                    )}>
                        {num(stat.avg_win_pnl) > 0 ? `+${fixed(stat.avg_win_pnl, 1)}%` : '—'}
                    </span>
                </div>
            </div>
        </div>
    );
}

// ─── Root ─────────────────────────────────────────────────────────

export default function TrackRecordClient() {
    const [stats, setStats] = useState<EnginePerformance[]>([]);
    const [signals, setSignals] = useState<GeneratedSignal[]>([]);
    const [loading, setLoading] = useState(true);

    const [detailedEngines, setDetailedEngines] = useState<DetailedEngine[]>([]);
    const [overallStats, setOverallStats] = useState<OverallStats | null>(null);
    const [selectedSignal, setSelectedSignal] = useState<GeneratedSignal | null>(null);
    const [expandedEngine, setExpandedEngine] = useState<string | null>(null);

    const [search, setSearch] = useState('');
    const [sourceFilter, setSourceFilter] = useState<string>('ALL');
    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const [dirFilter, setDirFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');

    useEffect(() => {
        const fetchAll = async () => {
            setLoading(true);
            try {
                const [statsRes, signalsRes, detailedRes] = await Promise.all([
                    api.get('/api/stocks/generated-signals/performance/'),
                    api.get('/api/stocks/generated-signals/track_record/?page_size=500'),
                    api.get('/api/stocks/generated-signals/performance_detailed/'),
                ]);
                setStats(statsRes.data || []);
                setSignals(signalsRes.data?.results || []);
                setDetailedEngines(detailedRes.data?.engines || []);
                setOverallStats(detailedRes.data?.overall || null);
            } catch (err) {
                console.error('Failed to load track record', err);
            } finally {
                setLoading(false);
            }
        };
        fetchAll();
    }, []);

    const filtered = useMemo(() => signals.filter(s => {
        if (search && !s.symbol.toLowerCase().includes(search.toLowerCase())) return false;
        if (sourceFilter !== 'ALL' && s.source !== sourceFilter) return false;
        if (statusFilter !== 'ALL' && s.status !== statusFilter) return false;
        if (dirFilter !== 'ALL' && s.signal !== dirFilter) return false;
        return true;
    }), [signals, search, sourceFilter, statusFilter, dirFilter]);

    // Compute metrics from the currently filtered signals so cards react to filters
    const metrics = useMemo(() => {
        const pool = filtered;
        const resolved = pool.filter(s => s.status === 'WON' || s.status === 'LOST');
        const won = pool.filter(s => s.status === 'WON');
        const lost = pool.filter(s => s.status === 'LOST');

        const avgWinPnl = won.length
            ? won.reduce((acc, s) => acc + parseFloat((s.pnl_percent as any) || 0), 0) / won.length
            : null;

        const avgLossPnl = lost.length
            ? lost.reduce((acc, s) => acc + parseFloat((s.pnl_percent as any) || 0), 0) / lost.length
            : null;

        const winRate = resolved.length ? Math.round((won.length / resolved.length) * 100) : null;

        const rr = avgWinPnl && avgLossPnl && avgLossPnl !== 0
            ? fixed(Math.abs(avgWinPnl / avgLossPnl), 1)
            : null;

        return { winRate, avgWinPnl, avgLossPnl, total: pool.length, resolved: resolved.length, won: won.length, lost: lost.length, rr };
    }, [filtered]);

    // Only show engine filter pills for sources that actually have data
    const activeSources = useMemo(() => {
        const sourceSet = new Set(signals.map(s => s.source));
        return SOURCES.filter(s => sourceSet.has(s.key));
    }, [signals]);

    if (loading) return <PageLoader />;

    return (
        <div className="space-y-8 max-w-[1600px] mx-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                <StatCard label="Signal Accuracy" value={metrics.winRate != null ? `${metrics.winRate}%` : '—'} sub={`${metrics.won}W / ${metrics.lost}L`} accent={metrics.winRate != null && metrics.winRate >= 50 ? 'green' : 'red'} icon={Target} tooltip="Probability of reaching target before stop loss." />
                <StatCard label="Avg Capture" value={metrics.avgWinPnl != null ? `+${fixed(metrics.avgWinPnl, 1)}%` : '—'} sub="per win" accent="green" icon={TrendingUp} tooltip="Average percentage gain per successful signal." />
                <StatCard label="Avg Stop Hit" value={metrics.avgLossPnl != null ? `${fixed(metrics.avgLossPnl, 1)}%` : '—'} sub="per loss" accent="red" icon={TrendingDown} tooltip="Average percentage loss when stop loss is hit." />
                <StatCard label="Edge Ratio" value={metrics.rr ? `${metrics.rr}:1` : '—'} sub="reward/risk" accent="blue" icon={BarChart3} tooltip="Reward-to-Risk ratio. Above 1.5 = strong edge." />
                <StatCard label="Profit Factor" value={overallStats ? (num(overallStats.total_profit_pnl) > 0 && num(overallStats.total_loss_pnl) < 0 ? fixed(overallStats.total_profit_pnl / Math.abs(overallStats.total_loss_pnl), 1) + 'x' : '—') : '—'} sub="gross profit ÷ loss" accent="purple" icon={Flame} tooltip="Ratio of total gains to total losses. Above 1.5x is profitable." />
                <StatCard label="Expectancy" value={overallStats && num(overallStats.total_resolved) > 0 ? `${num(overallStats.net_pnl) > 0 ? '+' : ''}${fixed(overallStats.net_pnl / overallStats.total_resolved, 2)}%` : '—'} sub="per signal" accent={overallStats && num(overallStats.net_pnl) > 0 ? 'green' : 'red'} icon={Zap} tooltip="Expected return per signal fired. Positive = system has edge." />
            </div>

            {/* ── Engine Leaderboard ──────────────────────────────────────── */}
            {detailedEngines.length > 0 && (
                <div className="bg-white/60 dark:bg-slate-900/40 backdrop-blur-xl border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
                    <div className="px-6 py-4 border-b border-slate-200/50 dark:border-slate-800/50 flex items-center justify-between">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Engine Leaderboard</h3>
                        <span className="text-[10px] text-slate-400 font-semibold">Ranked by Profit Factor</span>
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800/50">
                        {detailedEngines.map((eng, idx) => {
                            const resolved = eng.won + eng.lost;
                            const isExpanded = expandedEngine === eng.source;
                            const verdict = eng.profit_factor >= 1.5 ? 'profitable' : eng.profit_factor >= 1.0 ? 'marginal' : 'avoid';
                            const verdictColors = { profitable: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', marginal: 'bg-amber-500/10 text-amber-600 border-amber-500/20', avoid: 'bg-rose-500/10 text-rose-600 border-rose-500/20' };
                            const verdictLabels = { profitable: '✅ Profitable', marginal: '⚠️ Marginal', avoid: '❌ Avoid' };
                            return (
                                <div key={eng.source}>
                                    <button onClick={() => setExpandedEngine(isExpanded ? null : eng.source)} className="w-full flex items-center gap-4 py-4 px-6 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-all text-left">
                                        <span className="text-xs font-mono font-bold text-slate-300 w-6">#{idx + 1}</span>
                                        <div className="w-40 shrink-0">
                                            <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{SOURCE_LABELS[eng.source] || eng.source}</p>
                                            <p className="text-[10px] text-slate-400 font-semibold">{eng.total} signals</p>
                                        </div>
                                        <div className={cn("px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider border", verdictColors[verdict])}>{verdictLabels[verdict]}</div>
                                        <div className="flex-1 min-w-0"><div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500" style={{ width: `${resolved > 0 ? (eng.won / resolved) * 100 : 0}%` }} /></div></div>
                                        <div className="flex items-center gap-5 shrink-0 text-[10px] font-bold tabular-nums">
                                            <span className={cn("text-sm font-black", eng.win_rate >= 50 ? "text-emerald-500" : "text-rose-500")}>{eng.win_rate}%</span>
                                            <span className="text-slate-400">PF: <span className={cn(eng.profit_factor >= 1.5 ? "text-emerald-500" : eng.profit_factor >= 1 ? "text-amber-500" : "text-rose-500")}>{eng.profit_factor >= 999 ? '∞' : eng.profit_factor}</span></span>
                                            <span className="text-slate-400">Exp: <span className={cn(eng.expectancy > 0 ? "text-emerald-500" : "text-rose-500")}>{eng.expectancy > 0 ? '+' : ''}{eng.expectancy}%</span></span>
                                            <span className="text-emerald-500">{eng.won}W</span><span className="text-rose-500">{eng.lost}L</span>
                                        </div>
                                        {isExpanded ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                                    </button>
                                    {isExpanded && (
                                        <div className="px-8 pb-6 pt-2 bg-slate-50/50 dark:bg-slate-800/20 space-y-5 border-t border-slate-100 dark:border-slate-800/50">
                                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                                                {[
                                                    { l: 'Consistency', v: `${eng.consistency_score}%`, c: eng.consistency_score >= 60 ? 'text-emerald-500' : 'text-rose-500' },
                                                    { l: 'Avg Days', v: `${eng.avg_days_to_close}d`, c: 'text-blue-500' },
                                                    { l: 'Best Signal', v: `+${eng.best_signal_pnl}%`, c: 'text-emerald-500' },
                                                    { l: 'Worst Signal', v: `${eng.worst_signal_pnl}%`, c: 'text-rose-500' },
                                                    { l: 'Max Win Streak', v: `${eng.max_consecutive_wins}`, c: 'text-emerald-500' },
                                                    { l: 'Max Loss Streak', v: `${eng.max_consecutive_losses}`, c: 'text-rose-500' },
                                                ].map(({ l, v, c }) => (
                                                    <div key={l} className="bg-white dark:bg-slate-900/60 rounded-2xl p-3 border border-slate-200/50 dark:border-slate-700/50">
                                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">{l}</p>
                                                        <p className={cn("text-lg font-black tabular-nums", c)}>{v}</p>
                                                    </div>
                                                ))}
                                            </div>
                                            {/* Monthly Performance */}
                                            {eng.monthly_performance.length > 0 && (
                                                <div>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Monthly Performance</p>
                                                    <div className="flex items-end gap-2 h-20">
                                                        {eng.monthly_performance.map(m => {
                                                            const maxPnl = Math.max(...eng.monthly_performance.map(x => Math.abs(x.pnl)), 1);
                                                            const h = Math.max(8, (Math.abs(m.pnl) / maxPnl) * 100);
                                                            return (
                                                                <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                                                                    <span className={cn("text-[9px] font-bold tabular-nums", num(m.pnl) >= 0 ? "text-emerald-500" : "text-rose-500")}>{num(m.pnl) > 0 ? '+' : ''}{fixed(m.pnl, 1)}%</span>
                                                                    <div className={cn("w-full rounded-t-lg transition-all", m.pnl >= 0 ? "bg-emerald-500/30" : "bg-rose-500/30")} style={{ height: `${h}%` }} />
                                                                    <span className="text-[8px] text-slate-400 font-semibold">{m.month.slice(5)}</span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                            {/* Buy vs Sell + Symbols */}
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                <div className="bg-white dark:bg-slate-900/60 rounded-2xl p-4 border border-slate-200/50 dark:border-slate-700/50">
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Buy Signals</p>
                                                    <p className="text-lg font-black text-emerald-500">{eng.buy_stats.win_rate}% <span className="text-xs text-slate-400 font-semibold">win rate</span></p>
                                                    <p className="text-[10px] text-slate-400 font-semibold mt-1">{eng.buy_stats.won}W / {eng.buy_stats.lost}L / {eng.buy_stats.active}A</p>
                                                </div>
                                                <div className="bg-white dark:bg-slate-900/60 rounded-2xl p-4 border border-slate-200/50 dark:border-slate-700/50">
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Sell Signals</p>
                                                    <p className="text-lg font-black text-blue-500">{eng.sell_stats.win_rate}% <span className="text-xs text-slate-400 font-semibold">win rate</span></p>
                                                    <p className="text-[10px] text-slate-400 font-semibold mt-1">{eng.sell_stats.won}W / {eng.sell_stats.lost}L / {eng.sell_stats.active}A</p>
                                                </div>
                                                <div className="bg-white dark:bg-slate-900/60 rounded-2xl p-4 border border-slate-200/50 dark:border-slate-700/50">
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Top Symbols</p>
                                                    <div className="flex flex-wrap gap-1">{eng.top_symbols.map(s => <span key={s} className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">{s}</span>)}</div>
                                                    {eng.worst_symbols.length > 0 && <><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-3 mb-1">Weak Symbols</p><div className="flex flex-wrap gap-1">{eng.worst_symbols.map(s => <span key={s} className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-600 border border-rose-500/20">{s}</span>)}</div></>}
                                                </div>
                                            </div>
                                            {/* PnL Distribution */}
                                            <div>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">PnL Distribution</p>
                                                <div className="flex items-end gap-1 h-16">
                                                    {Object.entries(eng.pnl_distribution).map(([bucket, count]) => {
                                                        const maxCount = Math.max(...Object.values(eng.pnl_distribution), 1);
                                                        const h = Math.max(8, (count / maxCount) * 100);
                                                        const isNeg = bucket.includes('-') || bucket.startsWith('<');
                                                        return (
                                                            <div key={bucket} className="flex-1 flex flex-col items-center gap-1">
                                                                <span className="text-[9px] font-bold tabular-nums text-slate-500">{count}</span>
                                                                <div className={cn("w-full rounded-t transition-all", isNeg ? "bg-rose-400/40" : "bg-emerald-400/40")} style={{ height: `${h}%` }} />
                                                                <span className="text-[7px] text-slate-400 font-semibold text-center leading-tight">{bucket}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}



            <div className="bg-white/60 dark:bg-slate-900/40 backdrop-blur-xl border border-slate-200 dark:border-slate-800 p-4 rounded-3xl space-y-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-3">
                    <FilterPill active={sourceFilter === 'ALL'} onClick={() => setSourceFilter('ALL')}>All Engines</FilterPill>
                    {activeSources.map(s => (
                        <FilterPill key={s.key} active={sourceFilter === s.key} onClick={() => setSourceFilter(s.key)}>
                            {s.label}
                        </FilterPill>
                    ))}
                    <div className="w-px h-6 bg-slate-200 dark:bg-slate-800 mx-2 hidden md:block" />
                    <div className="relative group max-w-[250px] flex-1">
                        <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            value={search} onChange={e => setSearch(e.target.value)}
                            placeholder="Find symbol..."
                            className="w-full pl-11 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/50 rounded-2xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 dark:text-white transition-all shadow-inner"
                        />
                    </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-2">Quick Filter:</span>
                        {STATUSES.map(s => (
                            <button
                                key={s}
                                onClick={() => setStatusFilter(statusFilter === s ? 'ALL' : s)}
                                className={cn(
                                    "px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-tight border transition-all",
                                    statusFilter === s
                                        ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-transparent shadow-md"
                                        : "bg-transparent text-slate-400 border-slate-200 dark:border-slate-800 hover:border-slate-400"
                                )}
                            >
                                {STATUS_LABELS[s]}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800/60 rounded-2xl border border-slate-200/50 dark:border-slate-700/50">
                        {(['ALL', 'BUY', 'SELL'] as const).map(d => (
                            <button key={d} onClick={() => setDirFilter(d)}
                                className={cn(
                                    'px-4 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-tight transition-all',
                                    dirFilter === d
                                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                                )}>
                                {d}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl border border-slate-200/60 dark:border-slate-800/60 rounded-3xl overflow-hidden shadow-2xl shadow-slate-200/10">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-slate-200/50 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/20">
                                <th className="px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest w-40">Symbol</th>
                                <th className="px-6 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest w-48">Engine Info</th>
                                <th className="px-6 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center w-28">Entry Price</th>
                                <th className="px-6 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest w-44">Timeline</th>
                                <th className="px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Strategic Progression</th>
                                <th className="px-6 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center w-40">Outcome Detail</th>
                                <th className="px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right w-36">Efficiency</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                            {filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-5 py-24 text-center">
                                        <AlertCircle className="w-8 h-8 text-slate-200 mx-auto mb-4" />
                                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">No signals matched</h3>
                                    </td>
                                </tr>
                            ) : filtered.map((sig) => {
                                const exitPrice = calcExitPrice(sig);
                                return (
                                    <tr key={sig.id} onClick={() => setSelectedSignal(sig)} className="group hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-all duration-300 align-middle cursor-pointer">
                                        <td className="px-8 py-8">
                                            <div className="flex items-center gap-3">
                                                <Link href={`/ticker/${sig.symbol}`} className="font-bold text-xl text-slate-900 dark:text-white tracking-tight hover:text-primary transition-colors">
                                                    {sig.symbol}
                                                </Link>
                                                <div className={cn(
                                                    "px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest border",
                                                    sig.signal === 'BUY' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-rose-500/10 text-rose-500 border-rose-500/20"
                                                )}>
                                                    {sig.signal}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-8">
                                            <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{SOURCE_LABELS[sig.source] || sig.source}</p>
                                            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mt-1">{sig.signal_tier || 'Standard'}</p>
                                        </td>
                                        <td className="px-6 py-8 text-center">
                                            {parseFloat(sig.ltp) > 0 ? (
                                                <span className="font-mono text-sm font-bold px-3 py-1.5 rounded-lg border text-slate-900 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 border-slate-200/50 dark:border-slate-700/50">
                                                    {fmt(parseFloat(sig.ltp))}
                                                </span>
                                            ) : (
                                                <span className="text-[10px] text-slate-400 font-semibold">—</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-8">
                                            <div className="flex flex-col gap-2">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
                                                    <span className="text-[11px] font-mono font-semibold text-slate-600 dark:text-slate-400">{sig.generated_date}</span>
                                                </div>
                                                {sig.closed_date && (
                                                    <div className="flex items-center gap-2 text-primary">
                                                        <ArrowRight size={10} />
                                                        <span className="text-[11px] font-mono font-semibold">{sig.closed_date}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-8 py-8">
                                            <PriceLadder sig={sig} />
                                        </td>
                                        <td className="px-6 py-8 text-center">
                                            <ResultCell sig={sig} />
                                        </td>
                                        <td className="px-8 py-8 text-right">
                                            {sig.pnl_percent != null ? (
                                                <div className="inline-flex flex-col items-end">
                                                    <span className={cn(
                                                        "text-xl font-mono font-bold tabular-nums tracking-tighter",
                                                        parseFloat(sig.pnl_percent as any) >= 0 ? "text-emerald-500" : "text-rose-500"
                                                    )}>
                                                        {num(sig.pnl_percent) > 0 ? '+' : ''}{fixed(sig.pnl_percent, 2)}%
                                                    </span>
                                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                                                        Captured Alpha
                                                    </span>
                                                </div>
                                            ) : (
                                                <span className="text-slate-300 dark:text-slate-700 font-mono text-sm">—</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── Signal Detail Dialog ────────────────────────────────── */}
            {selectedSignal && (() => {
                const sig = selectedSignal;
                const entry = parseFloat(sig.ltp) || 0;
                const exitPrice = calcExitPrice(sig);
                const meta = sig.metadata || {};
                const tp1 = meta.tp1 ? parseFloat(meta.tp1) : null;
                const tp2 = meta.tp2 ? parseFloat(meta.tp2) : null;
                const tp3 = meta.tp3 ? parseFloat(meta.tp3) : null;
                const sl = sig.stop_loss_price ? parseFloat(sig.stop_loss_price as any) : (meta.sl ? parseFloat(meta.sl) : null);
                const target = sig.target_price ? parseFloat(sig.target_price as any) : null;
                const isBuy = sig.signal === 'BUY';
                const risk = entry && sl ? Math.abs(entry - sl) : 0;
                const reward = entry && target ? Math.abs(target - entry) : 0;
                const rrRatio = num(risk) > 0 ? fixed(reward / risk, 1) : '—';
                const engStats = detailedEngines.find(e => e.source === sig.source);
                const engRank = detailedEngines.findIndex(e => e.source === sig.source) + 1;

                // Metadata keys to display nicely
                const metaEntries = Object.entries(meta).filter(([k]) => !['tp1','tp2','tp3','sl','name'].includes(k));

                return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setSelectedSignal(null)}>
                        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4" onClick={e => e.stopPropagation()}>
                            {/* Header */}
                            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200/50 dark:border-slate-800/50">
                                <div className="flex items-center gap-3">
                                    <Link href={`/ticker/${sig.symbol}`} className="text-2xl font-black text-slate-900 dark:text-white hover:text-primary">{sig.symbol}</Link>
                                    <div className={cn("px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border", isBuy ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-rose-500/10 text-rose-600 border-rose-500/20")}>{sig.signal}</div>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase">{SOURCE_LABELS[sig.source] || sig.source}</span>
                                    {sig.signal_tier && <span className="text-[10px] text-slate-400 font-semibold">• {sig.signal_tier}</span>}
                                </div>
                                <button onClick={() => setSelectedSignal(null)} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"><X size={16} className="text-slate-400" /></button>
                            </div>

                            <div className="p-6 space-y-5">
                                {/* Rationale */}
                                {sig.rationale && (
                                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 border border-slate-200/50 dark:border-slate-700/50">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Rationale</p>
                                        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{sig.rationale}</p>
                                    </div>
                                )}

                                {/* Trade Plan */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <div className="bg-white dark:bg-slate-900/60 rounded-2xl p-3 border border-slate-200/50 dark:border-slate-700/50">
                                        <p className="text-[9px] font-bold text-slate-400 uppercase">Entry</p>
                                        <p className="text-lg font-black text-slate-900 dark:text-white tabular-nums">{fmt(entry)}</p>
                                    </div>
                                    {sl && <div className="bg-rose-50 dark:bg-rose-900/20 rounded-2xl p-3 border border-rose-200/50 dark:border-rose-700/50">
                                        <p className="text-[9px] font-bold text-rose-400 uppercase">Stop Loss</p>
                                        <p className="text-lg font-black text-rose-600 tabular-nums">{fmt(sl)}</p>
                                    </div>}
                                    {target && <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl p-3 border border-emerald-200/50 dark:border-emerald-700/50">
                                        <p className="text-[9px] font-bold text-emerald-400 uppercase">Target</p>
                                        <p className="text-lg font-black text-emerald-600 tabular-nums">{fmt(target)}</p>
                                    </div>}
                                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-2xl p-3 border border-blue-200/50 dark:border-blue-700/50">
                                        <p className="text-[9px] font-bold text-blue-400 uppercase">R:R Ratio</p>
                                        <p className="text-lg font-black text-blue-600 tabular-nums">{rrRatio}</p>
                                    </div>
                                </div>

                                {/* TP Levels */}
                                {(tp1 || tp2 || tp3) && (
                                    <div className="flex gap-3">
                                        {[{l: isBuy ? 'TP1' : 'D1', v: tp1}, {l: isBuy ? 'TP2' : 'D2', v: tp2}, {l: isBuy ? 'TP3' : 'D3', v: tp3}].filter(x => x.v).map(({l, v}) => (
                                            <div key={l} className="flex-1 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-200/50 dark:border-slate-700/50 text-center">
                                                <p className="text-[9px] font-bold text-slate-400 uppercase">{l}</p>
                                                <p className="text-sm font-black text-slate-700 dark:text-slate-200 tabular-nums">{fmt(v)}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Engine Context */}
                                {engStats && (
                                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 border border-slate-200/50 dark:border-slate-700/50">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Engine Context — #{engRank} Ranked</p>
                                        <div className="grid grid-cols-4 gap-3 text-center">
                                            <div><p className="text-[9px] text-slate-400 font-bold uppercase">Win Rate</p><p className={cn("text-sm font-black", engStats.win_rate >= 50 ? 'text-emerald-500' : 'text-rose-500')}>{engStats.win_rate}%</p></div>
                                            <div><p className="text-[9px] text-slate-400 font-bold uppercase">Profit Factor</p><p className="text-sm font-black text-slate-700 dark:text-white">{engStats.profit_factor >= 999 ? '∞' : engStats.profit_factor}</p></div>
                                            <div><p className="text-[9px] text-slate-400 font-bold uppercase">Consistency</p><p className="text-sm font-black text-slate-700 dark:text-white">{engStats.consistency_score}%</p></div>
                                            <div><p className="text-[9px] text-slate-400 font-bold uppercase">Avg Days</p><p className="text-sm font-black text-slate-700 dark:text-white">{engStats.avg_days_to_close}d</p></div>
                                        </div>
                                    </div>
                                )}

                                {/* Metadata Intel */}
                                {metaEntries.length > 0 && (
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Signal Metadata</p>
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                            {metaEntries.map(([k, v]) => (
                                                <div key={k} className="bg-white dark:bg-slate-900/60 rounded-xl px-3 py-2 border border-slate-200/50 dark:border-slate-700/50">
                                                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">{k.replace(/_/g, ' ')}</p>
                                                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200 tabular-nums truncate">{fixed(v, 2)}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Outcome */}
                                {sig.status !== 'ACTIVE' && (
                                    <div className={cn("rounded-2xl p-4 border", sig.status === 'WON' ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200/50 dark:border-emerald-700/50" : "bg-rose-50 dark:bg-rose-900/20 border-rose-200/50 dark:border-rose-700/50")}>
                                        <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: sig.status === 'WON' ? '#10b981' : '#f43f5e' }}>Outcome: {sig.status}</p>
                                        <div className="flex gap-6 text-sm">
                                            {exitPrice && <div><span className="text-[9px] text-slate-400 font-bold uppercase">Exit Price: </span><span className="font-black tabular-nums">{fmt(exitPrice)}</span></div>}
                                            {sig.pnl_percent != null && <div><span className="text-[9px] text-slate-400 font-bold uppercase">PnL: </span><span className={cn("font-black tabular-nums", num(sig.pnl_percent) >= 0 ? 'text-emerald-600' : 'text-rose-600')}>{num(sig.pnl_percent) > 0 ? '+' : ''}{fixed(sig.pnl_percent, 2)}%</span></div>}
                                            {sig.closed_date && <div><span className="text-[9px] text-slate-400 font-bold uppercase">Closed: </span><span className="font-bold text-slate-600 dark:text-slate-300">{sig.closed_date}</span></div>}
                                        </div>
                                    </div>
                                )}

                                {/* Timeline */}
                                <div className="flex items-center gap-3 text-[10px] text-slate-400 font-semibold">
                                    <Clock size={12} />
                                    <span>Generated: {sig.generated_date}</span>
                                    {sig.closed_date && <><ArrowRight size={10} /><span>Closed: {sig.closed_date}</span></>}
                                    <span className="ml-auto">Strength: {sig.strength}/100</span>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}
