import React from 'react';
import { cn } from '@/lib/utils';

interface FundamentalsCardData {
    symbol: string;
    name?: string;
    sector?: string;
    market_cap?: number;
    health_score?: number | null;
    metrics?: {
        pe?: number | null;
        pb?: number | null;
        roe?: number | null;
        growth?: number | null;
        de?: number | null;
    };
    dividend_yield?: number;
    high_52w?: number | null;
    low_52w?: number | null;
}

export default function FundamentalsCard(data: FundamentalsCardData) {
    const health = data.health_score;
    const m = data.metrics || {};
    const healthTone = healthColor(health);

    return (
        <div className="surface p-4 text-sm">
            <div className="flex items-center justify-between mb-3">
                <div>
                    <div className="font-semibold text-foreground tracking-tight">{data.symbol}</div>
                    {data.name && <div className="text-[11px] text-muted-foreground">{data.name}</div>}
                </div>
                {health !== null && health !== undefined && (
                    <div className="text-right">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Health</div>
                        <div className={cn('text-xl font-semibold tabular-nums', healthTone)}>
                            {health}
                            <span className="text-[10px] text-muted-foreground">/100</span>
                        </div>
                    </div>
                )}
            </div>
            <div className="grid grid-cols-3 gap-3 mb-3 tabular-nums">
                <Stat label="PE" value={fmt(m.pe)} />
                <Stat label="PB" value={fmt(m.pb)} />
                <Stat label="ROE" value={fmt(m.roe, '%')} />
                <Stat label="Growth" value={fmt(m.growth, '%')} />
                <Stat label="D/E" value={fmt(m.de)} />
                <Stat label="Div yield" value={fmt(data.dividend_yield, '%')} />
            </div>
            {(data.high_52w || data.low_52w) && (
                <div className="border-t border-border pt-2 text-[12px] text-muted-foreground tabular-nums">
                    52w range: {fmt(data.low_52w)} – {fmt(data.high_52w)}
                </div>
            )}
        </div>
    );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className="text-sm font-medium text-foreground">{value}</div>
        </div>
    );
}

function fmt(v: number | null | undefined, suffix = ''): string {
    if (v == null) return '—';
    return v.toFixed(2) + suffix;
}

function healthColor(h?: number | null): string {
    if (h == null) return 'text-foreground';
    if (h >= 70) return 'text-emerald-600 dark:text-emerald-400';
    if (h >= 40) return 'text-foreground';
    return 'text-rose-600 dark:text-rose-400';
}
