'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trash2, Plus, TrendingUp, TrendingDown, DollarSign, Wallet, Users, FolderPlus, ShieldAlert, CheckCircle2, Activity } from 'lucide-react';
import TransactionModal, { PortfolioAccount } from '@/components/TransactionModal';
import { CreateAccountDialog } from '@/components/CreateAccountDialog';
import StockLink from '@/components/StockLink';
import { Wand2, Target, ChevronDown, ChevronUp, Radio, PieChart as PieIcon, BarChart as BarIcon, Grid3X3, Zap } from 'lucide-react';
import { InlineExitPlan } from '@/components/InlineExitPlan';
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
    stop_loss_price?: number;
    target_price?: number;
    target_price_2?: number;
    target_price_3?: number;
    thesis?: string;
    strategy_type?: string;
}

export default function PortfolioPage() {
    const [items, setItems] = useState<PortfolioItem[]>([]);
    const [accounts, setAccounts] = useState<PortfolioAccount[]>([]);
    const [selectedAccount, setSelectedAccount] = useState<string>('all');
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isCreateAccountOpen, setIsCreateAccountOpen] = useState(false);
    const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
    const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
    const [newWatchlistTicker, setNewWatchlistTicker] = useState('');
    const [mounted, setMounted] = useState(false);
    const router = useRouter();

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
            setWatchlist(response.data);
        } catch (err) {
            console.error('Failed to fetch watchlist', err);
        }
    };

    const addWatchlistItem = async () => {
        if (!newWatchlistTicker) return;
        try {
            await api.post('/api/stocks/watchlist/', { ticker: newWatchlistTicker.toUpperCase() });
            setNewWatchlistTicker('');
            fetchWatchlist();
        } catch (err) {
            console.error('Failed to add to watchlist', err);
        }
    };

    const removeWatchlistItem = async (id: number) => {
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
        if (selectedAccount !== 'all') return items;

        // Group by ticker
        const grouped: { [key: string]: PortfolioItem } = {};
        items.forEach(item => {
            if (!grouped[item.ticker]) {
                // Clone to avoid mutating state directly
                grouped[item.ticker] = { ...item };
            } else {
                const existing = grouped[item.ticker];

                // Accumulate values
                const newQty = existing.quantity + item.quantity;
                const newInvestment = Number(existing.investment_value) + Number(item.investment_value);
                const newCurrentValue = Number(existing.current_value) + Number(item.current_value);
                const newGainLoss = Number(existing.gain_loss) + Number(item.gain_loss);
                const newDayGainLoss = Number(existing.day_gain_loss) + Number(item.day_gain_loss);

                // Recalculate WACC for the combined group
                const newWacc = newQty > 0 ? newInvestment / newQty : 0;
                const newGainLossPercent = newInvestment > 0 ? (newGainLoss / newInvestment * 100) : 0;

                grouped[item.ticker] = {
                    ...existing,
                    quantity: newQty,
                    investment_value: newInvestment,
                    current_value: newCurrentValue,
                    gain_loss: newGainLoss,
                    day_gain_loss: newDayGainLoss,
                    wacc: newWacc,
                    buy_price: newWacc,
                    gain_loss_percent: newGainLossPercent
                };
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

    const CHART_COLORS = ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#6366F1', '#F43F5E'];

    if (!mounted) return null;

    return (
        <DashboardLayout>
            <div className="space-y-6">

                {/* Header & Actions */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">My Portfolio</h1>
                        <p className="text-gray-500">Track and manage your investments</p>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Account Selector */}
                        <div className="relative">
                            <select
                                value={selectedAccount}
                                onChange={(e) => setSelectedAccount(e.target.value)}
                                className="appearance-none bg-white border border-gray-300 text-gray-700 py-2.5 pl-4 pr-10 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium shadow-sm cursor-pointer"
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
                            className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 p-2.5 rounded-lg shadow-sm transition-all"
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
                            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-medium transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Advanced Portfolio Optimization"
                        >
                            <Wand2 className="h-5 w-5" />
                            <span className="hidden sm:inline">Optimize</span>
                        </button>
                    </div>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <Card className="bg-white border-blue-100 shadow-sm hover:shadow-md transition-shadow">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-gray-500">Capital Deployed</CardTitle>
                            <Wallet className="h-4 w-4 text-blue-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-gray-900">
                                Rs. {totalInvestment.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </div>
                            <div className="text-[10px] text-gray-400 mt-1 uppercase font-bold tracking-wider">
                                Across {displayedItems.length} Holdings
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-white border-purple-100 shadow-sm hover:shadow-md transition-shadow">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-gray-500">Portfolio Value</CardTitle>
                            <DollarSign className="h-4 w-4 text-purple-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-gray-900">
                                Rs. {totalCurrentValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </div>
                            <div className="text-[10px] text-gray-400 mt-1 uppercase font-bold tracking-wider italic">
                                Real-time Valuation
                            </div>
                        </CardContent>
                    </Card>

                    <Card className={totalGainLoss >= 0 ? "border-green-100 shadow-sm hover:shadow-md transition-shadow" : "border-red-100 shadow-sm hover:shadow-md transition-shadow"}>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-gray-500">Total Returns</CardTitle>
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
                                            Top: <span className="text-green-600 font-bold">{bestPerformer.ticker}</span>
                                        </span>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className={totalDayGainLoss >= 0 ? "border-green-100 shadow-sm bg-green-50/20 hover:shadow-md transition-shadow" : "border-red-100 shadow-sm bg-red-50/20 hover:shadow-md transition-shadow"}>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-gray-500">Session Swing</CardTitle>
                            <Zap className={`h-4 w-4 ${totalDayGainLoss >= 0 ? 'text-amber-500' : 'text-red-400'}`} />
                        </CardHeader>
                        <CardContent>
                            <div className={`text-2xl font-bold ${totalDayGainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                Rs. {Math.abs(totalDayGainLoss).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </div>
                            <div className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                                <Activity className="h-3 w-3" /> Intraday Movement
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Holdings Table - MOVED UP */}
                <Card className="shadow-lg border-blue-50/50">
                    <CardHeader className="border-b border-gray-50 pb-4">
                        <CardTitle className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Grid3X3 className="h-5 w-5 text-gray-400" />
                                <span>Strategic Holdings {selectedAccount !== 'all' && <span className="text-gray-400 ml-2 text-sm font-normal">(Account: {accounts.find(a => a.id.toString() == selectedAccount)?.name})</span>}</span>
                            </div>
                            {loading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900"></div>}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6">
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
                                            <TableHead className="font-bold text-gray-900">Ticker</TableHead>
                                            <TableHead className="text-right font-bold text-gray-900">Quantity</TableHead>
                                            <TableHead className="text-right font-bold text-gray-900">WACC (Rs.)</TableHead>
                                            <TableHead className="text-right font-bold text-gray-900">LTP (Rs.)</TableHead>
                                            <TableHead className="text-right font-bold text-gray-900">Total Value (Rs.)</TableHead>
                                            <TableHead className="text-right font-bold text-gray-900">Profit/Loss (Rs.)</TableHead>
                                            <TableHead className="text-right font-bold text-gray-900">Today's P/L (Rs.)</TableHead>
                                            <TableHead className="w-[80px]"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {displayedItems.map((item, idx) => {
                                            const pl = Number(item.gain_loss);
                                            const isPos = pl >= 0;
                                            const dayPl = Number(item.day_gain_loss);
                                            const isDayPos = dayPl >= 0;

                                            const isExpanded = expandedTicker === item.ticker;
                                            const hasStrategy = !!item.stop_loss_price;

                                            // Calculate R/R for row display
                                            let rrRatio = 'N/A';
                                            if (item.stop_loss_price && item.target_price && item.current_price) {
                                                const risk = Number(item.current_price) - Number(item.stop_loss_price);
                                                const reward = Number(item.target_price) - Number(item.current_price);
                                                if (risk > 0) rrRatio = (reward / risk).toFixed(1);
                                            }

                                            return (
                                                <React.Fragment key={`${item.ticker}-${idx}`}>
                                                    <TableRow
                                                        className={`transition-all duration-300 cursor-pointer border-l-4 ${isExpanded ? 'bg-blue-50/30 border-l-blue-500' : hasStrategy ? 'border-l-green-500/50 hover:bg-gray-50' : 'border-l-transparent hover:bg-gray-50'}`}
                                                        onClick={() => setExpandedTicker(isExpanded ? null : item.ticker)}
                                                    >
                                                        <TableCell className="font-semibold py-5">
                                                            <div className="flex flex-col gap-1.5">
                                                                <div className="flex items-center gap-2">
                                                                    <StockLink ticker={item.ticker} />
                                                                    {hasStrategy && (
                                                                        <Badge variant="secondary" className="bg-blue-50 text-blue-600 border-blue-100 text-[9px] px-1.5 h-4 flex items-center gap-1 animate-pulse">
                                                                            <Radio className="h-2 w-2" /> ACTIVE
                                                                        </Badge>
                                                                    )}
                                                                </div>
                                                                {(item.stop_loss_price || item.target_price) && (
                                                                    <div className="flex flex-wrap gap-1">
                                                                        {item.stop_loss_price && <span className="text-[10px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded border border-red-100 font-bold uppercase tracking-tighter shadow-sm">SL: {Number(item.stop_loss_price).toFixed(0)}</span>}
                                                                        {item.target_price && <span className="text-[10px] bg-green-50 text-green-600 px-1.5 py-0.5 rounded border border-green-100 font-bold uppercase tracking-tighter shadow-sm">TP: {Number(item.target_price).toFixed(0)}</span>}
                                                                        {rrRatio !== 'N/A' && <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100 font-bold uppercase tracking-tighter shadow-sm">R/R: {rrRatio}</span>}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-right text-gray-600 font-medium">{item.quantity}</TableCell>
                                                        <TableCell className="text-right text-gray-600 font-medium">{Number(item.wacc || item.buy_price).toFixed(2)}</TableCell>
                                                        <TableCell className="text-right text-gray-900 font-bold">{item.current_price}</TableCell>
                                                        <TableCell className="text-right font-black text-gray-900">{Number(item.current_value).toLocaleString(undefined, { maximumFractionDigits: 0 })}</TableCell>
                                                        <TableCell className={`text-right ${isPos ? 'text-green-600' : 'text-red-600'}`}>
                                                            <div className="font-black text-sm">
                                                                {isPos ? '+' : ''}{pl.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                            </div>
                                                            <div className={`text-[10px] font-black uppercase tracking-tighter ${isPos ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'} px-1 rounded inline-block mt-0.5`}>
                                                                {Number(item.gain_loss_percent).toFixed(2)}%
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className={`text-right font-black ${isDayPos ? 'text-green-600' : 'text-red-600'}`}>
                                                            {isDayPos ? '+' : ''}{dayPl.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <div className="flex justify-end">
                                                                <button
                                                                    className={`p-2 rounded-lg transition-all ${isExpanded ? 'bg-blue-600 text-white shadow-xl rotate-0' : 'text-gray-300 hover:text-blue-600 hover:bg-blue-50 rotate-[-45deg] hover:rotate-0'}`}
                                                                >
                                                                    {isExpanded ? <X className="h-4 w-4" /> : <Target className="h-4 w-4" />}
                                                                </button>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                    {isExpanded && (
                                                        <TableRow className="bg-blue-50/5 border-none hover:bg-blue-50/5">
                                                            <TableCell colSpan={8} className="p-0 border-none">
                                                                <div className="p-6 pt-0 animate-in fade-in slide-in-from-top-2 duration-300">
                                                                    <div className="bg-white border-x border-b border-blue-100 rounded-b-2xl p-6 shadow-xl relative z-10 mx-2 mb-4">
                                                                        <InlineExitPlan
                                                                            portfolioItem={item}
                                                                            onSave={fetchPortfolio}
                                                                            onClose={() => setExpandedTicker(null)}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            </TableCell>
                                                        </TableRow>
                                                    )}
                                                </React.Fragment>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Visual Analytics & Heatmap Section */}
                {displayedItems.length > 0 && (
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
                                            <span className="text-[10px] text-gray-400 font-bold uppercase">Diversification</span>
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
                                                tick={{ fontSize: 10, fontWeight: 700, fill: '#6B7280' }}
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
                                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter">
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
                                                key={item.ticker}
                                                className={`aspect-square ${bgColor} rounded-md flex flex-col items-center justify-center text-white shadow-inner group relative cursor-help transition-transform hover:scale-105 hover:z-20`}
                                            >
                                                <span className="text-[10px] font-black">{item.ticker}</span>
                                                <span className="text-[8px] font-bold opacity-80">{Number(pnlP).toFixed(0)}%</span>

                                                {/* Tooltip on Hover */}
                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-32 bg-gray-900 text-white p-2 rounded text-[9px] opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity shadow-2xl z-30">
                                                    <p className="font-black border-b border-gray-700 pb-1 mb-1">{item.ticker}</p>
                                                    <p className="flex justify-between">Profit: <span>Rs. {Number(item.gain_loss).toFixed(0)}</span></p>
                                                    <p className="flex justify-between">Value: <span>Rs. {Number(item.current_value).toFixed(0)}</span></p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="mt-6 flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-gray-400">
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

                {/* Risk Management Section - MOVED DOWN */}
                {displayedItems.length > 0 && (
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
                                    <h4 className="text-[10px] font-black text-slate-400 mb-4 uppercase tracking-[0.2em] flex items-center gap-2">
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
                                                                <span className={`text-[10px] font-black ${percent > 40 ? "text-red-500" : "text-slate-400"}`}>
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
                                                        {percent > 40 && <p className="text-[10px] font-bold text-red-500 pl-2">⚠️ Diversification alert: Overexposed to {sector}.</p>}
                                                    </div>
                                                );
                                            })}
                                    </div>
                                </div>

                                {/* Concentration & Volatility Risks */}
                                <div className="space-y-6">
                                    <div>
                                        <h4 className="text-[10px] font-black text-slate-400 mb-4 uppercase tracking-[0.2em]">Holdings Concentration</h4>
                                        <ul className="space-y-2">
                                            {displayedItems
                                                .filter(item => (Number(item.current_value) / totalCurrentValue) > 0.20)
                                                .map(item => (
                                                    <li key={item.ticker} className="flex items-center justify-between text-[11px] bg-red-50/50 p-2.5 rounded-lg border border-red-100 text-red-800">
                                                        <span className="flex items-center gap-2 font-bold uppercase tracking-tight">
                                                            <ShieldAlert className="h-3.5 w-3.5" />
                                                            {item.ticker} Oversized
                                                        </span>
                                                        <span className="font-black bg-red-100 px-2 py-0.5 rounded-full">{((Number(item.current_value) / totalCurrentValue) * 100).toFixed(1)}%</span>
                                                    </li>
                                                ))}
                                            {displayedItems.every(item => (Number(item.current_value) / totalCurrentValue) <= 0.20) && (
                                                <li className="text-[11px] font-bold text-emerald-600 bg-emerald-50/50 p-3 rounded-lg border border-emerald-100 flex items-center gap-2">
                                                    <CheckCircle2 className="h-4 w-4" />
                                                    Portfolio capital is healthy and well-distributed.
                                                </li>
                                            )}
                                        </ul>
                                    </div>

                                    <div>
                                        <h4 className="text-[10px] font-black text-slate-400 mb-4 uppercase tracking-[0.2em]">Volatility Monitoring</h4>
                                        <div className="flex flex-wrap gap-2">
                                            {displayedItems
                                                .filter(item => (item.volatility || 0) > 40)
                                                .sort((a, b) => (b.volatility || 0) - (a.volatility || 0))
                                                .map(item => (
                                                    <div key={item.ticker} className="flex items-center gap-1.5 bg-white text-slate-700 px-3 py-1.5 rounded-lg text-[10px] font-black border border-slate-200 shadow-sm">
                                                        <Activity className="h-3 w-3 text-amber-500" />
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

                {/* Watchlist Section */}
                <Card className="mt-6 border-none shadow-sm bg-white overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-gray-100 bg-slate-50/30">
                        <CardTitle className="text-lg font-bold text-gray-800 flex items-center gap-2 uppercase tracking-tighter">
                            <Eye size={20} className="text-blue-600" />
                            Strategic Watchlist
                        </CardTitle>
                        <div className="flex items-center gap-2">
                            <Input
                                placeholder="Add Ticker..."
                                value={newWatchlistTicker}
                                onChange={(e) => setNewWatchlistTicker(e.target.value)}
                                className="w-40 h-9 text-xs font-bold uppercase"
                                onKeyDown={(e) => e.key === 'Enter' && addWatchlistItem()}
                            />
                            <button
                                onClick={addWatchlistItem}
                                className="h-9 px-4 flex items-center gap-1 bg-blue-600 text-white rounded-md text-xs font-black shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all uppercase tracking-widest"
                            >
                                <PlusCircle size={14} /> Tracking
                            </button>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader className="bg-white">
                                <TableRow className="hover:bg-white border-none">
                                    <TableHead className="pl-6 text-[10px] font-black uppercase text-gray-400 tracking-widest">Ticker</TableHead>
                                    <TableHead className="text-right text-[10px] font-black uppercase text-gray-400 tracking-widest">Live Price</TableHead>
                                    <TableHead className="text-right text-[10px] font-black uppercase text-gray-400 tracking-widest">Day Change</TableHead>
                                    <TableHead className="text-right text-[10px] font-black uppercase text-gray-400 tracking-widest">Tracked Since</TableHead>
                                    <TableHead className="text-right w-[80px] pr-6 text-[10px] font-black uppercase text-gray-400 tracking-widest">Remove</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {watchlist.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center text-gray-400 py-12 text-sm italic">
                                            No active surveillance. Add tickers to monitor entry levels.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    watchlist.map((item) => (
                                        <TableRow key={item.id} className="hover:bg-blue-50/20 border-b border-gray-50 last:border-0 group">
                                            <TableCell className="font-black text-slate-800 pl-6 text-sm">
                                                <StockLink ticker={item.ticker} />
                                            </TableCell>
                                            <TableCell className="text-right font-black text-slate-900">
                                                {item.current_price ? `Rs. ${Number(item.current_price).toLocaleString()}` : 'N/A'}
                                            </TableCell>
                                            <TableCell className={`text-right font-black ${Number(item.day_change) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {item.day_change ? (
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <div className={`p-0.5 rounded ${Number(item.day_change) >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                                                            {Number(item.day_change) >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                                        </div>
                                                        <span className="text-xs">
                                                            {Number(item.day_change).toFixed(1)} ({item.day_change_percent}%)
                                                        </span>
                                                    </div>
                                                ) : '-'}
                                            </TableCell>
                                            <TableCell className="text-right text-gray-400 text-[10px] font-bold">
                                                {new Date(item.added_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </TableCell>
                                            <TableCell className="text-right pr-6">
                                                <button
                                                    className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                                    onClick={() => removeWatchlistItem(item.id)}
                                                >
                                                    <X size={14} />
                                                </button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                {/* Account Creation Dialog */}
                <CreateAccountDialog
                    isOpen={isCreateAccountOpen}
                    onOpenChange={setIsCreateAccountOpen}
                    onSuccess={fetchAccounts}
                />

                {/* Transaction Modal */}
                <TransactionModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    onSuccess={() => {
                        fetchPortfolio();
                        fetchAccounts(); // Refresh accounts too, maybe balance changed?
                    }}
                    accounts={accounts}
                />

                {/* Optimized Dialog Removed */}

                {/* Exit Strategy Dialog Removed - Now Inline */}

            </div>
        </DashboardLayout>
    );
}
