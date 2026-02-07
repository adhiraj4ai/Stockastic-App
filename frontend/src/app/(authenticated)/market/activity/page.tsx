'use client';

import React, { useState, useEffect, useMemo } from 'react';
import api from '@/lib/api';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    Activity, ArrowUpRight, ArrowDownRight, Users,
    BarChart3, PieChart, TrendingUp, DollarSign,
    ChevronDown, ChevronRight, Filter, Search
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';

interface BrokerData {
    broker_id: string;
    quantity: number;
}

interface ActivityData {
    ticker: string;
    metrics: {
        change: number;
        percent_change: number;
        turnover: number;
        volume: number;
        close: number;
    };
    analysis: {
        total_transactions: number;
        weighted_avg_price: number;
        top_buyers: BrokerData[];
        top_sellers: BrokerData[];
    };
}

interface ApiResponse {
    date_range: { start: string; end: string };
    analysis: ActivityData[];
}

export default function MarketActivityPage() {
    const [data, setData] = useState<ApiResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [timeframe, setTimeframe] = useState('daily');
    const [expandedRow, setExpandedRow] = useState<string | null>(null);
    const router = useRouter();

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const response = await api.get(`/api/stocks/activity/?range=${timeframe}`);
                setData(response.data);
            } catch (err) {
                console.error('Failed to fetch activity data', err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [timeframe]);

    const toggleRow = (ticker: string) => {
        setExpandedRow(expandedRow === ticker ? null : ticker);
    };

    // Helper to render broker bar chart
    const BrokerBarChart = ({ brokers, type, totalQty }: { brokers: BrokerData[], type: 'buy' | 'sell', totalQty: number }) => {
        const maxVal = Math.max(...brokers.map(b => b.quantity), 1);
        const colorClass = type === 'buy' ? 'bg-emerald-500' : 'bg-rose-500';
        const textClass = type === 'buy' ? 'text-emerald-600' : 'text-rose-600';

        return (
            <div className="space-y-2">
                <h4 className={`text-xs font-bold uppercase tracking-widest mb-3 ${textClass} flex items-center gap-1.5`}>
                    {type === 'buy' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    Top {type === 'buy' ? 'Buyers' : 'Sellers'}
                </h4>
                <div className="space-y-1.5">
                    {brokers.map((b, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                            <span className="w-8 font-mono font-bold text-slate-500">#{b.broker_id}</span>
                            <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${(b.quantity / maxVal) * 100}%` }}
                                    className={`h-full ${colorClass} rounded-full`}
                                />
                            </div>
                            <span className="w-16 text-right font-mono text-[10px] text-slate-600 dark:text-slate-400">
                                {b.quantity.toLocaleString()}
                            </span>
                        </div>
                    ))}
                    {brokers.length === 0 && <div className="text-xs text-slate-400 italic">No broker data</div>}
                </div>
            </div>
        );
    };

    return (
        <DashboardLayout title="Deep Dive" subtitle="MARKET ACTIVITY">
            <div className="space-y-6 pb-12">
                {/* Header Controls */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-100 dark:border-white/5 backdrop-blur-xl">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-blue-500/10 rounded-xl text-blue-600 dark:text-blue-400">
                            <Activity size={20} />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Market Activity Analysis</h2>
                            <p className="text-[10px] text-slate-500 font-medium">Drill down into broker flows and transaction stats</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Tabs defaultValue="daily" value={timeframe} onValueChange={setTimeframe} className="w-[300px]">
                            <TabsList className="grid w-full grid-cols-3 bg-slate-100 dark:bg-slate-800/50 p-1 rounded-xl">
                                <TabsTrigger value="daily" className="rounded-lg text-xs font-bold">Daily</TabsTrigger>
                                <TabsTrigger value="weekly" className="rounded-lg text-xs font-bold">Weekly</TabsTrigger>
                                <TabsTrigger value="monthly" className="rounded-lg text-xs font-bold">Monthly</TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </div>
                </div>

                {/* Main Content */}
                <Card className="bg-white dark:bg-slate-900/50 border-none shadow-xl shadow-slate-200/50 dark:shadow-none overflow-hidden backdrop-blur-xl">
                    <CardContent className="p-0">
                        {loading ? (
                            <div className="flex items-center justify-center min-h-[400px]">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                            </div>
                        ) : !data || data.analysis.length === 0 ? (
                            <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-400">
                                <Filter size={48} className="mb-4 opacity-20" />
                                <p className="text-sm font-bold">No significant activity found</p>
                                <p className="text-xs">Try changing the timeframe or range</p>
                            </div>
                        ) : (
                            <Table>
                                <TableHeader className="bg-slate-50/50 dark:bg-white/5">
                                    <TableRow className="border-slate-100 dark:border-white/5">
                                        <TableHead className="w-[50px]"></TableHead>
                                        <TableHead className="font-bold text-[10px] uppercase tracking-widest text-slate-500">Stock</TableHead>
                                        <TableHead className="font-bold text-[10px] uppercase tracking-widest text-slate-500 text-right">Close</TableHead>
                                        <TableHead className="font-bold text-[10px] uppercase tracking-widest text-slate-500 text-right">Change</TableHead>
                                        <TableHead className="font-bold text-[10px] uppercase tracking-widest text-slate-500 text-right">Turnover</TableHead>
                                        <TableHead className="font-bold text-[10px] uppercase tracking-widest text-slate-500 text-right">Volume</TableHead>
                                        <TableHead className="font-bold text-[10px] uppercase tracking-widest text-slate-500 text-right pr-6">W. Avg Price</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.analysis.map((item) => (
                                        <React.Fragment key={item.ticker}>
                                            <TableRow
                                                className={`cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 border-slate-50 dark:border-white/5 ${expandedRow === item.ticker ? 'bg-slate-50 dark:bg-white/5' : ''}`}
                                                onClick={() => toggleRow(item.ticker)}
                                            >
                                                <TableCell className="pl-4">
                                                    {expandedRow === item.ticker ? <ChevronDown size={14} /> : <ChevronRight size={14} className="text-slate-400" />}
                                                </TableCell>
                                                <TableCell className="font-bold text-xs">{item.ticker}</TableCell>
                                                <TableCell className="text-right font-mono text-xs">
                                                    Rs. {item.metrics.close}
                                                </TableCell>
                                                <TableCell className={`text-right font-mono text-xs font-bold ${item.metrics.change > 0 ? 'text-emerald-600' : item.metrics.change < 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                                                    {item.metrics.change > 0 ? '+' : ''}{item.metrics.percent_change.toFixed(2)}%
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-xs text-slate-600 dark:text-slate-400">
                                                    {(item.metrics.turnover / 10000000).toFixed(2)} Cr
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-xs text-slate-600 dark:text-slate-400">
                                                    {item.metrics.volume.toLocaleString()}
                                                </TableCell>
                                                <TableCell className="text-right font-mono text-xs font-bold text-blue-600 pr-6">
                                                    {item.analysis.weighted_avg_price}
                                                </TableCell>
                                            </TableRow>

                                            {/* EXPANDED DETAILS */}
                                            <AnimatePresence>
                                                {expandedRow === item.ticker && (
                                                    <TableRow className="border-none bg-slate-50/50 dark:bg-white/5 hover:bg-slate-50/50 dark:hover:bg-white/5">
                                                        <TableCell colSpan={7} className="p-0">
                                                            <motion.div
                                                                initial={{ height: 0, opacity: 0 }}
                                                                animate={{ height: 'auto', opacity: 1 }}
                                                                exit={{ height: 0, opacity: 0 }}
                                                                className="overflow-hidden"
                                                            >
                                                                <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6 border-b border-slate-100 dark:border-white/5">

                                                                    {/* 1. Transaction Stats */}
                                                                    <div className="space-y-4 md:border-r border-slate-200 dark:border-white/10 pr-6">
                                                                        <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                                                                            <BarChart3 size={14} /> Transaction Stats
                                                                        </h4>
                                                                        <div className="grid grid-cols-2 gap-4">
                                                                            <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-white/5">
                                                                                <div className="text-[10px] text-slate-400 font-bold uppercase">Total Trades</div>
                                                                                <div className="text-lg font-bold text-slate-800 dark:text-slate-100 mt-1">
                                                                                    {item.analysis.total_transactions}
                                                                                </div>
                                                                            </div>
                                                                            <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-white/5">
                                                                                <div className="text-[10px] text-slate-400 font-bold uppercase">Avg Size</div>
                                                                                <div className="text-lg font-bold text-slate-800 dark:text-slate-100 mt-1">
                                                                                    {item.analysis.total_transactions > 0
                                                                                        ? Math.round(item.metrics.volume / item.analysis.total_transactions)
                                                                                        : 0}
                                                                                    <span className="text-[10px] text-slate-400 ml-1 font-normal">Qty</span>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-white/5">
                                                                            <button
                                                                                onClick={(e) => { e.stopPropagation(); router.push(`/ticker/${item.ticker}`); }}
                                                                                className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors"
                                                                            >
                                                                                Open Ticker Dashboard
                                                                            </button>
                                                                        </div>
                                                                    </div>

                                                                    {/* 2. Broker Concentration (Buy) */}
                                                                    <div className="md:border-r border-slate-200 dark:border-white/10 pr-6">
                                                                        <BrokerBarChart
                                                                            brokers={item.analysis.top_buyers}
                                                                            type="buy"
                                                                            totalQty={item.metrics.volume}
                                                                        />
                                                                    </div>

                                                                    {/* 3. Broker Concentration (Sell) */}
                                                                    <div>
                                                                        <BrokerBarChart
                                                                            brokers={item.analysis.top_sellers}
                                                                            type="sell"
                                                                            totalQty={item.metrics.volume}
                                                                        />
                                                                    </div>

                                                                </div>
                                                            </motion.div>
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                            </AnimatePresence>
                                        </React.Fragment>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            </div>
        </DashboardLayout>
    );
}
