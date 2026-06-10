'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, CalendarClock, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PlanPick {
    symbol: string;
    direction: string;
    confluence_score: number;
    components: {
        engine_agreement: { score: number; active_buy_sources: string[]; conflicting_sources: string[] };
        opportunity: { score: number; trust: string | null; edge: number | null; pvalue: number | null };
        accumulation: { score: number };
        sector: { score: number; acc_intensity: number | null };
    };
    entry: { price: number; zone_low: number; zone_high: number; status: string; last_signal_age_days: number; latest_close: number };
    targets: { tp1: number | null; sl: number | null };
    analog: { n: number; fwd_1d_median_pct: number; fwd_3d_median_pct: number; fwd_5d_median_pct: number; win_rate_3d: number } | null;
    catalyst: { type: string; date: string; days_away: number; detail: string } | null;
}

const STATUS_STYLES: Record<string, string> = {
    IN_ZONE: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    EXTENDED: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    STALE: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};

const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;

export function PickCard({ pick }: { pick: PlanPick }) {
    const { components, entry, targets, analog, catalyst } = pick;
    return (
        <Card className="overflow-hidden">
            <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                    <Link href={`/ticker/${pick.symbol}`} className="text-base font-bold hover:underline">
                        {pick.symbol}
                    </Link>
                    <div className="flex items-center gap-2">
                        <Badge className={cn('text-[10px] font-bold uppercase', STATUS_STYLES[entry.status] || '')}>
                            {entry.status.replace('_', ' ')}
                        </Badge>
                        <span className="text-2xl font-black tabular-nums">{pick.confluence_score}</span>
                    </div>
                </div>

                <div className="flex flex-wrap gap-1.5 text-[10px] font-semibold">
                    <Badge variant="outline" className="gap-1">
                        <Layers size={10} /> {components.engine_agreement.active_buy_sources.length} engines
                    </Badge>
                    {components.opportunity.trust && (
                        <Badge variant="outline">{components.opportunity.trust}</Badge>
                    )}
                    {catalyst && (
                        <Badge variant="outline" className="gap-1 text-orange-600 dark:text-orange-400">
                            <CalendarClock size={10} /> {catalyst.type.replace('_', ' ').toLowerCase()} in {catalyst.days_away}d
                        </Badge>
                    )}
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                        <p className="text-muted-foreground">Entry zone</p>
                        <p className="font-semibold tabular-nums">{entry.zone_low.toFixed(1)}–{entry.zone_high.toFixed(1)}</p>
                    </div>
                    <div>
                        <p className="text-muted-foreground">Last close</p>
                        <p className="font-semibold tabular-nums">{entry.latest_close.toFixed(1)}</p>
                    </div>
                    <div>
                        <p className="text-muted-foreground">TP / SL</p>
                        <p className="font-semibold tabular-nums">
                            {targets.tp1 ?? '—'} / {targets.sl ?? '—'}
                        </p>
                    </div>
                </div>

                {analog && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground border-t pt-2">
                        <TrendingUp size={12} className="text-emerald-500 shrink-0" />
                        <span>
                            Similar setups (n={analog.n}): {fmtPct(analog.fwd_3d_median_pct)} median over 3d,{' '}
                            {Math.round(analog.win_rate_3d * 100)}% win rate
                        </span>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
