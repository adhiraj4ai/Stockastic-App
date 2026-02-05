'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Trash2, Plus, TrendingUp, TrendingDown, DollarSign, Wallet, Users, FolderPlus, ShieldAlert, CheckCircle2, Activity, Pencil } from 'lucide-react';
import TransactionModal, { PortfolioAccount } from '@/components/TransactionModal';
import { CreateAccountDialog } from '@/components/CreateAccountDialog';
import StockLink from '@/components/StockLink';
import { Wand2, Target, Check, ChevronDown, ChevronUp, Radio, PieChart as PieIcon, BarChart as BarIcon, Grid3X3, Zap, Search, ArrowUpDown, ChevronLeft, ChevronRight, ArrowUp } from 'lucide-react';
import { ExitStrategyDialog } from '@/components/ExitStrategyDialog';
import { CompanySelect } from '@/components/CompanySelect';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Eye, PlusCircle, X } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, Legend } from 'recharts';

interface WatchlistItem {
    id: number;
    ticker: string;
    target_price?: number;
    notes?: string;
    current_price?: number;
    day_change?: number;
    day_change_percent?: number;
    added_at: string;
    sector?: string;
    rsi?: number;
    roc?: number;
    signals?: {
        latest_date: string;
        summary: 'BUY' | 'SELL' | 'HOLD' | 'NEUTRAL' | 'MIXED';
        details: Array<{
            signal: string;
            strategy_name: string;
            strategy_description: string;
        }>;
    };
}

interface PortfolioItem {
    id: number;
    ticker: string;
    quantity: number;
    buy_price: number; // This is the WACC
    wacc: number;
    current_price: number;
    current_value: number;
    investment_value: number;
    gain_loss: number;
    gain_loss_percent: number;
    day_gain_loss: number;
    sector?: string;
    volatility?: number;
    signals?: {
        latest_date: string;
        summary: 'BUY' | 'SELL' | 'HOLD' | 'NEUTRAL' | 'MIXED';
        details: Array<{
            signal: string;
            strategy_name: string;
            strategy_description: string;
        }>;
    };
    stop_loss_price?: number;
    target_price?: number;
    target_price_2?: number;
    target_price_3?: number;
    thesis?: string;
    strategy_type?: string;
    value_yield?: number;
}

export const dynamic = 'force-dynamic';

