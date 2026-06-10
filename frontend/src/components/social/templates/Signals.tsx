'use client';

import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SectionHead, EmptyState, type TemplateProps } from './shared';

export function Signals({ data, t }: TemplateProps) {
    const items = data.signals;
    if (!items?.length) return <EmptyState t={t} />;

    return (
        <div>
            <SectionHead t={t} icon={Zap} title="Today's Top Signals" subtitle="Engine calls ranked by conviction" />
            <div className="space-y-2">
                {items.slice(0, 5).map(item => (
                    <div key={`${item.symbol}-${item.action}`} className={cn('flex items-center justify-between px-3 py-2.5 rounded-xl border', t.surface, t.border)}>
                        <div className="flex items-center gap-3 min-w-0">
                            <span className={cn(
                                'text-[9px] font-bold px-2 py-0.5 rounded-md shrink-0',
                                item.action === 'BUY' ? 'bg-emerald-500/15 text-emerald-500' : 'bg-rose-500/15 text-rose-500',
                            )}>
                                {item.action}
                            </span>
                            <div className="flex flex-col min-w-0 leading-tight">
                                <span className={cn('text-xs font-bold truncate', t.text)}>{item.symbol}</span>
                                <span className={cn('text-[9px] font-medium truncate', t.faint)}>{item.source}</span>
                            </div>
                        </div>
                        <div className="text-right shrink-0">
                            <span className="text-sm font-bold text-orange-500 tabular-nums">{Math.round(item.conviction)}</span>
                            <span className={cn('text-[9px]', t.faint)}> /100</span>
                        </div>
                    </div>
                ))}
            </div>
            <p className={cn('text-[8px] mt-3 text-center font-medium', t.faint)}>Not financial advice.</p>
        </div>
    );
}
