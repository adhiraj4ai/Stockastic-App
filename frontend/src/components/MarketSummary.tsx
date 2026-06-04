'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    TrendingUp, TrendingDown, Activity, BarChart3,
    LineChart, Zap, Shield, Search, Briefcase,
    ArrowRight, Globe, ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import { motion, type Variants } from 'framer-motion';
import { formatNepaliNumber, formatRupees } from '@/lib/formatters';

interface StockData {
    ticker: string;
    close: number;
    change: number;
    percent_change: number;
    sector: string;
    volume: number;
    turnover: number;
}

interface MarketData {
    market_summary: {
        date: string;
        total_turnover: number;
        total_volume: number;
        total_points: number;
        points_change: number;
        percent_change: number;
        advancers: number;
        decliners: number;
    };
    top_gainers: StockData[];
    top_losers: StockData[];
    top_volume: StockData[];
    top_turnover: StockData[];
}

const features = [
    {
        icon: Activity,
        title: 'Live Market Pulse',
        desc: 'Real-time NEPSE price monitoring with 10-second refresh intervals',
    },
    {
        icon: Search,
        title: 'Smart Money Tracking',
        desc: 'Track institutional & bulk transactions to follow the big players',
    },
    {
        icon: BarChart3,
        title: 'Sector Deep Dive',
        desc: 'Sector rotation analytics and performance benchmarking',
    },
    {
        icon: Briefcase,
        title: 'Portfolio Manager',
        desc: 'Track your investments, analyze returns, and paper trade risk-free',
    },
    {
        icon: LineChart,
        title: 'Technical Signals',
        desc: 'Breakout detection, momentum scoring, and ROC analysis',
    },
    {
        icon: Shield,
        title: 'Accumulation Intel',
        desc: 'Detect smart money accumulation patterns before price moves',
    },
];

const containerVariants: Variants = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: { staggerChildren: 0.08 },
    },
};

const itemVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    show: {
        opacity: 1,
        y: 0,
        transition: { type: 'spring' as const, stiffness: 100, damping: 15 },
    },
};

