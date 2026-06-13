'use client';

import React from 'react';
import { X } from 'lucide-react';
import {
    type AppNotification, type Metric, getMetrics, getQuickActions, getSeverity, getTypeConfig,
    getVariant, buildRoute, SEVERITY_DOT, TONE_CLASSES,
} from '@/lib/notifications/config';
import { formatNepaliNumber } from '@/lib/formatters';

interface Props {
    notification: AppNotification;
    onDismiss: () => void;
    onNavigate: (href: string) => void;
}

function MetricValue({ value, kind }: { value: number; kind: Metric['kind'] }) {
    if (kind === 'percent') {
        const positive = value >= 0;
        return (
            <span className={`tabular-nums font-semibold ${positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
                {positive ? '+' : ''}{value.toFixed(1)}%
            </span>
        );
    }
    if (kind === 'price') {
        return <span className="tabular-nums font-semibold text-foreground">Rs. {formatNepaliNumber(value)}</span>;
    }
    return <span className="tabular-nums font-semibold text-foreground">{value.toFixed(1)}</span>;
}

export function NotificationToast({ notification: n, onDismiss, onNavigate }: Props) {
    const variant = getVariant(n);
    const severity = getSeverity(n);
    const config = getTypeConfig(n.type);
    const tone = TONE_CLASSES[config.tone];
    const metrics = getMetrics(n);
    const route = buildRoute(n);
    const Icon = config.icon;

    const tickerChip = n.ticker && n.ticker !== 'SUMMARY' && (
        <span className="text-[11px] font-semibold px-1.5 py-px rounded bg-secondary text-secondary-foreground border border-border tabular-nums">
            {n.ticker}
        </span>
    );

    // A — quiet line: one row, click-through anywhere.
    if (variant === 'line') {
        const key = metrics[0];
        return (
            <div
                role="button"
                tabIndex={0}
                onClick={() => onNavigate(route)}
                onKeyDown={(e) => { if (e.key === 'Enter') onNavigate(route); }}
                className="relative w-[356px] cursor-pointer overflow-hidden rounded-lg border border-border bg-card px-3.5 py-2.5 text-card-foreground shadow-md"
            >
                <span className={`absolute inset-y-0 left-0 w-[3px] ${SEVERITY_DOT[severity]}`} />
                <div className="flex items-center gap-2 pl-1">
                    <Icon size={14} className={tone.text} />
                    <span className="text-[13px] font-semibold truncate">{n.title}</span>
                    {tickerChip}
                    {key && <MetricValue value={key.value} kind={key.kind} />}
                    <button
                        onClick={(e) => { e.stopPropagation(); onDismiss(); }}
                        className="ml-auto text-muted-foreground/60 hover:text-foreground"
                        aria-label="Close"
                    >
                        <X size={13} />
                    </button>
                </div>
            </div>
        );
    }

    const symbols: string[] = n.metadata?.symbols ?? [];
    const quickActions = getQuickActions(n);

    // B (card) and C (panel) share the shell; panel adds chips + quick actions.
    return (
        <div className="relative w-[356px] overflow-hidden rounded-lg border border-border bg-card p-3.5 text-card-foreground shadow-md">
            <span className={`absolute inset-y-0 left-0 w-[3px] ${SEVERITY_DOT[severity]}`} />
            <button
                onClick={onDismiss}
                className="absolute right-2.5 top-2.5 text-muted-foreground/60 hover:text-foreground"
                aria-label="Close"
            >
                <X size={13} />
            </button>
            <div className="flex items-center gap-2 pl-1 pr-5">
                <span className={`p-1 rounded-md ${tone.icon}`}><Icon size={13} /></span>
                <span className="text-[13px] font-semibold truncate">{n.title}</span>
                {tickerChip}
            </div>
            <p className="mt-1 pl-1 text-xs leading-relaxed text-muted-foreground line-clamp-2">{n.message}</p>

            {variant === 'panel' && symbols.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5 pl-1">
                    {symbols.slice(0, 6).map(s => (
                        <button
                            key={s}
                            onClick={() => onNavigate(`/ticker/${s}`)}
                            className="text-[11px] font-semibold px-1.5 py-px rounded bg-secondary text-secondary-foreground border border-border hover:border-foreground/30 tabular-nums"
                        >
                            {s}
                        </button>
                    ))}
                    {symbols.length > 6 && (
                        <span className="text-[11px] text-muted-foreground">+{symbols.length - 6}</span>
                    )}
                </div>
            )}

            {variant === 'card' && metrics.length > 0 && (
                <div className="mt-2 flex gap-4 border-t border-border/60 pl-1 pt-2">
                    {metrics.map(m => (
                        <div key={m.label}>
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{m.label}</div>
                            <div className="text-[13px]"><MetricValue value={m.value} kind={m.kind} /></div>
                        </div>
                    ))}
                </div>
            )}

            <div className="mt-2.5 flex gap-2 pl-1">
                {variant === 'panel' && quickActions.length > 0 ? (
                    quickActions.map((a, i) => (
                        <button
                            key={a.label}
                            onClick={() => onNavigate(a.href)}
                            className={i === 0
                                ? 'rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90'
                                : 'rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground'}
                        >
                            {a.label}
                        </button>
                    ))
                ) : (
                    <button
                        onClick={() => onNavigate(route)}
                        className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                    >
                        View
                    </button>
                )}
                <button
                    onClick={onDismiss}
                    className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                    Dismiss
                </button>
            </div>
        </div>
    );
}
