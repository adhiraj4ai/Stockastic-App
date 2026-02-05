'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart3, Maximize2, Settings2 } from 'lucide-react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import { cn } from '@/lib/utils';

interface AdvancedChartingProps {
    history: any[];
    ticker: string;
    fundamental?: any;
}

export function AdvancedCharting({ history, ticker, fundamental }: AdvancedChartingProps) {
    const [timeframe, setTimeframe] = useState('1M');

    const filteredHistory = useMemo(() => {
        if (!history?.length) return [];
        const sorted = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        if (timeframe === 'ALL') return sorted;

        const now = new Date();
        const filterDate = new Date();
        if (timeframe === '1D') filterDate.setDate(now.getDate() - 1);
        else if (timeframe === '1W') filterDate.setDate(now.getDate() - 7);
        else if (timeframe === '1M') filterDate.setMonth(now.getMonth() - 1);
        else if (timeframe === '3M') filterDate.setMonth(now.getMonth() - 3);
        else if (timeframe === '1Y') filterDate.setFullYear(now.getFullYear() - 1);

        return sorted.filter(item => new Date(item.date) >= filterDate);
    }, [history, timeframe]);

    if (!filteredHistory.length) return null;

    const stats = [
        { label: 'Market Cap', value: fundamental?.market_cap ? `Rs. ${(fundamental.market_cap / 10000000).toFixed(2)} Cr` : 'N/A' },
        { label: 'Listed Date', value: fundamental?.listed_date || 'N/A' },
        { label: 'Shares Out.', value: fundamental?.shares_outstanding?.toLocaleString() || 'N/A' },
        { label: 'Public Shares', value: fundamental?.public_shares?.toLocaleString() || 'N/A' },
        { label: 'Free Float Cap', value: fundamental?.free_float_market_cap ? `Rs. ${(fundamental.free_float_market_cap / 10000000).toFixed(2)} Cr` : 'N/A' },
        { label: 'PBV Ratio', value: fundamental?.fundamental_indicators?.find((i: any) => i.name === 'PBV')?.value || 'N/A' },
        { label: 'PE Ratio', value: fundamental?.pe_ratio || 'N/A' },
        { label: 'Div Yield', value: `${fundamental?.dividend_yield || '0'}%` }
    ];

    const dates = filteredHistory.map(item => item.date);
    const data = filteredHistory.map(item => [item.open, item.close, item.low, item.high]);
    const volumes = filteredHistory.map((item, index) => [index, item.volume, item.close > item.open ? 1 : -1]);

    const option = {
        backgroundColor: 'transparent',
        animation: true,
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'cross', lineStyle: { color: '#cbd5e1', width: 1 } },
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            borderWidth: 1,
            borderColor: '#f1f5f9',
            padding: [10, 15],
            textStyle: { color: '#1e293b', fontSize: 12 },
            formatter: (params: any) => {
                const p = params[0];
                const d = filteredHistory[p.dataIndex];
                if (!d) return '';
                return `
                    <div style="font-weight: 700; color: #64748b; margin-bottom: 5px; border-bottom: 1px solid #f1f5f9; padding-bottom: 3px;">${p.name}</div>
                    <div style="display: flex; flex-direction: column; gap: 3px;">
                        <div style="display: flex; justify-content: space-between; gap: 20px;">
                            <span style="color: #94a3b8; font-weight: 700;">OPEN</span>
                            <span style="font-family: monospace; font-weight: 800;">${d.open.toLocaleString()}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span style="color: #94a3b8; font-weight: 700;">CLOSE</span>
                            <span style="font-family: monospace; font-weight: 800; color: ${d.close >= d.open ? '#10b981' : '#ef4444'}">${d.close.toLocaleString()}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span style="color: #94a3b8; font-weight: 700;">HIGH</span>
                            <span style="font-family: monospace; font-weight: 800;">${d.high.toLocaleString()}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span style="color: #94a3b8; font-weight: 700;">LOW</span>
                            <span style="font-family: monospace; font-weight: 800;">${d.low.toLocaleString()}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-top: 3px; border-top: 1px solid #f8fafc; padding-top: 3px;">
                            <span style="color: #94a3b8; font-weight: 700;">VOLUME</span>
                            <span style="font-family: monospace; font-weight: 800;">${d.volume.toLocaleString()}</span>
                        </div>
                    </div>
                `;
            }
        },
        grid: [
            { left: '40', right: '40', top: '40', height: '60%' },
            { left: '40', right: '40', top: '72%', height: '18%' }
        ],
        xAxis: [
            {
                type: 'category',
                data: dates,
                boundaryGap: false,
                axisLine: { lineStyle: { color: '#f1f5f9' } },
                axisLabel: { color: '#94a3b8', fontWeight: 600, fontSize: 10 },
                splitLine: { show: false }
            },
            {
                type: 'category',
                gridIndex: 1,
                data: dates,
                boundaryGap: false,
                axisLine: { show: false },
                axisLabel: { show: false },
                axisTick: { show: false },
                splitLine: { show: false }
            }
        ],
        yAxis: [
            {
                scale: true,
                axisLine: { show: false },
                axisLabel: { color: '#94a3b8', fontWeight: 600, fontSize: 10, margin: 10 },
                splitLine: { lineStyle: { color: '#f8fafc', type: 'dashed' } },
                position: 'right'
            },
            {
                gridIndex: 1,
                axisLabel: { show: false },
                axisLine: { show: false },
                axisTick: { show: false },
                splitLine: { show: false }
            }
        ],
        dataZoom: [
            { type: 'inside', xAxisIndex: [0, 1], start: 70, end: 100 },
            {
                show: true,
                type: 'slider',
                top: '94%',
                height: 20,
                xAxisIndex: [0, 1],
                start: 70,
                end: 100,
                handleIcon: 'path://M-1.5,0.5c0-0.6,0.5-1,1-1h1c0.6,0,1,0.5,1,1v4c0,0.6-0.5,1-1,1h-1c-0.6,0-1-0.5-1-1V0.5z',
                handleSize: '80%',
                dataBackground: { lineStyle: { color: '#cbd5e1' }, areaStyle: { color: '#f1f5f9' } },
                selectedDataBackground: { lineStyle: { color: '#334155' }, areaStyle: { color: '#94a3b8' } },
                fillerColor: 'rgba(203, 213, 225, 0.3)',
                borderColor: '#f1f5f9'
            }
        ],
        series: [
            {
                name: ticker,
                type: 'candlestick',
                data: data,
                itemStyle: {
                    color: '#10b981',
                    color0: '#ef4444',
                    borderColor: '#10b981',
                    borderColor0: '#ef4444',
                    borderWidth: 1
                }
            },
            {
                name: 'Volume',
                type: 'bar',
                xAxisIndex: 1,
                yAxisIndex: 1,
                data: volumes,
                itemStyle: {
                    color: (params: any) => params.data[2] > 0 ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'
                }
            }
        ]
    };

    return (
        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex flex-row items-center justify-between bg-slate-50/30">
                <div className="space-y-1">
                    <CardTitle className="text-[10px] font-bold text-slate-500 flex items-center gap-2">
                        <BarChart3 size={14} className="text-blue-500" />
                        Price Action & Volume Profile
                    </CardTitle>
                    <div className="flex gap-1">
                        {['1D', '1W', '1M', '3M', '1Y', 'ALL'].map(t => (
                            <Badge
                                key={t}
                                variant="outline"
                                onClick={() => setTimeframe(t)}
                                className={cn(
                                    "text-[9px] font-bold px-2 py-0 border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors uppercase",
                                    t === timeframe ? "bg-slate-900 text-white border-slate-900" : "text-slate-400 bg-transparent"
                                )}
                            >
                                {t}
                            </Badge>
                        ))}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg border border-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer transition-colors">
                        <Settings2 size={16} />
                    </div>
                    <div className="p-2 rounded-lg border border-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer transition-colors">
                        <Maximize2 size={16} />
                    </div>
                </div>
            </div>
            <CardContent className="p-0">
                <div className="h-[600px] w-full">
                    <ReactECharts option={option} style={{ height: '100%', width: '100%' }} />
                </div>
                {/* Integrated Stats Grid */}
                {fundamental && (
                    <div className="px-6 py-6 border-t border-slate-100 bg-slate-50/10">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-12 gap-y-6">
                            {stats.map((item, idx) => (
                                <div key={idx} className="space-y-1">
                                    <p className="text-[9px] font-bold text-slate-400">{item.label}</p>
                                    <p className="text-sm font-bold text-slate-900 tabular-nums">{item.value}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
