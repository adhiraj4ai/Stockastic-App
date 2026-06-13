'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Zap } from 'lucide-react';

interface StockData {
    ticker: string;
    turnover: number;
    percent_change: number;
}

interface VolumeShockersProps {
    stocks: StockData[];
}

export const VolumeShockers = ({ stocks }: VolumeShockersProps) => {
    const router = useRouter();

    // In a real scenario, this would compare current volume vs 20-day average.
    const shockers = stocks.slice(0, 5).map((s, i) => ({
        ...s,
        intensity: Math.min(100, (s.turnover / 5000000) * 100) // Simulated intensity
    }));

    return (
        <Table>
            <TableHeader>
                <TableRow className="border-none hover:bg-transparent">
                    <TableHead className="h-8 text-[10px] font-bold tracking-tight text-slate-900 dark:text-slate-400">Ticker</TableHead>
                    <TableHead className="h-8 text-[10px] font-bold tracking-tight text-slate-900 dark:text-slate-400 text-right">Intensity</TableHead>
                    <TableHead className="h-8 text-[10px] font-bold tracking-tight text-slate-900 dark:text-slate-400 text-right">Activity</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {shockers.map((stock) => (
                    <TableRow
                        key={stock.ticker}
                        className="border-transparent hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors"
                        onClick={() => router.push(`/ticker/${stock.ticker}`)}
                    >
                        <TableCell className="py-2.5 px-0 text-[11px] font-bold text-slate-900 dark:text-slate-100">{stock.ticker}</TableCell>
                        <TableCell className="py-2.5 px-0 text-right">
                            <div className="flex justify-end gap-0.5">
                                {[1, 2, 3, 4, 5].map((level) => (
                                    <div
                                        key={level}
                                        className={`h-3 w-1.5 rounded-sm transition-all duration-500 ${stock.intensity > level * 20 ? 'bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.4)]' : 'bg-slate-200 dark:bg-slate-800'}`}
                                    ></div>
                                ))}
                            </div>
                        </TableCell>
                        <TableCell className="py-2.5 px-0 text-right text-[11px] font-bold text-primary flex items-center justify-end gap-1">
                            <Zap size={10} className="fill-primary" />
                            Shocking
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
};
