'use client';

import React, { useState, useEffect, useMemo } from 'react';
import api from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
    TrendingUp, TrendingDown, DollarSign, Target, Award, Loader2, AlertTriangle
} from 'lucide-react';
import { formatRupees } from '@/lib/formatters';

interface RealizedPnLData {
    summary: {
        total_realized_pnl: number;
        total_cgt_paid: number;
        net_after_tax: number;
        total_trades: number;
        win_rate: number;
    };
    per_ticker: Array<{
        ticker: string;
        total_sold_qty: number;
        avg_sell_price: number;
        avg_cost: number;
        realized_pnl: number;
        cgt_paid: number;
        commission: number;
        fees: number;
        sell_count: number;
        profitable_sells: number;
    }>;
}

interface RealizedPnLProps {
    selectedAccount: string;
}

export function RealizedPnL({ selectedAccount }: RealizedPnLProps) {
    const [data, setData] = useState<RealizedPnLData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const response = await api.get('/api/stocks/transactions/realized_pnl/', {
                    params: { account: selectedAccount }
                });
                setData(response.data);
            } catch (err) {
                console.error('Failed to fetch realized P&L', err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [selectedAccount]);

    if (loading) {
        return (
            <div className="flex justify-center items-center h-32">
                <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
            </div>
        );
    }

    if (!data || data.per_ticker.length === 0) {
        return (
            <div className="flex items-center justify-center gap-2 py-8 text-slate-400 dark:text-slate-500">
                <AlertTriangle size={16} />
                <span className="text-sm font-medium">No realized trades yet.</span>
            </div>
        );
    }

    const { summary, per_ticker } = data;
    const isPositive = summary.total_realized_pnl >= 0;

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className={`rounded-xl p-4 border shadow-sm ${isPositive
                    ? 'bg-gradient-to-br from-emerald-50 to-emerald-100/30 dark:from-emerald-900/20 dark:to-emerald-950/30 border-emerald-200 dark:border-emerald-800'
                    : 'bg-gradient-to-br from-rose-50 to-rose-100/30 dark:from-rose-900/20 dark:to-rose-950/30 border-rose-200 dark:border-rose-800'
                }`}>
                    <div className="flex items-center gap-1.5 mb-1">
                        {isPositive ? <TrendingUp size={14} className="text-emerald-600 dark:text-emerald-400" /> : <TrendingDown size={14} className="text-rose-600 dark:text-rose-400" />}
                        <span className="text-[10px] font-medium tracking-tight text-slate-500 dark:text-slate-400">Realized p&l</span>
                    </div>
                    <div className={`text-2xl font-bold tracking-tight ${isPositive ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
                        {isPositive ? '+' : ''}{formatRupees(summary.total_realized_pnl)}
                    </div>
                </div>

                <div className="bg-white dark:bg-card rounded-xl border border-amber-100 dark:border-amber-900/30 p-4 shadow-sm">
                    <div className="flex items-center gap-1.5 mb-1">
                        <DollarSign size={14} className="text-amber-600 dark:text-amber-400" />
                        <span className="text-[10px] font-medium tracking-tight text-slate-500 dark:text-slate-400">CGT paid</span>
                    </div>
                    <div className="text-2xl font-bold text-amber-700 dark:text-amber-400 tracking-tight">
                        {formatRupees(summary.total_cgt_paid)}
                    </div>
                </div>

                <div className="bg-white dark:bg-card rounded-xl border border-blue-100 dark:border-blue-900/30 p-4 shadow-sm">
                    <div className="flex items-center gap-1.5 mb-1">
                        <Target size={14} className="text-blue-600 dark:text-blue-400" />
                        <span className="text-[10px] font-medium tracking-tight text-slate-500 dark:text-slate-400">Total trades</span>
                    </div>
                    <div className="text-2xl font-bold text-blue-700 dark:text-blue-400 tracking-tight">
                        {summary.total_trades}
                    </div>
                </div>

                <div className="bg-white dark:bg-card rounded-xl border border-purple-100 dark:border-purple-900/30 p-4 shadow-sm">
                    <div className="flex items-center gap-1.5 mb-1">
                        <Award size={14} className="text-purple-600 dark:text-purple-400" />
                        <span className="text-[10px] font-medium tracking-tight text-slate-500 dark:text-slate-400">Win rate</span>
                    </div>
                    <div className="text-2xl font-bold text-purple-700 dark:text-purple-400 tracking-tight">
                        {summary.win_rate}%
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full mt-2 overflow-hidden">
                        <div
                            className={`h-full rounded-full transition-all ${summary.win_rate >= 60 ? 'bg-emerald-500' : summary.win_rate >= 40 ? 'bg-amber-500' : 'bg-rose-500'}`}
                            style={{ width: `${summary.win_rate}%` }}
                        />
                    </div>
                </div>
            </div>

            {/* Per-Ticker Breakdown */}
            <Card className="shadow-sm dark:bg-card dark:border-slate-800 overflow-hidden">
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-gray-50/50 dark:bg-slate-800/30">
                                    <TableHead className="font-semibold text-gray-900 dark:text-slate-100 tracking-tight">Ticker</TableHead>
                                    <TableHead className="text-right font-semibold text-gray-900 dark:text-slate-100 tracking-tight">Sold qty</TableHead>
                                    <TableHead className="text-right font-semibold text-gray-900 dark:text-slate-100 tracking-tight">Avg cost</TableHead>
                                    <TableHead className="text-right font-semibold text-gray-900 dark:text-slate-100 tracking-tight">Avg sell</TableHead>
                                    <TableHead className="text-right font-semibold text-gray-900 dark:text-slate-100 tracking-tight">Realized p&l</TableHead>
                                    <TableHead className="text-right font-semibold text-gray-900 dark:text-slate-100 tracking-tight">CGT</TableHead>
                                    <TableHead className="text-center font-semibold text-gray-900 dark:text-slate-100 tracking-tight">Win rate</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {per_ticker.map((item) => {
                                    const isProfit = item.realized_pnl >= 0;
                                    const tickerWinRate = item.sell_count > 0 ? (item.profitable_sells / item.sell_count * 100) : 0;
                                    return (
                                        <TableRow key={item.ticker} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                                            <TableCell className="font-semibold text-slate-900 dark:text-slate-100 tracking-tight">{item.ticker}</TableCell>
                                            <TableCell className="text-right font-semibold text-slate-600 dark:text-slate-400 tracking-tight">{item.total_sold_qty}</TableCell>
                                            <TableCell className="text-right font-normal text-slate-600 dark:text-slate-400 tracking-tight">{formatRupees(item.avg_cost)}</TableCell>
                                            <TableCell className="text-right font-normal text-slate-600 dark:text-slate-400 tracking-tight">{formatRupees(item.avg_sell_price)}</TableCell>
                                            <TableCell className={`text-right font-semibold tracking-tight ${isProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                                {isProfit ? '+' : ''}{formatRupees(item.realized_pnl)}
                                            </TableCell>
                                            <TableCell className="text-right text-xs font-semibold text-amber-600 dark:text-amber-400 tracking-tight">
                                                {item.cgt_paid > 0 ? formatRupees(item.cgt_paid) : '—'}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <Badge variant="secondary" className={`text-[9px] font-semibold px-2 tracking-tight ${tickerWinRate >= 60 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' : tickerWinRate >= 40 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400'}`}>
                                                    {item.profitable_sells}/{item.sell_count} ({tickerWinRate.toFixed(0)}%)
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
