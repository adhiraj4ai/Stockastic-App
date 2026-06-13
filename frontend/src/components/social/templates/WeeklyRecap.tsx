'use client';

import { CalendarRange } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SectionHead, Row, EmptyState, type TemplateProps } from './shared';

export function WeeklyRecap({ data, t }: TemplateProps) {
    const ms = data.weekly?.market_summary;
    if (!ms) return <EmptyState t={t} />;
    const isPositive = ms.points_change >= 0;
    const leaders = (data.weekly?.top_gainers ?? []).slice(0, 3);
    const sectors = ([...(data.weekly?.sector_summary ?? [])]
        .sort((a: any, b: any) => b.change - a.change)).slice(0, 3);

    return (
        <div>
            <SectionHead t={t} icon={CalendarRange} title="Weekly Recap" subtitle="The week on NEPSE at a glance" />
            <div className={cn('p-4 rounded-2xl border mb-4', t.surface, t.border)}>
                <span className={cn('text-[10px] font-medium block mb-1', t.faint)}>NEPSE · weekly</span>
                <div className="flex items-baseline gap-2">
                    <span className={cn('text-2xl font-bold tracking-tight', t.text)}>
                        {Number(ms.total_points).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className={cn('text-sm font-bold', isPositive ? 'text-emerald-500' : 'text-rose-500')}>
                        {isPositive ? '+' : ''}{Number(ms.percent_change).toFixed(2)}%
                    </span>
                </div>
            </div>
            <div className={cn('text-[9px] font-semibold uppercase tracking-wider mb-2', t.faint)}>Week&apos;s leaders</div>
            <div className="space-y-2">
                {leaders.map((s: any, i: number) => (
                    <Row key={s.ticker} t={t} rank={i + 1} label={s.ticker} sub={s.sector}
                        value={`+${Number(s.percent_change).toFixed(2)}%`} valueClass="text-emerald-500" />
                ))}
            </div>
            {!!sectors.length && (
                <div className="mt-4 flex flex-wrap gap-2">
                    {sectors.map((s: any) => (
                        <span key={s.name} className={cn('text-[10px] font-bold px-2.5 py-1 rounded-lg border', t.surface, t.border, t.text)}>
                            {s.name} <span className={s.change >= 0 ? 'text-emerald-500' : 'text-rose-500'}>{s.change >= 0 ? '+' : ''}{Number(s.change).toFixed(1)}%</span>
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}
