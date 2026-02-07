'use client';

import React, { useState, useEffect, useMemo } from 'react';
import api from '@/lib/api';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrendingUp, TrendingDown, Zap, Activity, Filter, Rocket, Magnet, Droplets, Gauge, Target, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';

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
    weeks_52_high?: number;
    weeks_52_low?: number;
    sparkline?: number[];
    top_buyers?: { broker: string; qty: number }[];
}

interface WhaleWatchData {
    broker: string;
    total_turnover: number;
    top_picks: { ticker: string; turnover: number }[];
}

interface MarketSummaryData {
    // ... existing fields
    top_gainers: StockData[];
    top_losers: StockData[];
    top_volume: StockData[];
    top_turnover: StockData[];
    near_52_high?: StockData[];
    near_52_low?: StockData[];
    market_summary?: {
        ref_date?: string;
        date?: string;
    };
    all_stocks?: StockData[];
    whale_watch?: WhaleWatchData[];
    sector_summary?: { name: string; change: number; turnover: number; count: number }[];
}

const WhaleWatchCard = ({ data }: { data: WhaleWatchData[] }) => {
    if (!data || data.length === 0) return null;

    return (
        <Card className="bg-white dark:bg-slate-900/50 border-none shadow-xl shadow-slate-200/50 dark:shadow-none overflow-hidden relative backdrop-blur-xl">
            <div className="absolute -right-10 -top-10 w-40 h-40 bg-blue-500/10 blur-3xl opacity-50" />
            <CardHeader className="p-5 border-b border-slate-50 dark:border-slate-800 relative z-10">
                <CardTitle className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-2">
                    <Zap size={14} className="text-blue-600" /> WHALE WATCH (SMART MONEY)
                </CardTitle>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Top Brokers & Their Accumulation</p>
            </CardHeader>
            <CardContent className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 relative z-10">
                {data.map((broker, i) => (
                    <div key={i} className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-100 dark:border-white/5 space-y-3">
                        <div className="flex justify-between items-center border-b border-slate-100 dark:border-white/5 pb-2">
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-none text-[10px] px-2">
                                Broker {broker.broker}
                            </Badge>
                            <span className="text-[10px] font-mono text-slate-400">Total: {(broker.total_turnover / 10000000).toFixed(1)}Cr</span>
                        </div>
                        <div className="space-y-1">
                            {broker.top_picks.map((pick, j) => (
                                <div key={j} className="flex justify-between items-center text-xs">
                                    <span className="font-bold text-slate-700 dark:text-slate-300">{pick.ticker}</span>
                                    <span className="text-[10px] text-slate-500 font-mono">{(pick.turnover / 10000000).toFixed(2)}Cr</span>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </CardContent>
        </Card>
    );
};

const SectorHeatmap = ({ sectors }: { sectors: any[] }) => {
    if (!sectors || sectors.length === 0) return null;

    // Normalize turnover for sizing
    const maxTurnover = Math.max(...sectors.map(s => s.turnover));

    return (
        <Card className="bg-white dark:bg-slate-900/50 border-none shadow-xl shadow-slate-200/50 dark:shadow-none overflow-hidden relative backdrop-blur-xl">
            <CardHeader className="p-5 border-b border-slate-50 dark:border-slate-800">
                <CardTitle className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-2">
                    <Activity size={14} className="text-teal-600" /> SECTOR HEATMAP
                </CardTitle>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Size = Turnover, Color = Change %</p>
            </CardHeader>
            <CardContent className="p-5">
                <div className="flex flex-wrap gap-1 min-h-[300px] w-full content-start">
                    {sectors.map((sector) => {
                        // Sizing logic: crude treemap simulation using flex-basis
                        // const items = sectors.length;
                        const weight = (sector.turnover / maxTurnover) * 100;
                        const width = Math.max(10, Math.min(100, weight * 2)); // heuristic

                        // Color logic
                        let bgClass = 'bg-slate-100';
                        if (sector.change > 2) bgClass = 'bg-emerald-500 text-white';
                        else if (sector.change > 0.5) bgClass = 'bg-emerald-400/80 text-white';
                        else if (sector.change > -0.5) bgClass = 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300';
                        else if (sector.change > -2) bgClass = 'bg-rose-400/80 text-white';
                        else bgClass = 'bg-rose-500 text-white';

                        return (
                            <div
                                key={sector.name}
                                className={`${bgClass} rounded-lg flex flex-col items-center justify-center p-2 transition-all hover:scale-105 cursor-pointer flex-grow`}
                                style={{ flexBasis: `${width}%`, minHeight: '60px' }}
                            >
                                <span className="text-[10px] font-bold text-center leading-tight line-clamp-2">{sector.name}</span>
                                <span className="text-[10px] font-mono font-bold mt-1">{sector.change > 0 ? '+' : ''}{sector.change.toFixed(2)}%</span>
                            </div>
                        );
                    })}
                </div>
            </CardContent>
        </Card>
    );
};


// ... inside main component return ...

// Mini Sparkline Component
const Sparkline = ({ data, color, width = 60, height = 20 }: { data?: number[], color: string, width?: number, height?: number }) => {
    if (!data || data.length < 2) return <div style={{ width, height }} className="bg-slate-100 dark:bg-slate-800/30 rounded" />;

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    // Create points string
    const points = data.map((val, i) => {
        const x = (i / (data.length - 1)) * width;
        const y = height - ((val - min) / range) * height;
        return `${x},${y}`;
    }).join(' ');

    return (
        <svg width={width} height={height} className="overflow-visible">
            <polyline
                points={points}
                fill="none"
                stroke={color}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
};

const SectorBadge = ({ sector }: { sector: string }) => {
    // Deterministic color based on string hash or explicit map
    const sectorColors: Record<string, string> = {
        'Commercial Banks': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
        'Development Banks': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
        'Hydro Power': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
        'Finance': 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
        'Life Insurance': 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
        'Non Life Insurance': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
        'Manufacturing': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
        'Hotels': 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
        'Investment': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
        'Microfinance': 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
        'Others': 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    };

    // Fuzzy match or default
    const match = Object.keys(sectorColors).find(s => sector?.includes(s)) || 'Others';
    const className = sectorColors[match];

    return (
        <Badge variant="outline" className={`border-none ${className} text-[9px] px-1.5 py-0 rounded`}>
            {sector || 'N/A'}
        </Badge>
    );
};

export default function MoversShakersPage() {
    const [data, setData] = useState<MarketSummaryData | null>(null);
    const [loading, setLoading] = useState(true);
    const [timeframe, setTimeframe] = useState('daily');
    const router = useRouter();

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true); // Show loading when switching tabs
            try {
                // Pass timeframe as range param
                const response = await api.get(`/api/stocks/summary/?range=${timeframe}`);
                setData(response.data);
            } catch (err) {
                console.error('Failed to fetch moves data', err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [timeframe]);

    // Creative Scanners Logic (Derived from available data or backend)
    const scanners = useMemo(() => {
        if (!data) return { circuits: [], magnets: [], guzzlers: [], volatile: [], nearHigh: [], nearLow: [] };

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
        // Aggregated data will have high/low for the period
        const allAvailable = [...merged, ...(data.top_turnover || []), ...(data.top_volume || [])];
        const uniqueStocks = Array.from(new Map(allAvailable.map(s => [s.ticker, s])).values());

        const volatile = uniqueStocks
            .map(s => ({
                ...s,
                volatility: s.open > 0 ? ((s.high - s.low) / s.open) * 100 : 0
            }))
            .sort((a, b) => b.volatility - a.volatility)
            .slice(0, 10);

        // 5. 52-Week Scanners (from backend)
        const nearHigh = data.near_52_high || [];
        const nearLow = data.near_52_low || [];

        return { circuits, magnets, guzzlers, volatile, maxTurnover, maxVolume, nearHigh, nearLow };
    }, [data]);

    return (
        <DashboardLayout title="Movers & Shakers" subtitle="SCANNERS">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-8 pb-12"
            >
                {/* Timeframe Tabs */}
                <div className="flex justify-center">
                    <Tabs defaultValue="daily" value={timeframe} className="w-full max-w-md" onValueChange={setTimeframe}>
                        <TabsList className="grid w-full grid-cols-3 bg-slate-100 dark:bg-slate-800/50 p-1 rounded-2xl">
                            <TabsTrigger value="daily" className="rounded-xl font-bold text-xs data-[state=active]:bg-white data-[state=active]:dark:bg-slate-700 data-[state=active]:shadow-sm transition-all">Daily</TabsTrigger>
                            <TabsTrigger value="weekly" className="rounded-xl font-bold text-xs data-[state=active]:bg-white data-[state=active]:dark:bg-slate-700 data-[state=active]:shadow-sm transition-all">Weekly</TabsTrigger>
                            <TabsTrigger value="monthly" className="rounded-xl font-bold text-xs data-[state=active]:bg-white data-[state=active]:dark:bg-slate-700 data-[state=active]:shadow-sm transition-all">Monthly</TabsTrigger>
                        </TabsList>
                    </Tabs>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center min-h-[400px]">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                ) : (
                    <>
                        {/* Range info */}
                        {data?.market_summary?.ref_date && (
                            <div className="text-center">
                                <Badge variant="outline" className="font-mono text-[10px] text-slate-500">
                                    Date Range: {data.market_summary.ref_date} — {data.market_summary.date}
                                </Badge>
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
                                                    <TableHead className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Sector</TableHead>
                                                    <TableHead className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Trend (7D)</TableHead>
                                                    <TableHead className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Top Buyers</TableHead>
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
                                                        <TableCell className="py-3">
                                                            <SectorBadge sector={stock.sector} />
                                                        </TableCell>
                                                        <TableCell className="py-3">
                                                            <Sparkline
                                                                data={stock.sparkline}
                                                                color={stock.percent_change > 0 ? '#10b981' : '#f43f5e'}
                                                            />
                                                        </TableCell>
                                                        <TableCell className="py-3">
                                                            <div className="flex gap-1 flex-wrap max-w-[120px]">
                                                                {stock.top_buyers?.slice(0, 3).map((b, i) => (
                                                                    <Badge key={i} variant="secondary" className="text-[9px] px-1 h-4 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                                                                        {b.broker}
                                                                    </Badge>
                                                                ))}
                                                                {!stock.top_buyers?.length && <span className="text-[9px] text-slate-300">-</span>}
                                                            </div>
                                                        </TableCell>
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
                                        <p className="text-xs text-slate-400 italic">No stocks hitting circuit breakers in this period.</p>
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
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-slate-700 dark:text-slate-300 w-6 text-right text-[10px] text-slate-400">#{i + 1}</span>
                                                    <span className="font-bold text-slate-700 dark:text-slate-300 group-hover:text-blue-600 transition-colors">{stock.ticker}</span>
                                                    <SectorBadge sector={stock.sector} />
                                                </div>
                                                <span className="font-mono text-[10px] text-slate-500">{(stock.turnover / 10000000).toFixed(2)} Cr</span>
                                            </div>
                                            <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full"
                                                    style={{ width: `${(stock.turnover / (scanners.maxTurnover || 1)) * 100}%` }}
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
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-slate-700 dark:text-slate-300 w-6 text-right text-[10px] text-slate-400">#{i + 1}</span>
                                                    <span className="font-bold text-slate-700 dark:text-slate-300 group-hover:text-cyan-600 transition-colors">{stock.ticker}</span>
                                                    <SectorBadge sector={stock.sector} />
                                                </div>
                                                <span className="font-mono text-[10px] text-slate-500">{stock.volume.toLocaleString()} Qty</span>
                                            </div>
                                            <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full"
                                                    style={{ width: `${(stock.volume / (scanners.maxVolume || 1)) * 100}%` }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </CardContent>
                            </Card>
                        </div>

                        {/* 5. 52-WEEK HIGHS & LOWS */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Near 52-Week High */}
                            <Card className="bg-white dark:bg-slate-900/50 border-none shadow-xl shadow-slate-200/50 dark:shadow-none overflow-hidden relative backdrop-blur-xl">
                                <CardHeader className="p-5 border-b border-slate-50 dark:border-slate-800">
                                    <CardTitle className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-2">
                                        <Target size={14} className="text-emerald-600" /> NEAR 52-WEEK HIGH
                                    </CardTitle>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Trading within 2% of yearly peak</p>
                                </CardHeader>
                                <CardContent className="p-0">
                                    {scanners.nearHigh.length > 0 ? (
                                        <Table>
                                            <TableBody>
                                                {scanners.nearHigh.map((stock) => (
                                                    <TableRow
                                                        key={stock.ticker}
                                                        className="border-slate-50 dark:border-white/5 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5"
                                                        onClick={() => router.push(`/ticker/${stock.ticker}`)}
                                                    >
                                                        <TableCell className="py-3 font-bold text-xs">{stock.ticker}</TableCell>
                                                        <TableCell className="py-3">
                                                            <Sparkline data={stock.sparkline} color="#10b981" width={40} height={15} />
                                                        </TableCell>
                                                        <TableCell className="py-3 text-right">
                                                            <div className="flex flex-col items-end">
                                                                <span className="text-xs font-mono">Rs. {stock.close}</span>
                                                                <span className="text-[9px] text-slate-400">High: {stock.weeks_52_high}</span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="py-3 text-right">
                                                            <ArrowUpRight size={14} className="text-emerald-500" />
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    ) : (
                                        <div className="p-6 text-center text-xs text-slate-400 italic">No stocks near 52-week high</div>
                                    )}
                                </CardContent>
                            </Card>

                            {/* Near 52-Week Low */}
                            <Card className="bg-white dark:bg-slate-900/50 border-none shadow-xl shadow-slate-200/50 dark:shadow-none overflow-hidden relative backdrop-blur-xl">
                                <CardHeader className="p-5 border-b border-slate-50 dark:border-slate-800">
                                    <CardTitle className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-2">
                                        <Target size={14} className="text-rose-600" /> NEAR 52-WEEK LOW
                                    </CardTitle>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Trading within 2% of yearly bottom</p>
                                </CardHeader>
                                <CardContent className="p-0">
                                    {scanners.nearLow.length > 0 ? (
                                        <Table>
                                            <TableBody>
                                                {scanners.nearLow.map((stock) => (
                                                    <TableRow
                                                        key={stock.ticker}
                                                        className="border-slate-50 dark:border-white/5 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5"
                                                        onClick={() => router.push(`/ticker/${stock.ticker}`)}
                                                    >
                                                        <TableCell className="py-3 font-bold text-xs">{stock.ticker}</TableCell>
                                                        <TableCell className="py-3">
                                                            <Sparkline data={stock.sparkline} color="#f43f5e" width={40} height={15} />
                                                        </TableCell>
                                                        <TableCell className="py-3 text-right">
                                                            <div className="flex flex-col items-end">
                                                                <span className="text-xs font-mono">Rs. {stock.close}</span>
                                                                <span className="text-[9px] text-slate-400">Low: {stock.weeks_52_low}</span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="py-3 text-right">
                                                            <ArrowDownRight size={14} className="text-rose-500" />
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    ) : (
                                        <div className="p-6 text-center text-xs text-slate-400 italic">No stocks near 52-week low</div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>

                        {/* WHALE WATCH */}
                        {data?.whale_watch && <WhaleWatchCard data={data.whale_watch} />}

                        {/* SECTOR HEATMAP */}
                        {data?.sector_summary && <SectorHeatmap sectors={data.sector_summary} />}

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
                                                <Sparkline data={stock.sparkline} color="#f97316" width={50} height={20} />
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

                    </>
                )}

            </motion.div>
        </DashboardLayout>
    );
}
