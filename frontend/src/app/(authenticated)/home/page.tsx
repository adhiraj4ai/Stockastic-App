'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrendingUp, TrendingDown, Activity, DollarSign } from 'lucide-react';
import { SectorSummary } from '@/components/SectorSummary';
import { SectorGraph } from '@/components/SectorGraph';

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
        count: number;
    }[];
}

export default function DashboardPage() {
    const [data, setData] = useState<MarketSummaryData | null>(null);
    const [loading, setLoading] = useState(true);
    const [portfolioStats, setPortfolioStats] = useState({ investment: 0, dayPL: 0, dailyPLPositive: true });
    const [error, setError] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);

    const router = useRouter();

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

            } catch (err: any) {
                console.error('Failed to fetch dashboard data', err);
                // Errors are mostly handled by global interceptor if 401
                const msg = err.response?.data?.detail || err.message;
                setError(`Failed to load data: ${msg}`);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [router]);

    if (!mounted) return null;

    if (error) {
        return (
            <DashboardLayout>
                <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-8">
                    <div className="text-red-500 text-xl font-bold mb-2">Error Loading Dashboard</div>
                    <div className="text-gray-600">{error}</div>
                    <button
                        onClick={() => window.location.reload()}
                        className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
                    >
                        Retry
                    </button>
                </div>
            </DashboardLayout>
        );
    }

    if (loading || !data || !data.market_summary) {
        return (
            <DashboardLayout>
                <div className="flex items-center justify-center min-h-[50vh]">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
                </div>
            </DashboardLayout>
        );
    }

    const { market_summary, top_volume, top_turnover, bottom_volume, bottom_turnover, top_gainers, top_losers } = data;
    const isPositive = market_summary.points_change >= 0;

    const StockList = ({ stocks }: { stocks: StockData[] }) => (
        <div className="overflow-x-auto">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Ticker</TableHead>
                        <TableHead className="text-right">Price (Rs.)</TableHead>
                        <TableHead className="text-right">Change</TableHead>
                        <TableHead className="text-right">Volume</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {stocks.map((stock) => {
                        const isStockPositive = stock.change >= 0;
                        return (
                            <TableRow
                                key={stock.ticker}
                                className="cursor-pointer hover:bg-gray-50"
                                onClick={() => router.push(`/stock/${stock.ticker}`)}
                            >
                                <TableCell className="font-medium">{stock.ticker}</TableCell>
                                <TableCell className="text-right">{Number(stock.close).toFixed(2)}</TableCell>
                                <TableCell className={`text-right ${isStockPositive ? 'text-green-600' : 'text-red-600'}`}>
                                    {isStockPositive ? '+' : ''}{Number(stock.percent_change).toFixed(2)}%
                                </TableCell>
                                <TableCell className="text-right">{Number(stock.volume).toLocaleString()}</TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </div>
    );

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h1 className="text-3xl font-bold text-gray-900">Market Overview</h1>
                    <div className="text-sm text-gray-500">
                        Date: {market_summary.date}
                    </div>
                </div>

                {/* Stats Grid - Now 6 columns (responsive) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                    {/* 1. Total Turnover */}
                    <Card className="bg-white border-gray-200 hover:shadow-md transition-shadow">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-gray-600">Turnover (Rs.)</CardTitle>
                            <div className="p-2 bg-purple-100 rounded-lg">
                                <Activity className="h-4 w-4 text-purple-600" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-gray-900">
                                {(market_summary.total_turnover / 1_000_000).toFixed(2)}M
                            </div>
                        </CardContent>
                    </Card>

                    {/* 2. Market Points */}
                    <Card className="bg-white border-gray-200 hover:shadow-md transition-shadow">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-gray-600">Market</CardTitle>
                            <div className={`p-2 rounded-lg ${isPositive ? 'bg-green-100' : 'bg-red-100'}`}>
                                {isPositive ? <TrendingUp className="h-4 w-4 text-green-600" /> : <TrendingDown className="h-4 w-4 text-red-600" />}
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-col">
                                <div className="text-2xl font-bold text-gray-900">
                                    {market_summary.total_points.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </div>
                                <div className={`text-xs font-semibold mt-1 ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                                    {isPositive ? '+' : ''}{market_summary.points_change.toFixed(2)}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* 3. Gainers */}
                    <Card className="bg-white border-gray-200 hover:shadow-md transition-shadow">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-gray-600">Gainers</CardTitle>
                            <div className="p-2 bg-green-100 rounded-lg">
                                <TrendingUp className="h-4 w-4 text-green-600" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-col">
                                <div className="text-2xl font-bold text-gray-900">
                                    {market_summary.advancers}
                                </div>
                                <div className="text-xs font-semibold mt-1 text-green-600">
                                    {Number(market_summary.advancers_percent).toFixed(1)}%
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* 4. Losers */}
                    <Card className="bg-white border-gray-200 hover:shadow-md transition-shadow">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-gray-600">Losers</CardTitle>
                            <div className="p-2 bg-red-100 rounded-lg">
                                <TrendingDown className="h-4 w-4 text-red-600" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-col">
                                <div className="text-2xl font-bold text-gray-900">
                                    {market_summary.decliners}
                                </div>
                                <div className="text-xs font-semibold mt-1 text-red-600">
                                    {Number(market_summary.decliners_percent).toFixed(1)}%
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* 5. Portfolio Investment */}
                    <Card className="bg-white border-gray-200 hover:shadow-md transition-shadow">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-gray-600">My Investment (Rs.)</CardTitle>
                            <div className="p-2 bg-blue-100 rounded-lg">
                                <DollarSign className="h-4 w-4 text-blue-600" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-gray-900">
                                {portfolioStats.investment.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </div>
                        </CardContent>
                    </Card>

                    {/* 6. Today's P/L */}
                    <Card className="bg-white border-gray-200 hover:shadow-md transition-shadow">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-gray-600">Today's P/L (Rs.)</CardTitle>
                            <div className={`p-2 rounded-lg ${portfolioStats.dailyPLPositive ? 'bg-green-100' : 'bg-red-100'}`}>
                                {portfolioStats.dailyPLPositive ? <TrendingUp className="h-4 w-4 text-green-600" /> : <TrendingDown className="h-4 w-4 text-red-600" />}
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className={`text-2xl font-bold ${portfolioStats.dailyPLPositive ? "text-green-600" : "text-red-600"}`}>
                                {portfolioStats.dailyPLPositive ? '+' : ''}{portfolioStats.dayPL.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Sector Analysis Section */}
                {/* Sector Analysis Section - Changed to min-h to prevent overlap */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                    <div className="lg:col-span-2 h-[450px]">
                        <SectorGraph />
                    </div>
                    <div className="h-[450px]">
                        <SectorSummary sectors={data.sector_summary || []} />
                    </div>
                </div>

                {/* 3 Columns: Turnover, Volume, Price Change */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                    {/* Turnover Card */}
                    <Card className="h-full">
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <CardTitle>Turnover</CardTitle>
                                <DollarSign className="h-4 w-4 text-gray-500" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <Tabs defaultValue="top" className="w-full">
                                <TabsList className="grid w-full grid-cols-2 mb-4">
                                    <TabsTrigger value="top">Top 10</TabsTrigger>
                                    <TabsTrigger value="bottom">Bottom 10</TabsTrigger>
                                </TabsList>
                                <TabsContent value="top">
                                    <StockList stocks={top_turnover} />
                                </TabsContent>
                                <TabsContent value="bottom">
                                    <StockList stocks={bottom_turnover} />
                                </TabsContent>
                            </Tabs>
                        </CardContent>
                    </Card>

                    {/* Volume Card */}
                    <Card className="h-full">
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <CardTitle>Volume</CardTitle>
                                <Activity className="h-4 w-4 text-gray-500" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <Tabs defaultValue="top" className="w-full">
                                <TabsList className="grid w-full grid-cols-2 mb-4">
                                    <TabsTrigger value="top">Top 10</TabsTrigger>
                                    <TabsTrigger value="bottom">Bottom 10</TabsTrigger>
                                </TabsList>
                                <TabsContent value="top">
                                    <StockList stocks={top_volume} />
                                </TabsContent>
                                <TabsContent value="bottom">
                                    <StockList stocks={bottom_volume} />
                                </TabsContent>
                            </Tabs>
                        </CardContent>
                    </Card>

                    {/* Gainers/Losers Card */}
                    <Card className="h-full">
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <CardTitle>Performance</CardTitle>
                                <TrendingUp className="h-4 w-4 text-gray-500" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <Tabs defaultValue="gainers" className="w-full">
                                <TabsList className="grid w-full grid-cols-2 mb-4">
                                    <TabsTrigger value="gainers">Top Gainers</TabsTrigger>
                                    <TabsTrigger value="losers">Top Losers</TabsTrigger>
                                </TabsList>
                                <TabsContent value="gainers">
                                    <StockList stocks={top_gainers || []} />
                                </TabsContent>
                                <TabsContent value="losers">
                                    <StockList stocks={top_losers || []} />
                                </TabsContent>
                            </Tabs>
                        </CardContent>
                    </Card>

                </div>
            </div>
        </DashboardLayout>
    );
}
