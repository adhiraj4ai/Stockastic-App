'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import api from '@/lib/api';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { formatNepaliNumber, formatRupees } from '@/lib/formatters';
import ReactECharts from 'echarts-for-react';
import { Loader2, Crown, ArrowUpRight, ArrowDownRight, Activity, Brain } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface BrokerRow {
    broker_id: number;
    buy_qty: number;
    sell_qty: number;
    net_qty: number;
    buy_amount: number;
    sell_amount: number;
    net_amount: number;
    pct?: number;
}

interface SymbolSmartMoneyData {
    kpi: {
        total_volume: number;
        unique_buyers: number;
        unique_sellers: number;
        smart_broker_count: number;
        net_smart_qty: number;
    };
    top_buyers: (BrokerRow & { pct: number })[];
    top_sellers: (BrokerRow & { pct: number })[];
    net_accumulators: BrokerRow[];
    net_distributors: BrokerRow[];
    smart_broker_activity: BrokerRow[];
    daily_flow: { date: string; volume: number; avg_rate: number }[];
}

const RANGES = ['1D', '2D', '3D', '1W', '1M', '3M', '6M'] as const;
type Range = typeof RANGES[number];

// ─── Broker bar row ───────────────────────────────────────────────────────────

function BrokerBarRow({
    rank, broker_id, qty, amount, pct, maxQty, dir,
}: {
    rank: number; broker_id: number; qty: number; amount: number;
    pct: number; maxQty: number; dir: 'buy' | 'sell';
}) {
    const barW = maxQty > 0 ? Math.round((qty / maxQty) * 100) : 0;
    return (
        <Link href={`/broker/${broker_id}`}>
            <div className="grid grid-cols-[20px_1fr_auto] items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors group">
                <span className="text-[10px] text-slate-400 tabular-nums text-center">{rank}</span>
                <div className="min-w-0 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-slate-600 dark:text-slate-300 group-hover:underline">
                            Broker #{broker_id}
                        </span>
                        <span className="text-[10px] text-slate-400 tabular-nums">{pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                            className={cn('h-full rounded-full transition-all duration-500',
                                dir === 'buy' ? 'bg-emerald-400 dark:bg-emerald-500' : 'bg-rose-400 dark:bg-rose-500',
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

export default function TickerSmartMoney({ symbol }: { symbol: string }) {
    const [range, setRange] = useState<Range>('1W');
    const [data, setData] = useState<SymbolSmartMoneyData | null>(null);
    const [loading, setLoading] = useState(true);
    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        abortRef.current?.abort();
        abortRef.current = new AbortController();
        const { signal } = abortRef.current;

        setLoading(true);
        api.get('/api/stocks/floorsheet/symbol_smart_money/', { params: { symbol, range }, signal })
            .then(res => setData(res.data))
            .catch(err => { if (err.name !== 'AbortError') console.error(err); })
            .finally(() => setLoading(false));

        return () => abortRef.current?.abort();
    }, [symbol, range]);

    // ─── Chart ───────────────────────────────────────────────────────────────

    const chartOption = useMemo(() => {
        const df = data?.daily_flow;
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
                    const vol = params.find(p => p.seriesName === 'Volume');
                    const rate = params.find(p => p.seriesName === 'Avg Price');
                    return `
                        <div style="font-size:11px;color:#94a3b8;margin-bottom:6px">${params[0]?.axisValue}</div>
                        ${vol ? `<div style="display:flex;justify-content:space-between;gap:20px"><span style="color:#94a3b8">Volume</span><b>${formatNepaliNumber(vol.value)}</b></div>` : ''}
                        ${rate ? `<div style="display:flex;justify-content:space-between;gap:20px;margin-top:4px"><span style="color:#94a3b8">Avg Price</span><b>${formatRupees(rate.value, 1)}</b></div>` : ''}
                    `;
                },
            },
            grid: { left: 12, right: 52, top: 16, bottom: 6, containLabel: true },
            xAxis: {
                type: 'category',
                data: df.map(d => d.date),
                axisLabel: { color: '#475569', fontSize: 10, rotate: df.length > 20 ? 30 : 0, formatter: (v: string) => v.slice(5) },
                axisLine: { lineStyle: { color: '#1e293b' } },
                axisTick: { show: false },
            },
            yAxis: [
                {
                    type: 'value',
                    axisLabel: {
                        formatter: (v: number) => v >= 100000 ? `${(v / 100000).toFixed(0)}L` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`,
                        color: '#475569', fontSize: 10,
                    },
                    axisLine: { show: false },
                    splitLine: { lineStyle: { color: '#1e293b', type: 'dashed', opacity: 0.5 } },
                },
                {
                    type: 'value',
                    axisLabel: { formatter: (v: number) => `${v}`, color: '#475569', fontSize: 10 },
                    axisLine: { show: false },
                    splitLine: { show: false },
                },
            ],
            series: [
                {
                    name: 'Volume',
                    type: 'bar',
                    yAxisIndex: 0,
                    data: df.map(d => ({
                        value: d.volume,
                        itemStyle: {
                            color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                                colorStops: [{ offset: 0, color: 'rgba(99,102,241,0.8)' }, { offset: 1, color: 'rgba(99,102,241,0.2)' }] },
                            borderRadius: [3, 3, 0, 0],
                        },
                    })),
                    barMaxWidth: 28,
                },
                {
                    name: 'Avg Price',
                    type: 'line',
                    yAxisIndex: 1,
                    data: df.map(d => d.avg_rate),
                    smooth: 0.4,
                    symbol: 'circle',
                    symbolSize: 4,
                    showSymbol: df.length <= 20,
                    lineStyle: { color: '#f59e0b', width: 2 },
                    itemStyle: { color: '#f59e0b', borderColor: '#fff', borderWidth: 1.5 },
                    areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [{ offset: 0, color: 'rgba(245,158,11,0.1)' }, { offset: 1, color: 'transparent' }] } },
                },
            ],
        };
    }, [data?.daily_flow]);

    const maxBuyQty = data?.top_buyers[0]?.buy_qty ?? 1;
    const maxSellQty = data?.top_sellers[0]?.sell_qty ?? 1;

    return (
        <div className="space-y-5">

            {/* ── Header ─────────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                    <Brain className="w-4 h-4 text-amber-500" />
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 tracking-wide">
                        Institutional flow · <span className="text-slate-700 dark:text-slate-300">{symbol}</span>
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    {RANGES.map(r => (
                        <button key={r} onClick={() => setRange(r)}
                            className={cn(
                                'px-2.5 py-1 text-[11px] rounded-md border transition-all',
                                range === r
                                    ? 'bg-slate-800 dark:bg-slate-100 border-slate-800 dark:border-border text-white dark:text-slate-900'
                                    : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-500',
                            )}>
                            {r}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20 gap-2.5 text-slate-400 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Analysing institutional flows…
                </div>
            ) : !data ? (
                <div className="text-center py-20 text-slate-400 text-sm">No floorsheet data for this period</div>
            ) : (
                <>
                    {/* ── KPI strip ─────────────────────────────────────────── */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {([
                            { label: 'Total Volume', value: formatNepaliNumber(data.kpi.total_volume) },
                            { label: 'Unique Buyers', value: data.kpi.unique_buyers.toString() },
                            { label: 'Unique Sellers', value: data.kpi.unique_sellers.toString() },
                            { label: 'Smart Brokers', value: data.kpi.smart_broker_count.toString() },
                        ]).map(c => (
                            <div key={c.label} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-card px-4 py-3">
                                <div className="text-xl font-semibold text-slate-800 dark:text-slate-100 tabular-nums leading-none mb-1">{c.value}</div>
                                <div className="text-[10px] text-slate-400">{c.label}</div>
                            </div>
                        ))}
                    </div>

                    {/* ── Smart broker alert ───────────────────────────────── */}
                    {data.smart_broker_activity.length > 0 && (
                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-card px-4 py-3">
                            <div className="flex items-center gap-2 mb-2.5">
                                <Crown className="w-3.5 h-3.5 text-amber-500" />
                                <span className="text-[11px] text-slate-600 dark:text-slate-300">
                                    {data.smart_broker_activity.length} market-wide top broker{data.smart_broker_activity.length > 1 ? 's' : ''} active in {symbol}
                                </span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {data.smart_broker_activity.map(a => {
                                    const isNet = a.net_qty >= 0;
                                    return (
                                        <Link key={a.broker_id} href={`/broker/${a.broker_id}`}>
                                            <div className={cn(
                                                'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] transition-opacity hover:opacity-70',
                                                isNet
                                                    ? 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                                                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700',
                                            )}>
                                                <span className={isNet ? 'text-emerald-500' : 'text-rose-500'}>
                                                    {isNet ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                                                </span>
                                                <span className="text-slate-600 dark:text-slate-300">#{a.broker_id}</span>
                                                <span className="text-slate-400">·</span>
                                                <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                                                    {isNet ? '+' : ''}{formatNepaliNumber(a.net_qty)}
                                                </span>
                                            </div>
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* ── Daily flow chart ─────────────────────────────────── */}
                    {data.daily_flow.length > 1 && (
                        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card/30 overflow-hidden">
                            <div className="flex items-center gap-2 px-4 pt-4 pb-1">
                                <Activity className="w-3.5 h-3.5 text-slate-400" />
                                <span className="text-[10px] text-slate-400 uppercase tracking-wider">Daily Volume & Avg Price</span>
                                <div className="ml-auto flex items-center gap-4 text-[10px] text-slate-400">
                                    <span className="flex items-center gap-1.5">
                                        <span className="w-2.5 h-2.5 rounded-sm bg-indigo-400/60 inline-block" />Volume
                                    </span>
                                    <span className="flex items-center gap-1.5">
                                        <span className="w-2.5 h-0.5 bg-amber-400 inline-block" />Avg Price
                                    </span>
                                </div>
                            </div>
                            <ReactECharts option={chartOption} style={{ height: '200px' }} opts={{ renderer: 'svg' }} />
                        </div>
                    )}

                    {/* ── Buyers / Sellers ─────────────────────────────────── */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                            <div className="px-4 py-2.5 border-b border-border dark:border-slate-800 bg-slate-50 dark:bg-card flex items-center justify-between">
                                <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">Top Buyers</span>
                                <span className="text-[10px] text-slate-400">{data.top_buyers.length} brokers</span>
                            </div>
                            <div className="py-1">
                                {data.top_buyers.length === 0
                                    ? <p className="text-xs text-slate-400 py-8 text-center">No data</p>
                                    : data.top_buyers.map((b, i) => (
                                        <BrokerBarRow key={b.broker_id} rank={i + 1} broker_id={b.broker_id}
                                            qty={b.buy_qty} amount={b.buy_amount} pct={b.pct}
                                            maxQty={maxBuyQty} dir="buy" />
                                    ))}
                            </div>
                        </div>

                        <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                            <div className="px-4 py-2.5 border-b border-border dark:border-slate-800 bg-slate-50 dark:bg-card flex items-center justify-between">
                                <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">Top Sellers</span>
                                <span className="text-[10px] text-slate-400">{data.top_sellers.length} brokers</span>
                            </div>
                            <div className="py-1">
                                {data.top_sellers.length === 0
                                    ? <p className="text-xs text-slate-400 py-8 text-center">No data</p>
                                    : data.top_sellers.map((s, i) => (
                                        <BrokerBarRow key={s.broker_id} rank={i + 1} broker_id={s.broker_id}
                                            qty={s.sell_qty} amount={s.sell_amount} pct={s.pct}
                                            maxQty={maxSellQty} dir="sell" />
                                    ))}
                            </div>
                        </div>
                    </div>

                    {/* ── Net positions ─────────────────────────────────────── */}
                    {(data.net_accumulators.length > 0 || data.net_distributors.length > 0) && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {data.net_accumulators.length > 0 && (
                                <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                                    <div className="px-4 py-2.5 border-b border-border dark:border-slate-800 bg-slate-50 dark:bg-card flex items-center gap-2">
                                        <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" />
                                        <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">Net Accumulators</span>
                                    </div>
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="border-b border-border dark:border-slate-800">
                                                {['Broker', 'Bought', 'Sold', 'Net'].map(h => (
                                                    <th key={h} className="px-4 py-2 text-left text-[9px] text-slate-400 uppercase tracking-wider">{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
                                            {data.net_accumulators.map(a => (
                                                <tr key={a.broker_id} className="hover:bg-accent hover:text-accent-foreground transition-colors">
                                                    <td className="px-4 py-2.5">
                                                        <Link href={`/broker/${a.broker_id}`}>
                                                            <span className="text-[11px] text-slate-600 dark:text-slate-300 hover:underline">#{a.broker_id}</span>
                                                        </Link>
                                                    </td>
                                                    <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300 tabular-nums">{formatNepaliNumber(a.buy_qty)}</td>
                                                    <td className="px-4 py-2.5 text-slate-400 tabular-nums">{formatNepaliNumber(a.sell_qty)}</td>
                                                    <td className="px-4 py-2.5 tabular-nums">
                                                        <span className="text-emerald-600 dark:text-emerald-400">+{formatNepaliNumber(a.net_qty)}</span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {data.net_distributors.length > 0 && (
                                <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                                    <div className="px-4 py-2.5 border-b border-border dark:border-slate-800 bg-slate-50 dark:bg-card flex items-center gap-2">
                                        <ArrowDownRight className="w-3.5 h-3.5 text-rose-500" />
                                        <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">Net Distributors</span>
                                    </div>
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="border-b border-border dark:border-slate-800">
                                                {['Broker', 'Bought', 'Sold', 'Net'].map(h => (
                                                    <th key={h} className="px-4 py-2 text-left text-[9px] text-slate-400 uppercase tracking-wider">{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
                                            {data.net_distributors.map(d => (
                                                <tr key={d.broker_id} className="hover:bg-accent hover:text-accent-foreground transition-colors">
                                                    <td className="px-4 py-2.5">
                                                        <Link href={`/broker/${d.broker_id}`}>
                                                            <span className="text-[11px] text-slate-600 dark:text-slate-300 hover:underline">#{d.broker_id}</span>
                                                        </Link>
                                                    </td>
                                                    <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300 tabular-nums">{formatNepaliNumber(d.buy_qty)}</td>
                                                    <td className="px-4 py-2.5 text-slate-400 tabular-nums">{formatNepaliNumber(d.sell_qty)}</td>
                                                    <td className="px-4 py-2.5 tabular-nums">
                                                        <span className="text-rose-600 dark:text-rose-400">{formatNepaliNumber(d.net_qty)}</span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
