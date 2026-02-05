'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { Target, Filter, TrendingUp, TrendingDown, Search, RefreshCw, X, Activity, BarChart3, LineChart, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { TerminalHeader } from '@/components/stock/TerminalHeader';
import { BentoMetrics } from '@/components/stock/BentoMetrics';
import { FundamentalBenchmarks } from '@/components/stock/FundamentalBenchmarks';
import { TechnicalDivergence } from '@/components/stock/TechnicalDivergence';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FullFeaturedChart } from '@/components/stock/FullFeaturedChart';

interface Recommendation {
    symbol: string;
    signal: 'BUY' | 'SELL';
    strength: number;
    reason: string;
    close: number;
    price?: number; // History endpoint returns 'price'
    date: string;
    crossover_date?: string;
    crossover_price?: number;
    rsi?: number;
    macd_hist?: number;
}

const SECTORS = [
    "All", "Commercial Banks", "Corporate Debentures", "Development Banks", "Finance",
    "Hydro Power", "Investment", "Life Insurance", "Manufacturing And Processing",
    "Microfinance", "Mutual Fund", "Non Life Insurance", "Others", "Preferential Shares",
    "Promoter Share", "Tradings"
];

const STRATEGIES = [
    { id: 'broker_accumulation', name: 'Broker Accumulation (Institutional)' },
    { id: 'smart_accumulated_crossover', name: 'Smart Accumulated Crossover' },
    { id: 'ichimoku_accumulation', name: 'Ichimoku Cloud + Accumulation' },
];

