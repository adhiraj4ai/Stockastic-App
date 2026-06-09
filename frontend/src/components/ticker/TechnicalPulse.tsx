'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Activity, Zap, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface TechnicalPulseProps {
    rsi: number;
    mfi: number;
    macd: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    movingAverages: {
        sma50: number;
        sma200: number;
    };
    currentPrice: number;
}

export function TechnicalPulse({
    rsi,
    mfi,
    macd,
    movingAverages,
    currentPrice
}: TechnicalPulseProps) {
    const getStatus = (val: number) => {
        if (val > 70) return { label: 'Overbought', color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-900/30' };
        if (val < 30) return { label: 'Oversold', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30' };
        return { label: 'Neutral', color: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-50 dark:bg-slate-800/40' };
    };

    const getMacdStyle = () => {
        if (macd === 'BULLISH') return { label: 'Bullish Momentum', color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-200 dark:border-emerald-800', icon: TrendingUp };
        if (macd === 'BEARISH') return { label: 'Bearish Momentum', color: 'text-rose-700 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-900/20', border: 'border-rose-200 dark:border-rose-800', icon: TrendingDown };
        return { label: 'Neutral Momentum', color: 'text-slate-700 dark:text-slate-400', bg: 'bg-slate-50 dark:bg-slate-800/40', border: 'border-slate-200 dark:border-slate-700', icon: Minus };
    };

    const rsiStatus = getStatus(rsi);
    const mStyle = getMacdStyle();

    return (
        <Card className="glass-card-light rounded-xl overflow-hidden">
            <div className={cn("px-6 py-4 border-b border-white/10 dark:border-slate-800/50 flex items-center justify-between", mStyle.bg, mStyle.border)}>
                <div className="flex items-center gap-3">
                    <div className={cn("p-2 rounded-lg bg-white/80 dark:bg-card/80 shadow-sm", mStyle.color)}>
                        <mStyle.icon size={18} />
                    </div>
                    <div className="space-y-0.5">
                        <p className="text-[10px] font-bold opacity-60">Technical pulse & momentum</p>
                        <p className={cn("text-base font-bold", mStyle.color)}>{mStyle.label}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-bold text-[9px] px-2 py-0.5 rounded-md border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 bg-white/50 dark:bg-card">
                        <Zap size={10} className="mr-1 inline text-amber-500" />
                        Real-time signal
                    </Badge>
                </div>
            </div>

            <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* RSI Gauge */}
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">Relative Strength (RSI)</span>
                        <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded", rsiStatus.bg, rsiStatus.color)}>
                            {rsiStatus.label}
                        </span>
                    </div>
                    <div className="text-3xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">{rsi.toFixed(1)}</div>
                    <div className="relative h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div className="absolute inset-y-0 left-[30%] right-[30%] bg-slate-200 opacity-50" />
                        <div
                            className={cn("h-full transition-all duration-1000", rsi > 70 ? "bg-rose-500" : rsi < 30 ? "bg-emerald-500" : "bg-slate-900 dark:bg-slate-100")}
                            style={{ width: `${rsi}%` }}
                        />
                    </div>
                </div>

                {/* Moving Averages */}
                <div className="space-y-4 border-l border-border dark:border-slate-800 pl-8">
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">Trend alignment</span>
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">50-Day Avg.</span>
                            <span className={cn(
                                "text-xs font-bold tabular-nums",
                                currentPrice > movingAverages.sma50 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                            )}>
                                {movingAverages.sma50.toLocaleString()}
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">200-Day Avg.</span>
                            <span className={cn(
                                "text-xs font-bold tabular-nums",
                                currentPrice > movingAverages.sma200 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                            )}>
                                {movingAverages.sma200.toLocaleString()}
                            </span>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
