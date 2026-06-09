import React from 'react';
import { cn } from '@/lib/utils';

interface TechnicalsCardData {
    symbol: string;
    groups: Record<string, Array<{ name: string; value: string; raw?: any }>>;
}

const CATEGORIES = ['Momentum', 'Trend', 'Volatility', 'Volume', 'Support & Resistance'] as const;

export default function TechnicalsCard(data: TechnicalsCardData) {
    return (
        <div className="surface p-4 text-sm">
            <div className="flex items-center justify-between mb-3">
                <span className="font-medium text-foreground">{data.symbol} · Technical snapshot</span>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                {CATEGORIES.map((cat) => {
                    const items = data.groups?.[cat] || [];
                    if (!items.length) return null;
                    return (
                        <div key={cat}>
                            <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
                                {cat}
                            </div>
                            <div className="space-y-0.5">
                                {items.map((ind, i) => (
                                    <div key={i} className="flex justify-between gap-3 text-[12px]">
                                        <span className="text-foreground">{ind.name}</span>
                                        <span
                                            className={cn(
                                                'tabular-nums font-medium',
                                                interpretTone(ind.name, ind.raw),
                                            )}
                                        >
                                            {ind.value}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function interpretTone(name: string, raw: any): string {
    const v = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isNaN(v)) return 'text-foreground';
    if (name === 'RSI (14)') {
        if (v >= 70) return 'text-rose-600 dark:text-rose-400';
        if (v <= 30) return 'text-emerald-600 dark:text-emerald-400';
    }
    if (name.includes('ROC') || name.includes('Trend')) {
        if (v > 0) return 'text-emerald-600 dark:text-emerald-400';
        if (v < 0) return 'text-rose-600 dark:text-rose-400';
    }
    return 'text-foreground';
}