export default function RecommendationsPage() {
    const router = useRouter();

    // Current Signals State
    const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
    const [loadingRecs, setLoadingRecs] = useState(false);
    const [recStrategy, setRecStrategy] = useState('broker_accumulation');
    const [recSector, setRecSector] = useState('All');

    // Chart Modal State
    const [chartOpen, setChartOpen] = useState(false);
    const [selectedRec, setSelectedRec] = useState<Recommendation | null>(null);

    const fetchRecommendations = async () => {
        setLoadingRecs(true);
        setRecommendations([]);
        try {
            let endpoint = '/api/stocks/companies/recommendations/';

            if (recStrategy === 'broker_accumulation') {
                endpoint = '/api/stocks/broker-accumulation-recommendations/';
            } else if (recStrategy === 'smart_accumulated_crossover') {
                endpoint = '/api/stocks/smart-accumulated-crossover-recommendations/';
            } else if (recStrategy === 'ichimoku_accumulation') {
                endpoint = '/api/stocks/ichimoku-accumulation-recommendations/';
            }

            const response = await api.get(endpoint, {
                params: { strategy: recStrategy, sector: recSector }
            });
            const data = response.data.results || response.data;
            setRecommendations(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error("Failed to fetch recommendations", error);
        } finally {
            setLoadingRecs(false);
        }
    };

    useEffect(() => {
        fetchRecommendations();
    }, []);

    useEffect(() => {
        fetchRecommendations();
    }, [recStrategy, recSector]);

    // History Modal State
    const [historyModalOpen, setHistoryModalOpen] = useState(false);
    const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
    const [stockDetails, setStockDetails] = useState<any>(null);
    const [historyData, setHistoryData] = useState<any[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    // Derived State: Calculate completed trades from history
    // Logic: Pair FIRST BUY with FIRST SELL. If last BUY has no SELL, check against LTP.
    const completedTrades = useMemo(() => {
        if (!historyData || historyData.length === 0) return [];

        // Sort chronologically for matching
        const sorted = [...historyData].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const trades: any[] = [];
        let pendingBuy: any = null;

        sorted.forEach(record => {
            if (record.signal === 'BUY' && !pendingBuy) {
                // Found a BUY signal, store it as pending
                pendingBuy = record;
            } else if (record.signal === 'SELL' && pendingBuy) {
                // Found a SELL signal with a pending BUY, create a trade pair
                const buyPrice = pendingBuy.close || pendingBuy.price;
                const sellPrice = record.close || record.price;
                const pnlAmount = sellPrice - buyPrice;
                const pnlPercent = ((pnlAmount / buyPrice) * 100).toFixed(2);

                trades.push({
                    buyDate: pendingBuy.date,
                    sellDate: record.date,
                    buyPrice: buyPrice,
                    sellPrice: sellPrice,
                    pnlPercent: parseFloat(pnlPercent),
                    pnlAmount: parseFloat(pnlAmount.toFixed(2)),
                    status: 'CLOSED'
                });

                // Reset pending buy to look for the next cycle
                pendingBuy = null;
            }
            // If we encounter a BUY while already having a pending BUY, or a SELL without a pending BUY, ignore it
        });

        // Handle Active/Open Position using LTP
        if (pendingBuy && stockDetails) {
            const currentPrice = stockDetails.price?.close || stockDetails.price || 0;
            if (currentPrice > 0) {
                const buyPrice = pendingBuy.close || pendingBuy.price;
                const pnlAmount = currentPrice - buyPrice;
                const pnlPercent = ((pnlAmount / buyPrice) * 100).toFixed(2);

                trades.push({
                    buyDate: pendingBuy.date,
                    sellDate: "Present",
                    buyPrice: buyPrice,
                    sellPrice: currentPrice,
                    pnlPercent: parseFloat(pnlPercent),
                    pnlAmount: parseFloat(pnlAmount.toFixed(2)),
                    status: 'OPEN'
                });
            }
        }

        // Return descending sell date (Present/Open trades first)
        return trades.sort((a, b) => {
            if (a.status === 'OPEN') return -1;
            if (b.status === 'OPEN') return 1;
            return new Date(b.sellDate).getTime() - new Date(a.sellDate).getTime();
        });
    }, [historyData, stockDetails]);

    const [historyPage, setHistoryPage] = useState(1);
    const [historyRowsPerPage, setHistoryRowsPerPage] = useState(10);

    // Reset pagination when symbol changes
    useEffect(() => {
        setHistoryPage(1);
    }, [selectedSymbol]);

    // Derived State: Paginated History Data
    const paginatedHistory = useMemo(() => {
        const start = (historyPage - 1) * historyRowsPerPage;
        const end = start + historyRowsPerPage;
        return historyData.slice(start, end);
    }, [historyData, historyPage, historyRowsPerPage]);

    const totalHistoryPages = Math.ceil(historyData.length / historyRowsPerPage);

    const handleViewAction = async (symbol: string) => {
        if (recStrategy === 'broker_accumulation' || recStrategy === 'smart_accumulated_crossover' || recStrategy === 'ichimoku_accumulation') {
            setSelectedSymbol(symbol);
            setHistoryModalOpen(true);
            setLoadingHistory(true);
            setHistoryData([]); // Clear previous data
            setStockDetails(null); // Clear previous details
            setHistoryPage(1); // Reset pagination

            try {
                let url = '';
                if (recStrategy === 'broker_accumulation') {
                    url = `/api/stocks/broker-accumulation-history/?symbol=${symbol}`;
                } else if (recStrategy === 'smart_accumulated_crossover') {
                    url = `/api/stocks/smart-accumulated-crossover-history/?symbol=${symbol}`;
                } else if (recStrategy === 'ichimoku_accumulation') {
                    url = `/api/stocks/ichimoku-accumulation-history/?symbol=${symbol}`;
                }

                // Fetch both History and Stock Details concurrently
                const [historyRes, detailsRes] = await Promise.all([
                    api.get(url, { params: { symbol } }),
                    api.get(`/api/stocks/details/${symbol}/`).catch(err => ({ data: null })) // Fail gracefully for details
                ]);

                // Handle History Response
                if (historyRes.data.history) {
                    setHistoryData(historyRes.data.history);
                    // Use backend-provided lightweight details if full details fail
                    if (!detailsRes.data) {
                        setStockDetails({
                            symbol: historyRes.data.symbol,
                            name: historyRes.data.name,
                            sector: historyRes.data.sector,
                            price: historyRes.data.current_price
                        });
                    }
                } else {
                    setHistoryData(Array.isArray(historyRes.data) ? historyRes.data : []);
                }

                // Handle Details Response
                if (detailsRes.data) {
                    setStockDetails(detailsRes.data);
                }

            } catch (error) {
                console.error("Failed to fetch data", error);
                setHistoryData([]);
                setStockDetails(null);
            } finally {
                setLoadingHistory(false);
            }
        } else {
            router.push(`/stock/${symbol}`);
        }
    };

    return (
        <DashboardLayout
            title="Whale Watch"
            subtitle="Track institutional accumulation and smart money signals"
        >
            {/* TradingView Chart Modal (90% layout for validation hub) */}
            <Dialog open={chartOpen} onOpenChange={setChartOpen}>
                <DialogContent
                    className="p-0 overflow-hidden flex flex-col bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-2xl rounded-2xl"
                    style={{ maxWidth: '90vw', width: '90vw', height: '90vh', maxHeight: '90vh' }}
                >
                    <DialogHeader className="sr-only">
                        <DialogTitle>Advanced Validation Hub - {selectedRec?.symbol}</DialogTitle>
                        <DialogDescription>Validate crossover events with local chart data</DialogDescription>
                    </DialogHeader>
                    {selectedRec && (
                        <>
                            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex flex-row items-center justify-between shrink-0">
                                <div className="flex items-center gap-4">
                                    <div className="flex flex-col">
                                        <h2 className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
                                            {selectedRec.symbol}
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${selectedRec.signal === 'BUY' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' : 'bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800'}`}>
                                                {selectedRec.signal} SIGNAL
                                            </span>
                                        </h2>
                                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Advanced Validation Hub</p>
                                    </div>

                                    <div className="h-8 w-[1px] bg-slate-200 dark:bg-slate-700 mx-2 hidden sm:block" />

                                    <div className="hidden sm:flex items-center gap-6">
                                        <div className="flex flex-col">
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Crossover Date</span>
                                            <span className="text-xs font-bold text-blue-600">{selectedRec.crossover_date}</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tighter">Crossover Price</span>
                                            <span className="text-xs font-bold text-slate-900 dark:text-slate-100">Rs. {selectedRec.crossover_price?.toLocaleString()}</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Current LTP</span>
                                            <span className="text-xs font-bold text-emerald-600">Rs. {selectedRec.close.toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex-1 w-full bg-white relative overflow-hidden">
                                <FullFeaturedChart
                                    symbol={selectedRec.symbol}
                                    crossoverDate={selectedRec.crossover_date}
                                    crossoverPrice={selectedRec.crossover_price}
                                    signal={selectedRec.signal}
                                />
                            </div>

                            <div className="px-6 py-3 bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between shrink-0">
                                <div className="flex items-center gap-4 py-1">
                                    <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-100 dark:border-blue-800">
                                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                                        <span className="text-[10px] font-bold text-blue-700 dark:text-blue-400">RSI: {selectedRec.rsi}</span>
                                    </div>
                                    <div className="flex items-center gap-2 px-3 py-1 bg-purple-50 dark:bg-purple-900/30 rounded-lg border border-purple-100 dark:border-purple-800">
                                        <div className="w-2 h-2 rounded-full bg-purple-500" />
                                        <span className="text-[10px] font-bold text-purple-700 dark:text-purple-400">MACD HIST: {selectedRec.macd_hist}</span>
                                    </div>
                                </div>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium hidden md:block">
                                    * Indicators are calculated on NEPSE adjusted prices. Validate crossover event on chart.
                                </p>
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {/* Standard Dialog for History */}
            <Dialog open={historyModalOpen} onOpenChange={setHistoryModalOpen}>
                <DialogContent
                    className="p-0 overflow-hidden flex flex-col bg-white border-none shadow-2xl rounded-xl"
                    style={{ maxWidth: '90vw', width: '90vw', height: '90vh', maxHeight: '90vh' }}
                >
                    <DialogHeader className="sr-only">
                        <DialogTitle>Stock Analysis - {selectedSymbol}</DialogTitle>
                        <DialogDescription>Detailed performance analysis and signal history</DialogDescription>
                    </DialogHeader>

                    {/* 1. HEADER AREA */}
                    <div className="relative group shrink-0 border-b border-slate-100 bg-white z-10">
                        {stockDetails ? (
                            <TerminalHeader
                                symbol={stockDetails.company?.symbol || stockDetails.fundamental?.ticker || selectedSymbol || ''}
                                name={stockDetails.company?.name || stockDetails.fundamental?.company_name || 'Loading...'}
                                sector={stockDetails.company?.sector || stockDetails.fundamental?.sector || 'Unknown'}
                                price={stockDetails.price?.close || 0}
                                change={stockDetails.price?.change || 0}
                                percentChange={stockDetails.price?.percent_change || 0}
                                onTrade={() => { }}
                                hideDetails={true}
                                hideActions={true}
                                signal={historyData[0]?.signal === 'BUY' || historyData[0]?.signal === 'SELL' ? historyData[0]?.signal : undefined}
                            />
                        ) : (
                            <div className="p-6 bg-slate-50 flex items-center justify-between">
                                <div className="space-y-1">
                                    <h2 className="text-2xl font-bold text-slate-900 tracking-tighter">{selectedSymbol}</h2>
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fetching analysis data...</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Custom Close Button */}
                        <div className="absolute top-4 right-6 z-[100]">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setHistoryModalOpen(false)}
                                className="h-9 w-9 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-colors"
                            >
                                <X size={20} />
                            </Button>
                        </div>
                    </div>

                    <div className="flex-1 overflow-hidden bg-slate-50/50 flex flex-col">
                        <Tabs defaultValue="performance" className="h-full flex flex-col">
                            <div className="px-6 pt-4 shrink-0">
                                <TabsList className="grid w-full grid-cols-2 max-w-[400px] h-9 bg-slate-200/50 dark:bg-slate-800/50 p-1 rounded-lg">
                                    <TabsTrigger
                                        value="performance"
                                        className="text-xs font-semibold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-slate-900 dark:data-[state=active]:text-slate-100 data-[state=active]:shadow-sm rounded-md transition-all"
                                    >
                                        <TrendingUp size={14} className="mr-2" />
                                        Analysis & Performance
                                    </TabsTrigger>
                                    <TabsTrigger
                                        value="history"
                                        className="text-xs font-semibold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-slate-900 dark:data-[state=active]:text-slate-100 data-[state=active]:shadow-sm rounded-md transition-all"
                                    >
                                        <Target size={14} className="mr-2" />
                                        Complete Signal Log
                                    </TabsTrigger>
                                </TabsList>
                            </div>

                            <TabsContent value="performance" className="flex-1 overflow-y-auto p-6 space-y-6 data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:zoom-in-95 duration-200">

                                {/* 3. TRADE PERFORMANCE TABLE */}
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-xs font-bold text-slate-500 flex items-center gap-2">
                                            <TrendingUp size={14} className="text-emerald-500" />
                                            Completed Trade Cycles (First Buy → First Sell)
                                        </h3>
                                        <Badge variant="secondary" className="bg-slate-100 text-slate-600 text-[10px] font-semibold">
                                            {completedTrades.length} Cycles Found
                                        </Badge>
                                    </div>

                                    <Card className="border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden bg-white dark:bg-slate-900 rounded-xl">
                                        {completedTrades.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center py-12 text-slate-400 space-y-2">
                                                <TrendingDown size={32} className="opacity-20" />
                                                <p className="text-sm font-medium">No completed trade cycles found.</p>
                                                <p className="text-xs text-slate-400 max-w-md text-center">
                                                    Buy signals must be followed by a Sell signal to complete a cycle.
                                                </p>
                                            </div>
                                        ) : (
                                            <Table>
                                                <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
                                                    <TableRow className="border-b border-slate-100 dark:border-slate-800 hover:bg-transparent">
                                                        <TableHead className="font-semibold text-xs text-slate-500 dark:text-slate-400 h-10 w-32">Buy Date</TableHead>
                                                        <TableHead className="font-semibold text-xs text-slate-500 dark:text-slate-400 h-10 w-32">Sell Date</TableHead>
                                                        <TableHead className="font-semibold text-xs text-slate-500 dark:text-slate-400 h-10 text-right">Entry Price</TableHead>
                                                        <TableHead className="font-semibold text-xs text-slate-500 dark:text-slate-400 h-10 text-right">Exit Price</TableHead>
                                                        <TableHead className="font-semibold text-xs text-slate-500 dark:text-slate-400 h-10 text-center">PnL %</TableHead>
                                                        <TableHead className="font-semibold text-xs text-slate-500 dark:text-slate-400 h-10 text-right pr-6">Profit/Loss</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {completedTrades.map((trade: any, i: number) => (
                                                        <TableRow key={i} className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 border-b border-slate-50 dark:border-slate-800 last:border-0 ${trade.status === 'OPEN' ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''}`}>
                                                            <TableCell className="font-mono text-xs text-slate-600 dark:text-slate-400">
                                                                {trade.buyDate}
                                                                {trade.status === 'OPEN' && <Badge className="ml-2 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 text-[9px] h-4 px-1 shadow-none">Active</Badge>}
                                                            </TableCell>
                                                            <TableCell className="font-mono text-xs text-slate-600 dark:text-slate-400">
                                                                {trade.sellDate === 'Present' ? (
                                                                    <span className="text-blue-600 dark:text-blue-400 font-bold uppercase text-[10px] tracking-wider">LTP (Unrealized)</span>
                                                                ) : trade.sellDate}
                                                            </TableCell>
                                                            <TableCell className="font-mono text-sm text-slate-700 dark:text-slate-300 font-medium text-right">
                                                                Rs. {trade.buyPrice?.toLocaleString()}
                                                            </TableCell>
                                                            <TableCell className="font-mono text-sm text-slate-900 dark:text-slate-100 font-medium text-right">
                                                                Rs. {trade.sellPrice?.toLocaleString()}
                                                            </TableCell>
                                                            <TableCell className="text-center">
                                                                <Badge className={`${trade.pnlPercent >= 0 ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-400 hover:bg-emerald-100' : 'bg-rose-100 dark:bg-rose-900/40 text-rose-800 dark:text-rose-400 hover:bg-rose-100'} border-none shadow-none font-bold text-xs px-2`}>
                                                                    {trade.pnlPercent >= 0 ? '+' : ''}{trade.pnlPercent}%
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell className={`text-right pr-6 font-mono text-sm font-bold ${trade.pnlAmount >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                                                {trade.pnlAmount >= 0 ? '+' : ''}{trade.pnlAmount?.toLocaleString()}
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        )}
                                    </Card>
                                </div>

                                {/* 2. FUNDAMENTALS & TECHNICALS ROW */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    <FundamentalBenchmarks fundamental={stockDetails?.fundamental} />
                                    <TechnicalDivergence technicalIndicators={stockDetails?.fundamental?.technical_indicators} />
                                </div>
                            </TabsContent>

                            <TabsContent value="history" className="flex-1 overflow-hidden p-6 pt-2 h-full flex flex-col data-[state=active]:animate-in data-[state=active]:fade-in-0 duration-300">
                                <Card className="border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col bg-white dark:bg-slate-900 mt-0 rounded-xl flex-1 overflow-hidden">
                                    <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Rows per page:</span>
                                            <select
                                                className="h-8 text-xs border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 px-2 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:focus:ring-slate-700 dark:text-slate-200"
                                                value={historyRowsPerPage}
                                                onChange={(e) => {
                                                    setHistoryRowsPerPage(Number(e.target.value));
                                                    setHistoryPage(1);
                                                }}
                                            >
                                                <option value={10}>10</option>
                                                <option value={20}>20</option>
                                                <option value={50}>50</option>
                                            </select>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium mr-2">
                                                Page {historyPage} of {totalHistoryPages || 1}
                                            </span>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-8 w-8 p-0 dark:border-slate-800 dark:bg-slate-900"
                                                onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                                                disabled={historyPage === 1}
                                            >
                                                <ChevronLeft size={16} />
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-8 w-8 p-0 dark:border-slate-800 dark:bg-slate-900"
                                                onClick={() => setHistoryPage(p => Math.min(totalHistoryPages, p + 1))}
                                                disabled={historyPage >= totalHistoryPages}
                                            >
                                                <ChevronRight size={16} />
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="flex-1 overflow-y-auto min-h-0">
                                        {historyData.length === 0 && !loadingHistory ? (
                                            <div className="p-12 text-center text-slate-400 text-sm">No raw signals found.</div>
                                        ) : (
                                            <Table>
                                                <TableHeader className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 z-10 shadow-sm">
                                                    <TableRow className="border-b border-slate-200 dark:border-slate-700 hover:bg-transparent">
                                                        <TableHead className="font-semibold text-xs text-slate-500 dark:text-slate-400 h-10 w-32 py-3 pl-6">Date</TableHead>
                                                        <TableHead className="font-semibold text-xs text-slate-500 dark:text-slate-400 h-10 w-24 py-3">Signal</TableHead>
                                                        <TableHead className="font-semibold text-xs text-slate-500 dark:text-slate-400 h-10 w-32 py-3 text-right">Price</TableHead>
                                                        <TableHead className="font-semibold text-xs text-slate-500 dark:text-slate-400 h-10 w-32 py-3 pl-8">Strength</TableHead>
                                                        <TableHead className="font-semibold text-xs text-slate-500 dark:text-slate-400 h-10 py-3">Intelligence Reasoning</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {paginatedHistory.map((row, i) => (
                                                        <TableRow key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 last:border-0 group h-12">
                                                            <TableCell className="font-mono text-xs text-slate-500 dark:text-slate-400 pl-6">{row.date}</TableCell>
                                                            <TableCell>
                                                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${row.signal === 'BUY' ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800' : 'bg-rose-50 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-800'
                                                                    }`}>
                                                                    {row.signal}
                                                                </span>
                                                            </TableCell>
                                                            <TableCell className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300 text-right">
                                                                Rs. {row.close?.toLocaleString() || row.price?.toLocaleString()}
                                                            </TableCell>
                                                            <TableCell className="pl-8">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-12 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                                                        <div
                                                                            className={`h-full rounded-full ${row.strength > 70 ? 'bg-blue-500' : 'bg-slate-400 dark:bg-slate-600'}`}
                                                                            style={{ width: `${row.strength}%` }}
                                                                        ></div>
                                                                    </div>
                                                                    <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">{row.strength}%</span>
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="max-w-md">
                                                                <div className="flex flex-wrap gap-2 py-1">
                                                                    {row.reason?.split(';').map((r: string, idx: number) => {
                                                                        const trimmed = r.trim();
                                                                        if (!trimmed) return null;

                                                                        // Colors for different reasoning types or just variety
                                                                        const colors = [
                                                                            'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200/50 dark:border-blue-800',
                                                                            'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-800',
                                                                            'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200/50 dark:border-slate-700',
                                                                            'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 border-indigo-200/50 dark:border-indigo-800',
                                                                            'bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 border-violet-200/50 dark:border-violet-800',
                                                                            'bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 border-sky-200/50 dark:border-sky-800',
                                                                        ];
                                                                        const colorClass = colors[trimmed.length % colors.length];

                                                                        return (
                                                                            <span
                                                                                key={idx}
                                                                                className={cn(
                                                                                    "px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-tight border shadow-sm transition-all hover:bg-white dark:hover:bg-slate-800",
                                                                                    colorClass
                                                                                )}
                                                                            >
                                                                                {trimmed}
                                                                            </span>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        )}
                                    </div>
                                </Card>
                            </TabsContent>
                        </Tabs>
                    </div>
                </DialogContent>
            </Dialog >

            <div className="space-y-6">
                <Card className="border-none shadow-sm bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
                    <div className="p-4 flex flex-col md:flex-row gap-4 items-end md:items-center justify-between border-b border-gray-100 dark:border-slate-800">
                        <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
                            <div className="space-y-1.5 min-w-[200px]">
                                <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                    <Target size={12} /> Strategy Model
                                </label>
                                <select
                                    value={recStrategy}
                                    onChange={(e) => setRecStrategy(e.target.value)}
                                    className="w-full h-9 rounded-md border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus:border-blue-500 dark:text-slate-200"
                                >
                                    {STRATEGIES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1.5 min-w-[150px]">
                                <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                    <Filter size={12} /> Sector
                                </label>
                                <select
                                    value={recSector}
                                    onChange={(e) => setRecSector(e.target.value)}
                                    className="w-full h-9 rounded-md border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus:border-blue-500 dark:text-slate-200"
                                >
                                    {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="flex items-end gap-2 w-full md:w-auto">
                            <div className="space-y-1.5 flex-1 md:flex-none min-w-[200px]">
                                <label className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                    <Search size={12} /> Search Symbol
                                </label>
                                <div className="relative group flex items-center">
                                    <Search size={14} className="absolute left-3.5 text-gray-400 dark:text-slate-500 group-focus-within:text-blue-500 transition-colors z-10" />
                                    <input
                                        type="text"
                                        placeholder="Search symbol..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-full h-10 rounded-xl border border-gray-200 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-900/50 hover:bg-white dark:hover:bg-slate-800 focus:bg-white dark:focus:bg-slate-800 pl-10 pr-10 py-2 text-sm shadow-sm transition-all focus-visible:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 placeholder:text-gray-400/80 dark:text-slate-200"
                                    />
                                    {searchTerm && (
                                        <button
                                            onClick={() => setSearchTerm('')}
                                            className="absolute right-3 p-1 rounded-full text-gray-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all active:scale-90 z-10"
                                            title="Clear search"
                                        >
                                            <X size={12} strokeWidth={3} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            <Button
                                variant="outline"
                                size="icon"
                                onClick={fetchRecommendations}
                                disabled={loadingRecs}
                                className="h-9 w-9 shrink-0 dark:border-slate-800 dark:bg-slate-900/50"
                                title="Refresh Scan"
                            >
                                <RefreshCw size={16} className={loadingRecs ? 'animate-spin' : ''} />
                            </Button>
                        </div>
                    </div>

                    <div className="p-0">
                        {loadingRecs ? (
                            <div className="flex flex-col items-center justify-center py-20 text-gray-500 animate-pulse">
                                <Target size={48} className="text-gray-200 mb-4" />
                                <p>Scanning market data for valid signals...</p>
                            </div>
                        ) : recommendations.length === 0 ? (
                            <div className="text-center py-20 text-gray-500">
                                <p>No signals found matching criteria.</p>
                                <p className="text-xs mt-1">Try changing the strategy or checking back later.</p>
                            </div>
                        ) : (
                            <Table>
                                <TableHeader className="bg-gray-50/50 dark:bg-slate-800/50">
                                    <TableRow className="border-b dark:border-slate-800">
                                        <TableHead className="dark:text-slate-400">Symbol</TableHead>
                                        <TableHead className="dark:text-slate-400">Signal</TableHead>
                                        <TableHead className="dark:text-slate-400">Crossover Date</TableHead>
                                        <TableHead className="dark:text-slate-400">Crossover Price</TableHead>
                                        <TableHead className="dark:text-slate-400">Strength</TableHead>
                                        <TableHead className="dark:text-slate-400">LTP</TableHead>
                                        <TableHead className="w-[30%] dark:text-slate-400">Reason</TableHead>
                                        <TableHead className="text-right dark:text-slate-400">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {recommendations
                                        .filter(rec => rec.symbol.toLowerCase().includes(searchTerm.toLowerCase()))
                                        .map((rec) => (
                                            <TableRow key={rec.symbol} className="hover:bg-gray-50/50 dark:hover:bg-slate-800/50 border-b dark:border-slate-800">
                                                <TableCell className="font-medium text-gray-900 dark:text-slate-100">
                                                    <span>{rec.symbol}</span>
                                                </TableCell>
                                                <TableCell>
                                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${rec.signal === 'BUY'
                                                        ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800'
                                                        : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800'
                                                        }`}>
                                                        {rec.signal === 'BUY' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                                        {rec.signal}
                                                    </span>
                                                </TableCell>
                                                <TableCell>
                                                    {rec.crossover_date ? (
                                                        <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded w-fit italic">
                                                            {rec.crossover_date}
                                                        </span>
                                                    ) : (
                                                        <span className="text-gray-300 dark:text-slate-700">-</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    {rec.crossover_price ? (
                                                        <span className="text-[11px] font-mono text-gray-700 dark:text-slate-300">Rs. {rec.crossover_price.toLocaleString()}</span>
                                                    ) : (
                                                        <span className="text-gray-300 dark:text-slate-700">-</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <div className="h-1.5 w-16 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                                            <div
                                                                className={`h-full rounded-full ${rec.signal === 'BUY' ? 'bg-green-500' : 'bg-red-500'}`}
                                                                style={{ width: `${rec.strength}%` }}
                                                            />
                                                        </div>
                                                        <span className="text-xs font-medium text-gray-600 dark:text-slate-400">{rec.strength}%</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="font-mono text-gray-700 dark:text-slate-300">Rs. {rec.close.toLocaleString()}</TableCell>
                                                <TableCell className="text-sm text-gray-500 dark:text-slate-400">
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-slate-600 dark:text-slate-300">{rec.reason}</span>
                                                        {(rec.rsi !== undefined || rec.macd_hist !== undefined) && (
                                                            <div className="flex items-center gap-3 text-[10px] text-gray-400 dark:text-slate-500 font-medium">
                                                                {rec.rsi !== undefined && (
                                                                    <span className="flex items-center gap-1">
                                                                        <span className="w-1 h-1 rounded-full bg-blue-400" />
                                                                        RSI: {rec.rsi}
                                                                    </span>
                                                                )}
                                                                {rec.macd_hist !== undefined && (
                                                                    <span className="flex items-center gap-1">
                                                                        <span className="w-1 h-1 rounded-full bg-purple-400" />
                                                                        MACD: {rec.macd_hist}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {recStrategy === 'smart_accumulated_crossover' ? (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-bold flex items-center gap-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                                            onClick={() => {
                                                                setSelectedRec(rec);
                                                                setChartOpen(true);
                                                            }}
                                                        >
                                                            <TrendingUp size={14} />
                                                            View Chart Hub
                                                        </Button>
                                                    ) : (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                                            onClick={() => handleViewAction(rec.symbol)}
                                                        >
                                                            {recStrategy === 'broker_accumulation' ? 'View History' : 'View Chart'}
                                                        </Button>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                </TableBody>
                            </Table>
                        )}
                    </div>
                </Card>
            </div>
        </DashboardLayout>
    );
}
