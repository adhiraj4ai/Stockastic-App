// @ts-nocheck — orphaned legacy component (no consumers); skipping type-check
'use client';

import React from 'react';
import { useMarketData } from '@/hooks/useMarketData';
import { usePortfolioSummary } from '@/hooks/usePortfolioSummary';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
    LayoutDashboard, Wallet, Global, 
    BarChart3, Activity, Zap, Search,
    TrendingUp, ShieldAlert, PieChart,
    ChevronRight, Map as MapIcon, Database
} from 'lucide-react';
import { MarketBubbleMap } from '@/components/MarketBubbleMap';
import { MarketHeatmap } from '@/components/MarketHeatmap';
import { SectorTreemap } from '@/components/SectorTreemap';
import { VolumeShockers } from '@/components/VolumeShockers';
import { BreakoutWatchlist } from '@/components/BreakoutWatchlist';
import { InstitutionalInterest } from '@/components/InstitutionalInterest';
import { MarketBreadthTrend } from '@/components/MarketBreadthTrend';
import { PortfolioSummary as PortfolioCard } from '@/components/PortfolioSummary';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { PageLoader } from '@/components/ui/StockLoader';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';

export function MarketTerminal() {
    const { data: marketData, allStocks, loading: marketLoading } = useMarketData();
    const { stats: portfolioStats, loading: portfolioLoading } = usePortfolioSummary();

    const loading = marketLoading || portfolioLoading;

    if (loading) return <div className="min-h-[60vh] flex items-center justify-center"><PageLoader text="Loading analytical terminal..." /></div>;
    if (!marketData) return null;

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
            {/* TOP ROW: Portfolio Engagement & Primary Charts */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                <div className="xl:col-span-4">
                    <PortfolioCard 
                        investment={portfolioStats?.totalInvestment || 0}
                        currentValue={portfolioStats?.totalCurrentValue || 0}
                        totalPL={portfolioStats?.totalGainLoss || 0}
                        dayPL={portfolioStats?.totalDayGainLoss || 0}
                        loading={portfolioLoading}
                    />
                    
                    <div className="mt-4 grid grid-cols-2 gap-4">
                        <Card className="bg-white dark:bg-card border-none shadow-sm p-4">
                            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Market Correlation</div>
                            <div className="flex items-center gap-2">
                                <Activity className="text-blue-500" size={16} />
                                <span className="text-xl font-bold text-slate-900 dark:text-white">Strong</span>
                            </div>
                        </Card>
                         <Card className="bg-white dark:bg-card border-none shadow-sm p-4">
                            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Exposure</div>
                            <div className="flex items-center gap-2">
                                <Database className="text-indigo-500" size={16} />
                                <span className="text-xl font-bold text-slate-900 dark:text-white">Active</span>
                            </div>
                        </Card>
                    </div>
                </div>

                <Card className="xl:col-span-8 border border-border dark:border-slate-800 overflow-hidden">
                    <CardHeader className="p-5 pb-2 border-b dark:border-border">
                        <div className="flex justify-between items-center">
                            <CardTitle className="text-sm font-bold flex items-center gap-2 tracking-tight uppercase">
                                <MapIcon size={16} className="text-indigo-500" />
                                Interactive Liquidity Heatmap
                                <InfoTooltip content="Bubble size represents turnover, color represents performance. Perfect for spotting where the focus is moving." />
                            </CardTitle>
                            <Badge variant="outline" className="font-mono text-[10px]">Macro View</Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <MarketBubbleMap stocks={allStocks} height={320} />
                    </CardContent>
                </Card>
            </div>

            {/* MIDDLE ROW: Treemap & Insights */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                <Card className="xl:col-span-7 overflow-hidden">
                    <CardHeader className="p-5 border-b dark:border-border">
                        <CardTitle className="text-sm font-bold flex items-center gap-2 tracking-tight uppercase">
                            <PieChart size={16} className="text-amber-500" />
                            Sector Allocation Map (Treemap)
                            <InfoTooltip content="Visual weight of sectors based on total turnover. Larger blocks mean higher market dominance." />
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <SectorTreemap data={marketData.sector_summary || []} height={400} />
                    </CardContent>
                </Card>

                <div className="xl:col-span-5 space-y-6">
                    <Card className="bg-white dark:bg-card border-none shadow-lg">
                        <CardHeader className="p-4 border-b dark:border-slate-800">
                            <CardTitle className="text-xs font-semibold uppercase flex items-center gap-2 text-blue-600 dark:text-blue-400">
                                <Zap size={14} /> Volume Shockers
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-2">
                            <VolumeShockers stocks={marketData.top_turnover} />
                        </CardContent>
                    </Card>

                    <Card className="bg-white dark:bg-card border-none shadow-lg">
                        <CardHeader className="p-4 border-b dark:border-slate-800">
                            <CardTitle className="text-xs font-semibold uppercase flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                                <TrendingUp size={14} /> Institutional Pick
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-2">
                            <InstitutionalInterest stocks={marketData.top_gainers} />
                        </CardContent>
                    </Card>
                </div>
            </div>

                {/* Breadth Trend (Promoted to fill space) */}
                <Card className="bg-white dark:bg-card border-none shadow-lg xl:col-span-12">
                    <CardHeader className="p-4 border-b dark:border-slate-800">
                        <CardTitle className="text-xs font-semibold uppercase flex items-center gap-2 text-slate-800 dark:text-slate-200">
                            <Activity size={14} /> Market Breadth Trend
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4">
                        <MarketBreadthTrend data={marketData.market_summary} />
                    </CardContent>
                </Card>
            </div>
    );
}
