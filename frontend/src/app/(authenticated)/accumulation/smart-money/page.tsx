'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import api from '@/lib/api';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { PageLoader } from '@/components/ui/StockLoader';
import { formatNepaliNumber, formatRupees } from '@/lib/formatters';
import ReactECharts from 'echarts-for-react';
import {
    Crown, Zap, BarChart3, Users, DollarSign, Package, Target,
    ArrowUpRight, ArrowDownRight, ChevronDown, ChevronUp, TrendingUp,
    Activity, Brain,
} from 'lucide-react';

// ─── Constants ───────────────────────────────────────────────────────────────

const RANGES = ['1D', '2D', '3D', '1W', '1M', '3M', '6M'] as const;
type Range = typeof RANGES[number];

const TIER_STYLES = {
    S: {
        bg: 'bg-yellow-50 dark:bg-yellow-900/20',
        border: 'border-yellow-200 dark:border-yellow-800/40',
        text: 'text-yellow-700 dark:text-yellow-400',
        badge: 'bg-yellow-400 text-yellow-900',
        barColor: '#f59e0b',
        label: 'Elite',
    },
    A: {
        bg: 'bg-indigo-50 dark:bg-indigo-900/20',
        border: 'border-indigo-200 dark:border-indigo-800/40',
        text: 'text-indigo-700 dark:text-indigo-400',
        badge: 'bg-indigo-500 text-white',
        barColor: '#6366f1',
        label: 'Pro',
    },
    B: {
        bg: 'bg-emerald-50 dark:bg-emerald-900/20',
        border: 'border-emerald-200 dark:border-emerald-800/40',
        text: 'text-emerald-700 dark:text-emerald-400',
        badge: 'bg-emerald-500 text-white',
        barColor: '#10b981',
        label: 'Active',
    },
    C: {
        bg: 'bg-slate-50 dark:bg-slate-800/50',
        border: 'border-slate-200 dark:border-slate-700',
        text: 'text-slate-600 dark:text-slate-400',
        badge: 'bg-slate-400 text-white',
        barColor: '#64748b',
        label: 'Tracked',
    },
} as const;

// ─── Types ───────────────────────────────────────────────────────────────────

interface KPI {
    total_whale_volume: number;
    total_whale_amount: number;
    active_symbols: number;
    active_brokers: number;
}

interface SymbolFlow {
    symbol: string;
    smart_buy_qty: number;
    smart_sell_qty: number;
    net_qty: number;
    buy_amount: number;
    sell_amount: number;
    net_amount: number;
    broker_count: number;
}

interface SmartBroker {
    broker_id: number;
    score: number;
    rank: 'S' | 'A' | 'B' | 'C';
}

interface WhaleSignal {
    broker_id: number;
    symbol: string;
    avg_buy_price: number;
    ltp: number;
    qty: number;
    amount: number;
    date: string;
}

interface SmartMoneyFullData {
    leaderboard: SmartBroker[];
    signals: WhaleSignal[];
    kpi: KPI;
    symbol_flows: SymbolFlow[];
}

