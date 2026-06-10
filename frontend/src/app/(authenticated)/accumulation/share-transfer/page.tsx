'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    Activity,
    BarChart2,
    ArrowRight,
    Loader2,
    Calendar as CalendarIcon,
    Layers,
    History,
    TrendingUp
} from 'lucide-react';
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { formatNepaliNumber, formatRupees } from "@/lib/formatters";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import nextDynamic from 'next/dynamic';
import { CompanySelect } from '@/components/CompanySelect';

const ReactECharts = nextDynamic(() => import('echarts-for-react'), { ssr: false });

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

export default function ShareTransferPage() {
    const [selectedSymbol, setSelectedSymbol] = useState('');
    const [transferBroker1, setTransferBroker1] = useState('');
    const [transferBroker2, setTransferBroker2] = useState('');
    const [transferStartDate, setTransferStartDate] = useState<Date>();
    const [transferEndDate, setTransferEndDate] = useState<Date>();
    const [range, setRange] = useState('1M');
    const [transferData, setTransferData] = useState<any>(null);
    const [transferLoading, setTransferLoading] = useState(false);
    const [allBrokers, setAllBrokers] = useState<string[]>([]);
    const [useCustomRange, setUseCustomRange] = useState(false);

    useEffect(() => {
        const fetchBrokers = async () => {
            try {
                const res = await api.get('/api/stocks/companies/accumulation_brokers/');
                setAllBrokers(res.data);
            } catch (err) {
                console.error('Failed to fetch brokers', err);
            }
        };
        fetchBrokers();
    }, []);

    const fetchTransferData = async () => {
        if (!selectedSymbol || !transferBroker1 || !transferBroker2) return;
        setTransferLoading(true);
        try {
            const params: any = {
                symbol: selectedSymbol,
                broker1: transferBroker1,
                broker2: transferBroker2,
            };

            if (useCustomRange) {
                if (transferStartDate) params.start_date = format(transferStartDate, 'yyyy-MM-dd');
                if (transferEndDate) params.end_date = format(transferEndDate, 'yyyy-MM-dd');
            } else {
                params.range = range;
            }

            const res = await api.get('/api/stocks/floorsheet/broker_transfer/', { params });
            setTransferData(res.data);
        } catch (err) {
            console.error('Failed to fetch transfer data', err);
        } finally {
            setTransferLoading(false);
        }
    };

    // Auto-fetch when range or brokers change (if not in custom mode)
    useEffect(() => {
        if (!useCustomRange && selectedSymbol && transferBroker1 && transferBroker2) {
            fetchTransferData();
        }
    }, [range, selectedSymbol, transferBroker1, transferBroker2, useCustomRange]);

    const getTransferChartOption = () => {
        if (!transferData || !transferData.daily_stats.length) return {};
        return {
            tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
            legend: {
                data: [`B${transferBroker1} → B${transferBroker2}`, `B${transferBroker2} → B${transferBroker1}`],
                textStyle: { color: '#6b7280', fontSize: 10 },
                top: 0
            },
            grid: { left: '3%', right: '4%', bottom: '3%', top: '15%', containLabel: true },
            xAxis: {
                type: 'category',
                data: transferData.daily_stats.map((d: any) => d.transaction_date),
                axisLabel: { color: '#6b7280', fontSize: 10 }
            },
            yAxis: { type: 'value', axisLabel: { color: '#6b7280', fontSize: 10 } },
            series: [
                {
                    name: `B${transferBroker1} → B${transferBroker2}`,
                    type: 'bar',
                    stack: 'total',
                    data: transferData.daily_stats.map((d: any) => d.volume_1_to_2 || 0),
                    itemStyle: { color: '#3b82f6', borderRadius: [4, 4, 0, 0] }
                },
                {
                    name: `B${transferBroker2} → B${transferBroker1}`,
                    type: 'bar',
                    stack: 'total',
                    data: transferData.daily_stats.map((d: any) => d.volume_2_to_1 || 0),
                    itemStyle: { color: '#8b5cf6', borderRadius: [4, 4, 0, 0] }
                }
            ]
        };
    };

    const getComparisonChartOption = () => {
        if (!transferData || !transferData.daily_stats.length) return {};
        const dates = transferData.daily_stats.map((d: any) => d.transaction_date);
        const transferVol = transferData.daily_stats.map((d: any) => (d.volume_1_to_2 || 0) + (d.volume_2_to_1 || 0));
        const netAcc = transferData.daily_stats.map((d: any) => d.net_accumulation || 0);

        return {
            tooltip: { trigger: 'axis' },
            legend: { data: ['Total Transfer Vol', 'Symbol Net Accumulation'], textStyle: { color: '#6b7280', fontSize: 10 }, top: 0 },
            grid: { left: '3%', right: '4%', bottom: '3%', top: '15%', containLabel: true },
            xAxis: { type: 'category', data: dates, axisLabel: { color: '#6b7280', fontSize: 10 } },
            yAxis: { type: 'value', axisLabel: { color: '#6b7280', fontSize: 10 } },
            series: [
                {
                    name: 'Total Transfer Vol',
                    type: 'bar',
                    data: transferVol,
                    itemStyle: { color: '#3b82f6', opacity: 0.8 }
                },
                {
                    name: 'Symbol Net Accumulation',
                    type: 'line',
                    data: netAcc,
                    smooth: true,
                    symbol: 'circle',
                    symbolSize: 6,
                    itemStyle: { color: '#10b981' },
                    lineStyle: { width: 3 }
                }
            ]
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
                                    onClick={() => {
                                        setRange(t.value);
                                        setUseCustomRange(false);
                                    }}
                                    className={cn(
                                        "px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-300 tracking-tighter whitespace-nowrap",
                                        (!useCustomRange && range === t.value)
                                            ? "bg-orange-500 text-white shadow"
                                            : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                    )}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                        <div className="h-4 w-px bg-slate-200 dark:bg-white/10 hidden md:block" />
                        <div className="flex gap-2">
                             <div className="w-24 bg-white dark:bg-card p-1.5 rounded-xl border border-slate-200 dark:border-border shadow-none">
                                <select 
                                    value={transferBroker1} 
                                    onChange={(e) => setTransferBroker1(e.target.value)} 
                                    className="bg-transparent border-none text-[10px] font-semibold text-blue-700 dark:text-indigo-400 outline-none pr-4 w-full"
                                >
                                    <option value="">BR. 1</option>
                                    {allBrokers.map(b => <option key={b} value={b}>{b}</option>)}
                                </select>
                            </div>
                            <div className="w-24 bg-white dark:bg-card p-1.5 rounded-xl border border-slate-200 dark:border-border shadow-none">
                                <select 
                                    value={transferBroker2} 
                                    onChange={(e) => setTransferBroker2(e.target.value)} 
                                    className="bg-transparent border-none text-[10px] font-semibold text-blue-700 dark:text-indigo-400 outline-none pr-4 w-full"
                                >
                                    <option value="">BR. 2</option>
                                    {allBrokers.map(b => <option key={b} value={b}>{b}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="h-4 w-px bg-slate-200 dark:bg-white/10 hidden md:block" />
                        <div className="flex-grow lg:w-64">
                            <CompanySelect 
                                value={selectedSymbol} 
                                onChange={setSelectedSymbol} 
                                className="h-10 w-full rounded-xl bg-white dark:bg-card border-slate-200 dark:border-border shadow-none focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-indigo-500/20 transition-all font-bold text-sm" 
                            />
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                         <Popover>
                                <PopoverTrigger asChild>
                                    <Button 
                                        variant="outline" 
                                        onClick={() => setUseCustomRange(true)}
                                        className={cn(
                                            "h-10 justify-start font-bold rounded-xl border-slate-200 dark:border-border bg-white dark:bg-card transition-all text-xs", 
                                            useCustomRange ? "ring-2 ring-blue-500/20 border-blue-500/50" : "text-slate-400"
                                        )}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4 text-blue-500" />
                                        {transferStartDate ? format(transferStartDate, "MMM dd") : "Start"} - {transferEndDate ? format(transferEndDate, "MMM dd") : "End"}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0 rounded-2xl border-slate-200 dark:border-border shadow-sm" align="end">
                                    <div className="p-4 bg-slate-50 dark:bg-card flex gap-4 divide-x dark:divide-white/5">
                                        <div className="space-y-2">
                                            <p className="text-[10px] font-semibold text-slate-400 px-2 uppercase tracking-wider">Start Date</p>
                                            <Calendar mode="single" selected={transferStartDate} onSelect={setTransferStartDate} initialFocus />
                                        </div>
                                        <div className="space-y-2 pl-4">
                                            <p className="text-[10px] font-semibold text-slate-400 px-2 uppercase tracking-wider">End Date</p>
                                            <Calendar mode="single" selected={transferEndDate} onSelect={setTransferEndDate} initialFocus />
                                        </div>
                                    </div>
                                    <div className="p-3 border-t dark:border-border bg-white dark:bg-slate-950 flex justify-end">
                                        <Button size="sm" onClick={fetchTransferData} className="bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg px-6">Apply Custom</Button>
                                    </div>
                                </PopoverContent>
                            </Popover>
                    </div>
                </div>

            {!transferData && !transferLoading && (
                <div className="p-20 text-center flex flex-col items-center gap-4 bg-white dark:bg-card">
                    <div className="p-4 bg-blue-50 dark:bg-indigo-900/20 rounded-full"><Layers className="w-8 h-8 text-blue-500" /></div>
                    <h3 className="text-lg font-bold text-gray-800 dark:text-slate-200 uppercase tracking-wider">Configure Transfer Query</h3>
                    <p className="text-gray-500 dark:text-slate-400 text-sm max-w-md mx-auto font-medium">Select a ticker and two brokers to analyze their mutual share movements and institutional flows.</p>
                </div>
            )}

            {transferLoading && (
                <div className="p-40 flex flex-col items-center justify-center gap-4">
                    <Loader2 className="w-12 h-12 text-blue-500 animate-spin" /><p className="text-gray-500 dark:text-slate-400 font-bold uppercase tracking-wider text-xs">Processing movement patterns...</p>
                </div>
            )}

            {transferData && (
                <div className="p-6 md:p-8 space-y-8 animate-in fade-in duration-500">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div className="space-y-4">
                            <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.2em] px-1">Flow: Broker {transferBroker1} ← Broker {transferBroker2}</h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="bg-white dark:bg-card p-4 rounded-2xl border border-slate-200 dark:border-border shadow-sm">
                                    <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Vol</p>
                                    <p className="text-xl font-semibold text-slate-900 dark:text-white tracking-tighter">{formatNepaliNumber(transferData.summary.broker1_to_broker2.total_volume)}</p>
                                </div>
                                <div className="bg-white dark:bg-card p-4 rounded-2xl border border-slate-200 dark:border-border shadow-sm">
                                    <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Amt</p>
                                    <p className="text-xl font-semibold text-slate-900 dark:text-white tracking-tighter">{(transferData.summary.broker1_to_broker2.total_amount / 100000).toFixed(1)}L</p>
                                </div>
                                <div className="bg-white dark:bg-card p-4 rounded-2xl border border-slate-200 dark:border-border shadow-sm">
                                    <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Rate</p>
                                    <p className="text-xl font-semibold text-slate-900 dark:text-white tracking-tighter">{formatRupees(transferData.summary.broker1_to_broker2.avg_rate, 0)}</p>
                                </div>
                                <div className="bg-white dark:bg-card p-4 rounded-2xl border border-slate-200 dark:border-border shadow-sm">
                                    <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Txs</p>
                                    <p className="text-xl font-semibold text-slate-900 dark:text-white tracking-tighter">{transferData.summary.broker1_to_broker2.total_transactions}</p>
                                </div>
                            </div>
                        </div>
                        <div className="space-y-4">
                            <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.2em] px-1">Flow: Broker {transferBroker2} ← Broker {transferBroker1}</h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="bg-white dark:bg-card p-4 rounded-2xl border border-slate-200 dark:border-border shadow-sm">
                                    <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Vol</p>
                                    <p className="text-xl font-semibold text-slate-900 dark:text-white tracking-tighter">{formatNepaliNumber(transferData.summary.broker2_to_broker1.total_volume)}</p>
                                </div>
                                <div className="bg-white dark:bg-card p-4 rounded-2xl border border-slate-200 dark:border-border shadow-sm">
                                    <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Amt</p>
                                    <p className="text-xl font-semibold text-slate-900 dark:text-white tracking-tighter">{(transferData.summary.broker2_to_broker1.total_amount / 100000).toFixed(1)}L</p>
                                </div>
                                <div className="bg-white dark:bg-card p-4 rounded-2xl border border-slate-200 dark:border-border shadow-sm">
                                    <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Rate</p>
                                    <p className="text-xl font-semibold text-slate-900 dark:text-white tracking-tighter">{formatRupees(transferData.summary.broker2_to_broker1.avg_rate, 0)}</p>
                                </div>
                                <div className="bg-white dark:bg-card p-4 rounded-2xl border border-slate-200 dark:border-border shadow-sm">
                                    <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">Txs</p>
                                    <p className="text-xl font-semibold text-slate-900 dark:text-white tracking-tighter">{transferData.summary.broker2_to_broker1.total_transactions}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div className="bg-white dark:bg-slate-950/50 rounded-2xl border border-slate-200 dark:border-border shadow-sm h-[380px] p-6 relative group/chart">
                            <div className="absolute top-4 left-6 flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Movement Volume Matrix</span>
                            </div>
                            <ReactECharts option={getTransferChartOption()} style={{ height: '100%', width: '100%' }} notMerge={true} />
                        </div>
                        <div className="bg-white dark:bg-slate-950/50 rounded-2xl border border-slate-200 dark:border-border shadow-sm h-[380px] p-6 relative group/chart">
                            <div className="absolute top-4 left-6 flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Institutional Context Sync</span>
                            </div>
                            <ReactECharts option={getComparisonChartOption()} style={{ height: '100%', width: '100%' }} notMerge={true} />
                        </div>
                    </div>

                    <div className="bg-white dark:bg-slate-950/50 rounded-2xl border border-slate-200 dark:border-border shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-200 dark:border-border bg-slate-50/50 dark:bg-muted">
                            <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2 px-1">
                                <History className="w-3 h-3" /> Historical Aggregated Transfers
                            </h4>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-gray-50/50 dark:bg-slate-800/30 hover:bg-gray-50/50 dark:hover:bg-slate-800/30 border-b border-gray-100 dark:border-slate-800 h-14 transition-all">
                                        <th className="px-6 text-left text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Date</th>
                                        <th className="px-6 text-right text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Price</th>
                                        <th className="px-6 text-right text-[10px] font-semibold text-blue-600 dark:text-indigo-400 uppercase tracking-wider">Mutual Vol</th>
                                        <th className="px-6 text-right text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">B{transferBroker1} Net</th>
                                        <th className="px-6 text-right text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">B{transferBroker2} Net</th>
                                        <th className="px-6 text-right text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Smart Net</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                                    {transferData.aggregated_transfers.map((day: any, i: number) => (
                                        <tr 
                                            key={i} 
                                            className={cn(
                                                "group border-b border-gray-50 dark:border-slate-800 hover:bg-blue-50/30 dark:hover:bg-slate-800/30 last:border-0 transition-all duration-200 cursor-pointer border-l-4 hover:shadow-lg hover:scale-[1.01] hover:-translate-y-0.5",
                                                day.net_accumulation > 0 ? "border-l-emerald-500/50 hover:border-l-emerald-500" : day.net_accumulation < 0 ? "border-l-rose-500/50 hover:border-l-rose-500" : "border-l-transparent hover:border-l-blue-400/50"
                                            )}
                                        >
                                            <td className="px-6 py-4 font-bold text-slate-600 dark:text-slate-400 text-xs">{day.transaction_date}</td>
                                            <td className="px-6 py-4 text-right font-semibold text-slate-900 dark:text-white text-xs">{formatRupees(day.close_price, 0)}</td>
                                            <td className="px-6 py-4 text-right">
                                                <span className="inline-flex h-7 items-center px-3 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-lg text-xs font-semibold ring-1 ring-blue-500/20">
                                                    {formatNepaliNumber((day.volume_1_to_2 || 0) + (day.volume_2_to_1 || 0))}
                                                </span>
                                            </td>
                                            <td className={cn("px-6 py-4 text-right font-semibold text-xs", day.b1_net >= 0 ? 'text-emerald-500' : 'text-rose-500')}>
                                                {day.b1_net > 0 ? '+' : ''}{formatNepaliNumber(day.b1_net)}
                                            </td>
                                            <td className={cn("px-6 py-4 text-right font-semibold text-xs", day.b2_net >= 0 ? 'text-emerald-500' : 'text-rose-500')}>
                                                {day.b2_net > 0 ? '+' : ''}{formatNepaliNumber(day.b2_net)}
                                            </td>
                                            <td className={cn("px-6 py-4 text-right font-semibold text-xs", day.net_accumulation >= 0 ? 'text-blue-500 dark:text-indigo-400' : 'text-rose-400')}>
                                                {day.net_accumulation > 0 ? '+' : ''}{formatNepaliNumber(day.net_accumulation)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
            </div>
        </div>
    );
}
