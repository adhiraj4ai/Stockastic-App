'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { 
    Table, TableBody, TableCell, TableHead, 
    TableHeader, TableRow 
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatNepaliNumber } from '@/lib/formatters';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

interface StockData {
    ticker: string;
    close: number;
    open: number;
    change: number;
    percent_change: number;
    sector: string;
}

interface LiveMarketPulseTableProps {
    stocks: StockData[];
}

export function LiveMarketPulseTable({ stocks }: LiveMarketPulseTableProps) {
    const router = useRouter();
    const [prevPrices, setPrevPrices] = useState<Record<string, number>>({});
    const [flashing, setFlashing] = useState<Record<string, 'up' | 'down' | null>>({});

    useEffect(() => {
        const newFlashing: Record<string, 'up' | 'down' | null> = {};
        let hasChanges = false;

        stocks.forEach(stock => {
            const prevPrice = prevPrices[stock.ticker];
            if (prevPrice !== undefined && prevPrice !== stock.close) {
                newFlashing[stock.ticker] = stock.close > prevPrice ? 'up' : 'down';
                hasChanges = true;
            }
        });

        if (hasChanges) {
            setFlashing(newFlashing);
            const timer = setTimeout(() => setFlashing({}), 1500);
            
            // Update prev prices
            const newPrevPrices = { ...prevPrices };
            stocks.forEach(s => {
                newPrevPrices[s.ticker] = s.close;
            });
            setPrevPrices(newPrevPrices);
            
            return () => clearTimeout(timer);
        } else if (Object.keys(prevPrices).length === 0) {
            // Initial load
            const initialPrices: Record<string, number> = {};
            stocks.forEach(s => {
                initialPrices[s.ticker] = s.close;
            });
            setPrevPrices(initialPrices);
        }
    }, [stocks]);

    return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-lg">
            <Table>
                <TableHeader>
                    <TableRow className="bg-slate-50/50 dark:bg-slate-800/50 hover:bg-transparent border-slate-100 dark:border-slate-800">
                        <TableHead className="w-[80px] text-[10px] font-black uppercase tracking-widest py-2.5 px-4 text-slate-500">Symbol</TableHead>
                        <TableHead className="text-right text-[10px] font-black uppercase tracking-widest py-2.5 px-4 text-slate-500">Open</TableHead>
                        <TableHead className="text-right text-[10px] font-black uppercase tracking-widest py-2.5 px-4 text-slate-500">LTP (Close)</TableHead>
                        <TableHead className="text-right text-[10px] font-black uppercase tracking-widest py-2.5 px-4 text-slate-500">Change</TableHead>
                        <TableHead className="text-right text-[10px] font-black uppercase tracking-widest py-2.5 px-4 text-slate-500">Change %</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {stocks.map((stock) => {
                        const flash = flashing[stock.ticker];
                        const isPositive = stock.percent_change > 0;
                        const isNegative = stock.percent_change < 0;

                        return (
                            <TableRow 
                                key={stock.ticker}
                                className="cursor-pointer group hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition-colors border-slate-50 dark:border-slate-800/50 h-11"
                                onClick={() => router.push(`/ticker/${stock.ticker}`)}
                            >
                                <TableCell className="py-1.5 px-4">
                                    <div className="flex flex-col">
                                        <span className="font-black text-[13px] text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors leading-none">
                                            {stock.ticker}
                                        </span>
                                        <span className="text-[9px] text-slate-400 font-bold truncate max-w-[70px] mt-0.5 uppercase tracking-tighter">
                                            {stock.sector}
                                        </span>
                                    </div>
                                </TableCell>
                                
                                <TableCell className="text-right py-1.5 px-4 font-mono text-[11px] text-slate-500">
                                    {formatNepaliNumber(stock.open)}
                                </TableCell>

                                <TableCell className={`text-right py-1.5 px-4 font-mono font-bold text-[12px] transition-all duration-700 relative ${
                                    flash === 'up' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 
                                    flash === 'down' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400' : 
                                    'text-slate-900 dark:text-white'
                                }`}>
                                    {formatNepaliNumber(stock.close)}
                                    <AnimatePresence>
                                        {flash && (
                                            <motion.div 
                                                initial={{ opacity: 0, scale: 0.8 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0 }}
                                                className="absolute inset-0 border-b-2 border-current pointer-events-none"
                                            />
                                        )}
                                    </AnimatePresence>
                                </TableCell>

                                <TableCell className={`text-right py-1.5 px-4 font-mono font-bold text-[11px] ${isPositive ? 'text-emerald-500' : isNegative ? 'text-rose-500' : 'text-slate-400'}`}>
                                    <div className="flex items-center justify-end gap-0.5">
                                        {isPositive ? <ArrowUpRight size={10} /> : isNegative ? <ArrowDownRight size={10} /> : <Minus size={10} />}
                                        {Math.abs(stock.change).toFixed(2)}
                                    </div>
                                </TableCell>

                                <TableCell className="text-right py-1.5 px-4">
                                    <Badge 
                                        variant="outline"
                                        className={`font-black text-[10px] px-1.5 py-0 border-none tabular-nums ${
                                            isPositive ? 'bg-emerald-500/10 text-emerald-500' : 
                                            isNegative ? 'bg-rose-500/10 text-rose-500' : 
                                            'bg-slate-100 dark:bg-slate-800 text-slate-500'
                                        }`}
                                    >
                                        {isPositive ? '+' : ''}{stock.percent_change.toFixed(2)}%
                                    </Badge>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
            {stocks.length === 0 && (
                <div className="p-20 text-center bg-slate-50/50 dark:bg-white/[0.02]">
                    <div className="flex flex-col items-center justify-center space-y-3">
                        <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                            <Activity className="h-6 w-6 text-slate-400" />
                        </div>
                        <div className="space-y-1">
                            <p className="text-sm font-bold text-slate-900 dark:text-white">Pulse Stream Disconnected</p>
                            <p className="text-[10px] text-slate-500 font-medium">No active tickers detected for the current session.</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
