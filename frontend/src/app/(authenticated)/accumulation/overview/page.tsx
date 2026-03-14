'use client';

import { useEffect, useState, useMemo } from 'react';
import api from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
    Search,
    Loader2,
    ArrowRight,
    ChevronUp,
    ChevronDown,
} from 'lucide-react';
import {
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import Link from 'next/link';
import { formatNepaliNumber, formatRupees } from "@/lib/formatters";
import { AccumulationData } from '@/types/accumulation';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

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

export default function OverviewPage() {
    const [data, setData] = useState<AccumulationData[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [range, setRange] = useState('1W');
    const [sector, setSector] = useState('All');
    const [sectors, setSectors] = useState<string[]>(['All']);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [sortConfig, setSortConfig] = useState<{ key: keyof AccumulationData; direction: 'asc' | 'desc' }>({
        key: 'net_qty',
        direction: 'desc'
    });

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const res = await api.get(`/api/stocks/companies/accumulation/?range=${range}`);
                setData(res.data);
                const uniqueSectors = ['All', ...Array.from(new Set(res.data.map((item: any) => item.sector))) as string[]];
                setSectors(uniqueSectors);
            } catch (err) {
                console.error('Failed to fetch accumulation data', err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [range]);

    const handleSort = (key: keyof AccumulationData) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const sortedData = [...data]
        .filter(item =>
            (sector === 'All' || item.sector === sector) &&
            (item.symbol.toLowerCase().includes(search.toLowerCase()) ||
                item.name.toLowerCase().includes(search.toLowerCase()))
        )
        .sort((a, b) => {
            const aValue = a[sortConfig.key];
            const bValue = b[sortConfig.key];

            if (typeof aValue === 'number' && typeof bValue === 'number') {
                return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
            }
            if (String(aValue) < String(bValue)) return sortConfig.direction === 'asc' ? -1 : 1;
            if (String(aValue) > String(bValue)) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

    const totalPages = Math.ceil(sortedData.length / pageSize) || 1;
    const paginatedData = sortedData.slice((page - 1) * pageSize, page * pageSize);

    useEffect(() => {
        setPage(1);
    }, [search, sector, range, sortConfig]);

    const SortIcon = ({ column }: { column: string }) => {
        if (sortConfig.key !== column) return <div className="w-4 h-4 opacity-20"><ChevronDown className="w-4 h-4" /></div>;
        return sortConfig.direction === 'asc' ? <ChevronUp className="w-4 h-4 text-blue-500" /> : <ChevronDown className="w-4 h-4 text-blue-500" />;
    };

    return (
        <div className="space-y-6 lg:space-y-8 min-h-screen">
            {/* Main Table Interface */}
            <div className="bg-white dark:bg-slate-950/40 backdrop-blur-xl rounded-2xl border border-slate-200 dark:border-white/5 shadow-2xl overflow-hidden">
                {/* Unified Toolbar */}
                <div className="p-4 md:p-6 border-b border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02] flex flex-col xl:flex-row justify-between items-stretch xl:items-center gap-6">
                    <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4">
                        <div className="bg-white dark:bg-slate-900/60 p-1 rounded-xl border border-slate-200 dark:border-white/5 shadow-inner flex overflow-x-auto no-scrollbar">
                            {timeRanges.map((t) => (
                                <button
                                    key={t.value}
                                    onClick={() => setRange(t.value)}
                                    className={cn(
                                        "px-4 py-1.5 rounded-lg text-xs font-black transition-all duration-300 tracking-tighter whitespace-nowrap",
                                        range === t.value
                                            ? "bg-slate-900 dark:bg-indigo-600 text-white shadow-lg"
                                            : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                    )}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                        <div className="h-4 w-px bg-slate-200 dark:bg-white/10 hidden md:block" />
                        <div className="flex items-center gap-2 bg-white dark:bg-slate-900/60 p-1 rounded-xl border border-slate-200 dark:border-white/5">
                            <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 px-2">Sector</span>
                            <select
                                value={sector}
                                onChange={(e) => setSector(e.target.value)}
                                className="bg-transparent border-none text-xs font-black text-slate-700 dark:text-slate-300 outline-none min-w-[120px] pr-2"
                            >
                                {sectors.map(s => (
                                    <option key={s} value={s} className="bg-white dark:bg-slate-900">{s}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="relative group max-w-md">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                        <Input
                            placeholder="Search by Symbol or Name..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-11 pr-4 h-11 w-full xl:w-80 rounded-xl bg-white dark:bg-slate-900/60 border-slate-200 dark:border-white/5 shadow-none focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-indigo-500/20 transition-all font-bold text-sm"
                        />
                    </div>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center p-32 space-y-6">
                        <div className="relative">
                            <Loader2 className="w-12 h-12 text-blue-500 dark:text-indigo-500 animate-spin" />
                            <div className="absolute inset-0 blur-xl bg-blue-500/20 animate-pulse rounded-full" />
                        </div>
                        <div className="text-center">
                            <p className="text-lg font-semibold text-slate-800 dark:text-slate-200">Processing Floor-sheet Data</p>
                            <p className="text-sm text-slate-500 dark:text-slate-500 font-medium">Crunching institutional movements...</p>
                        </div>
                    </div>
                ) : (
                    <div className="relative">
                        <div className="overflow-x-auto">
                            <table className="w-full border-separate border-spacing-0">
                                <thead>
                                    <tr className="bg-gray-50/50 dark:bg-slate-800/30 hover:bg-gray-50/50 dark:hover:bg-slate-800/30 border-b border-gray-100 dark:border-slate-800 h-14 transition-all">
                                        <TableHead
                                            className="px-6 text-left cursor-pointer sticky top-0 z-30 bg-gray-50/80 dark:bg-slate-900/80 backdrop-blur-md shadow-sm font-bold text-gray-900 dark:text-slate-100 border-b border-gray-100 dark:border-slate-800"
                                            onClick={() => handleSort('symbol')}
                                        >
                                            <div className="flex items-center gap-2">
                                                Ticker <SortIcon column="symbol" />
                                            </div>
                                        </TableHead>
                                        <TableHead
                                            className="text-right px-6 cursor-pointer sticky top-0 z-30 bg-gray-50/80 dark:bg-slate-900/80 backdrop-blur-md shadow-sm font-bold text-gray-900 dark:text-slate-100 text-[11px] uppercase tracking-wider border-b border-gray-100 dark:border-slate-800"
                                            onClick={() => handleSort('close')}
                                        >
                                            <div className="flex items-center justify-end gap-2">
                                                LTP <SortIcon column="close" />
                                            </div>
                                        </TableHead>
                                        <TableHead
                                            className="text-right px-6 cursor-pointer sticky top-0 z-30 bg-gray-50/80 dark:bg-slate-900/80 backdrop-blur-md shadow-sm font-bold text-emerald-600 dark:text-emerald-400 text-[11px] uppercase tracking-wider border-b border-gray-100 dark:border-slate-800"
                                            onClick={() => handleSort('net_qty')}
                                        >
                                            <div className="flex items-center justify-end gap-2">
                                                Net Acc. <SortIcon column="net_qty" />
                                            </div>
                                        </TableHead>
                                        <TableHead
                                            className="text-center px-6 w-[220px] cursor-pointer sticky top-0 z-30 bg-gray-50/80 dark:bg-slate-900/80 backdrop-blur-md shadow-sm font-bold text-gray-900 dark:text-slate-100 text-[11px] uppercase tracking-wider border-b border-gray-100 dark:border-slate-800"
                                            onClick={() => handleSort('accumulation_ratio')}
                                        >
                                            <div className="flex items-center justify-center gap-2">
                                                Intensity <SortIcon column="accumulation_ratio" />
                                            </div>
                                        </TableHead>
                                        <TableHead className="text-center hidden md:table-cell px-6 sticky top-0 z-30 bg-gray-50/80 dark:bg-slate-900/80 backdrop-blur-md shadow-sm font-bold text-gray-900 dark:text-slate-100 text-[11px] uppercase tracking-wider border-b border-gray-100 dark:border-slate-800">
                                            Buyers
                                        </TableHead>
                                        <TableHead className="text-center hidden md:table-cell px-6 sticky top-0 z-30 bg-gray-50/80 dark:bg-slate-900/80 backdrop-blur-md shadow-sm font-bold text-gray-900 dark:text-slate-100 text-[11px] uppercase tracking-wider border-b border-gray-100 dark:border-slate-800">
                                            Sellers
                                        </TableHead>
                                        <TableHead className="w-[80px] px-6 sticky top-0 z-30 bg-gray-50/80 dark:bg-slate-900/80 backdrop-blur-md shadow-sm border-b border-gray-100 dark:border-slate-800"></TableHead>
                                    </tr>
                                </thead>
                            <TableBody className="isolate">
                                <AnimatePresence initial={false}>
                                    {sortedData.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="h-64 text-center">
                                                <div className="flex flex-col items-center justify-center animate-in fade-in zoom-in duration-500">
                                                    <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-full mb-4">
                                                        <Search className="w-8 h-8 text-slate-400" />
                                                    </div>
                                                    <p className="text-slate-800 dark:text-slate-200 font-bold">No Records Found</p>
                                                    <p className="text-slate-400 text-sm">Try adjusting your filters or range</p>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        paginatedData.map((item, index) => (
                                            <motion.tr
                                                key={item.symbol}
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ duration: 0.3, delay: index * 0.02 }}
                                                className={cn(
                                                    "group border-b border-gray-50 dark:border-slate-800 hover:bg-blue-50/30 dark:hover:bg-slate-800/30 last:border-0 transition-all duration-200 cursor-pointer border-l-4 hover:shadow-lg hover:scale-[1.01] hover:-translate-y-0.5 relative z-0",
                                                    item.net_qty > 0 ? "border-l-emerald-500/50 hover:border-l-emerald-500" : item.net_qty < 0 ? "border-l-rose-500/50 hover:border-l-rose-500" : "border-l-transparent hover:border-l-blue-400/50"
                                                )}
                                            >
                                                <TableCell className="px-6 py-4">
                                                    <div className="flex flex-col">
                                                        <Link href={`/ticker/${item.symbol}`}>
                                                            <span className="text-base font-medium text-slate-900 dark:text-indigo-400 leading-none hover:text-blue-600 dark:hover:text-white transition-colors cursor-pointer">{item.symbol}</span>
                                                        </Link>
                                                        <span className="text-[10px] font-medium lg:hidden text-slate-400 mt-1 tracking-tighter truncate max-w-[80px]">{item.name}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right px-6 font-mono font-medium text-slate-800 dark:text-slate-200">
                                                    {formatRupees(item.close, 1)}
                                                </TableCell>
                                                <TableCell className="text-right px-6">
                                                    <div className={cn(
                                                        "inline-flex flex-col items-end px-3 py-1 rounded-lg transition-all duration-300",
                                                        item.net_qty >= 0 ? "bg-emerald-500/5 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/5 text-rose-600 dark:text-rose-400"
                                                    )}>
                                                        <span className="text-sm font-black tracking-tight">
                                                            {item.net_qty >= 0 ? '+' : ''}{formatNepaliNumber(item.net_qty)}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="px-6">
                                                    <div className="flex flex-col gap-2">
                                                        <div className="flex justify-between items-end">
                                                            <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 tracking-tighter">Strength</span>
                                                            <span className={cn(
                                                                "text-xs font-black",
                                                                item.accumulation_ratio > 30 ? "text-orange-500" : "text-slate-600 dark:text-slate-300"
                                                            )}>{item.accumulation_ratio.toFixed(1)}%</span>
                                                        </div>
                                                        <div className="w-full bg-slate-100 dark:bg-white/[0.05] rounded-full h-1.5 overflow-hidden shadow-inner flex relative">
                                                            <motion.div
                                                                initial={{ width: 0 }}
                                                                animate={{ width: `${Math.min(item.accumulation_ratio, 100)}%` }}
                                                                className={cn(
                                                                    "h-full relative overflow-hidden",
                                                                    item.net_qty >= 0 ? 'bg-gradient-to-r from-emerald-400 to-emerald-600' : 'bg-gradient-to-r from-rose-400 to-rose-600'
                                                                )}
                                                            >
                                                                {/* Glow Effect */}
                                                                <div className="absolute top-0 right-0 h-full w-4 bg-white/30 blur-sm" />
                                                            </motion.div>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="hidden md:table-cell px-6">
                                                    <div className="flex flex-wrap justify-center gap-1.5">
                                                        {item.top_buyers?.map(b => (
                                                            <Link href={`/broker/${b}`} key={b}>
                                                                <span className="w-7 h-7 flex items-center justify-center bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 rounded-lg text-xs font-black border border-emerald-100 dark:border-emerald-500/20 hover:bg-emerald-500 hover:text-white dark:hover:bg-emerald-500 transition-all duration-300 shadow-sm">
                                                                    {b}
                                                                </span>
                                                            </Link>
                                                        ))}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="hidden md:table-cell px-6">
                                                    <div className="flex flex-wrap justify-center gap-1.5">
                                                        {item.top_sellers?.map(b => (
                                                            <Link href={`/broker/${b}`} key={b}>
                                                                <span className="w-7 h-7 flex items-center justify-center bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 rounded-lg text-xs font-black border border-rose-100 dark:border-rose-500/20 hover:bg-rose-500 hover:text-white dark:hover:bg-rose-500 transition-all duration-300 shadow-sm">
                                                                    {b}
                                                                </span>
                                                            </Link>
                                                        ))}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="px-6 text-right">
                                                    <Link href={`/ticker/${item.symbol}`}>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-9 w-9 bg-slate-100 dark:bg-white/[0.05] rounded-xl hover:bg-blue-600 hover:text-white dark:hover:bg-indigo-600 transition-all duration-300 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0"
                                                        >
                                                            <ArrowRight className="w-4 h-4" />
                                                        </Button>
                                                    </Link>
                                                </TableCell>
                                            </motion.tr>
                                        ))
                                    )}
                                </AnimatePresence>
                            </TableBody>
                        </table>

                        {/* Pagination Controls */}
                        {!loading && sortedData.length > 0 && (
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
                                        {[10, 20, 50, 100].map(s => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </select>
                                    <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 tracking-widest hidden sm:inline ml-2">
                                        Total {sortedData.length} records
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
            )}
        </div>

        <style jsx global>{`
            .no-scrollbar::-webkit-scrollbar {
                display: none;
            }
            .no-scrollbar {
                -ms-overflow-style: none;
                scrollbar-width: none;
            }
        `}</style>
    </div>
    );
}
