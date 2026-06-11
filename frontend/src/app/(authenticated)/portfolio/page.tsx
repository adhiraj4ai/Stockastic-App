'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import DashboardLayout from '@/components/DashboardLayout';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import {
    ArrowUpDown, MoreHorizontal, Filter, Download,
    Plus, Trash2, Edit2, TrendingUp, TrendingDown,
    Calendar, FolderPlus, Calculator, Eye, Target,
    ShieldAlert, Activity, CheckCircle2, Zap, Wallet, DollarSign,
    BarChart3 as BarIcon, Grid3X3, Users, Wand2, PlusCircle, MinusCircle, Radio,
    ChevronDown, ChevronUp, ChevronLeft, ChevronRight, ArrowUp, X, Pencil,
    PieChart as PieIcon, Check, Bell, Rocket, Info
} from 'lucide-react';
import TransactionModal, { PortfolioAccount } from '@/components/TransactionModal';
import { CreateAccountDialog } from '@/components/CreateAccountDialog';
import StockLink from '@/components/StockLink';
import { ExitStrategyDialog } from '@/components/ExitStrategyDialog';
import { RiskRadar } from '@/components/RiskRadar';
import { PositionSizingCalculator } from '@/components/PositionSizingCalculator';
import { CompanySelect } from '@/components/CompanySelect';
import { FullPageLoader } from '@/components/ui/StockLoader';
import { Badge } from '@/components/ui/badge';
import { formatNepaliNumber, formatRupees } from '@/lib/formatters';
import { Input } from '@/components/ui/input';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, Legend } from 'recharts';
import { AccountSettingsDialog } from '@/components/AccountSettingsDialog';
import { Settings } from 'lucide-react';
import { PortfolioTable, PortfolioItem } from '@/components/PortfolioTable';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PortfolioPerformance } from '@/components/PortfolioPerformance';
import { SectionCard, KpiCard, SentimentBadge, FadeIn, KpiSkeleton, CardSkeleton } from '@/components/portfolio/ui';

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
    health_score?: number;
    fundamental_metrics?: {
        pe: number | null;
        pb: number | null;
        roe: number | null;
        growth: number | null;
        de: number | null;
    };
    rvol?: number;
    fifty_two_week_high?: number;
    fifty_two_week_low?: number;
    stop_loss_price?: number;
    alert_enabled?: boolean;
    days_to_book_closure?: number;
    next_book_close?: string;
    is_accumulating?: boolean;
    buy_signal_count?: number;
    upside_percent?: number;
    risk_reward_ratio?: number;
}



export const dynamic = 'force-dynamic';

