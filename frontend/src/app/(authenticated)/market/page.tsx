'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    TrendingUp, TrendingDown, Zap, BarChart3, Globe, ShieldAlert,
    HeartPulse, Activity as ActivityIcon, LineChart, Clock, Wallet, Lightbulb,
    MessageSquare, ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import { motion, Variants } from 'framer-motion';
import {
    CommandDialog,
    CommandInput,
    CommandList,
    CommandEmpty,
    CommandGroup,
    CommandItem
} from '@/components/ui/command';
import { PageLoader } from '@/components/ui/StockLoader';
import { MarketBubbleMap } from '@/components/MarketBubbleMap';
import { SentimentGauge } from '@/components/SentimentGauge';
import { SectorTreemap } from '@/components/SectorTreemap';
import { BrokerFlowChart } from '@/components/BrokerFlowChart';
import { MarketHealthRadar } from '@/components/MarketHealthRadar';
import { VolumeShockers } from '@/components/VolumeShockers';
import { BreakoutWatchlist } from '@/components/BreakoutWatchlist';
import { MarketBreadthTrend } from '@/components/MarketBreadthTrend';
import { InstitutionalInterest } from '@/components/InstitutionalInterest';
import { MarketTabs } from '@/components/MarketTabs';
import { useMarketData, type StockData } from '@/hooks/useMarketData';
import { formatNepaliNumber, formatRupees } from '@/lib/formatters';
import { InfoTooltip } from '@/components/ui/InfoTooltip';

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

