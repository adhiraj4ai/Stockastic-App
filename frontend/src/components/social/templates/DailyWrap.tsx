'use client';

import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState, type TemplateProps } from './shared';

export function DailyWrap({ data, t }: TemplateProps) {
    const ms = data.summary?.market_summary;
    if (!ms) return <EmptyState t={t} />;
    const isPositive = ms.points_change >= 0;

    return (
        <div className="space-y-5">
            <div className="flex justify-between items-start">
                <div className="space-y-1">
                    <span className={cn('text-[10px] font-semibold uppercase tracking-wider', t.faint)}>NEPSE Index</span>
                    <h3 className={cn('text-4xl font-bold tracking-tighter flex items-baseline gap-2', t.text)}>
                        {Number(ms.total_points).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </h3>
                    <span className={cn('text-sm font-bold tracking-tight', isPositive ? 'text-emerald-500' : 'text-rose-500')}>
                        {isPositive ? '▲' : '▼'} {Math.abs(ms.points_change).toFixed(2)} ({Number(ms.percent_change).toFixed(2)}%)
                    </span>
                </div>
                <div className={cn('p-3 rounded-2xl border', isPositive ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500', t.border)}>
                    {isPositive ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className={cn('p-4 rounded-2xl border', t.surface, t.border)}>
                    <span className={cn('text-[10px] font-medium block mb-1', t.faint)}>Turnover</span>
                    <div className={cn('text-xl font-bold tracking-tight', t.text)}>
                        Rs. {(ms.total_turnover / 10000000).toFixed(2)}<span className="text-xs ml-1 opacity-60">Cr</span>
                    </div>
                </div>
                <div className={cn('p-4 rounded-2xl border', t.surface, t.border)}>
                    <span className={cn('text-[10px] font-medium block mb-1', t.faint)}>Breadth</span>
                    <div className={cn('text-xl font-bold tracking-tight', t.text)}>
                        {(ms.advancers / (ms.advancers + ms.decliners || 1)).toFixed(2)}<span className="text-xs ml-1 opacity-60">Ratio</span>
                    </div>
                </div>
            </div>

            <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-bold tracking-tight">
                    <span className="text-emerald-500">Advancers ({ms.advancers})</span>
                    <span className="text-rose-500">Decliners ({ms.decliners})</span>
                </div>
                <div className={cn('h-2.5 w-full rounded-full flex overflow-hidden border', t.surface, t.border)}>
                    <div className="h-full bg-emerald-500 rounded-l-full" style={{ width: `${ms.advancers_percent}%` }} />
                    <div className="h-full bg-rose-500 rounded-r-full ml-auto" style={{ width: `${ms.decliners_percent}%` }} />
                </div>
            </div>
        </div>
    );
}
