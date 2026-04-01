import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Wallet, TrendingUp, TrendingDown, DollarSign, Activity } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface PortfolioSummaryProps {
    investment: number;
    currentValue: number;
    totalPL: number;
    dayPL: number;
    loading?: boolean;
}

export function PortfolioSummary({ investment, currentValue, totalPL, dayPL, loading = false }: PortfolioSummaryProps) {
    const router = useRouter();
    const totalPLPercent = investment > 0 ? (totalPL / investment) * 100 : 0;
    const isPositive = totalPL >= 0;
    const isDayPositive = dayPL >= 0;

    if (loading) {
        return (
            <Card className="bg-white dark:bg-slate-900 border-none shadow-xl shadow-slate-200/50 dark:shadow-none animate-pulse">
                <CardContent className="p-6 h-[180px] flex items-center justify-center">
                    <div className="h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card
            className="bg-white dark:bg-slate-900 border-none shadow-xl shadow-slate-200/50 dark:shadow-none cursor-pointer group hover:shadow-2xl transition-all duration-300 relative overflow-hidden"
            onClick={() => router.push('/portfolio')}
        >
            <div className="absolute -right-8 -top-8 w-32 h-32 bg-gradient-to-br from-indigo-500/10 to-transparent blur-2xl opacity-50 bg-blend-overlay transition-opacity group-hover:opacity-80" />

            <CardHeader className="p-4 pb-0 border-b border-transparent dark:border-white/5 flex flex-row items-center justify-between relative z-10">
                <CardTitle className="text-sm font-semibold text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-2">
                    <Wallet size={14} className="text-indigo-500" /> My portfolio
                </CardTitle>
                <div className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-tight ${isPositive ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' : 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400'}`}>
                    {isPositive ? '+' : ''}{totalPLPercent.toFixed(2)}%
                </div>
            </CardHeader>

            <CardContent className="p-4 space-y-4 relative z-10">
                <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 tracking-tight">Net worth</span>
                    <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                        Rs. {(currentValue / 1000).toFixed(1)}k
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-50 dark:border-slate-800/50">
                    <div className="flex flex-col justify-end">
                        <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500 tracking-tight mb-0.5">Total P/L</span>
                        <div className={`text-sm font-semibold tracking-tight ${isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'} flex items-center gap-1`}>
                            {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                            Rs. {(Math.abs(totalPL) / 1000).toFixed(1)}k
                        </div>
                    </div>
                    <div className="flex flex-col items-end justify-end text-right">
                        <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500 tracking-tight mb-0.5">Today's P/L</span>
                        <div className={`text-sm font-semibold tracking-tight ${isDayPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'} flex items-center gap-1`}>
                            {isDayPositive ? '+' : '-'}Rs. {(Math.abs(dayPL) / 1000).toFixed(1)}k
                            {isDayPositive ? <Activity size={12} className="opacity-50" /> : <Activity size={12} className="opacity-50 rotate-180" />}
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
