'use client';

import React, { useEffect, useState, useMemo } from 'react';
import api from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
    TrendingUp, TrendingDown, Target, ArrowUpRight, ArrowDownRight,
    Activity, Layers, ChevronUp, ChevronDown
} from 'lucide-react';

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
}

const PERIODS = [
    { value: 30, label: '30D' },
    { value: 90, label: '90D' },
    { value: 180, label: '180D' },
    { value: 365, label: '1Y' },
    { value: 1825, label: '5Y' },
];

export function FibonacciRetracement({ symbol }: FibonacciRetracementProps) {
    const [data, setData] = useState<FibData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [period, setPeriod] = useState(1825);

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
                <div className="lg:col-span-5">
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

                {/* Fibonacci Levels Table */}
                <div className="lg:col-span-7">
                    <div className="glass-card-light dark:bg-slate-900 rounded-3xl p-8 border border-slate-200 dark:border-slate-700 h-full">
                        <div className="flex items-center gap-3 mb-8">
                            <div className="p-2 rounded-xl bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 border border-violet-100 dark:border-violet-800">
                                <Activity size={18} />
                            </div>
                            <div>
                                <h4 className="font-bold text-slate-800 dark:text-slate-100">Fibonacci Levels Detail</h4>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">
                                    Swing High: Rs. {data.swing_high.toLocaleString()} ({data.swing_high_date}) &middot; Swing Low: Rs. {data.swing_low.toLocaleString()} ({data.swing_low_date})
                                </p>
                            </div>
                        </div>

                        <div className="overflow-hidden rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-100 dark:border-slate-700">
                                    <tr>
                                        <th className="px-6 py-4 text-left font-semibold text-slate-400 dark:text-slate-500 text-[10px] uppercase tracking-wider">Level</th>
                                        <th className="px-6 py-4 text-right font-semibold text-slate-400 dark:text-slate-500 text-[10px] uppercase tracking-wider">Price</th>
                                        <th className="px-6 py-4 text-center font-semibold text-slate-400 dark:text-slate-500 text-[10px] uppercase tracking-wider">Status</th>
                                        <th className="px-6 py-4 text-right font-semibold text-slate-400 dark:text-slate-500 text-[10px] uppercase tracking-wider">Distance</th>
                                        <th className="px-6 py-4 text-right font-semibold text-slate-400 dark:text-slate-500 text-[10px] uppercase tracking-wider">Strength</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {sortedLevels.map((level) => {
                                        const isNearest = (data.nearest_support?.label === level.label) ||
                                            (data.nearest_resistance?.label === level.label);
                                        const isAbove = level.price > data.current_price;

                                        // Fibonacci strength: key levels (38.2%, 50%, 61.8%) are strongest
                                        const strength = [0.382, 0.5, 0.618].includes(level.ratio) ? 'Strong'
                                            : [0.236, 0.786].includes(level.ratio) ? 'Moderate'
                                                : 'Weak';

                                        const strengthColor = strength === 'Strong'
                                            ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 ring-emerald-100 dark:ring-emerald-800'
                                            : strength === 'Moderate'
                                                ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 ring-amber-100 dark:ring-amber-800'
                                                : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 ring-slate-200 dark:ring-slate-700';

                                        return (
                                            <tr
                                                key={level.label}
                                                className={cn(
                                                    "hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors",
                                                    isNearest ? "bg-blue-50/30 dark:bg-blue-900/10" : ""
                                                )}
                                            >
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <div className={cn(
                                                            "w-2 h-2 rounded-full",
                                                            isAbove ? "bg-emerald-400" : "bg-rose-400"
                                                        )} />
                                                        <span className="font-bold text-slate-700 dark:text-slate-300">{level.label}</span>
                                                        <span className="text-[10px] text-slate-400">({(level.ratio * 100).toFixed(1)}%)</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                                                        Rs. {level.price.toLocaleString()}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <Badge className={cn(
                                                        "text-[9px] font-bold border-none px-2.5",
                                                        isNearest
                                                            ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                                                            : isAbove
                                                                ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400"
                                                                : "bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400"
                                                    )}>
                                                        {isNearest ? (isAbove ? '▲ NEXT RESISTANCE' : '▼ NEXT SUPPORT')
                                                            : isAbove ? 'RESISTANCE' : 'SUPPORT'}
                                                    </Badge>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <span className={cn(
                                                        "font-mono font-bold text-xs",
                                                        level.distance_pct > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                                                    )}>
                                                        {level.distance_pct > 0 ? '+' : ''}{level.distance_pct}%
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <span className={cn("px-2 py-0.5 rounded-md text-[9px] font-bold ring-1", strengthColor)}>
                                                        {strength}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Price Position Bar */}
                        <div className="mt-8 space-y-3">
                            <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                                <span>Swing Low: Rs. {data.swing_low.toLocaleString()}</span>
                                <span>Swing High: Rs. {data.swing_high.toLocaleString()}</span>
                            </div>
                            <div className="relative h-4 bg-gradient-to-r from-rose-200 via-amber-100 to-emerald-200 dark:from-rose-900/40 dark:via-amber-900/20 dark:to-emerald-900/40 rounded-full overflow-hidden">
                                {/* Level markers */}
                                {sortedLevels.map(level => {
                                    const pct = priceRange > 0
                                        ? ((level.price - data.swing_low) / priceRange) * 100
                                        : 0;
                                    return (
                                        <div
                                            key={level.label}
                                            className="absolute top-0 bottom-0 w-px bg-slate-400/40 dark:bg-slate-500/40"
                                            style={{ left: `${pct}%` }}
                                        />
                                    );
                                })}
                                {/* Current price marker */}
                                <div
                                    className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-blue-500 rounded-full border-2 border-white dark:border-slate-900 shadow-lg shadow-blue-500/50 z-10"
                                    style={{ left: `${Math.min(Math.max(currentPricePct, 2), 98)}%`, transform: 'translate(-50%, -50%)' }}
                                />
                            </div>
                            <div className="text-center">
                                <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                                    CMP: Rs. {data.current_price.toLocaleString()} ({currentPricePct.toFixed(1)}% of range)
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default FibonacciRetracement;
