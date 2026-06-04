'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useMarketData } from '@/hooks/useMarketData';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableRow, TableHead, TableHeader } from '@/components/ui/table';
import { 
    TrendingUp, TrendingDown, Activity, HeartPulse,
    Zap, Share2, ArrowUpRight, ArrowDownRight,
    LineChart, BarChart3, Globe
} from 'lucide-react';
import { motion, type Variants } from 'framer-motion';
import { SentimentGauge } from '@/components/SentimentGauge';
import { MarketHealthRadar } from '@/components/MarketHealthRadar';
import { MiniSectorCard } from '@/components/MiniSectorCard';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { PageLoader } from '@/components/ui/StockLoader';
import { formatNepaliNumber, formatRupees } from '@/lib/formatters';
import { LiveMarketPulseTable } from './LiveMarketPulseTable';
import { LiveBulkTransactions } from './LiveBulkTransactions';
import DashboardLayout from './DashboardLayout';
import { Badge } from '@/components/ui/badge';
const containerVariants: Variants = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: { staggerChildren: 0.1 }
    }
};

const itemVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    show: {
        opacity: 1,
        y: 0,
        transition: { type: 'spring' as const, stiffness: 100, damping: 15 }
    }
};

export function MarketPulse() {
    const { 
        data, 
        allStocks,
        loading, 
        error, 
        marketSentiment, 
        marketHealth 
    } = useMarketData(10000); // 10s refresh for live pulse
    const router = useRouter();

    if (loading) return <div className="min-h-[60vh] flex items-center justify-center"><PageLoader text="Syncing live market pulse..." /></div>;
    if (error) return <div className="p-8 text-center text-red-500">{error}</div>;

    const marketStatus = data?.market_summary;

    return (
        <DashboardLayout
            noPadding
            title="Market Pulse"
            subtitle="Live view of the market heartbeat."
        >
            <div className="space-y-6 p-6 pt-0">
                {!marketStatus ? (
                    <div className="surface p-12 text-center">
                        <Activity className="h-10 w-10 text-muted-foreground mx-auto mb-4 opacity-40" />
                        <h3 className="text-base font-semibold text-foreground mb-2">Market heartbeat offline</h3>
                        <p className="text-sm text-muted-foreground max-w-md mx-auto">
                            No live market pulses detected right now. This usually means the market is closed or data ingestion is pending.
                        </p>
                    </div>
                ) : (
                    <>
                        {/* 1. Live Index Hero */}
                        <div className="surface p-6">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                        <Globe size={13} />
                                        <span className="text-[11px] uppercase tracking-wider">NEPSE Index · Live</span>
                                    </div>
                                    <div className="flex items-baseline gap-4">
                                        <h1 className="text-4xl font-semibold text-foreground tracking-tight tabular-nums">
                                            {formatNepaliNumber(marketStatus.total_points)}
                                        </h1>
                                        <div className={`flex items-center gap-1 font-medium tabular-nums ${marketStatus.points_change >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                            {marketStatus.points_change >= 0 ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
                                            <span className="text-lg">{Math.abs(marketStatus.points_change).toFixed(2)}</span>
                                            <span className="text-sm text-muted-foreground">({marketStatus.percent_change.toFixed(2)}%)</span>
                                        </div>
                                    </div>
                                    <p className="text-xs text-muted-foreground">Session · {marketStatus.date}</p>
                                </div>

                                <div className="flex items-center gap-8">
                                    <div>
                                        <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-0.5">Turnover</div>
                                        <div className="text-lg font-medium text-foreground font-mono tabular-nums">{formatRupees(marketStatus.total_turnover / 1000000)}M</div>
                                    </div>
                                    <div className="w-px h-8 bg-border" />
                                    <div>
                                        <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-0.5">Volume</div>
                                        <div className="text-lg font-medium text-foreground font-mono tabular-nums">{(marketStatus.total_volume / 1000000).toFixed(1)}M</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 2. Live Market Monitor Table */}
                        <Card className="overflow-hidden">
                            <CardHeader className="px-5 py-4 border-b border-border">
                                <div className="flex justify-between items-center">
                                    <div className="flex flex-col">
                                        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                                            <Activity size={14} className="text-muted-foreground" /> Live Pulse Monitor
                                        </CardTitle>
                                        <p className="text-xs text-muted-foreground mt-0.5">Prices flash on update · 10s refresh</p>
                                    </div>
                                    <Badge variant="outline" className="font-normal text-xs gap-1.5">
                                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                        Live
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                <LiveMarketPulseTable stocks={allStocks} />
                            </CardContent>
                        </Card>

                        {/* 3. Operational Grid */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="space-y-6">
                                <Card>
                                    <CardHeader className="px-5 py-4 border-b border-border">
                                        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                                            <HeartPulse size={14} className="text-muted-foreground" />
                                            Sentiment Bias
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-5">
                                        <SentimentGauge value={marketSentiment} height={200} />
                                        <div className="mt-4 grid grid-cols-2 gap-3">
                                            <div className="rounded-md border border-border p-3">
                                                <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Advancers</div>
                                                <div className="text-xl font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">{marketStatus.advancers}</div>
                                            </div>
                                            <div className="rounded-md border border-border p-3">
                                                <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Decliners</div>
                                                <div className="text-xl font-semibold text-rose-600 dark:text-rose-400 tabular-nums">{marketStatus.decliners}</div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                <LiveBulkTransactions />
                            </div>

                            <Card className="h-full">
                                <CardHeader className="px-5 py-4 border-b border-border">
                                    <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                                        <Activity size={14} className="text-muted-foreground" />
                                        Integrity Radar
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-5 flex items-center justify-center min-h-[400px]">
                                    <MarketHealthRadar data={marketHealth.scores} rawData={marketHealth.raw ?? undefined} height={320} />
                                </CardContent>
                            </Card>
                        </div>
                    </>
                )}
            </div>
        </DashboardLayout>
    );
}
