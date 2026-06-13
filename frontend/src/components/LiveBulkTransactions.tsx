'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { 
    Table, TableBody, TableCell, TableHead, 
    TableHeader, TableRow 
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatNepaliNumber, formatRupees } from '@/lib/formatters';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Layers, Activity, ExternalLink, 
    ArrowUpRight, ArrowDownRight, Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface BulkTransaction {
    id: number;
    transaction_date: string;
    contract_no: string;
    symbol: string;
    buyer_id: string;
    seller_id: string;
    transaction_quantity: number;
    transaction_rate: number;
    transaction_amount: number;
}

export function LiveBulkTransactions() {
    const router = useRouter();
    const [transactions, setTransactions] = useState<BulkTransaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastId, setLastId] = useState<number | null>(null);

    const fetchBulkTrades = async () => {
        try {
            const response = await api.get('/api/stocks/floorsheet_list/', {
                params: {
                    is_bulk: 'true',
                    page_size: 15,
                    ordering: '-transaction_date,-contract_no' // Latest first
                }
            });
            
            const newTrades = response.data.results || [];
            
            if (newTrades.length > 0) {
                // If we have previous trades, check for new ones to highlight or just update
                setTransactions(newTrades);
                setLastId(newTrades[0].id);
            }
        } catch (error) {
            console.error("Failed to fetch live bulk trades", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBulkTrades();
        const interval = setInterval(fetchBulkTrades, 15000); // 15s polling
        return () => clearInterval(interval);
    }, []);

    if (loading && transactions.length === 0) {
        return (
            <div className="h-[400px] flex items-center justify-center bg-slate-50/50 dark:bg-muted rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                <div className="flex flex-col items-center gap-3">
                    <Activity className="h-8 w-8 text-primary animate-pulse" />
                    <span className="text-sm font-bold text-slate-500">Connecting to Bulk Feed...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-4 px-1">
                <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-500/10 text-amber-500">
                        <Layers size={18} />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white uppercase tracking-wider">Bulk Live Feed</h3>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter opacity-60">High-Impact Market Shifts</p>
                    </div>
                </div>
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-none font-semibold text-[10px] px-2 py-0.5 flex items-center gap-1.5 animate-pulse">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    LIVE
                </Badge>
            </div>

            <div className="flex-1 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-950/20 overflow-hidden flex flex-col">
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className="hover:bg-transparent border-border dark:border-slate-800 bg-slate-50/50 dark:bg-muted">
                                <TableHead className="text-[10px] font-semibold uppercase tracking-wider py-3 px-4 text-slate-500">Sym</TableHead>
                                <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider py-3 px-4 text-slate-500">Qty</TableHead>
                                <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider py-3 px-4 text-slate-500">Amount</TableHead>
                                <TableHead className="text-center text-[10px] font-semibold uppercase tracking-wider py-3 px-4 text-slate-500">B/S</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <AnimatePresence mode="popLayout">
                                {transactions.slice(0, 12).map((trade) => {
                                    const isMega = trade.transaction_quantity >= 20000 || trade.transaction_amount >= 10000000;
                                    
                                    return (
                                        <motion.tr
                                            key={trade.id || `${trade.symbol}-${trade.contract_no}`}
                                            layout
                                            initial={{ opacity: 0, x: -20 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            exit={{ opacity: 0, scale: 0.95 }}
                                            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                            className={cn(
                                                "cursor-pointer group border-slate-50 dark:border-slate-800/50 transition-colors h-12",
                                                isMega ? "bg-amber-500/5 hover:bg-amber-500/10" : "hover:bg-accent hover:text-accent-foreground"
                                            )}
                                            onClick={() => router.push(`/ticker/${trade.symbol}`)}
                                        >
                                            <TableCell className="py-2 px-4">
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-[13px] text-slate-900 dark:text-white leading-none">
                                                        {trade.symbol}
                                                    </span>
                                                    <span className="text-[9px] text-slate-500 font-bold mt-1 tabular-nums flex items-center gap-1">
                                                        <Clock size={8} /> {trade.transaction_date.slice(5)}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            
                                            <TableCell className="text-right py-2 px-4">
                                                <span className={cn(
                                                    "font-mono font-semibold text-[12px] tabular-nums",
                                                    trade.transaction_quantity >= 10000 ? "text-amber-500" : "text-slate-700 dark:text-slate-300"
                                                )}>
                                                    {formatNepaliNumber(trade.transaction_quantity)}
                                                </span>
                                            </TableCell>

                                            <TableCell className="text-right py-2 px-4">
                                                <span className="font-mono font-bold text-[11px] text-slate-500 tabular-nums">
                                                    {formatRupees(trade.transaction_amount / 100000, 1)}L
                                                </span>
                                            </TableCell>

                                            <TableCell className="py-2 px-4">
                                                <div className="flex items-center justify-center gap-1.5 font-mono text-[10px] font-bold">
                                                    <span className="w-5 h-5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-500/20">
                                                        {trade.buyer_id}
                                                    </span>
                                                    <span className="text-slate-300 dark:text-slate-700">|</span>
                                                    <span className="w-5 h-5 rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center border border-rose-500/20">
                                                        {trade.seller_id}
                                                    </span>
                                                </div>
                                            </TableCell>
                                        </motion.tr>
                                    );
                                })}
                            </AnimatePresence>
                        </TableBody>
                    </Table>
                </div>
                
                {transactions.length === 0 && (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center opacity-40">
                        <Layers className="h-10 w-10 text-slate-400 mb-2" />
                        <p className="text-xs font-bold text-slate-500">No bulk shifts detected today.</p>
                    </div>
                )}
                
                <div className="p-3 bg-slate-50/50 dark:bg-muted border-t border-border dark:border-slate-800 flex justify-center">
                    <button 
                        onClick={() => router.push('/market/bulk')}
                        className="text-[10px] font-semibold text-primary uppercase tracking-wider hover:underline flex items-center gap-1.5"
                    >
                        View Historical Shifts <ExternalLink size={10} />
                    </button>
                </div>
            </div>
        </div>
    );
}
