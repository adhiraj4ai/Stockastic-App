'use client';

import React, { useEffect, useState, useMemo } from 'react';
import api from '@/lib/api';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CompanySelect } from '@/components/CompanySelect';
import StockLink from '@/components/StockLink';
import TransactionModal, { PortfolioAccount } from '@/components/TransactionModal';
import { formatRupees } from '@/lib/formatters';
import {
    Search, Plus, Eye, Bell, TrendingUp, TrendingDown,
    Edit2, Trash2, PlusCircle, Target, ShieldAlert,
    Calendar, Zap, Rocket, ChevronLeft, ChevronRight, Download
} from 'lucide-react';
import { exportToCsv } from '@/lib/csv';
import { DatePicker } from '@/components/ui/DatePicker';
import { format } from 'date-fns';

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

export default function WatchlistPage() {
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
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [promoteTicker, setPromoteTicker] = useState('');
    const [accounts, setAccounts] = useState<PortfolioAccount[]>([]);
    const [fromDate, setFromDate] = useState<Date>();
    const [toDate, setToDate] = useState<Date>();
    const pageSize = 10;

    const fetchWatchlist = async () => {
        try {
            const response = await api.get('/api/stocks/watchlist/');
            setWatchlist(response.data);
        } catch (err) {
            console.error('Failed to fetch watchlist', err);
        }
    };

    const fetchAccounts = async () => {
        try {
            const response = await api.get('/api/stocks/accounts/');
            setAccounts(response.data);
        } catch (err) {
            console.error('Failed to fetch accounts', err);
        }
    };

    useEffect(() => {
        fetchWatchlist();
        fetchAccounts();
    }, []);

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

    const removeWatchlistItem = async (id: number) => {
        if (!confirm('Remove this ticker from your watchlist?')) return;
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
            setWatchlist(prev => prev.map(i => i.id === item.id ? { ...i, alert_enabled: !i.alert_enabled } : i));
        } catch (err) {
            console.error('Failed to toggle alert', err);
        }
    };

    const sortedAndFiltered = useMemo(() => {
        let result = watchlist.filter(item =>
            item.ticker.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (item.sector && item.sector.toLowerCase().includes(searchQuery.toLowerCase()))
        );

        if (fromDate) {
            result = result.filter(item => new Date(item.added_at).getTime() >= fromDate.getTime());
        }
        if (toDate) {
            const endOfDay = new Date(toDate);
            endOfDay.setHours(23, 59, 59, 999);
            result = result.filter(item => new Date(item.added_at).getTime() <= endOfDay.getTime());
        }

        return result.sort((a, b) => a.ticker.localeCompare(b.ticker));
    }, [watchlist, searchQuery, fromDate, toDate]);

    const paginated = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return sortedAndFiltered.slice(start, start + pageSize);
    }, [sortedAndFiltered, currentPage]);

    const totalPages = Math.ceil(sortedAndFiltered.length / pageSize);

    const handleExportCsv = () => {
        exportToCsv('watchlist.csv', sortedAndFiltered, [
            { key: 'ticker', header: 'Ticker' },
            { key: 'sector', header: 'Sector' },
            { key: 'current_price', header: 'LTP' },
            { key: 'day_change', header: 'Day Change' },
            { key: 'day_change_percent', header: 'Day Change %' },
            { key: 'target_price', header: 'Target Price' },
            { key: 'stop_loss_price', header: 'Stop Loss' },
            { key: 'health_score', header: 'Health Score' },
            { key: 'upside_percent', header: 'Upside %' },
            { key: 'risk_reward_ratio', header: 'R:R Ratio' },
            { key: 'added_at', header: 'Added' },
            { key: 'notes', header: 'Notes' },
        ]);
    };

    return (
        <DashboardLayout
            title="Watchlist"
            subtitle="Monitor potential entries and track performance"
        >
            <TooltipProvider>
                <Card className="shadow-lg border-border dark:border-slate-800 dark:bg-card">
                    <CardHeader className="border-b border-gray-50 dark:border-slate-800 pb-2">
                        <CardTitle className="text-xl font-semibold text-slate-900 dark:text-slate-100 tracking-tight flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 dark:text-slate-500" />
                                    <Input
                                        placeholder="Quick filter..."
                                        value={searchQuery}
                                        onChange={(e) => {
                                            setSearchQuery(e.target.value);
                                            setCurrentPage(1);
                                        }}
                                        className="pl-9 h-9 w-48 text-xs font-medium bg-gray-50/50 dark:bg-slate-800 border-gray-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-900 dark:text-slate-100 transition-all"
                                    />
                                </div>
                                <div className="flex items-center gap-2">
                                    <DatePicker
                                        date={fromDate}
                                        setDate={(date) => { setFromDate(date); setCurrentPage(1); }}
                                        placeholder="From"
                                        className="h-9 w-32 text-[10px]"
                                    />
                                    <span className="text-[10px] font-bold text-slate-400">to</span>
                                    <DatePicker
                                        date={toDate}
                                        setDate={(date) => { setToDate(date); setCurrentPage(1); }}
                                        placeholder="To"
                                        className="h-9 w-32 text-[10px]"
                                    />
                                </div>
                                {(searchQuery || fromDate || toDate) && (
                                    <button
                                        onClick={() => {
                                            setSearchQuery('');
                                            setFromDate(undefined);
                                            setToDate(undefined);
                                            setCurrentPage(1);
                                        }}
                                        className="h-9 px-3 text-[10px] font-semibold text-slate-500 hover:text-red-500 transition-colors uppercase tracking-wider"
                                    >
                                        Clear
                                    </button>
                                )}
                                <button
                                    onClick={() => {
                                        setSelectedWatchlistItem(null);
                                        setWatchlistForm({ ticker: '', target_price: '', stop_loss_price: '', alert_enabled: false, notes: '' });
                                        setIsWatchlistModalOpen(true);
                                    }}
                                    className="h-9 px-4 flex items-center gap-2 bg-primary text-primary-foreground rounded-md text-[11px] font-semibold hover:bg-primary/90 transition-all uppercase tracking-wider shadow-md whitespace-nowrap"
                                >
                                    <Plus size={14} /> Add
                                </button>
                                <button
                                    onClick={handleExportCsv}
                                    className="h-9 px-3 flex items-center gap-2 border border-border text-gray-600 dark:text-slate-400 rounded-md text-[11px] font-semibold hover:bg-accent hover:text-accent-foreground transition-all uppercase tracking-wider"
                                    title="Export CSV"
                                >
                                    <Download size={14} /> CSV
                                </button>
                            </div>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 p-0">
                        {paginated.length === 0 ? (
                            <div className="text-center py-20 text-gray-500 dark:text-gray-400 flex flex-col items-center gap-2">
                                <Eye className="h-10 w-10 text-gray-200 dark:text-gray-800" />
                                <p className="text-sm font-medium italic">Your watchlist is empty. Add tickers to monitor entry levels.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-gray-50/50 dark:bg-slate-800/50 hover:bg-transparent">
                                            <TableHead className="font-bold text-gray-900 dark:text-slate-100 px-6">Ticker</TableHead>
                                            <TableHead className="text-right font-bold text-gray-900 dark:text-slate-100">LTP (रू)</TableHead>
                                            <TableHead className="text-right font-bold text-gray-900 dark:text-slate-100">Day Change</TableHead>
                                            <TableHead className="text-center font-bold text-gray-900 dark:text-slate-100">Health</TableHead>
                                            <TableHead className="text-right font-bold text-gray-900 dark:text-slate-100">Smart Money / RVOL</TableHead>
                                            <TableHead className="text-center font-bold text-gray-900 dark:text-slate-100">52W Range</TableHead>
                                            <TableHead className="text-right font-bold text-gray-900 dark:text-slate-100">Strategy Sync</TableHead>
                                            <TableHead className="text-right font-bold text-gray-900 dark:text-slate-100">R:R / Upside</TableHead>
                                            <TableHead className="text-right font-bold text-gray-900 dark:text-slate-100">Timeline</TableHead>
                                            <TableHead className="w-[80px] pr-6"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {paginated.map((item) => {
                                            const dayChange = Number(item.day_change);
                                            const isPos = dayChange >= 0;

                                            return (
                                                <TableRow key={item.id} className="hover:bg-accent hover:text-accent-foreground border-b border-gray-50 dark:border-slate-800 last:border-0 group transition-all">
                                                    <TableCell className="py-4 px-6 relative">
                                                        <div className="flex flex-col">
                                                            <div className="flex items-center gap-2">
                                                                <StockLink ticker={item.ticker} className="font-semibold text-slate-900 dark:text-slate-100 text-sm" />
                                                                <button
                                                                    onClick={() => toggleWatchlistAlert(item)}
                                                                    className={`p-1 rounded-full transition-all ${item.alert_enabled ? 'text-primary bg-primary/10' : 'text-slate-300 dark:text-slate-700 hover:text-primary'}`}
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
                                                        <div className="flex flex-col items-end">
                                                            <div className={`font-semibold flex items-center gap-1 ${isPos ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                                                {isPos ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                                                {isPos ? '+' : ''}{dayChange.toFixed(1)}
                                                            </div>
                                                            <div className={`text-[10px] font-semibold uppercase tracking-tighter px-1 rounded ${isPos ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400'}`}>
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
                                                                        className={`font-bold transition-all px-2 py-0.5 text-[10px] ${item.health_score >= 70 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' :
                                                                            item.health_score >= 40 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' :
                                                                                'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
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
                                                                        <Badge className="bg-primary/10 text-primary text-[8px] font-semibold uppercase tracking-wider px-1.5 py-0 border-none cursor-help">
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
                                                                    <div className={`font-semibold text-sm ${item.rvol > 2 ? 'text-primary font-bold' : item.rvol > 1 ? 'text-primary' : 'text-slate-500 dark:text-slate-400'}`}>
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
                                                                        className="absolute top-0 h-full bg-primary/40"
                                                                        style={{
                                                                            left: '0',
                                                                            width: `${((Number(item.current_price) - item.fifty_two_week_low) / (item.fifty_two_week_high - item.fifty_two_week_low)) * 100}%`
                                                                        }}
                                                                    />
                                                                    <div
                                                                        className="absolute top-0 h-full w-1 bg-primary shadow-sm"
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
                                                                    <Badge className="bg-primary text-primary-foreground text-[8px] font-semibold uppercase px-1.5 py-0 animate-pulse border-none">
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
                                                                        ${item.signals.summary === 'BUY' ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800' : ''}
                                                                        ${item.signals.summary === 'SELL' ? 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800' : ''}
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
                                                                <div className={`text-xs font-semibold ${item.upside_percent > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
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
                                                                onClick={() => {
                                                                    setPromoteTicker(item.ticker);
                                                                    setIsModalOpen(true);
                                                                }}
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
                                                                className="p-2 text-slate-400 dark:text-slate-500 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                                                                title="Edit Strategy"
                                                            >
                                                                <Edit2 size={16} />
                                                            </button>
                                                            <button
                                                                onClick={() => removeWatchlistItem(item.id)}
                                                                className="p-2 text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                                                title="Remove"
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

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-50 dark:border-slate-800 pb-4 px-6">
                                <div className="text-[10px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em]">
                                    Monitoring <span className="text-gray-900 dark:text-slate-100">{sortedAndFiltered.length}</span> key tickers
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        disabled={currentPage === 1}
                                        className="p-2 rounded-lg border border-border hover:bg-accent hover:text-accent-foreground disabled:opacity-20 transition-all font-semibold text-gray-600 dark:text-slate-400"
                                    >
                                        <ChevronLeft size={16} />
                                    </button>
                                    <span className="text-xs font-semibold px-4 py-2 bg-primary text-primary-foreground rounded-lg shadow-lg">
                                        {currentPage} / {totalPages}
                                    </span>
                                    <button
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        disabled={currentPage === totalPages}
                                        className="p-2 rounded-lg border border-border hover:bg-accent hover:text-accent-foreground disabled:opacity-20 transition-all font-semibold text-gray-600 dark:text-slate-400"
                                    >
                                        <ChevronRight size={16} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Watchlist Management Modal */}
                <Dialog open={isWatchlistModalOpen} onOpenChange={setIsWatchlistModalOpen}>
                    <DialogContent className="sm:max-w-[425px] overflow-hidden p-0 border-none shadow-sm dark:bg-slate-950">
                        <DialogHeader className="p-6 pb-0">
                            <DialogTitle className="text-2xl font-semibold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
                                <div className="p-2 bg-primary/10 rounded-lg">
                                    <Eye className="h-5 w-5 text-primary" />
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
                                        className="h-12 bg-white dark:bg-card border-border dark:border-slate-800 font-medium text-lg"
                                    />
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 tracking-wider ml-1">Target Price (रू)</label>
                                    <div className="relative">
                                        <Target className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
                                        <Input
                                            placeholder="0.00"
                                            type="number"
                                            value={watchlistForm.target_price}
                                            onChange={(e) => setWatchlistForm({ ...watchlistForm, target_price: e.target.value })}
                                            className="pl-10 h-12 bg-white dark:bg-card border-border font-semibold text-slate-900 dark:text-slate-100 text-lg focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring placeholder:text-slate-300 dark:placeholder:text-slate-700"
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
                                            className="pl-10 h-12 bg-white dark:bg-card border-slate-100 dark:border-slate-800 font-semibold text-slate-900 dark:text-slate-100 text-lg focus:ring-2 focus:ring-red-100 dark:focus:ring-red-900/30 placeholder:text-slate-300 dark:placeholder:text-slate-700"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center justify-between p-4 bg-primary/5 dark:bg-primary/10 rounded-xl border border-primary/20 dark:border-primary/30">
                                <div className="flex flex-col">
                                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 uppercase tracking-wide flex items-center gap-2">
                                        <Bell className="h-3.5 w-3.5 text-primary" /> Price Alerts
                                    </span>
                                    <span className="text-[10px] font-bold text-slate-500">Notify when target/SL hits</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setWatchlistForm({ ...watchlistForm, alert_enabled: !watchlistForm.alert_enabled })}
                                    className={`w-12 h-6 rounded-full transition-all relative ${watchlistForm.alert_enabled ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-700'}`}
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
                                    className="w-full min-h-[100px] p-3 rounded-xl border border-border dark:border-slate-800 bg-white dark:bg-card font-bold text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-300 dark:placeholder:text-slate-700 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring focus:outline-none transition-all"
                                />
                            </div>
                        </div>

                        <DialogFooter className="p-6 pt-2 bg-slate-50/50 dark:bg-card">
                            <div className="flex w-full gap-3">
                                <button
                                    onClick={() => setIsWatchlistModalOpen(false)}
                                    className="flex-1 h-12 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card text-[10px] font-semibold uppercase tracking-wider hover:bg-accent hover:text-accent-foreground transition-all text-slate-500 dark:text-slate-400"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={selectedWatchlistItem ? updateWatchlistItem : addWatchlistItem}
                                    className="flex-[2] h-12 rounded-xl bg-primary text-primary-foreground text-[11px] font-semibold uppercase tracking-wider hover:bg-primary/90 transition-all shadow-lg flex items-center justify-center gap-2 group"
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

                {/* Transaction Modal for "Buy Now" */}
                <TransactionModal
                    isOpen={isModalOpen}
                    onClose={() => {
                        setIsModalOpen(false);
                        setPromoteTicker('');
                    }}
                    onSuccess={() => {}}
                    defaultTicker={promoteTicker}
                    defaultType="BUY"
                    accounts={accounts}
                />
            </TooltipProvider>
        </DashboardLayout>
    );
}
