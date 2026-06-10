'use client';

import Link from 'next/link';
import { ArrowUpRight, ArrowDownRight, ChevronRight, Globe } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatNepaliNumber, formatRupees } from '@/lib/formatters';

interface MarketStripSummary {
    date: string;
    total_turnover: number;
    total_volume: number;
    total_points: number;
    points_change: number;
    percent_change: number;
    advancers: number;
    decliners: number;
}

interface MarketStripProps {
    summary: MarketStripSummary | null | undefined;
    status: 'OPEN' | 'CLOSED' | null;
    loading: boolean;
}

export function MarketStrip({ summary, status, loading }: MarketStripProps) {
    if (loading && !summary) {
        return <div className="surface p-4 text-sm text-muted-foreground animate-pulse">Loading market data…</div>;
    }
    if (!summary) {
        return (
            <div className="surface p-4 text-sm text-muted-foreground">
                Market data unavailable right now.{' '}
                <Link href="/market" className="text-primary hover:underline">Open Market Terminal</Link>
            </div>
        );
    }
    const isPositive = summary.points_change >= 0;
    return (
        <Link
            href="/market"
            className="surface p-4 flex flex-wrap items-center gap-x-8 gap-y-2 hover:bg-accent/50 transition-colors group"
        >
            <div className="flex items-center gap-2">
                <Globe size={13} className="text-muted-foreground" />
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">NEPSE</span>
                <span className="text-sm font-semibold text-foreground tabular-nums">{formatNepaliNumber(summary.total_points)}</span>
                <span className={`flex items-center gap-0.5 text-xs font-medium tabular-nums ${isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {isPositive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                    {Math.abs(summary.points_change).toFixed(2)} ({summary.percent_change.toFixed(2)}%)
                </span>
            </div>
            <div className="text-xs text-muted-foreground">
                Turnover <span className="font-mono text-foreground tabular-nums">{formatRupees(summary.total_turnover / 1000000)}M</span>
            </div>
            <div className="text-xs text-muted-foreground">
                Volume <span className="font-mono text-foreground tabular-nums">{(summary.total_volume / 1000000).toFixed(1)}M</span>
            </div>
            <div className="text-xs text-muted-foreground">
                Adv <span className="text-emerald-600 dark:text-emerald-400 font-medium tabular-nums">{summary.advancers}</span>
                {' · '}
                Dec <span className="text-rose-600 dark:text-rose-400 font-medium tabular-nums">{summary.decliners}</span>
            </div>
            <Badge variant="outline" className="font-normal text-[10px] gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${status === 'OPEN' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                {status === 'OPEN' ? 'Market Open' : 'Market Closed'}
            </Badge>
            <ChevronRight size={14} className="ml-auto text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
        </Link>
    );
}
