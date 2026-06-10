'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
    Search,
    History,
    Activity
} from 'lucide-react';
import { PageLoader } from '@/components/ui/StockLoader';
import {
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { formatNepaliNumber, formatRupees } from "@/lib/formatters";
import { BrokerFavorite } from '@/types/accumulation';

const timeRanges = [
    { label: '1D', value: '1D' },
    { label: '1W', value: '1W' },
    { label: '2W', value: '2W' },
    { label: '1M', value: '1M' },
    { label: '3M', value: '3M' },
    { label: '6M', value: '6M' },
    { label: '1Y', value: '1Y' },
    { label: '1Y+', value: 'ALL' },
];

export default function FavoritesPage() {
    const [favorites, setFavorites] = useState<BrokerFavorite[]>([]);
    const [allBrokers, setAllBrokers] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedBroker, setSelectedBroker] = useState('');
    const [range, setRange] = useState('1M');
    const [search, setSearch] = useState('');
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
        if (!selectedBroker) return;
        const fetchFavorites = async () => {
            setLoading(true);
            try {
                const res = await api.get(`/api/stocks/companies/broker_favorites/?broker=${selectedBroker}&range=${range}`);
                setFavorites(res.data);
            } catch (err) {
                console.error('Failed to fetch broker favorites', err);
            } finally {
                setLoading(false);
            }
        };
        fetchFavorites();
    }, [selectedBroker, range]);

    const filteredFavorites = favorites.filter(fav =>
        fav.symbol.toLowerCase().includes(search.toLowerCase()) ||
        fav.name.toLowerCase().includes(search.toLowerCase())
    );

    const paginatedFavorites = filteredFavorites.slice((page - 1) * pageSize, page * pageSize);

    return (
        <div className="space-y-6 lg:space-y-8 min-h-screen">
            <div className="bg-white dark:bg-card rounded-2xl border border-slate-200 dark:border-border shadow-sm">
                <div className="p-4 md:p-6 border-b border-slate-200 dark:border-border bg-slate-50/50 dark:bg-muted flex flex-col xl:flex-row justify-between items-stretch xl:items-center gap-6">
                    <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4">
                        <div className="bg-white dark:bg-card p-1 rounded-xl border border-slate-200 dark:border-border shadow-inner flex overflow-x-auto no-scrollbar">
                            {timeRanges.map((t) => (
                                <button
                                    key={t.value}
                                    onClick={() => {
                                        setRange(t.value);
                                        setPage(1);
                                    }}
                                    className={cn(
                                        "px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-300 tracking-tighter whitespace-nowrap",
                                        range === t.value
                                            ? "bg-orange-500 text-white shadow"
                                            : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                    )}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                        <div className="h-4 w-px bg-slate-200 dark:bg-white/10 hidden md:block" />
                        <div className="flex items-center gap-2 bg-muted/40 dark:from-slate-800 dark:to-indigo-900/30 p-1.5 rounded-xl border border-blue-100 dark:border-indigo-500/20 shadow-sm w-full md:w-auto transition-all hover:shadow-md">
                            <span className="text-[10px] font-semibold text-blue-600 dark:text-indigo-300 px-2 tracking-wider uppercase">Broker</span>
                            <select
                                value={selectedBroker}
                                onChange={(e) => {
                                    setSelectedBroker(e.target.value);
                                    setPage(1);
                                    setSearch('');
                                }}
                                className="bg-transparent border-none text-sm font-semibold text-slate-800 dark:text-white outline-none pr-4 min-w-[100px] cursor-pointer"
                            >
                                <option value="" className="text-slate-500 dark:text-slate-400">Choose ID...</option>
                                {allBrokers.map(b => <option key={b} value={b} className="text-slate-800">Broker {b}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="relative group max-w-md w-full xl:w-80">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500 group-focus-within:text-indigo-500 dark:group-focus-within:text-indigo-400 transition-colors" />
                        <Input
                            placeholder="Find a stock..."
                            value={search}
                            onChange={(e) => {
                                setSearch(e.target.value);
                                setPage(1);
                            }}
                            className="pl-11 pr-4 h-11 w-full rounded-xl bg-white dark:bg-card border-slate-200 dark:border-border shadow-sm focus:bg-white dark:focus:bg-slate-900 hover:border-slate-300 dark:hover:border-white/20 focus:ring-2 focus:ring-indigo-500/30 dark:focus:ring-indigo-500/40 transition-all font-bold text-sm"
                        />
                    </div>
                </div>
            <div className="p-0">
                {loading ? (
                    <PageLoader text="Analyzing broker favorites..." />
                ) : !selectedBroker ? (
                    <div className="py-32 px-4 text-center flex flex-col items-center justify-center min-h-[400px]">
                        <div className="relative mb-6">
                            <div className="absolute inset-0 bg-blue-500/20 dark:bg-indigo-500/20 blur-2xl rounded-full" />
                            <div className="w-24 h-24 bg-muted/40 dark:from-slate-800 dark:to-indigo-900/50 border border-white/50 dark:border-border shadow-xl rounded-xl flex items-center justify-center relative transform -rotate-6 hover:rotate-0 transition-all duration-500 cursor-default">
                                <Activity className="w-10 h-10 text-blue-500 dark:text-indigo-400" />
                            </div>
                        </div>
                        <h3 className="text-xl font-semibold text-slate-800 dark:text-white mb-2 tracking-tight">Broker Analysis</h3>
                        <p className="text-slate-500 dark:text-slate-400 font-medium max-w-sm leading-relaxed">Select a Broker ID from the dropdown above to view their buy, sell, and holding positions.</p>
                    </div>
                ) : (
                    <div>
                        <div className="overflow-x-auto no-scrollbar">
                            <table className="w-full border-collapse">
                                <thead>
                                    <tr className="bg-gray-50/50 dark:bg-slate-800/30 hover:bg-gray-50/50 dark:hover:bg-slate-800/30 border-b border-gray-100 dark:border-slate-800 h-14 transition-all">
                                        <TableHead className="px-6 text-left sticky top-0 z-30 bg-gray-50/80 dark:bg-card/80 shadow-sm font-bold text-gray-900 dark:text-slate-100 border-b border-gray-100 dark:border-slate-800"> Symbol </TableHead>
                                        <TableHead className="text-right px-6 sticky top-0 z-30 bg-gray-50/80 dark:bg-card/80 shadow-sm font-bold text-gray-900 dark:text-slate-100 text-[11px] uppercase tracking-wider border-b border-gray-100 dark:border-slate-800"> RSI </TableHead>
                                        <TableHead className="text-right px-6 sticky top-0 z-30 bg-gray-50/80 dark:bg-card/80 shadow-sm font-bold text-emerald-600 dark:text-emerald-400 text-[11px] uppercase tracking-wider border-b border-gray-100 dark:border-slate-800"> Buy Qty </TableHead>
                                        <TableHead className="text-right px-6 sticky top-0 z-30 bg-gray-50/80 dark:bg-card/80 shadow-sm font-bold text-rose-600 dark:text-rose-400 text-[11px] uppercase tracking-wider border-b border-gray-100 dark:border-slate-800"> Sell Qty </TableHead>
                                        <TableHead className="text-right px-6 sticky top-0 z-30 bg-gray-50/80 dark:bg-card/80 shadow-sm font-bold text-blue-600 dark:text-indigo-400 text-[11px] uppercase tracking-wider border-b border-gray-100 dark:border-slate-800"> Net Acc. ({range}) </TableHead>
                                        <TableHead className="text-right px-6 sticky top-0 z-30 bg-gray-50/80 dark:bg-card/80 shadow-sm font-bold text-gray-900 dark:text-slate-100 text-[11px] uppercase tracking-wider border-b border-gray-100 dark:border-slate-800"> Holding </TableHead>
                                        <TableHead className="text-right px-6 sticky top-0 z-30 bg-gray-50/80 dark:bg-card/80 shadow-sm font-bold text-orange-500 dark:text-orange-400 text-[11px] uppercase tracking-wider border-b border-gray-100 dark:border-slate-800"> WAC </TableHead>
                                        <TableHead className="text-right px-6 sticky top-0 z-30 bg-gray-50/80 dark:bg-card/80 shadow-sm font-bold text-gray-900 dark:text-slate-100 text-[11px] uppercase tracking-wider border-b border-gray-100 dark:border-slate-800"> LTP </TableHead>
                                        <TableHead className="text-right px-6 sticky top-0 z-30 bg-gray-50/80 dark:bg-card/80 shadow-sm font-bold text-gray-900 dark:text-slate-100 text-[11px] uppercase tracking-wider border-b border-gray-100 dark:border-slate-800"> ROC </TableHead>
                                        <TableHead className="w-[80px] px-6 sticky top-0 z-30 bg-gray-50/80 dark:bg-card/80 shadow-sm border-b border-gray-100 dark:border-slate-800"></TableHead>
                                    </tr>
                                </thead>
                                <TableBody>
                                    {paginatedFavorites.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={9} className="h-40 text-center text-gray-500 dark:text-slate-400 font-bold uppercase tracking-[0.2em] text-[10px]">
                                                No favorites data found.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        paginatedFavorites.map((fav, idx) => (
                                            <TableRow 
                                                key={idx} 
                                                className={cn(
                                                    "group border-b border-gray-50 dark:border-slate-800 hover:bg-blue-50/30 dark:hover:bg-slate-800/30 last:border-0 transition-all duration-200 cursor-pointer border-l-4 hover:shadow-lg hover:scale-[1.01] hover:-translate-y-0.5",
                                                    fav.qty_accumulated > 0 ? "border-l-emerald-500/50 hover:border-l-emerald-500" : fav.qty_accumulated < 0 ? "border-l-rose-500/50 hover:border-l-rose-500" : "border-l-transparent hover:border-l-blue-400/50"
                                                )}
                                            >
                                                <TableCell className="px-6 py-4">
                                                    <div className="flex flex-col">
                                                        <Link href={`/ticker/${fav.symbol}`}>
                                                            <span className="text-base font-medium text-slate-900 dark:text-indigo-400 leading-none hover:text-blue-600 dark:hover:text-white transition-colors cursor-pointer">{fav.symbol}</span>
                                                        </Link>
                                                        <span className="text-[10px] font-medium lg:hidden text-slate-400 mt-1 tracking-tighter truncate max-w-[80px]">{fav.name}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right px-6">
                                                    {fav.rsi != null ? (
                                                        <span className={cn(
                                                            "text-xs font-bold px-2 py-0.5 rounded-md",
                                                            fav.rsi >= 70 ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
                                                            : fav.rsi <= 30 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                                            : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                                                        )}>
                                                            {fav.rsi.toFixed(1)}
                                                        </span>
                                                    ) : <span className="text-slate-400">—</span>}
                                                </TableCell>
                                                <TableCell className="text-right px-6 font-mono font-medium text-emerald-600 dark:text-emerald-400">
                                                    {formatNepaliNumber(fav.buy_qty)}
                                                </TableCell>
                                                <TableCell className="text-right px-6 font-mono font-medium text-rose-600 dark:text-rose-400">
                                                    {formatNepaliNumber(fav.sell_qty)}
                                                </TableCell>
                                                <TableCell className="text-right px-6">
                                                    <div className={cn(
                                                        "inline-flex flex-col items-end px-3 py-1 rounded-lg transition-all duration-300",
                                                        fav.qty_accumulated >= 0 ? "bg-emerald-500/5 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/5 text-rose-600 dark:text-rose-400"
                                                    )}>
                                                        <span className="text-sm font-semibold tracking-tight">
                                                            {fav.qty_accumulated > 0 ? '+' : ''}{formatNepaliNumber(fav.qty_accumulated)}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right px-6 font-mono font-medium text-slate-800 dark:text-slate-200">
                                                    {formatNepaliNumber(fav.current_net)}
                                                </TableCell>
                                                <TableCell className="text-right px-6 font-mono font-medium text-orange-600 dark:text-orange-400">
                                                    {formatRupees(fav.wac, 1)}
                                                </TableCell>
                                                <TableCell className="text-right px-6 font-mono font-medium text-slate-800 dark:text-slate-200">
                                                    {formatRupees(fav.ltp, 1)}
                                                </TableCell>
                                                <TableCell className="text-right px-6">
                                                    {fav.roc != null ? (
                                                        <span className={cn(
                                                            "text-xs font-bold",
                                                            fav.roc >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                                                        )}>
                                                            {fav.roc >= 0 ? '+' : ''}{fav.roc.toFixed(2)}%
                                                        </span>
                                                    ) : <span className="text-slate-400">—</span>}
                                                </TableCell>
                                                <TableCell className="px-6 text-right">
                                                    <Link href={`/accumulation/history?symbol=${fav.symbol}&broker=${selectedBroker}`}>
                                                        <Button 
                                                            variant="ghost" 
                                                            size="icon" 
                                                            className="h-9 w-9 bg-slate-100 dark:bg-white/[0.05] rounded-xl hover:bg-blue-600 hover:text-white dark:hover:bg-indigo-600 transition-all duration-300 opacity-0 group-hover:opacity-100"
                                                        >
                                                            <History className="w-4 h-4" />
                                                        </Button>
                                                    </Link>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </table>
                        </div>
                        {/* Pagination Controls */}
                        {!loading && selectedBroker && filteredFavorites.length > 0 && (
                            <div className="p-4 md:p-6 border-t border-slate-200 dark:border-border bg-slate-50/50 dark:bg-white/[0.01] flex flex-col sm:flex-row items-center justify-between gap-4">
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
                                        {[10, 20, 50, 100].map(s => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </select>
                                    <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 tracking-wider hidden sm:inline ml-2">
                                        Total {filteredFavorites.length} records
                                    </span>
                                </div>

                                <div className="flex items-center gap-6">
                                    <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 tracking-wider">
                                        Page <span className="text-slate-900 dark:text-white px-1">{page}</span> of <span className="text-slate-900 dark:text-white px-1">{Math.ceil(filteredFavorites.length / pageSize) || 1}</span>
                                    </span>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setPage(p => Math.max(1, p - 1))}
                                            disabled={page === 1}
                                            className="h-9 px-4 rounded-xl font-semibold text-[10px] tracking-wider border-slate-200 dark:border-border hover:bg-slate-100 dark:hover:bg-white/5 transition-all"
                                        >
                                            Previous
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setPage(p => Math.min(Math.ceil(filteredFavorites.length / pageSize), p + 1))}
                                            disabled={page * pageSize >= filteredFavorites.length}
                                            className="h-9 px-4 rounded-xl font-semibold text-[10px] uppercase tracking-wider border-slate-200 dark:border-border hover:bg-slate-100 dark:hover:bg-white/5 transition-all"
                                        >
                                            Next
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    </div>
    );
}
