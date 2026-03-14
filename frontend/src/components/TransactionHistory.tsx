'use client';

import React, { useState, useEffect, useMemo } from 'react';
import api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
    Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
    Search, Trash2, Edit2, ChevronLeft, ChevronRight,
    ArrowUpDown, Calendar, Filter, AlertTriangle,
    TrendingUp, TrendingDown, Gift, RotateCcw, Download
} from 'lucide-react';
import { PageLoader } from '@/components/ui/StockLoader';
import { formatNepaliNumber, formatRupees } from '@/lib/formatters';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { exportToCsv } from '@/lib/csv';

interface Transaction {
    id: number;
    account: number | null;
    ticker: string;
    transaction_type: string;
    reason: string | null;
    quantity: number;
    rate: string;
    amount: string;
    commission: string;
    sebon_fee: string;
    dp_charge: string;
    cgt: string;
    receivable_amount: string;
    transaction_date: string;
    created_at: string;
}

interface TransactionHistoryProps {
    selectedAccount: string;
    onEdit?: (transaction: Transaction) => void;
}

const txnTypeConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    BUY: { label: 'BUY', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800', icon: <TrendingUp size={10} /> },
    SELL: { label: 'SELL', color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400 border-rose-200 dark:border-rose-800', icon: <TrendingDown size={10} /> },
    BONUS: { label: 'BONUS', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400 border-purple-200 dark:border-purple-800', icon: <Gift size={10} /> },
    DIVIDEND: { label: 'DIVIDEND', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 border-blue-200 dark:border-blue-800', icon: <Gift size={10} /> },
    SHORT_SELL: { label: 'SHORT', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 border-amber-200 dark:border-amber-800', icon: <TrendingDown size={10} /> },
    BUY_TO_COVER: { label: 'COVER', color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400 border-teal-200 dark:border-teal-800', icon: <RotateCcw size={10} /> },
};

export function TransactionHistory({ selectedAccount, onEdit }: TransactionHistoryProps) {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState('ALL');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({
        key: 'transaction_date', direction: 'desc'
    });
    const pageSize = 15;

    const fetchTransactions = async () => {
        setLoading(true);
        try {
            const response = await api.get('/api/stocks/transactions/');
            setTransactions(Array.isArray(response.data) ? response.data : response.data.results || []);
        } catch (err) {
            console.error('Failed to fetch transactions', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTransactions();
    }, []);

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to delete this transaction? Portfolio holdings will be recalculated.')) return;
        try {
            await api.delete(`/api/stocks/transactions/${id}/`);
            fetchTransactions();
        } catch (err) {
            console.error('Failed to delete transaction', err);
        }
    };

    const filtered = useMemo(() => {
        let result = transactions;

        // Account filter
        if (selectedAccount !== 'all') {
            result = result.filter(t => t.account?.toString() === selectedAccount);
        }

        // Search
        if (searchQuery) {
            result = result.filter(t => t.ticker.toLowerCase().includes(searchQuery.toLowerCase()));
        }

        // Type filter
        if (typeFilter !== 'ALL') {
            result = result.filter(t => t.transaction_type === typeFilter);
        }

        // Date range
        if (fromDate) {
            result = result.filter(t => new Date(t.transaction_date) >= new Date(fromDate));
        }
        if (toDate) {
            result = result.filter(t => new Date(t.transaction_date) <= new Date(toDate + 'T23:59:59'));
        }

        // Sort
        result.sort((a, b) => {
            let aVal: any = (a as any)[sortConfig.key];
            let bVal: any = (b as any)[sortConfig.key];

            if (sortConfig.key === 'transaction_date') {
                aVal = new Date(aVal).getTime();
                bVal = new Date(bVal).getTime();
            } else if (!isNaN(Number(aVal))) {
                aVal = Number(aVal);
                bVal = Number(bVal);
            }

            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return result;
    }, [transactions, selectedAccount, searchQuery, typeFilter, fromDate, toDate, sortConfig]);

    const totalPages = Math.ceil(filtered.length / pageSize);
    const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    const handleSort = (key: string) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
        }));
        setCurrentPage(1);
    };

    // Summary stats
    const stats = useMemo(() => {
        const total = filtered.reduce((sum, t) => sum + Number(t.amount), 0);
        const buys = filtered.filter(t => t.transaction_type === 'BUY');
        const sells = filtered.filter(t => t.transaction_type === 'SELL');
        const totalBuy = buys.reduce((sum, t) => sum + Number(t.amount), 0);
        const totalSell = sells.reduce((sum, t) => sum + Number(t.amount), 0);
        const totalCGT = filtered.reduce((sum, t) => sum + Number(t.cgt), 0);
        return { total, totalBuy, totalSell, totalCGT, buyCount: buys.length, sellCount: sells.length, count: filtered.length };
    }, [filtered]);

    if (loading) {
        return <PageLoader />;
    }

    return (
        <div className="space-y-6">
            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 p-4 shadow-sm">
                    <div className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Total Transactions</div>
                    <div className="text-2xl font-black text-slate-900 dark:text-slate-100">{stats.count}</div>
                    <div className="flex gap-2 mt-1">
                        <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 rounded">{stats.buyCount} Buys</span>
                        <span className="text-[9px] font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30 px-1.5 rounded">{stats.sellCount} Sells</span>
                    </div>
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 p-4 shadow-sm">
                    <div className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Total Bought</div>
                    <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{formatRupees(stats.totalBuy)}</div>
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 p-4 shadow-sm">
                    <div className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Total Sold</div>
                    <div className="text-2xl font-black text-rose-600 dark:text-rose-400">{formatRupees(stats.totalSell)}</div>
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 p-4 shadow-sm">
                    <div className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">CGT Paid</div>
                    <div className="text-2xl font-black text-amber-600 dark:text-amber-400">{formatRupees(stats.totalCGT)}</div>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 dark:text-slate-500" />
                    <Input
                        placeholder="Search ticker..."
                        value={searchQuery}
                        onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                        className="pl-9 h-9 text-xs font-medium bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700 dark:text-slate-200"
                    />
                </div>

                <Select value={typeFilter} onValueChange={(val) => { setTypeFilter(val); setCurrentPage(1); }}>
                    <SelectTrigger className="w-[140px] h-9 text-xs font-medium dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200">
                        <Filter className="h-3 w-3 mr-1.5 text-slate-400" />
                        <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="ALL">All Types</SelectItem>
                        <SelectItem value="BUY">Buy</SelectItem>
                        <SelectItem value="SELL">Sell</SelectItem>
                        <SelectItem value="BONUS">Bonus</SelectItem>
                        <SelectItem value="DIVIDEND">Dividend</SelectItem>
                        <SelectItem value="SHORT_SELL">Short Sell</SelectItem>
                        <SelectItem value="BUY_TO_COVER">Buy to Cover</SelectItem>
                    </SelectContent>
                </Select>

                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
                        <input
                            type="date"
                            value={fromDate}
                            onChange={(e) => { setFromDate(e.target.value); setCurrentPage(1); }}
                            className="pl-7 pr-2 h-9 border border-gray-200 dark:border-slate-700 rounded-md text-xs font-medium bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
                        />
                    </div>
                    <span className="text-xs text-slate-400 font-bold">to</span>
                    <div className="relative">
                        <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
                        <input
                            type="date"
                            value={toDate}
                            onChange={(e) => { setToDate(e.target.value); setCurrentPage(1); }}
                            className="pl-7 pr-2 h-9 border border-gray-200 dark:border-slate-700 rounded-md text-xs font-medium bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
                        />
                    </div>
                </div>

                {(searchQuery || typeFilter !== 'ALL' || fromDate || toDate) && (
                    <button
                        onClick={() => { setSearchQuery(''); setTypeFilter('ALL'); setFromDate(''); setToDate(''); setCurrentPage(1); }}
                        className="h-9 px-3 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900 hover:border-red-200 dark:hover:border-red-800 transition-all"
                    >
                        Clear Filters
                    </button>
                )}

                <button
                    onClick={() => {
                        const columns = [
                            { key: 'date', header: 'Date' },
                            { key: 'ticker', header: 'Ticker' },
                            { key: 'type', header: 'Type' },
                            { key: 'quantity', header: 'Quantity' },
                            { key: 'rate', header: 'Rate' },
                            { key: 'amount', header: 'Amount' },
                            { key: 'commission', header: 'Commission' },
                            { key: 'cgt', header: 'CGT' },
                            { key: 'net_amount', header: 'Net Amount' }
                        ];
                        const dataToExport = filtered.map(t => ({
                            date: new Date(t.transaction_date).toLocaleDateString(),
                            ticker: t.ticker,
                            type: t.transaction_type,
                            quantity: t.quantity,
                            rate: t.rate,
                            amount: t.amount,
                            commission: t.commission,
                            cgt: t.cgt,
                            net_amount: t.receivable_amount
                        }));
                        exportToCsv(
                            `transactions_${selectedAccount}_${new Date().toISOString().split('T')[0]}.csv`,
                            dataToExport,
                            columns as any
                        );
                    }}
                    className="h-9 px-3 flex items-center gap-2 text-xs font-bold text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded-md bg-blue-50/50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-all ml-auto"
                >
                    <Download size={14} /> Export CSV
                </button>
            </div>

            {/* Table */}
            <Card className="shadow-sm dark:bg-slate-900 dark:border-slate-800 overflow-hidden">
                <CardContent className="p-0">
                    {filtered.length === 0 ? (
                        <div className="text-center py-16 text-gray-500 dark:text-gray-400 flex flex-col items-center gap-2">
                            <AlertTriangle className="h-8 w-8 text-gray-300 dark:text-gray-700" />
                            <p className="text-sm font-medium">No transactions found matching your filters.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-gray-50/50 dark:bg-slate-800/30 hover:bg-gray-50/50 dark:hover:bg-slate-800/30">
                                        <TableHead className="w-[50px] font-bold text-gray-900 dark:text-slate-100 text-center px-4">SN</TableHead>
                                        <TableHead className="font-bold text-gray-900 dark:text-slate-100 cursor-pointer select-none" onClick={() => handleSort('transaction_date')}>
                                            <div className="flex items-center gap-1">Date <ArrowUpDown size={12} className="opacity-50" /></div>
                                        </TableHead>
                                        <TableHead className="font-bold text-gray-900 dark:text-slate-100 cursor-pointer select-none" onClick={() => handleSort('ticker')}>
                                            <div className="flex items-center gap-1">Ticker <ArrowUpDown size={12} className="opacity-50" /></div>
                                        </TableHead>
                                        <TableHead className="text-center font-bold text-gray-900 dark:text-slate-100">Type</TableHead>
                                        <TableHead className="text-right font-bold text-gray-900 dark:text-slate-100 cursor-pointer select-none" onClick={() => handleSort('quantity')}>
                                            <div className="flex items-center justify-end gap-1">Qty <ArrowUpDown size={12} className="opacity-50" /></div>
                                        </TableHead>
                                        <TableHead className="text-right font-bold text-gray-900 dark:text-slate-100 cursor-pointer select-none" onClick={() => handleSort('rate')}>
                                            <div className="flex items-center justify-end gap-1">Rate <ArrowUpDown size={12} className="opacity-50" /></div>
                                        </TableHead>
                                        <TableHead className="text-right font-bold text-gray-900 dark:text-slate-100 cursor-pointer select-none" onClick={() => handleSort('amount')}>
                                            <div className="flex items-center justify-end gap-1">Amount <ArrowUpDown size={12} className="opacity-50" /></div>
                                        </TableHead>
                                        <TableHead className="text-right font-bold text-gray-900 dark:text-slate-100">Commission</TableHead>
                                        <TableHead className="text-right font-bold text-gray-900 dark:text-slate-100">CGT</TableHead>
                                        <TableHead className="text-right font-bold text-gray-900 dark:text-slate-100">Net Amount</TableHead>
                                        <TableHead className="w-[80px]"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {paginated.map((txn, idx) => {
                                        const config = txnTypeConfig[txn.transaction_type] || { label: txn.transaction_type, color: 'bg-gray-100 text-gray-700', icon: null };
                                        return (
                                            <TableRow key={txn.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                                                <TableCell className="text-center text-gray-400 dark:text-gray-500 text-sm font-bold px-4">
                                                    {(currentPage - 1) * pageSize + idx + 1}
                                                </TableCell>
                                                <TableCell className="text-sm text-slate-600 dark:text-slate-400 font-medium">
                                                    <div className="flex flex-col">
                                                        <span>{new Date(txn.transaction_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                                                        <span className="text-[10px] text-slate-400 dark:text-slate-600">{new Date(txn.transaction_date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="font-black text-slate-900 dark:text-slate-100">{txn.ticker}</TableCell>
                                                <TableCell className="text-center">
                                                    <Badge variant="secondary" className={`${config.color} text-[9px] font-black uppercase tracking-wider px-2 py-0.5 border flex items-center gap-1 w-fit mx-auto`}>
                                                        {config.icon} {config.label}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right font-bold text-slate-700 dark:text-slate-300">{formatNepaliNumber(txn.quantity)}</TableCell>
                                                <TableCell className="text-right font-medium text-slate-600 dark:text-slate-400">{formatNepaliNumber(Number(txn.rate).toFixed(2))}</TableCell>
                                                <TableCell className="text-right font-black text-slate-900 dark:text-slate-100">{formatRupees(Number(txn.amount))}</TableCell>
                                                <TableCell className="text-right text-xs text-slate-500 dark:text-slate-400">
                                                    {formatNepaliNumber(Number(txn.commission).toFixed(2))}
                                                </TableCell>
                                                <TableCell className="text-right text-xs font-bold text-amber-600 dark:text-amber-400">
                                                    {Number(txn.cgt) > 0 ? formatNepaliNumber(Number(txn.cgt).toFixed(2)) : '—'}
                                                </TableCell>
                                                <TableCell className={`text-right font-black ${txn.transaction_type === 'SELL' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-slate-100'}`}>
                                                    {formatRupees(Number(txn.receivable_amount))}
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <div className="flex justify-center gap-1">
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); onEdit?.(txn); }}
                                                                    className="p-1.5 text-gray-300 dark:text-slate-600 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-all"
                                                                >
                                                                    <Edit2 size={14} />
                                                                </button>
                                                            </TooltipTrigger>
                                                            <TooltipContent><p>Edit</p></TooltipContent>
                                                        </Tooltip>
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); handleDelete(txn.id); }}
                                                                    className="p-1.5 text-gray-300 dark:text-slate-600 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                                                                >
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            </TooltipTrigger>
                                                            <TooltipContent><p>Delete</p></TooltipContent>
                                                        </Tooltip>
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
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-4 px-6 border-t border-gray-50 dark:border-slate-800">
                            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 tracking-wide">
                                Showing {(currentPage - 1) * pageSize + 1} – {Math.min(currentPage * pageSize, filtered.length)} of {filtered.length}
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="p-2 rounded-lg border border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-30 transition-all"
                                >
                                    <ChevronLeft size={16} />
                                </button>
                                <div className="flex items-center gap-1">
                                    {[...Array(Math.min(totalPages, 5))].map((_, i) => {
                                        let pageNum: number;
                                        if (totalPages <= 5) {
                                            pageNum = i + 1;
                                        } else if (currentPage <= 3) {
                                            pageNum = i + 1;
                                        } else if (currentPage >= totalPages - 2) {
                                            pageNum = totalPages - 4 + i;
                                        } else {
                                            pageNum = currentPage - 2 + i;
                                        }
                                        return (
                                            <button
                                                key={pageNum}
                                                onClick={() => setCurrentPage(pageNum)}
                                                className={`h-8 w-8 rounded-lg text-xs font-bold transition-all ${currentPage === pageNum ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800'}`}
                                            >
                                                {pageNum}
                                            </button>
                                        );
                                    })}
                                </div>
                                <button
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className="p-2 rounded-lg border border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-30 transition-all"
                                >
                                    <ChevronRight size={16} />
                                </button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
