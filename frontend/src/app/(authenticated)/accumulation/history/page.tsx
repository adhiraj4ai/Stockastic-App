'use client';

import { useEffect, useState, Suspense } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
    Loader2,
    Filter,
    ExternalLink
} from 'lucide-react';
import {
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { formatNepaliNumber } from "@/lib/formatters";
import { CompanySelect } from '@/components/CompanySelect';
import { AccumulationItem } from '@/types/accumulation';
import { cn } from '@/lib/utils';

function HistoryPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    
    const [selectedBroker, setSelectedBroker] = useState(searchParams.get('broker') || '');
    const [selectedSymbol, setSelectedSymbol] = useState(searchParams.get('symbol') || '');
    const [allBrokers, setAllBrokers] = useState<string[]>([]);
    const [historyData, setHistoryData] = useState<AccumulationItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);

    useEffect(() => {
        const fetchBrokers = async () => {
            try {
                const res = await api.get('/api/stocks/companies/accumulation_brokers/');
                setAllBrokers(res.data);
            } catch (err) {
                console.error('Failed to fetch brokers', err);
            }
        };
        fetchBrokers();
    }, []);

    useEffect(() => {
        if (!selectedBroker || !selectedSymbol) {
            setHistoryData([]);
            return;
        }

        const fetchHistory = async () => {
            setLoading(true);
            setError('');
            try {
                const res = await api.get('/api/stocks/accumulation_history/', {
                    params: {
                        broker: selectedBroker,
                        symbol: selectedSymbol,
                        page: 1,
                        page_size: 5000
                    }
                });
                setHistoryData(res.data);
            } catch (err) {
                console.error('Failed to fetch accumulation history', err);
                setError('Failed to load history.');
            } finally {
                setLoading(false);
            }
        };
        fetchHistory();
    }, [selectedBroker, selectedSymbol]);

    const sortedHistory = [...historyData].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const totalPages = Math.ceil(sortedHistory.length / pageSize) || 1;
    const paginatedHistory = sortedHistory.slice((page - 1) * pageSize, page * pageSize);

    const handleBrokerChange = (broker: string) => {
        setSelectedBroker(broker);
        const params = new URLSearchParams(searchParams.toString());
        if (broker) params.set('broker', broker);
        else params.delete('broker');
        router.push(`/accumulation/history?${params.toString()}`, { scroll: false });
    };

    const handleSymbolChange = (symbol: string) => {
        setSelectedSymbol(symbol);
        const params = new URLSearchParams(searchParams.toString());
        if (symbol) params.set('symbol', symbol);
        else params.delete('symbol');
        router.push(`/accumulation/history?${params.toString()}`, { scroll: false });
    };

    return (
        <div className="space-y-6 lg:space-y-8 min-h-screen">
            <div className="bg-white dark:bg-slate-950/40 backdrop-blur-xl rounded-2xl border border-slate-200 dark:border-white/5 shadow-2xl overflow-hidden">
                <div className="flex flex-col xl:flex-row justify-between items-center gap-6 p-4 md:p-6 border-b border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02]">
                    <div>
                        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Historical Flows</h2>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 font-black tracking-widest px-0.5">Detailed transaction logs</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 w-full xl:w-auto">
                        <div className="flex items-center gap-2 bg-white dark:bg-slate-900/60 p-1.5 rounded-xl border border-slate-200 dark:border-white/5 shadow-none w-full md:w-auto">
                            <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 px-2 tracking-widest">Broker</span>
                            <select
                                value={selectedBroker}
                                onChange={(e) => handleBrokerChange(e.target.value)}
                                className="bg-transparent border-none text-sm font-bold text-blue-700 dark:text-indigo-400 outline-none pr-4 min-w-[80px]"
                            >
                                <option value="">Select ID</option>
                                {allBrokers.map(b => <option key={b} value={b}>{b}</option>)}
                            </select>
                        </div>

                        <div className="min-w-[200px] w-full md:w-auto">
                            <CompanySelect
                                value={selectedSymbol}
                                onChange={handleSymbolChange}
                                className="h-11 w-full rounded-xl bg-white dark:bg-slate-900/60 border-slate-200 dark:border-white/5 shadow-none focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-indigo-500/20 transition-all font-bold text-sm"
                            />
                        </div>
                    </div>
                </div>

            {(!selectedBroker || !selectedSymbol) ? (
                <div className="flex flex-col items-center justify-center flex-1 text-gray-400 dark:text-slate-500 space-y-4 py-20">
                    <div className="p-4 bg-gray-50 dark:bg-slate-900 rounded-full">
                        <Filter className="w-8 h-8 opacity-50" />
                    </div>
                    <p className="font-bold text-lg">Please select both Broker and Symbol</p>
                </div>
            ) : loading ? (
                <div className="flex flex-col items-center justify-center p-20 space-y-4 flex-1">
                    <Loader2 className="w-10 h-10 text-blue-500 dark:text-indigo-400 animate-spin" />
                    <p className="text-gray-500 dark:text-slate-400 font-medium">Loading history...</p>
                </div>
            ) : error ? (
                <div className="flex flex-col items-center justify-center flex-1 p-20 text-center text-red-500 dark:text-rose-400 font-medium space-y-2">
                    <p>{error}</p>
                    <Button variant="outline" size="sm" onClick={() => window.location.reload()}>Retry</Button>
                </div>
            ) : (
                <div className="flex-1 overflow-auto">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="bg-gray-50/50 dark:bg-slate-800/30 border-b border-gray-100 dark:border-slate-800 sticky top-[73px] z-20 shadow-sm transition-all h-14 hover:bg-gray-50/50 dark:hover:bg-slate-800/30">
                                <TableHead className="px-6 text-left font-bold text-gray-900 dark:text-slate-100">Date</TableHead>
                                <TableHead className="text-right px-6 bg-emerald-50/5 dark:bg-emerald-500/[0.02] font-bold text-emerald-600 dark:text-emerald-400">Buy Qty</TableHead>
                                <TableHead className="text-right px-6 bg-emerald-50/5 dark:bg-emerald-500/[0.02] font-bold text-emerald-600/60 dark:text-emerald-400/60">Buy Rate</TableHead>
                                <TableHead className="text-right px-6 bg-rose-50/5 dark:bg-rose-500/[0.02] font-bold text-rose-600 dark:text-rose-400">Sell Qty</TableHead>
                                <TableHead className="text-right px-6 bg-rose-50/5 dark:bg-rose-500/[0.02] font-bold text-rose-600/60 dark:text-rose-400/60">Sell Rate</TableHead>
                                <TableHead className="text-right px-6 font-bold text-gray-900 dark:text-slate-100">Net Qty</TableHead>
                                <TableHead className="text-right px-6 bg-blue-50/10 dark:bg-indigo-500/[0.02] font-bold text-blue-600 dark:text-indigo-400">Cum. Qty</TableHead>
                                <TableHead className="text-right px-6 font-bold text-orange-500 dark:text-orange-400">WAC</TableHead>
                            </tr>
                        </thead>
                        <TableBody>
                            {historyData.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="h-40 text-center text-gray-500 dark:text-slate-400">
                                        No accumulation data found for this selection.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                paginatedHistory.map((item, idx) => (
                                    <TableRow 
                                        key={idx} 
                                        className={cn(
                                            "group border-b border-gray-50 dark:border-slate-800 hover:bg-blue-50/30 dark:hover:bg-slate-800/30 last:border-0 transition-all duration-200 cursor-pointer border-l-4 hover:shadow-lg hover:scale-[1.01] hover:-translate-y-0.5",
                                            item.net_quantity > 0 ? "border-l-emerald-500/50 hover:border-l-emerald-500" : item.net_quantity < 0 ? "border-l-rose-500/50 hover:border-l-rose-500" : "border-l-transparent hover:border-l-blue-400/50"
                                        )}
                                    >
                                        <TableCell className="px-6 py-4">
                                            <div className="flex items-center gap-2 group/date">
                                                <span className="text-sm font-bold text-slate-500 dark:text-slate-400">{item.date}</span>
                                                <Link
                                                    href={`/floorsheet?symbol=${selectedSymbol}&broker=${selectedBroker}&date=${item.date}`}
                                                    className="p-1.5 bg-slate-100 dark:bg-white/[0.05] rounded-lg text-blue-500 dark:text-indigo-400 hover:bg-blue-600 hover:text-white dark:hover:bg-indigo-600 opacity-0 group-hover/date:opacity-100 transition-all"
                                                >
                                                    <ExternalLink className="w-3 h-3" />
                                                </Link>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right px-6 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                            {item.buy_qty > 0 ? formatNepaliNumber(item.buy_qty) : '-'}
                                        </TableCell>
                                        <TableCell className="text-right px-6 font-mono text-xs text-slate-400 dark:text-slate-500">
                                            {item.buy_qty > 0 ? item.buy_rate.toFixed(2) : '-'}
                                        </TableCell>
                                        <TableCell className="text-right px-6 font-mono font-bold text-rose-600 dark:text-rose-400">
                                            {item.sell_qty > 0 ? formatNepaliNumber(item.sell_qty) : '-'}
                                        </TableCell>
                                        <TableCell className="text-right px-6 font-mono text-xs text-slate-400 dark:text-slate-500">
                                            {item.sell_qty > 0 ? item.sell_rate.toFixed(2) : '-'}
                                        </TableCell>
                                        <TableCell className={`text-right px-6 font-mono font-bold ${item.net_quantity > 0 ? 'text-emerald-600 dark:text-emerald-400' : item.net_quantity < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400 dark:text-slate-500'}`}>
                                            {item.net_quantity !== 0 ? (item.net_quantity > 0 ? '+' : '') + formatNepaliNumber(item.net_quantity) : '0'}
                                        </TableCell>
                                        <TableCell className="text-right px-6 font-mono font-bold bg-blue-50/10 dark:bg-indigo-500/[0.01] text-blue-800 dark:text-indigo-400 text-base">
                                            {formatNepaliNumber(item.cumulative_qty)}
                                        </TableCell>
                                        <TableCell className="text-right px-6 font-mono font-bold text-orange-600 dark:text-orange-400">
                                            {item.wac ? formatNepaliNumber(item.wac) : '-'}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </table>
                </div>
            )}

            {/* Pagination Controls */}
            {!loading && !error && historyData.length > 0 && (
                <div className="p-4 md:p-6 border-t border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.01] flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 tracking-widest px-2">Rows per page</span>
                        <select
                            value={pageSize}
                            onChange={(e) => {
                                setPageSize(Number(e.target.value));
                                setPage(1);
                            }}
                            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg px-2 py-1 text-xs font-black text-slate-700 dark:text-slate-300 outline-none"
                        >
                            {[20, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}
                        </select>
                        <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 tracking-widest hidden sm:inline ml-2">
                            Total {historyData.length} records
                        </span>
                    </div>

                    <div className="flex items-center gap-6">
                        <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 tracking-widest">
                            Page <span className="text-slate-900 dark:text-white px-1">{page}</span> of <span className="text-slate-900 dark:text-white px-1">{totalPages}</span>
                        </span>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="h-9 px-4 rounded-xl font-black text-[10px] tracking-widest border-slate-200 dark:border-white/5 hover:bg-slate-100 dark:hover:bg-white/5 transition-all"
                            >
                                Previous
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page >= totalPages}
                                className="h-9 px-4 rounded-xl font-black text-[10px] uppercase tracking-widest border-slate-200 dark:border-white/5 hover:bg-slate-100 dark:hover:bg-white/5 transition-all"
                            >
                                Next
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    </div>
    );
}

export default function HistoryPage() {
    return (
        <Suspense fallback={<div className="flex p-20 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>}>
            <HistoryPageContent />
        </Suspense>
    );
}
