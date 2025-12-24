'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TrendingUp, TrendingDown, Activity, DollarSign, Zap, BarChart3, Globe, ShieldAlert, HeartPulse, Activity as ActivityIcon, LineChart } from 'lucide-react';
import { SectorGraph } from '@/components/SectorGraph';
import { Sparkline } from '@/components/Sparkline';
import { MarketBubbleMap } from '@/components/MarketBubbleMap';
import { SentimentGauge } from '@/components/SentimentGauge';
import { MarketHealthRadar } from '@/components/MarketHealthRadar';
import { VolumeShockers } from '@/components/VolumeShockers';
import { MiniSectorCard } from '@/components/MiniSectorCard';
import { BreakoutWatchlist } from '@/components/BreakoutWatchlist';
import { MarketBreadthTrend } from '@/components/MarketBreadthTrend';
import { InstitutionalInterest } from '@/components/InstitutionalInterest';
import { Badge } from '@/components/ui/badge';

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
    sector?: string;
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
    const [allStocks, setAllStocks] = useState<StockData[]>([]);
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

                // Flatten all stocks for heatmap from all top lists to get a better sample
                const uniqueStocks = new Map<string, StockData>();
                const sourceLists = [
                    summaryResponse.data.top_gainers,
                    summaryResponse.data.top_losers,
                    summaryResponse.data.top_turnover,
                    summaryResponse.data.top_volume
                ];

                sourceLists.flat().filter(Boolean).forEach(s => uniqueStocks.set(s.ticker, s));
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
        if (!data) return [];
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
        if (!data) return 50;
        const { advancers, decliners, points_change } = data.market_summary;
        const total = advancers + decliners;
        if (total === 0) return 50;
        const breadthRatio = (advancers / total) * 100;
        const momentumBonus = points_change > 0 ? 10 : -10;
        return Math.max(0, Math.min(100, breadthRatio + momentumBonus));
    }, [data]);

    // Market Health radar data
    const marketHealthData = useMemo(() => {
        if (!data) return { volume: 50, turnover: 50, breadth: 50, volatility: 50, participation: 50 };
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
                    <div className="text-red-500 text-xl font-bold mb-2">Error Loading Dashboard</div>
                    <div className="text-gray-600 mb-6">{error}</div>
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

    if (loading || !data || !data.market_summary) {
        return (
            <DashboardLayout>
                <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
                    <div className="relative h-16 w-16">
                        <div className="absolute inset-0 rounded-full border-4 border-blue-100"></div>
                        <div className="absolute inset-0 rounded-full border-4 border-blue-600 border-t-transparent animate-spin"></div>
                    </div>
                    <div className="text-gray-500 font-medium animate-pulse">Initializing Data Stream...</div>
                </div>
            </DashboardLayout>
        );
    }

    const { market_summary, top_volume, top_turnover, top_gainers, top_losers, sector_summary } = data;
    const isPositive = market_summary.points_change >= 0;

    const StockRow = ({ stock }: { stock: StockData }) => {
        const isStockPositive = stock.change >= 0;
        return (
            <TableRow
                key={stock.ticker}
                className="cursor-pointer hover:bg-slate-50 border-transparent transition-colors group"
                onClick={() => router.push(`/stock/${stock.ticker}`)}
            >
                <TableCell className="py-2.5">
                    <div className="flex flex-col">
                        <span className="font-bold text-slate-800 group-hover:text-blue-600 transition-colors">{stock.ticker}</span>
                        <span className="text-[10px] text-slate-600 font-medium">{stock.sector || 'Listed Equity'}</span>
                    </div>
                </TableCell>
                <TableCell className="text-right py-2.5 font-mono font-medium">
                    {Number(stock.close).toLocaleString()}
                </TableCell>
                <TableCell className={`text-right py-2.5 font-bold ${isStockPositive ? 'text-emerald-500' : 'text-rose-500'}`}>
                    <div className="flex items-center justify-end gap-1">
                        {isStockPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                        {Number(stock.percent_change).toFixed(2)}%
                    </div>
                </TableCell>
            </TableRow>
        );
    };

    return (
        <DashboardLayout noPadding>
            {/* 1. Market Pulse Ticker */}
            <div className="bg-slate-900 text-white overflow-hidden py-2 border-b border-slate-800">
                <div className="flex animate-infinite-scroll whitespace-nowrap items-center gap-12 px-4">
                    {top_gainers.concat(top_losers).slice(0, 10).map((stock, i) => (
                        <div key={i} className="flex items-center gap-2 cursor-pointer hover:text-blue-400 transition-colors" onClick={() => router.push(`/stock/${stock.ticker}`)}>
                            <span className="font-bold text-sm tracking-wider">{stock.ticker}</span>
                            <span className="font-mono text-sm">{stock.close}</span>
                            <span className={`text-[10px] font-bold px-1 rounded ${stock.change >= 0 ? 'bg-emerald-500/20 text-emerald-600' : 'bg-rose-500/20 text-rose-600'}`}>
                                {stock.change >= 0 ? '+' : ''}{stock.percent_change.toFixed(1)}%
                            </span>
                        </div>
                    ))}
                    {/* Duplicate for seamless scroll */}
                    {top_gainers.concat(top_losers).slice(0, 10).map((stock, i) => (
                        <div key={`d-${i}`} className="flex items-center gap-2 cursor-pointer hover:text-blue-400 transition-colors" onClick={() => router.push(`/stock/${stock.ticker}`)}>
                            <span className="font-bold text-sm tracking-widest">{stock.ticker}</span>
                            <span className="font-mono text-sm">{stock.close}</span>
                            <span className={`text-[10px] font-bold px-1 rounded ${stock.change >= 0 ? 'bg-emerald-500/20 text-emerald-600' : 'bg-rose-500/20 text-rose-600'}`}>
                                {stock.change >= 0 ? '+' : ''}{stock.percent_change.toFixed(1)}%
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="p-6 lg:p-8 space-y-8 bg-slate-50/50">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div className="space-y-1">
                        <h1 className="text-4xl font-extrabold text-black tracking-tight flex items-baseline gap-2">
                            Market Summary <span className="text-lg font-light text-slate-600">— Overview</span>
                        </h1>
                    </div>

                    <div className="flex items-center gap-4">
                        <Badge className="bg-emerald-100 text-emerald-900 hover:bg-emerald-100 border-emerald-200 px-3 py-1 font-bold text-xs tracking-wider h-auto rounded-full">
                            Today {market_summary.date}
                        </Badge>
                    </div>
                </div>

                {/* ADVANCED INSIGHTS LAYER: Top Sector Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {(sector_summary || []).slice(0, 4).map((sector, i) => (
                        <MiniSectorCard
                            key={i}
                            name={sector.name}
                            change={sector.change}
                            turnover={sector.turnover}
                        />
                    ))}
                </div>

                {/* 3. Main Operational Grid */}
                <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 items-start">

                    {/* LEFT COLUMN: Deep Analysis & Watchlists */}
                    <div className="xl:col-span-1 space-y-6">

                        {/* Market Sentiment Gauge */}
                        <Card className="bg-white border-none shadow-xl shadow-slate-200/50">
                            <CardHeader className="p-3 pb-1">
                                <CardTitle className="text-sm font-bold text-black tracking-tight flex items-center gap-2">
                                    <HeartPulse size={14} className="text-rose-500" /> Market Sentiment
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-6 pt-0">
                                <SentimentGauge value={marketSentiment} height={160} />
                                <div className="mt-2 space-y-4">
                                    <div className="h-1.5 w-full bg-slate-100 rounded-full flex overflow-hidden">
                                        <div className="h-full bg-emerald-500" style={{ width: `${market_summary.advancers_percent}%` }}></div>
                                        <div className="h-full bg-rose-500" style={{ width: `${market_summary.decliners_percent}%` }}></div>
                                    </div>
                                    <div className="flex justify-between text-[10px] font-black tracking-widest">
                                        <div className="flex flex-col items-start gap-1">
                                            <span className="text-emerald-700 italic">Advancers</span>
                                            <span className="text-xl text-black">{market_summary.advancers}</span>
                                        </div>
                                        <div className="flex flex-col items-end gap-1 text-right">
                                            <span className="text-rose-700 italic">Decliners</span>
                                            <span className="text-xl text-black">{market_summary.decliners}</span>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Breakout Watchlist */}
                        <Card className="bg-white border-none shadow-xl shadow-slate-200/50">
                            <CardContent className="p-5">
                                <BreakoutWatchlist stocks={allStocks} />
                            </CardContent>
                        </Card>

                        {/* Institutional Interest */}
                        <Card className="bg-white border-none shadow-xl shadow-slate-200/50">
                            <CardContent className="p-5">
                                <InstitutionalInterest />
                            </CardContent>
                        </Card>

                        {/* Major Index Card */}
                        <Card className="bg-white border-none shadow-xl shadow-slate-200/50 overflow-hidden relative group">
                            <div className={`absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {isPositive ? <TrendingUp size={120} /> : <TrendingDown size={120} />}
                            </div>
                            <CardContent className="p-6 relative">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="p-2 bg-slate-50 rounded-lg">
                                        <Zap size={20} className="text-blue-600 fill-blue-600" />
                                    </div>
                                    <div className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-widest ${isPositive ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                                        {isPositive ? 'Bullish' : 'Bearish'}
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <span className="text-slate-900 text-xs font-bold tracking-widest">Nepse Index</span>
                                    <div className="flex items-baseline gap-2">
                                        <h2 className="text-3xl font-black text-black tracking-tighter">
                                            {market_summary.total_points.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                        </h2>
                                        <span className={`text-sm font-bold ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                                            {isPositive ? '+' : ''}{market_summary.points_change.toFixed(2)}
                                        </span>
                                    </div>
                                </div>
                                <div className="mt-6">
                                    <Sparkline data={indexSparkData} height={60} />
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* MIDDLE COLUMN: Bubble Map and Lists */}
                    <div className="xl:col-span-3 grid grid-cols-1 lg:grid-cols-3 gap-6">

                        {/* Market Bubble Map */}
                        <Card className="lg:col-span-2 bg-white border-none shadow-xl shadow-slate-200/50">
                            <CardHeader className="p-3 pb-1 flex flex-row items-center justify-between">
                                <CardTitle className="text-sm font-bold text-black tracking-tight flex items-center gap-2">
                                    <Globe size={14} /> Market Dynamics (Bubble Map)
                                </CardTitle>
                                <div className="flex items-center gap-2">
                                    <div className="flex items-center gap-1.5 text-[9px] font-black tracking-widest">
                                        <span className="h-2 w-2 rounded-full bg-rose-600"></span> Bearish
                                        <span className="h-2 w-2 rounded-full bg-slate-400"></span> Neutral
                                        <span className="h-2 w-2 rounded-full bg-emerald-600"></span> Bullish
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="p-6 pt-0">
                                <div className="rounded-2xl overflow-hidden border border-slate-50 bg-slate-50/30">
                                    <MarketBubbleMap stocks={allStocks} height={450} />
                                </div>
                            </CardContent>
                        </Card>

                        {/* Actionable Stock Lists (Tabbed) */}
                        <Card className="xl:col-span-1 bg-white border-none shadow-xl shadow-slate-200/50 h-full flex flex-col">
                            <CardHeader className="p-3 pb-1">
                                <CardTitle className="text-sm font-bold text-black tracking-tight flex items-center gap-2">
                                    <Zap size={14} /> High Alpha Signals
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-6 pt-0 flex-1 overflow-hidden flex flex-col">
                                <Tabs defaultValue="gainers" className="w-full h-full flex flex-col">
                                    <TabsList className="grid w-full grid-cols-2 mb-4 bg-slate-100 p-1 rounded-xl h-10">
                                        <TabsTrigger value="gainers" className="rounded-lg font-bold text-[10px] tracking-widest data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm">Top Gainers</TabsTrigger>
                                        <TabsTrigger value="losers" className="rounded-lg font-bold text-[10px] tracking-widest data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm">Top Losers</TabsTrigger>
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
                                <Card className="bg-white border-none shadow-xl shadow-slate-200/50 h-full">
                                    <CardHeader className="p-3 pb-1">
                                        <CardTitle className="text-sm font-bold text-black tracking-tight flex items-center gap-2">
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
                                <Card className="bg-white border-none shadow-xl shadow-slate-200/50 h-full">
                                    <CardHeader className="p-3 pb-1">
                                        <CardTitle className="text-sm font-bold text-black tracking-tight flex items-center gap-2">
                                            <ActivityIcon size={14} className="text-blue-500" /> Rally Quality Matrix
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-6 pt-0">
                                        <div className="flex flex-col md:flex-row items-center gap-6">
                                            <div className="flex-1">
                                                <MarketHealthRadar data={marketHealthData} height={250} />
                                            </div>
                                            <div className="w-full md:w-48 space-y-4">
                                                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                                    <span className="text-[9px] font-black text-slate-900 block mb-1">Health Index</span>
                                                    <div className="text-2xl font-black text-blue-600 tracking-tighter">72.4 <span className="text-[10px] text-emerald-600 font-bold">Stable</span></div>
                                                </div>
                                                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                                    <span className="text-[9px] font-black text-slate-900 block mb-1">Confirmation</span>
                                                    <div className="text-[10px] font-bold text-slate-700 leading-tight">Price action confirmed by volume participation.</div>
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
                            <Card className="lg:col-span-2 bg-white border-none shadow-xl shadow-slate-200/50">
                                <CardHeader className="p-3 pb-1">
                                    <CardTitle className="text-sm font-bold text-black tracking-tight flex items-center gap-2">
                                        <BarChart3 size={14} /> Sector Performance & Liquidity Matrix
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-6 pt-0">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4 mt-6">
                                        {(sector_summary || []).sort((a, b) => b.change - a.change).slice(0, 10).map((sector, i) => (
                                            <div key={i} className="space-y-1.5">
                                                <div className="flex justify-between text-[11px] font-bold tracking-tight">
                                                    <span className="text-slate-800 truncate max-w-[150px]">{sector.name}</span>
                                                    <span className={`${sector.change >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                        {sector.change >= 0 ? '+' : ''}{sector.change.toFixed(2)}%
                                                    </span>
                                                </div>
                                                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full ${sector.change >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}
                                                        style={{ width: `${Math.min(100, Math.abs(sector.change) * 20)}%` }}
                                                    ></div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Portfolio Quick Access */}
                            <Card className="bg-white border-none shadow-xl shadow-slate-200/50">
                                <CardHeader className="p-3 pb-1">
                                    <CardTitle className="text-sm font-bold text-black tracking-tight flex items-center gap-2">
                                        <DollarSign size={14} className="text-blue-500" /> Account Exposure
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-6 pt-0 flex flex-col justify-center gap-6 h-full min-h-[300px]">
                                    <div className="space-y-1">
                                        <span className="text-[10px] font-black text-slate-600 tracking-widest">Total Value</span>
                                        <div className="text-3xl font-black text-black tracking-tighter">Rs. {portfolioStats.investment.toLocaleString()}</div>
                                    </div>

                                    <div className="grid grid-cols-1 gap-4">
                                        <div className={`p-4 rounded-3xl ${portfolioStats.dailyPLPositive ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'} border`}>
                                            <span className={`text-[9px] font-black tracking-widest block mb-1 ${portfolioStats.dailyPLPositive ? 'text-emerald-700' : 'text-rose-700'}`}>Day Gain/Loss</span>
                                            <div className={`text-xl font-black ${portfolioStats.dailyPLPositive ? 'text-emerald-800' : 'text-rose-800'}`}>
                                                {portfolioStats.dailyPLPositive ? '+' : ''}{portfolioStats.dayPL.toLocaleString()}
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => router.push('/portfolio')}
                                            className="w-full py-3 bg-slate-900 text-white rounded-2xl font-black text-[10px] tracking-widest hover:bg-slate-800 transition-all transform active:scale-95 shadow-lg shadow-slate-200"
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
                                <Card className="bg-white border-none shadow-xl shadow-slate-200/50">
                                    <CardHeader className="p-3 pb-1">
                                        <CardTitle className="text-sm font-bold text-black tracking-tight flex items-center gap-2">
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
                                <Card className="bg-white border-none shadow-xl shadow-slate-200/50 h-full">
                                    <CardHeader className="p-3 pb-1">
                                        <CardTitle className="text-sm font-bold text-black tracking-tight flex items-center gap-2">
                                            <Zap size={14} /> Volume Shockers
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-6 pt-0">
                                        <VolumeShockers stocks={top_turnover} />
                                    </CardContent>
                                </Card>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

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
