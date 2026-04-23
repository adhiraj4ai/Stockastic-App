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
import { motion } from 'framer-motion';
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
        iconBg: 'bg-blue-500/10',
        iconColor: 'text-blue-500',
    },
    {
        icon: Search,
        title: 'Smart Money Tracking',
        desc: 'Track institutional & bulk transactions to follow the big players',
        iconBg: 'bg-violet-500/10',
        iconColor: 'text-violet-500',
    },
    {
        icon: BarChart3,
        title: 'Sector Deep Dive',
        desc: 'Sector rotation analytics and performance benchmarking',
        iconBg: 'bg-emerald-500/10',
        iconColor: 'text-emerald-500',
    },
    {
        icon: Briefcase,
        title: 'Portfolio Manager',
        desc: 'Track your investments, analyze returns, and paper trade risk-free',
        iconBg: 'bg-amber-500/10',
        iconColor: 'text-amber-500',
    },
    {
        icon: LineChart,
        title: 'Technical Signals',
        desc: 'Breakout detection, momentum scoring, and ROC analysis',
        iconBg: 'bg-rose-500/10',
        iconColor: 'text-rose-500',
    },
    {
        icon: Shield,
        title: 'Accumulation Intel',
        desc: 'Detect smart money accumulation patterns before price moves',
        iconBg: 'bg-cyan-500/10',
        iconColor: 'text-cyan-500',
    },
];

const containerVariants = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: { staggerChildren: 0.08 },
    },
};

