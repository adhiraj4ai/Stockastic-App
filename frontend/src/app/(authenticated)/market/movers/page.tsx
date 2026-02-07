'use client';

import React, { useState, useEffect, useMemo } from 'react';
import api from '@/lib/api';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrendingUp, TrendingDown, Zap, Activity, Filter, Rocket, Magnet, Droplets, Gauge } from 'lucide-react';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { Progress } from '@/components/ui/progress';

interface StockData {
    ticker: string;
    percent_change: number;
    turnover: number;
    volume: number;
    close: number;
    open: number;
    high: number;
    low: number;
    sector: string;
}

interface MarketSummaryData {
    top_gainers: StockData[];
    top_losers: StockData[];
    top_volume: StockData[];
    top_turnover: StockData[];
    all_stocks?: StockData[]; // Assuming we might derive volatility from a larger list if available, else use top lists
}

export default function MoversShakersPage() {
    const [data, setData] = useState<MarketSummaryData | null>(null);
    const [loading, setLoading] = useState(true);
    const [timeframe, setTimeframe] = useState('daily');
    const router = useRouter();

    useEffect(() => {
        const fetchData = async () => {
            try {
                // In a real app, timeframe would be a param: /api/stocks/summary/?range=${timeframe}
                const response = await api.get('/api/stocks/summary/');
                setData(response.data);
            } catch (err) {
                console.error('Failed to fetch moves data', err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [timeframe]);

    // Creative Scanners Logic (Derived from available data)
    const scanners = useMemo(() => {
        if (!data) return { circuits: [], magnets: [], guzzlers: [], volatile: [] };

        // 1. Rocket List (Circuit Breakers): +/- 9%
        const merged = [...(data.top_gainers || []), ...(data.top_losers || [])];
        const circuits = merged.filter(s => Math.abs(s.percent_change) >= 9).slice(0, 10);

        // 2. Money Magnets (Turnover)
        const magnets = [...(data.top_turnover || [])].sort((a, b) => b.turnover - a.turnover).slice(0, 10);
        const maxTurnover = magnets[0]?.turnover || 1;

        // 3. Volume Guzzlers
        const guzzlers = [...(data.top_volume || [])].sort((a, b) => b.volume - a.volume).slice(0, 10);
        const maxVolume = guzzlers[0]?.volume || 1;

        // 4. Volatility Radar (High-Low spread relative to Open)
        // We'll try to find stocks with high intraday swings from the lists we have
        // Note: Ideally we need a full market dump for this, but we'll use what we have in summary
        const allAvailable = [...merged, ...(data.top_turnover || []), ...(data.top_volume || [])];
        // Deduplicate by ticker
        const uniqueStocks = Array.from(new Map(allAvailable.map(s => [s.ticker, s])).values());

        const volatile = uniqueStocks
            .map(s => ({
                ...s,
                volatility: s.open > 0 ? ((s.high - s.low) / s.open) * 100 : 0
            }))
            .sort((a, b) => b.volatility - a.volatility)
            .slice(0, 10);

        return { circuits, magnets, guzzlers, volatile, maxTurnover, maxVolume };
    }, [data]);

    if (loading) {
        return (
            <DashboardLayout title="Movers & Shakers" subtitle="SCANNERS">
                <div className="flex items-center justify-center min-h-[400px]">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout title="Movers & Shakers" subtitle="SCANNERS">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-8 pb-12"
            >
                {/* Timeframe Tabs */}
                <div className="flex justify-center">
                    <Tabs defaultValue="daily" className="w-full max-w-md" onValueChange={setTimeframe}>
                        <TabsList className="grid w-full grid-cols-3 bg-slate-100 dark:bg-slate-800/50 p-1 rounded-2xl">
                            <TabsTrigger value="daily" className="rounded-xl font-bold text-xs data-[state=active]:bg-white data-[state=active]:dark:bg-slate-700 data-[state=active]:shadow-sm transition-all">Daily</TabsTrigger>
                            <TabsTrigger value="weekly" className="rounded-xl font-bold text-xs data-[state=active]:bg-white data-[state=active]:dark:bg-slate-700 data-[state=active]:shadow-sm transition-all">Weekly</TabsTrigger>
                            <TabsTrigger value="monthly" className="rounded-xl font-bold text-xs data-[state=active]:bg-white data-[state=active]:dark:bg-slate-700 data-[state=active]:shadow-sm transition-all">Monthly</TabsTrigger>
                        </TabsList>
                    </Tabs>
                </div>

                {timeframe !== 'daily' && (
                    <div className="text-center p-4 bg-amber-50 dark:bg-amber-900/10 rounded-2xl border border-amber-100 dark:border-amber-900/20">
                        <p className="text-xs font-bold text-amber-600 dark:text-amber-400">
                            <Zap size={14} className="inline mr-1 mb-0.5" />
                            Showing Daily Data (Historical aggregation coming soon)
                        </p>
                    </div>
                )}

                {/* 1. ROCKET LIST (Circuit Breakers) */}
                <Card className="bg-white dark:bg-slate-900/50 border-none shadow-xl shadow-slate-200/50 dark:shadow-none overflow-hidden relative backdrop-blur-xl group">
                    <div className="absolute -left-10 -top-10 w-40 h-40 bg-purple-500/10 blur-3xl opacity-50 transition-opacity group-hover:opacity-70" />
                    <CardHeader className="p-5 border-b border-slate-50 dark:border-slate-800 relative z-10">
                        <CardTitle className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-2">
                            <Rocket size={14} className="text-purple-600" /> ROCKET LIST (CIRCUIT BREAKERS)
                        </CardTitle>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Stocks hitting or nearing 10% limits</p>
                    </CardHeader>
                    <CardContent className="p-0 relative z-10">
                        {scanners.circuits.length > 0 ? (
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="border-none hover:bg-transparent bg-slate-50/50 dark:bg-white/5">
                                            <TableHead className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-6">Ticker</TableHead>
                                            <TableHead className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Price</TableHead>
                                            <TableHead className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Change</TableHead>
                                            <TableHead className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right pr-6">Status</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {scanners.circuits.map((stock) => (
                                            <TableRow
                                                key={stock.ticker}
                                                className="border-slate-50 dark:border-white/5 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5"
                                                onClick={() => router.push(`/ticker/${stock.ticker}`)}
                                            >
                                                <TableCell className="py-3 font-bold text-xs pl-6">{stock.ticker}</TableCell>
                                                <TableCell className="py-3 text-right font-mono text-xs">Rs. {stock.close}</TableCell>
                                                <TableCell className={`py-3 text-right font-mono text-xs font-bold ${stock.percent_change > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                    {stock.percent_change > 0 ? '+' : ''}{stock.percent_change.toFixed(2)}%
                                                </TableCell>
                                                <TableCell className="py-3 text-right pr-6">
                                                    <Badge className={`${stock.percent_change > 0 ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-rose-500 hover:bg-rose-600'} text-white border-none text-[9px] font-bold px-2`}>
                                                        {Math.abs(stock.percent_change) >= 9.9 ? 'LOCKED' : 'NEAR LOCK'}
                                                    </Badge>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        ) : (
                            <div className="p-8 text-center">
                                <p className="text-xs text-slate-400 italic">No stocks hitting circuit breakers today.</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* 2. MONEY MAGNETS (Turnover Leaders) */}
                    <Card className="bg-white dark:bg-slate-900/50 border-none shadow-xl shadow-slate-200/50 dark:shadow-none overflow-hidden relative backdrop-blur-xl">
                        <CardHeader className="p-5 border-b border-slate-50 dark:border-slate-800">
                            <CardTitle className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-2">
                                <Magnet size={14} className="text-blue-600" /> MONEY MAGNETS
                            </CardTitle>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Highest Turnover Leaders</p>
                        </CardHeader>
                        <CardContent className="p-5 space-y-4">
                            {scanners.magnets.map((stock, i) => (
                                <div key={stock.ticker} className="space-y-1.5 cursor-pointer group" onClick={() => router.push(`/ticker/${stock.ticker}`)}>
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="font-bold text-slate-700 dark:text-slate-300 group-hover:text-blue-600 transition-colors">{i + 1}. {stock.ticker}</span>
                                        <span className="font-mono text-[10px] text-slate-500">{(stock.turnover / 10000000).toFixed(2)} Cr</span>
                                    </div>
                                    <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full"
                                            style={{ width: `${(stock.turnover / scanners.maxTurnover) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    {/* 3. VOLUME GUZZLERS */}
                    <Card className="bg-white dark:bg-slate-900/50 border-none shadow-xl shadow-slate-200/50 dark:shadow-none overflow-hidden relative backdrop-blur-xl">
                        <CardHeader className="p-5 border-b border-slate-50 dark:border-slate-800">
                            <CardTitle className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-2">
                                <Droplets size={14} className="text-cyan-600" /> VOLUME GUZZLERS
                            </CardTitle>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Most Traded Shares</p>
                        </CardHeader>
                        <CardContent className="p-5 space-y-4">
                            {scanners.guzzlers.map((stock, i) => (
                                <div key={stock.ticker} className="space-y-1.5 cursor-pointer group" onClick={() => router.push(`/ticker/${stock.ticker}`)}>
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="font-bold text-slate-700 dark:text-slate-300 group-hover:text-cyan-600 transition-colors">{i + 1}. {stock.ticker}</span>
                                        <span className="font-mono text-[10px] text-slate-500">{stock.volume.toLocaleString()} Qty</span>
                                    </div>
                                    <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full"
                                            style={{ width: `${(stock.volume / scanners.maxVolume) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </div>

                {/* 4. VOLATILITY RADAR */}
                <Card className="bg-white dark:bg-slate-900/50 border-none shadow-xl shadow-slate-200/50 dark:shadow-none overflow-hidden relative backdrop-blur-xl">
                    <CardHeader className="p-5 border-b border-slate-50 dark:border-slate-800">
                        <CardTitle className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-2">
                            <Gauge size={14} className="text-orange-600" /> VOLATILITY RADAR
                        </CardTitle>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Highest Intraday Swings (High/Low spread)</p>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 p-5">
                            {scanners.volatile.map((stock) => (
                                <div key={stock.ticker} className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-white/5 cursor-pointer hover:border-orange-500/30 transition-all group" onClick={() => router.push(`/ticker/${stock.ticker}`)}>
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100 group-hover:text-orange-600 transition-colors">{stock.ticker}</span>
                                        <TrendingUp size={12} className="text-slate-400" />
                                    </div>
                                    <div className="space-y-0.5">
                                        <div className="text-lg font-bold text-orange-600 dark:text-orange-400 font-mono">{stock.volatility.toFixed(1)}%</div>
                                        <div className="text-[9px] text-slate-400 uppercase font-black tracking-wider">Spread</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

            </motion.div>
        </DashboardLayout>
    );
}
