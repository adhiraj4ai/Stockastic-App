'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';
import api from '@/lib/api';
import ReactECharts from 'echarts-for-react';

interface BrokerAnalysisProps {
    symbol: string;
}

interface AggressiveTrader {
    broker: string;
    net_qty: number;
    buy_qty: number;
    sell_qty: number;
    buy_rate: number;
    sell_rate: number;
    net_amt?: number;
}

export function BrokerAnalysis({ symbol }: BrokerAnalysisProps) {
    const [range, setRange] = useState('1M');
    const [loading, setLoading] = useState(true);
    const [graphData, setGraphData] = useState<any[]>([]);
    const [topBrokers, setTopBrokers] = useState<string[]>([]);
    const [buyLeaders, setBuyLeaders] = useState<AggressiveTrader[]>([]);
    const [sellLeaders, setSellLeaders] = useState<AggressiveTrader[]>([]);
    const [error, setError] = useState('');

    const timeRanges = [
        { label: '1D', value: '1D' },
        { label: '1W', value: '1W' },
        { label: '2W', value: '2W' },
        { label: '1M', value: '1M' },
        { label: '3M', value: '3M' },
    ];

    useEffect(() => {
        fetchData();
    }, [symbol, range]);

    const fetchData = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await api.get('/api/stocks/companies/brokers_graph/', {
                params: { symbol, range }
            });
            setGraphData(res.data.data);
            setTopBrokers(res.data.brokers || []);
            setBuyLeaders(res.data.buy_leaders || []);
            setSellLeaders(res.data.sell_leaders || []);
        } catch (err) {
            console.error('Failed to fetch broker analysis', err);
            setError('Failed to load broker data');
        } finally {
            setLoading(false);
        }
    };

    const getAccumulationGraphOption = () => {
        if (!graphData.length) return {};

        const brokerNames = topBrokers.map(b => `Broker ${b}`);

        return {
            tooltip: {
                trigger: 'axis',
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                borderRadius: 8,
                padding: 10,
                textStyle: { color: '#1f2937', fontSize: 12 },
                extraCssText: 'box-shadow: 0 4px 12px rgba(0,0,0,0.1); border: none;'
            },
            legend: {
                data: brokerNames,
                bottom: 0,
                icon: 'circle',
                itemGap: 15,
                textStyle: { color: '#6b7280', fontSize: 11 }
            },
            grid: {
                left: '2%',
                right: '3%',
                bottom: '10%',
                top: '5%',
                containLabel: true
            },
            xAxis: {
                type: 'category',
                boundaryGap: false,
                data: graphData.map(d => d.date),
                axisLine: { lineStyle: { color: '#e5e7eb' } },
                axisLabel: { color: '#9ca3af', fontSize: 10 }
            },
            yAxis: {
                type: 'value',
                splitLine: { lineStyle: { color: '#f3f4f6' } },
                axisLabel: {
                    color: '#9ca3af',
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
                itemStyle: { color: `hsl(${idx * 55 + 200}, 85%, 55%)` },
                areaStyle: {
                    opacity: 0.1,
                    color: `hsl(${idx * 55 + 200}, 85%, 55%)`
                }
            }))
        };
    };

    const getAggressiveGraphOption = (type: 'buy' | 'sell') => {
        const leaders = type === 'buy' ? buyLeaders : sellLeaders;
        if (!leaders.length) return {};

        const valueKey = 'net_qty'; // Always net_qty based on user request scope, but consistent with accumulation logic
        const color = type === 'buy' ? '#10b981' : '#ef4444'; // Emerald-500 vs Red-500
        const title = type === 'buy' ? 'Top Aggressive Buyers' : 'Top Aggressive Sellers';

        return {
            title: {
                text: title,
                left: 'center',
                textStyle: { fontSize: 13, color: '#6b7280', fontWeight: 600 }
            },
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                borderRadius: 8,
                padding: 12,
                textStyle: { color: '#1f2937', fontSize: 12 },
                extraCssText: 'box-shadow: 0 4px 12px rgba(0,0,0,0.1); border: none;',
                formatter: (params: any) => {
                    const item = params[0];
                    const data = leaders[item.dataIndex];
                    return `
                        <div class="font-bold mb-1 border-b pb-1 text-slate-700">Broker ${data.broker}</div>
                        <div class="flex justify-between gap-4 py-1">
                            <span class="text-gray-500">Net Qty:</span>
                            <span class="font-mono font-bold ${type === 'buy' ? 'text-emerald-600' : 'text-red-600'}">
                                ${((data as any)[valueKey] ?? 0) > 0 ? '+' : ''}${((data as any)[valueKey] ?? 0).toLocaleString()}
                            </span>
                        </div>
                        <div class="flex justify-between gap-4 py-1">
                            <span class="text-gray-500">Avg Rate:</span>
                            <span class="font-mono font-bold text-gray-700">Rs. ${type === 'buy' ? data.buy_rate : data.sell_rate}</span>
                        </div>
                        <div class="flex justify-between gap-4 py-1 text-xs">
                            <span class="text-gray-400">Total Vol:</span>
                            <span class="font-mono text-gray-500">${(data.buy_qty + data.sell_qty).toLocaleString()}</span>
                        </div>
                    `;
                }
            },
            grid: {
                left: '2%',
                right: '5%',
                bottom: '3%',
                top: '15%',
                containLabel: true
            },
            xAxis: {
                type: 'value',
                axisLabel: { show: false },
                splitLine: { show: false }
            },
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
                itemStyle: {
                    color: color,
                    borderRadius: [0, 4, 4, 0]
                },
                label: {
                    show: true,
                    position: 'right',
                    formatter: (p: any) => {
                        return (leaders[p.dataIndex] as any)[valueKey]?.toLocaleString() ?? '';
                    },
                    fontSize: 10,
                    fontWeight: 'bold',
                    color: color
                }
            }]
        };
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-blue-500" />
                        Broker Forensics
                    </h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Analyze institutional accumulation and aggressive trading</p>
                </div>
                <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                    {timeRanges.map((t) => (
                        <button
                            key={t.value}
                            onClick={() => setRange(t.value)}
                            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${range === t.value
                                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm transform scale-105'
                                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                                }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="h-[400px] flex flex-col items-center justify-center text-slate-400">
                    <Loader2 className="w-8 h-8 animate-spin mb-2 text-blue-500" />
                    <span className="text-sm font-medium">Analyzing broker data...</span>
                </div>
            ) : error ? (
                <div className="h-[200px] flex flex-col items-center justify-center text-red-500 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-100 dark:border-red-900/30">
                    <p>{error}</p>
                    <Button variant="outline" size="sm" onClick={fetchData} className="mt-2">
                        <RefreshCw className="w-4 h-4 mr-2" /> Retry
                    </Button>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Top Accumulators Graph */}
                    <Card className="lg:col-span-2 border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base font-bold text-slate-700 dark:text-slate-200">Top Accumulators Trend</CardTitle>
                            <CardDescription>Net position history of top 5 buyers in selected period</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[350px] w-full">
                                {graphData.length > 0 ? (
                                    <ReactECharts option={getAccumulationGraphOption()} style={{ height: '100%', width: '100%' }} />
                                ) : (
                                    <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                                        No accumulation trend data available for this range.
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Aggressive Buyers */}
                    <Card className="border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
                        <CardContent className="pt-6">
                            <div className="h-[400px] w-full">
                                {buyLeaders.length > 0 ? (
                                    <ReactECharts option={getAggressiveGraphOption('buy')} style={{ height: '100%', width: '100%' }} />
                                ) : (
                                    <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                                        No aggressive buying activity found.
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Aggressive Sellers */}
                    <Card className="border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
                        <CardContent className="pt-6">
                            <div className="h-[400px] w-full">
                                {sellLeaders.length > 0 ? (
                                    <ReactECharts option={getAggressiveGraphOption('sell')} style={{ height: '100%', width: '100%' }} />
                                ) : (
                                    <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                                        No aggressive selling activity found.
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}

export default BrokerAnalysis;
