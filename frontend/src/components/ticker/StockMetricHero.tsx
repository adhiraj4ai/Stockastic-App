'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrendingUp, TrendingDown, Activity, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StockMetricHeroProps {
    symbol: string;
    name: string;
    sector: string;
    price: number;
    change: number;
    percentChange: number;
    high52w: number;
    low52w: number;
    onTrade?: (type: 'BUY' | 'SELL') => void;
}

export function StockMetricHero({
    symbol,
    name,
    sector,
    price,
    change,
    percentChange,
    high52w,
    low52w,
    onTrade
}: StockMetricHeroProps) {
    const isPositive = change >= 0;

    // Calculate current position in 52w range
    const range = high52w - low52w;
    const progress = range > 0 ? ((price - low52w) / range) * 100 : 0;

    return (
        <div className="bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800">
            <div className="max-w-[1600px] mx-auto px-6 py-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    {/* Left: Price Action */}
                    <div className="flex items-center gap-8">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <Badge variant="outline" className="bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800 font-semibold text-[9px] px-1.5 py-0 uppercase">
                                    {sector}
                                </Badge>
                                <span className="w-1 h-1 rounded-full bg-emerald-500"></span>
                                <span className="text-[9px] font-semibold text-emerald-700 dark:text-emerald-400 uppercase">Real-time</span>
                            </div>
                            <div className="flex items-baseline gap-4">
                                <span className="text-3xl font-bold text-slate-900 dark:text-slate-100 tabular-nums leading-none">
                                    {price.toLocaleString()}
                                </span>
                                <div className={cn(
                                    "flex items-center gap-1.5 text-lg font-bold tabular-nums",
                                    isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                                )}>
                                    {isPositive ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                                    <span>{isPositive ? '+' : ''}{change.toFixed(2)} ({percentChange.toFixed(2)}%)</span>
                                </div>
                            </div>
                        </div>

                        {/* 52W Range - Inline Compact */}
                        <div className="hidden xl:block w-56 space-y-2 border-l border-slate-100 dark:border-slate-800 pl-8">
                            <div className="flex justify-between items-end">
                                <p className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 uppercase">52W Range</p>
                                <p className="text-[10px] font-bold text-slate-900 dark:text-slate-100 tabular-nums">{progress.toFixed(0)}% <span className="text-slate-400 dark:text-slate-500 text-[8px] uppercase">tile</span></p>
                            </div>
                            <div className="relative h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700">
                                <div
                                    className="absolute inset-y-0 left-0 bg-slate-900 dark:bg-slate-100 transition-all duration-1000"
                                    style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                                />
                            </div>
                            <div className="flex justify-between text-[9px] font-bold text-slate-400 tabular-nums">
                                <span>{low52w.toLocaleString()}</span>
                                <span>{high52w.toLocaleString()}</span>
                            </div>
                        </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-3">
                        <Button
                            className="h-10 px-6 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-black dark:hover:bg-white rounded-lg font-bold text-xs uppercase transition-all active:scale-95"
                            onClick={() => onTrade?.('BUY')}
                        >
                            Accumulate
                        </Button>
                        <Button
                            variant="outline"
                            className="h-10 px-6 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg font-bold text-xs uppercase transition-all active:scale-95"
                            onClick={() => onTrade?.('SELL')}
                        >
                            Distribute
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
