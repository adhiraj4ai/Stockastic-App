'use client';

import React, { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { formatDistanceToNow, format } from 'date-fns';
import { useRouter } from 'next/navigation';
import {
    Bell, AlertCircle, CheckCheck, Filter, Loader2, RefreshCw, Target, Trash2, Info,
} from 'lucide-react';
import {
    type AppNotification, type Category, type Severity, CATEGORIES, getCategory,
    getMetrics, getSeverity, getTypeConfig, SEVERITY_DOT, TONE_CLASSES,
} from '@/lib/notifications/config';
import { useNotifications } from '@/components/notifications/NotificationProvider';
import { NotificationDetail } from '@/components/notifications/NotificationDetail';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { formatNepaliNumber } from '@/lib/formatters';

const SEVERITY_FILTERS: Array<{ key: Severity | 'all'; label: string; icon: React.ReactNode }> = [
    { key: 'all', label: 'All', icon: <Bell size={14} /> },
    { key: 'critical', label: 'Critical', icon: <AlertCircle size={14} /> },
    { key: 'high', label: 'High', icon: <Target size={14} /> },
    { key: 'normal', label: 'Normal', icon: <Info size={14} /> },
    { key: 'low', label: 'Low', icon: <Filter size={14} /> },
];

function groupByDate(list: AppNotification[]): Record<string, AppNotification[]> {
    const grouped: Record<string, AppNotification[]> = {};
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    for (const n of list) {
        const d = new Date(n.created_at);
        const label = d.toDateString() === now.toDateString() ? 'Today'
            : d.toDateString() === yesterday.toDateString() ? 'Yesterday'
            : format(d, 'dd MMM yyyy');
        (grouped[label] ||= []).push(n);
    }
    return grouped;
}

function NotificationRow({ n, onClick }: { n: AppNotification; onClick: () => void }) {
    const config = getTypeConfig(n.type);
    const tone = TONE_CLASSES[config.tone];
    const severity = getSeverity(n);
    const metrics = getMetrics(n);
    const Icon = config.icon;

    return (
        <div
            onClick={onClick}
            className={`relative flex cursor-pointer gap-3.5 rounded-lg border p-4 transition-colors ${
                n.read
                    ? 'border-border bg-card opacity-75 hover:opacity-100'
                    : 'border-primary/20 bg-primary/[0.03] hover:bg-primary/[0.06]'
            }`}
        >
            {!n.read && <span className="absolute right-3.5 top-3.5 h-2 w-2 rounded-full bg-primary" />}
            <span className={`mt-0.5 h-fit rounded-md p-2 ${tone.icon}`}><Icon size={15} /></span>
            <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-start justify-between gap-3 pr-4">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY_DOT[severity]}`} />
                        <h4 className={`truncate text-sm font-semibold ${n.read ? 'text-muted-foreground' : 'text-foreground'}`}>
                            {n.title}
                        </h4>
                    </div>
                    <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </span>
                </div>
                <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{n.message}</p>
                <div className="flex items-center gap-2 pt-0.5">
                    {n.ticker && n.ticker !== 'SUMMARY' && (
                        <span className="rounded border border-border bg-secondary px-1.5 text-[10px] font-semibold text-secondary-foreground tabular-nums">
                            {n.ticker}
                        </span>
                    )}
                    {n.ticker === 'SUMMARY' && (
                        <span className="rounded border border-border bg-secondary px-1.5 text-[10px] font-semibold text-secondary-foreground">
                            {n.metadata?.count ?? n.metadata?.symbols?.length ?? 0} assets
                        </span>
                    )}
                    {metrics.slice(0, 2).map(m => (
                        <span
                            key={m.label}
                            className={`text-[10px] font-semibold tabular-nums ${
                                m.kind === 'percent'
                                    ? m.value >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'
                                    : 'text-muted-foreground'
                            }`}
                        >
                            {m.label}{' '}
                            {m.kind === 'price' ? `Rs. ${formatNepaliNumber(m.value)}`
                                : m.kind === 'percent' ? `${m.value >= 0 ? '+' : ''}${m.value.toFixed(1)}%`
                                : m.value.toFixed(1)}
                        </span>
                    ))}
                    <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground/70">
                        {getCategory(n.type)}
                    </span>
                </div>
            </div>
        </div>
    );
}

export default function AlertsPage() {
    const {
        notifications, loading, markRead, markAllRead, deleteRead, triggerCheck, refresh,
    } = useNotifications();
    const [severity, setSeverity] = useState<Severity | 'all'>('all');
    const [category, setCategory] = useState<Category | 'all'>('all');
    const [unreadOnly, setUnreadOnly] = useState(false);
    const [busy, setBusy] = useState(false);
    const [selected, setSelected] = useState<AppNotification | null>(null);
    const router = useRouter();

    const filtered = notifications.filter(n =>
        (severity === 'all' || getSeverity(n) === severity) &&
        (category === 'all' || getCategory(n.type) === category) &&
        (!unreadOnly || !n.read)
    );
    const unreadCount = filtered.filter(n => !n.read).length;
    const grouped = groupByDate(filtered);

    const run = async (fn: () => Promise<void>) => {
        setBusy(true);
        try { await fn(); } finally { setBusy(false); }
    };

    const open = (n: AppNotification) => {
        if (!n.read) markRead(n.id);
        setSelected(n);
    };

    return (
        <DashboardLayout title="Alerts" subtitle="Position tracking and market monitoring">
            <div className="space-y-5">
                {/* Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
                        {SEVERITY_FILTERS.map(s => (
                            <button
                                key={s.key}
                                onClick={() => setSeverity(s.key)}
                                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                                    severity === s.key
                                        ? 'bg-card text-foreground shadow-sm'
                                        : 'text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                {s.icon} {s.label}
                                {s.key === 'all' && unreadCount > 0 && (
                                    <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                                        {unreadCount}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setUnreadOnly(v => !v)}
                            className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                                unreadOnly
                                    ? 'border-primary bg-primary text-primary-foreground'
                                    : 'border-border bg-card text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            <Filter size={12} /> Unread only
                        </button>
                        <button
                            onClick={() => run(async () => { await triggerCheck(); await refresh(); })}
                            disabled={busy}
                            className="flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                        >
                            <RefreshCw size={13} className={busy ? 'animate-spin' : ''} /> Check new alerts
                        </button>
                        {unreadCount > 0 && (
                            <button
                                onClick={() => run(markAllRead)}
                                disabled={busy}
                                className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                            >
                                <CheckCheck size={12} /> Mark all read
                            </button>
                        )}
                        <button
                            onClick={() => run(deleteRead)}
                            disabled={busy}
                            className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/5 disabled:opacity-50"
                        >
                            <Trash2 size={12} /> Delete read
                        </button>
                    </div>
                </div>

                {/* Feed + sidebar */}
                <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
                    <div className="space-y-6 md:col-span-8">
                        {loading ? (
                            <div className="flex items-center justify-center py-24">
                                <Loader2 className="animate-spin text-primary" size={26} />
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-card py-24">
                                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                                    <Bell size={22} className="text-muted-foreground/50" />
                                </div>
                                <p className="text-sm text-muted-foreground">No alerts found</p>
                                {(category !== 'all' || severity !== 'all' || unreadOnly) && (
                                    <button
                                        onClick={() => { setCategory('all'); setSeverity('all'); setUnreadOnly(false); }}
                                        className="text-xs font-medium text-primary hover:underline"
                                    >
                                        Clear all filters
                                    </button>
                                )}
                            </div>
                        ) : (
                            Object.entries(grouped).map(([dateLabel, items]) => (
                                <div key={dateLabel}>
                                    <div className="mb-3 flex items-center gap-3 px-1">
                                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{dateLabel}</span>
                                        <div className="h-px flex-1 bg-border" />
                                        <span className="text-[10px] tabular-nums text-muted-foreground/60">{items.length}</span>
                                    </div>
                                    <div className="space-y-2">
                                        {items.map(n => <NotificationRow key={n.id} n={n} onClick={() => open(n)} />)}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    <div className="md:col-span-4">
                        <div className="sticky top-5 overflow-hidden rounded-lg border border-border bg-card">
                            <div className="border-b border-border bg-muted/50 px-4 py-2.5">
                                <h3 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    <Filter size={12} /> Filter by area
                                </h3>
                            </div>
                            <div className="space-y-0.5 p-2">
                                {[{ key: 'all' as const, label: 'All areas', icon: Bell }, ...CATEGORIES].map(cat => {
                                    const inCat = (n: AppNotification) =>
                                        (cat.key === 'all' || getCategory(n.type) === cat.key) &&
                                        (severity === 'all' || getSeverity(n) === severity);
                                    const count = notifications.filter(inCat).length;
                                    const unread = notifications.filter(n => !n.read && inCat(n)).length;
                                    return (
                                        <button
                                            key={cat.key}
                                            onClick={() => setCategory(cat.key)}
                                            className={`flex w-full items-center justify-between rounded-md p-2 transition-colors ${
                                                category === cat.key
                                                    ? 'bg-primary/10 text-primary'
                                                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                                            }`}
                                        >
                                            <span className="flex items-center gap-2.5 text-xs font-medium">
                                                <cat.icon size={14} /> {cat.label}
                                            </span>
                                            <span className="flex items-center gap-1.5">
                                                {unread > 0 && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                                                <span className="text-[10px] tabular-nums">{count}</span>
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
                <DialogContent className="sm:max-w-lg">
                    <DialogTitle className="sr-only">{selected?.title ?? 'Notification'}</DialogTitle>
                    {selected && (
                        <NotificationDetail
                            notification={selected}
                            onClose={() => setSelected(null)}
                            onNavigate={(href) => router.push(href)}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </DashboardLayout>
    );
}
