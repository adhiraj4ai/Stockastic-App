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
import { motion } from 'framer-motion';
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
const containerVariants = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: { staggerChildren: 0.1 }
    }
};

const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: {
        opacity: 1,
        y: 0,
        transition: { type: 'spring', stiffness: 100, damping: 15 }
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
            title={<>Market <span className="text-blue-600 dark:text-blue-400">Pulse</span></>}
            subtitle="Your high-fidelity dashboard into the live market heartbeat."
        >
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000 p-8 pt-0">
                {!marketStatus ? (
                    <Card className="bg-white/80 dark:bg-slate-900/60 backdrop-blur-xl border-none shadow-2xl p-12 text-center">
                        <Activity className="h-12 w-12 text-slate-400 mx-auto mb-4 opacity-20" />
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Market Heartbeat Offline</h3>
                        <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                            We couldn't detect any live market pulses right now. This usually happens when the market is closed or data ingestion is pending.
                        </p>
                    </Card>
                ) : (
                    <>
                        {/* 1. Live Index Hero (Condensed for focus) */}
                        <div className="relative overflow-hidden rounded-3xl bg-slate-900 border border-slate-800 p-8 shadow-2xl">
                            <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-blue-500/10 to-transparent blur-3xl opacity-30" />
                            <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-blue-400">
                                        <Globe size={16} />
                                        <span className="text-xs font-black tracking-widest uppercase">Live Pulse • NEPSE Index</span>
                                    </div>
                                    <div className="flex items-baseline gap-4">
                                        <h1 className="text-5xl font-black text-white tracking-tighter">
                                            {formatNepaliNumber(marketStatus.total_points)}
                                        </h1>
                                        <div className={`flex items-center gap-1 font-bold ${marketStatus.points_change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {marketStatus.points_change >= 0 ? <ArrowUpRight size={24} /> : <ArrowDownRight size={24} />}
                                            <span className="text-2xl">{Math.abs(marketStatus.points_change).toFixed(2)}</span>
                                            <span className="text-sm opacity-80">({marketStatus.percent_change.toFixed(2)}%)</span>
                                        </div>
                                    </div>
                                    <p className="text-slate-400 text-sm font-medium">Session Date: {marketStatus.date}</p>
                                </div>

                                <div className="flex flex-col md:flex-row gap-6 items-center">
                                    <div className="flex gap-8 items-center bg-slate-800/30 backdrop-blur-md rounded-2xl p-6 border border-white/5 font-mono">
                                        <div className="text-center">
                                            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Turnover</div>
                                            <div className="text-xl font-bold text-white">{formatRupees(marketStatus.total_turnover / 1000000)}M</div>
                                        </div>
                                        <div className="w-px h-10 bg-slate-700/50" />
                                        <div className="text-center">
                                            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Volume</div>
                                            <div className="text-xl font-bold text-white">{(marketStatus.total_volume / 1000000).toFixed(1)}M</div>
                                        </div>
                                    </div>

                                </div>
                            </div>
                        </div>

                        {/* 2. Live Market Monitor Table */}
                        <div className="grid grid-cols-1 gap-6">
                            <Card className="bg-white/80 dark:bg-slate-900/60 backdrop-blur-xl border-none shadow-2xl overflow-hidden transition-all hover:shadow-blue-500/5">
                                <CardHeader className="p-6 border-b border-slate-100 dark:border-white/5 bg-slate-50/30 dark:bg-white/[0.02]">
                                    <div className="flex justify-between items-center">
                                        <div className="flex flex-col">
                                            <CardTitle className="text-xs font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest flex items-center gap-2">
                                                <Activity size={14} className="animate-pulse" /> Live Pulse Monitor
                                            </CardTitle>
                                            <p className="text-[10px] text-slate-500 font-medium mt-1">Real-time prices flashing upon update • 10s refresh interval</p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-none font-bold px-3 py-1 flex items-center gap-1.5">
                                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                                Live Stream
                                            </Badge>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <LiveMarketPulseTable stocks={allStocks} />
                                </CardContent>
                            </Card>
                        </div>
                        {/* 3. Operational Grid: Sentiment/Bulk Feed (Left) & Health (Right) */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="space-y-6">
                                <Card className="bg-white dark:bg-slate-900 border-none shadow-xl">
                                    <CardHeader className="p-4 pb-0">
                                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                                            <HeartPulse size={16} className="text-rose-500" />
                                            Sentiment Bias
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-6 pt-2">
                                        <SentimentGauge value={marketSentiment} height={200} />
                                        <div className="mt-4 grid grid-cols-2 gap-4">
                                            <div className="bg-emerald-50 dark:bg-emerald-900/10 p-3 rounded-xl border border-emerald-100 dark:border-emerald-900/30">
                                                <div className="text-[10px] font-black text-emerald-600 uppercase mb-1">Advancers</div>
                                                <div className="text-2xl font-black text-slate-900 dark:text-white">{marketStatus.advancers}</div>
                                            </div>
                                            <div className="bg-rose-50 dark:bg-rose-900/10 p-3 rounded-xl border border-rose-100 dark:border-rose-900/30 text-right">
                                                <div className="text-[10px] font-black text-rose-600 uppercase mb-1">Decliners</div>
                                                <div className="text-2xl font-black text-slate-900 dark:text-white">{marketStatus.decliners}</div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                <LiveBulkTransactions />
                            </div>

                            <Card className="bg-white dark:bg-slate-900 border-none shadow-xl h-full">
                                <CardHeader className="p-4 pb-0">
                                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                                        <Activity size={16} className="text-blue-500" />
                                        Integrity Radar
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-6 pt-2 flex items-center justify-center min-h-[400px]">
                                    <MarketHealthRadar data={marketHealth.scores} rawData={marketHealth.raw} height={320} />
                                </CardContent>
                            </Card>
                        </div>
                    </>
                )}
            </div>
        </DashboardLayout>
    );
}
