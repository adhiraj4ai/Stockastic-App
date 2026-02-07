'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    TrendingUp, TrendingDown, Activity, DollarSign, Zap, BarChart3, Globe, ShieldAlert,
    HeartPulse, Activity as ActivityIcon, LineChart, LayoutDashboard, Search, Clock,
    Command as CommandIcon, Wallet, Lightbulb, MessageSquare, Landmark, Building2,
    Droplets, Boxes, Factory, ShoppingBag, Hotel, Plane, Phone, HardHat, ShieldCheck,
    Coins, PieChart
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    CommandDialog,
    CommandInput,
    CommandList,
    CommandEmpty,
    CommandGroup,
    CommandItem
} from '@/components/ui/command';
import { SectorGraph } from '@/components/SectorGraph';
import { Sparkline } from '@/components/Sparkline';
import { MarketBubbleMap } from '@/components/MarketBubbleMap';
import { MarketHeatmap } from '@/components/MarketHeatmap';
import { SentimentGauge } from '@/components/SentimentGauge';
import { MarketHealthRadar } from '@/components/MarketHealthRadar';
import { VolumeShockers } from '@/components/VolumeShockers';
import { MiniSectorCard } from '@/components/MiniSectorCard';
import { BreakoutWatchlist } from '@/components/BreakoutWatchlist';
import { TopGainersChart } from '@/components/TopGainersChart';
import { MarketBreadthTrend } from '@/components/MarketBreadthTrend';
import { InstitutionalInterest } from '@/components/InstitutionalInterest';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Variants } from 'framer-motion';

const containerVariants: Variants = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.1
        }
    }
};

const itemVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    show: {
        opacity: 1,
        y: 0,
        transition: {
            type: 'spring',
            stiffness: 100,
            damping: 15
        }
    }
};

interface StockData {
    ticker: string;
    close: number;
    open: number;
    high: number;
    low: number;
    volume: number;
    turnover: number;
    change: number;
    percent_change: number;
    sector: string;
}

interface MarketSummaryData {
    market_summary: {
        date: string;
        total_turnover: number;
        total_volume: number;
        total_points: number;
        points_change: number;
        percent_change: number;
        advancers: number;
        decliners: number;
        advancers_percent: number;
        decliners_percent: number;
    };
    top_volume: StockData[];
    top_turnover: StockData[];
    top_gainers: StockData[];
    bottom_volume: StockData[];
    bottom_turnover: StockData[];
    top_losers: StockData[];
    sector_summary?: {
        name: string;
        change: number;
        turnover: number;
        volume: number;
        count: number;
    }[];
}

