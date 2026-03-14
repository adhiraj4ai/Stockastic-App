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

// ─── Shared types ──────────────────────────────────────────────────────────────

interface SmartSignal {
    symbol: string; name: string; sector: string;
    cluster_count: number; inst_net_5d: number; top_broker_wac: number;
    ltp: number; signal_type: 'Platinum Buy' | 'Gold Signal' | 'Silver Signal' | 'Bullish Divergence';
    rationale: string; strength: string; markup_percent: number; price_change_5d: number;
}

interface StrategySignal {
    id: number; strategy_name: string; strategy_description: string;
    symbol: string; date: string; signal: 'BUY' | 'SELL' | 'HOLD' | 'NEUTRAL';
    last_close: string; metadata: any;
}

interface WhaleRec {
    symbol: string; signal: 'BUY' | 'SELL'; strength: number;
    reason: string; close: number; date: string; rsi?: number; macd_hist?: number;
}

// ─── Normalised unified signal ─────────────────────────────────────────────────

interface UnifiedSignal {
    symbol: string;
    direction: 'BUY' | 'SELL';
    ltp: number;
    smartMoney?: { tier: string; markup: number; rationale: string; brokers: number };
    strategy?: { names: string[]; count: number; date: string };
    whale?: { engine: string; strength: number; reason: string; rsi?: number };
    conviction: number; // 1–3, number of agreeing sources
}

const WHALE_ENGINES = [
    { key: 'broker', label: 'Broker Accum.', endpoint: '/api/stocks/broker-accumulation-recommendations/' },
    { key: 'crossover', label: 'Smart Crossover', endpoint: '/api/stocks/smart-accumulated-crossover-recommendations/' },
    { key: 'ichimoku', label: 'Ichimoku', endpoint: '/api/stocks/ichimoku-accumulation-recommendations/' },
];

// ─── Helper UI pieces ──────────────────────────────────────────────────────────

function SignalBadge({ direction }: { direction: 'BUY' | 'SELL' }) {
    return (
        <span className={cn(
            'px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wide',
            direction === 'BUY'
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                : 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
        )}>
            {direction === 'BUY' ? '▲' : '▼'} {direction}
        </span>
    );
}

function SourceBadge({ label, color }: { label: string; color: string }) {
    return <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold border', color)}>{label}</span>;
}

const CONVICTION_META = [
    { label: '', color: '' },
    { label: 'Single Source', color: 'text-slate-500 dark:text-slate-400' },
    { label: 'Dual Confirmation', color: 'text-amber-600 dark:text-amber-400' },
    { label: 'Triple Conviction', color: 'text-emerald-600 dark:text-emerald-400' },
];

