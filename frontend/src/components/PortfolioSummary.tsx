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
            <Card className="animate-pulse">
                <CardContent className="p-6 h-[180px] flex items-center justify-center">
                    <div className="h-6 w-6 border-2 border-foreground border-t-transparent rounded-full animate-spin"></div>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card
            className="cursor-pointer hover:border-foreground/20 transition-colors"
            onClick={() => router.push('/portfolio')}
        >
            <CardHeader className="px-5 py-4 border-b border-border flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Wallet size={14} className="text-muted-foreground" /> My portfolio
                </CardTitle>
                <div className={`px-1.5 py-0.5 rounded text-[11px] font-medium tabular-nums ${isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {isPositive ? '+' : ''}{totalPLPercent.toFixed(2)}%
                </div>
            </CardHeader>

            <CardContent className="p-5 space-y-4">
                <div className="flex flex-col gap-0.5">
                    <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Net worth</span>
                    <div className="text-2xl font-semibold text-foreground tabular-nums">
                        Rs. {(currentValue / 1000).toFixed(1)}k
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-3 border-t border-border">
                    <div className="flex flex-col">
                        <span className="text-[11px] text-muted-foreground uppercase tracking-wider mb-0.5">Total P/L</span>
                        <div className={`text-sm font-medium tabular-nums ${isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'} flex items-center gap-1`}>
                            {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                            Rs. {(Math.abs(totalPL) / 1000).toFixed(1)}k
                        </div>
                    </div>
                    <div className="flex flex-col items-end text-right">
                        <span className="text-[11px] text-muted-foreground uppercase tracking-wider mb-0.5">Today's P/L</span>
                        <div className={`text-sm font-medium tabular-nums ${isDayPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'} flex items-center gap-1`}>
                            {isDayPositive ? '+' : '-'}Rs. {(Math.abs(dayPL) / 1000).toFixed(1)}k
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