export default function DashboardPage() {
    const [data, setData] = useState<MarketSummaryData | null>(null);
    const [allStocks, setAllStocks] = useState<StockData[]>([]);
    const [loading, setLoading] = useState(true);
    const [recentStocks, setRecentStocks] = useState<string[]>([]);
    const [isCommandOpen, setIsCommandOpen] = useState(false);
    const [portfolioStats, setPortfolioStats] = useState({ investment: 0, dayPL: 0, dailyPLPositive: true });
    const [error, setError] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);

    const router = useRouter();
    // Load Recently Viewed
    useEffect(() => {
        const saved = localStorage.getItem('recent_stocks');
        if (saved) {
            try {
                setRecentStocks(JSON.parse(saved));
            } catch (e) {
                console.error("Failed to parse recent stocks", e);
            }
        }
    }, []);

    // Command Palette Keyboard Shortcut
    useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                setIsCommandOpen((open) => !open)
            }
        }
        document.addEventListener("keydown", down)
        return () => document.removeEventListener("keydown", down)
    }, [])
    useEffect(() => {
        setMounted(true);

        const fetchData = async () => {
            try {
                // Fetch Market Summary
                const summaryResponse = await api.get('/api/stocks/summary/');
                setData(summaryResponse.data);

                // Fetch Portfolio for Stats
                const portfolioResponse = await api.get('/api/stocks/portfolio/');
                const portfolioItems: any[] = portfolioResponse.data;

                const totalInvestment = portfolioItems.reduce((acc, item) => acc + Number(item.investment_value), 0);
                const totalDayPL = portfolioItems.reduce((acc, item) => acc + Number(item.day_gain_loss), 0);

                setPortfolioStats({
                    investment: totalInvestment,
                    dayPL: totalDayPL,
                    dailyPLPositive: totalDayPL >= 0
                });

                // Flatten all stocks for heatmap from all top lists to get a better sample
                const uniqueStocks = new Map<string, StockData>();
                const sourceLists = [
                    summaryResponse.data.top_gainers,
                    summaryResponse.data.top_losers,
                    summaryResponse.data.top_turnover,
                    summaryResponse.data.top_volume
                ];

                sourceLists.flat().filter(Boolean).forEach(s => {
                    uniqueStocks.set(s.ticker, {
                        ...s,
                        sector: s.sector || 'Others'
                    });
                });
                setAllStocks(Array.from(uniqueStocks.values()));

            } catch (err: any) {
                console.error('Failed to fetch dashboard data', err);
                const msg = err.response?.data?.detail || err.message;
                setError(`Failed to load data: ${msg}`);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [router]);

    // Simulated Sparkline Data (Since historical index point is not in summary)
    const indexSparkData = useMemo(() => {
        if (!data || !data.market_summary) return [];
        const points = 10;
        const current = data.market_summary.total_points;
        const change = data.market_summary.points_change;
        const start = current - change;
        const trend = Array.from({ length: points }, (_, i) => {
            const progress = i / (points - 1);
            const noise = (Math.random() - 0.5) * (Math.abs(change) * 0.2);
            return start + (change * progress) + noise;
        });
        return trend;
    }, [data]);

    // Calculate Market Sentiment (0 to 100)
    const marketSentiment = useMemo(() => {
        if (!data || !data.market_summary) return 50;
        const { advancers, decliners, points_change } = data.market_summary;
        const total = advancers + decliners;
        if (total === 0) return 50;
        const breadthRatio = (advancers / total) * 100;
        const momentumBonus = points_change > 0 ? 10 : -10;
        return Math.max(0, Math.min(100, breadthRatio + momentumBonus));
    }, [data]);

    // Market Health radar data
    const marketHealthData = useMemo(() => {
        if (!data || !data.market_summary) return { volume: 50, turnover: 50, breadth: 50, volatility: 50, participation: 50 };
        return {
            volume: 75, // Simulated high volume
            turnover: 65,
            breadth: data.market_summary.advancers_percent,
            volatility: 80, // Higher stability = higher score
            participation: 70
        };
    }, [data]);

    if (!mounted) return null;

    if (error) {
        return (
            <DashboardLayout>
                <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-8">
                    <ShieldAlert className="h-12 w-12 text-red-500 mb-4" />
                    <div className="text-red-500 dark:text-red-400 text-xl font-bold mb-2">Error Loading Dashboard</div>
                    <div className="text-gray-600 dark:text-gray-400 mb-6">{error}</div>
                    <button
                        onClick={() => window.location.reload()}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium shadow-lg shadow-blue-200"
                    >
                        Retry Connection
                    </button>
                </div>
            </DashboardLayout>
        );
    }

    if (loading) {
        return (
            <DashboardLayout>
                <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
                    <div className="relative h-16 w-16">
                        <div className="absolute inset-0 rounded-full border-4 border-blue-100 dark:border-blue-900"></div>
                        <div className="absolute inset-0 rounded-full border-4 border-blue-600 border-t-transparent animate-spin"></div>
                    </div>
                    <div className="text-gray-500 dark:text-gray-400 font-medium animate-pulse">Initializing Data Stream...</div>
                </div>
            </DashboardLayout>
        );
    }

    if (!data || !data.market_summary) {
        return (
            <DashboardLayout>
                <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-8">
                    <span className="text-gray-500 dark:text-gray-400">No market data available yet. Please run data ingestion.</span>
                </div>
            </DashboardLayout>
        );
    }

    const { market_summary, top_volume, top_turnover, top_gainers, top_losers, sector_summary } = data;
    const isPositive = market_summary.points_change >= 0;

    const sectorConfig: Record<string, { icon: React.ReactNode, gradient: string }> = {
        'Commercial Banks': { icon: <Landmark />, gradient: 'from-blue-600/20 to-indigo-600/20' },
        'Development Banks': { icon: <Building2 />, gradient: 'from-indigo-400/20 to-blue-500/20' },
        'Finance': { icon: <DollarSign />, gradient: 'from-cyan-400/20 to-blue-500/20' },
        'Hotels And Tourism': { icon: <Hotel />, gradient: 'from-orange-400/20 to-amber-500/20' },
        'Hydro Power': { icon: <Droplets />, gradient: 'from-blue-400/20 to-cyan-500/20' },
        'Life Insurance': { icon: <HeartPulse />, gradient: 'from-rose-400/20 to-red-500/20' },
        'Microfinance': { icon: <Boxes />, gradient: 'from-emerald-400/20 to-teal-500/20' },
        'Mutual Fund': { icon: <PieChart />, gradient: 'from-slate-400/20 to-slate-500/20' },
        'Non Life Insurance': { icon: <ShieldCheck />, gradient: 'from-orange-500/20 to-rose-500/20' },
        'Manufacturing And Processing': { icon: <Factory />, gradient: 'from-purple-500/20 to-indigo-500/20' },
        'Investment': { icon: <BarChart3 />, gradient: 'from-blue-500/20 to-indigo-500/20' },
        'Trading': { icon: <ShoppingBag />, gradient: 'from-pink-500/20 to-rose-500/20' },
        'Others': { icon: <Globe />, gradient: 'from-slate-500/20 to-slate-600/20' }
    };

    const addToRecent = (ticker: string) => {
        const next = [ticker, ...recentStocks.filter(s => s !== ticker)].slice(0, 5);
        setRecentStocks(next);
        localStorage.setItem('recent_stocks', JSON.stringify(next));
    };

    const handleStockClick = (ticker: string) => {
        addToRecent(ticker);
        router.push(`/ticker/${ticker}`);
    };

    const StockRow = ({ stock }: { stock: StockData }) => {
        const isStockPositive = stock.change >= 0;
        return (
            <TableRow
                key={stock.ticker}
                className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 border-transparent transition-colors group"
                onClick={() => handleStockClick(stock.ticker)}
            >
                <TableCell className="py-2.5">
                    <div className="flex flex-col">
                        <span className="font-semibold text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{stock.ticker}</span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">{stock.sector || 'Listed Equity'}</span>
                    </div>
                </TableCell>
                <TableCell className="text-right py-2.5 font-mono font-medium text-slate-700 dark:text-slate-300">
                    {Number(stock.close).toLocaleString()}
                </TableCell>
                <TableCell className={`text-right py-2.5 font-bold ${isStockPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                    <div className="flex items-center justify-end gap-1">
                        {isStockPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                        {Number(stock.percent_change).toFixed(2)}%
                    </div>
                </TableCell>
            </TableRow>
        );
    };

    return (
        <DashboardLayout
            noPadding
            title={<>Market <span className="text-blue-600 dark:text-blue-400">Terminal</span></>}
            subtitle="Real-time analytics and predictive insights for your strategic operations."
            extraHeaderItems={
                <Badge className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 px-3 py-1 font-bold text-[10px] tracking-widest rounded-full shadow-sm border flex items-center transition-all whitespace-nowrap">
                    {market_summary.date}
                </Badge>
            }
        >
            {/* 1. Market Pulse Ticker */}
            <div className="bg-slate-900 dark:bg-black/80 overflow-hidden py-1.5 border-b border-slate-800 dark:border-slate-900 transition-colors duration-500">
                <div className="flex animate-infinite-scroll whitespace-nowrap items-center gap-12 px-4">
                    {top_gainers.concat(top_losers).slice(0, 10).map((stock, i) => (
                        <div key={i} className="flex items-center gap-2 cursor-pointer opacity-80 hover:opacity-100 transition-opacity" onClick={() => router.push(`/ticker/${stock.ticker}`)}>
                            <span className="font-bold text-xs text-slate-200 dark:text-slate-300 tracking-wider">{stock.ticker}</span>
                            <span className="font-mono text-xs text-slate-400 dark:text-slate-500">{stock.close}</span>
                            <span className={`text-[10px] font-bold px-1.5 rounded-sm ${stock.change >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                                {stock.change >= 0 ? '+' : ''}{stock.percent_change.toFixed(1)}%
                            </span>
                        </div>
                    ))}
                    {/* Duplicate for seamless scroll */}
                    {top_gainers.concat(top_losers).slice(0, 10).map((stock, i) => (
                        <div key={`d-${i}`} className="flex items-center gap-2 cursor-pointer opacity-80 hover:opacity-100 transition-opacity" onClick={() => router.push(`/ticker/${stock.ticker}`)}>
                            <span className="font-bold text-xs text-slate-200 dark:text-slate-300 tracking-wider">{stock.ticker}</span>
                            <span className="font-mono text-xs text-slate-400 dark:text-slate-500">{stock.close}</span>
                            <span className={`text-[10px] font-bold px-1.5 rounded-sm ${stock.change >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                                {stock.change >= 0 ? '+' : ''}{stock.percent_change.toFixed(1)}%
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="px-6 lg:px-12 py-8 space-y-8 bg-transparent relative min-h-screen transition-colors duration-500">


                {/* 3. Main Operational Grid */}
                <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="show"
                    className="grid grid-cols-1 xl:grid-cols-4 gap-6 items-start"
                >

                    {/* LEFT COLUMN: Deep Analysis & Watchlists */}
                    <motion.div variants={itemVariants} className="xl:col-span-1 space-y-6">

                        {/* Market Sentiment Gauge */}
                        <Card className="bg-white dark:bg-slate-900/50 border-none shadow-xl shadow-slate-200/50 dark:shadow-none hover:shadow-2xl transition-all duration-500 cursor-default group backdrop-blur-xl relative overflow-hidden">
                            <div className="absolute -right-8 -top-8 w-32 h-32 bg-gradient-to-br from-rose-500/10 to-transparent blur-2xl opacity-50" />
                            <CardHeader className="p-3 pb-1">
                                <CardTitle className="text-sm font-bold text-black dark:text-slate-100 tracking-tight flex items-center gap-2">
                                    <HeartPulse size={14} className="text-rose-500" /> Market Sentiment
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-6 pt-0">
                                <SentimentGauge value={marketSentiment} height={240} />
                                <div className="mt-2 space-y-4">
                                    <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full flex overflow-hidden">
                                        <div className="h-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]" style={{ width: `${market_summary.advancers_percent}%` }}></div>
                                        <div className="h-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.3)]" style={{ width: `${market_summary.decliners_percent}%` }}></div>
                                    </div>
                                    <div className="flex justify-between text-[10px] font-black tracking-widest">
                                        <div className="flex flex-col items-start gap-1">
                                            <span className="text-emerald-700 dark:text-emerald-400 italic">Advancers</span>
                                            <span className="text-xl text-black dark:text-slate-100">{market_summary.advancers}</span>
                                        </div>
                                        <div className="flex flex-col items-end gap-1 text-right">
                                            <span className="text-rose-700 dark:text-rose-400 italic">Decliners</span>
                                            <span className="text-xl text-black dark:text-slate-100">{market_summary.decliners}</span>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Market Snapshot Recap */}
                        <Card className="bg-white dark:bg-slate-900/50 border-none shadow-xl shadow-slate-200/50 dark:shadow-none overflow-hidden relative backdrop-blur-xl">
                            <div className="absolute -left-8 -top-8 w-32 h-32 bg-gradient-to-br from-blue-500/10 to-transparent blur-2xl opacity-50" />
                            <CardHeader className="p-4 pb-1 border-b border-slate-50 dark:border-slate-800">
                                <CardTitle className="text-xs font-black text-slate-800 dark:text-slate-100 tracking-widest flex items-center gap-2">
                                    <ActivityIcon size={14} className="text-blue-600" /> SNAPSHOT
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase">Volume</span>
                                        <div className="font-mono font-bold text-slate-900 dark:text-slate-100">{(market_summary.total_volume / 1000000).toFixed(1)}M</div>
                                    </div>
                                    <div className="space-y-1 text-right">
                                        <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase">Turnover</span>
                                        <div className="font-mono font-bold text-slate-900 dark:text-slate-100">Rs. {(market_summary.total_turnover / 1000000).toFixed(0)}M</div>
                                    </div>
                                </div>

                                <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 flex items-center justify-between group/breadth hover:border-blue-500/30 transition-colors">
                                    <div className="flex flex-col">
                                        <span className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase">Breadth Ratio</span>
                                        <span className="text-lg font-black text-slate-900 dark:text-slate-100 italic">{(market_summary.advancers / (market_summary.advancers + market_summary.decliners || 1)).toFixed(2)}</span>
                                    </div>
                                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center transition-transform group-hover/breadth:scale-110 ${marketSentiment > 50 ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' : 'bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400'}`}>
                                        <Activity size={18} />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Breakout Watchlist */}
                        <Card className="bg-white dark:bg-slate-900 border-none shadow-xl shadow-slate-200/50 dark:shadow-none">
                            <CardContent className="p-5">
                                <BreakoutWatchlist stocks={allStocks} />
                            </CardContent>
                        </Card>

                        {/* Institutional Interest */}
                        <Card className="bg-white dark:bg-slate-900 border-none shadow-xl shadow-slate-200/50 dark:shadow-none">
                            <CardContent className="p-5">
                                <InstitutionalInterest />
                            </CardContent>
                        </Card>

                    </motion.div>

                    {/* MIDDLE COLUMN: Bubble Map and Lists */}
                    <motion.div variants={itemVariants} className="xl:col-span-3 grid grid-cols-1 lg:grid-cols-3 gap-6">

                        {/* Market Heatmap */}
                        <Card className="lg:col-span-2 bg-white dark:bg-slate-900/50 border-none shadow-xl shadow-slate-200/50 dark:shadow-none overflow-hidden group hover:shadow-2xl transition-all duration-300 backdrop-blur-xl relative">
                            <div className="absolute -right-12 -bottom-12 w-48 h-48 bg-gradient-to-tl from-blue-500/10 to-transparent blur-3xl opacity-50" />
                            <CardHeader className="p-5 border-b border-slate-50 dark:border-white/5 flex flex-row items-center justify-between relative z-10">
                                <div className="space-y-1">
                                    <CardTitle className="text-base font-black text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
                                        <Globe size={16} className="text-blue-600 group-hover:rotate-12 transition-transform" /> Market Liquidity Map
                                    </CardTitle>
                                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Size represents turnover, color represents performance</p>
                                </div>
                            </CardHeader>
                            <CardContent className="p-0 relative z-10">
                                <MarketBubbleMap stocks={allStocks} height={480} />
                            </CardContent>
                        </Card>

                        {/* Top Gainers Performance Graph */}
                        <Card className="lg:col-span-3 bg-white dark:bg-slate-900/50 border-none shadow-xl shadow-slate-200/50 dark:shadow-none overflow-hidden backdrop-blur-xl relative group">
                            <CardHeader className="p-5 border-b border-slate-50 dark:border-white/5 flex flex-row items-center justify-between relative z-10">
                                <div className="space-y-1">
                                    <CardTitle className="text-base font-black text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
                                        <TrendingUp size={16} className="text-emerald-500" /> One-Month Performance (Top Gainers)
                                    </CardTitle>
                                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Relative growth index over last 30 intervals</p>
                                </div>
                            </CardHeader>
                            <CardContent className="p-6 relative z-10">
                                <TopGainersChart gainers={top_gainers} height={340} />
                            </CardContent>
                        </Card>

                        {/* Actionable Stock Lists (Tabbed) */}
                        <Card className="xl:col-span-1 bg-white dark:bg-slate-900/50 border-none shadow-xl shadow-slate-200/50 dark:shadow-none h-full flex flex-col backdrop-blur-xl relative overflow-hidden">
                            <div className="absolute -left-8 -bottom-8 w-32 h-32 bg-gradient-to-tr from-indigo-500/10 to-transparent blur-2xl opacity-50" />
                            <CardHeader className="p-3 pb-1 relative z-10">
                                <CardTitle className="text-sm font-bold text-black dark:text-slate-100 tracking-tight flex items-center gap-2">
                                    <Zap size={14} className="text-blue-500" /> High Alpha Signals
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-6 pt-0 flex-1 overflow-hidden flex flex-col">
                                <Tabs defaultValue="gainers" className="w-full h-full flex flex-col">
                                    <TabsList className="grid w-full grid-cols-2 mb-4 bg-slate-100 dark:bg-slate-800/50 p-1 rounded-xl h-10 border border-slate-200/50 dark:border-slate-800">
                                        <TabsTrigger value="gainers" className="rounded-lg font-bold text-[10px] tracking-widest data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 data-[state=active]:shadow-sm">Top Gainers</TabsTrigger>
                                        <TabsTrigger value="losers" className="rounded-lg font-bold text-[10px] tracking-widest data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 data-[state=active]:shadow-sm">Top Losers</TabsTrigger>
                                    </TabsList>
                                    <div className="flex-1 overflow-auto -mx-2 px-2 scrollbar-hide">
                                        <TabsContent value="gainers" className="m-0 focus-visible:outline-none">
                                            <Table>
                                                <TableBody>
                                                    {top_gainers.slice(0, 8).map((stock) => <StockRow key={stock.ticker} stock={stock} />)}
                                                </TableBody>
                                            </Table>
                                        </TabsContent>
                                        <TabsContent value="losers" className="m-0 focus-visible:outline-none">
                                            <Table>
                                                <TableBody>
                                                    {top_losers.slice(0, 8).map((stock) => <StockRow key={stock.ticker} stock={stock} />)}
                                                </TableBody>
                                            </Table>
                                        </TabsContent>
                                    </div>
                                </Tabs>
                            </CardContent>
                        </Card>

                        {/* Lower Tier Middle: Breadth Trend & Portfolio */}
                        <div className="lg:col-span-3 grid grid-cols-1 lg:grid-cols-12 gap-6">

                            {/* Market Breadth Trend */}
                            <div className="lg:col-span-5">
                                <Card className="bg-white dark:bg-slate-900 border-none shadow-xl shadow-slate-200/50 dark:shadow-none h-full">
                                    <CardHeader className="p-3 pb-1">
                                        <CardTitle className="text-sm font-bold text-black dark:text-slate-100 tracking-tight flex items-center gap-2">
                                            <LineChart size={14} className="text-emerald-500" /> Breadth Trend (5D)
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-6 pt-0">
                                        <MarketBreadthTrend height={220} />
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Market Health Radar */}
                            <div className="lg:col-span-7">
                                <Card className="bg-white dark:bg-slate-900 border-none shadow-xl shadow-slate-200/50 dark:shadow-none h-full">
                                    <CardHeader className="p-3 pb-1">
                                        <CardTitle className="text-sm font-bold text-black dark:text-slate-100 tracking-tight flex items-center gap-2">
                                            <ActivityIcon size={14} className="text-blue-500" /> Rally Quality Matrix
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-6 pt-0">
                                        <div className="flex flex-col md:flex-row items-center gap-6">
                                            <div className="flex-1">
                                                <MarketHealthRadar data={marketHealthData} height={250} />
                                            </div>
                                            <div className="w-full md:w-48 space-y-4">
                                                <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm transition-all hover:border-blue-500/20">
                                                    <span className="text-[9px] font-black text-slate-900 dark:text-slate-400 block mb-1 uppercase tracking-wider">Health Index</span>
                                                    <div className="text-2xl font-black text-blue-600 dark:text-blue-400 tracking-tighter">72.4 <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold ml-1">Stable</span></div>
                                                </div>
                                                <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm transition-all hover:border-blue-500/20">
                                                    <span className="text-[9px] font-black text-slate-900 dark:text-slate-400 block mb-1 uppercase tracking-wider">Confirmation</span>
                                                    <div className="text-[10px] font-bold text-slate-700 dark:text-slate-300 leading-tight">Price action confirmed by volume participation.</div>
                                                </div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        </div>

                        {/* DETAILED STATISTICS ROW */}
                        <div className="lg:col-span-3 grid grid-cols-1 lg:grid-cols-3 gap-6">

                            {/* Sector Rankings */}
                            <Card className="lg:col-span-2 bg-white dark:bg-slate-900 border-none shadow-xl shadow-slate-200/50 dark:shadow-none">
                                <CardHeader className="p-3 pb-1">
                                    <CardTitle className="text-sm font-bold text-black dark:text-slate-100 tracking-tight flex items-center gap-2">
                                        <BarChart3 size={14} /> Sector Performance & Liquidity Matrix
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-6 pt-0">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4 mt-6">
                                        {(sector_summary || []).sort((a, b) => b.change - a.change).slice(0, 10).map((sector, i) => (
                                            <div key={i} className="space-y-1.5 group/item">
                                                <div className="flex justify-between text-[11px] font-bold tracking-tight">
                                                    <span className="text-slate-800 dark:text-slate-300 truncate max-w-[150px] group-hover/item:text-blue-600 dark:group-hover/item:text-blue-400 transition-colors uppercase tracking-wider">{sector.name}</span>
                                                    <span className={`${sector.change >= 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                                                        {sector.change >= 0 ? '+' : ''}{sector.change.toFixed(2)}%
                                                    </span>
                                                </div>
                                                <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-200/50 dark:border-slate-800">
                                                    <div
                                                        className={`h-full ${sector.change >= 0 ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-rose-50 dark:bg-rose-400 opacity-80'}`}
                                                        style={{ width: `${Math.min(100, Math.abs(sector.change) * 20)}%` }}
                                                    ></div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Portfolio Quick Access */}
                            <Card className="bg-white dark:bg-slate-900 border-none shadow-xl shadow-slate-200/50 dark:shadow-none">
                                <CardHeader className="p-3 pb-1">
                                    <CardTitle className="text-sm font-bold text-black dark:text-slate-100 tracking-tight flex items-center gap-2">
                                        <DollarSign size={14} className="text-blue-500" /> Account Exposure
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-6 pt-0 flex flex-col justify-center gap-6 h-full min-h-[300px]">
                                    <div className="space-y-1">
                                        <span className="text-[10px] font-black text-slate-600 dark:text-slate-400 tracking-widest">Total Value</span>
                                        <div className="text-3xl font-black text-black dark:text-slate-100 tracking-tighter">Rs. {portfolioStats.investment.toLocaleString()}</div>
                                    </div>

                                    <div className="grid grid-cols-1 gap-4">
                                        <div className={`p-4 rounded-3xl ${portfolioStats.dailyPLPositive ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/30' : 'bg-rose-50 dark:bg-rose-950/20 border-rose-100 dark:border-rose-900/30'} border transition-colors duration-500`}>
                                            <span className={`text-[9px] font-black tracking-widest block mb-1 ${portfolioStats.dailyPLPositive ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>Day Gain/Loss</span>
                                            <div className={`text-xl font-black ${portfolioStats.dailyPLPositive ? 'text-emerald-800 dark:text-emerald-500' : 'text-rose-800 dark:text-rose-500'}`}>
                                                {portfolioStats.dailyPLPositive ? '+' : ''}{portfolioStats.dayPL.toLocaleString()}
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => router.push('/portfolio')}
                                            className="w-full py-3 bg-slate-900 dark:bg-slate-700 text-white rounded-2xl font-black text-[10px] tracking-widest hover:bg-slate-800 dark:hover:bg-slate-600 transition-all transform active:scale-95 shadow-lg shadow-slate-200 dark:shadow-none"
                                        >
                                            View Full Portfolio
                                        </button>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* FINAL ROW: Volume Drivers & Convergence */}
                        <div className="lg:col-span-3 grid grid-cols-1 lg:grid-cols-12 gap-6">
                            <div className="lg:col-span-8">
                                <Card className="bg-white dark:bg-slate-900 border-none shadow-xl shadow-slate-200/50 dark:shadow-none">
                                    <CardHeader className="p-3 pb-1">
                                        <CardTitle className="text-sm font-bold text-black dark:text-slate-100 tracking-tight flex items-center gap-2">
                                            <ActivityIcon size={14} className="text-indigo-500" /> Rotation & Convergence
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-6 pt-0">
                                        <div className="h-[350px]">
                                            <SectorGraph />
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>

                            <div className="lg:col-span-4 h-full">
                                <Card className="bg-white dark:bg-slate-900 border-none shadow-xl shadow-slate-200/50 dark:shadow-none h-full">
                                    <CardHeader className="p-3 pb-1">
                                        <CardTitle className="text-sm font-bold text-black dark:text-slate-100 tracking-tight flex items-center gap-2">
                                            <Zap size={14} /> Volume Shockers
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-6 pt-0">
                                        <VolumeShockers stocks={top_turnover} />
                                    </CardContent>
                                </Card>
                            </div>
                        </div>
                    </motion.div>

                    {/* DETAILED SECTOR PERFORMANCE TABLE (Moved to Bottom) */}
                    <motion.div
                        variants={itemVariants}
                        className="xl:col-span-4"
                    >
                        <Card className="bg-white/50 dark:bg-slate-900/40 border-none shadow-xl shadow-slate-200/50 dark:shadow-none backdrop-blur-xl overflow-hidden">
                            <CardHeader className="p-4 pb-2 border-b border-slate-100 dark:border-white/5 flex flex-row items-center justify-between">
                                <CardTitle className="text-sm font-black text-slate-900 dark:text-slate-100 tracking-tighter flex items-center gap-2">
                                    <TrendingUp size={16} className="text-blue-600" /> SECTOR PERFORMANCE MATRIX
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="overflow-x-auto custom-scrollbar">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="border-transparent hover:bg-transparent">
                                                <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 w-[240px]">Index Name</TableHead>
                                                <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 text-right">Change (%)</TableHead>
                                                <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 text-right">Turnover (Rs.)</TableHead>
                                                <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 text-right">Volume (Qty)</TableHead>
                                                <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 text-right w-[120px]">Trend</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {(sector_summary || []).slice(0, 15).map((sector, i) => {
                                                const isPositive = sector.change >= 0;
                                                return (
                                                    <TableRow key={i} className="group border-slate-50 dark:border-white/5 hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
                                                        <TableCell className="py-3">
                                                            <div className="flex items-center gap-3">
                                                                <div className={`p-1.5 rounded-lg bg-gradient-to-br ${sectorConfig[sector.name]?.gradient || 'from-slate-500/10 to-slate-600/10'} text-slate-700 dark:text-slate-400 shadow-sm opacity-70 group-hover:opacity-100 transition-opacity`}>
                                                                    {sectorConfig[sector.name]?.icon ? React.cloneElement(sectorConfig[sector.name].icon as React.ReactElement<any>, { size: 14 }) : <Activity size={14} />}
                                                                </div>
                                                                <span className="text-xs font-black text-slate-800 dark:text-slate-200 tracking-tight group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors uppercase">{sector.name}</span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className={`text-right py-3 font-black text-sm ${isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                                            <div className="flex items-center justify-end gap-1.5">
                                                                {isPositive ? <TrendingUp size={12} className="opacity-50" /> : <TrendingDown size={12} className="opacity-50" />}
                                                                {isPositive ? '+' : ''}{sector.change.toFixed(2)}%
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-right py-3">
                                                            <span className="text-xs font-mono font-black text-slate-900 dark:text-slate-100">{(sector.turnover / 1000000).toFixed(2)}M</span>
                                                        </TableCell>
                                                        <TableCell className="text-right py-3">
                                                            <span className="text-xs font-mono font-black text-slate-600 dark:text-slate-300">{(sector.volume || sector.turnover / 500).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                                        </TableCell>
                                                        <TableCell className="text-right py-3">
                                                            <div className="h-6 w-20 ml-auto opacity-70 group-hover:opacity-100 transition-opacity">
                                                                <Sparkline
                                                                    data={[20, 30, 25, 40, 35, 50, sector.change > 0 ? 60 : 40]}
                                                                    height={24}
                                                                    color={isPositive ? '#10b981' : '#f43f5e'}
                                                                />
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>
                    </motion.div>
                </motion.div>
            </div>

            {/* Command Palette */}
            <CommandDialog open={isCommandOpen} onOpenChange={setIsCommandOpen}>
                <CommandInput placeholder="Type a ticker or command..." />
                <CommandList>
                    <CommandEmpty>No results found.</CommandEmpty>
                    {recentStocks.length > 0 && (
                        <CommandGroup heading="Recent">
                            {recentStocks.map(symbol => (
                                <CommandItem
                                    key={symbol}
                                    onSelect={() => {
                                        handleStockClick(symbol);
                                        setIsCommandOpen(false);
                                    }}
                                    className="flex items-center gap-2"
                                >
                                    <Clock className="h-4 w-4 text-slate-400" />
                                    <span className="font-bold">{symbol}</span>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    )}
                    <CommandGroup heading="Active Stocks">
                        {allStocks.slice(0, 10).map(stock => (
                            <CommandItem
                                key={stock.ticker}
                                onSelect={() => {
                                    handleStockClick(stock.ticker);
                                    setIsCommandOpen(false);
                                }}
                                className="flex items-center justify-between"
                            >
                                <div className="flex items-center gap-2">
                                    <div className="p-1 bg-slate-100 dark:bg-slate-800 rounded">
                                        <TrendingUp className="h-3 w-3 text-blue-600" />
                                    </div>
                                    <span className="font-bold">{stock.ticker}</span>
                                    <span className="text-xs text-slate-400 dark:text-slate-500">{stock.sector}</span>
                                </div>
                                <span className={stock.percent_change >= 0 ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}>
                                    {stock.percent_change.toFixed(2)}%
                                </span>
                            </CommandItem>
                        ))}
                    </CommandGroup>
                    <CommandGroup heading="Navigation">
                        <CommandItem onSelect={() => { router.push('/portfolio'); setIsCommandOpen(false); }}>
                            <Wallet className="mr-2 h-4 w-4" /> Portfolio
                        </CommandItem>
                        <CommandItem onSelect={() => { router.push('/strategies'); setIsCommandOpen(false); }}>
                            <Lightbulb className="mr-2 h-4 w-4" /> Strategies
                        </CommandItem>
                        <CommandItem onSelect={() => { router.push('/chat'); setIsCommandOpen(false); }}>
                            <MessageSquare className="mr-2 h-4 w-4" /> AI Terminal
                        </CommandItem>
                    </CommandGroup>
                </CommandList>
            </CommandDialog>

            <style jsx global>{`
                @keyframes infinite-scroll {
                    from { transform: translateX(0); }
                    to { transform: translateX(-50%); }
                }
                .animate-infinite-scroll {
                    animation: infinite-scroll 40s linear infinite;
                }
                .scrollbar-hide::-webkit-scrollbar {
                    display: none;
                }
                .scrollbar-hide {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
            `}</style>
        </DashboardLayout >
    );
}
