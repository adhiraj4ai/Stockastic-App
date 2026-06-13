'use client';

import { Target, Rocket, Snowflake } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SectionHead, Row, EmptyState, type TemplateProps } from './shared';

export function FiftyTwoWeek({ data, t }: TemplateProps) {
    const highs = data.summary?.near_52_high ?? [];
    const lows = data.summary?.near_52_low ?? [];
    if (!highs.length && !lows.length) return <EmptyState t={t} />;

    return (
        <div>
            <SectionHead t={t} icon={Target} title="52-Week Watch" subtitle="Stocks at the edges of their range" />
            <div className={cn('text-[9px] font-semibold uppercase tracking-wider mb-2 flex items-center gap-1 text-emerald-500')}>
                <Rocket size={10} /> Near 52W high
            </div>
            <div className="space-y-2">
                {highs.slice(0, 3).map((s: any) => (
                    <Row key={s.ticker} t={t} label={s.ticker} sub={s.sector}
                        value={`${s.percent_change >= 0 ? '+' : ''}${Number(s.percent_change).toFixed(2)}%`}
                        valueClass="text-emerald-500" />
                ))}
                {!highs.length && <p className={cn('text-[10px] px-1', t.faint)}>None today.</p>}
            </div>
            <div className={cn('text-[9px] font-semibold uppercase tracking-wider mt-4 mb-2 flex items-center gap-1 text-sky-500')}>
                <Snowflake size={10} /> Near 52W low
            </div>
            <div className="space-y-2">
                {lows.slice(0, 3).map((s: any) => (
                    <Row key={s.ticker} t={t} label={s.ticker} sub={s.sector}
                        value={`${s.percent_change >= 0 ? '+' : ''}${Number(s.percent_change).toFixed(2)}%`}
                        valueClass="text-rose-500" />
                ))}
                {!lows.length && <p className={cn('text-[10px] px-1', t.faint)}>None today.</p>}
            </div>
        </div>
    );
}
