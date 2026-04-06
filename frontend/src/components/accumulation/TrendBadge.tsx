'use client';

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export const TrendBadge = ({ trend, change, compact = false }: { trend: string, change: number, compact?: boolean }) => {
    const isIncreasing = trend === 'Increasing';
    const isDecreasing = trend === 'Decreasing';

    if (compact) {
        const color = isIncreasing ? 'text-green-600 dark:text-emerald-400' : isDecreasing ? 'text-red-500 dark:text-rose-400' : 'text-slate-400';
        const Icon = isIncreasing ? TrendingUp : isDecreasing ? TrendingDown : Minus;
        return (
            <div className={`flex items-center gap-1 font-mono font-bold ${color}`}>
                <Icon className="w-3 h-3 stroke-[3px]" />
                <span className="text-[10px] tracking-tighter">{Math.abs(change ?? 0).toFixed(1)}%</span>
            </div>
        );
    }

    const colorClass = isIncreasing
        ? 'text-green-700 dark:text-emerald-400 bg-green-50 dark:bg-emerald-900/20 border-green-200 dark:border-emerald-800/30'
        : isDecreasing
            ? 'text-red-700 dark:text-rose-400 bg-red-50 dark:bg-rose-900/20 border-red-200 dark:border-rose-800/30'
            : 'text-gray-600 dark:text-slate-400 bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700';

    const Icon = isIncreasing ? TrendingUp : isDecreasing ? TrendingDown : Minus;

    return (
        <div className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border ${colorClass} w-full max-w-[100px] mx-auto shadow-sm transition-all hover:scale-105`}>
            <Icon className="w-3.5 h-3.5 stroke-[3px]" />
            <span className="text-xs font-bold font-mono tracking-tight">
                {Math.abs(change ?? 0).toFixed(1)}%
            </span>
        </div>
    );
};