function PortfolioContent() {
    const [items, setItems] = useState<PortfolioItem[]>([]);
    const [accounts, setAccounts] = useState<PortfolioAccount[]>([]);
    const [selectedAccount, setSelectedAccount] = useState<string>('all');
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [promoteTicker, setPromoteTicker] = useState<string>('');
    const [isCreateAccountOpen, setIsCreateAccountOpen] = useState(false);
    const [isExitPlanDialogOpen, setIsExitPlanDialogOpen] = useState(false);
    const [selectedPortfolioItem, setSelectedPortfolioItem] = useState<PortfolioItem | null>(null);
    const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
    const [isWatchlistModalOpen, setIsWatchlistModalOpen] = useState(false);
    const [selectedWatchlistItem, setSelectedWatchlistItem] = useState<WatchlistItem | null>(null);
    const [watchlistForm, setWatchlistForm] = useState({
        ticker: '',
        target_price: '',
        notes: ''
    });
    const [searchQuery, setSearchQuery] = useState('');
    const [watchlistSearchQuery, setWatchlistSearchQuery] = useState('');
    const [watchlistCurrentPage, setWatchlistCurrentPage] = useState(1);
    const [currentPage, setCurrentPage] = useState(1);
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({
        key: 'investment_value',
        direction: 'desc'
    });
    const pageSize = 10;
    const [mounted, setMounted] = useState(false);
    const router = useRouter();
    const searchParams = useSearchParams();
    const activeTab = searchParams.get('tab') || 'holdings';

    const fetchAccounts = async () => {
        try {
            const response = await api.get('/api/stocks/accounts/');
            setAccounts(response.data);
        } catch (err) {
            console.error('Failed to fetch accounts', err);
        }
    };

    const fetchWatchlist = async () => {
        try {
            const response = await api.get('/api/stocks/watchlist/');
            console.log('Watchlist Data:', response.data);
            setWatchlist(response.data);
        } catch (err) {
            console.error('Failed to fetch watchlist', err);
        }
    };

    const addWatchlistItem = async () => {
        if (!watchlistForm.ticker) return;
        try {
            await api.post('/api/stocks/watchlist/', {
                ticker: watchlistForm.ticker.toUpperCase(),
                target_price: watchlistForm.target_price ? Number(watchlistForm.target_price) : null,
                notes: watchlistForm.notes || null
            });
            setIsWatchlistModalOpen(false);
            setWatchlistForm({ ticker: '', target_price: '', notes: '' });
            fetchWatchlist();
        } catch (err) {
            console.error('Failed to add to watchlist', err);
        }
    };

    const updateWatchlistItem = async () => {
        if (!selectedWatchlistItem) return;
        try {
            await api.patch(`/api/stocks/watchlist/${selectedWatchlistItem.id}/`, {
                target_price: watchlistForm.target_price ? Number(watchlistForm.target_price) : null,
                notes: watchlistForm.notes || null
            });
            setIsWatchlistModalOpen(false);
            setSelectedWatchlistItem(null);
            setWatchlistForm({ ticker: '', target_price: '', notes: '' });
            fetchWatchlist();
        } catch (err) {
            console.error('Failed to update watchlist item', err);
        }
    };

    const handleEditWatchlist = (item: WatchlistItem) => {
        setSelectedWatchlistItem(item);
        setWatchlistForm({
            ticker: item.ticker,
            target_price: item.target_price?.toString() || '',
            notes: item.notes || ''
        });
        setIsWatchlistModalOpen(true);
    };

    const handlePromoteToPortfolio = (ticker: string) => {
        setPromoteTicker(ticker);
        setIsModalOpen(true);
    };

    const removeWatchlistItem = async (id: number) => {
        if (!confirm('Are you sure you want to remove this ticker from your surveillance?')) return;
        try {
            await api.delete(`/api/stocks/watchlist/${id}/`);
            fetchWatchlist();
        } catch (err) {
            console.error('Failed to remove from watchlist', err);
        }
    };

    const fetchPortfolio = async () => {
        setLoading(true);
        try {
            // Build query
            let query = '';
            if (selectedAccount !== 'all') {
                query = `?account=${selectedAccount}`;
            }

            const response = await api.get(`/api/stocks/portfolio/${query}`);
            console.log('Portfolio Data:', response.data);
            setItems(response.data);
        } catch (err) {
            console.error('Failed to fetch portfolio', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        setMounted(true);
        fetchAccounts();
        fetchWatchlist();
    }, []);

    useEffect(() => {
        fetchPortfolio();
    }, [router, selectedAccount]);

    // Aggregate Items for "All Accounts" view
    const displayedItems = useMemo(() => {
        const processItem = (item: PortfolioItem) => ({
            ...item,
            value_yield: item.current_value > 0 ? (Number(item.gain_loss) / Number(item.current_value)) * 100 : 0
        });

        if (selectedAccount !== 'all') return items.map(processItem);

        // Group by ticker
        const grouped: { [key: string]: PortfolioItem } = {};
        items.forEach(item => {
            if (!grouped[item.ticker]) {
                grouped[item.ticker] = processItem({ ...item });
            } else {
                const existing = grouped[item.ticker];

                const newQty = existing.quantity + item.quantity;
                const newInvestment = Number(existing.investment_value) + Number(item.investment_value);
                const newCurrentValue = Number(existing.current_value) + Number(item.current_value);
                const newGainLoss = Number(existing.gain_loss) + Number(item.gain_loss);
                const newDayGainLoss = Number(existing.day_gain_loss) + Number(item.day_gain_loss);

                const newWacc = newQty > 0 ? newInvestment / newQty : 0;
                const newGainLossPercent = newInvestment > 0 ? (newGainLoss / newInvestment * 100) : 0;

                grouped[item.ticker] = processItem({
                    ...existing,
                    quantity: newQty,
                    investment_value: newInvestment,
                    current_value: newCurrentValue,
                    gain_loss: newGainLoss,
                    day_gain_loss: newDayGainLoss,
                    wacc: newWacc,
                    buy_price: newWacc,
                    gain_loss_percent: newGainLossPercent
                });
            }
        });

        return Object.values(grouped);
    }, [items, selectedAccount]);

    // Calculate Summary
    const totalInvestment = displayedItems.reduce((acc, item) => acc + Number(item.investment_value), 0);
    const totalCurrentValue = displayedItems.reduce((acc, item) => acc + Number(item.current_value), 0);
    const totalGainLoss = totalCurrentValue - totalInvestment;
    const totalGainLossPercent = totalInvestment ? (totalGainLoss / totalInvestment * 100) : 0;
    const totalDayGainLoss = displayedItems.reduce((acc, item) => acc + Number(item.day_gain_loss), 0);

    const stats = useMemo(() => {
        const profit = displayedItems.filter(i => Number(i.gain_loss) > 0).length;
        const loss = displayedItems.filter(i => Number(i.gain_loss) < 0).length;
        return { profit, loss };
    }, [displayedItems]);

    const bestPerformer = useMemo(() => {
        if (displayedItems.length === 0) return null;
        return [...displayedItems].sort((a, b) => b.gain_loss_percent - a.gain_loss_percent)[0];
    }, [displayedItems]);

    const sectorData = useMemo(() => {
        const sectors: Record<string, { name: string; value: number; pnl: number }> = {};
        displayedItems.forEach(item => {
            const s = item.sector || 'Others';
            if (!sectors[s]) sectors[s] = { name: s, value: 0, pnl: 0 };
            sectors[s].value += Number(item.current_value);
            sectors[s].pnl += Number(item.gain_loss);
        });
        return Object.values(sectors).sort((a, b) => b.value - a.value);
    }, [displayedItems]);

    const sortedAndFilteredItems = useMemo(() => {
        let result = displayedItems.filter(item =>
            item.ticker.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (item.sector && item.sector.toLowerCase().includes(searchQuery.toLowerCase()))
        );

        if (sortConfig.key) {
            result.sort((a, b) => {
                let aValue = a[sortConfig.key as keyof PortfolioItem] ?? 0;
                let bValue = b[sortConfig.key as keyof PortfolioItem] ?? 0;

                // Cast to Number for numeric keys to ensure correct sorting
                if (typeof aValue !== 'string' || !isNaN(Number(aValue))) {
                    aValue = Number(aValue);
                    bValue = Number(bValue);
                }

                if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return result;
    }, [displayedItems, searchQuery, sortConfig]);

    const paginatedItems = useMemo(() => {
        const startIndex = (currentPage - 1) * pageSize;
        return sortedAndFilteredItems.slice(startIndex, startIndex + pageSize);
    }, [sortedAndFilteredItems, currentPage]);

    const totalPages = Math.ceil(sortedAndFilteredItems.length / pageSize);

    // Watchlist Logic
    const sortedAndFilteredWatchlist = useMemo(() => {
        let result = watchlist.filter(item =>
            item.ticker.toLowerCase().includes(watchlistSearchQuery.toLowerCase()) ||
            (item.sector && item.sector.toLowerCase().includes(watchlistSearchQuery.toLowerCase()))
        );

        // Default sort by ticker for watchlist
        return result.sort((a, b) => a.ticker.localeCompare(b.ticker));
    }, [watchlist, watchlistSearchQuery]);

    const paginatedWatchlist = useMemo(() => {
        const startIndex = (watchlistCurrentPage - 1) * pageSize;
        return sortedAndFilteredWatchlist.slice(startIndex, startIndex + pageSize);
    }, [sortedAndFilteredWatchlist, watchlistCurrentPage]);

    const watchlistTotalPages = Math.ceil(sortedAndFilteredWatchlist.length / pageSize);

    const handleSort = (key: string) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
        }));
        setCurrentPage(1); // Reset to first page on sort
    };

    const CHART_COLORS = ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#6366F1', '#F43F5E'];

    if (!mounted) return null;

    return (
        <DashboardLayout
            title={activeTab === 'watchlist' ? 'Strategic Watchlist' : 'My Portfolio'}
            subtitle={activeTab === 'watchlist' ? 'Monitor and track potential entries' : 'Track and manage your investments'}
        >
            <div className="space-y-6">

                {/* Header & Actions - Only for Holdings */}
                {activeTab === 'holdings' && (
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900 dark:text-slate-100">My Portfolio</h1>
                            <p className="text-gray-500 dark:text-gray-400">Track and manage your investments</p>
                        </div>

                        <div className="flex items-center gap-3">
                            {/* Account Selector */}
                            <div className="relative">
                                <select
                                    value={selectedAccount}
                                    onChange={(e) => setSelectedAccount(e.target.value)}
                                    className="appearance-none bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 text-gray-700 dark:text-slate-300 py-2.5 pl-4 pr-10 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium shadow-sm cursor-pointer"
                                >
                                    <option value="all">All Accounts</option>
                                    <option disabled>──────────</option>
                                    {accounts.map(acc => (
                                        <option key={acc.id} value={acc.id}>{acc.name}</option>
                                    ))}
                                </select>
                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                                    <Users className="h-4 w-4" />
                                </div>
                            </div>

                            <button
                                onClick={() => setIsCreateAccountOpen(true)}
                                className="bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800 text-gray-700 dark:text-slate-300 p-2.5 rounded-lg shadow-sm transition-all"
                                title="Create New Portfolio Account"
                            >
                                <FolderPlus className="h-5 w-5" />
                            </button>

                            <button
                                onClick={() => {
                                    if (accounts.length === 0) {
                                        alert("You need to create a portfolio account first!");
                                        setIsCreateAccountOpen(true);
                                    } else {
                                        setIsModalOpen(true);
                                    }
                                }}
                                className="flex items-center gap-2 bg-black hover:bg-gray-800 text-white px-5 py-2.5 rounded-lg font-medium transition-all shadow-lg active:scale-95"
                            >
                                <Plus className="h-5 w-5" />
                                <span className="hidden sm:inline">Add Transaction</span>
                            </button>

                            <button
                                onClick={() => router.push(`/portfolio/optimize?account=${selectedAccount}`)}
                                disabled={displayedItems.length === 0}
                                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-lg font-medium transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Advanced Portfolio Optimization"
                            >
                                <Wand2 className="h-5 w-5" />
                                <span className="hidden sm:inline">Optimize</span>
                            </button>
                        </div>
                    </div>

                )}

                {/* Summary Cards - Only for Holdings */}
                {activeTab === 'holdings' && (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <Card className="bg-white dark:bg-slate-900 border-blue-100 dark:border-blue-900/30 shadow-sm hover:shadow-md transition-shadow">
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">Capital Deployed</CardTitle>
                                <Wallet className="h-4 w-4 text-blue-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-gray-900 dark:text-slate-100">
                                    Rs. {totalInvestment.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </div>
                                <div className="text-xs text-gray-400 dark:text-gray-500 mt-1 uppercase font-bold tracking-wider">
                                    Across {displayedItems.length} Holdings
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-white dark:bg-slate-900 border-purple-100 dark:border-purple-900/30 shadow-sm hover:shadow-md transition-shadow">
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">Portfolio Value</CardTitle>
                                <DollarSign className="h-4 w-4 text-purple-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-gray-900 dark:text-slate-100">
                                    Rs. {totalCurrentValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </div>
                                <div className="text-xs text-gray-400 dark:text-gray-500 mt-1 uppercase font-bold tracking-wider">
                                    Real-time Valuation
                                </div>
                            </CardContent>
                        </Card>

                        <Card className={`bg-white dark:bg-slate-900 shadow-sm hover:shadow-md transition-shadow ${totalGainLoss >= 0 ? "border-green-100 dark:border-green-900/30" : "border-red-100 dark:border-red-900/30"}`}>
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Returns</CardTitle>
                                {totalGainLoss >= 0 ? <TrendingUp className="h-4 w-4 text-green-500" /> : <TrendingDown className="h-4 w-4 text-red-500" />}
                            </CardHeader>
                            <CardContent>
                                <div className="flex flex-col">
                                    <div className={`text-2xl font-bold ${totalGainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        Rs. {Math.abs(totalGainLoss).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${totalGainLoss >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                            {totalGainLoss >= 0 ? '+' : '-'}{Math.abs(totalGainLossPercent).toFixed(2)}%
                                        </span>
                                        {bestPerformer && (
                                            <span className="text-[9px] text-gray-400 font-medium">
                                                Top: <span className={totalGainLoss >= 0 ? "text-green-600 font-bold" : "text-red-600 font-bold"}>{bestPerformer.ticker}</span>
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className={`bg-white dark:bg-slate-900 shadow-sm hover:shadow-md transition-shadow ${totalDayGainLoss >= 0 ? "border-green-100 dark:border-green-900/30" : "border-red-100 dark:border-red-900/30"}`}>
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">Session Swing</CardTitle>
                                <Zap className={`h-4 w-4 ${totalDayGainLoss >= 0 ? 'text-amber-500' : 'text-red-400'}`} />
                            </CardHeader>
                            <CardContent>
                                <div className={`text-2xl font-bold ${totalDayGainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    Rs. {Math.abs(totalDayGainLoss).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </div>
                                <div className="text-xs text-gray-400 dark:text-gray-500 mt-1 uppercase font-bold tracking-wider">
                                    Intraday Movement
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* Holdings Table - MOVED UP - Only for Holdings */}
                {activeTab === 'holdings' && (
                    <Card className="shadow-lg border-blue-50/50">
                        <CardHeader className="py-4 px-6 border-b border-gray-50">
                            <CardTitle className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="flex items-center gap-2">
                                    <Grid3X3 className="h-5 w-5 text-gray-400" />
                                    <span>Strategic Holdings</span>
                                    <div className="flex items-center gap-1.5">
                                        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-50 text-[10px] px-2 py-0 h-5 font-black">
                                            #{stats.profit} PROFIT
                                        </Badge>
                                        <Badge className="bg-rose-50 text-rose-700 border-rose-100 hover:bg-rose-50 text-[10px] px-2 py-0 h-5 font-black">
                                            #{stats.loss} LOSS
                                        </Badge>
                                    </div>
                                    {selectedAccount !== 'all' && <span className="text-gray-400 ml-2 text-sm font-normal">(Account: {accounts.find(a => a.id.toString() == selectedAccount)?.name})</span>}
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                                        <Input
                                            placeholder="Search items..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="pl-9 h-9 w-64 text-xs font-medium bg-gray-50/50 border-gray-200 focus:bg-white transition-all"
                                        />
                                    </div>
                                    {loading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900"></div>}
                                </div>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            {displayedItems.length === 0 && !loading ? (
                                <div className="text-center py-10 text-gray-500 flex flex-col items-center gap-2">
                                    <Wallet className="h-10 w-10 text-gray-200" />
                                    <p>No stocks in portfolio. Add a transaction to get started.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-gray-50/50 hover:bg-gray-50/50">
                                                <TableHead className="w-[50px] font-bold text-gray-900 py-4 px-6 text-center">SN</TableHead>
                                                <TableHead className="font-bold text-gray-900 cursor-pointer select-none py-4" onClick={() => handleSort('ticker')}>
                                                    <div className="flex items-center gap-1">Ticker <ArrowUpDown size={12} className="opacity-50" /></div>
                                                </TableHead>
                                                <TableHead className="text-right font-bold text-gray-900 cursor-pointer select-none py-4" onClick={() => handleSort('quantity')}>
                                                    <div className="flex items-center justify-end gap-1">Quantity <ArrowUpDown size={12} className="opacity-50" /></div>
                                                </TableHead>
                                                <TableHead className="text-right font-bold text-gray-900 cursor-pointer select-none py-4" onClick={() => handleSort('wacc')}>
                                                    <div className="flex items-center justify-end gap-1">WACC (Rs.) <ArrowUpDown size={12} className="opacity-50" /></div>
                                                </TableHead>
                                                <TableHead className="text-right font-bold text-gray-900 cursor-pointer select-none py-4" onClick={() => handleSort('current_price')}>
                                                    <div className="flex items-center justify-end gap-1">LTP (Rs.) <ArrowUpDown size={12} className="opacity-50" /></div>
                                                </TableHead>
                                                <TableHead className="text-right font-bold text-gray-900 cursor-pointer select-none py-4" onClick={() => handleSort('current_value')}>
                                                    <div className="flex items-center justify-end gap-1">Total Value (Rs.) <ArrowUpDown size={12} className="opacity-50" /></div>
                                                </TableHead>
                                                <TableHead className="text-right font-bold text-gray-900 cursor-pointer select-none py-4" onClick={() => handleSort('gain_loss')}>
                                                    <div className="flex items-center justify-end gap-1">Profit/Loss <ArrowUpDown size={12} className="opacity-50" /></div>
                                                </TableHead>
                                                <TableHead className="text-right font-bold text-gray-900 cursor-pointer select-none py-4" onClick={() => handleSort('value_yield')}>
                                                    <div className="flex items-center justify-end gap-1" title="Profit to Total Value Ratio">Value Yield <ArrowUpDown size={12} className="opacity-50" /></div>
                                                </TableHead>
                                                <TableHead className="text-right font-bold text-gray-900 cursor-pointer select-none py-4" onClick={() => handleSort('day_gain_loss')}>
                                                    <div className="flex items-center justify-end gap-1">Today's P/L <ArrowUpDown size={12} className="opacity-50" /></div>
                                                </TableHead>
                                                <TableHead className="text-right font-bold text-gray-900">Signal</TableHead>
                                                <TableHead className="w-[50px]"></TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {paginatedItems.map((item, idx) => {
                                                const pl = Number(item.gain_loss);
                                                const isPos = pl >= 0;
                                                const dayPl = Number(item.day_gain_loss);
                                                const isDayPos = dayPl >= 0;

                                                const hasStrategy = !!item.stop_loss_price;
                                                const isUnderwater = Number(item.current_price) < Number(item.wacc || item.buy_price);

                                                // Calculate R/R for row display
                                                let rrRatio = 'N/A';
                                                if (item.stop_loss_price && item.target_price && item.current_price) {
                                                    const risk = Number(item.current_price) - Number(item.stop_loss_price);
                                                    const reward = Number(item.target_price) - Number(item.current_price);
                                                    if (risk > 0) rrRatio = `1:${(reward / risk).toFixed(1)}`;
                                                }

                                                return (
                                                    <React.Fragment key={`${item.ticker}-${idx}`}>
                                                        <TableRow
                                                            className={`transition-all duration-300 cursor-pointer border-l-4 ${isExitPlanDialogOpen && selectedPortfolioItem?.ticker === item.ticker ? 'bg-blue-50/30 border-l-blue-500' : isUnderwater ? 'border-l-red-500/50 hover:bg-red-50/10' : hasStrategy ? 'border-l-green-500/50 hover:bg-gray-50' : 'border-l-transparent hover:bg-gray-50'}`}
                                                            onClick={() => {
                                                                setSelectedPortfolioItem(item);
                                                                setIsExitPlanDialogOpen(true);
                                                            }}
                                                        >
                                                            <TableCell className="text-center font-bold text-gray-400 text-sm py-4 px-6">
                                                                {(currentPage - 1) * pageSize + idx + 1}
                                                            </TableCell>
                                                            <TableCell className="font-semibold py-4">
                                                                <div className="flex flex-col gap-1.5">
                                                                    <div className="flex items-center gap-2">
                                                                        <StockLink ticker={item.ticker} />
                                                                        {isUnderwater && (
                                                                            <Badge variant="secondary" className="bg-red-50 text-red-600 border-red-100 text-[9px] px-1.5 h-4 flex items-center gap-1">
                                                                                UNDERWATER
                                                                            </Badge>
                                                                        )}
                                                                        {hasStrategy && (
                                                                            <Badge variant="secondary" className="bg-blue-50 text-blue-600 border-blue-100 text-[9px] px-1.5 h-4 flex items-center gap-1 animate-pulse">
                                                                                <Radio className="h-2 w-2" /> ACTIVE
                                                                            </Badge>
                                                                        )}
                                                                    </div>
                                                                    {(item.stop_loss_price || item.target_price) && (
                                                                        <div className="flex flex-wrap gap-1">
                                                                            {item.stop_loss_price && <span className="text-xs bg-red-50 text-red-600 px-1.5 py-0.5 rounded border border-red-100 font-bold uppercase tracking-tighter shadow-sm">SL: {Number(item.stop_loss_price).toFixed(0)}</span>}
                                                                            {item.target_price && <span className="text-xs bg-green-50 text-green-600 px-1.5 py-0.5 rounded border border-green-100 font-bold uppercase tracking-tighter shadow-sm">TP: {Number(item.target_price).toFixed(0)}</span>}
                                                                            {rrRatio !== 'N/A' && <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100 font-bold uppercase tracking-tighter shadow-sm">R/R: {rrRatio}</span>}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="text-right text-gray-600 font-medium py-4">{item.quantity}</TableCell>
                                                            <TableCell className="text-right text-gray-600 font-medium py-4">{Number(item.wacc || item.buy_price).toFixed(2)}</TableCell>
                                                            <TableCell className="text-right text-gray-900 font-bold py-4">{item.current_price}</TableCell>
                                                            <TableCell className="text-right font-black text-gray-900 py-4">{Number(item.current_value).toLocaleString(undefined, { maximumFractionDigits: 0 })}</TableCell>
                                                            <TableCell className={`text-right ${isPos ? 'text-green-600' : 'text-red-600'} py-4`}>
                                                                <div className="font-black text-base">
                                                                    {isPos ? '+' : ''}{pl.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                                </div>
                                                                <div className={`text-xs font-black uppercase tracking-tighter ${isPos ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'} px-1 rounded inline-block mt-0.5`}>
                                                                    {Number(item.gain_loss_percent).toFixed(2)}%
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="text-right py-4">
                                                                <div className="font-bold text-gray-600 text-sm text-right">
                                                                    {(item.value_yield || 0).toFixed(1)}%
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className={`text-right font-black ${isDayPos ? 'text-green-600' : 'text-red-600'} py-4`}>
                                                                {isDayPos ? '+' : ''}{dayPl.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                            </TableCell>
                                                            <TableCell className="text-right py-4 pr-6">
                                                                <div className="flex justify-end">
                                                                    <button
                                                                        className={`p-2 rounded-lg transition-all ${isExitPlanDialogOpen && selectedPortfolioItem?.ticker === item.ticker ? 'bg-blue-600 text-white shadow-xl rotate-0' : 'text-gray-300 hover:text-blue-600 hover:bg-blue-50 rotate-[-45deg] hover:rotate-0'}`}
                                                                    >
                                                                        <Target size={18} />
                                                                    </button>
                                                                </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    </React.Fragment>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}

                            {/* Exit Strategy Dialog */}
                            <ExitStrategyDialog
                                open={isExitPlanDialogOpen}
                                onOpenChange={setIsExitPlanDialogOpen}
                                portfolioItem={selectedPortfolioItem}
                                onSave={() => {
                                    fetchPortfolio();
                                    setIsExitPlanDialogOpen(false);
                                }}
                            />

                            {/* Pagination Controls */}
                            {totalPages > 1 && (
                                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-6 px-6 border-t border-gray-50">
                                    <div className="text-xs font-semibold tracking-widest">
                                        Displaying <span className="text-gray-900">{(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, sortedAndFilteredItems.length)}</span> of <span className="text-gray-900">{sortedAndFilteredItems.length}</span> holdings
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                            disabled={currentPage === 1}
                                            className="p-2 rounded-lg border border-gray-100 hover:bg-gray-50 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                                        >
                                            <ChevronLeft size={16} />
                                        </button>

                                        <div className="flex items-center gap-1">
                                            {[...Array(totalPages)].map((_, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => setCurrentPage(i + 1)}
                                                    className={`h-8 w-8 rounded-lg text-xs font-bold transition-all ${currentPage === i + 1 ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'text-gray-500 hover:bg-gray-100'}`}
                                                >
                                                    {i + 1}
                                                </button>
                                            ))}
                                        </div>

                                        <button
                                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                            disabled={currentPage === totalPages}
                                            className="p-2 rounded-lg border border-gray-100 hover:bg-gray-50 disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                                        >
                                            <ChevronRight size={16} />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}

                {/* Visual Analytics & Heatmap Section - Only for Holdings */}
                {activeTab === 'holdings' && displayedItems.length > 0 && (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        {/* Sector Analysis */}
                        <Card className="lg:col-span-8 shadow-sm">
                            <CardHeader className="flex flex-row items-center justify-between">
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <BarIcon className="h-5 w-5 text-blue-500" />
                                    Portfolio Visualizer
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 h-[300px]">
                                    {/* Pie Chart: Allocation */}
                                    <div className="relative">
                                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                            <span className="text-xs text-gray-400 font-bold uppercase">Diversification</span>
                                            <span className="text-lg font-black text-gray-800">{sectorData.length} Sectors</span>
                                        </div>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie
                                                    data={sectorData}
                                                    cx="50%"
                                                    cy="50%"
                                                    innerRadius={60}
                                                    outerRadius={80}
                                                    paddingAngle={5}
                                                    dataKey="value"
                                                >
                                                    {sectorData.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} stroke="rgba(255,255,255,0.2)" />
                                                    ))}
                                                </Pie>
                                                <RechartsTooltip />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>

                                    {/* Bar Chart: Performance by Sector */}
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={sectorData} layout="vertical" margin={{ left: 20, right: 20 }}>
                                            <XAxis type="number" hide />
                                            <YAxis
                                                dataKey="name"
                                                type="category"
                                                axisLine={false}
                                                tickLine={false}
                                                tick={{ fontSize: 13, fontWeight: 700, fill: '#6B7280' }}
                                                width={80}
                                            />
                                            <RechartsTooltip
                                                cursor={{ fill: '#F3F4F6' }}
                                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                            />
                                            <Bar
                                                dataKey="pnl"
                                                radius={[0, 4, 4, 0]}
                                                barSize={20}
                                            >
                                                {sectorData.map((entry, index) => (
                                                    <Cell
                                                        key={`cell-${index}`}
                                                        fill={entry.pnl >= 0 ? '#10B981' : '#EF4444'}
                                                    />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>

                                {/* Custom Legend */}
                                <div className="flex flex-wrap gap-4 mt-6 pt-6 border-t border-gray-50">
                                    {sectorData.map((s, i) => (
                                        <div key={s.name} className="flex items-center gap-2">
                                            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                                            <span className="text-sm font-bold text-gray-500 uppercase tracking-tighter">
                                                {s.name} ({((s.value / totalCurrentValue) * 100).toFixed(0)}%)
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Performance Heatmap (Grid) */}
                        <Card className="lg:col-span-4 shadow-sm overflow-hidden">
                            <CardHeader>
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <PieIcon className="h-5 w-5 text-purple-500" />
                                    PnL Heatmap
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                                    {displayedItems.map((item) => {
                                        const pnlP = item.gain_loss_percent;
                                        let bgColor = 'bg-gray-100';
                                        if (pnlP > 20) bgColor = 'bg-green-600';
                                        else if (pnlP > 10) bgColor = 'bg-green-500';
                                        else if (pnlP > 0) bgColor = 'bg-green-400';
                                        else if (pnlP > -10) bgColor = 'bg-red-400';
                                        else if (pnlP > -20) bgColor = 'bg-red-500';
                                        else bgColor = 'bg-red-600';

                                        return (
                                            <div
                                                key={item.id}
                                                className={`aspect-square ${bgColor} rounded-md flex flex-col items-center justify-center text-white shadow-inner group relative cursor-help transition-transform hover:scale-105 hover:z-20`}
                                            >
                                                <span className="text-sm font-black">{item.ticker}</span>
                                                <span className="text-xs font-bold opacity-80">{Number(pnlP).toFixed(0)}%</span>

                                                {/* Tooltip on Hover */}
                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-32 bg-gray-900 text-white p-2 rounded text-xs opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity shadow-2xl z-30">
                                                    <p className="font-black border-b border-gray-700 pb-1 mb-1">{item.ticker}</p>
                                                    <p className="flex justify-between">Profit: <span>Rs. {Number(item.gain_loss).toFixed(0)}</span></p>
                                                    <p className="flex justify-between">Value: <span>Rs. {Number(item.current_value).toFixed(0)}</span></p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="mt-6 flex items-center justify-between text-xs font-black uppercase tracking-widest text-gray-400">
                                    <span>Bearish</span>
                                    <div className="flex gap-1">
                                        {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className={`h-2 w-2 rounded-sm ${i <= 3 ? 'bg-red-' + (i * 200) : 'bg-green-' + ((7 - i) * 200)}`} />)}
                                    </div>
                                    <span>Bullish</span>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* Risk Management Section - MOVED DOWN - Only for Holdings */}
                {activeTab === 'holdings' && displayedItems.length > 0 && (
                    <Card className="bg-slate-50/50 border-slate-200 border-dashed">
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-lg text-slate-700">
                                <ShieldAlert className="h-5 w-5 text-slate-500" />
                                Portfolio Health Scan
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {/* Sector Concentration Risk List */}
                                <div>
                                    <h4 className="text-xs font-black mb-4 tracking-[0.2em] flex items-center gap-2">
                                        Allocation Alerts
                                    </h4>
                                    <div className="space-y-2">
                                        {Object.entries(
                                            displayedItems.reduce((acc, item) => {
                                                const sector = item.sector || 'Unknown';
                                                acc[sector] = (acc[sector] || 0) + Number(item.current_value);
                                                return acc;
                                            }, {} as Record<string, number>)
                                        )
                                            .sort(([, a], [, b]) => b - a)
                                            .map(([sector, value]) => {
                                                const percent = (value / totalCurrentValue) * 100;
                                                return (
                                                    <div key={sector}>
                                                        <div className="flex justify-between text-xs mb-1.5 p-2 bg-white rounded border border-slate-100">
                                                            <span className="font-bold text-slate-600">{sector}</span>
                                                            <div className="flex items-center gap-2">
                                                                <span className={`text-xs font-black ${percent > 40 ? "text-red-500" : "text-slate-400"}`}>
                                                                    {percent.toFixed(1)}%
                                                                </span>
                                                                <div className="w-16 h-1 bg-slate-100 rounded-full overflow-hidden">
                                                                    <div
                                                                        className={`h-full rounded-full ${percent > 40 ? 'bg-red-500' : 'bg-blue-400'}`}
                                                                        style={{ width: `${percent}%` }}
                                                                    />
                                                                </div>
                                                            </div>
                                                        </div>
                                                        {percent > 40 && <p className="text-xs font-bold text-red-500 pl-2">⚠️ Diversification alert: Overexposed to {sector}.</p>}
                                                    </div>
                                                );
                                            })}
                                    </div>
                                </div>

                                {/* Concentration & Volatility Risks */}
                                <div className="space-y-6">
                                    <div>
                                        <h4 className="text-xs font-black tracking-[0.2em]">Holdings Concentration</h4>
                                        <ul className="space-y-2">
                                            {displayedItems
                                                .filter(item => (Number(item.current_value) / totalCurrentValue) > 0.20)
                                                .map(item => (
                                                    <li key={item.ticker} className="flex items-center justify-between text-xs bg-red-50/50 p-2.5 rounded-lg border border-red-100 text-red-800">
                                                        <span className="flex items-center gap-2 font-bold uppercase tracking-tight">
                                                            <ShieldAlert className="h-3.5 w-3.5" />
                                                            {item.ticker} Oversized
                                                        </span>
                                                        <span className="font-black bg-red-100 px-2 py-0.5 rounded-full">{((Number(item.current_value) / totalCurrentValue) * 100).toFixed(1)}%</span>
                                                    </li>
                                                ))}
                                            {displayedItems.every(item => (Number(item.current_value) / totalCurrentValue) <= 0.20) && (
                                                <li className="text-xs font-bold text-emerald-600 bg-emerald-50/50 p-3 rounded-lg border border-emerald-100 flex items-center gap-2">
                                                    <CheckCircle2 className="h-4 w-4" />
                                                    Portfolio capital is healthy and well-distributed.
                                                </li>
                                            )}
                                        </ul>
                                    </div>

                                    <div>
                                        <h4 className="text-xs font-black text-slate-400 mb-4 uppercase tracking-[0.2em]">Volatility Monitoring</h4>
                                        <div className="flex flex-wrap gap-2">
                                            {displayedItems
                                                .filter(item => (item.volatility || 0) > 40)
                                                .sort((a, b) => (b.volatility || 0) - (a.volatility || 0))
                                                .map(item => (
                                                    <div key={item.ticker} className="flex items-center gap-1.5 bg-white text-slate-700 px-3 py-1.5 rounded-lg text-xs font-black border border-slate-200 shadow-sm">
                                                        <Activity className="h-3 w-3" />
                                                        {item.ticker} <span className="text-slate-400 opacity-60">/</span> {item.volatility?.toFixed(1)}% VOL
                                                    </div>
                                                ))}
                                            {!displayedItems.some(i => (i.volatility || 0) > 40) && (
                                                <span className="text-xs text-slate-400 italic">Position stability confirmed across all holdings.</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Strategic Watchlist Section - Only for Watchlist tab */}
                {activeTab === 'watchlist' && (
                    <Card className="shadow-lg border-blue-50/50">
                        <CardHeader className="border-b border-gray-50 pb-2">
                            <CardTitle className="text-xl font-black text-slate-900 tracking-tight flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                                        <Input
                                            placeholder="Quick filter..."
                                            value={watchlistSearchQuery}
                                            onChange={(e) => {
                                                setWatchlistSearchQuery(e.target.value);
                                                setWatchlistCurrentPage(1);
                                            }}
                                            className="pl-9 h-9 w-48 text-xs font-medium bg-gray-50/50 border-gray-200 focus:bg-white transition-all"
                                        />
                                    </div>
                                    <button
                                        onClick={() => {
                                            setSelectedWatchlistItem(null);
                                            setWatchlistForm({ ticker: '', target_price: '', notes: '' });
                                            setIsWatchlistModalOpen(true);
                                        }}
                                        className="h-9 px-4 flex items-center gap-1 bg-gray-900 text-white rounded-md text-[10px] font-black hover:bg-black transition-all uppercase tracking-widest shadow-md whitespace-nowrap"
                                    >
                                        <Plus size={14} /> Add New Surveillance
                                    </button>
                                </div>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0">
                            {paginatedWatchlist.length === 0 ? (
                                <div className="text-center py-20 text-gray-500 flex flex-col items-center gap-2">
                                    <Eye className="h-10 w-10 text-gray-200" />
                                    <p className="text-sm font-medium italic">No active surveillance. Add tickers to monitor entry levels.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-gray-50/50 hover:bg-gray-50/50">
                                                <TableHead className="font-bold text-gray-900">Ticker</TableHead>
                                                <TableHead className="text-right font-bold text-gray-900">LTP</TableHead>
                                                <TableHead className="text-right font-bold text-gray-900">Day Change</TableHead>
                                                <TableHead className="text-right font-bold text-gray-900">RSI (14)</TableHead>
                                                <TableHead className="text-right font-bold text-gray-900">ROC (14)</TableHead>
                                                <TableHead className="text-right font-bold text-gray-900">Signal</TableHead>
                                                <TableHead className="text-right font-bold text-gray-900">Signal Proximity</TableHead>
                                                <TableHead className="text-right font-bold text-gray-900">Tracked Since</TableHead>
                                                <TableHead className="w-[80px] pr-6"></TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {paginatedWatchlist.map((item) => {
                                                const dayChange = Number(item.day_change);
                                                const isPos = dayChange >= 0;

                                                // Calculate proximity if target_price exists
                                                const proximity = item.target_price && item.current_price
                                                    ? ((Number(item.current_price) - item.target_price) / item.target_price) * 100
                                                    : null;

                                                return (
                                                    <TableRow key={item.id} className="hover:bg-blue-50/30 border-b border-gray-50 last:border-0 group transition-all">
                                                        <TableCell className="py-4">
                                                            <div className="flex flex-col">
                                                                <StockLink ticker={item.ticker} className="font-black text-slate-900 text-sm" />
                                                                {item.sector && (
                                                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
                                                                        {item.sector}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-right py-4">
                                                            <div className="font-black text-slate-900">
                                                                {item.current_price ? `Rs. ${Number(item.current_price).toLocaleString(undefined, { minimumFractionDigits: 1 })}` : 'N/A'}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-right py-4">
                                                            <div className={`flex flex-col items-end`}>
                                                                <div className={`font-black flex items-center gap-1 ${isPos ? 'text-green-600' : 'text-red-600'}`}>
                                                                    {isPos ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                                                    {isPos ? '+' : ''}{dayChange.toFixed(1)}
                                                                </div>
                                                                <div className={`text-[10px] font-black uppercase tracking-tighter px-1 rounded ${isPos ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                                                    {item.day_change_percent}%
                                                                </div>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-right py-4">
                                                            {item.rsi !== null && item.rsi !== undefined ? (
                                                                <div className="flex flex-col items-end">
                                                                    <div className={`font-black ${Number(item.rsi) >= 70 ? 'text-orange-600' : Number(item.rsi) <= 30 ? 'text-green-600' : 'text-blue-600'}`}>
                                                                        {Number(item.rsi).toFixed(1)}
                                                                    </div>
                                                                    <div className={`text-[10px] font-black uppercase tracking-tighter px-1 rounded ${Number(item.rsi) >= 70 ? 'bg-orange-50 text-orange-700' : Number(item.rsi) <= 30 ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'}`}>
                                                                        {Number(item.rsi) >= 70 ? 'Overbought' : Number(item.rsi) <= 30 ? 'Oversold' : 'Neutral'}
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <span className="text-gray-300">--</span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right py-4">
                                                            {item.roc !== null && item.roc !== undefined ? (
                                                                <div className={`font-black ${Number(item.roc) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                                    {Number(item.roc) >= 0 ? '+' : ''}{Number(item.roc).toFixed(1)}%
                                                                </div>
                                                            ) : (
                                                                <span className="text-gray-300">--</span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right py-4">
                                                            {item.signals ? (
                                                                <div className="flex justify-end group/signal relative">
                                                                    <Badge
                                                                        variant="outline"
                                                                        className={`
                                                                            ${item.signals.summary === 'BUY' ? 'bg-green-50 text-green-700 border-green-200' : ''}
                                                                            ${item.signals.summary === 'SELL' ? 'bg-red-50 text-red-700 border-red-200' : ''}
                                                                            ${item.signals.summary === 'HOLD' ? 'bg-slate-50 text-slate-700 border-slate-200' : ''}
                                                                            ${item.signals.summary === 'NEUTRAL' ? 'bg-gray-50 text-gray-500 border-gray-200' : ''}
                                                                            ${item.signals.summary === 'MIXED' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' : ''}
                                                                            cursor-help
                                                                        `}
                                                                    >
                                                                        {item.signals.summary}
                                                                    </Badge>
                                                                    {/* Tooltip */}
                                                                    <div className="absolute right-0 top-full mt-2 w-64 bg-slate-900 text-white text-xs rounded-lg p-3 opacity-0 group-hover/signal:opacity-100 pointer-events-none transition-opacity z-50 shadow-xl">
                                                                        <div className="font-bold border-b border-slate-700 pb-1 mb-2 flex justify-between">
                                                                            <span>Signals ({item.signals.latest_date})</span>
                                                                        </div>
                                                                        <div className="space-y-1.5">
                                                                            {item.signals.details.map((s, i) => (
                                                                                <div key={i} className="flex justify-between items-start gap-2">
                                                                                    <span className="text-slate-300">{s.strategy_name}</span>
                                                                                    <span className={`font-bold ${s.signal === 'BUY' ? 'text-green-400' :
                                                                                        s.signal === 'SELL' ? 'text-red-400' : 'text-slate-400'
                                                                                        }`}>{s.signal}</span>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <span className="text-gray-300">--</span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right py-4">
                                                            {proximity !== null ? (
                                                                <div className="flex flex-col items-end">
                                                                    <div className={`text-xs font-bold ${Math.abs(proximity) < 2 ? 'text-emerald-600' : 'text-gray-500'}`}>
                                                                        {Math.abs(proximity).toFixed(1)}% {proximity < 0 ? 'BELOW' : 'ABOVE'}
                                                                    </div>
                                                                    <div className="w-24 h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
                                                                        <div
                                                                            className={`h-full transition-all duration-500 ${proximity < 0 ? 'bg-emerald-500' : 'bg-amber-400'}`}
                                                                            style={{ width: `${Math.min(100, Math.max(5, 100 - Math.abs(proximity)))}%` }}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <span className="text-gray-300">--</span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right py-4">
                                                            <div className="flex flex-col items-end">
                                                                <div className="text-[10px] font-black text-slate-900 uppercase">
                                                                    {new Date(item.added_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                                                </div>
                                                                {item.notes && (
                                                                    <div className="text-[9px] font-bold text-blue-600 uppercase tracking-tighter mt-0.5 max-w-[120px] truncate">
                                                                        {item.notes}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="w-[80px] pr-6 text-right">
                                                            <div className="flex items-center justify-end gap-2 text-right">
                                                                <button
                                                                    onClick={() => handlePromoteToPortfolio(item.ticker)}
                                                                    className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors opacity-0 group-hover:opacity-100"
                                                                    title="Promote to Portfolio (Buy)"
                                                                >
                                                                    <FolderPlus size={18} />
                                                                </button>
                                                                <button
                                                                    onClick={() => handleEditWatchlist(item)}
                                                                    className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors opacity-0 group-hover:opacity-100"
                                                                    title="Edit Strategy"
                                                                >
                                                                    <Wand2 size={18} />
                                                                </button>
                                                                <button
                                                                    onClick={() => removeWatchlistItem(item.id)}
                                                                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors opacity-0 group-hover:opacity-100"
                                                                    title="Remove surveillance"
                                                                >
                                                                    <X size={18} />
                                                                </button>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}

                            {/* Watchlist Pagination */}
                            {watchlistTotalPages > 1 && (
                                <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-50 pb-4">
                                    <div className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                                        Monitoring <span className="text-gray-900">{sortedAndFilteredWatchlist.length}</span> key tickers
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setWatchlistCurrentPage(p => Math.max(1, p - 1))}
                                            disabled={watchlistCurrentPage === 1}
                                            className="p-2 rounded-lg border border-gray-100 hover:bg-gray-50 disabled:opacity-20 transition-all font-black text-gray-600"
                                        >
                                            <ChevronLeft size={16} />
                                        </button>
                                        <span className="text-xs font-black px-4 py-2 bg-gray-900 text-white rounded-lg shadow-lg">
                                            {watchlistCurrentPage} / {watchlistTotalPages}
                                        </span>
                                        <button
                                            onClick={() => setWatchlistCurrentPage(p => Math.min(watchlistTotalPages, p + 1))}
                                            disabled={watchlistCurrentPage === watchlistTotalPages}
                                            className="p-2 rounded-lg border border-gray-100 hover:bg-gray-50 disabled:opacity-20 transition-all font-black text-gray-600"
                                        >
                                            <ChevronRight size={16} />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                )}

                {/* Account Creation Dialog */}
                <CreateAccountDialog
                    isOpen={isCreateAccountOpen}
                    onOpenChange={setIsCreateAccountOpen}
                    onSuccess={fetchAccounts}
                />

                {/* Transaction Modal */}
                <TransactionModal
                    isOpen={isModalOpen}
                    onClose={() => {
                        setIsModalOpen(false);
                        setPromoteTicker('');
                    }}
                    onSuccess={() => {
                        fetchPortfolio();
                        fetchAccounts();
                    }}
                    defaultTicker={promoteTicker}
                    accounts={accounts}
                />

                {/* Optimized Dialog Removed */}

                {/* Exit Strategy Dialog Removed - Now Inline */}

            </div>
            {/* Watchlist Management Modal */}
            <Dialog open={isWatchlistModalOpen} onOpenChange={setIsWatchlistModalOpen}>
                <DialogContent className="sm:max-w-[425px] overflow-hidden p-0 border-none shadow-2xl">
                    <DialogHeader className="p-6 pb-0">
                        <DialogTitle className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                            <div className="p-2 bg-blue-50 rounded-lg">
                                <Eye className="h-5 w-5 text-blue-600" />
                            </div>
                            {selectedWatchlistItem ? 'Edit Surveillance' : 'New Surveillance'}
                        </DialogTitle>
                        <DialogDescription className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
                            {selectedWatchlistItem ? `Updating strategy for ${selectedWatchlistItem.ticker}` : 'Target elite entries for your portfolio'}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="p-6 space-y-4">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 tracking-widest ml-1">Symbol</label>
                            {selectedWatchlistItem ? (
                                <div className="h-12 flex items-center px-4 bg-slate-50 border border-slate-100 rounded-xl font-medium text-lg text-slate-900">
                                    {selectedWatchlistItem.ticker}
                                </div>
                            ) : (
                                <CompanySelect
                                    value={watchlistForm.ticker}
                                    onChange={(val) => setWatchlistForm({ ...watchlistForm, ticker: val })}
                                    className="h-12 bg-white border-blue-100 font-medium text-lg"
                                />
                            )}
                        </div>

                        <div className="grid grid-cols-1 gap-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 tracking-widest ml-1">Target Entry Price (Rs.)</label>
                                <div className="relative">
                                    <Target className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500" />
                                    <Input
                                        placeholder="0.00"
                                        type="number"
                                        value={watchlistForm.target_price}
                                        onChange={(e) => setWatchlistForm({ ...watchlistForm, target_price: e.target.value })}
                                        className="pl-10 h-12 bg-white border-blue-50 font-black text-slate-900 text-lg focus:ring-2 focus:ring-blue-100 placeholder:text-slate-300"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 tracking-widest ml-1">Strategic Notes</label>
                            <textarea
                                placeholder="Why follow this? Entry thesis..."
                                value={watchlistForm.notes}
                                onChange={(e) => setWatchlistForm({ ...watchlistForm, notes: e.target.value })}
                                className="w-full min-h-[100px] p-3 rounded-xl border border-blue-50 bg-white font-bold text-sm text-slate-900 placeholder:text-slate-300 focus:ring-2 focus:ring-blue-100 focus:outline-none transition-all"
                            />
                        </div>
                    </div>

                    <DialogFooter className="p-6 pt-2 bg-slate-50/50">
                        <div className="flex w-full gap-3">
                            <button
                                onClick={() => setIsWatchlistModalOpen(false)}
                                className="flex-1 h-12 rounded-xl border border-slate-200 bg-white text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all text-slate-500"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={selectedWatchlistItem ? updateWatchlistItem : addWatchlistItem}
                                className="flex-[2] h-12 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-lg flex items-center justify-center gap-2 group"
                            >
                                {selectedWatchlistItem ? (
                                    <>Update Strategy <Target size={14} className="group-hover:scale-125 transition-transform" /></>
                                ) : (
                                    <>Start Surveillance <Plus size={14} className="group-hover:rotate-90 transition-transform" /></>
                                )}
                            </button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </DashboardLayout >
    );
}

export default function PortfolioPage() {
    return (
        <React.Suspense fallback={<div className="flex h-screen items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" /></div>}>
            <PortfolioContent />
        </React.Suspense>
    );
}
