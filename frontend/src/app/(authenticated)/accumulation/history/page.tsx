'use client';

import { useEffect, useState, Suspense } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
    Filter,
    ExternalLink,
    ArrowUpRight,
    ArrowDownRight,
    Info
} from 'lucide-react';
import { PageLoader, FullPageLoader } from '@/components/ui/StockLoader';
import {
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { formatNepaliNumber, formatNepaliCurrency } from "@/lib/formatters";
import { CompanySelect } from '@/components/CompanySelect';
import { AccumulationItem } from '@/types/accumulation';
import { cn } from '@/lib/utils';

function HistoryPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    
    const [selectedBroker, setSelectedBroker] = useState('');
    const [selectedSymbol, setSelectedSymbol] = useState('');
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
        <div className="space-y-6 lg:space-y-8 min-h-screen pb-20">
            <div className="bg-white dark:bg-card rounded-2xl border border-slate-200 dark:border-border shadow-sm overflow-hidden flex flex-col">
                <div className="flex flex-col xl:flex-row justify-end items-center gap-6 p-4 md:p-6 border-b border-slate-200 dark:border-border bg-slate-50/50 dark:bg-muted">
                    <div className="flex flex-wrap items-center gap-4 w-full xl:w-auto">
                        <div className="flex items-center gap-2 bg-white dark:bg-card p-1.5 rounded-xl border border-slate-200 dark:border-border shadow-sm w-full md:w-auto overflow-hidden group">
                            <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 px-2 tracking-wider uppercase">Broker</span>
                            <select
                                value={selectedBroker}
                                onChange={(e) => handleBrokerChange(e.target.value)}
                                className="bg-transparent border-none text-sm font-semibold text-primary outline-none pr-4 min-w-[80px] cursor-pointer"
                            >
                                <option value="">Select ID</option>
                                {allBrokers.map(b => <option key={b} value={b} className="bg-white dark:bg-card">{b}</option>)}
                            </select>
                        </div>

                        <div className="min-w-[200px] w-full md:w-auto">
                            <CompanySelect
                                value={selectedSymbol}
                                onChange={handleSymbolChange}
                                className="h-11 w-full rounded-xl bg-white dark:bg-card border-slate-200 dark:border-border shadow-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring transition-all font-semibold text-sm uppercase"
                            />
                        </div>
                    </div>
                </div>

                {(!selectedBroker || !selectedSymbol) ? (
                    <div className="flex flex-col items-center justify-center flex-1 text-gray-400 dark:text-slate-500 space-y-4 py-32 text-center px-6">
                        <div className="p-6 bg-slate-50 dark:bg-muted rounded-xl border border-border dark:border-border shadow-inner">
                            <Filter className="w-12 h-12 opacity-20" />
                        </div>
                        <div className="max-w-xs">
                            <p className="font-semibold text-lg text-slate-700 dark:text-slate-300">Set Selection</p>
                            <p className="text-xs text-slate-400 dark:text-slate-500 font-bold mt-1">Please select both a Broker ID and a Symbol to visualize the historical accumulation flow.</p>
                        </div>
                    </div>
                ) : loading ? (
                    <div className="py-40">
                        <PageLoader text="Syncing history..." className="flex-1" />
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center flex-1 py-32 text-center space-y-4">
                        <div className="p-4 bg-rose-50 dark:bg-rose-500/10 rounded-2xl border border-rose-100 dark:border-rose-500/20">
                            <Info className="w-8 h-8 text-rose-500" />
                        </div>
                        <div className="space-y-1">
                            <p className="font-semibold text-rose-500">{error}</p>
                            <p className="text-xs text-slate-400 dark:text-slate-500 font-bold">Try refreshing or check your connection.</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => window.location.reload()} className="rounded-xl font-semibold text-[10px] tracking-wider px-6 uppercase border-slate-200 dark:border-border hover:bg-accent hover:text-accent-foreground">Retry Sync</Button>
                    </div>
                ) : (
                    <>
                        <div className="flex-1 overflow-auto">
                            <table className="w-full border-collapse">
                                <thead>
                                    <tr className="bg-slate-50/50 dark:bg-white/[0.01] border-b border-border dark:border-border sticky top-0 z-20 backdrop-blur-md">
                                        <TableHead className="px-6 py-4 text-left font-semibold text-[10px] uppercase tracking-wider text-slate-400">Date</TableHead>
                                        <TableHead className="text-right px-6 font-semibold text-[10px] uppercase tracking-wider text-emerald-500/60 transition-colors hover:text-emerald-500 cursor-help">Buy Qty</TableHead>
                                        <TableHead className="text-right px-6 font-semibold text-[10px] uppercase tracking-wider text-emerald-500/40">Buy Rate</TableHead>
                                        <TableHead className="text-right px-6 font-semibold text-[10px] uppercase tracking-wider text-rose-500/60 transition-colors hover:text-rose-500 cursor-help">Sell Qty</TableHead>
                                        <TableHead className="text-right px-6 font-semibold text-[10px] uppercase tracking-wider text-rose-500/40">Sell Rate</TableHead>
                                        <TableHead className="text-right px-6 font-semibold text-[10px] uppercase tracking-wider text-slate-900 dark:text-slate-100">Net Qty</TableHead>
                                        <TableHead className="text-right px-6 font-semibold text-[10px] uppercase tracking-wider text-primary/60 bg-primary/[0.02]">Cum. Qty</TableHead>
                                        <TableHead className="text-right px-6 font-semibold text-[10px] uppercase tracking-wider text-primary/60 transition-colors hover:text-primary cursor-help">WAC</TableHead>
                                    </tr>
                                </thead>
                                <TableBody>
                                    {historyData.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={8} className="h-40 text-center text-slate-400 dark:text-slate-500 font-bold italic">
                                                No accumulation data found for this selection.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        paginatedHistory.map((item, idx) => (
                                            <TableRow 
                                                key={idx} 
                                                className={cn(
                                                    "group border-b border-slate-50 dark:border-white/[0.02] hover:bg-slate-50/50 dark:hover:bg-white/[0.02] last:border-0 transition-all duration-200 border-l-[3px]",
                                                    item.net_quantity > 0 ? "border-l-emerald-500/50" : item.net_quantity < 0 ? "border-l-rose-500/50" : "border-l-transparent"
                                                )}
                                            >
                                                <TableCell className="px-6 py-4">
                                                    <div className="flex items-center gap-2 group/date">
                                                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 font-mono tracking-tight">{item.date}</span>
                                                        <Link
                                                            href={`/floorsheet?symbol=${selectedSymbol}&broker=${selectedBroker}&date=${item.date}`}
                                                            className="p-1.5 bg-slate-100 dark:bg-white/[0.05] rounded-lg text-primary hover:bg-primary/90 hover:text-primary-foreground opacity-0 group-hover/date:opacity-100 transition-all flex items-center gap-1.5 shadow-sm"
                                                        >
                                                            <ExternalLink className="w-3 h-3" />
                                                            <span className="text-[8px] font-semibold uppercase tracking-tighter">View</span>
                                                        </Link>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right px-6 font-mono font-semibold text-emerald-600 dark:text-emerald-400 text-sm">
                                                    {item.buy_qty > 0 ? formatNepaliNumber(item.buy_qty) : '-'}
                                                </TableCell>
                                                <TableCell className="text-right px-6 font-mono text-[10px] font-bold text-slate-400 dark:text-slate-500 italic">
                                                    {item.buy_qty > 0 ? `रू ${formatNepaliCurrency(item.buy_rate, 2)}` : '-'}
                                                </TableCell>
                                                <TableCell className="text-right px-6 font-mono font-semibold text-rose-600 dark:text-rose-400 text-sm">
                                                    {item.sell_qty > 0 ? formatNepaliNumber(item.sell_qty) : '-'}
                                                </TableCell>
                                                <TableCell className="text-right px-6 font-mono text-[10px] font-bold text-slate-400 dark:text-slate-500 italic">
                                                    {item.sell_qty > 0 ? `रू ${formatNepaliCurrency(item.sell_rate, 2)}` : '-'}
                                                </TableCell>
                                                <TableCell className="text-right px-6 py-4">
                                                    <div className="flex flex-col items-end gap-1">
                                                        <span className={cn(
                                                            "text-sm font-semibold font-mono",
                                                            item.net_quantity > 0 ? 'text-emerald-600 dark:text-emerald-400' : item.net_quantity < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400 dark:text-slate-500'
                                                        )}>
                                                            {item.net_quantity !== 0 ? (item.net_quantity > 0 ? '+' : '') + formatNepaliNumber(item.net_quantity) : '0'}
                                                        </span>
                                                        {item.net_quantity !== 0 && (
                                                            <div className={cn(
                                                                "flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[8px] font-semibold tracking-wider uppercase",
                                                                item.net_quantity > 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
                                                            )}>
                                                                {item.net_quantity > 0 ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}
                                                                {item.net_quantity > 0 ? "Net Buy" : "Net Sell"}
                                                            </div>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right px-6 font-mono font-semibold bg-primary/[0.01] text-primary text-base shadow-inner">
                                                    {formatNepaliNumber(item.cumulative_qty)}
                                                </TableCell>
                                                <TableCell className="text-right px-6 font-mono font-semibold text-primary text-sm group-hover:scale-110 transition-transform">
                                                    {item.wac ? `रू ${formatNepaliCurrency(item.wac, 2)}` : '-'}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </table>
                        </div>

                        {/* Pagination Controls */}
                        {!loading && !error && historyData.length > 0 && (
                            <div className="p-4 md:p-6 border-t border-slate-200 dark:border-border bg-slate-50/50 dark:bg-white/[0.01] flex flex-col sm:flex-row items-center justify-between gap-4 mt-auto">
                                <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 tracking-wider px-2">Rows per page</span>
                                    <select
                                        value={pageSize}
                                        onChange={(e) => {
                                            setPageSize(Number(e.target.value));
                                            setPage(1);
                                        }}
                                        className="bg-white dark:bg-card border border-slate-200 dark:border-border rounded-lg px-2 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 outline-none"
                                    >
                                        {[20, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}
                                    </select>
                                    <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 tracking-wider hidden sm:inline ml-2">
                                        Total {historyData.length} records
                                    </span>
                                </div>

                                <div className="flex items-center gap-6">
                                    <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 tracking-wider">
                                        Page <span className="text-slate-900 dark:text-white px-1">{page}</span> of <span className="text-slate-900 dark:text-white px-1">{totalPages}</span>
                                    </span>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setPage(p => Math.max(1, p - 1))}
                                            disabled={page === 1}
                                            className="h-9 px-4 rounded-xl font-semibold text-[10px] tracking-wider border-slate-200 dark:border-border hover:bg-accent hover:text-accent-foreground transition-all"
                                        >
                                            Previous
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                            disabled={page >= totalPages}
                                            className="h-9 px-4 rounded-xl font-semibold text-[10px] uppercase tracking-wider border-slate-200 dark:border-border hover:bg-accent hover:text-accent-foreground transition-all"
                                        >
                                            Next
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );

}

export default function HistoryPage() {
    return (
        <Suspense fallback={<FullPageLoader />}>
            <HistoryPageContent />
        </Suspense>
    );
}
