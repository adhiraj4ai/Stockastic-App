'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrendingUp, TrendingDown, Clock, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TerminalHeaderProps {
    symbol: string;
    name: string;
    sector: string;
    price: number;
    change: number;
    percentChange: number;
    onTrade?: (type: 'BUY' | 'SELL') => void;
    hideDetails?: boolean;
    hideActions?: boolean;
    signal?: 'BUY' | 'SELL';
}

export function TerminalHeader({
    symbol,
    name,
    sector,
    price,
    change,
    percentChange,
    onTrade,
    hideDetails = false,
    hideActions = false,
    signal
}: TerminalHeaderProps) {
    const isPositive = change >= 0;

    return (
        <div className={cn(
            "sticky top-0 z-50 border-b shadow-sm bg-white/95 backdrop-blur-md border-slate-200/50 py-3",
        )}>
            <div className="max-w-[1700px] mx-auto px-8 flex items-center justify-center gap-6">
                {/* Unified Identity & Price Area */}
                <div className="flex items-center gap-6">
                    {/* Symbol & Signal */}
                    <div className="flex items-center gap-3">
                        <h1 className={cn(
                            "font-bold tracking-tight tabular-nums text-3xl",
                            signal === 'BUY' ? "text-blue-600" :
                                signal === 'SELL' ? "text-rose-600" :
                                    "text-slate-900"
                        )}>
                            {symbol}
                        </h1>

                        {signal && (
                            <Badge
                                className={cn(
                                    "px-2 py-0.5 rounded text-[10px] font-bold border",
                                    signal === 'BUY'
                                        ? "bg-blue-50 text-blue-600 border-blue-200"
                                        : "bg-rose-50 text-rose-600 border-rose-200"
                                )}
                            >
                                {signal}
                            </Badge>
                        )}
                    </div>

                    <div className="h-8 w-px bg-slate-200" />

                    {/* Centered LTP Section */}
                    <div className={cn(
                        "flex items-center justify-center rounded-2xl bg-slate-100/50 border border-slate-200/50 shadow-inner px-6 py-1.5 gap-6",
                    )}>
                        <div className="font-bold text-slate-900 tabular-nums tracking-tighter text-3xl">
                            {price.toLocaleString()}
                        </div>
                        <div className={cn(
                            "flex items-center gap-1.5 font-bold tabular-nums rounded-lg justify-center text-lg px-3 py-1",
                            isPositive ? "text-emerald-600 bg-emerald-500/10" : "text-rose-600 bg-rose-500/10"
                        )}>
                            {isPositive ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                            <span>{isPositive ? '+' : ''}{change.toFixed(2)}</span>
                            <span className="opacity-60">({percentChange.toFixed(2)}%)</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}


