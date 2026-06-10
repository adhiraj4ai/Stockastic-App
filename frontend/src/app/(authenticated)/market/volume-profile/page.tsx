'use client';

import React, { useEffect, useState, useMemo } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import api from '@/lib/api';
import { Card } from '@/components/ui/card';
import { CompanySelect } from '@/components/CompanySelect';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { 
    BarChart3, 
    TrendingUp, 
    Activity, 
    Target, 
    Layers, 
    Calendar,
    ChevronRight,
    Search,
    AlertCircle
} from 'lucide-react';
import ReactECharts from 'echarts-for-react';
import { cn } from '@/lib/utils';

interface ProfileBar {
    price: number;
    volume: number;
    is_poc: boolean;
    is_val: boolean;
}

interface VolumeProfileData {
    symbol: string;
    total_volume: number;
    poc: number;
    val: number;
    vah: number;
    bars: ProfileBar[];
    stats: {
        min_price: number;
        max_price: number;
        avg_price: number;
        trade_count: number;
    };
}

const RANGES = [
    { label: '1W', value: '1W' },
    { label: '2W', value: '2W' },
    { label: '1M', value: '1M' },
    { label: '3M', value: '3M' },
    { label: '6M', value: '6M' },
    { label: '1Y', value: '1Y' },
    { label: 'ALL', value: 'ALL' },
];

