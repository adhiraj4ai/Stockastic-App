'use client';

import React, { useEffect, useState, useMemo } from 'react';
import api from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
    TrendingUp, TrendingDown, Target, ArrowUpRight, ArrowDownRight,
    Activity, Layers, ChevronUp, ChevronDown, LineChart as LineChartIcon, Table2, Clock
} from 'lucide-react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
    ReferenceLine, ResponsiveContainer
} from 'recharts';

interface FibLevel {
    ratio: number;
    label: string;
    price: number;
    distance_pct: number;
    is_above: boolean;
}

interface FibData {
    ticker: string;
    period: number;
    current_price: number;
    swing_high: number;
    swing_low: number;
    swing_high_date: string;
    swing_low_date: string;
    trend: 'UPTREND' | 'DOWNTREND';
    levels: FibLevel[];
    nearest_support: FibLevel | null;
    nearest_resistance: FibLevel | null;
    growth_potential: number | null;
    fall_risk: number | null;
    max_upside: number | null;
    max_downside: number | null;
    current_zone: {
        lower: string;
        upper: string;
        lower_price: number;
        upper_price: number;
    } | null;
}

interface FibonacciRetracementProps {
    symbol: string;
    history: any[];
    indicators: any[];
}

const PERIODS = [
    { value: 30, label: '30D' },
    { value: 90, label: '90D' },
    { value: 180, label: '180D' },
    { value: 365, label: '1Y' },
    { value: 1825, label: '5Y' },
];

