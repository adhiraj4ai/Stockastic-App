'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import api from '@/lib/api';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { formatNepaliNumber, formatRupees } from '@/lib/formatters';
import ReactECharts from 'echarts-for-react';
import {
    Loader2, TrendingUp, TrendingDown, Minus, ArrowRight,
    ChevronUp, ChevronDown, ChevronsUpDown,
    Crown, ArrowUpRight, ArrowDownRight, Activity, Users, BarChart3
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BrokerRow {
    broker_id: number;
    buy_qty:   number;
    sell_qty:  number;
    net_qty:   number;
    buy_amount:  number;
    sell_amount: number;
    net_amount:  number;
    pct?: number;
}

interface SmartMoneyData {
    kpi: {
        total_volume:       number;
        unique_buyers:      number;
        unique_sellers:     number;
        smart_broker_count: number;
        net_smart_qty:      number;
    };
    top_buyers:        (BrokerRow & { pct: number })[];
    top_sellers:       (BrokerRow & { pct: number })[];
    net_accumulators:  BrokerRow[];
    net_distributors:  BrokerRow[];
    smart_broker_activity: BrokerRow[];
    daily_flow: { date: string; volume: number; avg_rate: number }[];
}

type SortKey = 'broker' | 'cumulative_net' | 'wac' | 'ltp' | 'pnl' | 'change_5d' | 'change_10d' | 'change_20d' | 'change_50d';
type SortDir = 'asc' | 'desc';

const RANGES = ['1D', '1W', '1M', '3M', '6M', '1Y', 'AT'] as const;
type Range = typeof RANGES[number];

const BROKER_COLORS = [
    '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#06b6d4', '#f97316', '#ec4899', '#84cc16', '#14b8a6',
];

// ─── Small helpers ────────────────────────────────────────────────────────────

function TrendBadge({ trend, change }: { trend: string; change: number }) {
    const isUp = trend === 'Increasing';
    const isDown = trend === 'Decreasing';
    return (
        <span className={cn(
            'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold tracking-tight',
            isUp   ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' :
            isDown ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400' :
                     'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
        )}>
            {isUp ? <TrendingUp className="w-3 h-3" /> : isDown ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
            {Math.abs(Number(change) || 0).toFixed(1)}%
        </span>
    );
}

function BrokerBar({ rank, broker_id, qty, amount, pct, maxQty, dir }: {
    rank: number; broker_id: number; qty: number; amount: number;
    pct: number; maxQty: number; dir: 'buy' | 'sell';
}) {
    const barW = maxQty > 0 ? Math.round((qty / maxQty) * 100) : 0;
    return (
        <Link href={`/broker/${broker_id}`}>
            <div className="grid grid-cols-[20px_1fr_auto] items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                <span className="text-[10px] text-slate-400 tabular-nums text-center">{rank}</span>
                <div className="min-w-0 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-slate-600 dark:text-slate-300 group-hover:underline">Broker #{broker_id}</span>
                        <span className="text-[10px] text-slate-400 tabular-nums">{pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                            className={cn('h-full rounded-full transition-all duration-500',
                                dir === 'buy' ? 'bg-emerald-400 dark:bg-emerald-500' : 'bg-rose-400 dark:bg-rose-500'
                            )}
                            style={{ width: `${barW}%` }}
                        />
                    </div>
                </div>
                <div className="text-right shrink-0">
                    <div className="text-[11px] text-slate-700 dark:text-slate-300 tabular-nums">{formatNepaliNumber(qty)}</div>
                    <div className="text-[9px] text-slate-400 tabular-nums">{formatRupees(amount, 0)}</div>
                </div>
            </div>
        </Link>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TickerAccumulation({ symbol }: { symbol: string }) {
    // Shared range
    const [range, setRange] = useState<Range>('1W');
    const [graphData, setGraphData]   = useState<any>(null);
    const [accumData, setAccumData]   = useState<any>(null);
    const [trendData, setTrendData]   = useState<any[]>([]);
    const [accumLoading, setAccumLoading] = useState(true);
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; dir: SortDir }>({ key: 'cumulative_net', dir: 'desc' });

    const [smData, setSmData]       = useState<SmartMoneyData | null>(null);
    const [smLoading, setSmLoading] = useState(true);
    const abortRef = useRef<AbortController | null>(null);

    // Fetch accumulation data
    useEffect(() => {
        setAccumLoading(true);
        Promise.all([
            api.get('/api/stocks/companies/brokers_graph/', { params: { symbol, range } }),
            api.get('/api/stocks/companies/accumulation/', { params: { range, symbol } }),
            api.get('/api/stocks/companies/broker_trends/', { params: { symbol } }),
        ]).then(([gRes, aRes, tRes]) => {
            setGraphData(gRes.data);
            const list = aRes.data as any[];
            setAccumData(list.length > 0 ? list[0] : null);
            setTrendData((tRes.data as any[]).sort((a, b) => b.cumulative_net - a.cumulative_net));
        }).catch(console.error)
          .finally(() => setAccumLoading(false));
    }, [symbol, range]);

    // Fetch smart money data
    useEffect(() => {
        abortRef.current?.abort();
        abortRef.current = new AbortController();
        const { signal } = abortRef.current;
        setSmLoading(true);
        api.get('/api/stocks/floorsheet/symbol_smart_money/', { params: { symbol, range }, signal })
            .then(res => setSmData(res.data))
            .catch(err => { if (err.name !== 'AbortError') console.error(err); })
            .finally(() => setSmLoading(false));
        return () => abortRef.current?.abort();
    }, [symbol, range]);

    // ─── Chart configs ────────────────────────────────────────────────────────

    const holderTrendChartOption = useMemo(() => {
        if (!graphData?.data?.length || !graphData?.brokers?.length) return {};
        return {
            tooltip: {
                trigger: 'axis',
                backgroundColor: 'rgba(15,23,42,0.92)',
                borderColor: '#334155',
                textStyle: { color: '#e2e8f0', fontSize: 12 },
                formatter: (params: any[]) => {
                    let html = `<div style="font-weight:700;margin-bottom:6px;color:#94a3b8">${params[0]?.name}</div>`;
                    params.forEach(p => {
                        html += `<div style="display:flex;justify-content:space-between;gap:20px;margin-bottom:3px">
                            <span style="display:flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:2px;background:${p.color};display:inline-block"></span>${p.seriesName}</span>
                            <span style="font-family:monospace;font-weight:700">${formatNepaliNumber(p.value)}</span>
                        </div>`;
                    });
                    return html;
                }
            },
            legend: { data: graphData.brokers.map((b: number) => `Br.${b}`), bottom: 0, textStyle: { fontSize: 11, color: '#64748b' }, icon: 'roundRect' },
            grid: { left: '3%', right: '4%', bottom: '18%', top: '5%', containLabel: true },
            xAxis: { type: 'category', data: graphData.data.map((d: any) => d.date), axisLabel: { color: '#94a3b8', fontSize: 10 }, axisLine: { lineStyle: { color: '#1e293b' } } },
            yAxis: { type: 'value', axisLabel: { color: '#94a3b8', fontSize: 10, formatter: (v: number) => formatNepaliNumber(v) }, splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } } },
            series: graphData.brokers.map((broker: number, idx: number) => ({
                name: `Br.${broker}`, type: 'line', smooth: true,
                data: graphData.data.map((d: any) => d[broker] ?? null),
                connectNulls: true, symbolSize: 4,
                lineStyle: { width: 2.5, color: BROKER_COLORS[idx % BROKER_COLORS.length] },
                itemStyle: { color: BROKER_COLORS[idx % BROKER_COLORS.length] },
            })),
        };
    }, [graphData]);

    const pressureChartOption = (type: 'buy' | 'sell') => {
        const leaders = type === 'buy' ? (graphData?.buy_leaders || []) : (graphData?.sell_leaders || []);
        if (!leaders.length) return {};
        const color = type === 'buy' ? '#10b981' : '#ef4444';
        return {
            tooltip: {
                trigger: 'axis',
                backgroundColor: 'rgba(15,23,42,0.92)',
                borderColor: '#334155',
                textStyle: { color: '#e2e8f0', fontSize: 12 },
                formatter: (params: any[]) => {
                    const item = leaders[params[0].dataIndex];
                    return `<div style="font-weight:700;margin-bottom:5px">Broker #${item.broker}</div>
                        <div>Net: <b>${formatNepaliNumber(item.net_qty)}</b></div>
                        <div>Buy: ${formatNepaliNumber(item.buy_qty)} @ रू${item.buy_rate}</div>
                        <div>Sell: ${formatNepaliNumber(item.sell_qty)} @ रू${item.sell_rate}</div>`;
                }
            },
            grid: { left: '5%', right: '12%', bottom: '3%', top: '5%', containLabel: true },
            xAxis: { type: 'value', axisLabel: { show: false }, splitLine: { show: false } },
            yAxis: { type: 'category', data: leaders.map((l: any) => `Br.${l.broker}`), inverse: true, axisLabel: { color: '#94a3b8', fontSize: 11, fontWeight: 700 } },
            series: [{ type: 'bar', data: leaders.map((l: any) => l.net_qty), itemStyle: { color, borderRadius: [0, 6, 6, 0] }, label: { show: true, position: 'right', formatter: (p: any) => formatNepaliNumber(p.value), color: '#94a3b8', fontSize: 10, fontWeight: 700 } }],
        };
    };

    const dailyFlowChartOption = useMemo(() => {
        const df = smData?.daily_flow;
        if (!df?.length) return {};
        return {
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'cross', crossStyle: { color: '#475569' } },
                backgroundColor: '#0f172a',
                borderColor: '#1e293b',
                textStyle: { color: '#e2e8f0', fontSize: 12 },
                extraCssText: 'border-radius:10px;padding:12px 16px;box-shadow:0 8px 32px rgba(0,0,0,0.4)',
                formatter(params: any[]) {
                    const vol  = params.find(p => p.seriesName === 'Volume');
                    const rate = params.find(p => p.seriesName === 'Avg Price');
                    return `<div style="font-size:11px;color:#94a3b8;margin-bottom:6px">${params[0]?.axisValue}</div>
                        ${vol  ? `<div style="display:flex;justify-content:space-between;gap:20px"><span style="color:#94a3b8">Volume</span><b>${formatNepaliNumber(vol.value)}</b></div>`  : ''}
                        ${rate ? `<div style="display:flex;justify-content:space-between;gap:20px;margin-top:4px"><span style="color:#94a3b8">Avg Price</span><b>${formatRupees(rate.value, 1)}</b></div>` : ''}`;
                },
            },
            grid: { left: 12, right: 52, top: 16, bottom: 6, containLabel: true },
            xAxis: { type: 'category', data: df.map(d => d.date), axisLabel: { color: '#475569', fontSize: 10, rotate: df.length > 20 ? 30 : 0, formatter: (v: string) => v.slice(5) }, axisLine: { lineStyle: { color: '#1e293b' } }, axisTick: { show: false } },
            yAxis: [
                { type: 'value', axisLabel: { formatter: (v: number) => v >= 100000 ? `${(v/100000).toFixed(0)}L` : v >= 1000 ? `${(v/1000).toFixed(0)}k` : `${v}`, color: '#475569', fontSize: 10 }, axisLine: { show: false }, splitLine: { lineStyle: { color: '#1e293b', type: 'dashed', opacity: 0.5 } } },
                { type: 'value', axisLabel: { formatter: (v: number) => `${v}`, color: '#475569', fontSize: 10 }, axisLine: { show: false }, splitLine: { show: false } },
            ],
            series: [
                { name: 'Volume', type: 'bar', yAxisIndex: 0, data: df.map(d => ({ value: d.volume, itemStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(99,102,241,0.8)' }, { offset: 1, color: 'rgba(99,102,241,0.2)' }] }, borderRadius: [3,3,0,0] } })), barMaxWidth: 28 },
                { name: 'Avg Price', type: 'line', yAxisIndex: 1, data: df.map(d => d.avg_rate), smooth: 0.4, symbol: 'circle', symbolSize: 4, showSymbol: df.length <= 20, lineStyle: { color: '#f59e0b', width: 2 }, itemStyle: { color: '#f59e0b', borderColor: '#fff', borderWidth: 1.5 }, areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(245,158,11,0.1)' }, { offset: 1, color: 'transparent' }] } } },
            ],
        };
    }, [smData?.daily_flow]);

    // ─── Derived values ───────────────────────────────────────────────────────

    const netFlow = Number(accumData?.net_qty ?? 0);
    const accRatio = Number(accumData?.accumulation_ratio ?? 0);
    const isAccumulating = netFlow > 0;

    const sortedTrendData = [...trendData].sort((a, b) => {
        const { key, dir } = sortConfig;
        const wacA = Number(a.wac || 0), ltpA = Number(a.ltp || 0);
        const wacB = Number(b.wac || 0), ltpB = Number(b.ltp || 0);
        const valA = key === 'pnl' ? (wacA > 0 ? ((ltpA - wacA) / wacA) * 100 : -Infinity) : key === 'broker' ? Number(a.broker) : Number(a[key] ?? 0);
        const valB = key === 'pnl' ? (wacB > 0 ? ((ltpB - wacB) / wacB) * 100 : -Infinity) : key === 'broker' ? Number(b.broker) : Number(b[key] ?? 0);
        return dir === 'asc' ? valA - valB : valB - valA;
    });

    const handleSort = (key: SortKey) => setSortConfig(prev => ({ key, dir: prev.key === key && prev.dir === 'desc' ? 'asc' : 'desc' }));

    const SortIcon = ({ col }: { col: SortKey }) => {
        if (sortConfig.key !== col) return <ChevronsUpDown className="w-3 h-3 inline ml-1 opacity-30" />;
        return sortConfig.dir === 'asc'
            ? <ChevronUp className="w-3 h-3 inline ml-1" />
            : <ChevronDown className="w-3 h-3 inline ml-1" />;
    };

    const maxBuyQty  = smData?.top_buyers[0]?.buy_qty  ?? 1;
    const maxSellQty = smData?.top_sellers[0]?.sell_qty ?? 1;

    // ─── Render ───────────────────────────────────────────────────────────────

    return (
        <div className="space-y-6">
            {/* ── Unified Range Selector ──────────────────────────── */}
            <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mr-1">Period</span>
                <div className="flex items-center gap-1">
                    {RANGES.map(r => (
                        <button key={r} onClick={() => setRange(r)}
                            className={cn('px-3 py-1 text-[11px] rounded-lg border transition-all font-semibold',
                                range === r
                                    ? 'bg-slate-900 dark:bg-white border-slate-900 dark:border-white text-white dark:text-slate-900'
                                    : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-500'
                            )}>
                            {r}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── All KPIs in one row ──────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                <div className="col-span-1 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-3 shadow-sm">
                    <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Net Smart Flow</p>
                    <p className={cn('text-lg font-bold tabular-nums', isAccumulating ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
                        {netFlow > 0 ? '+' : ''}{formatNepaliNumber(netFlow)}
                    </p>
                </div>
                <div className="col-span-1 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-3 shadow-sm">
                    <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Accum. Ratio</p>
                    <p className={cn('text-lg font-bold', accRatio > 50 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-500')}>
                        {accumData ? `${accRatio.toFixed(1)}%` : '–'}
                    </p>
                </div>
                {smData && [
                    { label: 'Total Volume',   value: formatNepaliNumber(smData.kpi.total_volume) },
                    { label: 'Unique Buyers',  value: smData.kpi.unique_buyers.toString() },
                    { label: 'Unique Sellers', value: smData.kpi.unique_sellers.toString() },
                    { label: 'Smart Brokers',  value: smData.kpi.smart_broker_count.toString() },
                ].map(k => (
                    <div key={k.label} className="col-span-1 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-3 shadow-sm">
                        <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">{k.label}</p>
                        <p className="text-lg font-bold text-slate-800 dark:text-slate-100 tabular-nums">{k.value}</p>
                    </div>
                ))}
            </div>

            {/* ── Smart Broker Alert ───────────────────────────────── */}
            {smData && smData.smart_broker_activity.length > 0 && (
                <div className="rounded-xl border border-amber-200/60 dark:border-amber-800/30 bg-amber-50/60 dark:bg-amber-900/10 px-4 py-3">
                    <div className="flex items-center gap-2 mb-2">
                        <Crown className="w-3.5 h-3.5 text-amber-500" />
                        <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                            {smData.smart_broker_activity.length} top broker{smData.smart_broker_activity.length > 1 ? 's' : ''} active in {symbol}
                        </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {smData.smart_broker_activity.map(a => {
                            const isNet = a.net_qty >= 0;
                            return (
                                <Link key={a.broker_id} href={`/broker/${a.broker_id}`}>
                                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[10px] hover:opacity-70 transition-opacity">
                                        <span className={isNet ? 'text-emerald-500' : 'text-rose-500'}>
                                            {isNet ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                                        </span>
                                        <span className="text-slate-600 dark:text-slate-300">#{a.broker_id}</span>
                                        <span className="text-slate-400">·</span>
                                        <span className="text-slate-500 tabular-nums">{isNet ? '+' : ''}{formatNepaliNumber(a.net_qty)}</span>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── All Charts Together ──────────────────────────────── */}
            {(accumLoading || smLoading) ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                </div>
            ) : (
                <div className="space-y-5">

                    {/* Buy pressure + Sell pressure + Daily flow — 3 columns */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                            <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-emerald-50/60 dark:bg-emerald-900/10">
                                <p className="font-bold text-emerald-800 dark:text-emerald-400 text-xs">Buying Pressure</p>
                                <p className="text-[9px] text-slate-400 mt-0.5">Highest net purchases this period</p>
                            </div>
                            <div className="p-3 h-48">
                                {graphData?.buy_leaders?.length ? (
                                    <ReactECharts option={pressureChartOption('buy')} style={{ height: '100%', width: '100%' }} notMerge />
                                ) : (
                                    <div className="h-full flex items-center justify-center text-slate-400 text-xs">No buying pressure detected</div>
                                )}
                            </div>
                        </div>

                        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                            <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-rose-50/60 dark:bg-rose-900/10">
                                <p className="font-bold text-rose-800 dark:text-rose-400 text-xs">Selling Pressure</p>
                                <p className="text-[9px] text-slate-400 mt-0.5">Highest net sales this period</p>
                            </div>
                            <div className="p-3 h-48">
                                {graphData?.sell_leaders?.length ? (
                                    <ReactECharts option={pressureChartOption('sell')} style={{ height: '100%', width: '100%' }} notMerge />
                                ) : (
                                    <div className="h-full flex items-center justify-center text-slate-400 text-xs">No selling pressure detected</div>
                                )}
                            </div>
                        </div>

                        {smData && smData.daily_flow.length > 1 ? (
                            <div className="bg-white dark:bg-slate-900/30 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                                <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
                                    <Activity className="w-3.5 h-3.5 text-slate-400" />
                                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Daily Volume & Price</span>
                                    <div className="ml-auto flex items-center gap-3 text-[9px] text-slate-400">
                                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-indigo-400/60 inline-block" />Vol</span>
                                        <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-amber-400 inline-block" />Price</span>
                                    </div>
                                </div>
                                <ReactECharts option={dailyFlowChartOption} style={{ height: '196px' }} opts={{ renderer: 'svg' }} />
                            </div>
                        ) : (
                            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-center text-slate-400 text-xs min-h-[200px]">
                                No daily flow data
                            </div>
                        )}
                    </div>

                    {/* Top Buyers / Sellers */}
                    {smData && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {(['buyers', 'sellers'] as const).map(side => {
                                const items = side === 'buyers' ? smData.top_buyers : smData.top_sellers;
                                const maxQty = side === 'buyers' ? maxBuyQty : maxSellQty;
                                return (
                                    <div key={side} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
                                        <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 flex items-center justify-between">
                                            <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold">Top {side === 'buyers' ? 'Buyers' : 'Sellers'}</span>
                                            <span className="text-[10px] text-slate-400">{items.length} brokers</span>
                                        </div>
                                        <div className="py-1">
                                            {items.length === 0
                                                ? <p className="text-xs text-slate-400 py-8 text-center">No data</p>
                                                : items.map((b, i) => (
                                                    <BrokerBar key={b.broker_id} rank={i + 1} broker_id={b.broker_id}
                                                        qty={side === 'buyers' ? b.buy_qty : b.sell_qty}
                                                        amount={side === 'buyers' ? b.buy_amount : b.sell_amount}
                                                        pct={b.pct} maxQty={maxQty}
                                                        dir={side === 'buyers' ? 'buy' : 'sell'} />
                                                ))
                                            }
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Net accumulators / distributors */}
                    {smData && (smData.net_accumulators.length > 0 || smData.net_distributors.length > 0) && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {([
                                { key: 'accumulators', items: smData.net_accumulators, icon: ArrowUpRight, color: 'text-emerald-500', label: 'Net Accumulators' },
                                { key: 'distributors', items: smData.net_distributors, icon: ArrowDownRight, color: 'text-rose-500', label: 'Net Distributors' },
                            ] as const).map(({ key, items, icon: Icon, color, label }) => items.length > 0 && (
                                <div key={key} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
                                    <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 flex items-center gap-2">
                                        <Icon className={cn('w-3.5 h-3.5', color)} />
                                        <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold">{label}</span>
                                    </div>
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="border-b border-slate-100 dark:border-slate-800">
                                                {['Broker', 'Bought', 'Sold', 'Net'].map(h => (
                                                    <th key={h} className="px-4 py-2 text-left text-[9px] text-slate-400 uppercase tracking-wider">{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
                                            {items.map((a: BrokerRow) => (
                                                <tr key={a.broker_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                                    <td className="px-4 py-2.5"><Link href={`/broker/${a.broker_id}`}><span className="text-[11px] text-slate-600 dark:text-slate-300 hover:underline">#{a.broker_id}</span></Link></td>
                                                    <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300 tabular-nums">{formatNepaliNumber(a.buy_qty)}</td>
                                                    <td className="px-4 py-2.5 text-slate-400 tabular-nums">{formatNepaliNumber(a.sell_qty)}</td>
                                                    <td className="px-4 py-2.5 tabular-nums">
                                                        <span className={key === 'accumulators' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                                                            {key === 'accumulators' ? '+' : ''}{formatNepaliNumber(a.net_qty)}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Holder trend — full width */}
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
                            <BarChart3 className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-sm font-bold text-slate-800 dark:text-slate-100">Top Holder Accumulation Trend</span>
                            <span className="text-[10px] text-slate-400 ml-1">— cumulative net position of top 5 brokers</span>
                        </div>
                        <div className="p-4 h-60">
                            {graphData?.data?.length ? (
                                <ReactECharts option={holderTrendChartOption} style={{ height: '100%', width: '100%' }} notMerge />
                            ) : (
                                <div className="h-full flex items-center justify-center text-slate-400 text-sm">No trend data for this period</div>
                            )}
                        </div>
                    </div>

                    {/* ── Holder Position & Trend (pinned to bottom) ───── */}
                    {trendData.length > 0 && (
                        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden mt-8">
                            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                                <div>
                                    <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Holder Position & Trend</h3>
                                    <p className="text-[10px] text-slate-400 mt-0.5">Significant holders with multi-timeframe trend analysis</p>
                                </div>
                                <Link href={`/accumulation?tab=history&symbol=${symbol}`}>
                                    <Button variant="ghost" size="sm" className="text-xs font-bold gap-1 rounded-xl">
                                        Full History <ArrowRight className="w-3 h-3" />
                                    </Button>
                                </Link>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50 dark:bg-slate-900/80 border-b border-slate-100 dark:border-slate-800">
                                        <tr>
                                            {([
                                                { label: 'Broker', col: 'broker', align: 'left' },
                                                { label: 'Holdings', col: 'cumulative_net', align: 'right' },
                                                { label: 'WAC', col: 'wac', align: 'right' },
                                                { label: 'LTP', col: 'ltp', align: 'right' },
                                                { label: 'P&L', col: 'pnl', align: 'right' },
                                                { label: '5D', col: 'change_5d', align: 'center' },
                                                { label: '10D', col: 'change_10d', align: 'center' },
                                                { label: '20D', col: 'change_20d', align: 'center' },
                                                { label: '50D', col: 'change_50d', align: 'center' },
                                            ] as { label: string; col: SortKey; align: string }[]).map(({ label, col, align }) => (
                                                <th key={col} onClick={() => handleSort(col)}
                                                    className={cn('px-5 py-3 text-[10px] font-semibold text-slate-400 tracking-tight cursor-pointer select-none hover:text-slate-800 dark:hover:text-white transition-colors',
                                                        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
                                                    )}>
                                                    {label}<SortIcon col={col} />
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50 dark:divide-slate-800/70">
                                        {sortedTrendData.map((row: any, i: number) => {
                                            const wac = Number(row.wac || 0);
                                            const ltp = Number(row.ltp || 0);
                                            const pnlPct = wac > 0 ? ((ltp - wac) / wac) * 100 : null;
                                            return (
                                                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                                    <td className="px-5 py-3"><Link href={`/broker/${row.broker}`} className="font-semibold text-black dark:text-white hover:underline text-sm">#{row.broker}</Link></td>
                                                    <td className="px-5 py-3 text-right font-mono font-semibold text-slate-700 dark:text-slate-200">{formatNepaliNumber(row.cumulative_net)}</td>
                                                    <td className="px-5 py-3 text-right font-mono text-slate-500">{wac > 0 ? formatRupees(wac, 0) : '–'}</td>
                                                    <td className="px-5 py-3 text-right font-mono font-semibold text-slate-700 dark:text-slate-200">{ltp > 0 ? formatRupees(ltp, 0) : '–'}</td>
                                                    <td className="px-5 py-3 text-right">{pnlPct !== null ? <span className={cn('text-xs font-semibold', pnlPct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>{pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%</span> : '–'}</td>
                                                    <td className="px-5 py-3 text-center"><TrendBadge trend={row.trend_5d} change={row.change_5d} /></td>
                                                    <td className="px-5 py-3 text-center"><TrendBadge trend={row.trend_10d} change={row.change_10d} /></td>
                                                    <td className="px-5 py-3 text-center"><TrendBadge trend={row.trend_20d} change={row.change_20d} /></td>
                                                    <td className="px-5 py-3 text-center"><TrendBadge trend={row.trend_50d} change={row.change_50d} /></td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
