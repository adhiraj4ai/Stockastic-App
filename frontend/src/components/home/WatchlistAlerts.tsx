'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Eye, Bell, ArrowRight, TrendingUp, TrendingDown, ShieldAlert, Plus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatNepaliNumber } from '@/lib/formatters';

interface WatchlistRow {
    id: number;
    ticker: string;
    current_price?: number | null;
    day_change_percent?: number | null;
    sector?: string | null;
}

interface NotificationRow {
    id: number;
    title: string;
    message: string;
    type: string;
    ticker?: string | null;
    created_at: string;
}

export function WatchlistAlerts() {
    const [watchlist, setWatchlist] = useState<WatchlistRow[]>([]);
    const [alerts, setAlerts] = useState<NotificationRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            const [wlRes, ntRes] = await Promise.allSettled([
                api.get('/api/stocks/watchlist/'),
                api.get('/api/stocks/notifications/', { params: { unread: 'true' } }),
            ]);
            if (cancelled) return;
            setWatchlist(wlRes.status === 'fulfilled' && Array.isArray(wlRes.value.data) ? wlRes.value.data.slice(0, 8) : []);
            setAlerts(ntRes.status === 'fulfilled' && Array.isArray(ntRes.value.data) ? ntRes.value.data.slice(0, 5) : []);
            setFailed(wlRes.status === 'rejected' && ntRes.status === 'rejected');
            setLoading(false);
        };
        load();
        return () => { cancelled = true; };
    }, []);

    return (
        <Card className="h-full">
            <CardHeader className="px-5 py-4 border-b border-border">
                <div className="flex justify-between items-center">
                    <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <Eye size={14} className="text-muted-foreground" /> Watchlist &amp; Alerts
                    </CardTitle>
                    <div className="flex items-center gap-4 text-xs">
                        <Link href="/portfolio/watchlist" className="text-muted-foreground hover:text-foreground flex items-center gap-1">
                            Watchlist <ArrowRight size={12} />
                        </Link>
                        <Link href="/notifications" className="text-muted-foreground hover:text-foreground flex items-center gap-1">
                            Alerts <ArrowRight size={12} />
                        </Link>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
                {loading ? (
                    <div className="text-sm text-muted-foreground animate-pulse py-4">Loading your watchlist…</div>
                ) : failed ? (
                    <div className="text-sm text-muted-foreground flex items-center gap-2 py-4">
                        <ShieldAlert size={14} /> Couldn&apos;t load watchlist or alerts.
                    </div>
                ) : (
                    <>
                        <div>
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Watchlist</div>
                            {watchlist.length === 0 ? (
                                <Link
                                    href="/portfolio/watchlist"
                                    className="flex items-center gap-2 px-2 py-3 rounded-md border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                                >
                                    <Plus size={13} /> Your watchlist is empty — add tickers to track them here.
                                </Link>
                            ) : watchlist.map(row => {
                                const change = Number(row.day_change_percent ?? 0);
                                const positive = change >= 0;
                                return (
                                    <Link
                                        key={row.id}
                                        href={`/ticker/${row.ticker}`}
                                        className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-accent transition-colors"
                                    >
                                        <div className="min-w-0">
                                            <span className="text-xs font-medium text-foreground">{row.ticker}</span>
                                            {row.sector && <span className="ml-2 text-[10px] text-muted-foreground">{row.sector}</span>}
                                        </div>
                                        <div className="flex items-center gap-3 tabular-nums">
                                            {row.current_price != null && (
                                                <span className="text-xs font-mono text-foreground">{formatNepaliNumber(row.current_price)}</span>
                                            )}
                                            <span className={`flex items-center gap-0.5 text-xs font-medium w-16 justify-end ${positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                                {positive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                                                {change.toFixed(2)}%
                                            </span>
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                        <div>
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
                                <Bell size={11} /> Unread alerts
                            </div>
                            {alerts.length === 0 ? (
                                <p className="text-xs text-muted-foreground px-2 py-1">No unread alerts. You&apos;re all caught up.</p>
                            ) : alerts.map(alert => (
                                <Link
                                    key={alert.id}
                                    href={alert.ticker ? `/ticker/${alert.ticker}` : '/notifications'}
                                    className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-accent transition-colors"
                                >
                                    <span className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                                    <div className="min-w-0">
                                        <p className="text-xs text-foreground truncate">{alert.title}</p>
                                        <p className="text-[10px] text-muted-foreground">
                                            {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                                        </p>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    );
}
