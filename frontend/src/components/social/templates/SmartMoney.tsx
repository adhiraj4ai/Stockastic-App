'use client';

import { Brain, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SectionHead, Row, EmptyState, type TemplateProps } from './shared';

export function SmartMoney({ data, t }: TemplateProps) {
    const top = data.accumulation?.top;
    const aggressive = data.accumulation?.aggressive;
    if (!top?.length && !aggressive?.length) return <EmptyState t={t} />;

    return (
        <div>
            <SectionHead t={t} icon={Brain} title="Smart Money Watch" subtitle="Institutional accumulation · 1W" />
            <div className="space-y-2">
                {(top ?? []).slice(0, 4).map(row => (
                    <Row
                        key={row.symbol}
                        t={t}
                        label={row.symbol}
                        sub={row.sector}
                        value={`+${Number(row.net_qty).toLocaleString()}`}
                        valueClass="text-emerald-500"
                    />
                ))}
            </div>
            {!!aggressive?.length && (
                <div className="mt-4">
                    <div className={cn('text-[9px] font-semibold uppercase tracking-wider mb-2 flex items-center gap-1', t.faint)}>
                        <Flame size={10} className="text-orange-500" /> Aggressive accumulators
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {aggressive.slice(0, 3).map(row => (
                            <span key={row.symbol} className={cn('text-[10px] font-bold px-2.5 py-1 rounded-lg border', t.surface, t.border, t.text)}>
                                {row.symbol} <span className="text-orange-500">{Number(row.intensity).toFixed(1)}%</span>
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
