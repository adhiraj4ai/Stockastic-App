'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import type { ThemeTokens } from '@/components/social/SocialCardFrame';
import type { SocialCardData } from '@/lib/socialCardText';
import type { LucideIcon } from 'lucide-react';

export interface TemplateProps {
    data: SocialCardData;
    t: ThemeTokens;
}

export function SectionHead({ t, icon: Icon, title, subtitle }: {
    t: ThemeTokens; icon: LucideIcon; title: string; subtitle: string;
}) {
    return (
        <div className="flex items-center gap-3 mb-5">
            <div className="p-2 rounded-xl bg-orange-500/15 text-orange-500 border border-orange-500/20">
                <Icon size={18} />
            </div>
            <div>
                <h3 className={cn('text-lg font-bold tracking-tight leading-tight', t.text)}>{title}</h3>
                <p className={cn('text-[10px] font-medium tracking-tight', t.faint)}>{subtitle}</p>
            </div>
        </div>
    );
}

export function Row({ t, rank, label, sub, value, valueClass }: {
    t: ThemeTokens; rank?: number; label: string; sub?: string;
    value: React.ReactNode; valueClass?: string;
}) {
    return (
        <div className={cn('flex items-center justify-between px-3 py-2.5 rounded-xl border', t.surface, t.border)}>
            <div className="flex items-center gap-3 min-w-0">
                {rank !== undefined && (
                    <span className="w-5 text-center text-[11px] font-bold text-orange-500 tabular-nums shrink-0">{rank}</span>
                )}
                <div className="flex flex-col min-w-0 leading-tight">
                    <span className={cn('text-xs font-bold truncate', t.text)}>{label}</span>
                    {sub && <span className={cn('text-[9px] font-medium truncate', t.faint)}>{sub}</span>}
                </div>
            </div>
            <div className={cn('text-sm font-bold tabular-nums text-right shrink-0', valueClass ?? t.text)}>{value}</div>
        </div>
    );
}

export function EmptyState({ t }: { t: ThemeTokens }) {
    return (
        <div className="flex items-center justify-center h-full">
            <p className={cn('text-xs font-medium', t.faint)}>Data unavailable — try again later.</p>
        </div>
    );
}
