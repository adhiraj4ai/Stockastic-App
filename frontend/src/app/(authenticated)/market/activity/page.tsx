'use client';

import React, { useState, useEffect } from 'react';
import api from '@/lib/api';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
    Activity, ArrowUpRight, ArrowDownRight,
    BarChart3, TrendingUp, ChevronDown, ChevronRight,
    Filter, Zap, Droplets, Magnet, Calendar, Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { TopGainersChart } from '@/components/TopGainersChart';

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

interface TimeframeData {
    turnover: ActivityData[];
    gainers: ActivityData[];
    volume: ActivityData[];
}

interface ApiResponse {
    daily: TimeframeData;
    weekly: TimeframeData;
    monthly: TimeframeData;
}

export default function MarketActivityPage() {
    const [data, setData] = useState<ApiResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [category, setCategory] = useState('gainers');
    const router = useRouter();

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                // Fetch all data at once (no params needed as backend returns all)
                const response = await api.get('/api/stocks/activity/');
                setData(response.data);
            } catch (err) {
                console.error('Failed to fetch activity data', err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const CategoryContent = ({ type }: { type: 'turnover' | 'gainers' | 'volume' }) => {
        if (!data) return null;

        // Prepare chart data for this specific category
        const chartData = data.daily[type].slice(0, 10).map(item => ({
            ticker: item.ticker,
            change: item.metrics.change,
            percent_change: item.metrics.percent_change,
            price: item.metrics.close
        }));

        const chartTitle = type === 'turnover' ? 'High Turnover' : type === 'gainers' ? 'Top Gainers' : 'High Volume';

        return (
            <div className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Daily Column */}
                    <div className="col-span-1 min-w-0">
                        <div className="flex items-center gap-2 mb-4 px-1">
                            <div className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-400">
                                <Clock size={16} />
                            </div>
                            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Daily Top 10</h3>
                        </div>
                        <ActivityTable data={data.daily ? data.daily[type] : []} type={type} />
                    </div>

                    {/* Weekly Column */}
                    <div className="col-span-1 min-w-0">
                        <div className="flex items-center gap-2 mb-4 px-1">
                            <div className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-400">
                                <Calendar size={16} />
                            </div>
                            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Weekly Top 10</h3>
                        </div>
                        <ActivityTable data={data.weekly ? data.weekly[type] : []} type={type} />
                    </div>

                    {/* Monthly Column */}
                    <div className="col-span-1 min-w-0">
                        <div className="flex items-center gap-2 mb-4 px-1">
                            <div className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-400">
                                <Calendar size={16} />
                            </div>
                            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Monthly Top 10</h3>
                        </div>
                        <ActivityTable data={data.monthly ? data.monthly[type] : []} type={type} />
                    </div>
                </div>

                {/* Performance Chart for this Category */}
                <Card className="bg-white dark:bg-slate-900/50 border-none shadow-xl shadow-slate-200/50 dark:shadow-none overflow-hidden backdrop-blur-xl relative group">
                    <CardHeader className="p-5 border-b border-slate-50 dark:border-white/5 flex flex-row items-center justify-between relative z-10">
                        <div className="space-y-1">
                            <CardTitle className="text-sm font-bold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
                                <TrendingUp size={14} className="text-blue-500" />
                                {chartTitle} Performance Analysis
                            </CardTitle>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">30-Day price trend of the top 10 stocks in this category</p>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6 relative z-10">
                        <TopGainersChart
                            gainers={chartData}
                            height={350}
                        />
                    </CardContent>
                </Card>
            </div>
        );
    };

    return (
        <DashboardLayout title="Market Activity Analysis" subtitle="Multi-timeframe breakdown of top stocks">
            <div className="space-y-6 pb-12">


                {loading ? (
                    <div className="flex items-center justify-center min-h-[400px]">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                    </div>
                ) : !data ? (
                    <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-400">
                        <Filter size={48} className="mb-4 opacity-20" />
                        <p className="text-sm font-bold">No data available</p>
                    </div>
                ) : (

                    <Tabs defaultValue="gainers" value={category} onValueChange={setCategory} className="w-full">
                        <TabsList className="inline-flex h-auto bg-slate-100 dark:bg-slate-800 p-1 rounded-lg mb-6">
                            <TabsTrigger
                                value="gainers"
                                className="rounded-md px-4 py-2 text-xs font-bold uppercase tracking-wide data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:text-emerald-600 data-[state=active]:shadow-sm transition-all"
                            >
                                <div className="flex items-center justify-center gap-2">
                                    <Zap size={14} /> Top Gainers
                                </div>
                            </TabsTrigger>
                            <TabsTrigger
                                value="turnover"
                                className="rounded-md px-4 py-2 text-xs font-bold uppercase tracking-wide data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:text-blue-600 data-[state=active]:shadow-sm transition-all"
                            >
                                <div className="flex items-center justify-center gap-2">
                                    <Magnet size={14} /> High Turnover
                                </div>
                            </TabsTrigger>
                            <TabsTrigger
                                value="volume"
                                className="rounded-md px-4 py-2 text-xs font-bold uppercase tracking-wide data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:text-cyan-600 data-[state=active]:shadow-sm transition-all"
                            >
                                <div className="flex items-center justify-center gap-2">
                                    <Droplets size={14} /> High Volume
                                </div>
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="turnover" className="mt-0">
                            <CategoryContent type="turnover" />
                        </TabsContent>
                        <TabsContent value="gainers" className="mt-0">
                            <CategoryContent type="gainers" />
                        </TabsContent>
                        <TabsContent value="volume" className="mt-0">
                            <CategoryContent type="volume" />
                        </TabsContent>
                    </Tabs>
                )}
            </div>
        </DashboardLayout>
    );
}

