'use client';

import React from 'react';
import { format } from 'date-fns';
import { ExternalLink } from 'lucide-react';
import {
    type AppNotification, buildRoute, getMetrics, getQuickActions,
    getSeverity, getTypeConfig, SEVERITY_DOT, TONE_CLASSES,
} from '@/lib/notifications/config';
import { formatNepaliNumber } from '@/lib/formatters';

interface Props {
    notification: AppNotification;
    onClose: () => void;
    onNavigate: (href: string) => void;
}

export function NotificationDetail({ notification: n, onClose, onNavigate }: Props) {
    const config = getTypeConfig(n.type);
    const tone = TONE_CLASSES[config.tone];
    const severity = getSeverity(n);
    const metrics = getMetrics(n);
    const Icon = config.icon;
    const items: any[] = n.metadata?.items
        ?? (n.metadata?.symbols ?? []).map((s: string) => ({ symbol: s, detail: null, price: null }));
    const strategies: string[] = n.metadata?.strategies ?? [];
    const quickActions = getQuickActions(n);

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-start gap-3">
                <span className={`p-2 rounded-md ${tone.icon}`}><Icon size={16} /></span>
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <span className={`h-1.5 w-1.5 rounded-full ${SEVERITY_DOT[severity]}`} />
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            {n.type.replace(/_/g, ' ')} · {format(new Date(n.created_at), 'dd MMM, HH:mm')}
                        </span>
                    </div>
                    <h3 className="mt-1 text-base font-semibold leading-tight text-foreground">{n.title}</h3>
                </div>
            </div>

            <p className="text-sm leading-relaxed text-muted-foreground">{n.message}</p>

            {/* Metrics strip */}
            {metrics.length > 0 && (
                <div className="flex gap-6 rounded-lg border border-border bg-muted/40 px-4 py-3">
                    {metrics.map(m => (
                        <div key={m.label}>
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{m.label}</div>
                            <div className={`text-sm font-semibold tabular-nums ${
                                m.kind === 'percent'
                                    ? m.value >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'
                                    : 'text-foreground'
                            }`}>
                                {m.kind === 'price' && 'Rs. '}
                                {m.kind === 'percent' && m.value >= 0 && '+'}
                                {m.kind === 'price' ? formatNepaliNumber(m.value) : m.value.toFixed(m.kind === 'percent' ? 2 : 1)}
                                {m.kind === 'percent' && '%'}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Strategies (signal alerts) */}
            {strategies.length > 0 && (
                <div>
                    <div className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">Strategies</div>
                    <div className="flex flex-wrap gap-1.5">
                        {strategies.map(s => (
                            <span key={s} className="rounded border border-border bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-secondary-foreground">
                                {s}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Symbol breakdown (summaries) */}
            {items.length > 0 && (
                <div className="overflow-hidden rounded-lg border border-border">
                    <div className="max-h-[280px] overflow-y-auto custom-scrollbar">
                        <table className="w-full text-left">
                            <thead className="sticky top-0 border-b border-border bg-muted/60">
                                <tr>
                                    <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Symbol</th>
                                    <th className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Detail</th>
                                    <th className="px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Price</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/60">
                                {items.map((item, idx) => (
                                    <tr
                                        key={`${item.symbol}-${idx}`}
                                        onClick={() => { onClose(); onNavigate(`/ticker/${item.symbol}`); }}
                                        className="group cursor-pointer transition-colors hover:bg-accent"
                                    >
                                        <td className="px-4 py-2.5">
                                            <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground group-hover:text-primary">
                                                {item.symbol}
                                                <ExternalLink size={10} className="opacity-0 transition-opacity group-hover:opacity-100" />
                                            </span>
                                        </td>
                                        <td className="px-4 py-2.5 text-[11px] text-muted-foreground">{item.detail ?? '—'}</td>
                                        <td className="px-4 py-2.5 text-right text-xs tabular-nums text-foreground">
                                            {item.price != null ? `Rs. ${formatNepaliNumber(item.price)}` : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Footer actions */}
            <div className="flex gap-2 pt-1">
                {(quickActions.length > 0 ? quickActions : [{ label: 'View details', href: buildRoute(n) }]).map((a, i) => (
                    <button
                        key={a.label}
                        onClick={() => { onClose(); onNavigate(a.href); }}
                        className={i === 0
                            ? 'flex-1 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90'
                            : 'flex-1 rounded-md border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground'}
                    >
                        {a.label}
                    </button>
                ))}
                <button
                    onClick={onClose}
                    className="flex-1 rounded-md border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                    Dismiss
                </button>
            </div>
        </div>
    );
}
