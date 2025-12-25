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
}

export function TerminalHeader({
    symbol,
    name,
    sector,
    price,
    change,
    percentChange,
    onTrade
}: TerminalHeaderProps) {
    const isPositive = change >= 0;

    return (
        <div className="sticky top-0 z-50 glass-surface-light border-b border-slate-200/50 py-4">
            <div className="max-w-[1700px] mx-auto px-8 flex flex-col md:flex-row items-center justify-between gap-6">
                {/* Identity Area */}
                <div className="flex items-center gap-6">
                    <div className="relative">
                        <div className={cn(
                            "absolute -inset-2 rounded-full blur-xl opacity-30 animate-pulse",
                            isPositive ? "bg-emerald-500" : "bg-rose-500"
                        )} />
                        <h1 className="relative text-3xl font-bold tracking-tighter text-slate-900 tabular-nums drop-shadow-sm">
                            {symbol}
                        </h1>
                    </div>

                    <div className="h-8 w-px bg-slate-200 hidden md:block" />

                    <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                            <span className="text-slate-800 font-bold text-sm">{name}</span>
                            <Badge variant="outline" className="text-[9px] font-bold px-1.5 py-0 border-slate-200 text-slate-500 uppercase tracking-widest bg-slate-50">
                                {sector}
                            </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                            <span className="flex items-center gap-1"><Clock size={10} /> Live Execution</span>
                            <span className="flex items-center gap-1"><Layers size={10} /> Primary Tier</span>
                        </div>
                    </div>
                </div>

                {/* Price Action - Focal Point */}
                <div className="flex items-center gap-8 px-8 py-2 rounded-2xl bg-slate-100/50 border border-slate-200/50 shadow-inner">
                    <div className="text-4xl font-bold text-slate-900 tabular-nums tracking-tighter">
                        {price.toLocaleString()}
                    </div>
                    <div className={cn(
                        "flex items-center gap-1.5 text-lg font-bold tabular-nums px-3 py-1 rounded-lg",
                        isPositive ? "text-emerald-600 bg-emerald-500/10" : "text-rose-600 bg-rose-500/10"
                    )}>
                        {isPositive ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                        <span>{isPositive ? '+' : ''}{change.toFixed(2)}</span>
                        <span className="opacity-60">({percentChange.toFixed(2)}%)</span>
                    </div>
                </div>

                {/* Global Actions */}
                <div className="flex items-center gap-3">
                    <Button
                        onClick={() => onTrade?.('BUY')}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold h-10 px-6 rounded-lg transition-all active:scale-95 shadow-lg shadow-emerald-600/10"
                    >
                        ACCUMULATE
                    </Button>
                    <Button
                        onClick={() => onTrade?.('SELL')}
                        variant="outline"
                        className="border-slate-200 text-slate-600 hover:bg-slate-50 font-bold h-10 px-6 rounded-lg transition-all active:scale-95"
                    >
                        DISTRIBUTE
                    </Button>
                </div>
            </div>
        </div>
    );
}