export default function VolumeProfilePage() {
    const [symbol, setSymbol] = useState<string>('');
    const [range, setRange] = useState<string>('1M');
    const [data, setData] = useState<VolumeProfileData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchData = async (sym: string, rng: string) => {
        if (!sym) return;
        setLoading(true);
        setError(null);
        try {
            const res = await api.get(`/api/stocks/market/volume-profile/?symbol=${sym}&range=${rng}`);
            setData(res.data);
        } catch (err: any) {
            console.error("Error fetching volume profile:", err);
            setError(err.response?.data?.error || "Failed to load volume profile data.");
            setData(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (symbol) {
            fetchData(symbol, range);
        }
    }, [symbol, range]);

    const chartOption = useMemo(() => {
        if (!data) return {};

        const prices = data.bars.map(b => b.price);
        const volumes = data.bars.map(b => b.volume);
        
        return {
            backgroundColor: 'transparent',
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
                formatter: (params: any) => {
                    const bar = data.bars[params[0].dataIndex];
                    return `
                        <div style="padding: 10px; border-radius: 8px; font-family: sans-serif;">
                            <div style="font-size: 10px; font-weight: 900; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px;">Price Level</div>
                            <div style="font-size: 16px; font-weight: 900; color: #1e293b;">Rs ${bar.price.toLocaleString()}</div>
                            <div style="margin-top: 8px; height: 1px; background: #e2e8f0;"></div>
                            <div style="margin-top: 8px; display: flex; align-items: center; justify-between; gap: 20px;">
                                <span style="font-size: 11px; font-weight: 700; color: #64748b;">Volume:</span>
                                <span style="font-size: 11px; font-weight: 900; color: #0f172a;">${bar.volume.toLocaleString()}</span>
                            </div>
                            ${bar.is_poc ? '<div style="margin-top: 4px; font-size: 10px; font-weight: 900; color: #6366f1;">★ POINT OF CONTROL</div>' : ''}
                            ${bar.is_val ? '<div style="margin-top: 4px; font-size: 10px; font-weight: 900; color: #2dd4bf;">● VALUE AREA</div>' : ''}
                        </div>
                    `;
                }
            },
            grid: {
                left: '20',
                right: '40',
                bottom: '10',
                top: '20',
                containLabel: true
            },
            xAxis: {
                type: 'value',
                show: false,
                splitLine: { show: false }
            },
            yAxis: {
                type: 'category',
                data: prices,
                axisLabel: {
                    color: '#64748b',
                    fontWeight: '900',
                    fontSize: 10,
                    formatter: (val: number) => `Rs ${val}`
                },
                axisLine: { lineStyle: { color: 'rgba(100, 116, 139, 0.1)' } },
                axisTick: { show: false }
            },
            series: [{
                name: 'Volume',
                id: 'volume-series', // Added id for better reference if needed
                type: 'bar',
                data: volumes.map((v, i) => {
                    const bar = data.bars[i];
                    let color = 'rgba(99, 102, 241, 0.2)'; // Default light indigo
                    
                    if (bar.is_poc) color = '#6366f1'; // Solid indigo for POC
                    else if (bar.is_val) color = 'rgba(45, 212, 191, 0.6)'; // Solid teal for VA
                    
                    return {
                        value: v,
                        itemStyle: {
                            color: color,
                            borderRadius: [0, 4, 4, 0]
                        }
                    };
                }),
                barWidth: '80%',
                emphasis: {
                    itemStyle: {
                        color: (params: any) => {
                            const bar = data.bars[params.dataIndex];
                            return bar.is_poc ? '#4f46e5' : '#14b8a6';
                        }
                    }
                }
            }]
        };
    }, [data]);

    return (
        <DashboardLayout
            title="Volume Profile Intelligence"
            subtitle="Analyze the most significant price levels where institutional volume is concentrated."
        >
            <div className="space-y-6">
                
                {/* Controls Card */}
                <Card className="p-4 bg-white dark:bg-card border-slate-200 dark:border-slate-800 shadow-sm overflow-visible">
                    <div className="flex flex-col md:flex-row items-center gap-4">
                        <div className="w-full md:w-80">
                            <label className="text-[10px] font-semibold uppercase text-slate-400 mb-1.5 block">Search Symbol</label>
                            <CompanySelect 
                                onChange={(val) => setSymbol(val)} 
                                className="w-full h-11"
                            />
                        </div>
                        
                        <div className="h-10 w-px bg-slate-100 dark:bg-muted hidden md:block mx-2" />
                        
                        <div className="w-full md:w-auto">
                            <label className="text-[10px] font-semibold uppercase text-slate-400 mb-1.5 block">Time Horizon</label>
                            <div className="bg-slate-50 dark:bg-slate-800/50 p-1 rounded-xl border border-border dark:border-border flex gap-1">
                                {RANGES.map(r => (
                                    <button
                                        key={r.value}
                                        onClick={() => setRange(r.value)}
                                        className={cn(
                                            "px-4 py-1.5 rounded-lg text-xs font-semibold transition-all",
                                            range === r.value 
                                                ? "bg-slate-900 dark:bg-indigo-600 text-white shadow-sm" 
                                                : "text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-white/5"
                                        )}
                                    >
                                        {r.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </Card>

                {!symbol ? (
                    <div className="py-24 text-center">
                        <div className="mx-auto w-20 h-20 bg-slate-50 dark:bg-slate-800/50 rounded-full flex items-center justify-center text-slate-300 dark:text-slate-600 mb-6 border border-dashed border-slate-200 dark:border-slate-700">
                            <Search size={32} />
                        </div>
                        <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Select a Ticker</h3>
                        <p className="text-slate-500 max-w-sm mx-auto mt-2 text-sm font-medium">Search for any active stock to begin analyzing its horizontal volume distribution.</p>
                    </div>
                ) : loading ? (
                    <div className="py-24 text-center">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500 mx-auto mb-6"></div>
                        <h3 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Aggregating Floorsheet Data...</h3>
                        <p className="text-slate-500 mt-2 text-sm font-medium">Crunching transaction quantities across all price levels for {symbol}.</p>
                    </div>
                ) : error ? (
                    <div className="py-16 text-center border-2 border-dashed border-border dark:border-slate-800 rounded-xl">
                        <AlertCircle className="mx-auto h-12 w-12 text-rose-500 mb-4" />
                        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{error}</h3>
                        <Button onClick={() => setSymbol('')} variant="link" className="mt-2 font-semibold text-indigo-500">Try another symbol</Button>
                    </div>
                ) : data && (
                    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                        
                        {/* Summary Stats */}
                        <div className="xl:col-span-3 space-y-4">
                            <Card className={cn(
                                "p-6 border-none shadow-xl flex flex-col gap-4 relative overflow-hidden",
                                "bg-primary text-primary-foreground hover:opacity-90 text-white"
                            )}>
                                <div className="absolute -right-4 -top-4 opacity-10">
                                    <Target size={120} />
                                </div>
                                <div className="flex items-center gap-2">
                                    <Badge className="bg-white/20 text-white border-none font-semibold text-[10px] tracking-wider px-2 py-0.5">POI</Badge>
                                    <span className="text-xs font-semibold uppercase tracking-wider opacity-70">Point of Control</span>
                                </div>
                                <div>
                                    <h2 className="text-4xl font-semibold tracking-tight">Rs {data.poc.toLocaleString()}</h2>
                                    <p className="text-xs font-medium opacity-70 mt-1">Price level with maximum volume.</p>
                                </div>
                                <div className="mt-4 pt-4 border-t border-white/10 space-y-3">
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] font-semibold uppercase opacity-60">Value Area</span>
                                        <span className="text-xs font-semibold">Rs {data.val} - Rs {data.vah}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] font-semibold uppercase opacity-60">Total Trades</span>
                                        <span className="text-xs font-semibold">{data.stats.trade_count.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] font-semibold uppercase opacity-60">Total volume</span>
                                        <span className="text-xs font-semibold">{(data.total_volume / 1000000).toFixed(2)}M units</span>
                                    </div>
                                </div>
                            </Card>

                            <Card className="p-5 bg-white dark:bg-card border-slate-200 dark:border-slate-800 shadow-sm">
                                <div className="flex items-center gap-2 mb-4">
                                    <Layers className="w-4 h-4 text-indigo-500" />
                                    <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Trade Distribution</h4>
                                </div>
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                                        <div>
                                            <p className="text-[10px] font-semibold text-slate-400 uppercase">Avg Execution</p>
                                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Rs {data.stats.avg_price.toFixed(2)}</p>
                                        </div>
                                        <div className="h-8 w-8 rounded-lg bg-white dark:bg-slate-800 flex items-center justify-center text-indigo-500 shadow-sm border border-border dark:border-border">
                                            <Activity size={16} />
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                                        <div>
                                            <p className="text-[10px] font-semibold text-slate-400 uppercase">Range High/Low</p>
                                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Rs {data.stats.max_price} / {data.stats.min_price}</p>
                                        </div>
                                        <div className="h-8 w-8 rounded-lg bg-white dark:bg-slate-800 flex items-center justify-center text-teal-500 shadow-sm border border-border dark:border-border">
                                            <BarChart3 size={16} />
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-6">
                                    <div className="p-4 bg-indigo-50/50 dark:bg-indigo-900/10 rounded-xl border border-indigo-100 dark:border-indigo-900/20">
                                        <div className="flex gap-2">
                                            <InfoTooltip 
                                                content="The Point of Control (POC) represents the 'fair price' where the most substantial liquidity was found. The Value Area encapsulates 70% of the movement, showing where the majority of market participants agreed on value."
                                            />
                                            <p className="text-[10px] font-bold text-indigo-700 dark:text-indigo-400 leading-relaxed uppercase tracking-tight">Institutional Agreement Zone is highlighted in Teal.</p>
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        </div>

                        {/* Main Profile Chart */}
                        <div className="xl:col-span-9">
                            <Card className="p-6 bg-white dark:bg-card border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col h-full min-h-[700px]">
                                <div className="flex items-center justify-between mb-8">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-xl bg-slate-900 dark:bg-white flex items-center justify-center text-white dark:text-slate-900">
                                            <BarChart3 size={20} />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-semibold text-slate-900 dark:text-white leading-tight">{symbol} Volume Profile</h3>
                                            <div className="flex items-center gap-2 text-xs text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                                                <Calendar size={12} />
                                                <span>Aggregate trades since {range}</span>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-4">
                                        <div className="hidden sm:flex items-center gap-2">
                                            <div className="w-3 h-3 rounded-sm bg-indigo-500" />
                                            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-tighter">POC</span>
                                        </div>
                                        <div className="hidden sm:flex items-center gap-2">
                                             <div className="w-3 h-3 rounded-sm bg-teal-400" />
                                             <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-tighter">Value Area</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex-1 w-full relative">
                                    <ReactECharts 
                                        option={chartOption} 
                                        style={{ height: '100%', width: '100%' }}
                                        notMerge={true}
                                    />
                                </div>
                            </Card>
                        </div>
                    </div>
                )}

            </div>
        </DashboardLayout>
    );
}