function PortfolioContent() {
    const [items, setItems] = useState<PortfolioItem[]>([]);
    const [accounts, setAccounts] = useState<PortfolioAccount[]>([]);
    const [selectedAccount, setSelectedAccount] = useState<string>('all');
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [promoteTicker, setPromoteTicker] = useState<string>('');
    const [transactionType, setTransactionType] = useState<string>('BUY');
    const [defaultModalAccount, setDefaultModalAccount] = useState<string>('');
    const [isCreateAccountOpen, setIsCreateAccountOpen] = useState(false);
    const [isExitPlanDialogOpen, setIsExitPlanDialogOpen] = useState(false);
    const [selectedPortfolioItem, setSelectedPortfolioItem] = useState<PortfolioItem | null>(null);
    const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
    const [isWatchlistModalOpen, setIsWatchlistModalOpen] = useState(false);
    const [selectedWatchlistItem, setSelectedWatchlistItem] = useState<WatchlistItem | null>(null);
    const [watchlistForm, setWatchlistForm] = useState({
        ticker: '',
        target_price: '',
        stop_loss_price: '',
        alert_enabled: false,
        notes: ''
    });
    const [watchlistCurrentPage, setWatchlistCurrentPage] = useState(1);
    const [currentPage, setCurrentPage] = useState(1);
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({
        key: 'investment_value',
        direction: 'desc'
    });
    const pageSize = 10;
    const [mounted, setMounted] = useState(false);
    const [isPositionCalcOpen, setIsPositionCalcOpen] = useState(false);
    const [isAccountSettingsOpen, setIsAccountSettingsOpen] = useState(false);
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
                stop_loss_price: watchlistForm.stop_loss_price ? Number(watchlistForm.stop_loss_price) : null,
                alert_enabled: watchlistForm.alert_enabled,
                notes: watchlistForm.notes || null
            });
            setIsWatchlistModalOpen(false);
            setWatchlistForm({ ticker: '', target_price: '', stop_loss_price: '', alert_enabled: false, notes: '' });
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
                stop_loss_price: watchlistForm.stop_loss_price ? Number(watchlistForm.stop_loss_price) : null,
                alert_enabled: watchlistForm.alert_enabled,
                notes: watchlistForm.notes || null
            });
            setIsWatchlistModalOpen(false);
            setSelectedWatchlistItem(null);
            setWatchlistForm({ ticker: '', target_price: '', stop_loss_price: '', alert_enabled: false, notes: '' });
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
            stop_loss_price: item.stop_loss_price?.toString() || '',
            alert_enabled: item.alert_enabled || false,
            notes: item.notes || ''
        });
        setIsWatchlistModalOpen(true);
    };

    const handlePromoteToPortfolio = (ticker: string) => {
        setPromoteTicker(ticker);
        setDefaultModalAccount(selectedAccount !== 'all' ? selectedAccount : '');
        setIsModalOpen(true);
    };

    const removeWatchlistItem = async (id: number) => {
        if (!confirm('Are you sure you want to remove this ticker from your watchlist?')) return;
        try {
            await api.delete(`/api/stocks/watchlist/${id}/`);
            fetchWatchlist();
        } catch (err) {
            console.error('Failed to remove from watchlist', err);
        }
    };

    const toggleWatchlistAlert = async (item: WatchlistItem) => {
        try {
            await api.patch(`/api/stocks/watchlist/${item.id}/`, {
                alert_enabled: !item.alert_enabled
            });
            // Update local state for immediate feedback
            setWatchlist(prev => prev.map(i => i.id === item.id ? { ...i, alert_enabled: !i.alert_enabled } : i));
        } catch (err) {
            console.error('Failed to toggle alert', err);
        }
    };

    const fetchPortfolio = async () => {
        setLoading(true);
        try {
            const params: any = {};
            if (selectedAccount !== 'all') {
                params.account = selectedAccount;
            }

            const response = await api.get('/api/stocks/portfolio/', { params });
            const data = Array.isArray(response.data) ? response.data : (response.data.results || []);
            setItems(data);
        } catch (err) {
            console.error('Failed to fetch portfolio:', err);
        } finally {
            setLoading(false);
            setMounted(true);
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

    // Filter and Sort Items
    const sortedAndFilteredItems = useMemo(() => {
        let result = [...displayedItems];

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
    }, [displayedItems, sortConfig]);

    // Calculate Summary based on Filtered Items
    const totalInvestment = sortedAndFilteredItems.reduce((acc, item) => acc + Number(item.investment_value), 0);
    const totalCurrentValue = sortedAndFilteredItems.reduce((acc, item) => acc + Number(item.current_value), 0);
    const totalGainLoss = totalCurrentValue - totalInvestment;
    const totalGainLossPercent = totalInvestment ? (totalGainLoss / totalInvestment * 100) : 0;
    const totalDayGainLoss = sortedAndFilteredItems.reduce((acc, item) => acc + Number(item.day_gain_loss), 0);

    const stats = useMemo(() => {
        const profit = sortedAndFilteredItems.filter(i => Number(i.gain_loss) > 0).length;
        const loss = sortedAndFilteredItems.filter(i => Number(i.gain_loss) < 0).length;
        return { profit, loss };
    }, [sortedAndFilteredItems]);

    const bestPerformer = useMemo(() => {
        if (sortedAndFilteredItems.length === 0) return null;
        return [...sortedAndFilteredItems].sort((a, b) => b.gain_loss_percent - a.gain_loss_percent)[0];
    }, [sortedAndFilteredItems]);

    const sectorData = useMemo(() => {
        const sectors: Record<string, { name: string; value: number; pnl: number }> = {};
        sortedAndFilteredItems.forEach(item => {
            const s = item.sector || 'Others';
            if (!sectors[s]) sectors[s] = { name: s, value: 0, pnl: 0 };
            sectors[s].value += Number(item.current_value);
            sectors[s].pnl += Number(item.gain_loss);
        });
        return Object.values(sectors).sort((a, b) => b.value - a.value);
    }, [sortedAndFilteredItems]);

    const paginatedItems = useMemo(() => {
        const startIndex = (currentPage - 1) * pageSize;
        return sortedAndFilteredItems.slice(startIndex, startIndex + pageSize);
    }, [sortedAndFilteredItems, currentPage]);

    const totalPages = Math.ceil(sortedAndFilteredItems.length / pageSize);

    // Watchlist Logic
    const sortedAndFilteredWatchlist = useMemo(() => {
        let result = [...watchlist];
        return result.sort((a, b) => a.ticker.localeCompare(b.ticker));
    }, [watchlist]);

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
            title={activeTab === 'watchlist' ? 'Watchlist' : 'My Portfolio'}
            subtitle={activeTab === 'watchlist' ? 'Monitor potential entries and track performance' : 'Track and manage your investments'}
        >
            <Tabs value={activeTab} onValueChange={(val) => router.push(`/portfolio?tab=${val}`)} className="space-y-6">
                <div className="flex justify-between items-center">
                    <TabsList>
                        <TabsTrigger value="holdings">Holdings</TabsTrigger>
                        <TabsTrigger value="watchlist">Watchlist</TabsTrigger>
                    </TabsList>
                </div>

                {/* Header & Actions - Only for Holdings */}
                {activeTab === 'holdings' && (
                    <div className="flex flex-col md:flex-row md:items-center justify-end gap-4">


                        <div className="flex items-center gap-3">
                            {/* Account Selector */}
                            <div className="relative">
                                <select
                                    value={selectedAccount}
                                    onChange={(e) => setSelectedAccount(e.target.value)}
                                    className="appearance-none bg-card border border-border text-foreground py-2.5 pl-4 pr-10 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-medium shadow-sm cursor-pointer"
                                >
                                    <option value="all">All Accounts</option>
                                    <option disabled>──────────</option>
                                    {accounts.map(acc => (
                                        <option key={acc.id} value={acc.id}>
                                            {acc.name} {acc.account_type === 'PAPER' ? `(Virtual: Rs. ${Number(acc.balance).toLocaleString()})` : ''}
                                        </option>
                                    ))}
                                </select>
                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                                    <Users className="h-4 w-4" />
                                </div>
                            </div>
                            <button
                                onClick={() => setIsAccountSettingsOpen(true)}
                                disabled={selectedAccount === 'all'}
                                className={`p-2.5 bg-card border border-border rounded-xl shadow-sm transition-all ${selectedAccount === 'all'
                                    ? 'opacity-50 cursor-not-allowed text-gray-400'
                                    : 'hover:bg-muted text-muted-foreground hover:text-indigo-500'
                                    }`}
                                title={selectedAccount === 'all' ? "Select an account to manage settings" : "Account Settings"}
                            >
                                <Settings className="h-5 w-5" />
                            </button>

                            <button
                                onClick={() => setIsCreateAccountOpen(true)}
                                className="bg-card border border-border hover:bg-muted text-foreground p-2.5 rounded-xl shadow-sm transition-all"
                                title="Create New Portfolio Account"
                            >
                                <FolderPlus className="h-5 w-5" />
                            </button>


                            <button
                                onClick={() => router.push(`/portfolio/optimize?account=${selectedAccount}`)}
                                disabled={displayedItems.length === 0}
                                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-sm hover:shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
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
                    loading && displayedItems.length === 0 ? (
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            {[0, 1, 2, 3].map(i => <KpiSkeleton key={i} />)}
                        </div>
                    ) : (
                        <FadeIn className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <KpiCard
                                accent="blue"
                                icon={Wallet}
                                label="Capital Deployed"
                                info="Total initial investment across all active holdings in the selected account."
                                value={formatRupees(totalInvestment)}
                                sub={<SentimentBadge tone="neutral">{displayedItems.length} holdings</SentimentBadge>}
                            />
                            <KpiCard
                                accent="emerald"
                                icon={DollarSign}
                                label="Portfolio Value"
                                info="Current market valuation of all holdings based on real-time price feeds."
                                value={formatRupees(totalCurrentValue)}
                                sub={<SentimentBadge tone="neutral">Real-time valuation</SentimentBadge>}
                            />
                            <KpiCard
                                accent="emerald"
                                icon={totalGainLoss >= 0 ? TrendingUp : TrendingDown}
                                label="Total Returns"
                                info="Net unrealized profit or loss since inception, including reinvested capital."
                                value={formatRupees(Math.abs(totalGainLoss))}
                                valueClassName={totalGainLoss >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}
                                sub={
                                    <span className="flex items-center gap-2">
                                        <SentimentBadge tone={totalGainLoss >= 0 ? 'up' : 'down'}>
                                            {totalGainLoss >= 0 ? '+' : '−'}{Math.abs(totalGainLossPercent).toFixed(2)}%
                                        </SentimentBadge>
                                        {bestPerformer && (
                                            <span className="text-[11px] text-muted-foreground">
                                                Top: <span className="text-foreground">{bestPerformer.ticker}</span>
                                            </span>
                                        )}
                                    </span>
                                }
                            />
                            <KpiCard
                                accent="amber"
                                icon={Zap}
                                label="Session Swing"
                                info="Intraday profit or loss change for the current market session."
                                value={formatRupees(Math.abs(totalDayGainLoss))}
                                valueClassName={totalDayGainLoss >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}
                                sub={<SentimentBadge tone={totalDayGainLoss >= 0 ? 'up' : 'down'}>Intraday movement</SentimentBadge>}
                            />
                        </FadeIn>
                    )
                )}

                {/* Holdings Table - MOVED UP - Only for Holdings */}
                {activeTab === 'holdings' && (
                    <FadeIn delay={0.05}>
                    <SectionCard
                        accent="emerald"
                        icon={Grid3X3}
                        title="Strategic Holdings"
                        info="Real-time list of all active positions, tracking entry costs, current value, and profit metrics."
                        badges={<>
                            <SentimentBadge tone="up">#{stats.profit} Profit</SentimentBadge>
                            <SentimentBadge tone="down">#{stats.loss} Loss</SentimentBadge>
                        </>}
                        actions={<>
                            {selectedAccount !== 'all' && (
                                <div className="flex items-center gap-3">
                                    <span className="text-muted-foreground text-xs font-normal">
                                        (Account: {accounts.find(a => a.id.toString() == selectedAccount)?.name}
                                        {accounts.find(a => a.id.toString() == selectedAccount)?.account_type === 'PAPER' ? ' - Paper Trading' : ''})
                                    </span>
                                    <button
                                        onClick={() => {
                                            setDefaultModalAccount(selectedAccount);
                                            setPromoteTicker('');
                                            setIsModalOpen(true);
                                        }}
                                        className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded-lg text-[10px] font-bold transition-all shadow-sm active:scale-95"
                                    >
                                        <Plus className="h-3 w-3" />
                                        Add Transaction
                                    </button>
                                </div>
                            )}
                            {loading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-foreground"></div>}
                        </>}
                        bodyClassName="p-0"
                    >
                            {loading && displayedItems.length === 0 ? (
                                <div className="p-4"><CardSkeleton rows={8} /></div>
                            ) : displayedItems.length === 0 && !loading ? (
                                <div className="text-center py-12 text-muted-foreground flex flex-col items-center gap-2">
                                    <Wallet className="h-10 w-10 text-muted" />
                                    <p>No stocks in portfolio. Add a transaction to get started.</p>
                                </div>
                            ) : (
                                selectedAccount === 'all' ? (
                                    <div className="space-y-8 p-6">
                                        {accounts.map(acc => {
                                            const accountItems = displayedItems.filter(item => item.account === acc.id);

                                            // Calculate Totals for Header
                                            const accTotalValue = accountItems.reduce((sum, item) => sum + Number(item.current_value), 0);
                                            const accTotalGain = accountItems.reduce((sum, item) => sum + Number(item.gain_loss), 0);

                                            return (
                                                <div key={acc.id} className="space-y-3">
                                                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-indigo-500/5 px-3 py-2">
                                                        <div className="flex items-center gap-3">
                                                            <h3 className="text-[11px] font-bold uppercase tracking-wider text-indigo-500 dark:text-indigo-400">{acc.name}</h3>
                                                            <Badge variant="outline" className="text-xs font-mono">
                                                                {formatRupees(accTotalValue)}
                                                            </Badge>
                                                            <span className={`text-xs font-bold tabular-nums ${accTotalGain >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                                                {accTotalGain >= 0 ? '+' : ''}{formatRupees(accTotalGain)}
                                                            </span>
                                                        </div>
                                                        <button
                                                            onClick={() => {
                                                                setDefaultModalAccount(acc.id.toString());
                                                                setPromoteTicker('');
                                                                setIsModalOpen(true);
                                                            }}
                                                            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded-md text-[10px] font-bold transition-all shadow-sm active:scale-95"
                                                        >
                                                            <Plus className="h-3 w-3" />
                                                            Add Transaction
                                                        </button>
                                                    </div>
                                                    <div className="rounded-xl border border-border overflow-hidden">
                                                        <PortfolioTable
                                                            items={accountItems}
                                                            currentPage={1} // Grouped view doesn't support pagination per table easily yet, showing all maybe better? Or just pass 1 for SN
                                                            pageSize={100} // Show all items for account in grouped view
                                                            onSort={handleSort}
                                                            onBuy={(ticker) => {
                                                                setPromoteTicker(ticker);
                                                                setTransactionType('BUY');
                                                                setDefaultModalAccount(acc.id.toString());
                                                                setIsModalOpen(true);
                                                            }}
                                                            onSell={(ticker) => {
                                                                setPromoteTicker(ticker);
                                                                setTransactionType('SELL');
                                                                setDefaultModalAccount(acc.id.toString());
                                                                setIsModalOpen(true);
                                                            }}
                                                            onStrategies={(item) => {
                                                                setSelectedPortfolioItem(item);
                                                                setIsExitPlanDialogOpen(true);
                                                            }}
                                                            selectedPortfolioItem={selectedPortfolioItem}
                                                            isExitPlanDialogOpen={isExitPlanDialogOpen}
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <PortfolioTable
                                        items={paginatedItems}
                                        currentPage={currentPage}
                                        pageSize={pageSize}
                                        onSort={handleSort}
                                        onBuy={(ticker) => {
                                            setPromoteTicker(ticker);
                                            setTransactionType('BUY');
                                            setDefaultModalAccount(selectedAccount !== 'all' ? selectedAccount : '');
                                            setIsModalOpen(true);
                                        }}
                                        onSell={(ticker) => {
                                            setPromoteTicker(ticker);
                                            setTransactionType('SELL');
                                            setDefaultModalAccount(selectedAccount !== 'all' ? selectedAccount : '');
                                            setIsModalOpen(true);
                                        }}
                                        onStrategies={(item) => {
                                            setSelectedPortfolioItem(item);
                                            setIsExitPlanDialogOpen(true);
                                        }}
                                        selectedPortfolioItem={selectedPortfolioItem}
                                        isExitPlanDialogOpen={isExitPlanDialogOpen}
                                    />
                                )
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
                                accounts={accounts}
                            />

                            {/* Pagination Controls */}
                            {totalPages > 1 && (
                                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-4 px-6 border-t border-border">
                                    <div className="text-xs text-muted-foreground">
                                        Displaying <span className="text-foreground font-semibold">{(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, sortedAndFilteredItems.length)}</span> of <span className="text-foreground font-semibold">{sortedAndFilteredItems.length}</span> holdings
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                            disabled={currentPage === 1}
                                            className="p-2 rounded-lg border border-border hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                                        >
                                            <ChevronLeft size={16} />
                                        </button>

                                        <div className="flex items-center gap-1">
                                            {[...Array(totalPages)].map((_, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => setCurrentPage(i + 1)}
                                                    className={`h-8 w-8 rounded-lg text-xs font-bold transition-all ${currentPage === i + 1 ? 'bg-indigo-600 text-white shadow-sm' : 'text-muted-foreground hover:bg-muted'}`}
                                                >
                                                    {i + 1}
                                                </button>
                                            ))}
                                        </div>

                                        <button
                                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                            disabled={currentPage === totalPages}
                                            className="p-2 rounded-lg border border-border hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                                        >
                                            <ChevronRight size={16} />
                                        </button>
                                    </div>
                                </div>
                            )}
                    </SectionCard>
                    </FadeIn>
                )}

                {/* Account Settings Dialog */}
                <AccountSettingsDialog
                    isOpen={isAccountSettingsOpen}
                    onOpenChange={setIsAccountSettingsOpen}
                    account={accounts.find(a => a.id.toString() === selectedAccount) || null}
                    portfolioValue={selectedAccount !== 'all' ? displayedItems.reduce((acc, item) => acc + Number(item.current_value), 0) : 0}
                    onUpdate={() => {
                        fetchAccounts();
                        fetchPortfolio();
                    }}
                    onDelete={() => {
                        fetchAccounts();
                        setSelectedAccount('all');
                    }}
                />

                {/* Risk Radar + Sector Allocation - Only for Holdings */}
                {activeTab === 'holdings' && (
                    <FadeIn delay={0.1} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className={displayedItems.length > 0 ? '' : 'lg:col-span-2'}>
                            <RiskRadar accountId={selectedAccount} />
                        </div>
                        {displayedItems.length > 0 && (
                            <SectionCard
                                accent="indigo"
                                icon={PieIcon}
                                title="Sector Allocation"
                                info="Graphical deep-dive into your asset allocation and sector diversification."
                                badges={<SentimentBadge tone="neutral">{sectorData.length} sectors</SentimentBadge>}
                            >
                                <div className="relative h-[260px]">
                                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Diversification</span>
                                        <span className="text-lg font-semibold text-foreground">{sectorData.length} Sectors</span>
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
                                <div className="flex flex-wrap gap-x-4 gap-y-2 mt-4 pt-4 border-t border-border">
                                    {sectorData.map((s, i) => (
                                        <div key={s.name} className="flex items-center gap-2">
                                            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                                            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                                {s.name} ({((s.value / totalCurrentValue) * 100).toFixed(0)}%)
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </SectionCard>
                        )}
                    </FadeIn>
                )}

                {/* P&L by Sector + P&L Heatmap - Only for Holdings */}
                {activeTab === 'holdings' && displayedItems.length > 0 && (
                    <FadeIn delay={0.15} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <SectionCard
                            accent="indigo"
                            icon={BarIcon}
                            title="P&L by Sector"
                            info="Performance contribution of each sector to overall profit and loss."
                        >
                            <div className="h-[260px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={sectorData} layout="vertical" margin={{ left: 20, right: 20 }}>
                                        <XAxis type="number" hide />
                                        <YAxis
                                            dataKey="name"
                                            type="category"
                                            axisLine={false}
                                            tickLine={false}
                                            tick={{ fontSize: 11, fontWeight: 600, fill: '#6B7280' }}
                                            width={80}
                                        />
                                        <RechartsTooltip
                                            cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
                                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', backgroundColor: 'rgba(0,0,0,0.8)' }}
                                        />
                                        <Bar
                                            dataKey="pnl"
                                            radius={[0, 4, 4, 0]}
                                            barSize={20}
                                        >
                                            {sectorData.map((entry, index) => (
                                                <Cell
                                                    key={`cell-${index}`}
                                                    fill={entry.pnl >= 0 ? '#10B981' : '#F43F5E'}
                                                />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </SectionCard>

                        <SectionCard
                            accent="emerald"
                            icon={Activity}
                            title="P&L Heatmap"
                            info="Each tile is a holding, colored by unrealized gain or loss intensity."
                        >
                            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                                {displayedItems.map((item) => {
                                    const pnlP = item.gain_loss_percent;
                                    let bgColor = 'bg-gray-100 dark:bg-slate-800';
                                    if (pnlP > 20) bgColor = 'bg-emerald-600 dark:bg-emerald-700';
                                    else if (pnlP > 10) bgColor = 'bg-emerald-500 dark:bg-emerald-600';
                                    else if (pnlP > 0) bgColor = 'bg-emerald-400 dark:bg-emerald-500';
                                    else if (pnlP > -10) bgColor = 'bg-rose-400 dark:bg-rose-500';
                                    else if (pnlP > -20) bgColor = 'bg-rose-500 dark:bg-rose-600';
                                    else bgColor = 'bg-rose-600 dark:bg-rose-700';

                                    return (
                                        <div
                                            key={item.id}
                                            className={`aspect-square ${bgColor} rounded-xl flex flex-col items-center justify-center text-white shadow-inner group relative cursor-help transition-transform hover:scale-105 hover:z-20`}
                                        >
                                            <span className="text-sm font-semibold">{item.ticker}</span>
                                            <span className="text-xs font-bold opacity-80 tabular-nums">{Number(pnlP).toFixed(0)}%</span>

                                            {/* Tooltip on Hover */}
                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-32 bg-gray-900 dark:bg-slate-950 text-white p-2 rounded-lg text-xs opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity shadow-sm z-30">
                                                <p className="font-semibold border-b border-gray-700 dark:border-slate-800 pb-1 mb-1">{item.ticker}</p>
                                                <p className="flex justify-between">Profit: <span className="font-mono">{formatRupees(item.gain_loss)}</span></p>
                                                <p className="flex justify-between">Value: <span className="font-mono">{formatRupees(item.current_value)}</span></p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="mt-5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                <span>Bearish</span>
                                <div className="flex gap-1">
                                    <div className="h-2 w-2 rounded-sm bg-rose-600" />
                                    <div className="h-2 w-2 rounded-sm bg-rose-500" />
                                    <div className="h-2 w-2 rounded-sm bg-rose-400" />
                                    <div className="h-2 w-2 rounded-sm bg-emerald-400" />
                                    <div className="h-2 w-2 rounded-sm bg-emerald-500" />
                                    <div className="h-2 w-2 rounded-sm bg-emerald-600" />
                                </div>
                                <span>Bullish</span>
                            </div>
                        </SectionCard>
                    </FadeIn>
                )}

                {/* Risk Management Section - MOVED DOWN - Only for Holdings */}
                {activeTab === 'holdings' && displayedItems.length > 0 && (
                    <FadeIn delay={0.2}>
                    <SectionCard
                        accent="rose"
                        icon={ShieldAlert}
                        title="Portfolio Health"
                        info="Automated scan for sector concentration, oversized positions, and volatility hotspots."
                    >
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {/* Sector Concentration Risk List */}
                                <div>
                                    <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
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
                                                        <div className="flex justify-between items-center text-xs mb-1.5 p-2 bg-muted/30 rounded-lg border border-border">
                                                            <span className="font-semibold text-foreground">{sector}</span>
                                                            <div className="flex items-center gap-2">
                                                                <span className={`text-xs font-semibold tabular-nums ${percent > 40 ? "text-rose-500" : "text-muted-foreground"}`}>
                                                                    {percent.toFixed(1)}%
                                                                </span>
                                                                <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                                                    <div
                                                                        className={`h-full rounded-full ${percent > 40 ? 'bg-gradient-to-r from-rose-500 to-rose-400' : percent > 25 ? 'bg-gradient-to-r from-amber-400 to-amber-500' : 'bg-emerald-500/70'}`}
                                                                        style={{ width: `${percent}%` }}
                                                                    />
                                                                </div>
                                                            </div>
                                                        </div>
                                                        {percent > 40 && <p className="text-xs font-semibold text-rose-500 pl-2">⚠️ Diversification alert: Overexposed to {sector}.</p>}
                                                    </div>
                                                );
                                            })}
                                    </div>
                                </div>

                                {/* Concentration & Volatility Risks */}
                                <div className="space-y-6">
                                    <div>
                                        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Holdings Concentration</h4>
                                        <ul className="space-y-2">
                                            {displayedItems
                                                .filter(item => (Number(item.current_value) / totalCurrentValue) > 0.20)
                                                .map(item => (
                                                    <li key={item.ticker} className="flex items-center justify-between text-xs bg-rose-500/10 p-2.5 rounded-lg border border-rose-500/25 text-rose-600 dark:text-rose-400">
                                                        <span className="flex items-center gap-2 font-bold uppercase tracking-tight">
                                                            <ShieldAlert className="h-3.5 w-3.5" />
                                                            {item.ticker} Oversized
                                                        </span>
                                                        <span className="font-semibold tabular-nums bg-rose-500/15 px-2 py-0.5 rounded-full">{((Number(item.current_value) / totalCurrentValue) * 100).toFixed(1)}%</span>
                                                    </li>
                                                ))}
                                            {displayedItems.every(item => (Number(item.current_value) / totalCurrentValue) <= 0.20) && (
                                                <li className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 p-3 rounded-lg border border-emerald-500/25 flex items-center gap-2">
                                                    <CheckCircle2 className="h-4 w-4" />
                                                    Portfolio capital is healthy and well-distributed.
                                                </li>
                                            )}
                                        </ul>
                                    </div>

                                    <div>
                                        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Volatility Monitoring</h4>
                                        <div className="flex flex-wrap gap-2">
                                            {displayedItems
                                                .filter(item => (item.volatility || 0) > 40)
                                                .sort((a, b) => (b.volatility || 0) - (a.volatility || 0))
                                                .map(item => (
                                                    <div key={item.ticker} className="flex items-center gap-1.5 bg-muted/40 text-foreground px-3 py-1.5 rounded-full text-xs font-semibold border border-border">
                                                        <Activity className="h-3 w-3" />
                                                        {item.ticker} <span className="text-muted-foreground opacity-60">/</span> {item.volatility?.toFixed(1)}% VOL
                                                    </div>
                                                ))}
                                            {!displayedItems.some(i => (i.volatility || 0) > 40) && (
                                                <span className="text-xs text-muted-foreground italic">Position stability confirmed across all holdings.</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                    </SectionCard>
                    </FadeIn>
                )}

                {/* Strategic Watchlist Section - Only for Watchlist tab */}
                {activeTab === 'watchlist' && (
                    <FadeIn>
                    <SectionCard
                        accent="indigo"
                        icon={Eye}
                        title="Strategic Watchlist"
                        badges={<SentimentBadge tone="neutral">{sortedAndFilteredWatchlist.length} tickers</SentimentBadge>}
                        actions={<>
                                    <button
                                        onClick={() => {
                                            setSelectedWatchlistItem(null);
                                            setWatchlistForm({ ticker: '', target_price: '', stop_loss_price: '', alert_enabled: false, notes: '' });
                                            setIsWatchlistModalOpen(true);
                                        }}
                                        className="h-9 px-4 flex items-center gap-2 bg-indigo-600 text-white rounded-md text-[11px] font-semibold hover:bg-indigo-700 transition-all uppercase tracking-wider shadow-md whitespace-nowrap"
                                    >
                                        <Plus size={14} /> Add
                                    </button>
                        </>}
                        bodyClassName="p-0"
                    >
                            {paginatedWatchlist.length === 0 ? (
                                <div className="text-center py-20 text-muted-foreground flex flex-col items-center gap-2">
                                    <Eye className="h-10 w-10 text-muted" />
                                    <p className="text-sm font-medium italic">Your watchlist is empty. Add tickers to monitor entry levels.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow className="bg-muted/40 hover:bg-muted/40 border-border">
                                                <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-6">Ticker</TableHead>
                                                <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">LTP (रू)</TableHead>
                                                <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Day Change</TableHead>
                                                <TableHead className="text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Health</TableHead>
                                                <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Smart Money / RVOL</TableHead>
                                                <TableHead className="text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">52W Range</TableHead>
                                                <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Strategy Sync</TableHead>
                                                <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">R:R / Upside</TableHead>
                                                <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Timeline</TableHead>
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
                                                    <TableRow key={item.id} className="hover:bg-blue-50/30 dark:hover:bg-slate-800/30 border-b border-gray-50 dark:border-slate-800 last:border-0 group transition-all">
                                                        <TableCell className="py-4 px-6 relative">
                                                            <div className="flex flex-col">
                                                                <div className="flex items-center gap-2">
                                                                    <StockLink ticker={item.ticker} className="font-semibold text-slate-900 dark:text-slate-100 text-sm" />
                                                                    <button
                                                                        onClick={() => toggleWatchlistAlert(item)}
                                                                        className={`p-1 rounded-full transition-all ${item.alert_enabled ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/30' : 'text-slate-300 dark:text-slate-700 hover:text-blue-400'}`}
                                                                        title={item.alert_enabled ? 'Disable Price Alerts' : 'Enable Price Alerts'}
                                                                    >
                                                                        <Bell size={12} className={item.alert_enabled ? 'fill-current' : ''} />
                                                                    </button>
                                                                </div>
                                                                {item.sector && (
                                                                    <span className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-tighter">
                                                                        {item.sector}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-right py-4">
                                                            <div className="font-semibold text-slate-900 dark:text-slate-100">
                                                                {item.current_price ? formatRupees(item.current_price) : 'N/A'}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-right py-4">
                                                            <div className={`flex flex-col items-end`}>
                                                                <div className={`font-semibold flex items-center gap-1 ${isPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                                                    {isPos ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                                                    {isPos ? '+' : ''}{dayChange.toFixed(1)}
                                                                </div>
                                                                <div className={`text-[10px] font-semibold uppercase tracking-tighter px-1 rounded ${isPos ? 'bg-emerald-500/10 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-rose-500/10 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400'}`}>
                                                                    {item.day_change_percent}%
                                                                </div>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-center py-4">
                                                            {item.health_score !== undefined && item.health_score !== null ? (
                                                                <Tooltip>
                                                                    <TooltipTrigger asChild>
                                                                        <Badge
                                                                            variant="secondary"
                                                                            className={`font-bold transition-all px-2 py-0.5 text-[10px] ${item.health_score >= 70 ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' :
                                                                                item.health_score >= 40 ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400' :
                                                                                    'bg-rose-500/10 text-rose-700 dark:text-rose-400'
                                                                                }`}
                                                                        >
                                                                            {item.health_score}
                                                                        </Badge>
                                                                    </TooltipTrigger>
                                                                    <TooltipContent className="p-0 border-none shadow-xl bg-white dark:bg-card overflow-hidden">
                                                                        <div className="w-48 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                                                                            <div className="p-2 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                                                                                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Quality Score</h4>
                                                                                <div className="flex items-center gap-2 mt-0.5">
                                                                                    <span className="text-lg font-semibold text-slate-900 dark:text-slate-100">{item.health_score}</span>
                                                                                </div>
                                                                            </div>
                                                                            <div className="p-2 space-y-1.5 pb-3">
                                                                                <div className="flex justify-between items-center text-[10px]">
                                                                                    <span className="text-slate-500">P/E</span>
                                                                                    <span className="font-bold text-slate-700 dark:text-slate-300">{item.fundamental_metrics?.pe?.toFixed(1) || 'N/A'}</span>
                                                                                </div>
                                                                                <div className="flex justify-between items-center text-[10px]">
                                                                                    <span className="text-slate-500">ROE</span>
                                                                                    <span className="font-bold text-slate-700 dark:text-slate-300">{item.fundamental_metrics?.roe ? `${item.fundamental_metrics.roe.toFixed(1)}%` : 'N/A'}</span>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </TooltipContent>
                                                                </Tooltip>
                                                            ) : (
                                                                <span className="text-gray-300 dark:text-slate-700">--</span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right py-4">
                                                            <div className="flex flex-col items-end gap-1">
                                                                {item.is_accumulating && (
                                                                    <Tooltip>
                                                                        <TooltipTrigger asChild>
                                                                            <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400 text-[8px] font-semibold uppercase tracking-wider px-1.5 py-0 border-none cursor-help">
                                                                                <Zap size={8} className="mr-1 inline" /> Institutional Interest
                                                                            </Badge>
                                                                        </TooltipTrigger>
                                                                        <TooltipContent className="p-3 bg-slate-900 text-white border-none shadow-sm rounded-xl">
                                                                            <p className="text-[10px] font-bold leading-relaxed">
                                                                                Accumulation Pulse: Local brokers have been <br />
                                                                                net buyers over the last 5 trading cycles.
                                                                            </p>
                                                                        </TooltipContent>
                                                                    </Tooltip>
                                                                )}
                                                                {item.rvol !== undefined && item.rvol !== null ? (
                                                                    <div className="flex flex-col items-end">
                                                                        <div className={`font-semibold text-sm ${item.rvol > 2 ? 'text-purple-600 dark:text-purple-400' : item.rvol > 1 ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`}>
                                                                            {item.rvol.toFixed(1)}x
                                                                        </div>
                                                                        <div className="text-[9px] font-bold text-slate-400 uppercase">VOL Intensity</div>
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-gray-300 dark:text-slate-700">--</span>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-center py-4 w-[120px]">
                                                            {item.fifty_two_week_high && item.fifty_two_week_low ? (
                                                                <div className="px-2">
                                                                    <div className="flex justify-between text-[8px] font-bold text-slate-400 mb-1">
                                                                        <span>{item.fifty_two_week_low}</span>
                                                                        <span>{item.fifty_two_week_high}</span>
                                                                    </div>
                                                                    <div className="relative w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden border border-border dark:border-slate-700/50">
                                                                        <div
                                                                            className="absolute top-0 h-full bg-blue-500/50 dark:bg-blue-400/50"
                                                                            style={{
                                                                                left: '0',
                                                                                width: `${((Number(item.current_price) - item.fifty_two_week_low) / (item.fifty_two_week_high - item.fifty_two_week_low)) * 100}%`
                                                                            }}
                                                                        />
                                                                        <div
                                                                            className="absolute top-0 h-full w-1 bg-blue-600 dark:bg-blue-300 shadow-[0_0_5px_rgba(37,99,235,0.5)]"
                                                                            style={{
                                                                                left: `${((Number(item.current_price) - item.fifty_two_week_low) / (item.fifty_two_week_high - item.fifty_two_week_low)) * 100}%`,
                                                                                transform: 'translateX(-50%)'
                                                                            }}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <span className="text-gray-300 dark:text-slate-700">--</span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right py-4">
                                                            <div className="flex flex-col items-end gap-1">
                                                                <div className="flex items-center gap-1.5">
                                                                    {(item.buy_signal_count || 0) >= 2 && (item.rvol || 0) > 1.5 && (
                                                                        <Badge className="bg-blue-600 text-white text-[8px] font-semibold uppercase px-1.5 py-0 animate-pulse border-none">
                                                                            High Conviction
                                                                        </Badge>
                                                                    )}
                                                                    {item.buy_signal_count && item.buy_signal_count > 0 ? (
                                                                        <Tooltip>
                                                                            <TooltipTrigger asChild>
                                                                                <Badge className="bg-emerald-500 text-white text-[9px] font-semibold px-2 py-0.5 border-none shadow-sm flex items-center gap-1 cursor-help">
                                                                                    <Rocket size={10} /> {item.buy_signal_count} BUY Strategies
                                                                                </Badge>
                                                                            </TooltipTrigger>
                                                                            <TooltipContent className="p-3 bg-slate-900 text-white border-none shadow-sm rounded-xl">
                                                                                <div className="space-y-1.5">
                                                                                    {item.signals?.details.filter(s => s.signal === 'BUY').map((s, i) => (
                                                                                        <div key={i} className="flex justify-between items-center gap-4 text-[10px]">
                                                                                            <span className="text-slate-400">{s.strategy_name}</span>
                                                                                            <span className="font-semibold text-emerald-400">BUY</span>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            </TooltipContent>
                                                                        </Tooltip>
                                                                    ) : (
                                                                        item.signals ? (
                                                                            <Badge
                                                                                variant="outline"
                                                                                className={`
                                                                            ${item.signals.summary === 'BUY' ? 'bg-emerald-500/10 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/25 dark:border-emerald-500/25' : ''}
                                                                            ${item.signals.summary === 'SELL' ? 'bg-rose-500/10 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/25 dark:border-rose-500/25' : ''}
                                                                            ${item.signals.summary === 'HOLD' ? 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-400 border-slate-200 dark:border-slate-700' : ''}
                                                                            ${item.signals.summary === 'NEUTRAL' ? 'bg-gray-50 dark:bg-slate-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-slate-700' : ''}
                                                                            ${item.signals.summary === 'MIXED' ? 'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800' : ''}
                                                                        `}
                                                                            >
                                                                                {item.signals.summary}
                                                                            </Badge>
                                                                        ) : <span className="text-gray-300 dark:text-slate-700">--</span>
                                                                    )}
                                                                </div>
                                                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">Signal Sync</span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-right py-4">
                                                            <div className="flex flex-col items-end">
                                                                {item.upside_percent !== undefined && (
                                                                    <div className={`text-xs font-semibold ${item.upside_percent > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
                                                                        {item.upside_percent > 0 ? '+' : ''}{item.upside_percent.toFixed(1)}% Upside
                                                                    </div>
                                                                )}
                                                                {item.risk_reward_ratio !== undefined && item.risk_reward_ratio !== null ? (
                                                                    <div className="text-[10px] font-bold text-slate-700 dark:text-slate-300">
                                                                        R:R <span className="font-semibold">1:{item.risk_reward_ratio.toFixed(1)}</span>
                                                                    </div>
                                                                ) : (
                                                                    <div className="text-[9px] font-bold text-slate-400 uppercase">Set SL for R:R</div>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-right py-4">
                                                            <div className="flex flex-col items-end gap-1">
                                                                {item.days_to_book_closure !== undefined && item.days_to_book_closure !== null && (
                                                                    <Badge className="bg-amber-500 text-white text-[8px] font-semibold uppercase px-2 py-0 border-none flex items-center gap-1">
                                                                        <Calendar size={10} /> BC in {item.days_to_book_closure} Days
                                                                    </Badge>
                                                                )}
                                                                <div className="text-[10px] font-semibold text-slate-900 dark:text-slate-100 uppercase">
                                                                    {new Date(item.added_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                                                </div>
                                                                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider opacity-60">Timeline</span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="w-[80px] pr-6 text-right">
                                                            <div className="flex items-center justify-end gap-1 text-right">
                                                                <button
                                                                    onClick={() => handlePromoteToPortfolio(item.ticker)}
                                                                    className="p-1 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded transition-all transform hover:scale-110"
                                                                    title="Buy Now"
                                                                >
                                                                    <div className="bg-emerald-100 dark:bg-emerald-900/40 p-1.5 rounded-lg flex items-center gap-1">
                                                                        <PlusCircle size={14} />
                                                                        <span className="text-[10px] font-semibold uppercase tracking-tighter">Buy</span>
                                                                    </div>
                                                                </button>
                                                                <button
                                                                    onClick={() => handleEditWatchlist(item)}
                                                                    className="p-2 text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                                                                    title="Edit Strategy"
                                                                >
                                                                    <Edit2 size={16} />
                                                                </button>
                                                                <button
                                                                    onClick={() => removeWatchlistItem(item.id)}
                                                                    className="p-2 text-slate-400 dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-500/10 dark:hover:bg-rose-500/10 rounded-lg transition-colors"
                                                                    title="Remove surveillance"
                                                                >
                                                                    <Trash2 size={16} />
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
                                <div className="flex items-center justify-between mt-8 pt-6 border-t border-border pb-4 px-6">
                                    <div className="text-xs text-muted-foreground">
                                        Monitoring <span className="text-foreground font-semibold">{sortedAndFilteredWatchlist.length}</span> key tickers
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setWatchlistCurrentPage(p => Math.max(1, p - 1))}
                                            disabled={watchlistCurrentPage === 1}
                                            className="p-2 rounded-lg border border-border hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                                        >
                                            <ChevronLeft size={16} />
                                        </button>
                                        <span className="text-xs font-semibold px-4 py-2 bg-indigo-600 text-white rounded-lg shadow-sm">
                                            {watchlistCurrentPage} / {watchlistTotalPages}
                                        </span>
                                        <button
                                            onClick={() => setWatchlistCurrentPage(p => Math.min(watchlistTotalPages, p + 1))}
                                            disabled={watchlistCurrentPage === watchlistTotalPages}
                                            className="p-2 rounded-lg border border-border hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                                        >
                                            <ChevronRight size={16} />
                                        </button>
                                    </div>
                                </div>
                            )}
                    </SectionCard>
                    </FadeIn>
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
                        setDefaultModalAccount('');
                    }}
                    onSuccess={() => {
                        fetchPortfolio();
                        fetchAccounts();
                    }}
                    defaultTicker={promoteTicker}
                    defaultType={transactionType}
                    defaultAccount={defaultModalAccount}
                    accounts={accounts}
                />

                {/* Optimized Dialog Removed */}

                {/* Exit Strategy Dialog Removed - Now Inline */}


                {/* Watchlist Management Modal */}
                <Dialog open={isWatchlistModalOpen} onOpenChange={setIsWatchlistModalOpen}>
                    <DialogContent className="sm:max-w-[425px] overflow-hidden p-0 border-none shadow-sm dark:bg-slate-950">
                        <DialogHeader className="p-6 pb-0">
                            <DialogTitle className="text-2xl font-semibold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
                                <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                                    <Eye className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                                </div>
                                {selectedWatchlistItem ? 'Edit Watchlist Item' : 'Add to Watchlist'}
                            </DialogTitle>
                        </DialogHeader>

                        <div className="p-6 space-y-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 tracking-wider ml-1">Symbol</label>
                                {selectedWatchlistItem ? (
                                    <div className="h-12 flex items-center px-4 bg-slate-50 dark:bg-card border border-border dark:border-slate-800 rounded-xl font-medium text-lg text-slate-900 dark:text-slate-100">
                                        {selectedWatchlistItem.ticker}
                                    </div>
                                ) : (
                                    <CompanySelect
                                        value={watchlistForm.ticker}
                                        onChange={(val) => setWatchlistForm({ ...watchlistForm, ticker: val })}
                                        className="h-12 bg-white dark:bg-card border-blue-100 dark:border-slate-800 font-medium text-lg"
                                    />
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 tracking-wider ml-1">Target Price (रू)</label>
                                    <div className="relative">
                                        <Target className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500 dark:text-blue-400" />
                                        <Input
                                            placeholder="0.00"
                                            type="number"
                                            value={watchlistForm.target_price}
                                            onChange={(e) => setWatchlistForm({ ...watchlistForm, target_price: e.target.value })}
                                            className="pl-10 h-12 bg-white dark:bg-card border-blue-50 dark:border-slate-800 font-semibold text-slate-900 dark:text-slate-100 text-lg focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/30 placeholder:text-slate-300 dark:placeholder:text-slate-700"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 tracking-wider ml-1">Stop Loss (रू)</label>
                                    <div className="relative">
                                        <ShieldAlert className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-500 dark:text-red-400" />
                                        <Input
                                            placeholder="0.00"
                                            type="number"
                                            value={watchlistForm.stop_loss_price}
                                            onChange={(e) => setWatchlistForm({ ...watchlistForm, stop_loss_price: e.target.value })}
                                            className="pl-10 h-12 bg-white dark:bg-card border-blue-50 dark:border-slate-800 font-semibold text-slate-900 dark:text-slate-100 text-lg focus:ring-2 focus:ring-red-100 dark:focus:ring-red-900/30 placeholder:text-slate-300 dark:placeholder:text-slate-700"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center justify-between p-4 bg-blue-50/30 dark:bg-blue-900/10 rounded-xl border border-blue-100/50 dark:border-blue-900/30">
                                <div className="flex flex-col">
                                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 uppercase tracking-wide flex items-center gap-2">
                                        <Bell className="h-3.5 w-3.5 text-blue-500" /> Price Alerts
                                    </span>
                                    <span className="text-[10px] font-bold text-slate-500">Notify when target/SL hits</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setWatchlistForm({ ...watchlistForm, alert_enabled: !watchlistForm.alert_enabled })}
                                    className={`w-12 h-6 rounded-full transition-all relative ${watchlistForm.alert_enabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'}`}
                                >
                                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${watchlistForm.alert_enabled ? 'left-7' : 'left-1'}`} />
                                </button>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 tracking-wider ml-1">Watchlist Notes</label>
                                <textarea
                                    placeholder="Enter your investment thesis or entry notes..."
                                    value={watchlistForm.notes}
                                    onChange={(e) => setWatchlistForm({ ...watchlistForm, notes: e.target.value })}
                                    className="w-full min-h-[100px] p-3 rounded-xl border border-blue-50 dark:border-slate-800 bg-white dark:bg-card font-bold text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-300 dark:placeholder:text-slate-700 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/30 focus:outline-none transition-all"
                                />
                            </div>
                        </div>

                        <DialogFooter className="p-6 pt-2 bg-slate-50/50 dark:bg-card">
                            <div className="flex w-full gap-3">
                                <button
                                    onClick={() => setIsWatchlistModalOpen(false)}
                                    className="flex-1 h-12 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card text-[10px] font-semibold uppercase tracking-wider hover:bg-slate-50 dark:hover:bg-slate-800 transition-all text-slate-500 dark:text-slate-400"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={selectedWatchlistItem ? updateWatchlistItem : addWatchlistItem}
                                    className="flex-[2] h-12 rounded-xl bg-slate-900 dark:bg-slate-800 text-white text-[11px] font-semibold uppercase tracking-wider hover:bg-black dark:hover:bg-slate-700 transition-all shadow-lg flex items-center justify-center gap-2 group"
                                >
                                    {selectedWatchlistItem ? (
                                        <>Update <Target size={14} className="group-hover:scale-125 transition-transform" /></>
                                    ) : (
                                        <>Add <Plus size={14} className="group-hover:rotate-90 transition-transform" /></>
                                    )}
                                </button>
                            </div>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Position Sizing Calculator */}
                <PositionSizingCalculator
                    open={isPositionCalcOpen}
                    onOpenChange={setIsPositionCalcOpen}
                    accountId={selectedAccount}
                />

                {/* Floating Action Button for Position Calculator */}
                <button
                    onClick={() => setIsPositionCalcOpen(true)}
                    className="fixed bottom-6 right-6 bg-foreground text-background p-3 rounded-full shadow-md hover:opacity-90 transition-opacity z-50 group"
                    title="Position Sizing Calculator"
                >
                    <Calculator className="h-5 w-5" />
                    <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-popover text-popover-foreground border border-border px-2.5 py-1 rounded-md text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                        Position Sizing Calculator
                    </span>
                </button>
            </Tabs>

        </DashboardLayout >
    );
}

export default function PortfolioPage() {
    return (
        <React.Suspense fallback={<FullPageLoader />}>
            <PortfolioContent />
        </React.Suspense>
    );
}