function UnifiedSignalCard({ 
    symbol, 
    direction, 
    ltp, 
    strength, 
    reason, 
    tagline, 
    conviction, 
    onSelect 
}: { 
    symbol: string; 
    direction: 'BUY' | 'SELL'; 
    ltp: number; 
    strength?: number; 
    reason?: string; 
    tagline?: string; 
    conviction?: number;
    onSelect: (s: { symbol: string; ltp: number; strength: number; direction: 'BUY' | 'SELL' }) => void;
}) {
    return (
        <div 
            onClick={() => onSelect({ symbol, ltp, strength: strength || 50, direction })}
            className={cn(
                'group relative rounded-2xl border border-l-[6px] p-5 cursor-pointer transition-all hover:shadow-2xl hover:-translate-y-0.5 bg-white/70 dark:bg-slate-900/50 backdrop-blur-xl',
                direction === 'BUY' ? 'border-l-emerald-500 border-slate-200/60 dark:border-emerald-500/30' : 'border-l-rose-500 border-slate-200/60 dark:border-rose-500/30'
            )}>
            <div className="flex items-center justify-between gap-6">
                <div className="flex items-center gap-5 w-44 shrink-0">
                    <div className="space-y-1">
                        <div className="flex items-center gap-3">
                            <Link href={`/ticker/${symbol}`} onClick={(e) => e.stopPropagation()} className="text-lg font-black tracking-tight text-slate-900 dark:text-slate-100 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                                {symbol}
                            </Link>
                            <SignalBadge direction={direction} />
                        </div>
                        {tagline && <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">{tagline}</p>}
                    </div>
                </div>

                <div className="flex-1 hidden md:block min-w-0">
                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400 leading-relaxed truncate max-w-xl">
                        {reason}
                    </p>
                </div>

                <div className="shrink-0 text-right h-full flex items-center gap-6">
                    <div className="space-y-1">
                        <div className="text-lg font-black font-mono text-slate-900 dark:text-slate-100 tracking-tighter">Rs. {ltp.toLocaleString()}</div>
                        <div className="flex items-center justify-end gap-2 pr-1">
                            {conviction !== undefined && conviction > 1 && (
                                <span className={cn('text-[9px] font-black uppercase tracking-tighter', CONVICTION_META[conviction]?.color)}>
                                    {conviction >= 3 ? 'Platinum Setup' : 'Confirmed'}
                                </span>
                            )}
                            {strength !== undefined && (
                                <span className="text-[9px] font-black text-slate-400">STR {strength.toFixed(0)}%</span>
                            )}
                        </div>
                    </div>
                    <div className="p-2 rounded-xl text-slate-200 group-hover:text-indigo-400 transition-colors">
                        <Activity size={16} />
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── ALL SOURCES VIEW ──────────────────────────────────────────────────────────

interface BaseSignalViewProps {
    onSelect: (signal: { symbol: string; ltp: number; strength: number; direction: 'BUY' | 'SELL' }) => void;
}

function AllSourcesView({ onSelect }: BaseSignalViewProps) {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [unified, setUnified] = useState<UnifiedSignal[]>([]);
    const [search, setSearch] = useState('');
    const [dirFilter, setDirFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
    const [minConviction, setMinConviction] = useState(1);

    useEffect(() => {
        const fetch = async () => {
            setLoading(true);
            const map = new Map<string, UnifiedSignal>();

            const upsert = (symbol: string, dir: 'BUY' | 'SELL', ltp: number) => {
                const existing = map.get(symbol);
                if (!existing) map.set(symbol, { symbol, direction: dir, ltp, conviction: 0 });
                return map.get(symbol)!;
            };

            try {
                const [smRes, stRes, wwRes] = await Promise.all([
                    api.get('/api/stocks/broker-analysis/signals/').catch(() => null),
                    api.get('/api/stocks/signals/', { params: { page_size: 500 } }).catch(() => null),
                    api.get(WHALE_ENGINES[0].endpoint).catch(() => null)
                ]);

                if (smRes?.data) {
                    for (const s of smRes.data as SmartSignal[]) {
                        const dir = s.markup_percent >= 0 ? 'BUY' : 'SELL';
                        const u = upsert(s.symbol, dir, s.ltp);
                        u.smartMoney = { tier: s.signal_type, markup: s.markup_percent, rationale: s.rationale, brokers: s.cluster_count };
                        u.conviction++;
                    }
                }

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

                if (wwRes?.data) {
                    for (const r of wwRes.data as WhaleRec[]) {
                        if (r.signal !== 'BUY' && r.signal !== 'SELL') continue;
                        const u = upsert(r.symbol, r.signal, r.close);
                        u.whale = { engine: WHALE_ENGINES[0].label, strength: r.strength, reason: r.reason, rsi: r.rsi };
                        u.conviction++;
                    }
                }
            } catch (_) { }

            const sorted = [...map.values()].sort((a, b) => b.conviction - a.conviction || b.ltp - a.ltp);
            setUnified(sorted);
            setLoading(false);
        };
        fetch();
    }, []);

    const filtered = useMemo(() => unified.filter(u =>
        u.conviction >= minConviction &&
        (dirFilter === 'ALL' || u.direction === dirFilter) &&
        (!search || u.symbol.toLowerCase().includes(search.toLowerCase()))
    ), [unified, search, dirFilter, minConviction]);

    const buys = unified.filter(u => u.direction === 'BUY').length;
    const sells = unified.filter(u => u.direction === 'SELL').length;
    const multiSource = unified.filter(u => u.conviction >= 2).length;

    if (loading) return <PageLoader text="Compiling intelligence hub…" />;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Buy Signals', value: buys, icon: <TrendingUp size={14} />, color: 'text-emerald-500', bg: 'bg-emerald-500/10 border-emerald-500/20' },
                    { label: 'Sell Signals', value: sells, icon: <TrendingDown size={14} />, color: 'text-rose-500', bg: 'bg-rose-500/10 border-rose-500/20' },
                    { label: 'Multi-Source', value: multiSource, icon: <Activity size={14} />, color: 'text-amber-500', bg: 'bg-amber-500/10 border-amber-500/20' },
                    { label: 'Intelligence', value: unified.length, icon: <Radar size={14} />, color: 'text-indigo-500', bg: 'bg-indigo-500/10 border-indigo-500/20' },
                ].map(m => (
                    <div key={m.label} className={cn('rounded-2xl border p-5 backdrop-blur-xl transition-all hover:scale-[1.02]', m.bg)}>
                        <div className="flex justify-between items-center mb-2">
                            <span className={cn('p-1.5 rounded-lg bg-white/50 dark:bg-slate-900/50', m.color)}>{m.icon}</span>
                            <div className={cn('text-2xl font-black', m.color)}>{m.value}</div>
                        </div>
                        <div className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">{m.label}</div>
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
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider px-2">Threshold</span>
                        {[1, 2, 3].map(n => (
                            <button key={n} onClick={() => setMinConviction(n)}
                                className={cn('w-8 h-8 rounded-lg text-xs font-black transition-all flex items-center justify-center',
                                    minConviction === n ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 border-indigo-500' : 'text-slate-500 hover:text-indigo-600')}>
                                {n}
                            </button>
                        ))}
                    </div>
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" strokeWidth={2.5} />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Symbol…"
                            className="pl-9 pr-4 py-2 text-xs font-medium rounded-xl border border-slate-200/50 dark:border-slate-700/50 bg-white/50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-400/30 w-64" />
                    </div>
                </div>
            </div>

            {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-3xl">
                    <Layers className="w-8 h-8 text-slate-200 dark:text-slate-700 mb-3" />
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest">No matching intelligence found</p>
                </div>
            ) : (
                <div className="grid gap-3 animate-in fade-in slide-in-from-top-2 duration-500">
                    {filtered.map(u => (
                        <UnifiedSignalCard 
                            key={u.symbol}
                            symbol={u.symbol}
                            direction={u.direction}
                            ltp={u.ltp}
                            strength={u.whale?.strength || (u.smartMoney ? u.smartMoney.markup + 50 : 50)}
                            conviction={u.conviction}
                            reason={u.smartMoney?.rationale || u.whale?.reason || u.strategy?.names.join(' · ') || 'System Breakout'}
                            tagline={u.smartMoney?.tier || (u.strategy ? `${u.strategy.count} Strategies` : 'Whale Accumulation')}
                            onSelect={onSelect}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── SMART MONEY VIEW ─────────────────────────────────────────────────────────

function SmartMoneyView({ onSelect }: BaseSignalViewProps) {
    const [signals, setSignals] = useState<SmartSignal[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeSection, setActiveSection] = useState('platinum');

    useEffect(() => {
        api.get('/api/stocks/broker-analysis/signals/')
            .then(r => setSignals(r.data))
            .catch(() => { })
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <Loader size />;

    const sections = [
        { id: 'platinum', label: 'Platinum', badge: 'Optimal Entry', dot: 'bg-indigo-500', badgeCls: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300', items: signals.filter(s => s.signal_type === 'Platinum Buy') },
        { id: 'gold', label: 'Gold', badge: 'High Conviction', dot: 'bg-amber-500', badgeCls: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300', items: signals.filter(s => s.signal_type === 'Gold Signal') },
        { id: 'silver', label: 'Silver', badge: 'Institutional Entry', dot: 'bg-slate-400', badgeCls: 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300', items: signals.filter(s => s.signal_type === 'Silver Signal') },
        { id: 'divergence', label: 'Divergence', badge: 'Bullish Divergence', dot: 'bg-emerald-500', badgeCls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300', items: signals.filter(s => s.signal_type === 'Bullish Divergence') },
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
                    <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">{current.label} Setups</h3>
                    <span className={cn('text-[10px] font-black px-2 py-0.5 rounded-full border uppercase tracking-wider', current.badgeCls)}>{current.badge}</span>
                </div>
                
                {current.items.length === 0
                    ? <Empty label={`No ${current.label} signals right now`} />
                    : <div className="grid grid-cols-1 gap-3">
                        {current.items.map(sig => (
                            <UnifiedSignalCard 
                                key={sig.symbol}
                                symbol={sig.symbol}
                                direction={sig.markup_percent >= 0 ? 'BUY' : 'SELL'}
                                ltp={sig.ltp}
                                strength={parseFloat(sig.strength) || 50}
                                reason={sig.rationale}
                                tagline={sig.signal_type}
                                conviction={sig.signal_type === 'Platinum Buy' ? 3 : sig.signal_type === 'Gold Signal' ? 2 : 1}
                                onSelect={onSelect}
                            />
                        ))}
                    </div>
                }
            </div>
        </div>
    );
}


// ─── STRATEGIES VIEW ─────────────────────────────────────────────────────────

function StrategiesView({ onSelect }: BaseSignalViewProps) {
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
            (map.get(s.symbol) ?? map.set(s.symbol, []).get(s.symbol)!).push(s);
        }
        return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
    }, [signals, filter, search]);

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
                        className="pl-9 pr-4 py-2 text-xs font-medium rounded-xl border border-slate-200/50 dark:border-slate-700/50 bg-white/50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-400/30 w-64 backdrop-blur-sm transition-all" />
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
                                strength={70}
                                reason={sigs[0]?.strategy_description || sigs.map(s => s.strategy_name).join(' · ')}
                                tagline={`${sigs.length} Strategy Signals`}
                                onSelect={onSelect}
                            />
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ─── WHALE WATCH VIEW ─────────────────────────────────────────────────────────

function WhaleWatchView({ onSelect }: BaseSignalViewProps) {
    const [engineIdx, setEngineIdx] = useState(0);
    const [recs, setRecs] = useState<WhaleRec[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const router = useRouter();

    useEffect(() => {
        setLoading(true);
        api.get(WHALE_ENGINES[engineIdx].endpoint)
            .then(r => setRecs(r.data ?? []))
            .catch(() => setRecs([]))
            .finally(() => setLoading(false));
    }, [engineIdx]);

    const filtered = useMemo(() =>
        recs.filter(r => (r.signal === 'BUY' || r.signal === 'SELL') && (!search || r.symbol.includes(search.toUpperCase())))
            .sort((a, b) => b.strength - a.strength),
        [recs, search]);

    const buys = filtered.filter(r => r.signal === 'BUY');
    const sells = filtered.filter(r => r.signal === 'SELL');

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap gap-4 items-center justify-between">
                <div className="flex flex-wrap gap-2 p-1 bg-slate-100/50 dark:bg-slate-800/40 rounded-xl border border-slate-200/50 dark:border-slate-700/50 backdrop-blur-sm">
                    {WHALE_ENGINES.map((e, i) => (
                        <button key={e.key} onClick={() => setEngineIdx(i)}
                            className={cn('px-4 py-2 rounded-lg text-xs font-bold transition-all',
                                engineIdx === i 
                                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm border border-slate-200/50 dark:border-slate-600/50' 
                                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200')}>
                            {e.label}
                        </button>
                    ))}
                </div>
                
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" strokeWidth={2.5} />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter symbol…"
                            className="pl-9 pr-4 py-2 text-xs font-medium rounded-xl border border-slate-200/50 dark:border-slate-700/50 bg-white/50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-cyan-400/30 w-64 backdrop-blur-sm transition-all" />
                    </div>
                </div>
            </div>

            <div className="flex gap-4 text-[10px] font-black tracking-widest uppercase">
                <div className="flex items-center gap-1.5 text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-100 dark:border-emerald-500/20">{buys.length} Buy Signals</div>
                <div className="flex items-center gap-1.5 text-rose-500 bg-rose-50 dark:bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-100 dark:border-rose-500/20">{sells.length} Sell Signals</div>
            </div>

            {loading ? <Loader size /> : filtered.length === 0 ? <Empty label="No signals from this engine" /> : (
                <div className="grid gap-2 animate-in fade-in slide-in-from-top-2 duration-500">
                    {filtered.map(r => (
                        <UnifiedSignalCard 
                            key={r.symbol}
                            symbol={r.symbol}
                            direction={r.signal}
                            ltp={r.close}
                            strength={r.strength}
                            reason={r.reason}
                            tagline={WHALE_ENGINES[engineIdx].label}
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
            <p className="text-sm text-slate-400">{label}</p>
        </div>
    );
}

// ─── ROOT ──────────────────────────────────────────────────────────────────────

const TABS = [
    { key: 'all', label: 'Command Center', icon: <Radar size={16} />, desc: 'Real-time alpha discovery from across the market ecosystem.' },
    { key: 'smart', label: 'Smart Money', icon: <Zap size={16} />, desc: 'Institutional broker flow and professional accumulation zones.' },
    { key: 'whale', label: 'Whale Watch', icon: <Activity size={16} />, desc: 'Deep technical analysis and large order execution tracking.' },
    { key: 'strategies', label: 'Strategies', icon: <Binary size={16} />, desc: 'Quantitative signal engines and automated technical setups.' },
];

export default function IntelHubClient() {
    const [tab, setTab] = useState('all');
    const [selectedSignal, setSelectedSignal] = useState<{ symbol: string; ltp: number; strength: number; direction: 'BUY' | 'SELL' } | null>(null);

    return (
        <DashboardLayout
            title={<span className="flex items-center gap-3 text-3xl font-black tracking-tighter text-slate-900 dark:text-white">Signal Intelligence</span>}
            subtitle={TABS.find(t => t.key === tab)?.desc}
        >
            <div className="space-y-8 pb-20">
                {/* Navigation bar */}
                <div className="flex flex-wrap gap-2 p-1.5 bg-slate-100/50 dark:bg-slate-900/50 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 backdrop-blur-xl w-fit">
                    {TABS.map(t => (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            className={cn(
                                'flex items-center gap-2.5 px-6 py-3 rounded-xl text-xs font-black transition-all group overflow-hidden relative',
                                tab === t.key
                                    ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xl shadow-slate-200/30 dark:shadow-none border border-slate-200/50 dark:border-slate-700/50'
                                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-slate-800/50'
                            )}
                        >
                            <span className={cn('transition-transform duration-500 group-hover:scale-125', tab === t.key ? 'text-indigo-500' : 'text-slate-400')}>
                                {t.icon}
                            </span>
                            <span className="relative z-10">{t.label}</span>
                            {tab === t.key && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-500/50" />}
                        </button>
                    ))}
                </div>

                {/* Main Content Area with staggered animation */}
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-700">
                    {tab === 'all'        && <AllSourcesView onSelect={setSelectedSignal} />}
                    {tab === 'smart'      && <SmartMoneyView onSelect={setSelectedSignal} />}
                    {tab === 'strategies' && <StrategiesView onSelect={setSelectedSignal} />}
                    {tab === 'whale'      && <WhaleWatchView onSelect={setSelectedSignal} />}
                </div>
            </div>

            {/* Premium Details Modal */}
            <Dialog open={!!selectedSignal} onOpenChange={() => setSelectedSignal(null)}>
                <DialogContent className="w-[90vw] h-[90vh] max-w-none sm:max-w-none p-0 overflow-hidden border-none bg-transparent shadow-none">
                    {selectedSignal && (
                        <DailySignalStatus 
                            symbol={selectedSignal.symbol}
                            cmp={selectedSignal.ltp}
                            strength={selectedSignal.strength}
                            direction={selectedSignal.direction}
                            className="shadow-2xl border-slate-200 dark:border-slate-800"
                        />
                    )}
                </DialogContent>
            </Dialog>
        </DashboardLayout>
    );
}
