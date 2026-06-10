'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Layers, CalendarClock, TrendingUp, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { fetchVerdict } from '@/lib/verdictFetch';
import { draftTradePlan } from '@/lib/draftTradePlan';
import { formatRupees } from '@/lib/formatters';

interface Sizing {
    shares: number;
    risk_amount: number;
    position_value: number;
    risk_pct: number;
    entry: number;
    stop: number;
    account_id: number;
    account_name: string;
}

interface Verdict {
    symbol: string;
    confluence_score: number;
    components: {
        engine_agreement: { score: number; active_buy_sources: string[]; conflicting_sources: string[] };
        opportunity: { score: number; trust: string | null };
        accumulation: { score: number };
        sector: { score: number; acc_intensity: number | null };
    };
    entry: { price: number; zone_low: number; zone_high: number; status: string; latest_close: number } | null;
    targets: { tp1: number | null; sl: number | null };
    analog: { n: number; fwd_3d_median_pct: number; win_rate_3d: number } | null;
    catalyst: { type: string; days_away: number } | null;
    sizing: Sizing | null;
}

const STATUS_STYLES: Record<string, string> = {
    IN_ZONE: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    EXTENDED: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    STALE: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};

export default function TickerVerdict({ symbol }: { symbol: string }) {
    const [verdict, setVerdict] = useState<Verdict | null>(null);
    const [loading, setLoading] = useState(true);
    const [drafting, setDrafting] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        fetchVerdict(symbol)
            .then(data => { if (!cancelled) setVerdict(data as Verdict); })
            .catch(() => { if (!cancelled) setVerdict(null); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [symbol]);

    if (loading || !verdict) return null;

    const { components, entry, targets, analog, catalyst, sizing } = verdict;
    const engineCount = components.engine_agreement.active_buy_sources.length;
    const conflicts = components.engine_agreement.conflicting_sources;

    const onDraft = async () => {
        if (!sizing || targets.sl == null) return;
        setDrafting(true);
        try {
            await draftTradePlan({
                ticker: verdict.symbol,
                accountId: sizing.account_id,
                riskPct: sizing.risk_pct,
                entry: sizing.entry,
                stop: sizing.stop,
                target: targets.tp1,
                thesis: `Verdict ${verdict.confluence_score}/100 — ${engineCount} engine(s), ${components.opportunity.trust ?? 'no validated edge'}`,
            });
            toast.success('Trade plan drafted — review it in Portfolio → Trade Plans.');
        } catch {
            toast.error('Could not draft the trade plan.');
        } finally {
            setDrafting(false);
        }
    };

    if (!entry) {
        return (
            <Card>
                <CardContent className="py-6 text-center text-sm text-muted-foreground">
                    No active setups on {verdict.symbol}.
                    {catalyst && <span> Upcoming: {catalyst.type.replace(/_/g, ' ').toLowerCase()} in {catalyst.days_away}d.</span>}
                    {analog && (
                        <span> Similar setups (n={analog.n}): {analog.fwd_3d_median_pct >= 0 ? '+' : ''}{analog.fwd_3d_median_pct.toFixed(1)}% median over 3d.</span>
                    )}
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="overflow-hidden">
            <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                    <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Verdict</p>
                    <div className="flex items-center gap-2">
                        <Badge className={cn('text-[10px] font-bold uppercase', STATUS_STYLES[entry.status] || '')}>
                            {entry.status.replace(/_/g, ' ')}
                        </Badge>
                        <span className="text-3xl font-black tabular-nums">{verdict.confluence_score}</span>
                    </div>
                </div>

                <div className="flex flex-wrap gap-1.5 text-[10px] font-semibold">
                    <Badge variant="outline" className="gap-1"><Layers size={10} /> {engineCount} engines</Badge>
                    {components.opportunity.trust && <Badge variant="outline">{components.opportunity.trust}</Badge>}
                    {conflicts.length > 0 && (
                        <Badge variant="outline" className="text-rose-600 dark:text-rose-400">
                            {conflicts.length} conflicting
                        </Badge>
                    )}
                    {catalyst && (
                        <Badge variant="outline" className="gap-1 text-orange-600 dark:text-orange-400">
                            <CalendarClock size={10} /> {catalyst.type.replace(/_/g, ' ').toLowerCase()} in {catalyst.days_away}d
                        </Badge>
                    )}
                </div>

                {analog && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <TrendingUp size={12} className="text-emerald-500 shrink-0" />
                        <span>Similar setups (n={analog.n}): {analog.fwd_3d_median_pct >= 0 ? '+' : ''}{analog.fwd_3d_median_pct.toFixed(1)}% median over 3d, {Math.round(analog.win_rate_3d * 100)}% win rate</span>
                    </div>
                )}

                {sizing && targets.sl != null && (
                    <div className="flex items-center justify-between border-t pt-3 text-xs">
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <Wallet size={12} className="shrink-0" />
                            <span>
                                {'≈ '}
                                <span className="font-bold text-foreground">{sizing.shares} shares</span>
                                {' · '}{formatRupees(sizing.position_value)}
                                {' · risks '}{sizing.risk_pct}{'% ('}{formatRupees(sizing.risk_amount)}{')'}{' of '}{sizing.account_name}
                            </span>
                        </div>
                        <Button size="sm" variant="outline" onClick={onDraft} disabled={drafting}>
                            {drafting ? 'Drafting…' : 'Draft trade plan'}
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
