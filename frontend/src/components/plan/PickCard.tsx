'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrendingUp, CalendarClock, Layers, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { draftTradePlan } from '@/lib/draftTradePlan';

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

export interface PickSizing {
    shares: number; risk_amount: number; position_value: number; risk_pct: number;
    entry: number; stop: number; account_id: number; account_name: string;
}

const STATUS_STYLES: Record<string, string> = {
    IN_ZONE: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    EXTENDED: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    STALE: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};

const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;

export function PickCard({ pick, sizing }: { pick: PlanPick; sizing?: PickSizing | null }) {
    const { components, entry, targets, analog, catalyst } = pick;
    const [drafting, setDrafting] = useState(false);
    const onDraft = async () => {
        if (!sizing || targets.sl == null) return;
        setDrafting(true);
        try {
            await draftTradePlan({
                ticker: pick.symbol, accountId: sizing.account_id, riskPct: sizing.risk_pct,
                entry: sizing.entry, stop: sizing.stop, target: targets.tp1,
                thesis: `Plan pick ${pick.confluence_score}/100`,
            });
            toast.success('Trade plan drafted — review it in Portfolio → Trade Plans.');
        } catch {
            toast.error('Could not draft the trade plan.');
        } finally {
            setDrafting(false);
        }
    };
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

                {sizing && targets.sl != null && (
                    <div className="flex items-center justify-between border-t pt-2 text-xs">
                        <span className="text-muted-foreground flex items-center gap-1.5">
                            <Wallet size={12} className="shrink-0" />
                            <span>≈ <span className="font-bold text-foreground">{sizing.shares} shares</span> · risks {sizing.risk_pct}% of {sizing.account_name}</span>
                        </span>
                        <Button size="sm" variant="outline" disabled={drafting} onClick={onDraft}>
                            {drafting ? 'Drafting…' : 'Draft trade plan'}
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
