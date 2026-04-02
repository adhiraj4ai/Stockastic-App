'use client';

import { useState, useEffect, useMemo } from 'react';
import api from '@/lib/api';
import {
    Activity, Zap, CheckCircle2, XCircle, Search,
    Shield, TrendingUp, TrendingDown, Layers, ArrowRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PageLoader } from '@/components/ui/StockLoader';
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
    if (!entry || sig.pnl_percent == null) return null;
    return entry * (1 + sig.pnl_percent / 100);
}

function fmt(n?: number | null): string {
    if (n == null) return '—';
    return 'रू' + n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function pctDiff(from: number, to: number): string {
    const d = ((to - from) / from) * 100;
    return (d > 0 ? '+' : '') + d.toFixed(1) + '%';
}

// Which TP level did the exit price clear?
function resolveHitLevel(sig: GeneratedSignal, exitPrice: number): string | null {
    if (sig.status !== 'WON') return null;
    const entry = parseFloat(sig.ltp) || 0;
    const isBuy = sig.signal === 'BUY';
    const { tp1, tp2, tp3 } = sig.metadata || {};
    const target = sig.target_price;

    const cleared = (level: number) =>
        isBuy ? exitPrice >= level * 0.97 : exitPrice <= level * 1.03;

    if (tp3 && cleared(tp3)) return 'TP3';
    if (tp2 && cleared(tp2)) return 'TP2';
    if (tp1 && cleared(tp1)) return 'TP1';
    if (target && cleared(target)) return 'Target';
    return 'Partial';
}

// ─── Price Ladder ─────────────────────────────────────────────────

function PriceLadder({ sig }: { sig: GeneratedSignal }) {
    const entry = parseFloat(sig.ltp) || 0;
    const exitPrice = calcExitPrice(sig);
    const { tp1, tp2, tp3 } = sig.metadata || {};
    const sl = sig.stop_loss_price ?? sig.metadata?.sl;
    const target = sig.target_price;
    const isBuy = sig.signal === 'BUY';
    const isLost = sig.status === 'LOST';
    const hitLevel = exitPrice ? resolveHitLevel(sig, exitPrice) : null;

    const tpCleared = (level: number) => {
        if (!exitPrice || sig.status !== 'WON') return false;
        return isBuy ? exitPrice >= level * 0.97 : exitPrice <= level * 1.03;
    };

    const levels: { label: string; price: number; type: 'tp' | 'sl' | 'entry' }[] = [];

    // Build levels top-to-bottom for BUY (highest first), reversed for SELL
    if (isBuy) {
        if (tp3) levels.push({ label: 'TP3', price: tp3, type: 'tp' });
        if (tp2) levels.push({ label: 'TP2', price: tp2, type: 'tp' });
        if (tp1) levels.push({ label: 'TP1', price: tp1, type: 'tp' });
        if (!tp1 && !tp2 && !tp3 && target) levels.push({ label: 'Target', price: target, type: 'tp' });
        levels.push({ label: 'Entry', price: entry, type: 'entry' });
        if (sl) levels.push({ label: 'SL', price: sl, type: 'sl' });
    } else {
        if (sl) levels.push({ label: 'SL', price: sl, type: 'sl' });
        levels.push({ label: 'Entry', price: entry, type: 'entry' });
        if (!tp1 && !tp2 && !tp3 && target) levels.push({ label: 'Target', price: target, type: 'tp' });
        if (tp1) levels.push({ label: 'TP1', price: tp1, type: 'tp' });
        if (tp2) levels.push({ label: 'TP2', price: tp2, type: 'tp' });
        if (tp3) levels.push({ label: 'TP3', price: tp3, type: 'tp' });
    }

    if (!levels.length) return <span className="text-[10px] text-slate-400">No levels set</span>;

    return (
        <div className="flex flex-col gap-px w-fit">
            {levels.map(({ label, price, type }) => {
                const isHitTp = type === 'tp' && tpCleared(price);
                const isHitSl = type === 'sl' && isLost;
                const isEntry = type === 'entry';

                return (
                    <div
                        key={label}
                        className={cn(
                            'flex items-center gap-2 px-1.5 py-[3px] rounded text-[10px] font-mono',
                            isHitTp && 'bg-emerald-50 dark:bg-emerald-900/20',
                            isHitSl && 'bg-rose-50 dark:bg-rose-900/20',
                            isEntry && 'bg-slate-50 dark:bg-slate-800/50',
                        )}
                    >
                        <span className={cn(
                            'w-[34px] font-bold shrink-0',
                            type === 'sl' ? 'text-rose-400' : isEntry ? 'text-slate-500' : 'text-slate-400',
                        )}>
                            {label}
                        </span>
                        <span className={cn(
                            'font-bold tabular-nums',
                            isHitTp ? 'text-emerald-600 dark:text-emerald-400' :
                            isHitSl ? 'text-rose-500 dark:text-rose-400' :
                            isEntry ? 'text-slate-800 dark:text-slate-200' :
                            'text-slate-600 dark:text-slate-400',
                        )}>
                            {fmt(price)}
                        </span>
                        {isHitTp && (
                            <span className="ml-auto flex items-center gap-0.5 text-emerald-500 font-bold">
                                <CheckCircle2 size={10} />
                                <span className="text-[9px]">hit</span>
                            </span>
                        )}
                        {isHitSl && (
                            <span className="ml-auto flex items-center gap-0.5 text-rose-500 font-bold">
                                <XCircle size={10} />
                                <span className="text-[9px]">trig</span>
                            </span>
                        )}
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
    const pnl = sig.pnl_percent;
    const sl = sig.stop_loss_price ?? sig.metadata?.sl;

    if (sig.status === 'ACTIVE') {
        return (
            <div className="flex items-center gap-1.5 text-xs font-medium text-blue-500">
                <Activity size={12} />
                <span>In progress</span>
            </div>
        );
    }

    if (sig.status === 'WON' && exitPrice) {
        return (
            <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                    <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                        {hitLevel || 'Target'} cleared
                    </span>
                </div>
                <div className="text-[10px] text-slate-500 font-mono space-y-0.5">
                    <div className="flex items-center gap-1.5">
                        <span className="text-slate-400">Buy</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">{fmt(entry)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="text-slate-400">Sell</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">{fmt(exitPrice)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <TrendingUp size={9} className="text-emerald-500" />
                        <span className="font-bold text-emerald-500">{pctDiff(entry, exitPrice)}</span>
                        <span className="text-slate-400 ml-1">profit</span>
                    </div>
                </div>
            </div>
        );
    }

    if (sig.status === 'LOST' && entry) {
        const slPrice = sl || exitPrice;
        const pnlValue = pnl != null ? parseFloat(pnl as any) : null;
        return (
            <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                    <Shield size={12} className="text-rose-500 shrink-0" />
                    <span className="text-xs font-bold text-rose-600 dark:text-rose-400">
                        SL triggered
                    </span>
                </div>
                <div className="text-[10px] text-slate-500 font-mono space-y-0.5">
                    <div className="flex items-center gap-1.5">
                        <span className="text-slate-400">Buy</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">{fmt(entry)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="text-slate-400">Exit</span>
                        <span className="font-bold text-rose-500 dark:text-rose-400">{fmt(slPrice)}</span>
                    </div>
                    {pnlValue != null && (
                        <div className="flex items-center gap-1">
                            <TrendingDown size={9} className="text-rose-500" />
                            <span className="font-bold text-rose-500">{pnlValue > 0 ? '+' : ''}{pnlValue.toFixed(1)}%</span>
                            <span className="text-slate-400 ml-1">loss contained</span>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    if (sig.status === 'CLOSED_MANUAL' && exitPrice) {
        const pnlValue = pnl != null ? parseFloat(pnl as any) : null;
        return (
            <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-500">Manual close</span>
                </div>
                <div className="text-[10px] text-slate-500 font-mono space-y-0.5">
                    <div className="flex items-center gap-1.5">
                        <span className="text-slate-400">Buy</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">{fmt(entry)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="text-slate-400">Exit</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">{fmt(exitPrice)}</span>
                    </div>
                    {pnlValue != null && (
                        <div className={cn(
                            'flex items-center gap-1',
                            pnlValue >= 0 ? 'text-emerald-500' : 'text-rose-500'
                        )}>
                            {pnlValue >= 0 ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
                            <span className="font-bold">{pnlValue > 0 ? '+' : ''}{pnlValue.toFixed(1)}%</span>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return <span className="text-[10px] text-slate-400">—</span>;
}

// ─── Filter pill ──────────────────────────────────────────────────

function FilterPill({ active, onClick, children }: {
    active: boolean; onClick: () => void; children: React.ReactNode;
}) {
    return (
        <button
            onClick={onClick}
            className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all',
                active
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-black'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            )}
        >
            {children}
        </button>
    );
}

// ─── Summary Stat ─────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }: {
    label: string; value: string; sub?: string; accent?: 'green' | 'red' | 'blue' | 'default';
}) {
    return (
        <div className="bg-white dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800/60 rounded-2xl p-4">
            <p className="text-[10px] font-bold text-slate-400 mb-1">{label}</p>
            <div className={cn(
                'text-2xl font-black tracking-tight',
                accent === 'green' ? 'text-emerald-500' :
                accent === 'red' ? 'text-rose-500' :
                accent === 'blue' ? 'text-blue-500' :
                'text-slate-900 dark:text-white'
            )}>
                {value}
            </div>
            {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
        </div>
    );
}

// ─── Root ─────────────────────────────────────────────────────────

export default function TrackRecordClient() {
    const [stats, setStats] = useState<EnginePerformance[]>([]);
    const [signals, setSignals] = useState<GeneratedSignal[]>([]);
    const [loading, setLoading] = useState(true);

    // Filters
    const [search, setSearch] = useState('');
    const [sourceFilter, setSourceFilter] = useState<string>('ALL');
    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const [dirFilter, setDirFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');

    useEffect(() => {
        const fetchAll = async () => {
            setLoading(true);
            try {
                const [statsRes, signalsRes] = await Promise.all([
                    api.get('/api/stocks/generated-signals/performance/'),
                    api.get('/api/stocks/generated-signals/track_record/?page_size=500')
                ]);
                setStats(statsRes.data || []);
                setSignals(signalsRes.data?.results || []);
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

    // Aggregate effectiveness metrics
    const metrics = useMemo(() => {
        const resolved = signals.filter(s => s.status === 'WON' || s.status === 'LOST');
        const won = signals.filter(s => s.status === 'WON');
        const lost = signals.filter(s => s.status === 'LOST');

        const avgWinPnl = won.length
            ? won.reduce((acc, s) => acc + parseFloat((s.pnl_percent as any) || 0), 0) / won.length
            : null;
        const avgLossPnl = lost.length
            ? lost.reduce((acc, s) => acc + parseFloat((s.pnl_percent as any) || 0), 0) / lost.length
            : null;
        const winRate = resolved.length ? Math.round((won.length / resolved.length) * 100) : null;

        // Risk:reward = avg win / abs(avg loss)
        const rr = avgWinPnl && avgLossPnl && avgLossPnl !== 0
            ? Math.abs(avgWinPnl / avgLossPnl).toFixed(1)
            : null;

        return { winRate, avgWinPnl, avgLossPnl, total: signals.length, resolved: resolved.length, won: won.length, lost: lost.length, rr };
    }, [signals]);

    if (loading) return <PageLoader />;

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* Page header */}
            <div>
                <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Track Record</h1>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                    Signal performance — entry / exit prices, targets hit, stop loss effectiveness
                </p>
            </div>

            {/* Effectiveness summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard
                    label="Win rate"
                    value={metrics.winRate != null ? `${metrics.winRate}%` : '—'}
                    sub={`${metrics.won}W · ${metrics.lost}L of ${metrics.resolved} resolved`}
                    accent={metrics.winRate != null && metrics.winRate >= 50 ? 'green' : 'red'}
                />
                <StatCard
                    label="Avg profit on wins"
                    value={metrics.avgWinPnl != null ? `+${metrics.avgWinPnl.toFixed(1)}%` : '—'}
                    sub="Profit captured per winning signal"
                    accent="green"
                />
                <StatCard
                    label="Loss contained by SL"
                    value={metrics.avgLossPnl != null ? `${metrics.avgLossPnl.toFixed(1)}%` : '—'}
                    sub="Avg loss limited by stop loss"
                    accent="red"
                />
                <StatCard
                    label="Risk : reward"
                    value={metrics.rr ? `1 : ${metrics.rr}` : '—'}
                    sub={`${metrics.total} total signals tracked`}
                    accent="blue"
                />
            </div>

            {/* Filters */}
            <div className="space-y-2.5">
                {/* Source filter */}
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-bold text-slate-400 w-12 shrink-0">Engine</span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <FilterPill active={sourceFilter === 'ALL'} onClick={() => setSourceFilter('ALL')}>All</FilterPill>
                        {SOURCES.map(s => (
                            <FilterPill key={s.key} active={sourceFilter === s.key} onClick={() => setSourceFilter(s.key)}>
                                {s.label}
                            </FilterPill>
                        ))}
                    </div>
                </div>

                {/* Status + direction + search */}
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-bold text-slate-400 w-12 shrink-0">Status</span>
                    <div className="flex items-center gap-1.5 flex-wrap flex-1">
                        <FilterPill active={statusFilter === 'ALL'} onClick={() => setStatusFilter('ALL')}>All</FilterPill>
                        {STATUSES.map(s => (
                            <FilterPill key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
                                {STATUS_LABELS[s]}
                            </FilterPill>
                        ))}

                        {/* Direction toggle */}
                        <div className="flex p-0.5 bg-slate-100 dark:bg-slate-800/60 rounded-lg border border-slate-200/50 dark:border-slate-700/50 ml-2">
                            {(['ALL', 'BUY', 'SELL'] as const).map(d => (
                                <button key={d} onClick={() => setDirFilter(d)}
                                    className={cn(
                                        'px-3 py-1 rounded-md text-xs font-bold transition-all',
                                        dirFilter === d
                                            ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                                    )}>
                                    {d === 'ALL' ? 'All' : d}
                                </button>
                            ))}
                        </div>

                        {/* Search */}
                        <div className="relative ml-auto">
                            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                value={search} onChange={e => setSearch(e.target.value)}
                                placeholder="Search symbol..."
                                className="pl-9 pr-4 py-2 bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-xl text-xs font-medium w-44 focus:outline-none focus:ring-2 focus:ring-slate-900/10 dark:text-white transition-all"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Signal table */}
            <div className="bg-white dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800/60 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                        {filtered.length} signal{filtered.length !== 1 ? 's' : ''}
                    </span>
                    {(sourceFilter !== 'ALL' || statusFilter !== 'ALL' || dirFilter !== 'ALL' || search) && (
                        <button
                            onClick={() => { setSourceFilter('ALL'); setStatusFilter('ALL'); setDirFilter('ALL'); setSearch(''); }}
                            className="text-xs font-bold text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                        >
                            Clear filters
                        </button>
                    )}
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50/50 dark:bg-slate-800/20 border-b border-slate-200/50 dark:border-slate-800/80">
                            <tr>
                                <th className="px-5 py-3 text-[10px] font-bold text-slate-400 whitespace-nowrap">Symbol</th>
                                <th className="px-5 py-3 text-[10px] font-bold text-slate-400 whitespace-nowrap">Engine · Tier</th>
                                <th className="px-5 py-3 text-[10px] font-bold text-slate-400 whitespace-nowrap">Dates</th>
                                <th className="px-5 py-3 text-[10px] font-bold text-slate-400 whitespace-nowrap">Price levels</th>
                                <th className="px-5 py-3 text-[10px] font-bold text-slate-400 whitespace-nowrap">Result</th>
                                <th className="px-5 py-3 text-[10px] font-bold text-slate-400 whitespace-nowrap text-right">P&amp;L</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                            {filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-5 py-16 text-center">
                                        <Layers className="w-6 h-6 text-slate-300 dark:text-slate-700 mx-auto mb-2" />
                                        <p className="text-sm text-slate-400">No signals match the current filters</p>
                                    </td>
                                </tr>
                            ) : filtered.map((sig) => {
                                const pnl = sig.pnl_percent;
                                return (
                                    <tr key={sig.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors align-top">

                                        {/* Symbol */}
                                        <td className="px-5 py-4 whitespace-nowrap">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Link
                                                    href={`/ticker/${sig.symbol}`}
                                                    className="font-black text-slate-900 dark:text-white tracking-tight hover:underline"
                                                >
                                                    {sig.symbol}
                                                </Link>
                                                <span className={cn(
                                                    'text-[10px] font-black px-1.5 py-0.5 rounded',
                                                    sig.signal === 'BUY' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
                                                )}>
                                                    {sig.signal}
                                                </span>
                                            </div>
                                        </td>

                                        {/* Engine + tier */}
                                        <td className="px-5 py-4 whitespace-nowrap">
                                            <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                                {SOURCE_LABELS[sig.source] || sig.source}
                                            </div>
                                            {sig.signal_tier && (
                                                <div className="text-[10px] text-slate-400 mt-0.5">{sig.signal_tier}</div>
                                            )}
                                        </td>

                                        {/* Dates */}
                                        <td className="px-5 py-4 whitespace-nowrap">
                                            <div className="text-[10px] font-medium text-slate-600 dark:text-slate-300">
                                                {sig.generated_date}
                                            </div>
                                            {sig.closed_date && (
                                                <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-1">
                                                    <ArrowRight size={9} />
                                                    {sig.closed_date}
                                                </div>
                                            )}
                                        </td>

                                        {/* Price ladder */}
                                        <td className="px-5 py-4">
                                            <PriceLadder sig={sig} />
                                        </td>

                                        {/* Result */}
                                        <td className="px-5 py-4">
                                            <ResultCell sig={sig} />
                                        </td>

                                        {/* P&L badge */}
                                        <td className="px-5 py-4 text-right whitespace-nowrap">
                                            {pnl != null ? (
                                                <span className={cn(
                                                    'inline-flex font-mono font-black py-1 px-2.5 rounded-lg text-sm',
                                                    pnl >= 0
                                                        ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/20'
                                                        : 'bg-rose-500 text-white shadow-sm shadow-rose-500/20'
                                                )}>
                                                    {pnl > 0 ? '+' : ''}{parseFloat(pnl as any).toFixed(2)}%
                                                </span>
                                            ) : (
                                                <span className="text-slate-400 text-xs font-mono">—</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
