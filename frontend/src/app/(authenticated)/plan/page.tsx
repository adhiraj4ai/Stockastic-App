'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { PickCard, type PlanPick } from '@/components/plan/PickCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageLoader } from '@/components/ui/StockLoader';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { ShieldAlert, Eye, CalendarClock, TrendingDown } from 'lucide-react';

interface Overlay {
    positions_near_action: { ticker: string; near: string; close: number; stop_loss_price: number | null; target_price: number | null }[];
    signal_flips: { symbol: string; source: string; since: string; strength: number }[];
    watchlist_triggers: { ticker: string; close: number; target_price: number | null; stop_loss_price: number | null }[];
}

interface Plan {
    date: string;
    generated_at: string;
    regime: string;
    breadth: number | null;
    payload: {
        as_of?: string;
        picks: PlanPick[];
        watch?: PlanPick[];
        exits?: { symbol: string; producer: string; close: number | null }[];
        catalysts: { symbol: string; type: string; date: string; days_away: number; detail: string }[];
        market_context?: Record<string, unknown>;
    };
    overlay?: Overlay;
}

const REGIME_STYLES: Record<string, string> = {
    RISK_ON: 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-300',
    NEUTRAL: 'bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-900/40 dark:border-slate-800 dark:text-slate-300',
    RISK_OFF: 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-900/20 dark:border-rose-800 dark:text-rose-300',
};