// Sub-component for isolation
function ActivityTable({ data, type }: { data: ActivityData[], type: string }) {
    const [expandedRow, setExpandedRow] = useState<string | null>(null);
    const router = useRouter();

    const toggleRow = (ticker: string) => {
        setExpandedRow(expandedRow === ticker ? null : ticker);
    };

    if (!data || data.length === 0) {
        return (
            <div className="p-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-white/10 rounded-xl bg-slate-50/50 dark:bg-white/5">
                No stocks found.
            </div>
        );
    }

    return (
        <Card className="bg-white dark:bg-slate-900/50 border-none shadow-xl shadow-slate-200/50 dark:shadow-none overflow-hidden backdrop-blur-xl h-full">
            <CardContent className="p-0">
                <Table>
                    <TableHeader className="bg-slate-50/50 dark:bg-white/5">
                        <TableRow className="border-slate-100 dark:border-white/5">
                            <TableHead className="w-[30px] p-2"></TableHead>
                            <TableHead className="font-bold text-[10px] uppercase tracking-widest text-slate-500 p-2">Stock</TableHead>
                            <TableHead className="font-bold text-[10px] uppercase tracking-widest text-slate-500 text-right p-2">Price</TableHead>
                            <TableHead className="font-bold text-[10px] uppercase tracking-widest text-slate-500 text-right p-2">Chg%</TableHead>
                            <TableHead className="font-bold text-[10px] uppercase tracking-widest text-slate-500 text-right p-2">
                                {type === 'volume' ? 'Vol' : 'Turn'}
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {data.map((item) => (
                            <React.Fragment key={item.ticker}>
                                <TableRow
                                    className={`cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5 border-slate-50 dark:border-white/5 ${expandedRow === item.ticker ? 'bg-slate-50 dark:bg-white/5' : ''}`}
                                    onClick={() => toggleRow(item.ticker)}
                                >
                                    <TableCell className="p-2 pl-3">
                                        {expandedRow === item.ticker ? <ChevronDown size={14} /> : <ChevronRight size={14} className="text-slate-400" />}
                                    </TableCell>
                                    <TableCell className="font-bold text-xs p-2">{item.ticker}</TableCell>
                                    <TableCell className="text-right font-mono text-xs p-2">
                                        {item.metrics.close}
                                    </TableCell>
                                    <TableCell className={`text-right font-mono text-xs font-bold p-2 ${item.metrics.change > 0 ? 'text-emerald-600' : item.metrics.change < 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                                        {item.metrics.percent_change.toFixed(1)}%
                                    </TableCell>
                                    <TableCell className="text-right font-mono text-[10px] text-slate-600 dark:text-slate-400 p-2">
                                        {type === 'volume'
                                            ? `${(item.metrics.volume / 1000).toFixed(1)}K`
                                            : `${(item.metrics.turnover / 10000000).toFixed(2)}Cr`}
                                    </TableCell>
                                </TableRow>

                                {/* EXPANDED DETAILS */}
                                <AnimatePresence>
                                    {expandedRow === item.ticker && (
                                        <TableRow className="border-none bg-slate-50/50 dark:bg-white/5 hover:bg-slate-50/50 dark:hover:bg-white/5">
                                            <TableCell colSpan={5} className="p-0">
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: 'auto', opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    className="overflow-hidden"
                                                >
                                                    <div className="p-4 flex flex-col gap-4 border-b border-slate-100 dark:border-white/5">

                                                        {/* Transaction Stats Row */}
                                                        <div className="flex justify-between items-center bg-white dark:bg-slate-900 rounded-lg p-3 border border-slate-100 dark:border-white/5">
                                                            <div>
                                                                <div className="text-[9px] text-slate-400 uppercase tracking-widest">W. Avg</div>
                                                                <div className="text-sm font-bold text-blue-600">{item.analysis.weighted_avg_price}</div>
                                                            </div>
                                                            <div className="text-right">
                                                                <div className="text-[9px] text-slate-400 uppercase tracking-widest">Trades</div>
                                                                <div className="text-sm font-bold text-slate-700 dark:text-slate-300">{item.analysis.total_transactions}</div>
                                                            </div>
                                                            <div className="text-right">
                                                                <div className="text-[9px] text-slate-400 uppercase tracking-widest">Avg Size</div>
                                                                <div className="text-sm font-bold text-slate-700 dark:text-slate-300">
                                                                    {item.analysis.total_transactions > 0
                                                                        ? Math.round(item.metrics.volume / item.analysis.total_transactions)
                                                                        : 0}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Broker Charts - Stacked */}
                                                        <div className="space-y-4">
                                                            <BrokerBarChart
                                                                brokers={item.analysis.top_buyers}
                                                                type="buy"
                                                                totalQty={item.metrics.volume}
                                                            />
                                                            <BrokerBarChart
                                                                brokers={item.analysis.top_sellers}
                                                                type="sell"
                                                                totalQty={item.metrics.volume}
                                                            />
                                                        </div>

                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); router.push(`/ticker/${item.ticker}`); }}
                                                            className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold rounded flex items-center justify-center gap-1 transition-colors"
                                                        >
                                                            View Dashboard <ArrowUpRight size={12} />
                                                        </button>
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
            </CardContent>
        </Card>
    );
}

const BrokerBarChart = ({ brokers, type, totalQty }: { brokers: BrokerData[], type: 'buy' | 'sell', totalQty: number }) => {
    const maxVal = Math.max(...brokers.map(b => b.quantity), 1);
    const colorClass = type === 'buy' ? 'bg-emerald-500' : 'bg-rose-500';
    const textClass = type === 'buy' ? 'text-emerald-600' : 'text-rose-600';

    return (
        <div className="space-y-1">
            <h4 className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${textClass} flex items-center gap-1`}>
                {type === 'buy' ? 'Buy' : 'Sell'}
            </h4>
            <div className="space-y-1">
                {brokers.slice(0, 3).map((b, i) => ( // Show top 3 only for compactness
                    <div key={i} className="flex items-center gap-2 text-[10px]">
                        <span className="w-6 font-mono font-bold text-slate-500">#{b.broker_id}</span>
                        <div className="flex-1 h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${(b.quantity / maxVal) * 100}%` }}
                                className={`h-full ${colorClass} rounded-full`}
                            />
                        </div>
                        <span className="w-10 text-right font-mono text-slate-600 dark:text-slate-400">
                            {b.quantity}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

