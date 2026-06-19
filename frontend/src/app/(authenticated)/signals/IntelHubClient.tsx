'use client';

import React, { useState, useEffect, useMemo } from 'react';
import api from '@/lib/api';
import DashboardLayout from '@/components/DashboardLayout';
import {
    Activity, Clock, TrendingUp, TrendingDown,
    Zap, Search, ArrowRight, Binary,
    Briefcase, Layers, Radar
} from 'lucide-react';
import { num, fixed } from '@/lib/numbers';
import { cn } from '@/lib/utils';
import { StockLoader } from '@/components/ui/StockLoader';
import Link from 'next/link';
import { AnalysisTabs } from '@/components/analysis/AnalysisTabs';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';

// ─── Error Boundary ───────────────────────────────────────────────────────────
class SignalDetailErrorBoundary extends React.Component<
    { children: React.ReactNode; symbol?: string; onReset: () => void },
    { hasError: boolean; error?: Error }
> {
    constructor(props: any) {
        super(props);
        this.state = { hasError: false };
    }
    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }
    componentDidCatch(error: Error) {
        console.error('[SignalDetail] Render error:', error);
    }
    render() {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col items-center justify-center h-full bg-white dark:bg-card rounded-xl gap-4 p-10 border border-slate-200 dark:border-slate-800 shadow-sm">
                    <div className="text-4xl">⚠️</div>
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white">Signal Detail Unavailable</h3>
                    <p className="text-sm text-slate-500 text-center max-w-md">
                        Could not load detailed intelligence for <strong>{this.props.symbol}</strong>. 
                        This may be due to missing market data.
                    </p>
                    <button
                        onClick={() => { this.setState({ hasError: false }); this.props.onReset(); }}
                        className="px-4 py-2 text-sm font-bold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-opacity"
                    >Close</button>
                </div>
            );
        }
        return this.props.children;
    }
}

// ─── Shared types ──────────────────────────────────────────────────────────────

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
    conviction: number;
}

const SOURCE_LABELS: Record<string, string> = {
    'SMART_MONEY': 'Smart Money',
    'BROKER_ACCUMULATION': 'Broker Accumulation',
    'SMART_CROSSOVER': 'Smart Crossover',
    'ICHIMOKU': 'Ichimoku',
    'DISTRIBUTION_ALERT': 'Distribution Alert',
    'BELOW_COST_REVERSAL': 'Below Cost Reversal',
    'VOLUME_BREAKOUT': 'Volume Breakout',
    'CONCENTRATION_SHIFT': 'Concentration Shift',
    'ACC_MOMENTUM': 'Acc. Momentum',
    'PRICE_ACTION': 'Price Action',
    'MEAN_REVERSAL': 'Mean Reversal',
    'RSI_DIVERGENCE': 'RSI Divergence',
    'MACD_DIVERGENCE': 'MACD Divergence',
    'DOW_SIGNAL': 'Dow Signal',
};

const WHALE_SOURCES = [
    'BROKER_ACCUMULATION', 'SMART_CROSSOVER', 'ICHIMOKU',
    'DISTRIBUTION_ALERT', 'BELOW_COST_REVERSAL', 'VOLUME_BREAKOUT',
    'CONCENTRATION_SHIFT', 'ACC_MOMENTUM',
] as const;

