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
    // For now, we take the top 5 by turnover and add an "Activity" intensity score.
    const shockers = stocks.slice(0, 5).map((s, i) => ({
        ...s,
        intensity: Math.min(100, (s.turnover / 5000000) * 100) // Simulated intensity
    }));

    return (
        <Table>
            <TableHeader>
                <TableRow className="border-none hover:bg-transparent">
                    <TableHead className="h-8 text-[10px] font-black tracking-widest text-slate-400 uppercase">Ticker</TableHead>
                    <TableHead className="h-8 text-[10px] font-black tracking-widest text-slate-400 uppercase text-right">Intensity</TableHead>
                    <TableHead className="h-8 text-[10px] font-black tracking-widest text-slate-400 uppercase text-right">Activity</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {shockers.map((stock) => (
                    <TableRow
                        key={stock.ticker}
                        className="border-transparent hover:bg-slate-50 cursor-pointer"
                        onClick={() => router.push(`/stock/${stock.ticker}`)}
                    >
                        <TableCell className="py-2.5 px-0 text-[11px] font-bold text-slate-700">{stock.ticker}</TableCell>
                        <TableCell className="py-2.5 px-0 text-right">
                            <div className="flex justify-end gap-0.5">
                                {[1, 2, 3, 4, 5].map((level) => (
                                    <div
                                        key={level}
                                        className={`h-3 w-1.5 rounded-sm ${stock.intensity > level * 20 ? 'bg-blue-500' : 'bg-slate-100'}`}
                                    ></div>
                                ))}
                            </div>
                        </TableCell>
                        <TableCell className="py-2.5 px-0 text-right text-[11px] font-bold text-blue-600 flex items-center justify-end gap-1">
                            <Zap size={10} className="fill-blue-600" />
                            SHOCKING
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
};
