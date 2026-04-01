'use client';

import React, { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Receipt, TrendingUp, TrendingDown, Calendar, AlertCircle } from 'lucide-react';
import { formatRupees } from '@/lib/formatters';

interface TaxYear {
    fiscal_year: string;
    realized_pnl: number;
    cgt_paid: number;
    trades_count: number;
    top_gainers: Array<{ ticker: string; pnl: number }>;
}

export function TaxReport({ selectedAccount }: { selectedAccount: string }) {
    const [data, setData] = useState<TaxYear[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchTaxReport = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await api.get('/api/stocks/transactions/tax_report/', {
                params: { account: selectedAccount }
            });
            setData(response.data);
        } catch (err) {
            console.error('Failed to fetch tax report', err);
            setError('Could not load tax report data.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTaxReport();
    }, [selectedAccount]);

    if (loading) {
        return (
            <div className="flex justify-center items-center h-48">
                <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-8 text-center bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-100 dark:border-red-900/30">
                <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
                <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
                <button 
                    onClick={fetchTaxReport}
                    className="mt-4 text-xs font-bold tracking-tight text-red-700 dark:text-red-300 underline"
                >
                    Try again
                </button>
            </div>
        );
    }

    if (data.length === 0) {
        return (
            <div className="p-12 text-center bg-gray-50 dark:bg-slate-900/50 rounded-xl border border-dashed border-gray-200 dark:border-slate-800">
                <Receipt className="h-10 w-10 text-gray-300 dark:text-slate-700 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-500 dark:text-slate-400">No realized trades found to generate tax report.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                    <Receipt className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight">Fiscal year tax summary</h3>
                    <p className="text-xs text-slate-500 font-medium">Realized P&L and CGT breakdown for Nepal fiscal years</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {data.map((year) => (
                    <Card key={year.fiscal_year} className="overflow-hidden border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
                        <CardHeader className="bg-slate-50/50 dark:bg-slate-800/50 pb-4">
                            <CardTitle className="flex items-center justify-between">
                                <span className="text-sm font-bold text-slate-500 dark:text-slate-400 tracking-tight">FY {year.fiscal_year}</span>
                                <Badge variant="secondary" className="bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 text-[10px] font-bold">
                                    {year.trades_count} trades
                                </Badge>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-5 space-y-4">
                            <div className="flex justify-between items-end">
                                <div>
                                    <div className="text-[10px] font-bold text-slate-400 tracking-tight mb-1">Realized net P&L</div>
                                    <div className={`text-2xl font-bold ${year.realized_pnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                        {year.realized_pnl >= 0 ? '+' : ''}{formatRupees(year.realized_pnl)}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-[10px] font-bold text-slate-400 tracking-tight mb-1">CGT paid</div>
                                    <div className="text-lg font-bold text-amber-600 dark:text-amber-400">
                                        {formatRupees(year.cgt_paid)}
                                    </div>
                                </div>
                            </div>

                            {year.top_gainers.length > 0 && (
                                <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                                    <div className="text-[9px] font-bold text-slate-400 tracking-tight mb-2">Top performers</div>
                                    <div className="space-y-2">
                                        {year.top_gainers.map((g) => (
                                            <div key={g.ticker} className="flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                                                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">{g.ticker}</span>
                                                <span className={`text-[11px] font-bold ${g.pnl >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                    {g.pnl >= 0 ? '+' : ''}{formatRupees(g.pnl)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}
