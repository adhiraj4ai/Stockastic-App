'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import DashboardLayout from '@/components/DashboardLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
    TrendingUp, TrendingDown, Zap, Crosshair, Radar, Layers,
    Search, RefreshCw, ArrowRight, Activity, Loader2, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

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

// ─── ALL SOURCES VIEW ──────────────────────────────────────────────────────────

function AllSourcesView() {
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
                // 1. Smart Money
                const smRes = await api.get('/api/stocks/broker-analysis/signals/').catch(() => null);
                if (smRes?.data) {
                    for (const s of smRes.data as SmartSignal[]) {
                        const dir = s.markup_percent >= 0 ? 'BUY' : 'SELL';
                        const u = upsert(s.symbol, dir, s.ltp);
                        u.smartMoney = { tier: s.signal_type, markup: s.markup_percent, rationale: s.rationale, brokers: s.cluster_count };
                        u.conviction++;
                    }
                }

                // 2. Strategy signals (today's BUY/SELL only)
                const stRes = await api.get('/api/stocks/signals/', { params: { page_size: 500 } }).catch(() => null);
                if (stRes?.data?.results) {
                    const grouped = new Map<string, { dir: 'BUY' | 'SELL'; names: string[]; date: string; ltp: number }>();
                    for (const s of stRes.data.results as StrategySignal[]) {
                        if (s.signal !== 'BUY' && s.signal !== 'SELL') continue;
                        const existing = grouped.get(s.symbol);
                        if (!existing) {
                            grouped.set(s.symbol, { dir: s.signal, names: [s.strategy_name], date: s.date, ltp: parseFloat(s.last_close) });
                        } else {
                            existing.names.push(s.strategy_name);
                            if (s.signal === 'BUY') existing.dir = 'BUY'; // BUY wins on conflict
                        }
                    }
                    for (const [symbol, data] of grouped) {
                        const u = upsert(symbol, data.dir, data.ltp);
                        u.strategy = { names: data.names, count: data.names.length, date: data.date };
                        u.conviction++;
                    }
                }

                // 3. Whale Watch (first engine only for speed)
                const wwRes = await api.get(WHALE_ENGINES[0].endpoint).catch(() => null);
                if (wwRes?.data) {
                    for (const r of wwRes.data as WhaleRec[]) {
                        if (r.signal !== 'BUY' && r.signal !== 'SELL') continue;
                        const u = upsert(r.symbol, r.signal, r.close);
                        u.whale = { engine: WHALE_ENGINES[0].label, strength: r.strength, reason: r.reason, rsi: r.rsi };
                        u.conviction++;
                    }
                }
            } catch (_) { /* ignore */ }

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

    if (loading) return (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
            <p className="text-sm text-slate-500 font-medium">Aggregating intelligence from all sources…</p>
        </div>
    );

    return (
        <div className="space-y-5">
            {/* Summary strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                    { label: 'Buy Signals', value: buys, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800' },
                    { label: 'Sell Signals', value: sells, color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-900/20 border-rose-100 dark:border-rose-800' },
                    { label: 'Multi-Source', value: multiSource, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-800' },
                    { label: 'Total Signals', value: unified.length, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-100 dark:border-indigo-800' },
                ].map(m => (
                    <div key={m.label} className={cn('rounded-xl border p-4', m.bg)}>
                        <div className={cn('text-2xl font-black', m.color)}>{m.value}</div>
                        <div className="text-xs font-bold text-slate-500 dark:text-slate-400 mt-0.5 uppercase tracking-wider">{m.label}</div>
                    </div>
                ))}
            </div>

            {/* Controls */}
            <div className="flex flex-wrap gap-2 items-center">
                <div className="relative flex-1 min-w-[160px] max-w-xs">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Search symbol…"
                        className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-400/40"
                    />
                </div>
                <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                    {(['ALL', 'BUY', 'SELL'] as const).map(d => (
                        <button key={d} onClick={() => setDirFilter(d)}
                            className={cn('px-3 py-1.5 text-xs font-bold transition-colors',
                                dirFilter === d ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700')}>
                            {d}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-2 ml-auto">
                    <span className="text-xs text-slate-500 font-medium">Min sources:</span>
                    {[1, 2, 3].map(n => (
                        <button key={n} onClick={() => setMinConviction(n)}
                            className={cn('w-7 h-7 rounded-lg text-xs font-black transition-all',
                                minConviction === n ? 'bg-indigo-600 text-white shadow' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700')}>
                            {n}
                        </button>
                    ))}
                </div>
            </div>

            {/* Signal list */}
            {filtered.length === 0 ? (
                <div className="text-center py-16 text-slate-400 text-sm">No signals match your filters.</div>
            ) : (
                <div className="space-y-2">
                    {filtered.map(u => (
                        <div key={u.symbol}
                            onClick={() => router.push(`/ticker/${u.symbol}`)}
                            className={cn(
                                'group relative rounded-xl border border-l-4 p-4 cursor-pointer transition-all hover:shadow-md',
                                u.conviction >= 3
                                    ? 'border-l-emerald-500 bg-emerald-50/30 dark:bg-emerald-900/10 border-emerald-200/60 dark:border-emerald-800/40'
                                    : u.conviction === 2
                                        ? 'border-l-amber-400 bg-amber-50/20 dark:bg-amber-900/10 border-amber-200/60 dark:border-amber-800/40'
                                        : 'border-l-slate-300 bg-white dark:bg-slate-900/40 border-slate-100 dark:border-slate-800/60',
                            )}>
                            <div className="flex items-start justify-between gap-4">
                                {/* Left: ticker + sources */}
                                <div className="flex items-center gap-3 min-w-0">
                                    <div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-base font-black text-slate-900 dark:text-slate-100">{u.symbol}</span>
                                            <SignalBadge direction={u.direction} />
                                            {u.conviction >= 2 && (
                                                <span className={cn('text-[10px] font-black uppercase tracking-wider', CONVICTION_META[u.conviction]?.color)}>
                                                    {u.conviction === 3 ? '⚡' : '◆'} {CONVICTION_META[u.conviction]?.label}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex gap-1.5 mt-1.5 flex-wrap">
                                            {u.smartMoney && <SourceBadge label="Smart Money" color="bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-700" />}
                                            {u.strategy && <SourceBadge label={`Strategies ×${u.strategy.count}`} color="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700" />}
                                            {u.whale && <SourceBadge label="Whale Watch" color="bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-300 dark:border-cyan-700" />}
                                        </div>
                                    </div>
                                </div>

                                {/* Centre: key insight */}
                                <div className="flex-1 hidden md:block min-w-0">
                                    {u.smartMoney && (
                                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                            <span className="font-semibold text-indigo-600 dark:text-indigo-400">{u.smartMoney.tier}</span>
                                            {' — '}{u.smartMoney.rationale}
                                        </p>
                                    )}
                                    {!u.smartMoney && u.whale && (
                                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{u.whale.reason}</p>
                                    )}
                                    {u.strategy && (
                                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate">
                                            {u.strategy.names.slice(0, 3).join(' · ')}{u.strategy.names.length > 3 ? ` +${u.strategy.names.length - 3}` : ''}
                                        </p>
                                    )}
                                </div>

                                {/* Right: price + metrics */}
                                <div className="shrink-0 text-right space-y-1">
                                    <div className="text-base font-black font-mono text-slate-900 dark:text-slate-100">Rs. {u.ltp.toLocaleString()}</div>
                                    <div className="flex items-center justify-end gap-2">
                                        {u.smartMoney && (
                                            <span className={cn('text-[10px] font-bold',
                                                u.smartMoney.markup >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
                                                {u.smartMoney.markup >= 0 ? '+' : ''}{u.smartMoney.markup.toFixed(1)}% vs WAC
                                            </span>
                                        )}
                                        {u.whale && (
                                            <span className="text-[10px] font-bold text-cyan-600 dark:text-cyan-400">
                                                {u.whale.strength.toFixed(0)}% str
                                            </span>
                                        )}
                                    </div>
                                    {u.whale?.rsi !== undefined && (
                                        <span className="text-[10px] text-slate-400 font-mono">RSI {u.whale.rsi.toFixed(1)}</span>
                                    )}
                                </div>

                                <ChevronRight size={16} className="shrink-0 text-slate-300 dark:text-slate-600 group-hover:text-slate-500 dark:group-hover:text-slate-400 mt-1 transition-colors" />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── SMART MONEY VIEW ─────────────────────────────────────────────────────────

function SmartMoneyView() {
    const [signals, setSignals] = useState<SmartSignal[]>([]);
    const [loading, setLoading] = useState(true);

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
    const defaultTab = sections.find(s => s.items.length > 0)?.id ?? 'platinum';

    return (
        <Tabs defaultValue={defaultTab} className="w-full">
            <TabsList className="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1 mb-6 flex-wrap h-auto gap-1">
                {sections.map(s => (
                    <TabsTrigger key={s.id} value={s.id} className="flex items-center gap-1.5 px-3 py-1.5 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:shadow-sm rounded-md">
                        <span className={cn('w-2 h-2 rounded-full', s.dot)} />
                        {s.label}
                        <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px] font-bold bg-slate-200 dark:bg-slate-700">{s.items.length}</Badge>
                    </TabsTrigger>
                ))}
            </TabsList>
            {sections.map(sec => (
                <TabsContent key={sec.id} value={sec.id} className="mt-0 outline-none">
                    <div className="flex items-center gap-2 mb-4">
                        <h3 className="font-bold text-slate-800 dark:text-slate-200">{sec.label} Setups</h3>
                        <span className={cn('text-[11px] font-bold px-2 py-0.5 rounded-full border', sec.badgeCls)}>{sec.badge}</span>
                    </div>
                    {sec.items.length === 0
                        ? <Empty label={`No ${sec.label} signals right now`} />
                        : <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {sec.items.map(sig => <SmartCard key={sig.symbol} sig={sig} dot={sec.dot} />)}
                        </div>
                    }
                </TabsContent>
            ))}
        </Tabs>
    );
}

function SmartCard({ sig, dot }: { sig: SmartSignal; dot: string }) {
    const pos = sig.markup_percent >= 0;
    const prog = Math.min(Math.max((sig.markup_percent + 10) * 2, 0), 100);
    return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 overflow-hidden hover:shadow-lg transition-all group relative">
            <div className={cn('absolute top-0 left-0 w-1 h-full', dot)} />
            <div className="p-5 pl-6">
                <div className="flex justify-between items-start mb-3">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-xl font-black text-slate-900 dark:text-slate-100">{sig.symbol}</span>
                            <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">{sig.sector}</span>
                        </div>
                        <p className="text-sm text-slate-500 mt-0.5 truncate max-w-[180px]">{sig.name}</p>
                    </div>
                    <div className="text-right">
                        <div className="text-xl font-black font-mono text-slate-900 dark:text-slate-100">Rs. {sig.ltp}</div>
                        <div className={cn('text-xs font-bold flex items-center justify-end gap-0.5', pos ? 'text-emerald-600' : 'text-rose-600')}>
                            {pos ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                            {Math.abs(sig.markup_percent).toFixed(1)}% vs WAC
                        </div>
                    </div>
                </div>
                <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5 mb-3">
                    <Activity size={12} /> {sig.rationale}
                </p>
                <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg p-3 text-xs space-y-1 mb-3">
                    <div className="flex justify-between"><span className="text-slate-500">Smart Brokers</span><span className="font-bold text-slate-700 dark:text-slate-300">{sig.cluster_count} buying</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">5D Net Flow</span><span className="font-mono text-slate-800 dark:text-slate-200">{sig.inst_net_5d.toLocaleString()} qty</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Key Broker WAC</span><span className="font-bold text-indigo-600 dark:text-indigo-400">Rs. {sig.top_broker_wac}</span></div>
                </div>
                <div className="space-y-1 mb-3">
                    <div className="flex justify-between text-[10px] text-slate-400"><span>WAC Zone</span><span>Breakout</span></div>
                    <Progress value={prog} className="h-1.5" />
                </div>
                <Link href={`/ticker/${sig.symbol}`} className="flex items-center justify-center gap-1.5 w-full py-1.5 rounded-lg bg-indigo-600 group-hover:bg-indigo-700 text-white text-xs font-bold transition-colors">
                    Analyse <ArrowRight size={12} />
                </Link>
            </div>
        </div>
    );
}

// ─── STRATEGIES VIEW ─────────────────────────────────────────────────────────

function StrategiesView() {
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

    // Group by symbol
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
        <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
                <div className="relative flex-1 min-w-[160px] max-w-xs">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search symbol…"
                        className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-400/40" />
                </div>
                <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                    {(['ALL', 'BUY', 'SELL', 'HOLD'] as const).map(d => (
                        <button key={d} onClick={() => setFilter(d)}
                            className={cn('px-3 py-1.5 text-xs font-bold transition-colors',
                                filter === d ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700')}>
                            {d}
                        </button>
                    ))}
                </div>
            </div>

            {groups.length === 0 ? <Empty label="No strategy signals match your filters" /> : (
                <div className="space-y-2">
                    {groups.map(([symbol, sigs]) => {
                        const buySigs = sigs.filter(s => s.signal === 'BUY');
                        const sellSigs = sigs.filter(s => s.signal === 'SELL');
                        const dominant = buySigs.length >= sellSigs.length ? 'BUY' : 'SELL';
                        const ltp = parseFloat(sigs[0]?.last_close ?? '0');
                        return (
                            <div key={symbol} onClick={() => router.push(`/ticker/${symbol}`)}
                                className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/40 hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer transition-all group">
                                <div className="flex items-center gap-3">
                                    <span className="font-black text-slate-900 dark:text-slate-100 text-sm">{symbol}</span>
                                    <SignalBadge direction={dominant as 'BUY' | 'SELL'} />
                                </div>
                                <div className="flex-1 flex flex-wrap gap-1 hidden md:flex">
                                    {sigs.slice(0, 4).map(s => (
                                        <span key={s.id} className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                            {s.strategy_name}
                                        </span>
                                    ))}
                                    {sigs.length > 4 && <span className="text-[10px] font-bold text-slate-400">+{sigs.length - 4}</span>}
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                    <span className="text-sm font-bold font-mono text-slate-700 dark:text-slate-300">Rs. {ltp.toLocaleString()}</span>
                                    <span className="text-xs font-bold bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-500">{sigs.length} signal{sigs.length > 1 ? 's' : ''}</span>
                                    <ChevronRight size={14} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ─── WHALE WATCH VIEW ─────────────────────────────────────────────────────────

function WhaleWatchView() {
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
        <div className="space-y-4">
            <div className="flex flex-wrap gap-2 items-center">
                <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                    {WHALE_ENGINES.map((e, i) => (
                        <button key={e.key} onClick={() => setEngineIdx(i)}
                            className={cn('px-3 py-1.5 text-xs font-bold transition-colors',
                                engineIdx === i ? 'bg-cyan-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700')}>
                            {e.label}
                        </button>
                    ))}
                </div>
                <div className="relative">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter…"
                        className="pl-8 pr-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-cyan-400/40 w-36" />
                </div>
                <div className="ml-auto flex gap-3 text-xs font-bold">
                    <span className="text-emerald-600 dark:text-emerald-400">{buys.length} BUY</span>
                    <span className="text-rose-600 dark:text-rose-400">{sells.length} SELL</span>
                </div>
            </div>

            {loading ? <Loader size /> : filtered.length === 0 ? <Empty label="No signals from this engine" /> : (
                <div className="space-y-2">
                    {filtered.map(r => (
                        <div key={r.symbol} onClick={() => router.push(`/ticker/${r.symbol}`)}
                            className={cn('flex items-center gap-4 px-4 py-3 rounded-xl border cursor-pointer transition-all hover:shadow-md group',
                                r.signal === 'BUY'
                                    ? 'border-l-4 border-l-emerald-400 bg-emerald-50/20 dark:bg-emerald-900/10 border-emerald-100/60 dark:border-emerald-800/40'
                                    : 'border-l-4 border-l-rose-400 bg-rose-50/20 dark:bg-rose-900/10 border-rose-100/60 dark:border-rose-800/40')}>
                            <div className="flex items-center gap-3 w-32 shrink-0">
                                <span className="font-black text-slate-900 dark:text-slate-100">{r.symbol}</span>
                                <SignalBadge direction={r.signal} />
                            </div>
                            <div className="flex-1 min-w-0 hidden md:block">
                                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{r.reason}</p>
                            </div>
                            <div className="flex items-center gap-4 shrink-0 text-xs font-mono">
                                <div className="text-right">
                                    <div className="font-bold text-slate-800 dark:text-slate-200">Rs. {r.close.toLocaleString()}</div>
                                    <div className="text-[10px] text-slate-400">{r.date}</div>
                                </div>
                                <div className="w-20">
                                    <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                                        <span>Str</span><span>{r.strength.toFixed(0)}%</span>
                                    </div>
                                    <Progress value={r.strength} className="h-1.5" />
                                </div>
                                {r.rsi !== undefined && (
                                    <span className={cn('text-[11px] font-bold px-2 py-0.5 rounded',
                                        r.rsi > 70 ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                                            : r.rsi < 30 ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400')}>
                                        RSI {r.rsi.toFixed(0)}
                                    </span>
                                )}
                                <ChevronRight size={14} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
                            </div>
                        </div>
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
            <Loader2 className={cn('animate-spin text-indigo-500', size ? 'w-7 h-7' : 'w-5 h-5')} />
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
    { key: 'all', label: 'All Sources', icon: <Layers size={14} />, desc: 'Unified feed across all intelligence layers' },
    { key: 'smart', label: 'Smart Money', icon: <Crosshair size={14} />, desc: 'Institutional accumulation signals' },
    { key: 'strategies', label: 'Strategies', icon: <Zap size={14} />, desc: 'Backtested strategy signals' },
    { key: 'whale', label: 'Whale Watch', icon: <Radar size={14} />, desc: 'Deep technical + accumulation engines' },
];

export default function IntelHubClient() {
    const [tab, setTab] = useState('all');

    return (
        <DashboardLayout
            title={<span className="flex items-center gap-2 text-2xl font-black bg-gradient-to-r from-indigo-600 to-cyan-500 bg-clip-text text-transparent">Signal Intelligence</span>}
            subtitle={TABS.find(t => t.key === tab)?.desc}
        >
            <div className="space-y-5">
                {/* Tab bar */}
                <div className="flex gap-1 bg-slate-100 dark:bg-slate-800/60 rounded-xl p-1 w-fit">
                    {TABS.map(t => (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            className={cn(
                                'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-all',
                                tab === t.key
                                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
                                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
                            )}
                        >
                            {t.icon} {t.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div>
                    {tab === 'all'        && <AllSourcesView />}
                    {tab === 'smart'      && <SmartMoneyView />}
                    {tab === 'strategies' && <StrategiesView />}
                    {tab === 'whale'      && <WhaleWatchView />}
                </div>
            </div>
        </DashboardLayout>
    );
}
