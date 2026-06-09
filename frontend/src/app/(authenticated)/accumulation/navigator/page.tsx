'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
    Loader2,
    Activity
} from 'lucide-react';
import ReactECharts from 'echarts-for-react';
import { CompanySelect } from '@/components/CompanySelect';
import { cn } from '@/lib/utils';
import { AggressiveTrader } from '@/types/accumulation';

const timeRanges = [
    { label: '1D', value: '1D' },
    { label: '1W', value: '1W' },
    { label: '2W', value: '2W' },
    { label: '1M', value: '1M' },
    { label: '3M', value: '3M' },
    { label: '6M', value: '6M' },
    { label: '1Y', value: '1Y' },
    { label: '1Y+', value: 'ALL' },
];

export default function NavigatorPage() {
    const [selectedGraphSymbol, setSelectedGraphSymbol] = useState('');
    const [range, setRange] = useState('1W');
    const [graphData, setGraphData] = useState<any[]>([]);
    const [topBrokers, setTopBrokers] = useState<string[]>([]);
    const [buyLeaders, setBuyLeaders] = useState<AggressiveTrader[]>([]);
    const [sellLeaders, setSellLeaders] = useState<AggressiveTrader[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!selectedGraphSymbol) return;

        const fetchGraphData = async () => {
            setLoading(true);
            try {
                const res = await api.get(`/api/stocks/companies/brokers_graph/?symbol=${selectedGraphSymbol}&range=${range}`);
                setGraphData(res.data.history || []);
                setTopBrokers(res.data.top_brokers || []);
                setBuyLeaders(res.data.buy_leaders || []);
                setSellLeaders(res.data.sell_leaders || []);
            } catch (err) {
                console.error('Failed to fetch graph data', err);
            } finally {
                setLoading(false);
            }
        };
        fetchGraphData();
    }, [selectedGraphSymbol, range]);

    const getGraphOption = () => {
        if (!graphData.length) return {};
        const brokerNames = topBrokers.map(b => `Broker ${b}`);

        return {
            tooltip: {
                trigger: 'axis',
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                borderRadius: 8,
                padding: 10,
                textStyle: { color: '#1f2937', fontSize: 12 },
                extraCssText: 'box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); border: none;'
            },
            legend: {
                data: brokerNames,
                bottom: 0,
                icon: 'circle',
                itemGap: 15,
                textStyle: { color: '#4b5563', fontSize: 12 }
            },
            grid: { left: '3%', right: '4%', bottom: '10%', top: '5%', containLabel: true },
            xAxis: {
                type: 'category',
                boundaryGap: false,
                data: graphData.map(d => d.date),
                axisLine: { lineStyle: { color: '#e5e7eb' } },
                axisLabel: { color: '#6b7280', fontSize: 10 }
            },
            yAxis: {
                type: 'value',
                name: 'Price (रू)',
                splitLine: { lineStyle: { color: '#f3f4f6' } },
                axisLabel: {
                    color: '#6b7280',
                    fontSize: 10,
                    formatter: (val: number) => val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val
                }
            },
            series: topBrokers.map((broker, idx) => ({
                name: `Broker ${broker}`,
                type: 'line',
                data: graphData.map(d => d[broker]),
                smooth: true,
                showSymbol: false,
                lineStyle: { width: 2 },
                itemStyle: { color: `hsl(${idx * 45 + 210}, 80%, 50%)` }
            }))
        };
    };

    const getAggressiveGraphOption = (type: 'buy' | 'sell') => {
        const leaders = type === 'buy' ? buyLeaders : sellLeaders;
        if (!leaders.length) return {};

        const isAll = selectedGraphSymbol === 'All';
        const valueKey = isAll ? 'net_amt' : 'net_qty';
        const color = type === 'buy' ? '#16a34a' : '#dc2626';
        const title = type === 'buy'
            ? `Top Aggressive Buyers (${isAll ? 'Net Amt' : 'Net Qty'})`
            : `Top Aggressive Sellers (${isAll ? 'Net Amt' : 'Net Qty'})`;

        return {
            title: { text: title, left: 'center', textStyle: { fontSize: 14, color: '#374151', fontWeight: 'bold' } },
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                borderRadius: 8,
                padding: 12,
                textStyle: { color: '#1f2937', fontSize: 12 },
                formatter: (params: any) => {
                    const item = params[0];
                    const data = leaders[item.dataIndex];
                    return `
                        <div class="font-bold mb-1 border-b pb-1">Broker ${data.broker}</div>
                        <div class="flex justify-between gap-4 py-1">
                            <span class="text-gray-500">${isAll ? 'Net Amt:' : 'Net Qty:'}</span>
                            <span class="font-mono font-bold ${type === 'buy' ? 'text-green-600' : 'text-red-600'}">
                                ${isAll ? 'रू ' : ''}${(((data as any)[valueKey] ?? 0) > 0 ? '+' : '') + ((data as any)[valueKey] ?? 0).toLocaleString()}
                            </span>
                        </div>
                        <div class="flex justify-between gap-4 py-1">
                            <span class="text-gray-500">Avg Rate:</span>
                            <span class="font-mono font-bold text-gray-900">रू ${type === 'buy' ? data.buy_rate : data.sell_rate}</span>
                        </div>
                    `;
                }
            },
            grid: { left: '3%', right: '4%', bottom: '3%', top: '15%', containLabel: true },
            xAxis: { type: 'value', axisLabel: { show: false }, splitLine: { show: false } },
            yAxis: {
                type: 'category',
                data: leaders.map(v => `Br.${v.broker}`),
                axisTick: { alignWithLabel: true },
                axisLabel: { color: '#6b7280', fontSize: 10 },
                inverse: true
            },
            series: [{
                name: 'Net Qty',
                type: 'bar',
                barWidth: '60%',
                data: leaders.map(v => Math.abs((v as any)[valueKey] ?? 0)),
                itemStyle: { color: color, borderRadius: [0, 4, 4, 0] },
                label: {
                    show: true,
                    position: 'right',
                    formatter: (p: any) => {
                        const val = (leaders[p.dataIndex] as any)[valueKey] ?? 0;
                        return isAll ? `रू ${(Math.abs(val) / 10000000).toFixed(2)} Cr` : val.toLocaleString();
                    },
                    fontSize: 10,
                    fontWeight: 'bold',
                    color: color
                }
            }]
        };
    };

    return (
        <div className="space-y-6 lg:space-y-8 min-h-screen">
            <div className="bg-white dark:bg-card rounded-2xl border border-slate-200 dark:border-border shadow-sm overflow-hidden">
                <div className="p-4 md:p-6 border-b border-slate-200 dark:border-border bg-slate-50/50 dark:bg-muted flex flex-col xl:flex-row justify-between items-stretch xl:items-center gap-6 sticky top-0 z-20">
                    <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4">
                        <div className="bg-white dark:bg-card p-1 rounded-xl border border-slate-200 dark:border-border shadow-inner flex overflow-x-auto no-scrollbar">
                            {timeRanges.map((t) => (
                                <button
                                    key={t.value}
                                    onClick={() => setRange(t.value)}
                                    className={cn(
                                        "px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-300 tracking-tighter whitespace-nowrap",
                                        range === t.value
                                            ? "bg-slate-900 dark:bg-indigo-600 text-white shadow-lg"
                                            : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                    )}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                        <div className="h-4 w-px bg-slate-200 dark:bg-white/10 hidden md:block" />
                        <div className="flex-grow lg:w-64">
                            <CompanySelect
                                value={selectedGraphSymbol}
                                onChange={(val) => setSelectedGraphSymbol(val)}
                                className="h-10 w-full rounded-xl bg-white dark:bg-card border-slate-200 dark:border-border shadow-none focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-indigo-500/20 transition-all font-bold text-sm"
                            />
                        </div>
                    </div>
                </div>

            {!selectedGraphSymbol ? (
                <div className="p-20 text-center flex flex-col items-center gap-4">
                    <div className="w-16 h-16 bg-blue-50 dark:bg-indigo-900/30 text-blue-400 dark:text-indigo-400 rounded-full flex items-center justify-center">
                        <Activity className="w-8 h-8" />
                    </div>
                    <p className="text-slate-500 dark:text-slate-400 font-medium">Select a company to analyze accumulators and aggressive traders</p>
                </div>
            ) : loading ? (
                <div className="flex flex-col items-center justify-center p-20 space-y-4">
                    <Loader2 className="w-10 h-10 text-blue-500 dark:text-indigo-400 animate-spin" />
                    <p className="text-slate-500 dark:text-slate-400 font-medium tracking-wide">Fetching accumulation data...</p>
                </div>
            ) : (
                <div className="space-y-6">
                    <div className="bg-white dark:bg-slate-950/50 rounded-xl border dark:border-slate-800/50 shadow-sm h-[45vh] flex flex-col">
                        <div className="p-4 border-b dark:border-slate-800 bg-white dark:bg-card/80 rounded-t-xl">
                            <h3 className="text-lg font-bold text-gray-800 dark:text-slate-100">Accumulation Trend</h3>
                        </div>
                        <div className="flex-1 p-4 min-h-0">
                            {graphData.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center space-y-4 text-gray-400 dark:text-slate-500">
                                    <p className="font-medium">No data found for {selectedGraphSymbol}</p>
                                </div>
                            ) : (
                                <ReactECharts option={getGraphOption()} style={{ height: '100%', width: '100%' }} notMerge={true} />
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-white dark:bg-slate-950/50 rounded-xl border dark:border-slate-800/50 shadow-sm h-[50vh] flex flex-col">
                            <div className="p-4 border-b dark:border-slate-800 bg-green-50/50 dark:bg-emerald-900/10 rounded-t-xl">
                                <h3 className="text-lg font-bold text-green-800 dark:text-emerald-400">Aggressive Buying Pressure</h3>
                            </div>
                            <div className="flex-1 p-4 min-h-0">
                                {buyLeaders.length === 0 ? (
                                    <div className="h-full flex items-center justify-center text-gray-400 dark:text-slate-500">No buying pressure detected</div>
                                ) : (
                                    <ReactECharts option={getAggressiveGraphOption('buy')} style={{ height: '100%', width: '100%' }} notMerge={true} />
                                )}
                            </div>
                        </div>
                        <div className="bg-white dark:bg-slate-950/50 rounded-xl border dark:border-slate-800/50 shadow-sm h-[50vh] flex flex-col">
                            <div className="p-4 border-b dark:border-slate-800 bg-red-50/50 dark:bg-rose-900/10 rounded-t-xl">
                                <h3 className="text-lg font-bold text-red-800 dark:text-rose-400">Aggressive Selling Pressure</h3>
                            </div>
                            <div className="flex-1 p-4 min-h-0">
                                {sellLeaders.length === 0 ? (
                                    <div className="h-full flex items-center justify-center text-gray-400 dark:text-slate-500">No selling pressure detected</div>
                                ) : (
                                    <ReactECharts option={getAggressiveGraphOption('sell')} style={{ height: '100%', width: '100%' }} notMerge={true} />
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
            </div>
        </div>
    );
}