const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: {
        opacity: 1,
        y: 0,
        transition: { type: 'spring', stiffness: 100, damping: 15 },
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
            <section className="relative overflow-hidden pt-16 pb-24 px-6 lg:px-12">
                {/* Background decorations */}
                <div className="absolute inset-0 -z-10">
                    <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[120px]" />
                    <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-[120px]" />
                </div>

                <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="show"
                    className="max-w-5xl mx-auto text-center"
                >
                    <motion.div variants={itemVariants}>
                        <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 font-bold px-4 py-1.5 text-xs tracking-wide">
                            <Zap size={12} className="mr-1.5" />
                            Nepal&apos;s Premier Stock Analytics Platform
                        </Badge>
                    </motion.div>

                    <motion.h1
                        variants={itemVariants}
                        className="text-5xl lg:text-7xl font-black tracking-tight mt-8 text-slate-900 dark:text-white"
                    >
                        Master the{' '}
                        <span className="bg-gradient-to-r from-blue-600 to-emerald-500 bg-clip-text text-transparent">
                            NEPSE
                        </span>{' '}
                        Market
                    </motion.h1>

                    <motion.p
                        variants={itemVariants}
                        className="text-lg lg:text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto mt-6 leading-relaxed"
                    >
                        Real-time market intelligence, smart money tracking, and advanced
                        portfolio analytics purpose-built for Nepal Stock Exchange investors.
                    </motion.p>

                    <motion.div
                        variants={itemVariants}
                        className="flex flex-col sm:flex-row gap-4 justify-center mt-10"
                    >
                        <Link href="/login?mode=signup">
                            <Button
                                size="lg"
                                className="rounded-xl font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/25 px-8 h-12 text-base"
                            >
                                Get Started Free
                                <ArrowRight size={18} className="ml-2" />
                            </Button>
                        </Link>
                        <Link href="/login">
                            <Button
                                variant="outline"
                                size="lg"
                                className="rounded-xl font-bold border-slate-300 dark:border-slate-700 px-8 h-12 text-base"
                            >
                                Sign In
                            </Button>
                        </Link>
                    </motion.div>

                    {/* Live NEPSE index badge */}
                    {ms && (
                        <motion.div
                            variants={itemVariants}
                            className="mt-12 inline-flex items-center gap-4 bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-2xl px-6 py-4 shadow-xl border border-slate-200/50 dark:border-slate-700/50"
                        >
                            <div className="flex items-center gap-2">
                                <Globe size={16} className="text-blue-500" />
                                <span className="text-xs font-black text-slate-500 uppercase tracking-widest">
                                    NEPSE
                                </span>
                            </div>
                            <span className="text-2xl font-black text-slate-900 dark:text-white font-mono">
                                {formatNepaliNumber(ms.total_points)}
                            </span>
                            <div
                                className={`flex items-center gap-1 font-bold text-sm ${
                                    isPositive ? 'text-emerald-600' : 'text-rose-600'
                                }`}
                            >
                                {isPositive ? (
                                    <ArrowUpRight size={16} />
                                ) : (
                                    <ArrowDownRight size={16} />
                                )}
                                {Math.abs(ms.points_change).toFixed(2)} (
                                {ms.percent_change.toFixed(2)}%)
                            </div>
                        </motion.div>
                    )}
                </motion.div>
            </section>

            {/* ═══ FEATURES GRID ═══ */}
            <section className="px-6 lg:px-12 py-16 bg-slate-50/50 dark:bg-slate-900/30">
                <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    whileInView="show"
                    viewport={{ once: true, amount: 0.2 }}
                    className="max-w-6xl mx-auto"
                >
                    <motion.div variants={itemVariants} className="text-center mb-12">
                        <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                            Everything you need to trade smarter
                        </h2>
                        <p className="text-slate-500 dark:text-slate-400 mt-3 max-w-xl mx-auto">
                            Professional-grade tools designed for Nepal&apos;s stock market,
                            from beginners to seasoned traders.
                        </p>
                    </motion.div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {features.map((f, i) => (
                            <motion.div key={i} variants={itemVariants}>
                                <Card className="bg-white dark:bg-slate-900/60 border-slate-200/50 dark:border-slate-800/50 hover:border-blue-500/30 dark:hover:border-blue-500/20 transition-all duration-300 hover:shadow-xl hover:shadow-blue-500/5 group h-full">
                                    <CardContent className="p-6">
                                        <div
                                            className={`h-10 w-10 rounded-xl ${f.iconBg} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}
                                        >
                                            <f.icon size={20} className={f.iconColor} />
                                        </div>
                                        <h3 className="font-bold text-slate-900 dark:text-white text-base">
                                            {f.title}
                                        </h3>
                                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
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
                            <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
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
                            className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8"
                        >
                            <Card className="bg-white dark:bg-slate-900/60 border-none shadow-lg">
                                <CardContent className="p-5 text-center">
                                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                                        NEPSE Index
                                    </div>
                                    <div className="text-2xl font-black text-slate-900 dark:text-white font-mono">
                                        {formatNepaliNumber(ms.total_points)}
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="bg-white dark:bg-slate-900/60 border-none shadow-lg">
                                <CardContent className="p-5 text-center">
                                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                                        Change
                                    </div>
                                    <div
                                        className={`text-2xl font-black font-mono ${
                                            isPositive ? 'text-emerald-600' : 'text-rose-600'
                                        }`}
                                    >
                                        {isPositive ? '+' : ''}
                                        {ms.points_change.toFixed(2)}
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="bg-white dark:bg-slate-900/60 border-none shadow-lg">
                                <CardContent className="p-5 text-center">
                                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                                        Turnover
                                    </div>
                                    <div className="text-2xl font-black text-slate-900 dark:text-white font-mono">
                                        {formatRupees(ms.total_turnover / 1000000)}M
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="bg-white dark:bg-slate-900/60 border-none shadow-lg">
                                <CardContent className="p-5 text-center">
                                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                                        Volume
                                    </div>
                                    <div className="text-2xl font-black text-slate-900 dark:text-white font-mono">
                                        {(ms.total_volume / 1000000).toFixed(1)}M
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>

                        {/* Top Gainers & Losers */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <motion.div variants={itemVariants}>
                                <Card className="bg-white dark:bg-slate-900/60 border-none shadow-lg overflow-hidden">
                                    <div className="p-5 pb-3 border-b border-slate-100 dark:border-slate-800">
                                        <h3 className="font-bold text-sm flex items-center gap-2 text-emerald-600">
                                            <TrendingUp size={16} /> Top Gainers
                                        </h3>
                                    </div>
                                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {data.top_gainers.slice(0, 5).map((stock) => (
                                            <div
                                                key={stock.ticker}
                                                className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                                                onClick={() =>
                                                    router.push(`/ticker/${stock.ticker}`)
                                                }
                                            >
                                                <div>
                                                    <span className="font-bold text-sm text-slate-900 dark:text-white">
                                                        {stock.ticker}
                                                    </span>
                                                    <span className="text-[10px] text-slate-400 ml-2">
                                                        {stock.sector}
                                                    </span>
                                                </div>
                                                <div className="text-right">
                                                    <span className="font-mono font-bold text-sm text-slate-700 dark:text-slate-300 mr-3">
                                                        {formatNepaliNumber(stock.close)}
                                                    </span>
                                                    <span className="text-emerald-600 font-bold text-sm">
                                                        +{stock.percent_change.toFixed(2)}%
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </Card>
                            </motion.div>

                            <motion.div variants={itemVariants}>
                                <Card className="bg-white dark:bg-slate-900/60 border-none shadow-lg overflow-hidden">
                                    <div className="p-5 pb-3 border-b border-slate-100 dark:border-slate-800">
                                        <h3 className="font-bold text-sm flex items-center gap-2 text-rose-600">
                                            <TrendingDown size={16} /> Top Losers
                                        </h3>
                                    </div>
                                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {data.top_losers.slice(0, 5).map((stock) => (
                                            <div
                                                key={stock.ticker}
                                                className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                                                onClick={() =>
                                                    router.push(`/ticker/${stock.ticker}`)
                                                }
                                            >
                                                <div>
                                                    <span className="font-bold text-sm text-slate-900 dark:text-white">
                                                        {stock.ticker}
                                                    </span>
                                                    <span className="text-[10px] text-slate-400 ml-2">
                                                        {stock.sector}
                                                    </span>
                                                </div>
                                                <div className="text-right">
                                                    <span className="font-mono font-bold text-sm text-slate-700 dark:text-slate-300 mr-3">
                                                        {formatNepaliNumber(stock.close)}
                                                    </span>
                                                    <span className="text-rose-600 font-bold text-sm">
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
                                <Button
                                    variant="outline"
                                    className="rounded-xl font-bold px-6"
                                >
                                    Sign up to view full dashboard
                                    <ArrowRight size={16} className="ml-2" />
                                </Button>
                            </Link>
                        </motion.div>
                    </motion.div>
                </section>
            )}

            {/* ═══ FINAL CTA ═══ */}
            <section className="px-6 lg:px-12 py-20 border-t border-slate-100 dark:border-slate-800/50">
                <div className="max-w-3xl mx-auto text-center">
                    <h2 className="text-3xl lg:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
                        Ready to make smarter trades?
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 mt-4 text-lg">
                        Join NEPSE investors using Stockastic to gain an edge in the market.
                    </p>
                    <div className="mt-8">
                        <Link href="/login?mode=signup">
                            <Button
                                size="lg"
                                className="rounded-xl font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/25 px-10 h-12 text-base"
                            >
                                Start Analyzing Now
                                <ArrowRight size={18} className="ml-2" />
                            </Button>
                        </Link>
                    </div>
                </div>
            </section>
        </div>
    );
}