type SignalSortKey = 'qty' | 'amount' | 'pnl';
type SortDir = 'asc' | 'desc';

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SmartMoneyPage() {
    const [range, setRange] = useState<Range>('1D');
    const [data, setData] = useState<SmartMoneyFullData | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'signals' | 'flow'>('signals');
    const [sort, setSort] = useState<{ key: SignalSortKey; dir: SortDir }>({ key: 'amount', dir: 'desc' });
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        abortRef.current?.abort();
        abortRef.current = new AbortController();
        const { signal } = abortRef.current;

        setLoading(true);
        api.get(`/api/stocks/floorsheet/smart_money/?range=${range}`, { signal })
            .then(res => setData(res.data))
            .catch(err => { if (err.name !== 'AbortError') console.error('Smart money fetch failed', err); })
            .finally(() => setLoading(false));

        // Fetch user for access control and set default tab
        api.get('/api/users/me/')
            .then(res => {
                setCurrentUser(res.data);
                const perms = res.data.permissions;
                if (perms !== 'all' && !perms?.['smart_money'] && activeTab === 'signals') {
                    setActiveTab('flow');
                }
            })
            .catch(err => console.error("Failed to load user profile", err));

        return () => abortRef.current?.abort();
    }, [range]);

    // ─── Derived data ─────────────────────────────────────────────────────────
    const selectedBroker = useMemo(() =>
        data?.leaderboard?.find(b => b.broker_id === selectedId),
    [data?.leaderboard, selectedId]);

    const filteredSignals = useMemo(() => {
        if (!data?.signals) return [];
        const base = selectedId
            ? data.signals.filter(s => s.broker_id === selectedId)
            : data.signals;

        const enriched = base.map(s => ({
            ...s,
            pnl: s.avg_buy_price > 0 ? (s.ltp - s.avg_buy_price) / s.avg_buy_price * 100 : 0,
        }));
        return [...enriched].sort((a, b) => {
            const v = sort.key === 'pnl' ? a.pnl - b.pnl
                : sort.key === 'qty' ? a.qty - b.qty
                : a.amount - b.amount;
            return sort.dir === 'desc' ? -v : v;
        });
    }, [data?.signals, sort, selectedId]);

    const filteredFlows = useMemo(() => {
        if (!data?.symbol_flows || !data?.signals) return [];
        if (!selectedId) return data.symbol_flows;

        // Calculate symbol flows for the SPECIFIC broker from their signals
        const brokerSignals = data.signals.filter(s => s.broker_id === selectedId);
        const map = new Map<string, SymbolFlow>();

        brokerSignals.forEach(s => {
            const existing = map.get(s.symbol) || {
                symbol: s.symbol,
                smart_buy_qty: 0, smart_sell_qty: 0, net_qty: 0,
                buy_amount: 0, sell_amount: 0, net_amount: 0,
                broker_count: 1,
            };
            existing.smart_buy_qty += s.qty;
            existing.net_qty += s.qty;
            existing.buy_amount += s.amount;
            existing.net_amount += s.amount;
            map.set(s.symbol, existing);
        });

        return Array.from(map.values()).sort((a, b) => b.net_amount - a.net_amount);
    }, [data?.symbol_flows, data?.signals, selectedId]);

    const profitSignals = useMemo(() => filteredSignals.filter(s => s.pnl >= 0).length, [filteredSignals]);
    const avgPnl = useMemo(() => filteredSignals.length ? filteredSignals.reduce((acc, s) => acc + s.pnl, 0) / filteredSignals.length : 0, [filteredSignals]);

    // ─── Chart options ────────────────────────────────────────────────────────

    const brokerScoreChart = useMemo(() => {
        if (!data?.leaderboard?.length) return {};
        const lb = [...data.leaderboard].reverse();
        const maxScore = Math.max(...lb.map(b => b.score));
        return {
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
                formatter: (params: any[]) => {
                    const p = params[0];
                    const broker = data.leaderboard.find(b => `#${b.broker_id}` === p.name);
                    return `
                        <div style="font-size:12px;font-weight:600;margin-bottom:4px">Broker #${p.name?.replace('#','')}</div>
                        <div style="display:flex;justify-content:space-between;gap:16px;font-size:11px">
                            <span style="color:#94a3b8">Score</span>
                            <b style="color:#e2e8f0">${p.value.toLocaleString()} pts</b>
                        </div>
                        ${broker ? `<div style="display:flex;justify-content:space-between;gap:16px;font-size:11px;margin-top:3px"><span style="color:#94a3b8">Tier</span><b style="color:${TIER_STYLES[broker.rank]?.barColor ?? '#94a3b8'}">${broker.rank} · ${TIER_STYLES[broker.rank]?.label}</b></div>` : ''}
                    `;
                },
                backgroundColor: '#0f172a',
                borderColor: '#1e293b',
                textStyle: { color: '#e2e8f0', fontSize: 12 },
                extraCssText: 'border-radius:10px;padding:12px 16px;box-shadow:0 8px 32px rgba(0,0,0,0.4)',
            },
            grid: { left: 8, right: 64, top: 6, bottom: 6, containLabel: true },
            xAxis: {
                type: 'value',
                max: maxScore * 1.15,
                axisLabel: { formatter: (v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`, color: '#475569', fontSize: 9 },
                axisLine: { show: false },
                splitLine: { lineStyle: { color: '#1e293b', type: 'dashed', opacity: 0.5 } },
            },
            yAxis: {
                type: 'category',
                data: lb.map(b => `#${b.broker_id}`),
                axisLabel: { color: '#94a3b8', fontSize: 11, fontWeight: '600' },
                axisLine: { show: false },
                axisTick: { show: false },
            },
            series: [{
                type: 'bar',
                data: lb.map(b => ({
                    value: b.score,
                    itemStyle: {
                        color: {
                            type: 'linear', x: 0, y: 0, x2: 1, y2: 0,
                            colorStops: [
                                { offset: 0, color: `${TIER_STYLES[b.rank]?.barColor ?? '#64748b'}33` },
                                { offset: 1, color: TIER_STYLES[b.rank]?.barColor ?? '#64748b' },
                            ],
                        },
                        borderRadius: [0, 4, 4, 0],
                        opacity: selectedId && selectedId !== b.broker_id ? 0.3 : 1,
                    },
                })),
                barMaxWidth: 18,
                label: {
                    show: true, position: 'right',
                    formatter: (p: any) => `${p.value.toLocaleString()}`,
                    color: '#64748b', fontSize: 10, fontWeight: '600',
                },
            }],
        };
    }, [data?.leaderboard, selectedId]);

    const symbolFlowChart = useMemo(() => {
        if (!filteredFlows?.length) return {};
        const flows = [...filteredFlows].slice(0, 15).reverse();
        const maxQty = Math.max(...flows.map(f => f.net_qty));

        // Use selected broker's tier color if available, otherwise neutral institutional amber
        const tierColor = selectedBroker
            ? TIER_STYLES[selectedBroker.rank].barColor
            : '#f59e0b'; // Amber 500

        return {
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
                formatter: (params: any[]) => {
                    const flow = filteredFlows.find(f => f.symbol === params[0]?.name);
                    if (!flow) return '';
                    const isPos = flow.net_qty >= 0;
                    const primaryColor = selectedBroker ? tierColor : (isPos ? '#10b981' : '#f43f5e');
                    return `
                        <div style="font-size:13px;font-weight:600;margin-bottom:6px">${flow.symbol}</div>
                        <div style="display:flex;justify-content:space-between;gap:20px;font-size:11px"><span style="color:#10b981">Smart Buy</span><b style="color:#e2e8f0">+${formatNepaliNumber(flow.smart_buy_qty)}</b></div>
                        ${flow.smart_sell_qty > 0 ? `<div style="display:flex;justify-content:space-between;gap:20px;font-size:11px;margin-top:3px"><span style="color:#f87171">Smart Sell</span><b style="color:#e2e8f0">−${formatNepaliNumber(flow.smart_sell_qty)}</b></div>` : ''}
                        <div style="display:flex;justify-content:space-between;gap:20px;font-size:11px;margin-top:6px;padding-top:6px;border-top:1px solid #1e293b"><span style="color:${primaryColor};font-weight:600">Net Accum.</span><b style="color:${primaryColor}">${isPos ? '+' : ''}${formatNepaliNumber(flow.net_qty)}</b></div>
                        <div style="display:flex;justify-content:space-between;gap:20px;font-size:11px;margin-top:3px"><span style="color:#94a3b8">Net Capital</span><b style="color:#e2e8f0">${formatRupees(flow.net_amount, 0)}</b></div>
                        ${!selectedBroker ? `<div style="display:flex;justify-content:space-between;gap:20px;font-size:11px;margin-top:3px"><span style="color:#94a3b8">Active Brokers</span><b style="color:#e2e8f0">${flow.broker_count}</b></div>` : ''}
                    `;
                },
                backgroundColor: '#0f172a',
                borderColor: '#1e293b',
                textStyle: { color: '#e2e8f0', fontSize: 12 },
                extraCssText: 'border-radius:10px;padding:12px 16px;box-shadow:0 8px 32px rgba(0,0,0,0.4)',
            },
            grid: { left: 8, right: 72, top: 6, bottom: 6, containLabel: true },
            xAxis: {
                type: 'value',
                max: maxQty * 1.2,
                axisLabel: { formatter: (v: number) => formatNepaliNumber(v), color: '#475569', fontSize: 9 },
                axisLine: { show: false },
                splitLine: { lineStyle: { color: '#1e293b', type: 'dashed', opacity: 0.5 } },
            },
            yAxis: {
                type: 'category',
                data: flows.map(f => f.symbol),
                axisLabel: { color: '#94a3b8', fontSize: 11, fontWeight: '600' },
                axisLine: { show: false },
                axisTick: { show: false },
            },
            series: [{
                name: 'Net Accumulation',
                type: 'bar',
                data: flows.map(f => {
                    const isPos = f.net_qty >= 0;
                    const primaryColor = selectedBroker ? tierColor : (isPos ? '#10b981' : '#f43f5e');
                    const fadedColor = selectedBroker ? `${tierColor}26` : (isPos ? 'rgba(16,185,129,0.15)' : 'rgba(244,63,94,0.15)');
                    return {
                        value: f.net_qty,
                        itemStyle: {
                            color: {
                                type: 'linear', x: 0, y: 0, x2: 1, y2: 0,
                                colorStops: [
                                    { offset: 0, color: fadedColor },
                                    { offset: 1, color: primaryColor },
                                ],
                            },
                            borderRadius: [0, 5, 5, 0],
                        },
                        label: {
                            color: primaryColor,
                        },
                    };
                }),
                barMaxWidth: 20,
                label: {
                    show: true,
                    position: 'right',
                    formatter: (p: any) => `${p.value >= 0 ? '+' : ''}${formatNepaliNumber(p.value)}`,
                    fontSize: 10,
                    fontWeight: '600',
                },
                emphasis: {
                    itemStyle: {
                        color: (p: any) => selectedBroker ? tierColor : (p.data.value >= 0 ? '#10b981' : '#f43f5e')
                    }
                },
            }],
        };
    }, [filteredFlows, selectedBroker]);

    // ─── Sort toggle helper ───────────────────────────────────────────────────

    const toggleSort = (key: SignalSortKey) =>
        setSort(s => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));

    const SortIcon = ({ k }: { k: SignalSortKey }) =>
        sort.key === k ? (sort.dir === 'desc' ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />) : null;

    // ─── KPI card data ────────────────────────────────────────────────────────

    const kpiCards = [
        {
            label: 'Active Smart Brokers',
            value: data?.kpi?.active_brokers ?? 0,
            icon: <Users className="w-4 h-4" />,
            color: 'amber',
            fmt: (v: number) => v.toString(),
            sub: 'Ranked S – C tier',
        },
        {
            label: 'Stocks Under Accumulation',
            value: data?.kpi?.active_symbols ?? 0,
            icon: <Target className="w-4 h-4" />,
            color: 'indigo',
            fmt: (v: number) => v.toString(),
            sub: 'Whale signal threshold',
        },
        {
            label: 'Total Whale Volume',
            value: data?.kpi?.total_whale_volume ?? 0,
            icon: <Package className="w-4 h-4" />,
            color: 'emerald',
            fmt: formatNepaliNumber,
            sub: 'Shares accumulated',
        },
        {
            label: 'Capital Deployed',
            value: data?.kpi?.total_whale_amount ?? 0,
            icon: <DollarSign className="w-4 h-4" />,
            color: 'violet',
            fmt: (v: number) => formatRupees(v, 0),
            sub: 'Total whale investment',
        },
    ] as const;

    const colorMap = {
        amber: { icon: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400', val: 'text-slate-800 dark:text-slate-100' },
        indigo: { icon: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400', val: 'text-slate-800 dark:text-slate-100' },
        emerald: { icon: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400', val: 'text-slate-800 dark:text-slate-100' },
        violet: { icon: 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400', val: 'text-slate-800 dark:text-slate-100' },
    } as const;

    // ─── Render ───────────────────────────────────────────────────────────────

    return (
        <div className="space-y-6 px-1">

            {/* ═══ Global Controls Bar ════════════════════════════════════════ */}
            <div className="bg-white dark:bg-card rounded-2xl border border-slate-200 dark:border-border shadow-lg px-4 py-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-wrap">
                <div className="bg-slate-50 dark:bg-card p-1 rounded-xl border border-border dark:border-border flex overflow-x-auto no-scrollbar shrink-0">
                    {RANGES.map(r => (
                        <button key={r} onClick={() => setRange(r)}
                            className={cn(
                                'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 tracking-tight whitespace-nowrap',
                                range === r
                                    ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow'
                                    : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
                            )}>
                            {r}
                        </button>
                    ))}
                </div>

                <div className="h-4 w-px bg-slate-200 dark:bg-white/10 hidden sm:block" />

                <div className="flex items-center gap-2 min-w-0">
                    <Brain className="w-4 h-4 text-amber-500 shrink-0" />
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">
                        Top institutional brokers, whale-sized accumulations, and the stocks attracting the most smart money · {range} window
                    </span>
                </div>
            </div>

            {loading ? <PageLoader text="Loading smart money intelligence..." /> : (
                <>
                    {/* ── KPI Cards ───────────────────────────────────────────── */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {kpiCards.map(card => {
                            const c = colorMap[card.color];
                            const isSelectable = card.label === 'Active Smart Brokers';
                            return (
                                <div key={card.label}
                                    onClick={() => isSelectable && selectedId && setSelectedId(null)}
                                    className={cn(
                                        'bg-white dark:bg-card rounded-2xl border border-slate-200 dark:border-border p-5 shadow-sm',
                                        isSelectable && selectedId && 'cursor-pointer hover:border-amber-500/50 transition-colors group'
                                    )}>
                                    <div className="flex items-center justify-between mb-3">
                                        <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center', c.icon)}>
                                            {card.icon}
                                        </div>
                                        {isSelectable && selectedId && (
                                            <span className="text-[9px] font-bold text-amber-500 opacity-60 group-hover:opacity-100">Click to reset</span>
                                        )}
                                    </div>
                                    <div className={cn('text-xl font-bold tabular-nums', c.val)}>
                                        {card.fmt(selectedId && isSelectable ? 1 : card.value)}
                                    </div>
                                    <div className="text-[11px] font-medium text-slate-600 dark:text-slate-300 mt-0.5">{card.label}</div>
                                    <div className="text-[10px] font-normal text-slate-400 mt-0.5">
                                        {selectedId && isSelectable ? `Filtering Broker #${selectedId}` : card.sub}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* ── Signal Health Bar ────────────────────────────────────── */}
                    {filteredSignals.length > 0 && (
                        <div className="bg-white dark:bg-card rounded-2xl border border-slate-200 dark:border-border px-6 py-4 shadow-sm flex flex-wrap items-center gap-6">
                            <div className="flex items-center gap-2">
                                <Activity className="w-4 h-4 text-slate-400" />
                                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                    {selectedId ? `Broker #${selectedId}` : 'Institutional'} Signal Health
                                </span>
                            </div>
                            <div className="flex-1 min-w-[200px]">
                                <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                    <div
                                        className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                                        style={{ width: `${(profitSignals / filteredSignals.length) * 100}%` }}
                                    />
                                </div>
                            </div>
                            <div className="flex items-center gap-4 text-xs font-medium tabular-nums">
                                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                    <ArrowUpRight className="w-3.5 h-3.5" />{profitSignals} profitable
                                </span>
                                <span className="text-rose-600 dark:text-rose-400 flex items-center gap-1">
                                    <ArrowDownRight className="w-3.5 h-3.5" />{filteredSignals.length - profitSignals} in loss
                                </span>
                                <span className={cn('flex items-center gap-1', avgPnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
                                    <TrendingUp className="w-3.5 h-3.5" />Avg {avgPnl >= 0 ? '+' : ''}{avgPnl.toFixed(2)}%
                                </span>
                            </div>
                        </div>
                    )}

                    {/* ── Main Grid ────────────────────────────────────────────── */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                        {/* Left column: Leaderboard ───────────────────────────── */}
                        <div className="bg-white dark:bg-card rounded-2xl border border-slate-200 dark:border-border shadow-sm overflow-hidden">
                            <div className="px-5 py-4 border-b border-border dark:border-border bg-slate-50/50 dark:bg-muted">
                                <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                                    <Crown className="w-4 h-4 fill-current" />
                                    Smart Broker Leaderboard
                                    <span className="ml-auto text-[10px] font-bold text-slate-400">{data?.leaderboard?.length ?? 0} brokers</span>
                                </h2>
                            </div>

                            {/* Score bar chart */}
                            {data?.leaderboard?.length ? (
                                <div className="px-3 pt-4 pb-2">
                                    <ReactECharts
                                        onEvents={{
                                            'click': (params: any) => {
                                                const id = parseInt(params.name.replace('#', ''));
                                                setSelectedId(prev => prev === id ? null : id);
                                            }
                                        }}
                                        option={brokerScoreChart}
                                        style={{ height: `${Math.max(140, data.leaderboard.length * 26)}px` }}
                                        opts={{ renderer: 'svg' }}
                                    />
                                </div>
                            ) : null}

                            {/* Tier separator labels */}
                            <div className="px-2 pt-1 pb-2 flex gap-2 flex-wrap">
                                {(['S', 'A', 'B', 'C'] as const).map(tier => {
                                    const count = data?.leaderboard?.filter(b => b.rank === tier).length ?? 0;
                                    if (!count) return null;
                                    const s = TIER_STYLES[tier];
                                    return (
                                        <span key={tier} className={cn('px-2 py-0.5 rounded-full text-[9px] font-semibold border', s.bg, s.border, s.text)}>
                                            {tier} Tier · {count}
                                        </span>
                                    );
                                })}
                            </div>

                            {/* Broker cards */}
                            <div className="px-4 pb-4 space-y-1.5 max-h-[480px] overflow-y-auto">
                                {!data?.leaderboard?.length ? (
                                    <div className="p-8 text-center text-slate-400 text-sm">No data for this period</div>
                                ) : data.leaderboard.map((broker, idx) => {
                                    const style = TIER_STYLES[broker.rank] ?? TIER_STYLES.C;
                                    const maxScore = data.leaderboard[0]?.score ?? 1;
                                    const barPct = Math.round((broker.score / maxScore) * 100);
                                    const isSelected = selectedId === broker.broker_id;
                                    return (
                                        <div key={broker.broker_id}
                                            onClick={() => setSelectedId(isSelected ? null : broker.broker_id)}
                                            className={cn(
                                                'p-3 rounded-xl border transition-all cursor-pointer group relative overflow-hidden',
                                                isSelected ? `${style.bg} ${style.border} ring-1 ring-inset ring-current/20` : 'border-border dark:border-border hover:bg-slate-50 dark:hover:bg-white/[0.02]',
                                            )}>
                                            <div className="flex items-center gap-2.5 mb-2 relative z-10">
                                                <div className={cn('w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0', style.badge)}>
                                                    {idx + 1}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                                                        Broker #{broker.broker_id}
                                                        {isSelected && <Zap className="w-2.5 h-2.5 fill-current" />}
                                                    </div>
                                                    <div className="text-[10px] text-slate-400">{broker.rank} · {style.label}</div>
                                                </div>
                                                <div className="text-sm font-semibold shrink-0 tabular-nums text-slate-800 dark:text-slate-100">
                                                    {broker.score.toLocaleString()}<span className="text-[9px] font-normal ml-0.5 opacity-60">pts</span>
                                                </div>
                                            </div>
                                            <div className="h-1 rounded-full bg-black/5 dark:bg-muted overflow-hidden relative z-10">
                                                <div
                                                    className="h-full rounded-full transition-all duration-700"
                                                    style={{ width: `${barPct}%`, backgroundColor: style.barColor, opacity: isSelected ? 1 : 0.4 }}
                                                />
                                            </div>
                                            <Link href={`/broker/${broker.broker_id}`}
                                                onClick={(e) => e.stopPropagation()}
                                                className="absolute top-2 right-2 p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-slate-200 dark:hover:bg-white/10 transition-all z-20">
                                                <ArrowUpRight className="w-3 h-3 text-slate-400" />
                                            </Link>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Right column: Signals + Symbol Flow ───────────────── */}
                        <div className="lg:col-span-2 bg-white dark:bg-card rounded-2xl border border-slate-200 dark:border-border shadow-sm overflow-hidden flex flex-col">
                            {/* Section Header */}
                            {selectedId && (
                                <div className="px-5 py-3 border-b border-border dark:border-border bg-slate-50/30 dark:bg-white/[0.01] flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className={cn('w-2 h-2 rounded-full animate-pulse', TIER_STYLES[selectedBroker?.rank || 'C'].bg)} style={{ backgroundColor: TIER_STYLES[selectedBroker?.rank || 'C'].barColor }} />
                                        <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 uppercase tracking-tight">
                                            Institutional Insights: Broker #{selectedId}
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => setSelectedId(null)}
                                        className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1"
                                    >
                                        Clear Filter
                                    </button>
                                </div>
                            )}

                            {/* Tab bar */}
                            <div className="border-b border-border dark:border-border bg-slate-50/50 dark:bg-muted px-5 flex items-center gap-1">
                                {([
                                    { key: 'signals' as const, label: 'Whale Signals', icon: <Zap className="w-3.5 h-3.5" />, restricted: true },
                                    { key: 'flow' as const, label: 'Symbol Intelligence', icon: <BarChart3 className="w-3.5 h-3.5" />, restricted: false },
                                ]).map(tab => {
                                    if (tab.restricted) {
                                        const perms = currentUser?.permissions;
                                        if (perms !== 'all' && !perms?.['smart_money']) return null;
                                    }
                                    const isActive = activeTab === tab.key;
                                    const themeColor = selectedBroker ? TIER_STYLES[selectedBroker.rank].barColor : '#f59e0b';
                                    return (
                                        <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                                            className={cn(
                                                'flex items-center gap-1.5 px-4 py-4 text-xs font-semibold tracking-tight border-b-2 transition-all whitespace-nowrap',
                                                isActive
                                                    ? 'text-slate-900 dark:text-white'
                                                    : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300',
                                            )}
                                            style={isActive ? { borderBottomColor: themeColor, color: themeColor } : {}}>
                                            {tab.icon}{tab.label}
                                        </button>
                                    );
                                })}
                                <div className="ml-auto flex items-center gap-2 pr-1">
                                    {activeTab === 'signals' && filteredSignals?.length ? (
                                        <>
                                            <span className="text-[10px] px-2 py-0.5 bg-emerald-500/10 text-emerald-500 rounded-full border border-emerald-500/20 font-medium">
                                                {profitSignals} profitable
                                            </span>
                                            <span className="text-[10px] px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full border border-slate-200 dark:border-slate-700 font-medium">
                                                {filteredSignals.length} {selectedId ? 'trades' : 'signals'}
                                            </span>
                                        </>
                                    ) : activeTab === 'flow' && filteredFlows?.length ? (
                                        <span className="text-[10px] px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full border border-slate-200 dark:border-slate-700 font-medium">
                                            {filteredFlows.length} stocks
                                        </span>
                                    ) : null}
                                </div>
                            </div>

                            <div className="p-5">
                                {/* ── Whale Signals tab ─────────────────────── */}
                                {activeTab === 'signals' && (
                                    <div className="overflow-x-auto rounded-xl border border-border dark:border-slate-800">
                                        <table className="w-full text-xs">
                                            <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-border dark:border-slate-800">
                                                <tr>
                                                    <th className="px-4 py-3 text-left font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[10px]">Broker</th>
                                                    <th className="px-4 py-3 text-left font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[10px]">Symbol</th>
                                                    {([
                                                        { label: 'Qty', key: 'qty' as SignalSortKey },
                                                        { label: 'Avg Buy', key: null },
                                                        { label: 'LTP', key: null },
                                                        { label: 'P&L %', key: 'pnl' as SignalSortKey },
                                                        { label: 'Amount', key: 'amount' as SignalSortKey },
                                                    ] as { label: string; key: SignalSortKey | null }[]).map(h => (
                                                        <th key={h.label}
                                                            onClick={() => h.key && toggleSort(h.key)}
                                                            className={cn(
                                                                'px-4 py-3 text-left font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[10px]',
                                                                h.key && 'cursor-pointer hover:text-amber-600 dark:hover:text-amber-400 select-none',
                                                            )}>
                                                            <span className="flex items-center gap-1">
                                                                {h.label}
                                                                {h.key && <SortIcon k={h.key} />}
                                                            </span>
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
                                                {!filteredSignals.length ? (
                                                    <tr>
                                                        <td colSpan={7} className="p-10 text-center text-slate-400 text-sm italic">
                                                            {selectedId ? `No active whale signals tracked for Broker #${selectedId}` : 'No whale signals detected in this period'}
                                                        </td>
                                                    </tr>
                                                ) : filteredSignals.map((signal, idx) => {
                                                    const isProfit = signal.pnl >= 0;
                                                    const pnlAbs = Math.abs(signal.pnl);
                                                    return (
                                                        <tr key={idx} className={cn(
                                                            'transition-colors',
                                                            isProfit
                                                                ? 'hover:bg-emerald-50/40 dark:hover:bg-emerald-900/5'
                                                                : 'hover:bg-rose-50/40 dark:hover:bg-rose-900/5',
                                                        )}>
                                                            <td className="px-4 py-3">
                                                                <Link href={`/broker/${signal.broker_id}`}>
                                                                    <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg font-medium border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-[10px]">
                                                                        #{signal.broker_id}
                                                                    </span>
                                                                </Link>
                                                            </td>
                                                            <td className="px-4 py-3">
                                                                <Link href={`/ticker/${signal.symbol}`}>
                                                                    <span className="font-medium text-slate-700 dark:text-slate-200 hover:underline">{signal.symbol}</span>
                                                                </Link>
                                                            </td>
                                                            <td className="px-4 py-3 font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                                                                {formatNepaliNumber(signal.qty)}
                                                            </td>
                                                            <td className="px-4 py-3 font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                                                                {formatRupees(signal.avg_buy_price, 0)}
                                                            </td>
                                                            <td className="px-4 py-3 font-mono text-slate-700 dark:text-slate-200 tabular-nums">
                                                                {formatRupees(signal.ltp, 0)}
                                                            </td>
                                                            <td className="px-4 py-3">
                                                                <span className={cn(
                                                                    'inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[11px] font-medium tabular-nums border',
                                                                    isProfit
                                                                        ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/30'
                                                                        : 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800/30',
                                                                )}>
                                                                    {isProfit ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                                                                    {pnlAbs.toFixed(2)}%
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-3 text-slate-700 dark:text-slate-300 tabular-nums">
                                                                {formatRupees(signal.amount, 0)}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {/* ── Symbol Intelligence tab ───────────────── */}
                                {activeTab === 'flow' && (
                                    <div className="space-y-5">
                                        {!data?.symbol_flows?.length ? (
                                            <div className="p-10 text-center text-slate-400 text-sm">No symbol flow data for this period</div>
                                        ) : (
                                            <>
                                                <ReactECharts
                                                    option={symbolFlowChart}
                                                    style={{ height: `${Math.max(180, Math.min(filteredFlows.length, 15) * 28)}px` }}
                                                    opts={{ renderer: 'svg' }}
                                                />
                                                <div className="overflow-x-auto rounded-xl border border-border dark:border-slate-800">
                                                    <table className="w-full text-xs">
                                                        <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-border dark:border-slate-800">
                                                            <tr>
                                                                {['#', 'Symbol', 'Buy', 'Sell', 'Net Accumulation', 'Net Capital', 'Brokers'].map(h => (
                                                                    <th key={h} className="px-4 py-3 text-left font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[10px]">{h}</th>
                                                                ))}
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
                                                            {filteredFlows.map((sf, idx) => (
                                                                <tr key={sf.symbol} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                                                                    <td className="px-4 py-3 text-slate-400 font-bold tabular-nums">{idx + 1}</td>
                                                                    <td className="px-4 py-3">
                                                                        <Link href={`/ticker/${sf.symbol}`}>
                                                                            <span className="font-semibold text-slate-700 dark:text-slate-200 hover:underline">{sf.symbol}</span>
                                                                        </Link>
                                                                    </td>
                                                                    <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-300 tabular-nums">
                                                                        +{formatNepaliNumber(sf.smart_buy_qty)}
                                                                    </td>
                                                                    <td className="px-4 py-3 font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                                                                        -{formatNepaliNumber(sf.smart_sell_qty)}
                                                                    </td>
                                                                    <td className="px-4 py-3 font-medium tabular-nums">
                                                                        <span className={sf.net_qty >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                                                                            {sf.net_qty >= 0 ? '+' : ''}{formatNepaliNumber(sf.net_qty)}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300 tabular-nums">
                                                                        {formatRupees(sf.net_amount, 0)}
                                                                    </td>
                                                                    <td className="px-4 py-3">
                                                                        <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full text-[10px] font-semibold border border-slate-200 dark:border-slate-700">
                                                                            {sf.broker_count} {sf.broker_count === 1 ? 'broker' : 'brokers'}
                                                                        </span>
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ── Tier Legend ──────────────────────────────────────────── */}
                    <div className="bg-white dark:bg-card rounded-2xl border border-slate-200 dark:border-border px-6 py-5 shadow-sm">
                        <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400 mb-4">Tier Classification</div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {([
                                { tier: 'S', title: 'Elite Accumulator', desc: 'Highest buy volume in the period. Dominant institutional player.' },
                                { tier: 'A', title: 'Pro Accumulator', desc: 'Top 3 by buy volume. Consistent large-ticket buyer.' },
                                { tier: 'B', title: 'Active Broker', desc: 'Ranks 4–6. Significant institutional activity.' },
                                { tier: 'C', title: 'Tracked Broker', desc: 'Ranks 7–10. Worth watching for emerging patterns.' },
                            ] as { tier: 'S' | 'A' | 'B' | 'C'; title: string; desc: string }[]).map(({ tier, title, desc }) => {
                                const s = TIER_STYLES[tier];
                                return (
                                    <div key={tier} className={cn('p-4 rounded-xl border', s.bg, s.border)}>
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className={cn('w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold', s.badge)}>{tier}</span>
                                            <span className={cn('text-xs font-medium', s.text)}>{title}</span>
                                        </div>
                                        <p className="text-[10px] text-slate-400 leading-relaxed">{desc}</p>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
