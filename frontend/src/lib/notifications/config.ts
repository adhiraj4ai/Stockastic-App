import type { LucideIcon } from 'lucide-react';
import {
    AlertCircle, Bell, CalendarClock, CheckCircle, Eye, Filter, Fish, Info,
    ShieldAlert, Target, TrendingDown, TrendingUp, Zap,
} from 'lucide-react';

export type Severity = 'critical' | 'high' | 'normal' | 'low';
export type PopupVariant = 'panel' | 'card' | 'line' | 'none';
export type Tone = 'danger' | 'success' | 'warning' | 'info' | 'accent';
export type Category = 'portfolio' | 'watchlist' | 'signals' | 'technical' | 'broker' | 'market' | 'system';

export interface AppNotification {
    id: number;
    title: string;
    message: string;
    type: string;
    ticker: string | null;
    read: boolean;
    created_at: string;
    redirect_url?: string | null;
    severity?: Severity;
    metadata?: Record<string, any> | null;
}

export interface Metric {
    label: string;
    value: number;
    kind: 'price' | 'percent' | 'number';
}

interface TypeConfig {
    icon: LucideIcon;
    tone: Tone;
    category: Category;
    severity: Severity;   // fallback only — backend value wins
    variant: PopupVariant;
}

const T = (icon: LucideIcon, tone: Tone, category: Category, severity: Severity, variant: PopupVariant): TypeConfig =>
    ({ icon, tone, category, severity, variant });

export const NOTIFICATION_TYPES: Record<string, TypeConfig> = {
    // Portfolio — money events
    STOP_LOSS_HIT: T(ShieldAlert, 'danger', 'portfolio', 'critical', 'card'),
    TARGET_REACHED: T(Target, 'success', 'portfolio', 'high', 'card'),
    TAKE_PROFIT: T(Target, 'success', 'portfolio', 'high', 'card'),
    SIGNIFICANT_GAIN: T(TrendingUp, 'success', 'portfolio', 'high', 'card'),
    SIGNIFICANT_LOSS: T(TrendingDown, 'danger', 'portfolio', 'high', 'card'),
    BELOW_WACC: T(TrendingDown, 'warning', 'portfolio', 'low', 'none'),
    PORTFOLIO_DIVERSITY: T(Filter, 'warning', 'portfolio', 'low', 'none'),
    // Watchlist
    WATCHLIST_ENTRY: T(Eye, 'accent', 'watchlist', 'high', 'panel'),
    WATCHLIST_BREAKOUT: T(TrendingUp, 'accent', 'watchlist', 'high', 'card'),
    // Signals
    SIGNAL_BUY: T(TrendingUp, 'success', 'signals', 'normal', 'line'),
    SIGNAL_SELL: T(TrendingDown, 'warning', 'signals', 'normal', 'line'),
    SIGNAL_STRONG_BUY: T(TrendingUp, 'success', 'signals', 'high', 'card'),
    SIGNAL_STRONG_SELL: T(TrendingDown, 'danger', 'signals', 'high', 'card'),
    DAILY_PLAN_READY: T(CalendarClock, 'accent', 'system', 'high', 'panel'),
    // Technical
    VOLUME_SPIKE: T(Zap, 'warning', 'technical', 'normal', 'line'),
    RSI_OVERSOLD: T(Target, 'success', 'technical', 'normal', 'line'),
    RSI_OVERBOUGHT: T(AlertCircle, 'warning', 'technical', 'normal', 'line'),
    MACD_BULLISH: T(TrendingUp, 'success', 'technical', 'normal', 'line'),
    MACD_BEARISH: T(TrendingDown, 'warning', 'technical', 'normal', 'line'),
    GOLDEN_CROSS: T(TrendingUp, 'success', 'technical', 'normal', 'line'),
    DEATH_CROSS: T(TrendingDown, 'danger', 'technical', 'normal', 'line'),
    // Broker / smart money
    WHALE_BUY: T(Fish, 'accent', 'broker', 'normal', 'line'),
    WHALE_SELL: T(Fish, 'warning', 'broker', 'normal', 'line'),
    WHALE_ENTRY: T(Fish, 'accent', 'broker', 'high', 'card'),
    TREND_BUY_5D: T(TrendingUp, 'accent', 'broker', 'normal', 'line'),
    CONSISTENT_BUYING: T(TrendingUp, 'success', 'broker', 'normal', 'line'),
    CONSISTENT_SELLING: T(TrendingDown, 'warning', 'broker', 'normal', 'line'),
    // Market
    SECTOR_PUMP: T(TrendingUp, 'accent', 'market', 'normal', 'line'),
    MARKET_BREADTH_SHIFT: T(AlertCircle, 'accent', 'market', 'normal', 'line'),
    // General
    PRICE_ALERT: T(Bell, 'accent', 'system', 'high', 'card'),
    INFO: T(Info, 'info', 'system', 'normal', 'line'),
    SUCCESS: T(CheckCircle, 'success', 'system', 'normal', 'line'),
    WARNING: T(AlertCircle, 'warning', 'system', 'normal', 'line'),
};

