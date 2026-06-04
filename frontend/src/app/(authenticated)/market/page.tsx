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
    Coins, PieChart, Flame
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
import { PageLoader } from '@/components/ui/StockLoader';
import { SectorGraph } from '@/components/SectorGraph';
import { Sparkline } from '@/components/Sparkline';
import { MarketBubbleMap } from '@/components/MarketBubbleMap';
import { MarketHeatmap } from '@/components/MarketHeatmap';
import { SentimentGauge } from '@/components/SentimentGauge';
import { SectorTreemap } from '@/components/SectorTreemap';
import { BrokerFlowChart } from '@/components/BrokerFlowChart';
import { MarketHealthRadar } from '@/components/MarketHealthRadar';
import { VolumeShockers } from '@/components/VolumeShockers';
import { MiniSectorCard } from '@/components/MiniSectorCard';
import { BreakoutWatchlist } from '@/components/BreakoutWatchlist';
import { MarketBreadthTrend } from '@/components/MarketBreadthTrend';
import { InstitutionalInterest } from '@/components/InstitutionalInterest';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Variants } from 'framer-motion';
import { PortfolioSummary } from '@/components/PortfolioSummary';
import { formatNepaliNumber, formatRupees } from '@/lib/formatters';
import { InfoTooltip } from '@/components/ui/InfoTooltip';

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
            type: 'spring' as const,
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
    roc?: number;
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
    top_3_comparison?: {
        today: any;
        last: any;
    };
}

