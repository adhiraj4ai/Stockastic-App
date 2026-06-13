'use client';

import { BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SectionHead, EmptyState, type TemplateProps } from './shared';

export function Sectors({ data, t }: TemplateProps) {
    const list = data.summary?.sector_summary;
    if (!list?.length) return <EmptyState t={t} />;

    return (
        <div>
            <SectionHead t={t} icon={BarChart3} title="Sector Heatmap" subtitle="Macro market movement" />
            <div className="space-y-3">
                {list.slice(0, 6).map((sector: any) => (
                    <div key={sector.name} className="flex items-center gap-3">
                        <div className={cn('w-24 text-[10px] font-bold truncate tracking-tight', t.subtext)}>{sector.name}</div>
                        <div className={cn('flex-1 h-2 rounded-full overflow-hidden flex border', t.surface, t.border)}>
                            <div
                                className={cn('h-full rounded-full', sector.change >= 0 ? 'bg-emerald-500' : 'bg-rose-500')}
                                style={{ width: `${Math.min(100, Math.abs(sector.change) * 20)}%`, marginLeft: sector.change < 0 ? 'auto' : '0' }}
                            />
                        </div>
                        <div className={cn('w-14 text-[10px] font-bold text-right tabular-nums', sector.change >= 0 ? 'text-emerald-500' : 'text-rose-500')}>
                            {sector.change >= 0 ? '+' : ''}{Number(sector.change).toFixed(2)}%
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
