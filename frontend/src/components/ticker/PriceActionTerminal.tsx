'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useTheme } from 'next-themes';
import api from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Activity, CandlestickChart, BarChart2, TrendingUp, TrendingDown, Clock, Info, Zap } from 'lucide-react';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import ReactECharts from 'echarts-for-react';

interface Pattern {
    name: string;
    sentiment: string;
    desc?: string;
    win_rate?: string;
}

interface SMCEvent {
    type: string;
    sentiment: string;
    desc: string;
    tag?: string;
}

interface PriceActionDay {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    body_size: number;
    shape_desc: string;
    volume_desc: string;
    patterns: Pattern[];
    smc_events?: SMCEvent[];
    sentiment: string;
}

interface Zone {
    type: string;
    yAxis0: number;
    yAxis1: number;
    desc: string;
}

interface PriceActionData {
    ticker: string;
    period: string;
    zones?: Zone[];
    history: PriceActionDay[];
}

interface PriceActionTerminalProps {
    symbol: string;
}

export function PriceActionTerminal({ symbol }: PriceActionTerminalProps) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const [data, setData] = useState<PriceActionData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [grouping, setGrouping] = useState(1);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await api.get(`/api/stocks/price-action/${symbol}/?grouping=${grouping}`);
                setData(res.data);
            } catch (err: any) {
                setError(err?.response?.data?.error || 'Failed to load Price Action data');
            } finally {
                setLoading(false);
            }
        };

        if (symbol) {
            fetchData();
        }
    }, [symbol, grouping]);

    // Build chart options
    const chartOptions = useMemo(() => {
        if (!data || data.history.length === 0) return {};

        // ECharts expects oldest to newest
        const historyCopy = [...data.history].reverse();
        
        const categoryData = historyCopy.map(d => new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        // ECharts candlestick format: [open, close, lowest, highest]
        const values = historyCopy.map(d => [d.open, d.close, d.low, d.high]);
        const volumes = historyCopy.map((d, idx) => [idx, d.volume, d.close > d.open ? 1 : -1]);

        // SMC MarkPoints
        const markPoints: any[] = [];
        historyCopy.forEach((d, idx) => {
            if (d.smc_events) {
                d.smc_events.forEach(ev => {
                    if (ev.type === 'FVG' && ev.sentiment === 'BULLISH') {
                        markPoints.push({
                            coord: [idx, d.low],
                            symbol: 'path://M0,10 L5,0 L10,10 Z',
                            symbolSize: 12,
                            itemStyle: { color: '#8b5cf6' }, // Violet
                            label: { show: false },
                            name: 'Bullish FVG',
                            tooltip: { show: true, formatter: 'Bullish FVG Created' }
                        });
                    }
                    if (ev.type === 'FVG' && ev.sentiment === 'BEARISH') {
                        markPoints.push({
                            coord: [idx, d.high],
                            symbol: 'path://M0,0 L5,10 L10,0 Z',
                            symbolSize: 12,
                            itemStyle: { color: '#ec4899' }, // Pink
                            label: { show: false },
                            name: 'Bearish FVG',
                            tooltip: { show: true, formatter: 'Bearish FVG Created' }
                        });
                    }
                    if (ev.type === 'BOS' && ev.sentiment === 'BULLISH') {
                        markPoints.push({
                            coord: [idx, d.high],
                            symbol: 'pin',
                            symbolSize: 30,
                            itemStyle: { color: '#10b981' },
                            name: 'Bullish BoS',
                            label: { show: true, formatter: 'BoS', fontSize: 8 },
                            tooltip: { show: true, formatter: 'Bullish Break of Structure' }
                        });
                    }
                    if (ev.type === 'BOS' && ev.sentiment === 'BEARISH') {
                        markPoints.push({
                            coord: [idx, d.low],
                            symbol: 'pin',
                            symbolSize: 30,
                            itemStyle: { color: '#f43f5e' },
                            name: 'Bearish BoS',
                            label: { show: true, formatter: 'BoS', fontSize: 8 },
                            tooltip: { show: true, formatter: 'Bearish Break of Structure' }
                        });
                    }
                    if (ev.type === 'SNIPER') {
                        markPoints.push({
                            coord: [idx, d.low * 0.995],
                            symbol: 'diamond',
                            symbolSize: 20,
                            itemStyle: { color: '#f59e0b', shadowBlur: 10, shadowColor: '#fcd34d' }, // Glowing amber
                            name: 'Sniper Confluence',
                            label: { show: false },
                            tooltip: { show: true, trigger: 'item', formatter: ev.desc || 'Sniper Setup' }
                        });
                    }
                });
            }
        });

        const markArea = {
            itemStyle: { opacity: 0.15 },
            label: { show: true, position: 'insideRight', color: isDark ? '#f8fafc' : '#0f172a', opacity: 0.7, fontSize: 10 },
            data: data.zones ? data.zones.map(z => [
                {
                    name: z.type + " Zone\n" + (z.type === 'Supply' ? 'Resistance' : 'Support'),
                    yAxis: z.yAxis0,
                    itemStyle: { color: z.type === 'Supply' ? '#ef4444' : '#22c55e' },
                    tooltip: { formatter: z.desc, show: true }
                },
                { yAxis: z.yAxis1 }
            ]) : []
        };

        const upColor = isDark ? '#10b981' : '#059669';
        const downColor = isDark ? '#f43f5e' : '#e11d48';

        return {
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'cross' },
                backgroundColor: isDark ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.9)',
                borderColor: isDark ? '#334155' : '#e2e8f0',
                textStyle: { color: isDark ? '#f8fafc' : '#0f172a' }
            },
            grid: [
                { left: '3%', right: '3%', top: '5%', height: '65%' },
                { left: '3%', right: '3%', top: '75%', height: '20%' }
            ],
            xAxis: [
                {
                    type: 'category',
                    data: categoryData,
                    boundaryGap: true,
                    axisLine: { onZero: false, lineStyle: { color: isDark ? '#334155' : '#e2e8f0' } },
                    splitLine: { show: false },
                    axisLabel: { color: isDark ? '#94a3b8' : '#64748b' }
                },
                {
                    type: 'category',
                    gridIndex: 1,
                    data: categoryData,
                    axisLabel: { show: false },
                    splitLine: { show: false },
                    axisLine: { show: false },
                    axisTick: { show: false }
                }
            ],
            yAxis: [
                {
                    scale: true,
                    splitLine: { show: true, lineStyle: { color: isDark ? '#334155' : '#e2e8f0', type: 'dashed', opacity: 0.5 } },
                    axisLabel: { color: isDark ? '#94a3b8' : '#64748b' }
                },
                {
                    gridIndex: 1,
                    splitLine: { show: false },
                    axisLine: { show: false },
                    axisLabel: { show: false },
                    axisTick: { show: false }
                }
            ],
            dataZoom: [
                {
                    type: 'inside',
                    xAxisIndex: [0, 1],
                    start: 60,
                    end: 100
                },
                {
                    show: true,
                    type: 'slider',
                    xAxisIndex: [0, 1],
                    top: '95%',
                    start: 60,
                    end: 100
                }
            ],
            series: [
                {
                    name: 'Price Action',
                    type: 'candlestick',
                    data: values,
                    itemStyle: {
                        color: upColor,
                        color0: downColor,
                        borderColor: upColor,
                        borderColor0: downColor
                    },
                    markPoint: {
                        data: markPoints
                    },
                    markArea: markArea
                },
                {
                    name: 'Volume',
                    type: 'bar',
                    xAxisIndex: 1,
                    yAxisIndex: 1,
                    data: volumes.map((item) => {
                        return {
                            value: item[1],
                            itemStyle: { color: item[2] === 1 ? upColor : downColor, opacity: 0.6 }
                        };
                    })
                }
            ]
        };
    }, [data, isDark]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="flex flex-col items-center gap-3">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
                    <p className="text-sm font-semibold text-slate-500">Analyzing Smart Money Concepts & PA...</p>
                </div>
            </div>
        );
    }

    if (error || !data || data.history.length === 0) {
        return (
            <div className="glass-card-light dark:bg-slate-900 rounded-3xl p-12 text-center border border-slate-200 dark:border-slate-800">
                <Activity className="mx-auto mb-4 text-slate-300 dark:text-slate-600" size={48} />
                <p className="text-slate-400 dark:text-slate-500 font-semibold">{error || 'No price action data available for this timeframe'}</p>
            </div>
        );
    }

    const latest = data.history[0];
    const topPatterns = latest.patterns.slice(0, 3); // Top 3 to avoid clutter

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header & Controls */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-900/20 dark:to-violet-900/20 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800 shadow-sm">
                        <CandlestickChart size={20} />
                    </div>
                    <div>
                        <h4 className="font-bold text-slate-800 dark:text-slate-100 text-lg flex items-center">
                            Institutional Price Action
                            <InfoTooltip content="Advanced daily candlestick anatomy, Smart Money Concepts (FVG, BoS), and 60+ algorithmic pattern recognition overlays." />
                        </h4>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">SMC & Candlestick Mapping</p>
                    </div>
                </div>
                <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 shadow-inner">
                    <Button variant="ghost" size="sm" onClick={() => setGrouping(1)} className={cn("px-3 h-7 text-xs font-bold transition-all", grouping === 1 ? "bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-400" : "text-slate-500 hover:text-slate-700 dark:text-slate-400")}>1D</Button>
                    <Button variant="ghost" size="sm" onClick={() => setGrouping(2)} className={cn("px-3 h-7 text-xs font-bold transition-all", grouping === 2 ? "bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-400" : "text-slate-500 hover:text-slate-700 dark:text-slate-400")}>2D</Button>
                    <Button variant="ghost" size="sm" onClick={() => setGrouping(3)} className={cn("px-3 h-7 text-xs font-bold transition-all", grouping === 3 ? "bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-400" : "text-slate-500 hover:text-slate-700 dark:text-slate-400")}>3D</Button>
                    <Button variant="ghost" size="sm" onClick={() => setGrouping(5)} className={cn("px-3 h-7 text-xs font-bold transition-all", grouping === 5 ? "bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-400" : "text-slate-500 hover:text-slate-700 dark:text-slate-400")}>1W</Button>
                </div>
            </div>

            {/* Interactive Chart Container */}
            <div className="glass-card-light dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden bg-gradient-to-br from-white to-slate-50/50 dark:from-slate-900 dark:to-slate-900/50">
                <div className="flex items-center justify-between mb-4">
                    <h5 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                        <Activity size={14} /> Structural Map
                    </h5>
                    <div className="flex gap-4">
                        <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500"><span className="w-2 h-2 rounded-full bg-violet-500"></span> FVG</span>
                        <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500"><span className="w-2 h-2 rounded-full bg-rose-500"></span> BoS</span>
                        <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500"><span className="w-2 h-2 rounded-full bg-amber-500"></span> Sniper</span>
                    </div>
                </div>
                
                <div className="h-[600px] w-full">
                    <ReactECharts 
                        option={chartOptions} 
                        style={{ height: '100%', width: '100%' }}
                        theme={isDark ? 'dark' : 'light'}
                        opts={{ renderer: 'canvas' }}
                    />
                </div>
            </div>

            {/* Analytical Feed & Latest Session */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Left: Latest Session Detail */}
                <div className="lg:col-span-1 space-y-4">
                    <div className="glass-card-light dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
                        <h5 className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-4 uppercase tracking-wider">Latest Session Breakdown</h5>
                        
                        <div className="space-y-5">
                            <div>
                                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase flex items-center gap-1.5 mb-1">
                                    Anatomy & Structure
                                </p>
                                <p className="font-bold text-sm text-slate-800 dark:text-slate-200">{latest.shape_desc}</p>
                            </div>
                            
                            <div>
                                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase flex items-center gap-1.5 mb-1">
                                    Volume Interpretation
                                </p>
                                <p className={cn(
                                    "font-bold text-sm",
                                    latest.volume_desc.includes('High') ? "text-indigo-600 dark:text-indigo-400" : "text-slate-800 dark:text-slate-200"
                                )}>
                                    {latest.volume_desc}
                                </p>
                            </div>
                            
                            {(topPatterns.length > 0 || (latest.smc_events && latest.smc_events.length > 0)) && (
                                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                                    <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-2">Detected Algorithms</p>
                                    <div className="flex flex-col gap-2">
                                        {latest.smc_events?.map((ev, i) => (
                                            <div key={`smc-${i}`} className="flex items-center gap-1">
                                                <Badge className={cn(
                                                    "w-fit px-2 py-1 text-[10px] border-none font-bold",
                                                    ev.type === 'FVG' ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400" :
                                                    ev.type === 'SNIPER' ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 shadow-sm" :
                                                    "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
                                                )}>
                                                    <Zap size={10} className="mr-1 inline" /> {ev.tag || ev.desc}
                                                </Badge>
                                                <InfoTooltip content={ev.desc} />
                                            </div>
                                        ))}
                                        {topPatterns.map((p, idx) => (
                                            <div key={`pat-${idx}`} className="flex items-center gap-1">
                                                <Badge className={cn(
                                                    "w-fit px-2 py-0.5 text-[10px] border-none",
                                                    p.sentiment === 'BULLISH' 
                                                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" 
                                                        : "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
                                                )}>
                                                    {p.name}
                                                </Badge>
                                                <InfoTooltip content={(p as any).desc || `${p.name} recognized.`} />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right: Chronological Feed */}
                <div className="lg:col-span-2 glass-card-light dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm max-h-[500px] overflow-y-auto custom-scrollbar">
                    <div className="flex items-center gap-3 mb-6 sticky top-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm pb-2 z-10">
                        <Clock size={16} className="text-slate-400" />
                        <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 uppercase tracking-wider">Chronological Log</h4>
                    </div>

                    <div className="space-y-2">
                        {data.history.map((day, idx) => {
                            const isUp = day.close >= day.open;
                            const hasSMC = day.smc_events && day.smc_events.length > 0;
                            const hasPatterns = day.patterns.length > 0;
                            
                            return (
                                <div key={idx} className={cn(
                                    "flex flex-col md:flex-row md:items-center gap-4 p-3 rounded-xl transition-colors border",
                                    hasSMC ? "border-violet-100 dark:border-violet-900/30 bg-violet-50/30 dark:bg-violet-900/10" : "border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                                )}>
                                    
                                    <div className="w-16 shrink-0 text-center">
                                        <p className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400">
                                            {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                        </p>
                                    </div>
                                    
                                    <div className="flex items-center justify-center w-8 shrink-0">
                                        <div className={cn(
                                            "p-1.5 rounded-full",
                                            isUp ? "bg-emerald-50 text-emerald-500 dark:bg-emerald-900/20 dark:text-emerald-400" : "bg-rose-50 text-rose-500 dark:bg-rose-900/20 dark:text-rose-400"
                                        )}>
                                            {isUp ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                                        </div>
                                    </div>
                                    
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap mb-1">
                                            <span className="font-bold text-xs text-slate-800 dark:text-slate-200">
                                                {day.shape_desc}
                                            </span>
                                            
                                            {day.smc_events?.map((ev, i) => (
                                                <div key={`smcev-${i}`} className="flex items-center gap-0.5 group relative">
                                                    <Badge className={cn(
                                                        "text-[9px] px-1.5 py-0 h-4 border-none font-bold cursor-help",
                                                        ev.type === 'FVG' ? "bg-violet-100 text-violet-700" :
                                                        ev.type === 'SNIPER' ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"
                                                    )} title={ev.desc}>
                                                        {ev.type}
                                                    </Badge>
                                                </div>
                                            ))}
                                            
                                            {/* Only show up to 2 patterns to keep it clean */}
                                            {day.patterns.slice(0, 2).map((p, i) => (
                                                <div key={`pt-${i}`} className="flex items-center gap-0.5">
                                                    <Badge variant="outline" className={cn(
                                                        "text-[9px] px-1.5 py-0 h-4 border-none cursor-help",
                                                        p.sentiment === 'BULLISH' 
                                                            ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400" 
                                                            : "bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400"
                                                    )} title={(p as any).desc}>
                                                        {p.name}
                                                    </Badge>
                                                </div>
                                            ))}
                                            {day.patterns.length > 2 && (
                                                <span className="text-[9px] text-slate-400 font-bold">+{day.patterns.length - 2}</span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3 text-[10px] font-medium text-slate-500 dark:text-slate-400">
                                            <span className="font-mono">
                                                <span className="text-slate-400">O:</span> {day.open.toLocaleString()} 
                                                <span className="mx-1 text-slate-300">•</span> 
                                                <span className="text-slate-400">C:</span> <span className={isUp ? "text-emerald-500" : "text-rose-500"}>{day.close.toLocaleString()}</span>
                                            </span>
                                            <span className={cn(
                                                "w-1 h-1 rounded-full",
                                                day.volume_desc.includes('High') ? "bg-indigo-400" : "bg-slate-300 dark:bg-slate-700"
                                            )}></span>
                                            <span className={cn(
                                                "",
                                                day.volume_desc.includes('High') && "text-indigo-500 font-bold"
                                            )}>
                                                {day.volume_desc}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

            </div>
        </div>
    );
}

export default PriceActionTerminal;
