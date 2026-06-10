'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Brain, ArrowRight, TrendingUp, Flame, ShieldAlert } from 'lucide-react';
import api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatNepaliNumber } from '@/lib/formatters';

interface AccumulationRow {
    symbol: string;
    sector: string;
    net_qty: number;
    accumulation_ratio: number;
    close: number;
}

interface AggressiveRow {
    symbol: string;
    sector: string;
    intensity: number;
    close: number;
}

interface BelowCostRow {
    symbol: string;
    broker: string;
    wac: number;
    current_ltp: number;
    discount_pct: number;
}

export function SmartMoneyHighlights() {
    const [accumulation, setAccumulation] = useState<AccumulationRow[]>([]);
    const [aggressive, setAggressive] = useState<AggressiveRow[]>([]);
    const [belowCost, setBelowCost] = useState<BelowCostRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            const [accRes, aggRes, bcRes] = await Promise.allSettled([
                api.get('/api/stocks/companies/accumulation/', { params: { range: '1W' } }),
                api.get('/api/stocks/companies/aggressive/', { params: { range: '1W' } }),
                api.get('/api/stocks/companies/below_cost/', { params: { range: '1M' } }),
            ]);
            if (cancelled) return;
            const acc: AccumulationRow[] = accRes.status === 'fulfilled' && Array.isArray(accRes.value.data) ? accRes.value.data : [];
            const agg: AggressiveRow[] = aggRes.status === 'fulfilled' && Array.isArray(aggRes.value.data?.accumulators) ? aggRes.value.data.accumulators : [];
            const bc: BelowCostRow[] = bcRes.status === 'fulfilled' && Array.isArray(bcRes.value.data) ? bcRes.value.data : [];
            setAccumulation([...acc].sort((a, b) => (b.net_qty ?? 0) - (a.net_qty ?? 0)).slice(0, 5));
            setAggressive([...agg].sort((a, b) => (b.intensity ?? 0) - (a.intensity ?? 0)).slice(0, 3));
            setBelowCost(bc.slice(0, 3));
            setFailed([accRes, aggRes, bcRes].every(r => r.status === 'rejected'));
            setLoading(false);
        };
        load();
        return () => { cancelled = true; };
    }, []);

    const Row = ({ href, left, sub, right }: { href: string; left: string; sub?: string; right: React.ReactNode }) => (
        <Link href={href} className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-accent transition-colors">
            <div className="min-w-0">
                <span className="text-xs font-medium text-foreground">{left}</span>
                {sub && <span className="ml-2 text-[10px] text-muted-foreground">{sub}</span>}
            </div>
            <div className="text-xs tabular-nums">{right}</div>
        </Link>
    );

    return (
        <Card className="h-full">
            <CardHeader className="px-5 py-4 border-b border-border">
                <div className="flex justify-between items-center">
                    <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <Brain size={14} className="text-muted-foreground" /> Smart Money Highlights
                    </CardTitle>
                    <Link href="/accumulation/dashboard" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                        Command Center <ArrowRight size={12} />
                    </Link>
                </div>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
                {loading ? (
                    <div className="text-sm text-muted-foreground animate-pulse py-4">Tracking smart money…</div>
                ) : failed ? (
                    <div className="text-sm text-muted-foreground flex items-center gap-2 py-4">
                        <ShieldAlert size={14} /> Couldn&apos;t load accumulation data.
                    </div>
                ) : (
                    <>
                        <div>
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
                                <TrendingUp size={11} /> Top net accumulation · 1W
                            </div>
                            {accumulation.length === 0 ? (
                                <p className="text-xs text-muted-foreground px-2 py-1">No accumulation detected this week.</p>
                            ) : accumulation.map(row => (
                                <Row
                                    key={row.symbol}
                                    href={`/ticker/${row.symbol}`}
                                    left={row.symbol}
                                    sub={row.sector}
                                    right={<span className="text-emerald-600 dark:text-emerald-400 font-medium">+{formatNepaliNumber(row.net_qty)}</span>}
                                />
                            ))}
                        </div>
                        <div>
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
                                <Flame size={11} /> Aggressive accumulators
                            </div>
                            {aggressive.length === 0 ? (
                                <p className="text-xs text-muted-foreground px-2 py-1">No aggressive buying detected.</p>
                            ) : aggressive.map(row => (
                                <Row
                                    key={row.symbol}
                                    href={`/ticker/${row.symbol}`}
                                    left={row.symbol}
                                    sub={row.sector}
                                    right={<span className="text-foreground">{row.intensity?.toFixed(1)}% intensity</span>}
                                />
                            ))}
                        </div>
                        <div>
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Brokers underwater (below cost)</div>
                            {belowCost.length === 0 ? (
                                <p className="text-xs text-muted-foreground px-2 py-1">None right now.</p>
                            ) : belowCost.map(row => (
                                <Row
                                    key={`${row.symbol}-${row.broker}`}
                                    href={`/ticker/${row.symbol}`}
                                    left={row.symbol}
                                    sub={`Broker ${row.broker}`}
                                    right={<span className="text-muted-foreground">LTP {formatNepaliNumber(row.current_ltp)} vs WAC {formatNepaliNumber(row.wac)}</span>}
                                />
                            ))}
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    );
}