interface BatchIndicatorData {
    trends: { '5d': number; '10d': number; '1m': number };
    rsi: number | null;
    macd: number | null;
    macd_signal: number | null;
    macd_hist: number | null;
    roc: number | null;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

const getFreshness = (dateString?: string) => {
    if (!dateString) return { status: 'historical', label: 'Historical', color: 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500' };
    const date = new Date(dateString);
    const diffDays = Math.ceil(Math.abs(Date.now() - date.getTime()) / 86400000);
    if (diffDays <= 1) return { status: 'active', label: 'Today', color: 'bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800/40' };
    if (diffDays <= 3) return { status: 'recent', label: `${diffDays}d ago`, color: 'bg-amber-50 text-amber-600 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800/40' };
    return { status: 'historical', label: `${diffDays}d ago`, color: 'bg-slate-100 text-slate-400 border border-slate-200 dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700' };
};

const getActionability = (signalPrice: number, currentPrice?: number, signal?: string) => {
    if (!currentPrice || signal === 'HOLD' || signal === 'NEUTRAL') return null;
    const change = ((currentPrice - signalPrice) / signalPrice) * 100;
    const isBuy = signal === 'BUY';
    const isSell = signal === 'SELL';
    if (isBuy) {
        if (change < -5) return { label: 'Invalidated', color: 'bg-red-50 text-red-500 border border-red-200 dark:bg-red-900/20 dark:text-red-400', status: 'invalid' };
        if (change > 3) return { label: 'Entry Missed', color: 'bg-slate-100 text-slate-400 border border-slate-200 dark:bg-slate-800 dark:text-slate-500', status: 'missed' };
        return { label: 'In Zone', color: 'bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400', status: 'valid' };
    }
    if (isSell) {
        if (change > 5) return { label: 'Invalidated', color: 'bg-red-50 text-red-500 border border-red-200 dark:bg-red-900/20 dark:text-red-400', status: 'invalid' };
        if (change < -3) return { label: 'Entry Missed', color: 'bg-slate-100 text-slate-400 border border-slate-200 dark:bg-slate-800 dark:text-slate-500', status: 'missed' };
        return { label: 'In Zone', color: 'bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400', status: 'valid' };
    }
    return null;
};

const isSignalActionable = (signalPrice: number, currentPrice?: number, signalDirection?: 'BUY' | 'SELL', date?: string) => {
    if (getFreshness(date).status === 'historical') return false;
    if (signalDirection) {
        const action = getActionability(signalPrice, currentPrice, signalDirection);
        if (action && action.status !== 'valid') return false;
    }
    return true;
};

// ─── UI Atoms ─────────────────────────────────────────────────────────────────

function SignalBadge({ direction }: { direction: 'BUY' | 'SELL' }) {
    return (
        <span className={cn(
            'inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-[11px] font-semibold tracking-wider',
            direction === 'BUY' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
        )}>
            {direction === 'BUY' ? '↑' : '↓'} {direction}
        </span>
    );
}

function TrendPill({ label, val }: { label: string; val?: number }) {
    const nVal = num(val);
    const isPos = nVal > 0;
    const isNeg = nVal < 0;
    return (
        <div className="flex flex-col items-center">
            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{label}</span>
            <span className={cn(
                'text-[11px] font-semibold font-mono',
                isPos ? 'text-emerald-500' : isNeg ? 'text-rose-500' : 'text-slate-400'
            )}>
                {val !== undefined ? `${isPos ? '+' : ''}${fixed(val, 0)}%` : '--'}
            </span>
        </div>
    );
}

// ─── Sector Filter ────────────────────────────────────────────────────────────

function SectorFilter({ sectors, value, onChange }: {
    sectors: string[];
    value: string;
    onChange: (s: string) => void;
}) {
    if (sectors.length === 0) return null;
    return (
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
            <span className="text-[10px] font-bold text-slate-400 shrink-0">Sector</span>
            <div className="flex items-center gap-1.5 flex-nowrap">
                <button
                    onClick={() => onChange('ALL')}
                    className={cn(
                        'shrink-0 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all whitespace-nowrap',
                        value === 'ALL'
                            ? 'bg-primary/10 text-primary border border-primary/30'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-accent hover:text-accent-foreground'
                    )}>
                    All
                </button>
                {sectors.map(s => (
                    <button
                        key={s}
                        onClick={() => onChange(s)}
                        className={cn(
                            'shrink-0 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all whitespace-nowrap',
                            value === s
                                ? 'bg-primary/10 text-primary border border-primary/30'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-accent hover:text-accent-foreground'
                        )}>
                        {s}
                    </button>
                ))}
            </div>
        </div>
    );
}


// ─── Signal Card ─────────────────────────────────────────────────────────────

const CANONICAL_BADGE: Record<string, { label: string; color: string }> = {
    IN_ZONE:  { label: 'In Zone',  color: 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/40' },
    EXTENDED: { label: 'Extended', color: 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800/40' },
    STALE:    { label: 'Stale',    color: 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700' },
};

function UnifiedSignalCard({
    symbol, direction, ltp, currentPrice, indicators, date,
    strength, reason, tagline, conviction,
    targetPrice, stopLoss, tp1, tp2, tp3, status,
    smartMoneyMetadata, canonicalStatus, onSelect
}: {
    symbol: string; direction: 'BUY' | 'SELL'; ltp: number;
    currentPrice?: number; indicators?: BatchIndicatorData; date?: string;
    strength?: number; reason?: string; tagline?: string; conviction?: number;
    targetPrice?: number; stopLoss?: number; tp1?: number; tp2?: number; tp3?: number;
    status?: 'ACTIVE' | 'WON' | 'LOST' | 'CLOSED_MANUAL';
    smartMoneyMetadata?: any;
    canonicalStatus?: string;
    onSelect: (s: any) => void;
}) {
    const freshness = getFreshness(date);
    const action = getActionability(ltp, currentPrice, direction);
    const change = currentPrice ? ((currentPrice - ltp) / ltp) * 100 : null;

    const resolvedAction = status === 'WON'
        ? { label: 'Target Hit', color: 'bg-emerald-500 text-white border-transparent' }
        : status === 'LOST'
            ? { label: 'Stopped Out', color: 'bg-rose-500 text-white border-transparent' }
            : action;

    const isTerminal = status === 'WON' || status === 'LOST';
    const dimmed = (status === 'LOST' || (action && action.status !== 'valid' && status !== 'WON'))
        && !(canonicalStatus === 'IN_ZONE' && !isTerminal);

    return (
        <div
            onClick={() => onSelect({ symbol, ltp, currentPrice, strength: strength || 50, direction, targetPrice, stopLoss, tp1, tp2, tp3, status })}
            className={cn(
                'group relative rounded-2xl border bg-white dark:bg-card cursor-pointer transition-all duration-200 hover:shadow-md overflow-hidden',
                direction === 'BUY'
                    ? 'border-slate-200/80 dark:border-slate-800/60 hover:border-emerald-300/60 dark:hover:border-emerald-700/40'
                    : 'border-slate-200/80 dark:border-slate-800/60 hover:border-rose-300/60 dark:hover:border-rose-700/40',
                dimmed && 'opacity-50 hover:opacity-100'
            )}
        >
            {/* Top accent line */}
            <div className={cn('h-[3px]', direction === 'BUY' ? 'bg-emerald-500' : 'bg-rose-500')} />

            <div className="p-4">
                {/* ── Header ── */}
                <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-3 mb-2">
                            <div className="flex items-center gap-2">
                                <Link
                                    href={`/ticker/${symbol}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100 hover:underline"
                                >
                                    {symbol}
                                </Link>
                                <SignalBadge direction={direction} />
                            </div>

                            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/50 px-2 py-0.5 rounded-md border border-border dark:border-slate-800">
                                <span className="text-sm font-semibold font-mono text-slate-900 dark:text-slate-100 tracking-tight">
                                    Rs.{num(ltp).toLocaleString()}
                                </span>
                                {change !== null && (
                                    <span className={cn(
                                        'text-[10px] font-bold',
                                        num(change) > 0 ? 'text-emerald-500' : num(change) < 0 ? 'text-rose-500' : 'text-slate-400'
                                    )}>
                                        {num(change) > 0 ? '+' : ''}{fixed(change, 1)}%
                                    </span>
                                )}
                            </div>

                            <div className="flex items-center gap-2.5">
                                <div className="flex items-center gap-1">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase">RSI</span>
                                    <span className={cn('text-xs font-semibold font-mono', num(indicators?.rsi) > 70 ? 'text-rose-500' : num(indicators?.rsi) < 30 ? 'text-emerald-500' : 'text-slate-700 dark:text-slate-300')}>{fixed(indicators?.rsi, 1, '--')}</span>
                                </div>
                                <div className="w-px h-3 bg-slate-200 dark:bg-slate-700"></div>
                                <div className="flex items-center gap-1">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase">MACD</span>
                                    <span className={cn('text-xs font-semibold font-mono', num(indicators?.macd_hist) > 0 ? 'text-emerald-500' : 'text-rose-500')}>{fixed(indicators?.macd, 1, '--')}</span>
                                </div>
                            </div>
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-1.5">
                            {date && (
                                <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-md', freshness?.color || 'bg-slate-500/10 text-slate-500')}>
                                    {freshness.label}
                                </span>
                            )}
                            {tagline && (
                                <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                                    {tagline}
                                </span>
                            )}
                            {conviction !== undefined && conviction >= 2 && (
                                <div className="flex items-center">
                                    <span className={cn(
                                        'text-[10px] font-bold px-1.5 py-0.5 rounded-md border',
                                        conviction >= 3
                                            ? 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800/40'
                                            : 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                                    )}>
                                        {conviction >= 3 ? 'Triple conviction' : 'Dual confirmation'}
                                    </span>
                                </div>
                            )}
                            {smartMoneyMetadata?.cluster_count > 0 && (
                                <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                                    <Briefcase size={10} />
                                    {smartMoneyMetadata.cluster_count} brokers
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── Rationale ── */}
                {reason && (
                    <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400 italic line-clamp-2 mb-3">
                        &ldquo;{reason}&rdquo;
                    </p>
                )}

                {/* ── Footer bar ── */}
                <div className="flex items-center gap-3 pt-3 border-t border-border dark:border-slate-800/60">
                    {/* Indicators */}
                    <div className="flex items-center gap-3 flex-1">
                        {indicators?.trends && (
                            <div className="hidden sm:flex items-center gap-3">
                                <TrendPill label="5d" val={indicators.trends['5d']} />
                                <TrendPill label="10d" val={indicators.trends['10d']} />
                                <TrendPill label="1m" val={indicators.trends['1m']} />
                            </div>
                        )}
                    </div>

                    {/* Right side: status + arrow */}
                    <div className="flex items-center gap-2 shrink-0">
                        {(() => {
                            const badge = (!isTerminal && canonicalStatus && CANONICAL_BADGE[canonicalStatus]) || resolvedAction;
                            return badge ? (
                                <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-md border', badge.color || 'bg-slate-500/10 text-slate-500')}>
                                    {badge.label}
                                </span>
                            ) : null;
                        })()}
                        <div className={cn(
                            'p-2 rounded-xl transition-all',
                            'bg-slate-100 dark:bg-slate-800 text-slate-400',
                            'group-hover:bg-primary group-hover:text-primary-foreground'
                        )}>
                            <ArrowRight size={13} strokeWidth={2.5} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Shared props ─────────────────────────────────────────────────────────────

interface BaseSignalViewProps {
    onSelect: (signal: any) => void;
    liveMarketMap: Record<string, number>;
    batchIndicators: Record<string, BatchIndicatorData>;
    fetchBatchIndicators: (symbols: string[]) => Promise<void>;
    showHistorical: boolean;
    sectorMap: Record<string, string>;
}

// ─── ALL SOURCES VIEW ─────────────────────────────────────────────────────────

function AllSourcesView({ onSelect, liveMarketMap, batchIndicators, fetchBatchIndicators, showHistorical, sectorMap }: BaseSignalViewProps) {
    const [loading, setLoading] = useState(true);
    const [unified, setUnified] = useState<UnifiedSignal[]>([]);
    const [search, setSearch] = useState('');
    const [dirFilter, setDirFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
    const [minConviction, setMinConviction] = useState(1);
    const [sectorFilter, setSectorFilter] = useState('ALL');
    const [generatedDate, setGeneratedDate] = useState<string | null>(null);
    const [entryStatuses, setEntryStatuses] = useState<Record<string, string>>({});

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            const map = new Map<string, UnifiedSignal>();
            const upsert = (symbol: string, dir: 'BUY' | 'SELL', ltp: number) => {
                if (!map.has(symbol)) map.set(symbol, { symbol, direction: dir, ltp, conviction: 0 });
                return map.get(symbol)!;
            };
            try {
                const [genRes, stRes, statusRes] = await Promise.all([
                    api.get('/api/stocks/generated-signals/latest/').catch(() => null),
                    api.get('/api/stocks/signals/', { params: { page_size: 500 } }).catch(() => null),
                    api.get('/api/stocks/entry-statuses/').catch(() => null),
                ]);
                setEntryStatuses(statusRes?.data?.statuses ?? {});
                if (genRes?.data) {
                    for (const sig of genRes.data as GeneratedSignal[]) {
                        const ltp = parseFloat(sig.ltp) || 0;
                        const u = upsert(sig.symbol, sig.signal, ltp);
                        if (sig.signal === u.direction) {
                            if (sig.target_price) u.target_price = sig.target_price;
                            if (sig.stop_loss_price) u.stop_loss_price = sig.stop_loss_price;
                            if (sig.status) u.status = sig.status;
                            if (sig.metadata?.tp1) u.tp1 = sig.metadata.tp1;
                            if (sig.metadata?.tp2) u.tp2 = sig.metadata.tp2;
                            if (sig.metadata?.tp3) u.tp3 = sig.metadata.tp3;
                            if (sig.metadata?.sl) u.stop_loss_price = sig.metadata.sl;
                        }

                        if (sig.source === 'SMART_MONEY') {
                            u.smartMoney = { tier: sig.signal_tier, markup: sig.metadata?.markup_percent || 0, rationale: sig.rationale, brokers: sig.metadata?.cluster_count || 0 };
                        } else {
                            if (sig.signal === u.direction) {
                                u.whale = { engine: SOURCE_LABELS[sig.source] || sig.source, strength: sig.strength, reason: sig.rationale, rsi: sig.metadata?.rsi };
                            } else if (!u.whale) {
                                // If directions conflict but we don't have a whale signal yet, keep it anyway just for the text
                                u.whale = { engine: SOURCE_LABELS[sig.source] || sig.source, strength: sig.strength, reason: sig.rationale, rsi: sig.metadata?.rsi };
                            }
                        }
                        
                        if (sig.signal === u.direction) {
                            u.conviction++;
                        }
                        if (!generatedDate && sig.generated_date) setGeneratedDate(sig.generated_date);
                    }
                }
                if (stRes?.data?.results) {
                    const grouped = new Map<string, { dir: 'BUY' | 'SELL'; names: string[]; date: string; ltp: number }>();
                    for (const s of stRes.data.results as StrategySignal[]) {
                        if (s.signal !== 'BUY' && s.signal !== 'SELL') continue;
                        const existing = grouped.get(s.symbol);
                        if (!existing) grouped.set(s.symbol, { dir: s.signal, names: [s.strategy_name], date: s.date, ltp: parseFloat(s.last_close) });
                        else { existing.names.push(s.strategy_name); if (s.signal === 'BUY') existing.dir = 'BUY'; }
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
            fetchBatchIndicators(sorted.map(s => s.symbol));
            setLoading(false);
        };
        fetchData();
    }, []);

    const availableSectors = useMemo(() => {
        const set = new Set<string>();
        unified.forEach(u => { const s = sectorMap[u.symbol]; if (s) set.add(s); });
        return Array.from(set).sort();
    }, [unified, sectorMap]);

    const filtered = useMemo(() => unified.filter(u => {
        if (u.conviction < minConviction) return false;
        if (dirFilter !== 'ALL' && u.direction !== dirFilter) return false;
        if (search && !u.symbol.toLowerCase().includes(search.toLowerCase())) return false;
        if (sectorFilter !== 'ALL' && sectorMap[u.symbol] !== sectorFilter) return false;
        if (!showHistorical && !isSignalActionable(u.ltp, liveMarketMap[u.symbol], u.direction, u.strategy?.date || generatedDate || undefined)) return false;
        return true;
    }), [unified, search, dirFilter, minConviction, sectorFilter, showHistorical, liveMarketMap, generatedDate, sectorMap]);

    const buys = unified.filter(u => u.direction === 'BUY').length;
    const sells = unified.filter(u => u.direction === 'SELL').length;
    const multiSource = unified.filter(u => u.conviction >= 2).length;

    if (loading) return <Loader />;

    return (
        <div className="space-y-6">
            {/* ── Market Pulse Hero ── */}
            <div className="surface p-6">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h2 className="text-lg font-semibold text-foreground tracking-tight flex items-center gap-2">
                            <Activity size={16} className="text-muted-foreground" />
                            Market Pulse
                        </h2>
                        <p className="text-muted-foreground text-sm mt-1">
                            Consolidated intelligence from all specialized engines.
                        </p>
                    </div>
                    {generatedDate && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border text-xs text-muted-foreground">
                            <Clock size={12} />
                            {new Date(generatedDate).toLocaleDateString()}
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {[
                        { label: 'Actionable Buys', value: buys, icon: <TrendingUp className="text-emerald-600 dark:text-emerald-400" size={14} /> },
                        { label: 'Actionable Sells', value: sells, icon: <TrendingDown className="text-rose-600 dark:text-rose-400" size={14} /> },
                        { label: 'High Conviction', value: multiSource, icon: <Zap className="text-muted-foreground" size={14} /> },
                        { label: 'Total Tracked', value: unified.length, icon: <Radar className="text-muted-foreground" size={14} /> },
                    ].map(m => (
                        <div key={m.label} className="rounded-md border border-border p-3 flex flex-col justify-between">
                            <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                {m.icon}
                                {m.label}
                            </div>
                            <div className="text-2xl font-semibold text-foreground tabular-nums">{m.value}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Advanced Filter Dock ── */}
            <div className="flex flex-col lg:flex-row gap-4 items-center justify-between p-2 bg-white dark:bg-card rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                    {/* Sector */}
                    <div className="flex-1 lg:flex-none">
                        <SectorFilter sectors={availableSectors} value={sectorFilter} onChange={setSectorFilter} />
                    </div>
                    
                    <div className="w-px h-8 bg-slate-200 dark:bg-slate-800 hidden lg:block mx-1" />

                    {/* Direction */}
                    <div className="flex p-1 bg-slate-100 dark:bg-slate-950/50 rounded-lg">
                        {(['ALL', 'BUY', 'SELL'] as const).map(d => (
                            <button key={d} onClick={() => setDirFilter(d)}
                                className={cn('px-4 py-1.5 rounded-md text-[11px] font-bold transition-all uppercase tracking-wider',
                                    dirFilter === d
                                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm ring-1 ring-slate-200/50 dark:ring-slate-700/50'
                                        : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200')}>
                                {d === 'ALL' ? 'All' : d}
                            </button>
                        ))}
                    </div>

                    <div className="w-px h-8 bg-slate-200 dark:bg-slate-800 hidden lg:block mx-1" />

                    {/* Conviction */}
                    <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950/50 rounded-lg">
                        <span className="text-[10px] font-bold text-slate-400 pl-2 pr-1 uppercase tracking-wider hidden sm:block">Sources</span>
                        {[1, 2, 3].map(n => (
                            <button key={n} onClick={() => setMinConviction(n)}
                                className={cn('w-8 h-7 rounded-md text-xs font-semibold transition-all flex items-center justify-center',
                                    minConviction === n
                                        ? 'bg-primary/10 text-primary border border-primary/30 shadow-sm'
                                        : 'text-slate-500 hover:bg-accent hover:text-accent-foreground dark:text-slate-400')}>
                                {n}+
                            </button>
                        ))}
                    </div>
                </div>

                <div className="relative w-full lg:w-64 px-2 lg:px-0 lg:pr-2 pb-2 lg:pb-0">
                    <Search size={14} className="absolute left-5 lg:left-3 top-[calc(50%-4px)] lg:top-1/2 -translate-y-1/2 text-slate-400" strokeWidth={2.5} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by symbol…"
                        className="w-full pl-9 pr-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-slate-900 dark:text-slate-100 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring transition-all placeholder:text-slate-400" />
                </div>
            </div>

            {/* ── Section Header ── */}
            <div className="flex items-center justify-between pt-2 px-1">
                <h3 className="text-lg font-semibold text-slate-800 dark:text-white tracking-tight flex items-center gap-2">
                    {dirFilter === 'BUY' ? 'Actionable Buys' : dirFilter === 'SELL' ? 'Actionable Sells' : 'Active Intelligence'}
                    {minConviction > 1 && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50 text-[10px] font-bold uppercase tracking-wider shadow-sm">
                            {minConviction}+ Sources
                        </span>
                    )}
                </h3>
                <span className="text-xs font-bold text-slate-400 bg-slate-100 dark:bg-slate-800/50 px-2.5 py-1 rounded-full">
                    {filtered.length} {filtered.length === 1 ? 'Signal' : 'Signals'}
                </span>
            </div>

            {/* Cards */}
            {filtered.length === 0 ? (
                <Empty label="No signals match your filters" />
            ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-3">
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
                            tp1={u.tp1} tp2={u.tp2} tp3={u.tp3}
                            status={u.status}
                            indicators={batchIndicators[u.symbol]}
                            smartMoneyMetadata={u.smartMoney}
                            canonicalStatus={entryStatuses[u.symbol]}
                            onSelect={onSelect}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── SMART MONEY VIEW ─────────────────────────────────────────────────────────

function SmartMoneyView({ onSelect, liveMarketMap, batchIndicators, fetchBatchIndicators, showHistorical, sectorMap }: BaseSignalViewProps) {
    const [signals, setSignals] = useState<GeneratedSignal[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeSection, setActiveSection] = useState('platinum');
    const [sectorFilter, setSectorFilter] = useState('ALL');
    const [search, setSearch] = useState('');

    useEffect(() => {
        api.get('/api/stocks/generated-signals/latest/', { params: { source: 'SMART_MONEY' } })
            .then(r => setSignals(r.data ?? []))
            .catch(() => { })
            .finally(() => setLoading(false));
    }, []);

    const availableSectors = useMemo(() => {
        const set = new Set<string>();
        signals.forEach(s => { const sec = sectorMap[s.symbol]; if (sec) set.add(sec); });
        return Array.from(set).sort();
    }, [signals, sectorMap]);

    const filterFn = (s: GeneratedSignal, tier: string) => {
        if (s.signal_tier !== tier) return false;
        if (search && !s.symbol.toLowerCase().includes(search.toLowerCase())) return false;
        if (!showHistorical && !isSignalActionable(parseFloat(s.ltp) || 0, liveMarketMap[s.symbol], s.signal, s.generated_date)) return false;
        if (sectorFilter !== 'ALL' && sectorMap[s.symbol] !== sectorFilter) return false;
        return true;
    };

    const sections = [
        { id: 'platinum', label: 'Platinum', dot: 'bg-primary', items: signals.filter(s => filterFn(s, 'Platinum Buy')) },
        { id: 'gold', label: 'Gold', dot: 'bg-amber-500', items: signals.filter(s => filterFn(s, 'Gold Signal')) },
        { id: 'silver', label: 'Silver', dot: 'bg-slate-400', items: signals.filter(s => filterFn(s, 'Silver Signal')) },
        { id: 'divergence', label: 'Divergence', dot: 'bg-emerald-500', items: signals.filter(s => filterFn(s, 'Bullish Divergence')) },
    ];

    if (loading) return <Loader />;

    const current = sections.find(s => s.id === activeSection) || sections[0];
    const buys = current.items.filter(s => s.signal === 'BUY').length;
    const sells = current.items.filter(s => s.signal === 'SELL').length;

    return (
        <div className="space-y-5">
            <SectorFilter sectors={availableSectors} value={sectorFilter} onChange={setSectorFilter} />
            <div className="flex flex-wrap gap-3 items-center">
                <div className="flex p-0.5 bg-slate-100 dark:bg-slate-800/60 rounded-lg border border-border dark:border-slate-700/50">
                    {sections.map(s => (
                        <button key={s.id} onClick={() => setActiveSection(s.id)}
                            className={cn(
                                'flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all',
                                activeSection === s.id
                                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                            )}>
                            <span className={cn('w-1.5 h-1.5 rounded-full', s.dot)} />
                            {s.label}
                            <span className="text-[10px] opacity-50 font-semibold">{s.items.length}</span>
                        </button>
                    ))}
                </div>
                <div className="flex gap-2 text-[10px] font-bold">
                    <span className="px-2 py-1 rounded-md bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800/40">
                        {buys} buys
                    </span>
                    <span className="px-2 py-1 rounded-md bg-rose-50 text-rose-500 border border-rose-200 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800/40">
                        {sells} sells
                    </span>
                </div>
                <div className="relative ml-auto">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" strokeWidth={2.5} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search symbol…"
                        className="pl-8 pr-4 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800/50 text-slate-700 dark:text-slate-200 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring w-48" />
                </div>
            </div>

            {current.items.length === 0
                ? <Empty label={`No ${current.label} signals right now`} />
                : <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-3">
                    {current.items.map(sig => (
                        <UnifiedSignalCard key={sig.symbol} symbol={sig.symbol} direction={sig.signal}
                            ltp={parseFloat(sig.ltp) || 0} currentPrice={liveMarketMap[sig.symbol]}
                            date={sig.generated_date} strength={sig.strength} reason={sig.rationale}
                            tagline={sig.signal_tier}
                            conviction={sig.signal_tier === 'Platinum Buy' ? 3 : sig.signal_tier === 'Gold Signal' ? 2 : 1}
                            targetPrice={sig.target_price} stopLoss={sig.stop_loss_price} status={sig.status}
                            indicators={batchIndicators[sig.symbol]} smartMoneyMetadata={sig.metadata}
                            onSelect={onSelect} />
                    ))}
                </div>
            }
        </div>
    );
}

// ─── STRATEGIES VIEW ──────────────────────────────────────────────────────────

function StrategiesView({ onSelect, liveMarketMap, batchIndicators, fetchBatchIndicators, showHistorical, sectorMap }: BaseSignalViewProps) {
    const [signals, setSignals] = useState<StrategySignal[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<'ALL' | 'BUY' | 'SELL' | 'HOLD'>('ALL');
    const [sectorFilter, setSectorFilter] = useState('ALL');

    useEffect(() => {
        api.get('/api/stocks/signals/', { params: { page_size: 500 } })
            .then(r => {
                const results: StrategySignal[] = r.data?.results ?? [];
                setSignals(results);
                const symbols = [...new Set(results.map((s: StrategySignal) => s.symbol))];
                if (symbols.length) fetchBatchIndicators(symbols);
            })
            .catch(() => { })
            .finally(() => setLoading(false));
    }, []);

    const availableSectors = useMemo(() => {
        const set = new Set<string>();
        signals.forEach(s => { const sec = sectorMap[s.symbol]; if (sec) set.add(sec); });
        return Array.from(set).sort();
    }, [signals, sectorMap]);

    const groups = useMemo(() => {
        const map = new Map<string, StrategySignal[]>();
        for (const s of signals) {
            if (filter !== 'ALL' && s.signal !== filter) continue;
            if (search && !s.symbol.toLowerCase().includes(search.toLowerCase())) continue;
            if (sectorFilter !== 'ALL' && sectorMap[s.symbol] !== sectorFilter) continue;
            if (!showHistorical && !isSignalActionable(parseFloat(s.last_close) || 0, liveMarketMap[s.symbol], s.signal as 'BUY' | 'SELL', s.date)) continue;
            const existing = map.get(s.symbol);
            if (existing) { existing.push(s); } else { map.set(s.symbol, [s]); }
        }
        return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
    }, [signals, filter, search, sectorFilter, showHistorical, liveMarketMap, sectorMap]);

    const buyCount = groups.reduce((acc, [, sigs]) => acc + sigs.filter((s: StrategySignal) => s.signal === 'BUY').length, 0);
    const sellCount = groups.reduce((acc, [, sigs]) => acc + sigs.filter((s: StrategySignal) => s.signal === 'SELL').length, 0);

    if (loading) return <Loader />;

    return (
        <div className="space-y-5">
            <SectorFilter sectors={availableSectors} value={sectorFilter} onChange={setSectorFilter} />
            <div className="flex flex-wrap gap-3 items-center">
                <div className="flex p-0.5 bg-slate-100 dark:bg-slate-800/60 rounded-lg border border-border dark:border-slate-700/50">
                    {(['ALL', 'BUY', 'SELL', 'HOLD'] as const).map(d => (
                        <button key={d} onClick={() => setFilter(d)}
                            className={cn('px-3 py-1.5 rounded-md text-xs font-bold transition-all',
                                filter === d
                                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200')}>
                            {d === 'ALL' ? 'All' : d}
                        </button>
                    ))}
                </div>
                <div className="flex gap-2 text-[10px] font-bold">
                    <span className="px-2 py-1 rounded-md bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800/40">
                        {buyCount} buys
                    </span>
                    <span className="px-2 py-1 rounded-md bg-rose-50 text-rose-500 border border-rose-200 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800/40">
                        {sellCount} sells
                    </span>
                </div>
                <div className="relative ml-auto">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" strokeWidth={2.5} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search symbol…"
                        className="pl-8 pr-4 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800/50 text-slate-700 dark:text-slate-200 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring w-48" />
                </div>
            </div>
            {groups.length === 0 ? <Empty label="No strategy signals match filters" /> : (
                <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-3">
                    {groups.map(([symbol, sigs]) => {
                        const buySigs = sigs.filter((s: StrategySignal) => s.signal === 'BUY');
                        const sellSigs = sigs.filter((s: StrategySignal) => s.signal === 'SELL');
                        const dominant = buySigs.length >= sellSigs.length ? 'BUY' : 'SELL';
                        return (
                            <UnifiedSignalCard key={symbol} symbol={symbol}
                                direction={dominant as 'BUY' | 'SELL'}
                                ltp={parseFloat(sigs[0]?.last_close ?? '0')}
                                currentPrice={liveMarketMap[symbol]}
                                date={sigs[0]?.date} strength={70}
                                reason={sigs[0]?.strategy_description || sigs.map((s: StrategySignal) => s.strategy_name).join(' · ')}
                                tagline={`${sigs.length} Strategy Signals`}
                                indicators={batchIndicators[symbol]}
                                onSelect={onSelect} />
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ─── WHALE WATCH VIEW ─────────────────────────────────────────────────────────

function WhaleWatchView({ onSelect, liveMarketMap, batchIndicators, fetchBatchIndicators, showHistorical, sectorMap }: BaseSignalViewProps) {
    const [sourceIdx, setSourceIdx] = useState(0);
    const [signals, setSignals] = useState<GeneratedSignal[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [sectorFilter, setSectorFilter] = useState('ALL');
    const currentSource = WHALE_SOURCES[sourceIdx];

    useEffect(() => {
        setLoading(true);
        api.get('/api/stocks/generated-signals/latest/', { params: { source: currentSource } })
            .then(r => setSignals(r.data ?? []))
            .catch(() => setSignals([]))
            .finally(() => setLoading(false));
    }, [currentSource]);

    const availableSectors = useMemo(() => {
        const set = new Set<string>();
        signals.forEach(s => { const sec = sectorMap[s.symbol]; if (sec) set.add(sec); });
        return Array.from(set).sort();
    }, [signals, sectorMap]);

    const filtered = useMemo(() =>
        signals.filter(s => {
            if (search && !s.symbol.toLowerCase().includes(search.toLowerCase())) return false;
            if (sectorFilter !== 'ALL' && sectorMap[s.symbol] !== sectorFilter) return false;
            if (!showHistorical && !isSignalActionable(parseFloat(s.ltp) || 0, liveMarketMap[s.symbol], s.signal, s.generated_date)) return false;
            return true;
        }).sort((a, b) => b.strength - a.strength),
        [signals, search, sectorFilter, showHistorical, liveMarketMap, sectorMap]);

    return (
        <div className="space-y-5">
            <SectorFilter sectors={availableSectors} value={sectorFilter} onChange={setSectorFilter} />
            <div className="flex flex-wrap gap-3 items-center">
                <div className="flex p-0.5 bg-slate-100 dark:bg-slate-800/60 rounded-lg border border-border dark:border-slate-700/50">
                    {WHALE_SOURCES.map((src, i) => (
                        <button key={src} onClick={() => setSourceIdx(i)}
                            className={cn('px-3 py-1.5 rounded-md text-xs font-bold transition-all',
                                sourceIdx === i
                                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200')}>
                            {SOURCE_LABELS[src]}
                        </button>
                    ))}
                </div>
                <div className="flex gap-2 text-[10px] font-bold">
                    <span className="px-2 py-1 rounded-md bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800/40">
                        {filtered.filter(s => s.signal === 'BUY').length} buys
                    </span>
                    <span className="px-2 py-1 rounded-md bg-rose-50 text-rose-500 border border-rose-200 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800/40">
                        {filtered.filter(s => s.signal === 'SELL').length} sells
                    </span>
                </div>
                <div className="relative ml-auto">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" strokeWidth={2.5} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search symbol…"
                        className="pl-8 pr-4 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800/50 text-slate-700 dark:text-slate-200 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring w-48" />
                </div>
            </div>
            {loading ? <Loader /> : filtered.length === 0 ? <Empty label="No signals from this engine. Run pipeline to generate." /> : (
                <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-3">
                    {filtered.map(sig => (
                        <UnifiedSignalCard key={sig.symbol} symbol={sig.symbol} direction={sig.signal}
                            ltp={parseFloat(sig.ltp) || 0} currentPrice={liveMarketMap[sig.symbol]}
                            date={sig.generated_date} strength={sig.strength} reason={sig.rationale}
                            tagline={SOURCE_LABELS[sig.source]} targetPrice={sig.target_price}
                            stopLoss={sig.stop_loss_price} status={sig.status}
                            tp1={sig.metadata?.tp1} tp2={sig.metadata?.tp2} tp3={sig.metadata?.tp3}
                            indicators={batchIndicators[sig.symbol]} smartMoneyMetadata={sig.metadata}
                            onSelect={onSelect} />
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Micro helpers ────────────────────────────────────────────────────────────

function Loader() {
    return (
        <div className="flex justify-center items-center py-20">
            <StockLoader size="md" />
        </div>
    );
}

function Empty({ label }: { label: string }) {
    return (
        <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
            <Layers className="w-7 h-7 text-slate-300 dark:text-slate-700 mb-2" />
            <p className="text-sm text-slate-400 dark:text-slate-500">{label}</p>
        </div>
    );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────

const TABS = [
    { key: 'all', label: 'Command Center', icon: <Radar size={14} /> },
    { key: 'smart', label: 'Smart Money', icon: <Zap size={14} /> },
    { key: 'whale', label: 'Whale Watch', icon: <Activity size={14} /> },
    { key: 'strategies', label: 'Strategies', icon: <Binary size={14} /> },
];

export default function IntelHubClient() {
    const [tab, setTab] = useState('all');
    const [selectedSignal, setSelectedSignal] = useState<{
        symbol: string; ltp: number; currentPrice?: number; strength: number;
        direction: 'BUY' | 'SELL'; targetPrice?: number; stopLoss?: number;
        tp1?: number; tp2?: number; tp3?: number; status?: string;
    } | null>(null);
    const [liveMarketMap, setLiveMarketMap] = useState<Record<string, number>>({});
    const [batchIndicators, setBatchIndicators] = useState<Record<string, BatchIndicatorData>>({});
    const [showHistorical, setShowHistorical] = useState(false);
    const [sectorMap, setSectorMap] = useState<Record<string, string>>({});

    const fetchBatchIndicators = async (symbols: string[]) => {
        if (!symbols.length) return;
        try {
            const res = await api.get('/api/stocks/batch-indicators/', { params: { symbols: symbols.join(',') } });
            setBatchIndicators(prev => ({ ...prev, ...res.data }));
        } catch (_) { }
    };

    useEffect(() => {
        api.get('/api/stocks/summary/').then(res => {
            const d = res.data;
            const map: Record<string, number> = {};
            [...(d.top_gainers || []), ...(d.top_losers || []), ...(d.top_volume || []), ...(d.top_turnover || [])].forEach((s: any) => {
                if (s.ticker && s.close) map[s.ticker] = s.close;
            });
            setLiveMarketMap(map);
        }).catch(() => { });
        api.get('/api/stocks/companies/')
            .then(res => {
                const map: Record<string, string> = {};
                for (const c of res.data) {
                    if (c.symbol && c.sector) map[c.symbol] = c.sector;
                }
                setSectorMap(map);
            })
            .catch(() => { });
    }, []);

    const sharedProps: BaseSignalViewProps = {
        onSelect: setSelectedSignal,
        liveMarketMap,
        batchIndicators,
        fetchBatchIndicators,
        showHistorical,
        sectorMap,
    };

    return (
        <DashboardLayout>
            <div className="pb-20 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

                {/* ── Controls bar ── */}
                <div className="flex flex-wrap items-center gap-4 justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-slate-400 dark:text-slate-500">Show historical</span>
                        <button
                            onClick={() => setShowHistorical(!showHistorical)}
                            role="switch"
                            aria-checked={showHistorical}
                            className={cn(
                                'relative h-5 w-9 rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                                showHistorical ? 'bg-primary' : 'bg-slate-200 dark:bg-slate-700'
                            )}>
                            <span className={cn(
                                'absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white dark:bg-card shadow transition-transform duration-200',
                                showHistorical ? 'translate-x-4' : 'translate-x-0'
                            )} />
                        </button>
                    </div>
                    <Link
                        href="/signals/track-record"
                        className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                    >
                        <Activity size={12} />
                        Track Record
                        <ArrowRight size={11} />
                    </Link>
                </div>

                {/* ── Tab navigation ── */}
                <div className="flex p-0.5 bg-slate-100 dark:bg-card rounded-xl border border-border dark:border-slate-800/50 w-fit">
                    {TABS.map(t => (
                        <button key={t.key} onClick={() => setTab(t.key)}
                            className={cn(
                                'flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all',
                                tab === t.key
                                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm border border-border dark:border-slate-700/50'
                                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                            )}>
                            <span className={tab === t.key ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-600'}>
                                {t.icon}
                            </span>
                            {t.label}
                        </button>
                    ))}
                </div>

                {/* ── Main content ── */}
                <div className="animate-in fade-in slide-in-from-bottom-1 duration-300">
                    {tab === 'all' && <AllSourcesView {...sharedProps} />}
                    {tab === 'smart' && <SmartMoneyView {...sharedProps} />}
                    {tab === 'whale' && <WhaleWatchView {...sharedProps} />}
                    {tab === 'strategies' && <StrategiesView {...sharedProps} />}
                </div>
            </div>

            {/* Detail modal */}
            <Dialog open={!!selectedSignal} onOpenChange={() => setSelectedSignal(null)}>
                <DialogContent className="w-[90vw] h-[90vh] max-w-none sm:max-w-none p-0 overflow-hidden border-none bg-transparent shadow-none">
                    <VisuallyHidden.Root>
                        <DialogTitle>{selectedSignal?.symbol || 'Signal'} Intelligence</DialogTitle>
                        <DialogDescription>
                            Comprehensive technical and fundamental analysis for {selectedSignal?.symbol}.
                        </DialogDescription>
                    </VisuallyHidden.Root>
                    {selectedSignal && (
                        <SignalDetailErrorBoundary symbol={selectedSignal.symbol} onReset={() => setSelectedSignal(null)}>
                            <AnalysisTabs
                                symbol={selectedSignal.symbol}
                                ladder={{
                                    cmp: selectedSignal.currentPrice || selectedSignal.ltp || undefined,
                                    entry: selectedSignal.ltp || undefined,
                                    stopLoss: selectedSignal.stopLoss,
                                    tp1: selectedSignal.tp1 ?? selectedSignal.targetPrice,
                                    tp2: selectedSignal.tp2,
                                    tp3: selectedSignal.tp3,
                                    direction: selectedSignal.direction,
                                }}
                            />
                        </SignalDetailErrorBoundary>
                    )}
                </DialogContent>
            </Dialog>
        </DashboardLayout>
    );
}
