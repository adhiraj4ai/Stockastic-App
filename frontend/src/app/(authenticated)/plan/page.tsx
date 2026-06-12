'use client';

import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { type PlanPick, type PickSizing } from '@/components/plan/PickCard';
import { Button } from '@/components/ui/button';
import { PageLoader } from '@/components/ui/StockLoader';
import api from '@/lib/api';
import { draftTradePlan } from '@/lib/draftTradePlan';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ShieldAlert, Eye, CalendarClock, TrendingDown, TrendingUp, Activity,
    Layers, ChevronUp, ChevronDown, ChevronRight, X, ExternalLink,
    CalendarDays, Zap, Wallet,
} from 'lucide-react';

interface Overlay {
    positions_near_action: { ticker: string; near: string; close: number; stop_loss_price: number | null; target_price: number | null }[];
    signal_flips: { symbol: string; source: string; since: string; strength: number }[];
    watchlist_triggers: { ticker: string; close: number; target_price: number | null; stop_loss_price: number | null }[];
    sizing?: Record<string, PickSizing>;
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

type BottomTab = 'watch' | 'actions' | 'catalysts';
type SortKey = 'symbol' | 'score' | 'close';

const REGIME_CLS: Record<string, { chip: string; kpi: { wrap: string; icon: string; val: string } }> = {
    RISK_ON: {
        chip: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-800/30',
        kpi: { wrap: 'border-emerald-100 dark:border-emerald-900/20', icon: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400', val: 'text-emerald-700 dark:text-emerald-400' },
    },
    NEUTRAL: {
        chip: 'bg-slate-50 dark:bg-slate-900/40 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800',
        kpi: { wrap: 'border-slate-200 dark:border-slate-800', icon: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400', val: 'text-slate-700 dark:text-slate-300' },
    },
    RISK_OFF: {
        chip: 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400 border-rose-100 dark:border-rose-800/30',
        kpi: { wrap: 'border-rose-100 dark:border-rose-900/20', icon: 'bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400', val: 'text-rose-700 dark:text-rose-400' },
    },
};

const STATUS_CLS: Record<string, string> = {
    IN_ZONE: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/30',
    EXTENDED: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800/30',
    STALE: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700',
};

const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;

function SortIcon({ col, sortConfig }: { col: SortKey; sortConfig: { key: SortKey; direction: 'asc' | 'desc' } }) {
    if (sortConfig.key !== col) return <ChevronDown className="w-3 h-3 opacity-20" />;
    return sortConfig.direction === 'asc'
        ? <ChevronUp className="w-3 h-3 text-primary" />
        : <ChevronDown className="w-3 h-3 text-primary" />;
}


function WatchCard({ pick, onSelect }: { pick: PlanPick; onSelect: () => void }) {
    const { entry, targets, components } = pick;
    return (
        <div
            onClick={onSelect}
            className="group bg-white dark:bg-card border border-border dark:border-slate-800 rounded-xl p-4 shadow-sm hover:shadow-md hover:border-amber-200 dark:hover:border-amber-800/40 cursor-pointer transition-all"
        >
            <div className="flex items-start justify-between mb-3">
                <div className="font-semibold text-base text-slate-900 dark:text-slate-100 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                    {pick.symbol}
                </div>
                <div className="flex items-center gap-2">
                    <span className={cn('px-2 py-0.5 rounded-lg text-[10px] font-semibold border', STATUS_CLS[entry.status] || STATUS_CLS.STALE)}>
                        {entry.status.replace(/_/g, ' ')}
                    </span>
                    <span className="text-lg font-semibold tabular-nums text-slate-800 dark:text-slate-200">{pick.confluence_score}</span>
                </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[10px] bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2">
                <div>
                    <div className="text-slate-400 font-bold mb-0.5">Entry Zone</div>
                    <div className="font-semibold text-slate-700 dark:text-slate-300 tabular-nums">{entry.zone_low.toFixed(1)}–{entry.zone_high.toFixed(1)}</div>
                </div>
                <div>
                    <div className="text-slate-400 font-bold mb-0.5">Close</div>
                    <div className="font-semibold text-slate-700 dark:text-slate-300 tabular-nums">{entry.latest_close.toFixed(1)}</div>
                </div>
                <div>
                    <div className="text-slate-400 font-bold mb-0.5">TP / SL</div>
                    <div className="font-semibold text-slate-700 dark:text-slate-300 tabular-nums">{targets.tp1 ?? '—'} / {targets.sl ?? '—'}</div>
                </div>
            </div>
            <div className="flex flex-wrap gap-1 mt-3">
                <span className="px-1.5 py-0.5 bg-white dark:bg-slate-800 rounded text-[10px] font-semibold border border-primary/20 text-primary">
                    {components.engine_agreement.active_buy_sources.length} engines
                </span>
                {components.opportunity.trust && (
                    <span className="px-1.5 py-0.5 bg-white dark:bg-slate-800 rounded text-[10px] font-semibold border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400">
                        {components.opportunity.trust}
                    </span>
                )}
                {pick.catalyst && (
                    <span className="px-1.5 py-0.5 bg-white dark:bg-slate-800 rounded text-[10px] font-semibold border border-amber-200 dark:border-amber-800/30 text-amber-600 dark:text-amber-400">
                        {pick.catalyst.type.replace(/_/g, ' ').toLowerCase()} in {pick.catalyst.days_away}d
                    </span>
                )}
            </div>
        </div>
    );
}

export default function PlanPage() {
    const [plan, setPlan] = useState<Plan | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [historyDate, setHistoryDate] = useState('');
    const [historyPlan, setHistoryPlan] = useState<Plan | null>(null);
    const [historyError, setHistoryError] = useState<string | null>(null);
    const [selectedPick, setSelectedPick] = useState<PlanPick | null>(null);
    const [activeTab, setActiveTab] = useState<BottomTab>('watch');
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'score', direction: 'desc' });
    const [drafting, setDrafting] = useState(false);

    const onDraft = async (pick: PlanPick, s: PickSizing) => {
        if (pick.targets.sl == null) return;
        setDrafting(true);
        try {
            await draftTradePlan({
                ticker: pick.symbol, accountId: s.account_id, riskPct: s.risk_pct,
                entry: s.entry, stop: s.stop, target: pick.targets.tp1,
                thesis: `Plan pick ${pick.confluence_score}/100`,
            });
            toast.success('Trade plan drafted — review it in Portfolio → Trade Plans.');
        } catch {
            toast.error('Could not draft the trade plan.');
        } finally {
            setDrafting(false);
        }
    };

    const handleHistoryDateChange = (value: string) => {
        setHistoryDate(value);
        setHistoryError(null);
        setSelectedPick(null);
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

    const displayed = historyPlan ?? plan;
    const picks = useMemo(() => displayed?.payload.picks ?? [], [displayed]);
    const watch = displayed?.payload.watch ?? [];
    const catalysts = displayed?.payload.catalysts ?? [];
    const overlay = displayed?.overlay;

    const sortedPicks = useMemo(() => {
        const val = (p: PlanPick) =>
            sortConfig.key === 'symbol' ? p.symbol
                : sortConfig.key === 'close' ? p.entry.latest_close
                : p.confluence_score;
        return [...picks].sort((a, b) => {
            const av = val(a); const bv = val(b);
            if (typeof av === 'number' && typeof bv === 'number')
                return sortConfig.direction === 'asc' ? av - bv : bv - av;
            return sortConfig.direction === 'asc'
                ? String(av).localeCompare(String(bv))
                : String(bv).localeCompare(String(av));
        });
    }, [picks, sortConfig]);

    const handleSort = (key: SortKey) =>
        setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc' }));

    if (loading) {
        return (
            <DashboardLayout title="Tomorrow's Plan" subtitle="Your next-session brief">
                <div className="flex items-center justify-center min-h-[50vh]">
                    <PageLoader text="Loading plan..." />
                </div>
            </DashboardLayout>
        );
    }

    if (error || !displayed) {
        return (
            <DashboardLayout title="Tomorrow's Plan" subtitle="Your next-session brief">
                <div className="flex items-center justify-center min-h-[50vh] text-sm text-muted-foreground">
                    {error ?? 'Could not load the plan.'}
                </div>
            </DashboardLayout>
        );
    }

    const breadthPct = displayed.breadth != null ? Math.round(displayed.breadth * 100) : null;
    const regime = REGIME_CLS[displayed.regime] || REGIME_CLS.NEUTRAL;
    const inZoneCount = picks.filter(p => p.entry.status === 'IN_ZONE').length;
    const actionsCount = overlay
        ? overlay.positions_near_action.length + overlay.signal_flips.length + overlay.watchlist_triggers.length
        : 0;

    return (
        <DashboardLayout title="Tomorrow's Plan" subtitle={`Session: ${format(parseISO(displayed.date), 'eeee, MMM dd')}`}>
            <div className="space-y-5 min-h-screen pb-10">

                {/* ═══ Global Controls Bar ════════════════════════════════════════ */}
                <div className="bg-white dark:bg-card rounded-2xl border border-slate-200 dark:border-border shadow-lg px-4 py-3 flex flex-col xl:flex-row items-stretch xl:items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2 bg-slate-50 dark:bg-card px-3 py-1 rounded-xl border border-border dark:border-border shrink-0">
                        <CalendarDays className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <input
                            type="date"
                            value={historyDate}
                            max={format(new Date(), 'yyyy-MM-dd')}
                            onChange={e => handleHistoryDateChange(e.target.value)}
                            className="bg-transparent border-none text-xs font-semibold text-slate-700 dark:text-slate-300 outline-none"
                        />
                    </div>

                    {historyPlan && (
                        <Button variant="outline" size="sm" onClick={() => handleHistoryDateChange('')}
                            className="h-8 px-3 text-[11px] font-semibold rounded-xl border-slate-200 dark:border-border gap-1.5 shrink-0">
                            <X className="w-3.5 h-3.5" /> Back to latest
                        </Button>
                    )}

                    {historyError && (
                        <span className="text-xs font-semibold text-slate-400 self-center">{historyError}</span>
                    )}

                    <div className="h-4 w-px bg-slate-200 dark:bg-white/10 hidden xl:block" />

                    <div className="flex items-center gap-2 ml-auto flex-wrap">
                        {historyPlan && (
                            <span className="px-2.5 py-1 bg-primary/10 text-primary text-[11px] font-semibold rounded-lg border border-primary/20">
                                Viewing past plan
                            </span>
                        )}
                        <span className={cn('px-2.5 py-1 text-[11px] font-semibold rounded-lg border', regime.chip)}>
                            {displayed.regime.replace(/_/g, ' ')}
                        </span>
                        {breadthPct != null && (
                            <span className="px-2.5 py-1 bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-700">
                                Breadth {breadthPct}%
                            </span>
                        )}
                        <span className="px-2.5 py-1 bg-slate-50 dark:bg-slate-800/50 text-slate-400 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-700">
                            Generated {format(parseISO(displayed.generated_at), 'MMM dd, HH:mm')}
                        </span>
                    </div>
                </div>

                {/* ═══ KPI Cards ══════════════════════════════════════════════════ */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {([
                        {
                            label: 'Market Regime', value: displayed.regime.replace(/_/g, ' '), unit: '',
                            sub: breadthPct != null ? `${breadthPct}% of universe above 200d avg` : 'Breadth unavailable',
                            icon: <Activity className="w-5 h-5" />, cls: regime.kpi,
                        },
                        {
                            label: 'Top Setups', value: `${picks.length}`, unit: 'picks',
                            sub: `${inZoneCount} in entry zone`,
                            icon: <TrendingUp className="w-5 h-5" />,
                            cls: { wrap: 'border-primary/20', icon: 'bg-primary/10 text-primary', val: 'text-primary' },
                        },
                        {
                            label: 'Watch List', value: `${watch.length}`, unit: 'stocks',
                            sub: 'Close, but not actionable yet',
                            icon: <Eye className="w-5 h-5" />,
                            cls: { wrap: 'border-amber-100 dark:border-amber-900/20', icon: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400', val: 'text-amber-700 dark:text-amber-400' },
                        },
                        {
                            label: 'Your Actions', value: `${actionsCount}`, unit: 'items',
                            sub: overlay
                                ? `${overlay.positions_near_action.length} positions / ${overlay.signal_flips.length} flips / ${overlay.watchlist_triggers.length} triggers`
                                : 'Nothing needs attention',
                            icon: <ShieldAlert className="w-5 h-5" />,
                            cls: { wrap: 'border-rose-100 dark:border-rose-900/20', icon: 'bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400', val: 'text-rose-700 dark:text-rose-400' },
                        },
                    ] as const).map((stat, i) => (
                        <div key={i} className={cn('bg-white dark:bg-card rounded-2xl border p-5 shadow-sm flex items-start gap-4 hover:shadow-md transition-all', stat.cls.wrap)}>
                            <div className={cn('p-2.5 rounded-xl shrink-0', stat.cls.icon)}>{stat.icon}</div>
                            <div className="min-w-0">
                                <div className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1 truncate">{stat.label}</div>
                                <div className={cn('text-xl font-semibold tracking-tight', stat.cls.val)}>
                                    {stat.value}{stat.unit && <span className="text-sm ml-1 opacity-60">{stat.unit}</span>}
                                </div>
                                <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">{stat.sub}</div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* ═══ Master + Detail Panel ══════════════════════════════════════ */}
                <div className={cn(
                    'grid gap-4 transition-all duration-300',
                    selectedPick ? 'grid-cols-1 xl:grid-cols-[1fr_390px]' : 'grid-cols-1',
                )}>

                    {/* ─── Master Table: Top Setups ──────────────────────────────── */}
                    <div className="bg-white dark:bg-card rounded-2xl border border-slate-200 dark:border-border shadow-sm overflow-hidden">
                        <div className="px-5 py-3 border-b border-border dark:border-border bg-slate-50/50 dark:bg-muted flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <Layers className="w-4 h-4 text-primary shrink-0" />
                                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Top Setups for Tomorrow</span>
                                <span className="text-[10px] font-semibold text-slate-400 px-2 py-0.5 bg-slate-100 dark:bg-muted rounded-full shrink-0">
                                    {picks.length}
                                </span>
                            </div>
                            {selectedPick && (
                                <button onClick={() => setSelectedPick(null)}
                                    className="text-[10px] font-semibold text-slate-400 hover:text-accent-foreground flex items-center gap-1 shrink-0 transition-colors">
                                    <X className="w-3.5 h-3.5" /> Clear
                                </button>
                            )}
                        </div>

                        {picks.length === 0 ? (
                            <div className="h-40 flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm px-6 text-center">
                                No high-trust setups{breadthPct != null ? ` — breadth is ${breadthPct}%` : ''}. Consider sitting out.
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full border-separate border-spacing-0">
                                    <thead>
                                        <tr className="h-10 bg-slate-50/60 dark:bg-slate-800/20">
                                            {([
                                                { label: 'Ticker', col: 'symbol' as SortKey, align: 'left', hide: '' },
                                                { label: 'Score', col: 'score' as SortKey, align: 'right', hide: '' },
                                                { label: 'Status', col: null, align: 'center', hide: '' },
                                                { label: 'Close', col: 'close' as SortKey, align: 'right', hide: '' },
                                                { label: 'Entry Zone', col: null, align: 'right', hide: 'md' },
                                                { label: 'TP / SL', col: null, align: 'right', hide: 'md' },
                                                { label: 'Engines', col: null, align: 'center', hide: 'lg' },
                                                { label: 'Catalyst', col: null, align: 'left', hide: 'lg' },
                                            ] as const).map(h => (
                                                <th key={h.label}
                                                    onClick={() => h.col && handleSort(h.col)}
                                                    className={cn(
                                                        'px-4 py-2 sticky top-0 z-10 bg-slate-50/90 dark:bg-card/90 border-b border-border dark:border-slate-800 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 transition-colors',
                                                        h.col ? 'cursor-pointer hover:text-primary' : '',
                                                        h.align === 'right' ? 'text-right' : h.align === 'center' ? 'text-center' : 'text-left',
                                                        h.hide === 'lg' ? 'hidden lg:table-cell' : h.hide === 'md' ? 'hidden md:table-cell' : '',
                                                    )}>
                                                    <div className={cn('flex items-center gap-1',
                                                        h.align === 'right' ? 'justify-end' : h.align === 'center' ? 'justify-center' : '',
                                                    )}>
                                                        {h.label}
                                                        {h.col && <SortIcon col={h.col} sortConfig={sortConfig} />}
                                                    </div>
                                                </th>
                                            ))}
                                            <th className="w-6 sticky top-0 z-10 bg-slate-50/90 dark:bg-card/90 border-b border-border dark:border-slate-800" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sortedPicks.map(p => (
                                            <tr
                                                key={p.symbol}
                                                onClick={() => setSelectedPick(prev => prev?.symbol === p.symbol ? null : p)}
                                                className={cn(
                                                    'group border-b border-slate-50 dark:border-slate-800/50 last:border-0 transition-colors duration-100 cursor-pointer border-l-[3px] animate-in fade-in duration-150',
                                                    selectedPick?.symbol === p.symbol
                                                        ? 'bg-primary/5 border-l-primary'
                                                        : p.entry.status === 'IN_ZONE'
                                                        ? 'hover:bg-emerald-50/20 dark:hover:bg-emerald-900/5 border-l-emerald-300/40 hover:border-l-emerald-500'
                                                        : 'hover:bg-accent hover:text-accent-foreground border-l-transparent',
                                                )}
                                            >
                                                <td className="px-4 py-3">
                                                    <div className="font-bold text-sm text-slate-900 dark:text-slate-100 leading-none">{p.symbol}</div>
                                                    <div className="text-[9px] text-slate-400 font-medium mt-0.5 hidden sm:block uppercase">{p.direction}</div>
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <span className="text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-200">{p.confluence_score}</span>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded border whitespace-nowrap', STATUS_CLS[p.entry.status] || STATUS_CLS.STALE)}>
                                                        {p.entry.status.replace(/_/g, ' ')}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono text-sm font-bold text-slate-800 dark:text-slate-200 tabular-nums">
                                                    {p.entry.latest_close.toFixed(1)}
                                                </td>
                                                <td className="px-4 py-3 text-right hidden md:table-cell">
                                                    <span className="text-xs font-semibold tabular-nums text-slate-600 dark:text-slate-300">
                                                        {p.entry.zone_low.toFixed(1)}–{p.entry.zone_high.toFixed(1)}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right hidden md:table-cell">
                                                    <span className="text-xs font-semibold tabular-nums">
                                                        <span className="text-emerald-600 dark:text-emerald-400">{p.targets.tp1 ?? '—'}</span>
                                                        <span className="text-slate-300 dark:text-slate-600 mx-1">/</span>
                                                        <span className="text-rose-600 dark:text-rose-400">{p.targets.sl ?? '—'}</span>
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-center hidden lg:table-cell">
                                                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                                                        {p.components.engine_agreement.active_buy_sources.length}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 hidden lg:table-cell">
                                                    {p.catalyst ? (
                                                        <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 whitespace-nowrap">
                                                            {p.catalyst.type.replace(/_/g, ' ').toLowerCase()} in {p.catalyst.days_away}d
                                                        </span>
                                                    ) : <span className="text-slate-300 dark:text-slate-600">—</span>}
                                                </td>
                                                <td className="px-2 py-3">
                                                    <ChevronRight className={cn(
                                                        'w-4 h-4 transition-all duration-200 shrink-0',
                                                        selectedPick?.symbol === p.symbol
                                                            ? 'text-primary rotate-90'
                                                            : 'text-slate-300 dark:text-slate-700 group-hover:text-slate-500',
                                                    )} />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* ─── Detail Panel ──────────────────────────────────────────── */}
                    <AnimatePresence>
                        {selectedPick && (
                            <motion.div
                                initial={{ opacity: 0, x: 24 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 24 }}
                                transition={{ duration: 0.22, ease: 'easeOut' }}
                                className="bg-white dark:bg-card rounded-2xl border border-slate-200 dark:border-border shadow-sm overflow-hidden flex flex-col"
                            >
                                {/* Symbol Header */}
                                <div className="p-5 border-b border-border bg-muted/40">
                                    <div className="flex items-start justify-between mb-3">
                                        <div>
                                            <div className="text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">{selectedPick.symbol}</div>
                                            <span className="mt-1.5 inline-block text-[9px] px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-full font-semibold uppercase tracking-wider">
                                                {selectedPick.direction}
                                            </span>
                                            <span className={cn('mt-1.5 ml-1.5 inline-block text-[9px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider border', STATUS_CLS[selectedPick.entry.status] || STATUS_CLS.STALE)}>
                                                {selectedPick.entry.status.replace(/_/g, ' ')}
                                            </span>
                                        </div>
                                        <div className="flex items-start gap-2">
                                            <div className="text-right">
                                                <div className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">Score</div>
                                                <div className="text-2xl font-semibold tabular-nums text-primary">{selectedPick.confluence_score}</div>
                                            </div>
                                            <button onClick={() => setSelectedPick(null)}
                                                className="p-1.5 rounded-lg hover:bg-accent hover:text-accent-foreground text-slate-400 transition-colors shrink-0">
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-3 gap-2">
                                        {([
                                            { label: 'Close', val: selectedPick.entry.latest_close.toFixed(1), cls: 'text-slate-900 dark:text-slate-100' },
                                            { label: 'Entry Zone', val: `${selectedPick.entry.zone_low.toFixed(1)}–${selectedPick.entry.zone_high.toFixed(1)}`, cls: 'text-slate-700 dark:text-slate-200' },
                                            { label: 'TP / SL', val: `${selectedPick.targets.tp1 ?? '—'} / ${selectedPick.targets.sl ?? '—'}`, cls: 'text-slate-700 dark:text-slate-200' },
                                        ] as const).map(m => (
                                            <div key={m.label} className="bg-white/60 dark:bg-card rounded-xl p-2.5 border border-border dark:border-border">
                                                <div className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{m.label}</div>
                                                <div className={cn('text-sm font-semibold font-mono tabular-nums', m.cls)}>{m.val}</div>
                                            </div>
                                        ))}
                                    </div>

                                    {selectedPick.catalyst && (
                                        <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/30 text-amber-700 dark:text-amber-400">
                                            <CalendarClock className="w-3.5 h-3.5 shrink-0" />
                                            {selectedPick.catalyst.type.replace(/_/g, ' ')} in {selectedPick.catalyst.days_away}d — {selectedPick.catalyst.detail}
                                        </div>
                                    )}
                                </div>

                                {/* Confluence Components */}
                                <div className="px-5 py-4 border-b border-border dark:border-border">
                                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Confluence Components</div>
                                    <div className="space-y-2">
                                        {([
                                            { label: 'Engine Agreement', score: selectedPick.components.engine_agreement.score },
                                            { label: 'Opportunity', score: selectedPick.components.opportunity.score },
                                            { label: 'Accumulation', score: selectedPick.components.accumulation.score },
                                            { label: 'Sector', score: selectedPick.components.sector.score },
                                        ] as const).map(c => (
                                            <div key={c.label} className="flex items-center justify-between bg-slate-50/60 dark:bg-slate-800/30 rounded-lg px-3 py-2">
                                                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">{c.label}</span>
                                                <span className="text-[11px] font-semibold tabular-nums text-slate-800 dark:text-slate-200">{c.score}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex flex-wrap gap-1 mt-3">
                                        {selectedPick.components.engine_agreement.active_buy_sources.map(s => (
                                            <span key={s} className="px-1.5 py-0.5 bg-emerald-50 dark:bg-emerald-900/20 rounded text-[10px] font-semibold border border-emerald-100 dark:border-emerald-800/30 text-emerald-600 dark:text-emerald-400">
                                                {s.replace(/_/g, ' ').toLowerCase()}
                                            </span>
                                        ))}
                                        {selectedPick.components.engine_agreement.conflicting_sources.map(s => (
                                            <span key={s} className="px-1.5 py-0.5 bg-rose-50 dark:bg-rose-900/20 rounded text-[10px] font-semibold border border-rose-100 dark:border-rose-800/30 text-rose-600 dark:text-rose-400">
                                                ✕ {s.replace(/_/g, ' ').toLowerCase()}
                                            </span>
                                        ))}
                                        {selectedPick.components.opportunity.trust && (
                                            <span className="px-1.5 py-0.5 bg-primary/10 rounded text-[10px] font-semibold border border-primary/20 text-primary">
                                                {selectedPick.components.opportunity.trust}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Analog Stats */}
                                {selectedPick.analog && (
                                    <div className="px-5 py-4 border-b border-border dark:border-border">
                                        <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">
                                            Similar Setups (n={selectedPick.analog.n})
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            {([
                                                { label: '3d Median', val: fmtPct(selectedPick.analog.fwd_3d_median_pct), pos: selectedPick.analog.fwd_3d_median_pct >= 0 },
                                                { label: '5d Median', val: fmtPct(selectedPick.analog.fwd_5d_median_pct), pos: selectedPick.analog.fwd_5d_median_pct >= 0 },
                                                { label: '3d Win Rate', val: `${Math.round(selectedPick.analog.win_rate_3d * 100)}%`, pos: selectedPick.analog.win_rate_3d >= 0.5 },
                                                { label: '1d Median', val: fmtPct(selectedPick.analog.fwd_1d_median_pct), pos: selectedPick.analog.fwd_1d_median_pct >= 0 },
                                            ] as const).map(m => (
                                                <div key={m.label} className="bg-slate-50/60 dark:bg-slate-800/30 rounded-xl p-2.5">
                                                    <div className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{m.label}</div>
                                                    <div className={cn('text-sm font-semibold tabular-nums',
                                                        m.pos ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
                                                    )}>{m.val}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Sizing / Draft */}
                                {overlay?.sizing?.[selectedPick.symbol] && selectedPick.targets.sl != null && (() => {
                                    const s = overlay.sizing![selectedPick.symbol];
                                    return (
                                        <div className="px-5 py-4 border-t border-border">
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                                                    <Wallet className="w-3.5 h-3.5 shrink-0" />
                                                    <span>≈ <span className="font-bold text-slate-900 dark:text-slate-100">{s.shares} shares</span> · risks {s.risk_pct}% of {s.account_name}</span>
                                                </div>
                                                <Button size="sm" variant="outline" disabled={drafting} onClick={() => onDraft(selectedPick, s)}>
                                                    {drafting ? 'Drafting…' : 'Draft trade plan'}
                                                </Button>
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* Quick Actions */}
                                <div className="px-5 py-4 mt-auto flex gap-2 flex-wrap">
                                    <Link href={`/ticker/${selectedPick.symbol}`} className="flex-1 min-w-[100px]">
                                        <Button className="w-full h-9 text-[11px] font-semibold bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl gap-1.5 shadow-md">
                                            <ExternalLink className="w-3.5 h-3.5" /> Full Analysis
                                        </Button>
                                    </Link>
                                    <Link href={`/accumulation/navigator?symbol=${selectedPick.symbol}`}>
                                        <Button variant="outline" className="h-9 px-3 text-[11px] font-semibold rounded-xl border-slate-200 dark:border-border gap-1.5 hover:bg-accent hover:text-accent-foreground">
                                            <Activity className="w-3.5 h-3.5" />
                                        </Button>
                                    </Link>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* ═══ Bottom Tabbed Section ══════════════════════════════════════ */}
                <div className="bg-white dark:bg-card rounded-2xl border border-slate-200 dark:border-border shadow-sm overflow-hidden">
                    <div className="border-b border-border dark:border-border bg-slate-50/50 dark:bg-muted px-5 flex items-center gap-1 overflow-x-auto no-scrollbar">
                        {([
                            { key: 'watch', label: `Watch List (${watch.length})`, icon: <Eye className="w-3.5 h-3.5" /> },
                            { key: 'actions', label: `Your Actions (${actionsCount})`, icon: <ShieldAlert className="w-3.5 h-3.5" /> },
                            { key: 'catalysts', label: `Catalysts 14d (${catalysts.length})`, icon: <CalendarClock className="w-3.5 h-3.5" /> },
                        ] as { key: BottomTab; label: string; icon: React.ReactNode }[]).map(tab => (
                            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                                className={cn(
                                    'flex items-center gap-2 px-4 py-4 text-xs font-semibold tracking-tight border-b-2 transition-all whitespace-nowrap',
                                    activeTab === tab.key
                                        ? 'border-primary text-primary'
                                        : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300',
                                )}>
                                {tab.icon}{tab.label}
                            </button>
                        ))}
                    </div>

                    <div className="p-5">

                        {/* ── Watch List ─────────────────────────────────────────── */}
                        {activeTab === 'watch' && (
                            watch.length === 0 ? (
                                <div className="p-8 text-center text-slate-400 text-sm bg-slate-50 dark:bg-card rounded-xl">
                                    Nothing on the watch list for this session
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                                    {watch.map(p => (
                                        <WatchCard key={p.symbol} pick={p} onSelect={() => setSelectedPick(p)} />
                                    ))}
                                </div>
                            )
                        )}

                        {/* ── Your Actions ───────────────────────────────────────── */}
                        {activeTab === 'actions' && (
                            actionsCount === 0 || !overlay ? (
                                <div className="p-8 text-center text-slate-400 text-sm bg-slate-50 dark:bg-card rounded-xl">
                                    Nothing needs your attention
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                    {([
                                        {
                                            title: 'Positions Near Action',
                                            icon: <ShieldAlert className="w-4 h-4" />,
                                            color: 'text-rose-700 dark:text-rose-400',
                                            rows: overlay.positions_near_action.map(p => ({
                                                key: p.ticker, left: p.ticker,
                                                right: p.near.replace(/_/g, ' ').toLowerCase(),
                                            })),
                                        },
                                        {
                                            title: 'Signals Against Holdings',
                                            icon: <TrendingDown className="w-4 h-4" />,
                                            color: 'text-amber-700 dark:text-amber-400',
                                            rows: overlay.signal_flips.map(f => ({
                                                key: `${f.symbol}-${f.source}`, left: f.symbol,
                                                right: f.source.replace(/_/g, ' ').toLowerCase(),
                                            })),
                                        },
                                        {
                                            title: 'Watchlist Triggers',
                                            icon: <Zap className="w-4 h-4" />,
                                            color: 'text-primary',
                                            rows: overlay.watchlist_triggers.map(w => ({
                                                key: w.ticker, left: w.ticker,
                                                right: w.close.toFixed(1),
                                            })),
                                        },
                                    ] as const).map(col => (
                                        <div key={col.title}>
                                            <h3 className={cn('flex items-center gap-2 text-sm font-semibold mb-4', col.color)}>
                                                {col.icon}{col.title}
                                                <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full border bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700">
                                                    {col.rows.length}
                                                </span>
                                            </h3>
                                            <div className="space-y-2">
                                                {col.rows.length === 0 ? (
                                                    <div className="p-6 text-center text-slate-400 text-xs bg-slate-50 dark:bg-card rounded-xl">None</div>
                                                ) : col.rows.map(r => (
                                                    <div key={r.key} className="flex items-center justify-between p-3 bg-white dark:bg-card rounded-xl border border-border dark:border-slate-800">
                                                        <Link href={`/ticker/${r.left}`} className="text-xs font-semibold text-slate-800 dark:text-slate-200 hover:underline">
                                                            {r.left}
                                                        </Link>
                                                        <span className="text-[10px] font-semibold text-slate-400 tabular-nums">{r.right}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )
                        )}

                        {/* ── Catalysts ──────────────────────────────────────────── */}
                        {activeTab === 'catalysts' && (
                            catalysts.length === 0 ? (
                                <div className="p-8 text-center text-slate-400 text-sm bg-slate-50 dark:bg-card rounded-xl">
                                    No catalysts in the next 14 days
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                                    {catalysts.map(c => (
                                        <div key={`${c.symbol}-${c.type}-${c.date}`}
                                            className="bg-white dark:bg-card border border-border dark:border-slate-800 rounded-xl p-4 shadow-sm hover:shadow-md transition-all">
                                            <div className="flex items-center justify-between mb-2">
                                                <Link href={`/ticker/${c.symbol}`} className="font-semibold text-sm text-slate-900 dark:text-slate-100 hover:underline">
                                                    {c.symbol}
                                                </Link>
                                                <span className="px-2 py-0.5 rounded-lg text-[10px] font-semibold border bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-800/30">
                                                    in {c.days_away}d
                                                </span>
                                            </div>
                                            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 capitalize">
                                                {c.type.replace(/_/g, ' ').toLowerCase()} · {format(parseISO(c.date), 'MMM dd')}
                                            </div>
                                            {c.detail && (
                                                <div className="text-[10px] text-slate-400 mt-1 line-clamp-2">{c.detail}</div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )
                        )}
                    </div>
                </div>

                <style jsx global>{`
                    .no-scrollbar::-webkit-scrollbar { display: none; }
                    .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
                `}</style>
            </div>
        </DashboardLayout>
    );
}
