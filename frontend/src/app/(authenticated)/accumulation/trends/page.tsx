'use client';

import { useEffect, useState, useMemo } from 'react';
import api from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
    Search,
    ChevronDown,
    ChevronUp,
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
import { formatNepaliNumber, formatRupees } from "@/lib/formatters";
import { BrokerTrend } from '@/types/accumulation';
import { TrendBadge } from '@/components/accumulation/TrendBadge';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { InfoTooltip } from '@/components/ui/InfoTooltip';

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

export default function TrendsPage() {
    const [trends, setTrends] = useState<BrokerTrend[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [range, setRange] = useState('ALL');
    const [sortConfig, setSortConfig] = useState<{ key: keyof BrokerTrend | 'change_5d' | 'change_10d' | 'change_20d' | 'change_50d'; direction: 'asc' | 'desc' }>({
        key: 'cumulative_net',
        direction: 'desc'
    });

    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [selectedSector, setSelectedSector] = useState('All');
    const [sectors, setSectors] = useState<{ name: string; count: number }[]>([]);

    useEffect(() => {
        const fetchSectors = async () => {
            try {
                const res = await api.get('/api/stocks/companies/sectors/');
                setSectors(res.data);
            } catch (err) {
                console.error('Failed to fetch sectors', err);
            }
        };
        fetchSectors();
    }, []);

    useEffect(() => {
        const fetchTrends = async () => {
            setLoading(true);
            try {
                const res = await api.get(`/api/stocks/companies/broker_trends/?range=${range}`);
                setTrends(res.data);
            } catch (err) {
                console.error('Failed to fetch broker trends', err);
            } finally {
                setLoading(false);
            }
        };
        fetchTrends();
    }, [range]);

    const handleSort = (key: keyof BrokerTrend | 'change_5d' | 'change_10d' | 'change_20d' | 'change_50d') => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const sortedTrends = [...trends]
        .filter(t => {
            const matchesSearch = t.symbol.toLowerCase().includes(search.toLowerCase()) ||
                                String(t.broker).includes(search);
            const matchesSector = selectedSector === 'All' || t.sector === selectedSector;
            return matchesSearch && matchesSector;
        })
        .sort((a, b) => {
            const key = sortConfig.key;
            const aValue = a[key as keyof BrokerTrend];
            const bValue = b[key as keyof BrokerTrend];

            if (typeof aValue === 'number' && typeof bValue === 'number') {
                return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
            }
            if (String(aValue) < String(bValue)) return sortConfig.direction === 'asc' ? -1 : 1;
            if (String(aValue) > String(bValue)) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

    useEffect(() => {
        setPage(1);
    }, [search, sortConfig, range, selectedSector]);

    const totalPages = Math.ceil(sortedTrends.length / pageSize) || 1;
    const paginatedTrends = sortedTrends.slice((page - 1) * pageSize, page * pageSize);

    const SortIcon = ({ column }: { column: string }) => {
        if (sortConfig.key !== column) return <div className="w-4 h-4 opacity-20"><ChevronDown className="w-4 h-4" /></div>;
        return sortConfig.direction === 'asc' ? <ChevronUp className="w-4 h-4 text-blue-500" /> : <ChevronDown className="w-4 h-4 text-blue-500" />;
    };

    return (
        <div className="space-y-6 lg:space-y-8 min-h-screen">
            <div className="bg-white dark:bg-card rounded-2xl border border-slate-200 dark:border-border shadow-sm">
                <div className="p-4 md:p-6 border-b border-slate-200 dark:border-border bg-slate-50/50 dark:bg-muted flex flex-col xl:flex-row justify-between items-stretch xl:items-center gap-6">
                    <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4">
                        <div className="bg-white dark:bg-card p-1 rounded-xl border border-slate-200 dark:border-border shadow-inner flex overflow-x-auto no-scrollbar">
                            {timeRanges.map((t) => (
                                <button
                                    key={t.value}
                                    onClick={() => setRange(t.value)}
                                    className={cn(
                                        "px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-300 tracking-tighter whitespace-nowrap",
                                        range === t.value
                                            ? "bg-slate-900 dark:bg-indigo-600 text-white shadow-lg"
                                            : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                    )}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                        <div className="bg-white dark:bg-card p-1 rounded-xl border border-slate-200 dark:border-border shadow-inner flex overflow-x-auto no-scrollbar max-w-[200px] md:max-w-xs lg:max-w-md">
                            <button
                                onClick={() => setSelectedSector('All')}
                                className={cn(
                                    "px-4 py-1.5 rounded-lg text-[10px] font-semibold transition-all duration-300 tracking-tighter whitespace-nowrap",
                                    selectedSector === 'All'
                                        ? "bg-slate-900 dark:bg-indigo-600 text-white shadow-lg"
                                        : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                )}
                            >
                                ALL SECTORS
                            </button>
                            {sectors.map((s) => (
                                <button
                                    key={s.name}
                                    onClick={() => setSelectedSector(s.name)}
                                    className={cn(
                                        "px-4 py-1.5 rounded-lg text-[10px] font-semibold transition-all duration-300 tracking-tighter whitespace-nowrap",
                                        selectedSector === s.name
                                            ? "bg-slate-900 dark:bg-indigo-600 text-white shadow-lg"
                                            : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                    )}
                                >
                                    {s.name.toUpperCase()}
                                </button>
                            ))}
                        </div>
                    </div>
                    
                    <div className="relative group max-w-md w-full xl:w-80">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                        <Input
                            placeholder="Filter symbols or brokers..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-11 pr-4 h-11 w-full rounded-xl bg-white dark:bg-card border-slate-200 dark:border-border shadow-none focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-indigo-500/20 transition-all font-bold text-sm"
                        />
                    </div>
                </div>

                {loading ? (
                    <PageLoader text="Analyzing institutional trends..." />
                ) : (
                    <div className="overflow-x-auto relative">
                        <table className="w-full border-collapse">
                            <TableHeader>
                                <TableRow className="bg-gray-50/50 dark:bg-slate-800/30 hover:bg-gray-50/50 dark:hover:bg-slate-800/30 border-b border-gray-100 dark:border-slate-800">
                                    <TableHead className="h-14 px-6 text-left cursor-pointer font-bold text-gray-900 dark:text-slate-100" onClick={() => handleSort('symbol')}>
                                        <div className="flex items-center gap-2">Symbol <SortIcon column="symbol" /></div>
                                    </TableHead>
                                    <TableHead className="px-6 text-left cursor-pointer font-bold text-gray-900 dark:text-slate-100" onClick={() => handleSort('broker')}>
                                        <div className="flex items-center gap-2">Broker <SortIcon column="broker" /></div>
                                    </TableHead>
                                    <TableHead className="text-right px-6 cursor-pointer font-bold text-gray-900 dark:text-slate-100" onClick={() => handleSort('range_net')}>
                                        <div className="flex items-center justify-end gap-2 text-emerald-600 dark:text-emerald-400">
                                            Net Acc. 
                                            <InfoTooltip content="Total units net-bought (or sold) by this broker within the selected time range. High positive values indicate institutional accumulation." />
                                            <SortIcon column="range_net" />
                                        </div>
                                    </TableHead>
                                    <TableHead className="text-right px-6 cursor-pointer font-bold text-gray-900 dark:text-slate-100" onClick={() => handleSort('cumulative_net')}>
                                        <div className="flex items-center justify-end gap-2 text-[11px] uppercase tracking-wider">Total Pos. <SortIcon column="cumulative_net" /></div>
                                    </TableHead>
                                    <TableHead className="text-right px-6 cursor-pointer font-bold text-gray-900 dark:text-slate-100" onClick={() => handleSort('ltp')}>
                                        <div className="flex items-center justify-end gap-2 text-[11px] uppercase tracking-wider">LTP <SortIcon column="ltp" /></div>
                                    </TableHead>
                                    <TableHead className="text-right px-6 cursor-pointer font-bold text-orange-500 dark:text-orange-400 font-semibold tracking-wider text-[10px]" onClick={() => handleSort('wac')}>
                                        <div className="flex items-center justify-end gap-2">
                                            WAC 
                                            <InfoTooltip content="Weighted Average Cost: The estimated average price at which this broker accumulated their current position." />
                                            <SortIcon column="wac" />
                                        </div>
                                    </TableHead>
                                    <TableHead className="text-center px-4 cursor-pointer font-bold text-gray-900 dark:text-slate-100 text-[10px] tracking-wider" onClick={() => handleSort('change_5d')}>
                                        <div className="flex items-center justify-center gap-2">5D <SortIcon column="change_5d" /></div>
                                    </TableHead>
                                    <TableHead className="text-center px-4 cursor-pointer font-bold text-gray-900 dark:text-slate-100 text-[10px] tracking-wider" onClick={() => handleSort('change_10d')}>
                                        <div className="flex items-center justify-center gap-2">10D <SortIcon column="change_10d" /></div>
                                    </TableHead>
                                    <TableHead className="hidden lg:table-cell text-center px-4 cursor-pointer font-bold text-gray-900 dark:text-slate-100 text-[10px] tracking-wider" onClick={() => handleSort('change_20d')}>
                                        <div className="flex items-center justify-center gap-2">20D <SortIcon column="change_20d" /></div>
                                    </TableHead>
                                    <TableHead className="hidden lg:table-cell text-center px-4 cursor-pointer font-bold text-gray-900 dark:text-slate-100 text-[10px] tracking-wider" onClick={() => handleSort('change_50d')}>
                                        <div className="flex items-center justify-center gap-2">50D <SortIcon column="change_50d" /></div>
                                    </TableHead>
                                    <TableHead className="w-[80px] px-6"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                <AnimatePresence initial={false}>
                                    {sortedTrends.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={11} className="h-64 text-center">
                                                <div className="flex flex-col items-center justify-center">
                                                    <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-full mb-4">
                                                        <Search className="w-8 h-8 text-slate-400" />
                                                    </div>
                                                    <p className="text-slate-800 dark:text-slate-200 font-bold">No Trends Found</p>
                                                    <p className="text-slate-400 text-sm">Try search criteria</p>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        paginatedTrends.map((row, idx) => (
                                            <motion.tr 
                                                key={`${row.symbol}-${row.broker}`}
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ duration: 0.3, delay: idx * 0.02 }}
                                                className={cn(
                                                    "group border-b border-gray-50 dark:border-slate-800 hover:bg-blue-50/30 dark:hover:bg-slate-800/30 last:border-0 transition-all duration-200 cursor-pointer border-l-4 hover:shadow-lg hover:scale-[1.01] hover:-translate-y-0.5",
                                                    (row.range_net || 0) > 0 ? "border-l-emerald-500/50 hover:border-l-emerald-500" : (row.range_net || 0) < 0 ? "border-l-rose-500/50 hover:border-l-rose-500" : "border-l-transparent hover:border-l-blue-400/50"
                                                )}
                                            >
                                                <TableCell className="px-6 py-4">
                                                    <Link href={`/ticker/${row.symbol}`}>
                                                        <span className="text-base font-medium text-slate-900 dark:text-indigo-400 leading-none hover:text-blue-600 dark:hover:text-white transition-colors cursor-pointer">{row.symbol}</span>
                                                    </Link>
                                                </TableCell>
                                                <TableCell className="px-6">
                                                    <Link href={`/broker/${row.broker}`}>
                                                        <span className="px-3 py-1 bg-slate-100 dark:bg-white/[0.05] rounded-lg text-[10px] font-semibold border border-slate-200 dark:border-border hover:bg-blue-600 hover:text-white dark:hover:bg-indigo-600 transition-all cursor-pointer uppercase tracking-wider shadow-sm">
                                                            Broker {row.broker}
                                                        </span>
                                                    </Link>
                                                </TableCell>
                                                <TableCell className="text-right px-6">
                                                    <span className={cn(
                                                        "text-sm font-semibold tracking-tight",
                                                        (row.range_net ?? 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                                                    )}>
                                                        {(row.range_net ?? 0) >= 0 ? '+' : ''}{formatNepaliNumber(row.range_net ?? 0)}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-right px-6">
                                                    <span className="text-sm font-semibold text-slate-500 dark:text-slate-400 tracking-tight">
                                                        {formatNepaliNumber(row.cumulative_net)}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-right px-6 font-mono font-bold text-slate-800 dark:text-slate-200">
                                                    {formatRupees(row.ltp, 1)}
                                                </TableCell>
                                                <TableCell className="text-right px-6 font-mono font-bold text-orange-600 dark:text-orange-400">
                                                    {formatRupees(row.wac || 0, 1)}
                                                </TableCell>
                                                <TableCell className="text-center px-4">
                                                    <TrendBadge trend={row.trend_5d} change={row.change_5d} />
                                                </TableCell>
                                                <TableCell className="text-center px-4">
                                                    <TrendBadge trend={row.trend_10d} change={row.change_10d} />
                                                </TableCell>
                                                <TableCell className="hidden lg:table-cell text-center px-4">
                                                    <TrendBadge trend={row.trend_20d} change={row.change_20d} />
                                                </TableCell>
                                                <TableCell className="hidden lg:table-cell text-center px-4">
                                                    <TrendBadge trend={row.trend_50d} change={row.change_50d} />
                                                </TableCell>
                                                <TableCell className="px-6 text-right">
                                                    <Link href={`/accumulation/history?symbol=${row.symbol}&broker=${row.broker}`}>
                                                        <Button 
                                                            variant="ghost" 
                                                            size="icon" 
                                                            className="h-9 w-9 bg-slate-100 dark:bg-white/[0.05] rounded-xl hover:bg-blue-600 hover:text-white dark:hover:bg-indigo-600 transition-all duration-300 opacity-0 group-hover:opacity-100"
                                                        >
                                                            <History className="w-4 h-4" />
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
                        {!loading && sortedTrends.length > 0 && (
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
                                        Total {sortedTrends.length} records
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
                                            className="h-9 px-4 rounded-xl font-semibold text-[10px] tracking-wider border-slate-200 dark:border-border hover:bg-slate-100 dark:hover:bg-white/5 transition-all"
                                        >
                                            Previous
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                            disabled={page >= totalPages}
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
    );
}