export default function DashboardPage() {
    const [data, setData] = useState<MarketSummaryData | null>(null);
    const [allStocks, setAllStocks] = useState<StockData[]>([]);
    const [loading, setLoading] = useState(true);
    const [recentStocks, setRecentStocks] = useState<string[]>([]);
    const [isCommandOpen, setIsCommandOpen] = useState(false);
    const [portfolioStats, setPortfolioStats] = useState({
        investment: 0,
        currentValue: 0,
        totalPL: 0,
        dayPL: 0,
        dailyPLPositive: true
    });
    const [error, setError] = useState<string | null>(null);
    const [viewMetric, setViewMetric] = useState<'gainers' | 'volume'>('gainers');
    const [mounted, setMounted] = useState(false);

    const [indexHistory, setIndexHistory] = useState<{ date: string, value: number, volume: number, turnover: number }[]>([]);

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

                // Fetch Index History (NEPSE Proxy)
                try {
                    const historyResponse = await api.get('/api/stocks/sector-history/NEPSE/');
                    setIndexHistory(historyResponse.data);
                } catch (hErr) {
                    console.error("Failed to fetch index history", hErr);
                }

                // Fetch Portfolio for Stats
                const portfolioResponse = await api.get('/api/stocks/portfolio/');
                const portfolioItems: any[] = portfolioResponse.data;

                const totalInvestment = portfolioItems.reduce((acc, item) => acc + Number(item.investment_value), 0);
                const totalCurrentValue = portfolioItems.reduce((acc, item) => acc + Number(item.current_value), 0);
                const totalDayPL = portfolioItems.reduce((acc, item) => acc + Number(item.day_gain_loss), 0);
                const totalPL = totalCurrentValue - totalInvestment;

                setPortfolioStats({
                    investment: totalInvestment,
                    currentValue: totalCurrentValue,
                    totalPL: totalPL,
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

    // Trend Sparkline Data (Real or Fallback)
    const indexSparkData = useMemo(() => {
        if (indexHistory.length > 0) {
            // Take last 20 points for sparkline
            return indexHistory.slice(-20).map(d => d.value);
        }

        if (!data || !data.market_summary) return [];
        // Fallback simulation if real data fails
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
    }, [data, indexHistory]);

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

    // Real Market Health Data
    const marketHealth = useMemo(() => {
        if (!data || !data.market_summary || indexHistory.length < 30) {
            // Fallback if not enough history
            return {
                scores: { volume: 50, turnover: 50, breadth: 50, volatility: 50, participation: 50 },
                raw: null
            };
        }

        // Calculate 30-day averages
        const last30 = indexHistory.slice(-30);
        const avgVol = last30.reduce((sum, d) => sum + (d.volume || 0), 0) / last30.length;
        const avgTurn = last30.reduce((sum, d) => sum + (d.turnover || 0), 0) / last30.length;

        const todayVol = data.market_summary.total_volume;
        const todayTurn = data.market_summary.total_turnover;

        // Relative Score (50 = Average, 100 = 2x Average)
        // Cap at 100
        const volScore = Math.min(100, (todayVol / (avgVol || 1)) * 50);
        const turnScore = Math.min(100, (todayTurn / (avgTurn || 1)) * 50);

        const breadthScore = data.market_summary.advancers_percent;

        // Volatility Score (Stability): Lower daily range % is better? 
        // Or actually, consistent uptrend is "Healthy". 
        // Let's use simple Breadth Ratio for now as "Stability/Participation" proxy
        const participationScore = (data.market_summary.advancers / (data.market_summary.advancers + data.market_summary.decliners || 1)) * 100;

        return {
            scores: {
                volume: volScore,
                turnover: turnScore,
                breadth: breadthScore,
                volatility: 75, // Placeholder until IV data
                participation: participationScore
            },
            raw: {
                volume: todayVol,
                avgVolume: avgVol,
                turnover: todayTurn,
                avgTurnover: avgTurn
            }
        };
    }, [data, indexHistory]);

    if (!mounted) return null;

    if (error) {
        return (
            <DashboardLayout>
                <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-8">
                    <ShieldAlert className="h-10 w-10 text-destructive mb-4" />
                    <div className="text-foreground text-base font-semibold mb-2">Error loading dashboard</div>
                    <div className="text-muted-foreground text-sm mb-6">{error}</div>
                    <button
                        onClick={() => window.location.reload()}
                        className="px-4 py-1.5 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition text-sm font-medium"
                    >
                        Retry connection
                    </button>
                </div>
            </DashboardLayout>
        );
    }

    if (loading) {
        return (
            <DashboardLayout>
                <div className="flex items-center justify-center min-h-[50vh]">
                    <PageLoader text="Initializing data stream..." />
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
                className="cursor-pointer hover:bg-accent transition-colors"
                onClick={() => handleStockClick(stock.ticker)}
            >
                <TableCell className="py-2.5">
                    <div className="flex flex-col leading-tight">
                        <span className="font-medium text-foreground">{stock.ticker}</span>
                        <span className="text-[11px] text-muted-foreground">{stock.sector || 'Listed Equity'}</span>
                    </div>
                </TableCell>
                <TableCell className="text-right py-2.5 font-mono text-foreground tabular-nums">
                    {formatNepaliNumber(stock.close)}
                </TableCell>
                <TableCell className={`text-right py-2.5 font-medium tabular-nums ${isStockPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    <div className="flex flex-col items-end leading-tight">
                        <div className="flex items-center justify-end gap-1">
                            {isStockPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                            {Number(stock.percent_change).toFixed(2)}%
                        </div>
                        {stock.roc !== undefined && stock.roc !== null && (
                            <span className="text-[10px] font-mono text-muted-foreground">ROC: {stock.roc}%</span>
                        )}
                    </div>
                </TableCell>
            </TableRow>
        );
    };

    return (
        <DashboardLayout
            noPadding
            title="Market Terminal"
            subtitle="Real-time analytics and predictive insights."
        >
            {/* 1. Market Pulse Ticker */}
            <div className="bg-muted/50 border-b border-border overflow-hidden py-2">
                <div className="flex animate-infinite-scroll whitespace-nowrap items-center gap-10 px-4">
                    {top_gainers.concat(top_losers).slice(0, 10).map((stock, i) => (
                        <div key={i} className="flex items-center gap-2 cursor-pointer hover:opacity-70 transition-opacity" onClick={() => router.push(`/ticker/${stock.ticker}`)}>
                            <span className="font-medium text-xs text-foreground">{stock.ticker}</span>
                            <span className="font-mono text-xs text-muted-foreground tabular-nums">{formatNepaliNumber(stock.close)}</span>
                            <span className={`text-[11px] font-medium tabular-nums ${stock.change >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                {stock.change >= 0 ? '+' : ''}{stock.percent_change.toFixed(1)}%
                            </span>
                        </div>
                    ))}
                    {top_gainers.concat(top_losers).slice(0, 10).map((stock, i) => (
                        <div key={`d-${i}`} className="flex items-center gap-2 cursor-pointer hover:opacity-70 transition-opacity" onClick={() => router.push(`/ticker/${stock.ticker}`)}>
                            <span className="font-medium text-xs text-foreground">{stock.ticker}</span>
                            <span className="font-mono text-xs text-muted-foreground tabular-nums">{formatNepaliNumber(stock.close)}</span>
                            <span className={`text-[11px] font-medium tabular-nums ${stock.change >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                {stock.change >= 0 ? '+' : ''}{stock.percent_change.toFixed(1)}%
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="px-6 lg:px-10 py-6 space-y-6 min-h-screen">


                {/* 3. Main Operational Grid */}
                <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="show"
                    className="grid grid-cols-1 xl:grid-cols-4 gap-6 items-start"
                >

                    {/* LEFT COLUMN: Deep Analysis & Watchlists */}
                    <motion.div variants={itemVariants} className="xl:col-span-1 space-y-6 sticky top-24 self-start">

                        {/* Portfolio Summary */}
                        <PortfolioSummary
                            investment={portfolioStats.investment}
                            currentValue={portfolioStats.currentValue}
                            totalPL={portfolioStats.totalPL}
                            dayPL={portfolioStats.dayPL}
                            loading={loading}
                        />

                        {/* Market Sentiment Gauge */}
                        <Card >
                            <CardHeader className="p-3 pb-1">
                                <CardTitle className="text-sm font-bold text-black dark:text-slate-100 tracking-tight flex items-center">
                                    <HeartPulse size={14} className="text-rose-500 mr-2" /> 
                                    Market Sentiment
                                    <InfoTooltip content="Aggregated market bias (0-100) based on Advancers vs Decliners and price momentum." />
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-6 pt-0">
                                <SentimentGauge value={marketSentiment} height={240} />
                                <div className="mt-2 space-y-4">
                                    <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full flex overflow-hidden">
                                        <div className="h-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]" style={{ width: `${market_summary.advancers_percent}%` }}></div>
                                        <div className="h-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.3)]" style={{ width: `${market_summary.decliners_percent}%` }}></div>
                                    </div>
                                    <div className="flex justify-between text-[10px] font-semibold tracking-wider">
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
                        <Card >
                            <CardHeader className="p-4 pb-1 border-b border-slate-50 dark:border-slate-800">
                                <CardTitle className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight flex items-center">
                                    <ActivityIcon size={14} className="text-blue-600 mr-2" /> 
                                    Snapshot
                                    <InfoTooltip content="Daily liquidity metrics including total volume (qty) and turnover (value) traded." />
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <span className="text-[9px] font-bold text-indigo-400 dark:text-indigo-400/60">Volume</span>
                                        <div className="font-mono font-bold text-slate-900 dark:text-slate-100">{(market_summary.total_volume / 1000000).toFixed(1)}M</div>
                                    </div>
                                    <div className="space-y-1 text-right">
                                        <span className="text-[9px] font-bold text-indigo-400 dark:text-indigo-400/60">Turnover</span>
                                        <div className="font-mono font-bold text-slate-900 dark:text-slate-100">{formatRupees(market_summary.total_turnover / 1000000)}M</div>
                                    </div>
                                </div>

                                <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-border dark:border-slate-800 flex items-center justify-between group/breadth hover:border-indigo-500/30 transition-colors">
                                    <div className="flex flex-col">
                                        <span className="text-[9px] font-bold text-indigo-600/70 dark:text-indigo-400/60">Breadth ratio</span>
                                        <span className="text-lg font-bold text-slate-900 dark:text-slate-100 italic">{(market_summary.advancers / (market_summary.advancers + market_summary.decliners || 1)).toFixed(2)}</span>
                                    </div>
                                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center transition-transform group-hover/breadth:scale-110 ${marketSentiment > 50 ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' : 'bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400'}`}>
                                        <Activity size={18} />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Breakout Watchlist */}
                        <Card >
                            <CardContent className="p-5">
                                <BreakoutWatchlist stocks={allStocks} />
                            </CardContent>
                        </Card>

                        {/* Institutional Interest */}
                        <Card >
                            <CardContent className="p-5">
                                <InstitutionalInterest />
                            </CardContent>
                        </Card>

                        {/* Market Breadth Trend (Moved to Sidebar) */}
                        <Card >
                            <CardHeader className="p-3 pb-1">
                                <CardTitle className="text-sm font-bold text-black dark:text-slate-100 tracking-tight flex items-center gap-2">
                                    <LineChart size={14} className="text-emerald-500" /> Breadth (5D)
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 pt-0">
                                <MarketBreadthTrend height={180} />
                            </CardContent>
                        </Card>

                        {/* Volume Shockers (Moved from Main Grid) */}
                        <Card >
                            <CardHeader className="p-3 pb-1">
                                <CardTitle className="text-sm font-bold text-black dark:text-slate-100 tracking-tight flex items-center gap-2">
                                    <Zap size={14} className="text-orange-500" /> Volume Shockers
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 pt-0">
                                <VolumeShockers stocks={top_turnover} />
                            </CardContent>
                        </Card>


                    </motion.div>

                    {/* MIDDLE COLUMN: Bubble Map and Lists */}
                    <motion.div variants={itemVariants} className="xl:col-span-3 grid grid-cols-1 lg:grid-cols-3 gap-6">

                        {/* Broker Flow / Whale Watch (Moved to Main Grid - Full Width) */}
                        <Card className="lg:col-span-3 ">
                            <CardHeader className="p-5 pb-2 border-b border-slate-50 dark:border-border">
                                <div className="space-y-1">
                                    <CardTitle className="text-sm font-bold text-black dark:text-slate-100 tracking-tight flex items-center">
                                        <Wallet size={14} className="text-blue-500 mr-2" /> 
                                        Smart Money Flow
                                        <InfoTooltip content="Visualizes high-impact net-buying by the top institutional brokers." />
                                    </CardTitle>
                                    <p className="text-[10px] text-indigo-600/70 dark:text-indigo-400/60 font-medium tracking-tight">Tracking the biggest net buyers and their targeted stocks.</p>
                                </div>
                            </CardHeader>
                            <CardContent className="p-6">
                                {/* Using any type for data because WhaleWatchData interface isn't exported yet contextually */}
                                <BrokerFlowChart data={(data as any).whale_watch || []} height={350} />
                            </CardContent>
                        </Card>

                        {/* Market Heatmap */}
                        <Card >
                            <CardHeader className="p-5 border-b border-slate-50 dark:border-border flex flex-row items-center justify-between relative z-10">
                                <div className="space-y-1">
                                    <CardTitle className="text-sm font-bold text-slate-900 dark:text-slate-100 tracking-tight flex items-center">
                                        <Globe size={14} className="text-blue-600 mr-2 group-hover:rotate-12 transition-transform" /> 
                                        Market Liquidity Map
                                        <InfoTooltip content="Bubble chart where size represents turnover and color represents daily percentage change." />
                                    </CardTitle>
                                    <p className="text-[10px] text-indigo-600/70 dark:text-indigo-400/60 font-medium tracking-tight">Size represents turnover, color represents performance</p>
                                </div>
                            </CardHeader>
                            <CardContent className="p-0 relative z-10">
                                <MarketBubbleMap stocks={allStocks} height={480} />
                            </CardContent>
                        </Card>

                        {/* Actionable Stock Lists (Tabbed) */}
                        <Card >
                            <CardHeader className="p-3 pb-1 relative z-10">
                                <CardTitle className="text-sm font-bold text-black dark:text-slate-100 tracking-tight flex items-center gap-2">
                                    <Zap size={14} className="text-blue-500" /> High Alpha Signals
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-6 pt-0 flex-1 overflow-hidden flex flex-col">
                                <Tabs defaultValue="gainers" className="w-full h-full flex flex-col">
                                    <TabsList className="grid w-full grid-cols-3 mb-4 bg-slate-100 dark:bg-slate-800/50 p-1 rounded-xl h-10 border border-border dark:border-slate-800">
                                        <TabsTrigger value="gainers" className="rounded-lg font-bold text-[10px] data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 data-[state=active]:shadow-sm">Top Gainers</TabsTrigger>
                                        <TabsTrigger value="losers" className="rounded-lg font-bold text-[10px] data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 data-[state=active]:shadow-sm">Top Losers</TabsTrigger>
                                        <TabsTrigger value="roc" className="rounded-lg font-bold text-[10px] data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 data-[state=active]:shadow-sm">ROC Watch</TabsTrigger>
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
                                        <TabsContent value="roc" className="m-0 focus-visible:outline-none">
                                            <Table>
                                                <TableBody>
                                                    {[...top_gainers, ...top_losers]
                                                        .filter(s => s.roc !== undefined && s.roc !== null)
                                                        .sort((a, b) => (b.roc || 0) - (a.roc || 0))
                                                        .slice(0, 8)
                                                        .map((stock) => <StockRow key={stock.ticker} stock={stock} />)
                                                    }
                                                </TableBody>
                                            </Table>
                                        </TabsContent>
                                    </div>
                                </Tabs>
                            </CardContent>
                        </Card>


                        {/* Lower Tier Middle: Rally Quality */}
                        <div className="lg:col-span-3 grid grid-cols-1 lg:grid-cols-12 gap-6">

                            {/* Market Health Radar */}
                            <div className="lg:col-span-12">
                                <Card className=" h-full">
                                    <CardHeader className="p-3 pb-1">
                                        <CardTitle className="text-sm font-bold text-black dark:text-slate-100 tracking-tight flex items-center">
                                            <ActivityIcon size={14} className="text-blue-500 mr-2" /> 
                                            Rally Quality Matrix
                                            <InfoTooltip content="A proprietary assessment of the market trend's sustainability based on Volume, Turnover, Breadth, and Participation." />
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-6 pt-0">
                                        <div className="flex flex-col md:flex-row items-center gap-6">
                                            <div className="flex-1">
                                                <MarketHealthRadar
                                                    data={marketHealth.scores}
                                                    rawData={marketHealth.raw || undefined}
                                                    height={300}
                                                />
                                            </div>
                                            <div className="w-full md:w-64 space-y-4">
                                                <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-border dark:border-slate-800 shadow-sm transition-all hover:border-indigo-500/20">
                                                    <span className="text-[9px] font-bold text-indigo-800 dark:text-indigo-400/60 block mb-1">Health index</span>
                                                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 tracking-tighter">72.4 <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold ml-1">Stable</span></div>
                                                </div>
                                                <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-border dark:border-slate-800 shadow-sm transition-all hover:border-indigo-500/20">
                                                    <span className="text-[9px] font-bold text-indigo-400 dark:text-indigo-400/60 block mb-1">Confirmation</span>
                                                    <div className="text-[10px] font-bold text-slate-700 dark:text-slate-300 leading-tight">Price action confirmed by volume participation.</div>
                                                </div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        </div>

                        {/* DETAILED STATISTICS ROW: Sector (Full Width) */}
                        <div className="lg:col-span-3 grid grid-cols-1 gap-6">

                            {/* Sector Rankings */}
                            <Card className=" h-full">
                                <CardHeader className="p-3 pb-1 flex flex-row items-center justify-between">
                                    <CardTitle className="text-sm font-bold text-black dark:text-slate-100 tracking-tight flex items-center">
                                        <BarChart3 size={14} className="mr-2" /> 
                                        Sector Performance
                                        <InfoTooltip content="Treemap showing which sectors are attracting the most capital (turnover) and their relative performance." />
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-6 pt-0 h-[350px]">
                                    <SectorTreemap sectors={sector_summary || []} height={350} />
                                </CardContent>
                            </Card>


                            {/* Rotation Analysis */}
                            <div className="lg:col-span-3">
                                <Card className=" h-full">
                                    <CardHeader className="p-3 pb-1">
                                        <CardTitle className="text-sm font-bold text-black dark:text-slate-100 tracking-tight flex items-center">
                                            <ActivityIcon size={14} className="text-indigo-500 mr-2" /> 
                                            Rotation & Convergence
                                            <InfoTooltip content="Visualizes the lifecycle of sectors as they rotate from leading to lagging phases." />
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-6 pt-0">
                                        <div className="h-[350px]">
                                            <SectorGraph />
                                        </div>
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
                        <Card >
                            <CardHeader className="p-4 pb-2 border-b border-border dark:border-border flex flex-row items-center justify-between">
                                <CardTitle className="text-sm font-bold text-slate-900 dark:text-slate-100 tracking-tight flex items-center">
                                    <TrendingUp size={14} className="text-blue-600 mr-2" /> 
                                    Sector Performance Matrix
                                    <InfoTooltip content="Detailed breakdown of index changes, turnover, and volume across all market sectors." />
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="overflow-x-auto custom-scrollbar">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="border-transparent hover:bg-transparent">
                                                <TableHead className="text-[10px] font-bold text-indigo-400 dark:text-indigo-500/60 w-[240px]">Index name</TableHead>
                                                <TableHead className="text-[10px] font-bold text-indigo-400 dark:text-indigo-500/60 text-right">Change (%)</TableHead>
                                                <TableHead className="text-[10px] font-bold text-indigo-400 dark:text-indigo-500/60 text-right">Turnover (रू)</TableHead>
                                                <TableHead className="text-[10px] font-bold text-indigo-400 dark:text-indigo-500/60 text-right">Volume (Qty)</TableHead>
                                                <TableHead className="text-[10px] font-bold text-indigo-400 dark:text-indigo-500/60 text-right w-[120px]">Trend</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {(sector_summary || []).slice(0, 15).map((sector, i) => {
                                                const isPositive = sector.change >= 0;
                                                return (
                                                    <TableRow key={i} className="group border-slate-50 dark:border-border hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors">
                                                        <TableCell className="py-3">
                                                            <div className="flex items-center gap-3">
                                                                <div className={`p-1.5 rounded-lg bg-gradient-to-br ${sectorConfig[sector.name]?.gradient || 'from-indigo-500/10 to-blue-600/10'} text-indigo-600 dark:text-indigo-400 shadow-sm opacity-70 group-hover:opacity-100 transition-opacity`}>
                                                                    {sectorConfig[sector.name]?.icon ? React.cloneElement(sectorConfig[sector.name].icon as React.ReactElement<any>, { size: 14 }) : <Activity size={14} />}
                                                                </div>
                                                                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 tracking-tight group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{sector.name}</span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className={`text-right py-3 font-bold text-sm ${isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                                            <div className="flex items-center justify-end gap-1.5">
                                                                {isPositive ? <TrendingUp size={12} className="opacity-50" /> : <TrendingDown size={12} className="opacity-50" />}
                                                                {isPositive ? '+' : ''}{sector.change.toFixed(2)}%
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-right py-3">
                                                            <span className="text-xs font-mono font-bold text-indigo-600/70 dark:text-indigo-300">{formatRupees(sector.turnover / 1000000)}M</span>
                                                        </TableCell>
                                                        <TableCell className="text-right py-3">
                                                            <span className="text-xs font-mono font-bold text-indigo-500/60 dark:text-indigo-500/60">{formatNepaliNumber((sector.volume || sector.turnover / 500).toFixed(0))}</span>
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
        </DashboardLayout>
    );
}