const FALLBACK: TypeConfig = T(Info, 'info', 'system', 'normal', 'line');

export function getTypeConfig(type: string): TypeConfig {
    return NOTIFICATION_TYPES[type] ?? FALLBACK;
}

export function getSeverity(n: AppNotification): Severity {
    return n.severity ?? getTypeConfig(n.type).severity;
}

export function getVariant(n: AppNotification): PopupVariant {
    // Multi-symbol summaries always get the action panel — symbol chips need room.
    if (n.ticker === 'SUMMARY' || (n.metadata?.symbols?.length ?? 0) > 1) return 'panel';
    return getTypeConfig(n.type).variant;
}

export function buildRoute(n: AppNotification): string {
    if (n.redirect_url) return n.redirect_url;
    if (n.ticker && n.ticker !== 'SUMMARY') return `/ticker/${n.ticker}`;
    return '/notifications';
}

export function getQuickActions(n: AppNotification): Array<{ label: string; href: string }> {
    if (n.type === 'DAILY_PLAN_READY') {
        return [
            { label: 'Open briefing', href: n.redirect_url || '/plan' },
            { label: 'View plan', href: '/plan' },
        ];
    }
    if (n.ticker === 'SUMMARY' || (n.metadata?.symbols?.length ?? 0) > 1) {
        return [{ label: 'Review all', href: buildRoute(n) }];
    }
    return [];
}

const LEVEL_LABEL: Record<string, string> = { stop: 'Stop', target: 'Target' };

export function getMetrics(n: AppNotification): Metric[] {
    const md = n.metadata;
    if (!md) return [];
    const metrics: Metric[] = [];
    if (typeof md.price === 'number') metrics.push({ label: 'LTP', value: md.price, kind: 'price' });
    if (typeof md.level === 'number') {
        metrics.push({ label: LEVEL_LABEL[md.level_type] ?? 'Level', value: md.level, kind: 'price' });
    }
    if (typeof md.change_pct === 'number') metrics.push({ label: 'Change', value: md.change_pct, kind: 'percent' });
    if (typeof md.rsi === 'number') metrics.push({ label: 'RSI', value: md.rsi, kind: 'number' });
    if (typeof md.vol_multiplier === 'number') metrics.push({ label: 'Vol ×', value: md.vol_multiplier, kind: 'number' });
    return metrics.slice(0, 3);
}

export const POPUP_DURATION: Record<Severity, number> = {
    critical: Infinity,
    high: 10_000,
    normal: 6_000,
    low: 6_000,
};

// Theme-token classes per tone — surfaces stay flat, only the accent varies.
export const TONE_CLASSES: Record<Tone, { icon: string; bar: string; text: string }> = {
    danger:  { icon: 'bg-destructive/10 text-destructive', bar: 'bg-destructive', text: 'text-destructive' },
    success: { icon: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400', bar: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
    warning: { icon: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', bar: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' },
    info:    { icon: 'bg-muted text-muted-foreground', bar: 'bg-muted-foreground', text: 'text-muted-foreground' },
    accent:  { icon: 'bg-primary/10 text-primary', bar: 'bg-primary', text: 'text-primary' },
};

export const SEVERITY_DOT: Record<Severity, string> = {
    critical: 'bg-destructive',
    high: 'bg-amber-500',
    normal: 'bg-primary',
    low: 'bg-muted-foreground',
};

export const CATEGORIES: Array<{ key: Category; label: string; icon: LucideIcon }> = [
    { key: 'portfolio', label: 'Portfolio', icon: Target },
    { key: 'watchlist', label: 'Watchlist', icon: Eye },
    { key: 'signals', label: 'Signals', icon: TrendingUp },
    { key: 'technical', label: 'Technical', icon: Zap },
    { key: 'broker', label: 'Broker Analysis', icon: Fish },
    { key: 'market', label: 'Market Trends', icon: AlertCircle },
    { key: 'system', label: 'System', icon: Info },
];

export function getCategory(type: string): Category {
    return getTypeConfig(type).category;
}
