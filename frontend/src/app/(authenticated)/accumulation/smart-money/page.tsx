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
    const [range, setRange] = useState<Range>('1W');
    const [data, setData] = useState<SmartMoneyFullData | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'signals' | 'flow'>('signals');
    const [sort, setSort] = useState<{ key: SignalSortKey; dir: SortDir }>({ key: 'amount', dir: 'desc' });
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

        return () => abortRef.current?.abort();
    }, [range]);

    // ─── Derived data ─────────────────────────────────────────────────────────

    const sortedSignals = useMemo(() => {
        if (!data?.signals) return [];
        const enriched = data.signals.map(s => ({
            ...s,
            pnl: s.avg_buy_price > 0 ? (s.ltp - s.avg_buy_price) / s.avg_buy_price * 100 : 0,
        }));
        return [...enriched].sort((a, b) => {
            const v = sort.key === 'pnl' ? a.pnl - b.pnl
                : sort.key === 'qty'    ? a.qty - b.qty
                :                         a.amount - b.amount;
            return sort.dir === 'desc' ? -v : v;
        });
    }, [data?.signals, sort]);

    const profitSignals   = useMemo(() => sortedSignals.filter(s => s.pnl >= 0).length, [sortedSignals]);
    const avgPnl          = useMemo(() => sortedSignals.length ? sortedSignals.reduce((acc, s) => acc + s.pnl, 0) / sortedSignals.length : 0, [sortedSignals]);

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
                    },
                })),
                barMaxWidth: 18,
                label: {
                    show: true,
                    position: 'right',
                    formatter: (p: any) => `${p.value.toLocaleString()}`,
                    color: '#64748b',
                    fontSize: 10,
                    fontWeight: '600',
                },
            }],
        };
    }, [data?.leaderboard]);

    const symbolFlowChart = useMemo(() => {
        if (!data?.symbol_flows?.length) return {};
        const flows = [...data.symbol_flows].slice(0, 15).reverse();
        const maxQty = Math.max(...flows.map(f => f.net_qty));
        return {
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
                formatter: (params: any[]) => {
                    const flow = data.symbol_flows.find(f => f.symbol === params[0]?.name);
                    if (!flow) return '';
                    return `
                        <div style="font-size:13px;font-weight:600;margin-bottom:6px">${flow.symbol}</div>
                        <div style="display:flex;justify-content:space-between;gap:20px;font-size:11px"><span style="color:#10b981">Smart Buy</span><b style="color:#e2e8f0">+${formatNepaliNumber(flow.smart_buy_qty)}</b></div>
                        <div style="display:flex;justify-content:space-between;gap:20px;font-size:11px;margin-top:3px"><span style="color:#f87171">Smart Sell</span><b style="color:#e2e8f0">−${formatNepaliNumber(flow.smart_sell_qty)}</b></div>
                        <div style="display:flex;justify-content:space-between;gap:20px;font-size:11px;margin-top:6px;padding-top:6px;border-top:1px solid #1e293b"><span style="color:#f59e0b;font-weight:600">Net Accum.</span><b style="color:#f59e0b">+${formatNepaliNumber(flow.net_qty)}</b></div>
                        <div style="display:flex;justify-content:space-between;gap:20px;font-size:11px;margin-top:3px"><span style="color:#94a3b8">Net Capital</span><b style="color:#e2e8f0">${formatRupees(flow.net_amount, 0)}</b></div>
                        <div style="display:flex;justify-content:space-between;gap:20px;font-size:11px;margin-top:3px"><span style="color:#94a3b8">Active Brokers</span><b style="color:#e2e8f0">${flow.broker_count}</b></div>
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
                data: flows.map(f => ({
                    value: f.net_qty,
                    itemStyle: {
                        color: {
                            type: 'linear', x: 0, y: 0, x2: 1, y2: 0,
                            colorStops: [
                                { offset: 0, color: 'rgba(245,158,11,0.15)' },
                                { offset: 1, color: '#f59e0b' },
                            ],
                        },
                        borderRadius: [0, 5, 5, 0],
                    },
                })),
                barMaxWidth: 20,
                label: {
                    show: true,
                    position: 'right',
                    formatter: (p: any) => `+${formatNepaliNumber(p.value)}`,
                    color: '#94a3b8',
                    fontSize: 10,
                    fontWeight: '600',
                },
                emphasis: { itemStyle: { color: '#f59e0b' } },
            }],
        };
    }, [data?.symbol_flows]);

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
        amber:  { icon: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',  val: 'text-slate-800 dark:text-slate-100' },
        indigo: { icon: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400', val: 'text-slate-800 dark:text-slate-100' },
        emerald: { icon: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400', val: 'text-slate-800 dark:text-slate-100' },
        violet: { icon: 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400', val: 'text-slate-800 dark:text-slate-100' },
    } as const;

    // ─── Render ───────────────────────────────────────────────────────────────

    return (
        <div className="space-y-6 max-w-[1400px] mx-auto px-1">

            {/* ── Header ─────────────────────────────────────────────────────── */}
            <div className="flex flex-col sm:flex-row sm:items-start gap-4 justify-between">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <Brain className="w-4 h-4 text-amber-500" />
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                            Institutional Intelligence · {range} Window
                        </span>
                    </div>
                    <p className="text-xs text-slate-400 max-w-lg">
                        Track the top institutional brokers, their whale-sized accumulations, and which stocks are attracting the most smart money.
                    </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                    {RANGES.map(r => (
                        <button key={r} onClick={() => setRange(r)}
                            className={cn(
                                'px-3 py-1.5 text-[11px] font-semibold rounded-lg border transition-all',
                                range === r
                                    ? 'bg-slate-800 dark:bg-slate-100 border-slate-800 dark:border-slate-100 text-white dark:text-slate-900 shadow-sm'
                                    : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-500',
                            )}>
                            {r}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? <PageLoader text="Loading smart money intelligence..." /> : (
                <>
                    {/* ── KPI Cards ───────────────────────────────────────────── */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {kpiCards.map(card => {
                            const c = colorMap[card.color];
                            return (
                                <div key={card.label} className="bg-white dark:bg-slate-950/40 backdrop-blur-xl rounded-2xl border border-slate-200 dark:border-white/5 p-5 shadow-sm">
                                    <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center mb-3', c.icon)}>
                                        {card.icon}
                                    </div>
                                    <div className={cn('text-xl font-bold tabular-nums', c.val)}>{card.fmt(card.value)}</div>
                                    <div className="text-[11px] font-medium text-slate-600 dark:text-slate-300 mt-0.5">{card.label}</div>
                                    <div className="text-[10px] font-normal text-slate-400 mt-0.5">{card.sub}</div>
                                </div>
                            );
                        })}
                    </div>

                    {/* ── Signal Health Bar ────────────────────────────────────── */}
                    {sortedSignals.length > 0 && (
                        <div className="bg-white dark:bg-slate-950/40 backdrop-blur-xl rounded-2xl border border-slate-200 dark:border-white/5 px-6 py-4 shadow-sm flex flex-wrap items-center gap-6">
                            <div className="flex items-center gap-2">
                                <Activity className="w-4 h-4 text-slate-400" />
                                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Signal Health</span>
                            </div>
                            <div className="flex-1 min-w-[200px]">
                                <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                    <div
                                        className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-500"
                                        style={{ width: `${(profitSignals / sortedSignals.length) * 100}%` }}
                                    />
                                </div>
                            </div>
                            <div className="flex items-center gap-4 text-xs font-medium tabular-nums">
                                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                    <ArrowUpRight className="w-3.5 h-3.5" />{profitSignals} profitable
                                </span>
                                <span className="text-rose-600 dark:text-rose-400 flex items-center gap-1">
                                    <ArrowDownRight className="w-3.5 h-3.5" />{sortedSignals.length - profitSignals} in loss
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
                        <div className="bg-white dark:bg-slate-950/40 backdrop-blur-xl rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm overflow-hidden">
                            <div className="px-5 py-4 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02]">
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
                                    return (
                                        <Link href={`/broker/${broker.broker_id}`} key={broker.broker_id}>
                                            <div className={cn(
                                                'p-3 rounded-xl border transition-all hover:shadow-sm group',
                                                style.bg, style.border,
                                            )}>
                                                <div className="flex items-center gap-2.5 mb-2">
                                                    <div className={cn('w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0', style.badge)}>
                                                        {idx + 1}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-xs font-medium text-slate-700 dark:text-slate-200">Broker #{broker.broker_id}</div>
                                                        <div className="text-[10px] text-slate-400">{broker.rank} · {style.label}</div>
                                                    </div>
                                                    <div className="text-sm font-semibold shrink-0 tabular-nums text-slate-800 dark:text-slate-100">
                                                        {broker.score.toLocaleString()}<span className="text-[9px] font-normal ml-0.5 opacity-60">pts</span>
                                                    </div>
                                                </div>
                                                <div className="h-1 rounded-full bg-black/5 dark:bg-white/5 overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full transition-all duration-700"
                                                        style={{ width: `${barPct}%`, backgroundColor: style.barColor, opacity: 0.7 }}
                                                    />
                                                </div>
                                            </div>
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Right column: Signals + Symbol Flow ───────────────── */}
                        <div className="lg:col-span-2 bg-white dark:bg-slate-950/40 backdrop-blur-xl rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm overflow-hidden">
                            {/* Tab bar */}
                            <div className="border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02] px-5 flex items-center gap-1">
                                {([
                                    { key: 'signals' as const, label: 'Whale Signals', icon: <Zap className="w-3.5 h-3.5" /> },
                                    { key: 'flow' as const,    label: 'Symbol Intelligence', icon: <BarChart3 className="w-3.5 h-3.5" /> },
                                ]).map(tab => (
                                    <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                                        className={cn(
                                            'flex items-center gap-1.5 px-4 py-4 text-xs font-semibold tracking-tight border-b-2 transition-all whitespace-nowrap',
                                            activeTab === tab.key
                                                ? 'border-amber-500 text-amber-600 dark:text-amber-400'
                                                : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300',
                                        )}>
                                        {tab.icon}{tab.label}
                                    </button>
                                ))}
                                <div className="ml-auto flex items-center gap-2 pr-1">
                                    {activeTab === 'signals' && data?.signals?.length ? (
                                        <>
                                            <span className="text-[10px] px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full border border-slate-200 dark:border-slate-700 font-medium">
                                                {profitSignals} profitable
                                            </span>
                                            <span className="text-[10px] px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full border border-slate-200 dark:border-slate-700 font-medium">
                                                {data.signals.length} signals
                                            </span>
                                        </>
                                    ) : activeTab === 'flow' && data?.symbol_flows?.length ? (
                                        <span className="text-[10px] px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full border border-slate-200 dark:border-slate-700 font-medium">
                                            {data.symbol_flows.length} stocks
                                        </span>
                                    ) : null}
                                </div>
                            </div>

                            <div className="p-5">
                                {/* ── Whale Signals tab ─────────────────────── */}
                                {activeTab === 'signals' && (
                                    <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800">
                                        <table className="w-full text-xs">
                                            <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                                                <tr>
                                                    <th className="px-4 py-3 text-left font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[10px]">Broker</th>
                                                    <th className="px-4 py-3 text-left font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[10px]">Symbol</th>
                                                    {([
                                                        { label: 'Qty',     key: 'qty'    as SignalSortKey },
                                                        { label: 'Avg Buy', key: null },
                                                        { label: 'LTP',     key: null },
                                                        { label: 'P&L %',   key: 'pnl'    as SignalSortKey },
                                                        { label: 'Amount',  key: 'amount' as SignalSortKey },
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
                                                {!sortedSignals.length ? (
                                                    <tr>
                                                        <td colSpan={7} className="p-10 text-center text-slate-400 text-sm">
                                                            No whale signals detected in this period
                                                        </td>
                                                    </tr>
                                                ) : sortedSignals.map((signal, idx) => {
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
                                                    style={{ height: `${Math.max(180, Math.min(data.symbol_flows.length, 15) * 28)}px` }}
                                                    opts={{ renderer: 'svg' }}
                                                />
                                                <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800">
                                                    <table className="w-full text-xs">
                                                        <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                                                            <tr>
                                                                {['#', 'Symbol', 'Buy', 'Sell', 'Net Accumulation', 'Net Capital', 'Brokers'].map(h => (
                                                                    <th key={h} className="px-4 py-3 text-left font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[10px]">{h}</th>
                                                                ))}
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
                                                            {data.symbol_flows.map((sf, idx) => (
                                                                <tr key={sf.symbol} className="hover:bg-amber-50/30 dark:hover:bg-amber-900/5 transition-colors">
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
                    <div className="bg-white dark:bg-slate-950/40 backdrop-blur-xl rounded-2xl border border-slate-200 dark:border-white/5 px-6 py-5 shadow-sm">
                        <div className="text-[10px] font-medium uppercase tracking-widest text-slate-400 mb-4">Tier Classification</div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {([
                                { tier: 'S', title: 'Elite Accumulator', desc: 'Highest buy volume in the period. Dominant institutional player.' },
                                { tier: 'A', title: 'Pro Accumulator',   desc: 'Top 3 by buy volume. Consistent large-ticket buyer.' },
                                { tier: 'B', title: 'Active Broker',     desc: 'Ranks 4–6. Significant institutional activity.' },
                                { tier: 'C', title: 'Tracked Broker',    desc: 'Ranks 7–10. Worth watching for emerging patterns.' },
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
