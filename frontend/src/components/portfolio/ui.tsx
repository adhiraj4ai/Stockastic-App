'use client';

import { type ComponentType, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { InfoTooltip } from '@/components/ui/InfoTooltip';

export type Accent = 'blue' | 'emerald' | 'amber' | 'indigo' | 'rose';

type IconType = ComponentType<{ className?: string }>;

// Static class strings per accent — never build these dynamically (Tailwind JIT safety).
const ACCENTS: Record<Accent, { chip: string; grad: string; icon: string }> = {
    blue: { chip: 'bg-blue-500/15 text-blue-500', grad: 'from-blue-500/15 to-transparent', icon: 'text-blue-500' },
    emerald: { chip: 'bg-emerald-500/15 text-emerald-500', grad: 'from-emerald-500/15 to-transparent', icon: 'text-emerald-500' },
    amber: { chip: 'bg-amber-500/15 text-amber-500', grad: 'from-amber-500/15 to-transparent', icon: 'text-amber-500' },
    indigo: { chip: 'bg-indigo-500/15 text-indigo-500', grad: 'from-indigo-500/15 to-transparent', icon: 'text-indigo-500' },
    rose: { chip: 'bg-rose-500/15 text-rose-500', grad: 'from-rose-500/15 to-transparent', icon: 'text-rose-500' },
};

export function SectionCard({
    accent,
    icon: Icon,
    title,
    info,
    badges,
    actions,
    className,
    bodyClassName,
    children,
}: {
    accent: Accent;
    icon: IconType;
    title: string;
    info?: string;
    badges?: ReactNode;
    actions?: ReactNode;
    className?: string;
    bodyClassName?: string;
    children: ReactNode;
}) {
    const a = ACCENTS[accent];
    return (
        <div className={cn('rounded-2xl border border-border bg-card shadow-sm hover:shadow-md transition-shadow', className)}>
            <div className={cn('flex flex-wrap items-center gap-2 rounded-t-2xl bg-gradient-to-r px-4 py-2.5', a.grad)}>
                <Icon className={cn('h-4 w-4 shrink-0', a.icon)} />
                <span className="text-xs font-semibold text-foreground">{title}</span>
                {info && <InfoTooltip content={info} />}
                {badges}
                {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
            </div>
            <div className={cn('p-4', bodyClassName)}>{children}</div>
        </div>
    );
}

export function KpiCard({
    accent,
    icon: Icon,
    label,
    info,
    value,
    valueClassName,
    sub,
}: {
    accent: Accent;
    icon: IconType;
    label: string;
    info?: string;
    value: ReactNode;
    valueClassName?: string;
    sub?: ReactNode;
}) {
    const a = ACCENTS[accent];
    return (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2">
                <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', a.chip)}>
                    <Icon className="h-3.5 w-3.5" />
                </div>
                <span className="flex items-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {label}
                    {info && <InfoTooltip content={info} />}
                </span>
            </div>
            <div className={cn('mt-2 text-xl font-semibold tabular-nums text-foreground', valueClassName)}>{value}</div>
            {sub && <div className="mt-1.5">{sub}</div>}
        </div>
    );
}

export function SentimentBadge({
    tone,
    className,
    children,
}: {
    tone: 'up' | 'down' | 'warn' | 'neutral';
    className?: string;
    children: ReactNode;
}) {
    const tones = {
        up: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25',
        down: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25',
        warn: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25',
        neutral: 'bg-muted text-muted-foreground border-border',
    };
    return (
        <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold tabular-nums', tones[tone], className)}>
            {children}
        </span>
    );
}

export function FadeIn({
    delay = 0,
    className,
    children,
}: {
    delay?: number;
    className?: string;
    children: ReactNode;
}) {
    return (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay }} className={className}>
            {children}
        </motion.div>
    );
}

export function KpiSkeleton() {
    return (
        <div className="animate-pulse rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-muted" />
                <div className="h-2.5 w-24 rounded bg-muted" />
            </div>
            <div className="mt-3 h-6 w-32 rounded bg-muted" />
            <div className="mt-2 h-4 w-20 rounded-full bg-muted" />
        </div>
    );
}

export function CardSkeleton({ rows = 6 }: { rows?: number }) {
    return (
        <div className="animate-pulse rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="mb-4 h-4 w-40 rounded bg-muted" />
            <div className="space-y-3">
                {Array.from({ length: rows }, (_, i) => (
                    <div key={i} className="h-8 rounded bg-muted/70" />
                ))}
            </div>
        </div>
    );
}