export default function PlanPage() {
    const [plan, setPlan] = useState<Plan | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [historyDate, setHistoryDate] = useState('');
    const [historyPlan, setHistoryPlan] = useState<Plan | null>(null);
    const [historyError, setHistoryError] = useState<string | null>(null);

    const handleHistoryDateChange = (value: string) => {
        setHistoryDate(value);
        setHistoryError(null);
        if (!value) {
            setHistoryPlan(null);
            return;
        }
        api.get(`/api/stocks/plan/?date=${value}`)
            .then(res => setHistoryPlan(res.data))
            .catch(err => {
                setHistoryPlan(null);
                setHistoryError(err?.response?.status === 404
                    ? 'No plan for that date.'
                    : 'Could not load that plan.');
            });
    };

    useEffect(() => {
        api.get('/api/stocks/plan/today/')
            .then(res => setPlan(res.data))
            .catch(err => setError(err?.response?.status === 404
                ? 'No plan has been generated yet. The plan is built every evening after market data lands.'
                : 'Could not load the plan.'))
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <DashboardLayout title="Tomorrow's Plan" subtitle="Your next-session brief">
                <div className="flex items-center justify-center min-h-[50vh]">
                    <PageLoader text="Loading plan..." />
                </div>
            </DashboardLayout>
        );
    }

    if (error || !plan) {
        return (
            <DashboardLayout title="Tomorrow's Plan" subtitle="Your next-session brief">
                <div className="flex items-center justify-center min-h-[50vh] text-sm text-muted-foreground">
                    {error ?? 'Could not load the plan.'}
                </div>
            </DashboardLayout>
        );
    }

    const { payload, overlay } = plan;
    const picks = payload.picks ?? [];
    const watch = payload.watch ?? [];
    const breadthPct = plan.breadth != null ? Math.round(plan.breadth * 100) : null;
    const hasUserActions = overlay && (
        overlay.positions_near_action.length > 0 ||
        overlay.signal_flips.length > 0 ||
        overlay.watchlist_triggers.length > 0
    );

    return (
        <DashboardLayout title="Tomorrow's Plan" subtitle={`Session: ${format(parseISO(plan.date), 'eeee, MMM dd')}`}>
            <div className="space-y-6 max-w-6xl">
                {/* Regime banner */}
                <div className={cn('rounded-xl border px-4 py-3 flex items-center justify-between', REGIME_STYLES[plan.regime] || REGIME_STYLES.NEUTRAL)}>
                    <div>
                        <p className="text-sm font-bold">{plan.regime.replace(/_/g, ' ')}</p>
                        {breadthPct != null && (
                            <p className="text-xs opacity-80">{breadthPct}% of the universe is above its 200-day average.</p>
                        )}
                    </div>
                    <p className="text-xs opacity-70">Generated {format(parseISO(plan.generated_at), 'MMM dd, HH:mm')}</p>
                </div>

                {/* Picks */}
                <section>
                    <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
                        Top setups for tomorrow
                    </h2>
                    {picks.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {picks.map(p => <PickCard key={p.symbol} pick={p} />)}
                        </div>
                    ) : (
                        <Card>
                            <CardContent className="py-10 text-center text-sm text-muted-foreground">
                                No high-trust setups for tomorrow
                                {breadthPct != null ? ` — breadth is ${breadthPct}%` : ''}. Consider sitting out.
                            </CardContent>
                        </Card>
                    )}
                </section>

                {/* Watch list */}
                {watch.length > 0 && (
                    <section>
                        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
                            Watch — not actionable yet
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {watch.map(p => <PickCard key={p.symbol} pick={p} />)}
                        </div>
                    </section>
                )}

                {/* Your actions */}
                {hasUserActions && overlay && (
                    <section>
                        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Your actions</h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {overlay.positions_near_action.length > 0 && (
                                <Card>
                                    <CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1.5"><ShieldAlert size={13} className="text-rose-500" /> Positions near action</CardTitle></CardHeader>
                                    <CardContent className="space-y-1.5 text-xs">
                                        {overlay.positions_near_action.map(p => (
                                            <div key={p.ticker} className="flex justify-between">
                                                <span className="font-semibold">{p.ticker}</span>
                                                <Badge variant="outline" className="text-[10px]">{p.near.replace(/_/g, ' ')}</Badge>
                                            </div>
                                        ))}
                                    </CardContent>
                                </Card>
                            )}
                            {overlay.signal_flips.length > 0 && (
                                <Card>
                                    <CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1.5"><TrendingDown size={13} className="text-amber-500" /> Signals against holdings</CardTitle></CardHeader>
                                    <CardContent className="space-y-1.5 text-xs">
                                        {overlay.signal_flips.map(f => (
                                            <div key={`${f.symbol}-${f.source}`} className="flex justify-between">
                                                <span className="font-semibold">{f.symbol}</span>
                                                <span className="text-muted-foreground">{f.source.replace(/_/g, ' ').toLowerCase()}</span>
                                            </div>
                                        ))}
                                    </CardContent>
                                </Card>
                            )}
                            {overlay.watchlist_triggers.length > 0 && (
                                <Card>
                                    <CardHeader className="pb-2"><CardTitle className="text-xs flex items-center gap-1.5"><Eye size={13} className="text-blue-500" /> Watchlist triggers</CardTitle></CardHeader>
                                    <CardContent className="space-y-1.5 text-xs">
                                        {overlay.watchlist_triggers.map(w => (
                                            <div key={w.ticker} className="flex justify-between">
                                                <span className="font-semibold">{w.ticker}</span>
                                                <span className="tabular-nums text-muted-foreground">{w.close.toFixed(1)}</span>
                                            </div>
                                        ))}
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    </section>
                )}

                {/* Catalysts */}
                {(payload.catalysts ?? []).length > 0 && (
                    <section>
                        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                            <CalendarClock size={13} /> Upcoming catalysts (14d)
                        </h2>
                        <div className="flex flex-wrap gap-2">
                            {(payload.catalysts ?? []).map(c => (
                                <Badge key={`${c.symbol}-${c.type}-${c.date}`} variant="outline" className="text-xs gap-1.5 py-1.5 px-3">
                                    <span className="font-bold">{c.symbol}</span>
                                    <span className="text-muted-foreground">{c.type.replace(/_/g, ' ').toLowerCase()} · {format(parseISO(c.date), 'MMM dd')}</span>
                                </Badge>
                            ))}
                        </div>
                    </section>
                )}

                {/* Past plans */}
                <section>
                    <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
                        Past plans
                    </h2>
                    <input
                        type="date"
                        value={historyDate}
                        max={format(new Date(), 'yyyy-MM-dd')}
                        onChange={e => handleHistoryDateChange(e.target.value)}
                        className="bg-transparent border rounded-lg px-3 py-1.5 text-xs"
                    />
                    {historyError && (
                        <p className="mt-2 text-xs text-muted-foreground">{historyError}</p>
                    )}
                    {historyPlan && (
                        <div className="mt-4 space-y-3">
                            <h3 className="text-xs font-semibold text-muted-foreground">
                                {historyPlan.regime.replace(/_/g, ' ')} — {format(parseISO(historyPlan.date), 'eeee, MMM dd')}
                            </h3>
                            {(historyPlan.payload.picks ?? []).length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                    {(historyPlan.payload.picks ?? []).map(p => <PickCard key={p.symbol} pick={p} />)}
                                </div>
                            ) : (
                                <p className="text-xs text-muted-foreground">No picks in that plan.</p>
                            )}
                        </div>
                    )}
                </section>
            </div>
        </DashboardLayout>
    );
}
