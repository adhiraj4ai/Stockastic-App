'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import { TradePlanDrawer } from '@/components/TradePlanDrawer';
import type { TradePlan } from '@/app/(authenticated)/portfolio/plans/page';
import type { PlanPick } from '@/components/plan/PickCard';

interface Plan {
    date: string;
    regime: string;
    payload: {
        picks: PlanPick[];
        watch?: PlanPick[];
        exits?: { symbol: string; producer: string; close: number | null }[];
    };
}

const REGIME_CHIP: Record<string, string> = {
    RISK_ON: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
    NEUTRAL: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
    RISK_OFF: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400',
};

const REGIME_LABEL: Record<string, string> = {
    RISK_ON: 'Risk on',
    NEUTRAL: 'Neutral',
    RISK_OFF: 'Risk off',
};

function SkeletonRow() {
    return (
        <div className="px-3 py-1.5 space-y-1 animate-pulse">
            <div className="h-3 w-20 rounded bg-muted" />
            <div className="h-2.5 w-12 rounded bg-muted" />
        </div>
    );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <p className="px-3 pt-3 pb-1 text-xs font-medium text-muted-foreground">{children}</p>
    );
}

function TomorrowPlan() {
    const [plan, setPlan] = useState<Plan | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        api.get('/api/stocks/plan/today/')
            .then(res => { if (!cancelled) setPlan(res.data); })
            .catch(() => { if (!cancelled) setPlan(null); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    if (loading) {
        return (
            <>
                {Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} />)}
            </>
        );
    }

    if (!plan) {
        return (
            <div className="px-3 py-3 text-xs text-muted-foreground">
                No plan generated yet.{' '}
                <Link href="/plan" className="text-emerald-600 hover:underline">
                    Go to plan →
                </Link>
            </div>
        );
    }

    const picks = plan.payload.picks.slice(0, 5);
    const watchCount = plan.payload.watch?.length ?? 0;
    const actionCount = plan.payload.exits?.length ?? 0;
    const regimeChip = REGIME_CHIP[plan.regime] ?? 'bg-muted text-muted-foreground';
    const regimeLabel = REGIME_LABEL[plan.regime] ?? plan.regime;

    return (
        <>
            <div className="px-3 py-1.5 flex items-center gap-2">
                <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', regimeChip)}>
                    {regimeLabel}
                </span>
            </div>

            {picks.map(pick => (
                <div
                    key={pick.symbol}
                    className="px-3 py-1.5 flex items-center justify-between hover:bg-accent/50 cursor-default rounded-sm"
                >
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold text-sm text-foreground truncate">{pick.symbol}</span>
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                            {pick.confluence_score.toFixed(2)}
                        </span>
                    </div>
                    {pick.entry.status === 'IN_ZONE' && (
                        <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/30">
                            In zone
                        </span>
                    )}
                </div>
            ))}

            <div className="px-3 py-1 flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">
                    {watchCount} watch · {actionCount} actions
                </span>
                <Link
                    href="/plan"
                    className="inline-flex items-center gap-1 text-[11px] text-emerald-600 hover:underline"
                >
                    Full plan <ExternalLink size={10} />
                </Link>
            </div>
        </>
    );
}

function OpenTradePlans() {
    const [plans, setPlans] = useState<TradePlan[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedPlan, setSelectedPlan] = useState<TradePlan | null>(null);

    useEffect(() => {
        let cancelled = false;
        api.get('/api/stocks/trade-plans/?status=OPEN')
            .then(res => { if (!cancelled) setPlans(res.data || []); })
            .catch(() => { if (!cancelled) setPlans([]); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    const handleUpdated = (updated: TradePlan) => {
        setPlans(prev => prev.map(p => (p.id === updated.id ? updated : p)));
        setSelectedPlan(updated);
    };

    if (loading) {
        return (
            <>
                {Array.from({ length: 2 }).map((_, i) => <SkeletonRow key={i} />)}
            </>
        );
    }

    if (plans.length === 0) {
        return (
            <p className="px-3 py-3 text-xs text-muted-foreground">No open trade plans.</p>
        );
    }

    return (
        <>
            {plans.map(plan => (
                <button
                    key={plan.id}
                    onClick={() => setSelectedPlan(plan)}
                    className="w-full text-left px-3 py-1.5 hover:bg-accent/50 rounded-sm"
                >
                    <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm text-foreground">{plan.ticker}</span>
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                            {plan.executed_legs}/{plan.total_legs} legs
                        </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                        {new Date(plan.created_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                        })}
                    </p>
                </button>
            ))}

            {selectedPlan && (
                <TradePlanDrawer
                    plan={selectedPlan}
                    onClose={() => setSelectedPlan(null)}
                    onUpdated={handleUpdated}
                />
            )}
        </>
    );
}

export function PlanSidebar() {
    return (
        <div className="flex h-full min-h-0 flex-col overflow-y-auto custom-scrollbar">
            <SectionLabel>Tomorrow&apos;s plan</SectionLabel>
            <TomorrowPlan />

            <div className="border-t border-border" />

            <SectionLabel>Trade plans</SectionLabel>
            <OpenTradePlans />
        </div>
    );
}
