'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Zap, ArrowRight, Target, ShieldAlert } from 'lucide-react';
import api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatNepaliNumber } from '@/lib/formatters';
import { buildActionItems, type ActionItem, type RecommendationItem, type SignalEpisodeItem } from '@/lib/homeDigest';

const REC_SOURCES = [
    { label: 'Broker Accumulation', url: '/api/stocks/broker-accumulation-recommendations/' },
    { label: 'Smart Crossover', url: '/api/stocks/smart-accumulated-crossover-recommendations/' },
    { label: 'Ichimoku', url: '/api/stocks/ichimoku-accumulation-recommendations/' },
];

export function TodaysSignals() {
    const [items, setItems] = useState<ActionItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            const [episodesRes, ...recResults] = await Promise.allSettled([
                api.get('/api/stocks/generated-signals/latest/'),
                ...REC_SOURCES.map(s => api.get(s.url, { params: { sector: 'All' } })),
            ]);
            if (cancelled) return;
            const episodes: SignalEpisodeItem[] =
                episodesRes.status === 'fulfilled' && Array.isArray(episodesRes.value.data)
                    ? episodesRes.value.data
                    : [];
            const recommendationSets = REC_SOURCES.map((s, i) => {
                const r = recResults[i];
                const data = r.status === 'fulfilled' && Array.isArray(r.value.data)
                    ? (r.value.data as RecommendationItem[])
                    : [];
                return { label: s.label, items: data };
            });
            setFailed(episodesRes.status === 'rejected' && recResults.every(r => r.status === 'rejected'));
            setItems(buildActionItems(episodes, recommendationSets, 8));
            setLoading(false);
        };
        load();
        return () => { cancelled = true; };
    }, []);

    return (
        <Card className="overflow-hidden">
            <CardHeader className="px-5 py-4 border-b border-border">
                <div className="flex justify-between items-center">
                    <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <Zap size={14} className="text-muted-foreground" /> Today&apos;s Signals &amp; Recommendations
                    </CardTitle>
                    <div className="flex items-center gap-4 text-xs">
                        <Link href="/signals" className="text-muted-foreground hover:text-foreground flex items-center gap-1">
                            Signals <ArrowRight size={12} />
                        </Link>
                        <Link href="/recommendations" className="text-muted-foreground hover:text-foreground flex items-center gap-1">
                            Recommendations <ArrowRight size={12} />
                        </Link>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                {loading ? (
                    <div className="p-6 text-sm text-muted-foreground animate-pulse">Scanning engines for today&apos;s setups…</div>
                ) : failed ? (
                    <div className="p-6 text-sm text-muted-foreground flex items-center gap-2">
                        <ShieldAlert size={14} /> Couldn&apos;t load signals right now.
                    </div>
                ) : items.length === 0 ? (
                    <div className="p-8 text-center">
                        <p className="text-sm text-muted-foreground mb-2">No active signals today.</p>
                        <Link href="/strategies" className="text-xs text-primary hover:underline">
                            Build or run a strategy →
                        </Link>
                    </div>
                ) : (
                    <div className="divide-y divide-border">
                        {items.map(item => (
                            <Link
                                key={`${item.symbol}-${item.action}-${item.source}`}
                                href={`/ticker/${item.symbol}`}
                                className="flex items-center gap-4 px-5 py-3 hover:bg-accent transition-colors"
                            >
                                <Badge
                                    variant="outline"
                                    className={`w-14 justify-center font-semibold text-[10px] ${item.action === 'BUY'
                                        ? 'text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                                        : 'text-rose-600 dark:text-rose-400 border-rose-500/30'}`}
                                >
                                    {item.action}
                                </Badge>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-sm font-medium text-foreground">{item.symbol}</span>
                                        <span className="text-[11px] text-muted-foreground">{item.source}</span>
                                    </div>
                                    {item.detail && (
                                        <p className="text-[11px] text-muted-foreground truncate">{item.detail}</p>
                                    )}
                                </div>
                                {item.target != null && (
                                    <div className="hidden sm:flex items-center gap-1 text-[11px] text-muted-foreground tabular-nums">
                                        <Target size={11} /> {formatNepaliNumber(item.target)}
                                    </div>
                                )}
                                {item.price != null && (
                                    <span className="text-sm font-mono text-foreground tabular-nums">{formatNepaliNumber(item.price)}</span>
                                )}
                                <div className="w-16 text-right">
                                    <span className="text-xs font-semibold text-foreground tabular-nums">{Math.round(item.conviction)}</span>
                                    <span className="text-[10px] text-muted-foreground"> /100</span>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