export function MarketSummary() {
    const [data, setData] = useState<MarketData | null>(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await api.get('/api/stocks/summary/');
                setData(res.data);
            } catch {
                // Silently fail — market data is optional for the landing page
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const ms = data?.market_summary;
    const isPositive = ms ? ms.points_change >= 0 : true;

    return (
        <div className="min-h-screen">
            {/* ═══ HERO SECTION ═══ */}
            <section className="pt-16 pb-20 px-6 lg:px-12">
                <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="show"
                    className="max-w-4xl mx-auto text-center"
                >
                    <motion.div variants={itemVariants}>
                        <Badge variant="outline" className="font-normal px-3 py-1 text-xs gap-1.5">
                            <Zap size={12} />
                            Nepal&apos;s Premier Stock Analytics Platform
                        </Badge>
                    </motion.div>

                    <motion.h1
                        variants={itemVariants}
                        className="text-4xl lg:text-6xl font-semibold tracking-tight mt-6 text-foreground"
                    >
                        Master the NEPSE Market
                    </motion.h1>

                    <motion.p
                        variants={itemVariants}
                        className="text-base lg:text-lg text-muted-foreground max-w-2xl mx-auto mt-5 leading-relaxed"
                    >
                        Real-time market intelligence, smart money tracking, and advanced
                        portfolio analytics purpose-built for Nepal Stock Exchange investors.
                    </motion.p>

                    <motion.div
                        variants={itemVariants}
                        className="flex flex-col sm:flex-row gap-3 justify-center mt-8"
                    >
                        <Link href="/login?mode=signup">
                            <Button size="lg" className="font-medium px-6">
                                Get started
                                <ArrowRight size={16} className="ml-2" />
                            </Button>
                        </Link>
                        <Link href="/login">
                            <Button variant="outline" size="lg" className="font-medium px-6">
                                Sign in
                            </Button>
                        </Link>
                    </motion.div>

                    {/* Live NEPSE index badge */}
                    {ms && (
                        <motion.div
                            variants={itemVariants}
                            className="mt-10 inline-flex items-center gap-4 surface px-5 py-3"
                        >
                            <div className="flex items-center gap-2">
                                <Globe size={14} className="text-muted-foreground" />
                                <span className="text-[11px] text-muted-foreground uppercase tracking-wider">NEPSE</span>
                            </div>
                            <span className="text-xl font-semibold text-foreground font-mono tabular-nums">
                                {formatNepaliNumber(ms.total_points)}
                            </span>
                            <div className={`flex items-center gap-1 font-medium text-sm tabular-nums ${isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                {isPositive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                                {Math.abs(ms.points_change).toFixed(2)} ({ms.percent_change.toFixed(2)}%)
                            </div>
                        </motion.div>
                    )}
                </motion.div>
            </section>

            {/* ═══ FEATURES GRID ═══ */}
            <section className="px-6 lg:px-12 py-16 bg-muted/40 border-y border-border">
                <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    whileInView="show"
                    viewport={{ once: true, amount: 0.2 }}
                    className="max-w-6xl mx-auto"
                >
                    <motion.div variants={itemVariants} className="text-center mb-10">
                        <h2 className="text-2xl lg:text-3xl font-semibold text-foreground tracking-tight">
                            Everything you need to trade smarter
                        </h2>
                        <p className="text-muted-foreground mt-3 max-w-xl mx-auto">
                            Professional-grade tools designed for Nepal&apos;s stock market,
                            from beginners to seasoned traders.
                        </p>
                    </motion.div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {features.map((f, i) => (
                            <motion.div key={i} variants={itemVariants}>
                                <Card className="h-full hover:border-foreground/20 transition-colors">
                                    <CardContent className="p-5">
                                        <div className="h-9 w-9 rounded-md border border-border flex items-center justify-center mb-4">
                                            <f.icon size={16} className="text-muted-foreground" />
                                        </div>
                                        <h3 className="font-semibold text-foreground text-sm">
                                            {f.title}
                                        </h3>
                                        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                                            {f.desc}
                                        </p>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>
            </section>

            {/* ═══ MARKET SNAPSHOT ═══ */}
            {loading && (
                <div className="flex items-center justify-center py-16">
                    <div className="flex items-center gap-3 text-slate-400">
                        <Activity size={16} className="animate-pulse" />
                        <span className="text-sm font-medium">Loading market data...</span>
                    </div>
                </div>
            )}

            {ms && data && (
                <section className="px-6 lg:px-12 py-16">
                    <motion.div
                        variants={containerVariants}
                        initial="hidden"
                        whileInView="show"
                        viewport={{ once: true, amount: 0.2 }}
                        className="max-w-6xl mx-auto"
                    >
                        <motion.div variants={itemVariants} className="text-center mb-10">
                            <h2 className="text-3xl font-semibold text-slate-900 dark:text-white tracking-tight">
                                Market at a Glance
                            </h2>
                            <p className="text-slate-500 mt-2">
                                Session: {ms.date} &bull; {ms.advancers} advancers &bull;{' '}
                                {ms.decliners} decliners
                            </p>
                        </motion.div>

                        {/* Index stat cards */}
                        <motion.div
                            variants={itemVariants}
                            className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8"
                        >
                            <Card>
                                <CardContent className="p-4 text-center">
                                    <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">NEPSE Index</div>
                                    <div className="text-xl font-semibold text-foreground font-mono tabular-nums">
                                        {formatNepaliNumber(ms.total_points)}
                                    </div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="p-4 text-center">
                                    <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Change</div>
                                    <div className={`text-xl font-semibold font-mono tabular-nums ${isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                        {isPositive ? '+' : ''}{ms.points_change.toFixed(2)}
                                    </div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="p-4 text-center">
                                    <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Turnover</div>
                                    <div className="text-xl font-semibold text-foreground font-mono tabular-nums">
                                        {formatRupees(ms.total_turnover / 1000000)}M
                                    </div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="p-4 text-center">
                                    <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Volume</div>
                                    <div className="text-xl font-semibold text-foreground font-mono tabular-nums">
                                        {(ms.total_volume / 1000000).toFixed(1)}M
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>

                        {/* Top Gainers & Losers */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <motion.div variants={itemVariants}>
                                <Card className="overflow-hidden">
                                    <div className="px-5 py-3 border-b border-border">
                                        <h3 className="font-semibold text-sm flex items-center gap-2 text-foreground">
                                            <TrendingUp size={14} className="text-emerald-600 dark:text-emerald-400" /> Top gainers
                                        </h3>
                                    </div>
                                    <div className="divide-y divide-border">
                                        {data.top_gainers.slice(0, 5).map((stock) => (
                                            <div
                                                key={stock.ticker}
                                                className="flex items-center justify-between px-5 py-2.5 hover:bg-accent transition-colors cursor-pointer"
                                                onClick={() => router.push(`/ticker/${stock.ticker}`)}
                                            >
                                                <div className="flex flex-col leading-tight">
                                                    <span className="font-medium text-sm text-foreground">{stock.ticker}</span>
                                                    <span className="text-[11px] text-muted-foreground">{stock.sector}</span>
                                                </div>
                                                <div className="text-right flex items-center gap-3">
                                                    <span className="font-mono text-sm text-foreground tabular-nums">
                                                        {formatNepaliNumber(stock.close)}
                                                    </span>
                                                    <span className="text-emerald-600 dark:text-emerald-400 font-medium text-sm tabular-nums">
                                                        +{stock.percent_change.toFixed(2)}%
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </Card>
                            </motion.div>

                            <motion.div variants={itemVariants}>
                                <Card className="overflow-hidden">
                                    <div className="px-5 py-3 border-b border-border">
                                        <h3 className="font-semibold text-sm flex items-center gap-2 text-foreground">
                                            <TrendingDown size={14} className="text-rose-600 dark:text-rose-400" /> Top losers
                                        </h3>
                                    </div>
                                    <div className="divide-y divide-border">
                                        {data.top_losers.slice(0, 5).map((stock) => (
                                            <div
                                                key={stock.ticker}
                                                className="flex items-center justify-between px-5 py-2.5 hover:bg-accent transition-colors cursor-pointer"
                                                onClick={() => router.push(`/ticker/${stock.ticker}`)}
                                            >
                                                <div className="flex flex-col leading-tight">
                                                    <span className="font-medium text-sm text-foreground">{stock.ticker}</span>
                                                    <span className="text-[11px] text-muted-foreground">{stock.sector}</span>
                                                </div>
                                                <div className="text-right flex items-center gap-3">
                                                    <span className="font-mono text-sm text-foreground tabular-nums">
                                                        {formatNepaliNumber(stock.close)}
                                                    </span>
                                                    <span className="text-rose-600 dark:text-rose-400 font-medium text-sm tabular-nums">
                                                        {stock.percent_change.toFixed(2)}%
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </Card>
                            </motion.div>
                        </div>

                        <motion.div variants={itemVariants} className="text-center mt-8">
                            <Link href="/login?mode=signup">
                                <Button variant="outline" className="font-medium">
                                    Sign up to view full dashboard
                                    <ArrowRight size={14} className="ml-2" />
                                </Button>
                            </Link>
                        </motion.div>
                    </motion.div>
                </section>
            )}

            {/* ═══ FINAL CTA ═══ */}
            <section className="px-6 lg:px-12 py-20 border-t border-border">
                <div className="max-w-3xl mx-auto text-center">
                    <h2 className="text-2xl lg:text-3xl font-semibold text-foreground tracking-tight">
                        Ready to make smarter trades?
                    </h2>
                    <p className="text-muted-foreground mt-3 text-base">
                        Join NEPSE investors using Stockastic to gain an edge in the market.
                    </p>
                    <div className="mt-7">
                        <Link href="/login?mode=signup">
                            <Button size="lg" className="font-medium px-6">
                                Start analyzing now
                                <ArrowRight size={16} className="ml-2" />
                            </Button>
                        </Link>
                    </div>
                </div>
            </section>
        </div>
    );
}