export function FibonacciRetracement({ symbol, history, indicators }: FibonacciRetracementProps) {
    const [data, setData] = useState<FibData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [period, setPeriod] = useState(1825);
    const [historyView, setHistoryView] = useState<'table' | 'graph'>('graph');

    useEffect(() => {
        const fetch = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await api.get(`/api/stocks/fibonacci/${symbol}/?period=${period}`);
                setData(res.data);
            } catch (err: any) {
                setError(err?.response?.data?.error || 'Failed to load Fibonacci data');
            } finally {
                setLoading(false);
            }
        };
        if (symbol) fetch();
    }, [symbol, period]);

    const sortedLevels = useMemo(() => {
        if (!data) return [];
        return [...data.levels].sort((a, b) => b.price - a.price);
    }, [data]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[300px]">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="glass-card-light dark:bg-slate-900 rounded-3xl p-12 text-center border border-slate-200 dark:border-slate-700">
                <Activity className="mx-auto mb-4 text-slate-300 dark:text-slate-600" size={48} />
                <p className="text-slate-400 dark:text-slate-500 font-semibold">{error || 'No data available'}</p>
            </div>
        );
    }

    const priceRange = data.swing_high - data.swing_low;

    // Calculate position percentage of current price within the full range
    const currentPricePct = priceRange > 0
        ? ((data.current_price - data.swing_low) / priceRange) * 100
        : 50;

    return (
        <div className="space-y-8">
            {/* Header with period selector */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-800 shadow-sm">
                        <Target size={20} />
                    </div>
                    <div>
                        <h4 className="font-bold text-slate-800 dark:text-slate-100 text-lg">Fibonacci Retracement</h4>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">Key support & resistance levels</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Badge
                        className={cn(
                            "px-3 py-1 text-xs font-bold border-none",
                            data.trend === 'UPTREND'
                                ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
                                : "bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400"
                        )}
                    >
                        {data.trend === 'UPTREND' ? <TrendingUp size={12} className="mr-1" /> : <TrendingDown size={12} className="mr-1" />}
                        {data.trend}
                    </Badge>
                    <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 shadow-inner">
                        {PERIODS.map(p => (
                            <Button
                                key={p.value}
                                variant="ghost"
                                size="sm"
                                onClick={() => setPeriod(p.value)}
                                className={cn(
                                    "rounded-lg px-3 font-bold text-[10px] transition-all h-7",
                                    period === p.value
                                        ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm"
                                        : "text-slate-400 dark:text-slate-500 hover:text-slate-600"
                                )}
                            >
                                {p.label}
                            </Button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Growth & Fall Potential Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Growth Potential */}
                <div className="glass-card-light dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 relative overflow-hidden group hover:shadow-lg transition-all">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-emerald-100/40 dark:from-emerald-900/10 to-transparent rounded-bl-full" />
                    <div className="relative">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-500 dark:text-emerald-400">
                                <ArrowUpRight size={14} />
                            </div>
                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Next Resistance</span>
                        </div>
                        <div className="text-3xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
                            {data.growth_potential !== null ? `+${data.growth_potential}%` : '—'}
                        </div>
                        <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 font-medium">
                            {data.nearest_resistance
                                ? `${data.nearest_resistance.label} @ Rs. ${data.nearest_resistance.price.toLocaleString()}`
                                : 'At resistance'}
                        </div>
                    </div>
                </div>

                {/* Fall Risk */}
                <div className="glass-card-light dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 relative overflow-hidden group hover:shadow-lg transition-all">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-rose-100/40 dark:from-rose-900/10 to-transparent rounded-bl-full" />
                    <div className="relative">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-900/20 text-rose-500 dark:text-rose-400">
                                <ArrowDownRight size={14} />
                            </div>
                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Next Support</span>
                        </div>
                        <div className="text-3xl font-black text-rose-600 dark:text-rose-400 tracking-tight">
                            {data.fall_risk !== null ? `-${data.fall_risk}%` : '—'}
                        </div>
                        <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 font-medium">
                            {data.nearest_support
                                ? `${data.nearest_support.label} @ Rs. ${data.nearest_support.price.toLocaleString()}`
                                : 'At support'}
                        </div>
                    </div>
                </div>

                {/* Max Upside */}
                <div className="glass-card-light dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 relative overflow-hidden group hover:shadow-lg transition-all">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-blue-100/40 dark:from-blue-900/10 to-transparent rounded-bl-full" />
                    <div className="relative">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-500 dark:text-blue-400">
                                <ChevronUp size={14} />
                            </div>
                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Max Upside</span>
                        </div>
                        <div className="text-3xl font-black text-blue-600 dark:text-blue-400 tracking-tight">
                            {data.max_upside !== null ? `+${data.max_upside}%` : '—'}
                        </div>
                        <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 font-medium">
                            To swing high Rs. {data.swing_high.toLocaleString()}
                        </div>
                    </div>
                </div>

                {/* Max Downside */}
                <div className="glass-card-light dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 relative overflow-hidden group hover:shadow-lg transition-all">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-amber-100/40 dark:from-amber-900/10 to-transparent rounded-bl-full" />
                    <div className="relative">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-500 dark:text-amber-400">
                                <ChevronDown size={14} />
                            </div>
                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Max Downside</span>
                        </div>
                        <div className="text-3xl font-black text-amber-600 dark:text-amber-400 tracking-tight">
                            {data.max_downside !== null ? `-${data.max_downside}%` : '—'}
                        </div>
                        <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 font-medium">
                            To swing low Rs. {data.swing_low.toLocaleString()}
                        </div>
                    </div>
                </div>
            </div>

            {/* Visual Gauge + Levels Table */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Visual Fibonacci Ladder */}
                <div className="lg:col-span-3">
                    <div className="glass-card-light dark:bg-slate-900 rounded-3xl p-8 border border-slate-200 dark:border-slate-700 h-full">
                        <div className="flex items-center gap-3 mb-8">
                            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800">
                                <Layers size={18} />
                            </div>
                            <div>
                                <h4 className="font-bold text-slate-800 dark:text-slate-100">Level Gauge</h4>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">Price position relative to Fibonacci levels</p>
                            </div>
                        </div>

                        <div className="relative py-4">
                            {/* Vertical bar */}
                            <div className="absolute left-[40%] top-0 bottom-0 w-2 bg-gradient-to-b from-emerald-200 via-slate-200 to-rose-200 dark:from-emerald-800 dark:via-slate-700 dark:to-rose-800 rounded-full" />

                            {/* Levels */}
                            <div className="space-y-0">
                                {sortedLevels.map((level, idx) => {
                                    const isCurrentZone = data.current_zone &&
                                        (level.label === data.current_zone.lower || level.label === data.current_zone.upper);
                                    const isAbove = level.price > data.current_price;
                                    const isBelow = level.price < data.current_price;
                                    const isNearest = (data.nearest_support?.label === level.label) ||
                                        (data.nearest_resistance?.label === level.label);

                                    return (
                                        <div key={level.label} className="relative">
                                            <div className={cn(
                                                "flex items-center py-3 px-4 rounded-xl transition-all",
                                                isNearest ? "bg-blue-50/50 dark:bg-blue-900/10" : "",
                                                isCurrentZone ? "bg-amber-50/30 dark:bg-amber-900/10" : ""
                                            )}>
                                                {/* Price */}
                                                <div className="w-[35%] text-right pr-6">
                                                    <span className={cn(
                                                        "font-mono font-bold text-sm",
                                                        isAbove ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                                                    )}>
                                                        Rs. {level.price.toLocaleString()}
                                                    </span>
                                                </div>

                                                {/* Dot on bar */}
                                                <div className="w-[10%] flex justify-center relative">
                                                    <div className={cn(
                                                        "w-4 h-4 rounded-full border-2 z-10 transition-all",
                                                        isNearest
                                                            ? "bg-blue-500 border-blue-300 dark:border-blue-600 shadow-lg shadow-blue-500/30 scale-110"
                                                            : isAbove
                                                                ? "bg-emerald-400 dark:bg-emerald-500 border-emerald-200 dark:border-emerald-700"
                                                                : "bg-rose-400 dark:bg-rose-500 border-rose-200 dark:border-rose-700"
                                                    )} />
                                                </div>

                                                {/* Label + Distance */}
                                                <div className="w-[55%] pl-6">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-slate-700 dark:text-slate-300 text-sm">{level.label}</span>
                                                        {isNearest && (
                                                            <Badge className="text-[8px] px-1.5 py-0 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-none font-bold">
                                                                {isAbove ? 'RESISTANCE' : 'SUPPORT'}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <span className={cn(
                                                        "text-[10px] font-semibold",
                                                        level.distance_pct > 0 ? "text-emerald-500" : "text-rose-500"
                                                    )}>
                                                        {level.distance_pct > 0 ? '+' : ''}{level.distance_pct}% from CMP
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Current Price Marker */}
                                            {idx < sortedLevels.length - 1 &&
                                                sortedLevels[idx].price >= data.current_price &&
                                                sortedLevels[idx + 1].price <= data.current_price && (
                                                    <div className="flex items-center py-2 px-4 my-1">
                                                        <div className="w-[35%] text-right pr-6">
                                                            <span className="font-mono font-black text-blue-600 dark:text-blue-400 text-sm animate-pulse">
                                                                Rs. {data.current_price.toLocaleString()}
                                                            </span>
                                                        </div>
                                                        <div className="w-[10%] flex justify-center relative">
                                                            <div className="w-5 h-5 rounded-full bg-blue-500 border-2 border-blue-300 dark:border-blue-600 z-10 shadow-lg shadow-blue-500/40 ring-4 ring-blue-500/20" />
                                                        </div>
                                                        <div className="w-[55%] pl-6">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-black text-blue-600 dark:text-blue-400 text-sm">CMP</span>
                                                                <Badge className="text-[8px] px-1.5 py-0 bg-blue-500 text-white border-none font-bold animate-pulse">
                                                                    CURRENT
                                                                </Badge>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Current Zone Info */}
                        {data.current_zone && (
                            <div className="mt-6 p-4 rounded-2xl bg-gradient-to-r from-blue-50/50 to-indigo-50/50 dark:from-blue-900/10 dark:to-indigo-900/10 border border-blue-100 dark:border-blue-800/50">
                                <div className="text-[10px] font-bold text-blue-500 dark:text-blue-400 uppercase tracking-wider mb-1">Current Zone</div>
                                <div className="text-sm font-bold text-slate-700 dark:text-slate-300">
                                    Between {data.current_zone.lower} (Rs. {data.current_zone.lower_price.toLocaleString()}) and {data.current_zone.upper} (Rs. {data.current_zone.upper_price.toLocaleString()})
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Historical Price Action */}
                <div className="lg:col-span-9">
                    <div className="glass-card-light dark:bg-slate-900 rounded-3xl p-8 border border-slate-200 dark:border-slate-700 h-full">
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-100 dark:border-slate-700">
                                    <Clock size={18} />
                                </div>
                                <div>
                                    <h4 className="font-bold text-slate-800 dark:text-slate-100">Historical Price Action</h4>
                                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">Ohlcv historical logs</p>
                                </div>
                            </div>
                            <div className="flex bg-slate-100/80 dark:bg-slate-800/80 rounded-lg p-1 gap-1">
                                <button
                                    onClick={() => setHistoryView('graph')}
                                    className={`p-2 rounded-md transition-all flex items-center gap-2 ${historyView === 'graph' ? 'bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400 font-bold' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'}`}
                                >
                                    <LineChartIcon size={16} />
                                    <span className="text-xs">Graph</span>
                                </button>
                                <button
                                    onClick={() => setHistoryView('table')}
                                    className={`p-2 rounded-md transition-all flex items-center gap-2 ${historyView === 'table' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-800 dark:text-slate-100 font-bold' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'}`}
                                >
                                    <Table2 size={16} />
                                    <span className="text-xs">Table</span>
                                </button>
                            </div>
                        </div>

                        {historyView === 'table' ? (
                            <div className="overflow-hidden overflow-y-auto max-h-[500px] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm relative no-scrollbar">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 dark:bg-slate-900 text-slate-400 dark:text-slate-500 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10">
                                        <tr>
                                            <th className="px-6 py-4 font-semibold text-[10px]">Date</th>
                                            <th className="px-6 py-4 font-semibold text-[10px]">Open</th>
                                            <th className="px-6 py-4 font-semibold text-[10px]">High</th>
                                            <th className="px-6 py-4 font-semibold text-[10px]">Low</th>
                                            <th className="px-6 py-4 font-semibold text-[10px]">Close</th>
                                            <th className="px-6 py-4 font-semibold text-[10px] text-right">Volume</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50 dark:divide-slate-800 bg-white/30 dark:bg-slate-950/40">
                                        {[...history]
                                            .filter(row => new Date(row.date) > new Date(Date.now() - 90 * 24 * 60 * 60 * 1000))
                                            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                            .map((row, i) => (
                                                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                                    <td className="px-6 py-4 font-bold text-slate-800 dark:text-slate-100">{row.date}</td>
                                                    <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{row.open}</td>
                                                    <td className="px-6 py-4 text-emerald-600 dark:text-emerald-400 font-medium">{row.high}</td>
                                                    <td className="px-6 py-4 text-rose-600 dark:text-rose-400 font-medium">{row.low}</td>
                                                    <td className="px-6 py-4 font-bold text-slate-900 dark:text-slate-100">{row.close}</td>
                                                    <td className="px-6 py-4 text-right font-mono text-xs text-slate-400 dark:text-slate-500">{row.volume.toLocaleString()}</td>
                                                </tr>
                                            ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="h-[500px] w-full bg-slate-50/50 dark:bg-slate-950/20 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 relative">
                                {(() => {
                                    const historyData = [...history]
                                        .filter(row => new Date(row.date) > new Date(Date.now() - 90 * 24 * 60 * 60 * 1000))
                                        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

                                    // Next 3 resistance levels above CMP (sorted ascending = nearest first)
                                    const resistanceLevels = data.levels
                                        .filter(l => l.is_above)
                                        .sort((a, b) => a.price - b.price)
                                        .slice(0, 3);

                                    // Next 3 support levels below CMP (sorted descending = nearest first)
                                    const supportLevels = data.levels
                                        .filter(l => !l.is_above)
                                        .sort((a, b) => b.price - a.price)
                                        .slice(0, 3);

                                    const current = data.current_price;

                                    const levelPrices = [...resistanceLevels, ...supportLevels].map(l => l.price);
                                    const allValues = [...levelPrices, current, ...historyData.map(d => d.close)].filter(v => typeof v === 'number' && !isNaN(v)) as number[];
                                    let finalMin: number | 'auto' = 'auto';
                                    let finalMax: number | 'auto' = 'auto';

                                    if (allValues.length > 0) {
                                        const minVal = Math.min(...allValues);
                                        const maxVal = Math.max(...allValues);
                                        const range = maxVal - minVal;
                                        const padding = range * 0.05;
                                        finalMin = Math.floor(minVal - padding);
                                        finalMax = Math.ceil(maxVal + padding);
                                    }

                                    const CustomFlag = ({ viewBox, value, color, label }: any) => {
                                        const { width, y } = viewBox;
                                        if (!width || !y) return null;
                                        const flagWidth = 55;
                                        const flagHeight = 20;
                                        const xPos = width - flagWidth;
                                        const yPos = y - (flagHeight / 2);
                                        return (
                                            <g>
                                                <path d={`M${xPos} ${yPos} h${flagWidth} a2 2 0 0 1 2 2 v${flagHeight - 4} a2 2 0 0 1 -2 2 h-${flagWidth} l-5 -${flagHeight / 2} z`} fill={color} />
                                                <text x={xPos + flagWidth / 2 + 2} y={yPos + 14} textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">
                                                    {label}: {typeof value === 'number' ? value.toFixed(0) : value}
                                                </text>
                                            </g>
                                        );
                                    };

                                    return (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={historyData}>
                                                <defs>
                                                    <linearGradient id="colorCloseHist" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={document.documentElement.classList.contains('dark') ? '#334155' : '#e2e8f0'} />
                                                <XAxis
                                                    dataKey="date"
                                                    tickFormatter={(str) => {
                                                        const date = new Date(str);
                                                        return date.toLocaleDateString("en-US", { month: "short", year: '2-digit' });
                                                    }}
                                                    axisLine={false}
                                                    tickLine={false}
                                                    tick={{ fontSize: 10, fill: document.documentElement.classList.contains('dark') ? '#64748b' : '#94a3b8' }}
                                                    minTickGap={30}
                                                />
                                                <YAxis
                                                    domain={[finalMin, finalMax]}
                                                    axisLine={false}
                                                    tickLine={false}
                                                    tick={{ fontSize: 10, fill: document.documentElement.classList.contains('dark') ? '#64748b' : '#94a3b8' }}
                                                    width={40}
                                                />
                                                <RechartsTooltip
                                                    contentStyle={{
                                                        backgroundColor: document.documentElement.classList.contains('dark') ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.9)',
                                                        borderRadius: '12px',
                                                        border: `1px solid ${document.documentElement.classList.contains('dark') ? '#334155' : '#e2e8f0'}`,
                                                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                                                    }}
                                                    itemStyle={{ color: document.documentElement.classList.contains('dark') ? '#f1f5f9' : '#1e293b', fontWeight: 'bold', fontSize: '12px' }}
                                                    labelStyle={{ color: document.documentElement.classList.contains('dark') ? '#94a3b8' : '#64748b', fontSize: '10px', marginBottom: '4px' }}
                                                />
                                                <Area
                                                    type="monotone"
                                                    dataKey="close"
                                                    stroke="#3b82f6"
                                                    strokeWidth={2}
                                                    fillOpacity={1}
                                                    fill="url(#colorCloseHist)"
                                                />
                                                {resistanceLevels.map((level, idx) => (
                                                    <ReferenceLine
                                                        key={`r${idx + 1}`}
                                                        y={level.price}
                                                        stroke="#10b981"
                                                        strokeDasharray="3 3"
                                                        label={(props) => <CustomFlag {...props} value={level.price} color="#10b981" label={`R${idx + 1}`} />}
                                                    />
                                                ))}
                                                {supportLevels.map((level, idx) => (
                                                    <ReferenceLine
                                                        key={`s${idx + 1}`}
                                                        y={level.price}
                                                        stroke="#ef4444"
                                                        strokeDasharray="3 3"
                                                        label={(props) => <CustomFlag {...props} value={level.price} color="#ef4444" label={`S${idx + 1}`} />}
                                                    />
                                                ))}
                                                <ReferenceLine
                                                    y={current}
                                                    stroke="#3b82f6"
                                                    strokeDasharray="3 3"
                                                    label={(props) => <CustomFlag {...props} value={current} color="#3b82f6" label="CMP" />}
                                                />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    );
                                })()}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default FibonacciRetracement;
