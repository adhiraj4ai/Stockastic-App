'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Loader2, TrendingUp, TrendingDown, Minus, ArrowRight, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ReactECharts from 'echarts-for-react';
import Link from 'next/link';
import { formatNepaliNumber, formatRupees } from '@/lib/formatters';

interface TickerAccumulationProps {
    symbol: string;
}

const RANGES = ['1D', '1W', '1M', '1Y'] as const;

type SortKey = 'broker' | 'cumulative_net' | 'wac' | 'ltp' | 'pnl' | 'change_5d' | 'change_10d' | 'change_20d' | 'change_50d';
type SortDir = 'asc' | 'desc';

const BROKER_COLORS = [
    '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#06b6d4', '#f97316', '#ec4899', '#84cc16', '#14b8a6',
];

function TrendBadge({ trend, change }: { trend: string; change: number }) {
    const isUp = trend === 'Increasing';
    const isDown = trend === 'Decreasing';
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black ${
            isUp
                ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                : isDown
                ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
        }`}>
            {isUp ? <TrendingUp className="w-3 h-3" /> : isDown ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
            {Math.abs(Number(change) || 0).toFixed(1)}%
        </span>
    );
}

export default function TickerAccumulation({ symbol }: TickerAccumulationProps) {
    const [range, setRange] = useState<string>('1W');
    const [graphData, setGraphData] = useState<{ data: any[]; brokers: number[]; buy_leaders: any[]; sell_leaders: any[] } | null>(null);
    const [accumData, setAccumData] = useState<any | null>(null);
    const [trendData, setTrendData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; dir: SortDir }>({ key: 'cumulative_net', dir: 'desc' });

    useEffect(() => {
        const fetchAll = async () => {
            setLoading(true);
            try {
                const [graphRes, accumRes, trendRes] = await Promise.all([
                    api.get('/api/stocks/companies/brokers_graph/', { params: { symbol, range } }),
                    api.get('/api/stocks/companies/accumulation/', { params: { range } }),
                    api.get('/api/stocks/companies/broker_trends/', { params: { symbol } }),
                ]);
                setGraphData(graphRes.data);
                const sym = (accumRes.data as any[]).find((s: any) => s.symbol === symbol) || null;
                setAccumData(sym);
                setTrendData((trendRes.data as any[]).sort((a: any, b: any) => b.cumulative_net - a.cumulative_net));
            } catch (err) {
                console.error('Accumulation fetch failed', err);
            } finally {
                setLoading(false);
            }
        };
        fetchAll();
    }, [symbol, range]);

    const holderTrendChart = () => {
        if (!graphData?.data?.length || !graphData?.brokers?.length) return {};
        const dates = graphData.data.map((d: any) => d.date);
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
            legend: {
                data: graphData.brokers.map((b: number) => `Br.${b}`),
                bottom: 0,
                textStyle: { fontSize: 11, color: '#64748b' },
                icon: 'roundRect',
            },
            grid: { left: '3%', right: '4%', bottom: '18%', top: '5%', containLabel: true },
            xAxis: {
                type: 'category',
                data: dates,
                axisLabel: { color: '#94a3b8', fontSize: 10 },
                axisLine: { lineStyle: { color: '#1e293b' } },
            },
            yAxis: {
                type: 'value',
                axisLabel: { color: '#94a3b8', fontSize: 10, formatter: (v: number) => formatNepaliNumber(v) },
                splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } },
            },
            series: graphData.brokers.map((broker: number, idx: number) => ({
                name: `Br.${broker}`,
                type: 'line',
                smooth: true,
                data: graphData!.data.map((d: any) => d[broker] ?? null),
                connectNulls: true,
                symbolSize: 4,
                lineStyle: { width: 2.5, color: BROKER_COLORS[idx % BROKER_COLORS.length] },
                itemStyle: { color: BROKER_COLORS[idx % BROKER_COLORS.length] },
            })),
        };
    };

    const pressureChart = (type: 'buy' | 'sell') => {
        const leaders = type === 'buy' ? (graphData?.buy_leaders || []) : (graphData?.sell_leaders || []);
        if (!leaders.length) return {};
        const color = type === 'buy' ? '#10b981' : '#ef4444';
        const dimColor = type === 'buy' ? '#064e3b' : '#7f1d1d';
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
                        <div>Buy Qty: ${formatNepaliNumber(item.buy_qty)} @ रू${item.buy_rate}</div>
                        <div>Sell Qty: ${formatNepaliNumber(item.sell_qty)} @ रू${item.sell_rate}</div>`;
                }
            },
            grid: { left: '5%', right: '12%', bottom: '3%', top: '5%', containLabel: true },
            xAxis: { type: 'value', axisLabel: { show: false }, splitLine: { show: false } },
            yAxis: {
                type: 'category',
                data: leaders.map((l: any) => `Br.${l.broker}`),
                inverse: true,
                axisLabel: { color: '#94a3b8', fontSize: 11, fontWeight: 700 },
            },
            series: [{
                type: 'bar',
                data: leaders.map((l: any) => l.net_qty),
                itemStyle: {
                    color: color,
                    borderRadius: [0, 6, 6, 0],
                },
                label: {
                    show: true,
                    position: 'right',
                    formatter: (p: any) => formatNepaliNumber(p.value),
                    color: '#94a3b8',
                    fontSize: 10,
                    fontWeight: 700,
                },
                emphasis: { itemStyle: { color: dimColor } },
            }],
        };
    };

    const netFlow = Number(accumData?.net_qty ?? 0);
    const accRatio = Number(accumData?.accumulation_ratio ?? 0);
    const isAccumulating = netFlow > 0;

    const handleSort = (key: SortKey) => {
        setSortConfig(prev => ({ key, dir: prev.key === key && prev.dir === 'desc' ? 'asc' : 'desc' }));
    };

    const sortedTrendData = [...trendData].sort((a, b) => {
        const { key, dir } = sortConfig;
        const wacA = Number(a.wac || 0), ltpA = Number(a.ltp || 0);
        const wacB = Number(b.wac || 0), ltpB = Number(b.ltp || 0);
        const valA = key === 'pnl'
            ? (wacA > 0 ? ((ltpA - wacA) / wacA) * 100 : -Infinity)
            : key === 'broker' ? Number(a.broker)
            : Number(a[key] ?? 0);
        const valB = key === 'pnl'
            ? (wacB > 0 ? ((ltpB - wacB) / wacB) * 100 : -Infinity)
            : key === 'broker' ? Number(b.broker)
            : Number(b[key] ?? 0);
        return dir === 'asc' ? valA - valB : valB - valA;
    });

    const SortIcon = ({ col }: { col: SortKey }) => {
        if (sortConfig.key !== col) return <ChevronsUpDown className="w-3 h-3 inline ml-1 opacity-30" />;
        return sortConfig.dir === 'asc'
            ? <ChevronUp className="w-3 h-3 inline ml-1 text-slate-900 dark:text-slate-200" />
            : <ChevronDown className="w-3 h-3 inline ml-1 text-slate-900 dark:text-slate-200" />;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-20">
                <Loader2 className="w-10 h-10 animate-spin text-slate-900 dark:text-slate-100" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Range Selector */}
            <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-slate-400 tracking-widest mr-1">Period</span>
                {RANGES.map(r => (
                    <Button
                        key={r}
                        size="sm"
                        variant={range === r ? 'default' : 'outline'}
                        onClick={() => setRange(r)}
                        className={`rounded-xl px-4 h-8 font-bold text-xs transition-all ${
                            range === r
                                ? 'bg-black dark:bg-white text-white dark:text-black shadow-md scale-105'
                                : 'text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-black'
                        }`}
                    >
                        {r}
                    </Button>
                ))}
            </div>

            {/* Smart Money Overview */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
                    <p className="text-[10px] font-black text-slate-400 tracking-widest mb-3">Smart money flow</p>
                    <p className={`text-2xl font-black tracking-tight ${isAccumulating ? 'text-emerald-600 dark:text-emerald-400' : netFlow < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'}`}>
                        {netFlow > 0 ? '+' : ''}{formatNepaliNumber(netFlow)}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1 font-semibold">Net shares via top 15 brokers</p>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
                    <p className="text-[10px] font-black text-slate-400 tracking-widest mb-3">Accumulation ratio</p>
                    <p className={`text-2xl font-black tracking-tight ${accRatio > 50 ? 'text-emerald-600 dark:text-emerald-400' : accRatio > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}`}>
                        {accumData ? `${accRatio.toFixed(1)}%` : '–'}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1 font-semibold">Smart money % of total volume</p>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
                    <p className="text-[10px] font-black text-slate-400 tracking-widest mb-2">Top smart buyers</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                        {(accumData?.top_buyers?.slice(0, 5) || []).map((b: any) => (
                            <Link href={`/broker/${b}`} key={b}>
                                <span className="px-2 py-0.5 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-md text-xs font-bold border border-emerald-200 dark:border-emerald-800/50 hover:opacity-75 transition-opacity cursor-pointer">
                                    #{b}
                                </span>
                            </Link>
                        ))}
                        {!accumData?.top_buyers?.length && <span className="text-slate-400 text-sm font-medium">No data</span>}
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
                    <p className="text-[10px] font-black text-slate-400 tracking-widest mb-2">Top smart sellers</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                        {(accumData?.top_sellers?.slice(0, 5) || []).map((b: any) => (
                            <Link href={`/broker/${b}`} key={b}>
                                <span className="px-2 py-0.5 bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 rounded-md text-xs font-bold border border-rose-200 dark:border-rose-800/50 hover:opacity-75 transition-opacity cursor-pointer">
                                    #{b}
                                </span>
                            </Link>
                        ))}
                        {!accumData?.top_sellers?.length && <span className="text-slate-400 text-sm font-medium">No data</span>}
                    </div>
                </div>
            </div>

            {/* Top Holder Trend Chart */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-slate-100 dark:border-slate-800">
                    <h3 className="font-bold text-slate-800 dark:text-slate-100">Top Holder Accumulation Trend</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">Cumulative net position of top 5 brokers over time</p>
                </div>
                <div className="p-4 h-72">
                    {graphData?.data?.length ? (
                        <ReactECharts option={holderTrendChart()} style={{ height: '100%', width: '100%' }} notMerge />
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-600 space-y-2">
                            <p className="font-medium text-sm">No trend data available for this period</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Buy / Sell Pressure */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-emerald-50/60 dark:bg-emerald-900/10">
                        <h3 className="font-bold text-emerald-800 dark:text-emerald-400 text-sm">Aggressive Buying Pressure</h3>
                        <p className="text-[10px] text-slate-400 mt-0.5">Brokers with highest net purchases this period</p>
                    </div>
                    <div className="p-4 h-56">
                        {graphData?.buy_leaders?.length ? (
                            <ReactECharts option={pressureChart('buy')} style={{ height: '100%', width: '100%' }} notMerge />
                        ) : (
                            <div className="h-full flex items-center justify-center text-slate-400 dark:text-slate-600 text-sm">No buying pressure detected</div>
                        )}
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-rose-50/60 dark:bg-rose-900/10">
                        <h3 className="font-bold text-rose-800 dark:text-rose-400 text-sm">Aggressive Selling Pressure</h3>
                        <p className="text-[10px] text-slate-400 mt-0.5">Brokers with highest net sales this period</p>
                    </div>
                    <div className="p-4 h-56">
                        {graphData?.sell_leaders?.length ? (
                            <ReactECharts option={pressureChart('sell')} style={{ height: '100%', width: '100%' }} notMerge />
                        ) : (
                            <div className="h-full flex items-center justify-center text-slate-400 dark:text-slate-600 text-sm">No selling pressure detected</div>
                        )}
                    </div>
                </div>
            </div>

            {/* Broker Position & Trend Table */}
            {trendData.length > 0 && (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                    <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <div>
                            <h3 className="font-bold text-slate-800 dark:text-slate-100">Holder Position & Trend</h3>
                            <p className="text-[11px] text-slate-400 mt-0.5">Significant holders of {symbol} with multi-timeframe trend</p>
                        </div>
                        <Link href={`/accumulation?tab=history&symbol=${symbol}`}>
                            <Button variant="ghost" size="sm" className="text-xs font-bold text-slate-900 dark:text-slate-200 gap-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl">
                                Full History <ArrowRight className="w-3 h-3" />
                            </Button>
                        </Link>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 dark:bg-slate-900/80 border-b border-slate-100 dark:border-slate-800">
                                <tr>
                                    {([
                                        { label: 'Broker', col: 'broker' as SortKey, align: 'left' },
                                        { label: 'Holdings', col: 'cumulative_net' as SortKey, align: 'right' },
                                        { label: 'WAC', col: 'wac' as SortKey, align: 'right' },
                                        { label: 'LTP', col: 'ltp' as SortKey, align: 'right' },
                                        { label: 'P&L', col: 'pnl' as SortKey, align: 'right' },
                                        { label: '5D', col: 'change_5d' as SortKey, align: 'center' },
                                        { label: '10D', col: 'change_10d' as SortKey, align: 'center' },
                                        { label: '20D', col: 'change_20d' as SortKey, align: 'center' },
                                        { label: '50D', col: 'change_50d' as SortKey, align: 'center' },
                                    ]).map(({ label, col, align }) => (
                                        <th
                                            key={col}
                                            onClick={() => handleSort(col)}
                                            className={`px-5 py-3 text-[10px] font-black text-slate-400 tracking-wider cursor-pointer select-none hover:text-black dark:hover:text-white transition-colors ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'}`}
                                        >
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
                                        <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group">
                                            <td className="px-5 py-3">
                                                <Link href={`/broker/${row.broker}`} className="font-black text-black dark:text-white hover:underline text-sm">
                                                    #{row.broker}
                                                </Link>
                                            </td>
                                            <td className="px-5 py-3 text-right font-mono font-bold text-slate-700 dark:text-slate-200">
                                                {formatNepaliNumber(row.cumulative_net)}
                                            </td>
                                            <td className="px-5 py-3 text-right font-mono text-slate-500 dark:text-slate-400">
                                                {wac > 0 ? formatRupees(wac, 0) : '–'}
                                            </td>
                                            <td className="px-5 py-3 text-right font-mono font-bold text-slate-700 dark:text-slate-200">
                                                {ltp > 0 ? formatRupees(ltp, 0) : '–'}
                                            </td>
                                            <td className="px-5 py-3 text-right">
                                                {pnlPct !== null ? (
                                                    <span className={`text-xs font-black ${pnlPct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                                        {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%
                                                    </span>
                                                ) : '–'}
                                            </td>
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

            {trendData.length === 0 && !graphData?.data?.length && !accumData && (
                <div className="text-center py-16 text-slate-400 dark:text-slate-600">
                    <p className="font-medium">No accumulation data found for {symbol}</p>
                </div>
            )}
        </div>
    );
}