export default function MarketTerminalPage() {
    const { data, allStocks, loading, error, marketSentiment, marketHealth } = useMarketData(10000);
    const [recentStocks, setRecentStocks] = useState<string[]>([]);
    const [isCommandOpen, setIsCommandOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const router = useRouter();

    // Load Recently Viewed
    useEffect(() => {
        setMounted(true);
        const saved = localStorage.getItem('recent_stocks');
        if (saved) {
            try {
                setRecentStocks(JSON.parse(saved));
            } catch (e) {
                console.error('Failed to parse recent stocks', e);
            }
        }
    }, []);

    // Command Palette Keyboard Shortcut
    useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setIsCommandOpen((open) => !open);
            }
        };
        document.addEventListener('keydown', down);
        return () => document.removeEventListener('keydown', down);
    }, []);

    if (!mounted) return null;

    if (error) {
        return (
            <DashboardLayout>
                <MarketTabs />
                <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-8">
                    <ShieldAlert className="h-10 w-10 text-destructive mb-4" />
                    <div className="text-foreground text-base font-semibold mb-2">Error loading market data</div>
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
                <MarketTabs />
                <div className="flex items-center justify-center min-h-[50vh]">
                    <PageLoader text="Initializing data stream..." />
                </div>
            </DashboardLayout>
        );
    }

    if (!data || !data.market_summary) {
        return (
            <DashboardLayout>
                <MarketTabs />
                <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-8">
                    <span className="text-gray-500 dark:text-gray-400">No market data available yet. Please run data ingestion.</span>
                </div>
            </DashboardLayout>
        );
    }

    const { market_summary, top_turnover, top_gainers, top_losers, sector_summary } = data;
    const isPositive = market_summary.points_change >= 0;

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
            {/* Ticker ribbon */}
            <div className="bg-muted/50 border-b border-border overflow-hidden py-2">
                <div className="flex animate-infinite-scroll whitespace-nowrap items-center gap-10 px-4">
                    {[0, 1].map(dup => (
                        top_gainers.concat(top_losers).slice(0, 10).map((stock, i) => (
                            <div key={`${dup}-${i}`} className="flex items-center gap-2 cursor-pointer hover:opacity-70 transition-opacity" onClick={() => router.push(`/ticker/${stock.ticker}`)}>
                                <span className="font-medium text-xs text-foreground">{stock.ticker}</span>
                                <span className="font-mono text-xs text-muted-foreground tabular-nums">{formatNepaliNumber(stock.close)}</span>
                                <span className={`text-[11px] font-medium tabular-nums ${stock.change >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                    {stock.change >= 0 ? '+' : ''}{stock.percent_change.toFixed(1)}%
                                </span>
                            </div>
                        ))
                    ))}
                </div>
            </div>

            <div className="px-6 lg:px-10 py-6 space-y-6 min-h-screen">
                <MarketTabs />

                <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="show"
                    className="space-y-6"
                >
                    {/* Row 1: Index hero */}
                    <motion.div variants={itemVariants} className="surface p-6">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-muted-foreground">
                                    <Globe size={13} />
                                    <span className="text-[11px] uppercase tracking-wider">NEPSE Index</span>
                                </div>
                                <div className="flex items-baseline gap-4">
                                    <h1 className="text-4xl font-semibold text-foreground tracking-tight tabular-nums">
                                        {formatNepaliNumber(market_summary.total_points)}
                                    </h1>
                                    <div className={`flex items-center gap-1 font-medium tabular-nums ${isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                        {isPositive ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
                                        <span className="text-lg">{Math.abs(market_summary.points_change).toFixed(2)}</span>
                                        <span className="text-sm text-muted-foreground">({market_summary.percent_change.toFixed(2)}%)</span>
                                    </div>
                                </div>
                                <p className="text-xs text-muted-foreground">Session · {market_summary.date}</p>
                            </div>
                            <div className="flex items-center gap-8">
                                <div>
                                    <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-0.5">Turnover</div>
                                    <div className="text-lg font-medium text-foreground font-mono tabular-nums">{formatRupees(market_summary.total_turnover / 1000000)}M</div>
                                </div>
                                <div className="w-px h-8 bg-border" />
                                <div>
                                    <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-0.5">Volume</div>
                                    <div className="text-lg font-medium text-foreground font-mono tabular-nums">{(market_summary.total_volume / 1000000).toFixed(1)}M</div>
                                </div>
                                <div className="w-px h-8 bg-border" />
                                <div>
                                    <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-0.5">Adv / Dec</div>
                                    <div className="text-lg font-medium font-mono tabular-nums">
                                        <span className="text-emerald-600 dark:text-emerald-400">{market_summary.advancers}</span>
                                        <span className="text-muted-foreground"> / </span>
                                        <span className="text-rose-600 dark:text-rose-400">{market_summary.decliners}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>

                    {/* Row 2: Market internals */}
                    <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                        <Card>
                            <CardHeader className="p-4 pb-1">
                                <CardTitle className="text-sm font-semibold text-foreground flex items-center">
                                    <HeartPulse size={14} className="text-rose-500 mr-2" />
                                    Market Sentiment
                                    <InfoTooltip content="Aggregated market bias (0-100) based on Advancers vs Decliners and price momentum." />
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-5 pt-0">
                                <SentimentGauge value={marketSentiment} height={200} />
                                <div className="mt-3 space-y-3">
                                    <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full flex overflow-hidden">
                                        <div className="h-full bg-emerald-500" style={{ width: `${market_summary.advancers_percent}%` }}></div>
                                        <div className="h-full bg-rose-500" style={{ width: `${market_summary.decliners_percent}%` }}></div>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-emerald-600 dark:text-emerald-400 font-medium tabular-nums">{market_summary.advancers} advancing</span>
                                        <span className="text-rose-600 dark:text-rose-400 font-medium tabular-nums">{market_summary.decliners} declining</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="p-4 pb-1">
                                <CardTitle className="text-sm font-semibold text-foreground flex items-center">
                                    <ActivityIcon size={14} className="text-blue-500 mr-2" />
                                    Rally Quality Matrix
                                    <InfoTooltip content="Assessment of the market trend's sustainability based on Volume, Turnover, Breadth, and Participation." />
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-5 pt-0 flex items-center justify-center">
                                <MarketHealthRadar
                                    data={marketHealth.scores}
                                    rawData={marketHealth.raw || undefined}
                                    height={260}
                                />
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="p-4 pb-1">
                                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                                    <LineChart size={14} className="text-emerald-500" /> Breadth (5D)
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-5 pt-0">
                                <MarketBreadthTrend height={260} />
                            </CardContent>
                        </Card>
                    </motion.div>

                    {/* Row 3: Sectors & movers */}
                    <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                        <Card>
                            <CardHeader className="p-4 pb-1">
                                <CardTitle className="text-sm font-semibold text-foreground flex items-center">
                                    <BarChart3 size={14} className="mr-2" />
                                    Sector Performance
                                    <InfoTooltip content="Treemap showing which sectors are attracting the most capital (turnover) and their relative performance." />
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-5 pt-0 h-[380px]">
                                <SectorTreemap sectors={sector_summary || []} height={360} />
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="p-4 pb-1">
                                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                                    <Zap size={14} className="text-blue-500" /> High Alpha Signals
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-5 pt-2">
                                <Tabs defaultValue="gainers" className="w-full">
                                    <TabsList className="grid w-full grid-cols-3 mb-3">
                                        <TabsTrigger value="gainers" className="text-xs">Top Gainers</TabsTrigger>
                                        <TabsTrigger value="losers" className="text-xs">Top Losers</TabsTrigger>
                                        <TabsTrigger value="roc" className="text-xs">ROC Watch</TabsTrigger>
                                    </TabsList>
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
                                </Tabs>
                            </CardContent>
                        </Card>
                    </motion.div>

                    {/* Row 4: Smart money */}
                    <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                        <Card>
                            <CardHeader className="p-4 pb-1">
                                <CardTitle className="text-sm font-semibold text-foreground flex items-center">
                                    <Wallet size={14} className="text-blue-500 mr-2" />
                                    Smart Money Flow
                                    <InfoTooltip content="Visualizes high-impact net-buying by the top institutional brokers." />
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-5">
                                <BrokerFlowChart data={(data as any).whale_watch || []} height={350} />
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="p-4 pb-1">
                                <CardTitle className="text-sm font-semibold text-foreground flex items-center">
                                    <Globe size={14} className="text-blue-600 mr-2" />
                                    Market Liquidity Map
                                    <InfoTooltip content="Bubble chart where size represents turnover and color represents daily percentage change." />
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <MarketBubbleMap stocks={allStocks} height={390} />
                            </CardContent>
                        </Card>
                    </motion.div>

                    {/* Row 5: Secondary internals */}
                    <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                        <Card>
                            <CardHeader className="p-4 pb-1">
                                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                                    <Zap size={14} className="text-orange-500" /> Volume Shockers
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 pt-0">
                                <VolumeShockers stocks={top_turnover} />
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="p-5">
                                <BreakoutWatchlist stocks={allStocks} />
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="p-5">
                                <InstitutionalInterest />
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
            `}</style>
        </DashboardLayout>
    );
}
