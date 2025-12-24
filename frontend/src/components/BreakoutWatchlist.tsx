'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { Zap, TrendingUp } from 'lucide-react';

interface StockData {
    ticker: string;
    percent_change: number;
    turnover: number;
}

interface BreakoutWatchlistProps {
    stocks: StockData[];
}

export const BreakoutWatchlist = ({ stocks }: BreakoutWatchlistProps) => {
    const router = useRouter();

    // Filter for "Breakouts": Change > 3% and significant turnover
    const breakouts = stocks
        .filter(s => s.percent_change > 3)
        .sort((a, b) => b.turnover - a.turnover)
        .slice(0, 5);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-amber-100 rounded-md">
                        <Zap size={14} className="text-amber-600 fill-amber-600" />
                    </div>
                    <span className="text-[11px] font-black text-slate-900 tracking-widest">Momentum Breakouts</span>
                </div>
            </div>

            <Table>
                <TableBody>
                    {breakouts.length > 0 ? (
                        breakouts.map((stock) => (
                            <TableRow
                                key={stock.ticker}
                                className="border-transparent hover:bg-slate-50 cursor-pointer group"
                                onClick={() => router.push(`/stock/${stock.ticker}`)}
                            >
                                <TableCell className="py-2 px-1">
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-slate-900 text-[11px] group-hover:text-blue-600 transition-colors">{stock.ticker}</span>
                                        <TrendingUp size={10} className="text-emerald-500" />
                                    </div>
                                </TableCell>
                                <TableCell className="py-2 px-1 text-right">
                                    <span className="text-[10px] font-mono font-bold text-emerald-700">+{stock.percent_change.toFixed(2)}%</span>
                                </TableCell>
                            </TableRow>
                        ))
                    ) : (
                        <TableRow>
                            <TableCell className="text-center py-4 text-[10px] text-slate-500 italic">No breakouts detected</TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
    );
};
