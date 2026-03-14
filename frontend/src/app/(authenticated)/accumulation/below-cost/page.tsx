'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, ArrowRight, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react';
import { PageLoader } from '@/components/ui/StockLoader';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import Link from 'next/link';
import { formatNepaliNumber, formatRupees } from "@/lib/formatters";
import { TrendBadge } from '@/components/accumulation/TrendBadge';
import { BelowCostPosition } from '@/types/accumulation';
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

export default function BelowCostPage() {
    const [data, setData] = useState<BelowCostPosition[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [range, setRange] = useState('ALL');
    const [sector, setSector] = useState('All');
    const [sectors, setSectors] = useState<string[]>(['All']);
    const [page, setPage] = useState(1);
    const [sortConfig, setSortConfig] = useState<{ key: keyof BelowCostPosition | ''; direction: 'asc' | 'desc' }>({
        key: 'roc',
        direction: 'asc'
    });
    const pageSize = 50;

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const res = await api.get(`/api/stocks/companies/below_cost/?range=${range}`);
                setData(res.data);
                const uniqueSectors = ['All', ...Array.from(new Set(res.data.map((d: BelowCostPosition) => d.sector))) as string[]];
                setSectors(uniqueSectors);
            } catch (err) {
                console.error('Failed to fetch below cost positions', err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [range]);

    const filtered = data.filter(item =>
        (sector === 'All' || item.sector === sector) &&
        (item.symbol.toLowerCase().includes(search.toLowerCase()) ||
            item.name.toLowerCase().includes(search.toLowerCase()) ||
            item.broker.toString().includes(search))
    );

    const handleSort = (key: keyof BelowCostPosition) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const sortedData = [...filtered].sort((a, b) => {
        if (!sortConfig.key) return 0;
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];

        if (typeof aValue === 'string' && typeof bValue === 'string') {
            return sortConfig.direction === 'asc' 
                ? aValue.localeCompare(bValue) 
                : bValue.localeCompare(aValue);
        }

        if ((aValue as any) < (bValue as any)) return sortConfig.direction === 'asc' ? -1 : 1;
        if ((aValue as any) > (bValue as any)) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });

    const totalPages = Math.ceil(filtered.length / pageSize) || 1;
    const paginated = sortedData.slice((page - 1) * pageSize, page * pageSize);

    useEffect(() => {
        setPage(1);
    }, [search, sector, range, sortConfig]);

    const SortIcon = ({ column }: { column: keyof BelowCostPosition }) => {
        if (sortConfig.key !== column) return <ArrowUpDown className="w-3 h-3 opacity-20" />;
        return sortConfig.direction === 'asc' 
            ? <ChevronUp className="w-3 h-3 text-blue-500" /> 
            : <ChevronDown className="w-3 h-3 text-blue-500" />;
    };

    return (
        <div className="space-y-6 lg:space-y-8 min-h-screen">
            <div className="bg-white dark:bg-slate-950/40 backdrop-blur-xl rounded-2xl border border-slate-200 dark:border-white/5 shadow-2xl">
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
                        <div className="flex items-center gap-2 bg-white dark:bg-slate-900/60 p-1 rounded-xl border border-slate-200 dark:border-white/10">
                            <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 px-2 tracking-widest">Sector</span>
                            <select
                                value={sector}
                                onChange={(e) => { setSector(e.target.value); setPage(1); }}
                                className="bg-transparent border-none text-xs font-black text-slate-700 dark:text-slate-300 outline-none min-w-[120px] pr-2"
                            >
                                {sectors.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="relative group max-w-md w-full xl:w-80">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                        <Input
                            placeholder="Search symbol or broker..."
                            value={search}
                            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                            className="pl-11 pr-4 h-11 w-full rounded-xl bg-white dark:bg-slate-900/60 border-slate-200 dark:border-white/5 shadow-none focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-indigo-500/20 transition-all font-bold text-sm"
                        />
                    </div>
                </div>

                {loading ? (
                    <PageLoader text="Loading below cost positions..." />
                ) : (
                    <div className="relative">
                        <div className="overflow-x-auto">
                            <Table className="w-full border-separate border-spacing-0">
                                <TableHeader>
                                    <TableRow className="bg-gray-50/50 dark:bg-slate-800/30 hover:bg-gray-50/50 dark:hover:bg-slate-800/30 h-14 border-b border-gray-100 dark:border-slate-800 transition-all">
                                        <TableHead className="w-[50px] font-bold text-gray-900 dark:text-slate-100 py-4 px-6 text-center sticky top-0 z-30 bg-gray-50/80 dark:bg-slate-900/80 backdrop-blur-md shadow-sm border-b border-gray-100 dark:border-slate-800 text-[11px] uppercase tracking-wider">SN</TableHead>
                                        <TableHead className="px-4 text-left cursor-pointer font-bold text-gray-900 dark:text-slate-100 sticky top-0 z-30 bg-gray-50/80 dark:bg-slate-900/80 backdrop-blur-md shadow-sm border-b border-gray-100 dark:border-slate-800 text-[11px] uppercase tracking-wider" onClick={() => handleSort('symbol')}>
                                            <div className="flex items-center gap-2">Symbol <SortIcon column="symbol" /></div>
                                        </TableHead>
                                        <TableHead className="px-4 text-right cursor-pointer font-bold text-indigo-500 dark:text-indigo-400 sticky top-0 z-30 bg-gray-50/80 dark:bg-slate-900/80 backdrop-blur-md shadow-sm border-b border-gray-100 dark:border-slate-800 text-[11px] uppercase tracking-wider" onClick={() => handleSort('rsi')}>
                                            <div className="flex items-center justify-end gap-2">RSI <SortIcon column="rsi" /></div>
                                        </TableHead>
                                        <TableHead className="px-4 text-right cursor-pointer font-bold text-gray-900 dark:text-slate-100 sticky top-0 z-30 bg-gray-50/80 dark:bg-slate-900/80 backdrop-blur-md shadow-sm border-b border-gray-100 dark:border-slate-800 text-[11px] uppercase tracking-wider" onClick={() => handleSort('broker')}>
                                            <div className="flex items-center justify-end gap-2">Broker <SortIcon column="broker" /></div>
                                        </TableHead>
                                        <TableHead className="px-4 text-right cursor-pointer font-bold text-emerald-600 dark:text-emerald-400 sticky top-0 z-30 bg-gray-50/80 dark:bg-slate-900/80 backdrop-blur-md shadow-sm border-b border-gray-100 dark:border-slate-800 text-[11px] uppercase tracking-wider" onClick={() => handleSort('range_net')}>
                                            <div className="flex items-center justify-end gap-2">Net Acc. <SortIcon column="range_net" /></div>
                                        </TableHead>
                                        <TableHead className="px-4 text-right cursor-pointer font-bold text-gray-900 dark:text-slate-100 sticky top-0 z-30 bg-gray-50/80 dark:bg-slate-900/80 backdrop-blur-md shadow-sm border-b border-gray-100 dark:border-slate-800 text-[11px] uppercase tracking-wider" onClick={() => handleSort('cumulative_net')}>
                                            <div className="flex items-center justify-end gap-2 text-[11px] uppercase tracking-wider">Total Pos. <SortIcon column="cumulative_net" /></div>
                                        </TableHead>
                                        <TableHead className="px-4 text-right cursor-pointer font-bold text-orange-500 dark:text-orange-400 sticky top-0 z-30 bg-gray-50/80 dark:bg-slate-900/80 backdrop-blur-md shadow-sm border-b border-gray-100 dark:border-slate-800 text-[11px] uppercase tracking-wider" onClick={() => handleSort('wac')}>
                                            <div className="flex items-center justify-end gap-2">WAC <SortIcon column="wac" /></div>
                                        </TableHead>
                                        <TableHead className="px-4 text-right cursor-pointer font-bold text-gray-900 dark:text-slate-100 sticky top-0 z-30 bg-gray-50/80 dark:bg-slate-900/80 backdrop-blur-md shadow-sm border-b border-gray-100 dark:border-slate-800 text-[11px] uppercase tracking-wider" onClick={() => handleSort('ltp')}>
                                            <div className="flex items-center justify-end gap-2">LTP <SortIcon column="ltp" /></div>
                                        </TableHead>
                                        <TableHead className="px-4 text-right bg-rose-50/20 dark:bg-rose-500/[0.03] cursor-pointer font-bold text-rose-600 dark:text-rose-400 sticky top-0 z-30 backdrop-blur-md shadow-sm border-b border-gray-100 dark:border-slate-800 text-[11px] uppercase tracking-wider" onClick={() => handleSort('roc')}>
                                            <div className="flex items-center justify-end gap-2">ROC <SortIcon column="roc" /></div>
                                        </TableHead>
                                        <TableHead className="px-3 text-center font-bold text-gray-900 dark:text-slate-100 sticky top-0 z-30 bg-gray-50/80 dark:bg-slate-900/80 backdrop-blur-md shadow-sm border-b border-gray-100 dark:border-slate-800 text-[11px] uppercase tracking-wider">5D</TableHead>
                                        <TableHead className="px-3 text-center font-bold text-gray-900 dark:text-slate-100 sticky top-0 z-30 bg-gray-50/80 dark:bg-slate-900/80 backdrop-blur-md shadow-sm border-b border-gray-100 dark:border-slate-800 text-[11px] uppercase tracking-wider">10D</TableHead>
                                        <TableHead className="px-3 text-center font-bold text-gray-900 dark:text-slate-100 sticky top-0 z-30 bg-gray-50/80 dark:bg-slate-900/80 backdrop-blur-md shadow-sm border-b border-gray-100 dark:border-slate-800 text-[11px] uppercase tracking-wider">15D</TableHead>
                                        <TableHead className="px-3 text-center font-bold text-gray-900 dark:text-slate-100 sticky top-0 z-30 bg-gray-50/80 dark:bg-slate-900/80 backdrop-blur-md shadow-sm border-b border-gray-100 dark:border-slate-800 text-[11px] uppercase tracking-wider">20D</TableHead>
                                        <TableHead className="px-3 text-center font-bold text-gray-900 dark:text-slate-100 sticky top-0 z-30 bg-gray-50/80 dark:bg-slate-900/80 backdrop-blur-md shadow-sm border-b border-gray-100 dark:border-slate-800 text-[11px] uppercase tracking-wider">50D</TableHead>
                                        <TableHead className="px-4 w-[80px] sticky top-0 z-30 bg-gray-50/80 dark:bg-slate-900/80 backdrop-blur-md shadow-sm border-b border-gray-100 dark:border-slate-800"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                {paginated.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={15} className="h-40 text-center text-gray-500 dark:text-slate-400">
                                            No below-cost positions found.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    paginated.map((item, idx) => (
                                        <TableRow 
                                            key={idx} 
                                            className={cn(
                                                "group border-b border-gray-50 dark:border-slate-800 hover:bg-blue-50/30 dark:hover:bg-slate-800/30 last:border-0 transition-all duration-200 cursor-pointer border-l-4 hover:shadow-lg hover:scale-[1.01] hover:-translate-y-0.5",
                                                (item.range_net || 0) > 0 ? "border-l-emerald-500/50 hover:border-l-emerald-500" : (item.range_net || 0) < 0 ? "border-l-rose-500/50 hover:border-l-rose-500" : "border-l-transparent hover:border-l-blue-400/50"
                                            )}
                                        >
                                            <TableCell className="text-center font-bold text-gray-400 dark:text-gray-500 text-sm py-4 px-6">
                                                {(page - 1) * pageSize + idx + 1}
                                            </TableCell>
                                            <TableCell className="px-4 py-3">
                                                <Link href={`/ticker/${item.symbol}`}>
                                                    <span className="text-base font-semibold text-slate-900 dark:text-indigo-400 hover:text-blue-600 dark:hover:text-white transition-colors cursor-pointer leading-none block mb-1">{item.symbol}</span>
                                                </Link>
                                                <span className="text-[10px] text-slate-400 font-medium truncate max-w-[100px] block">{item.name}</span>
                                            </TableCell>
                                            <TableCell className="px-4 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">
                                                {item.rsi?.toFixed(1) || '-'}
                                            </TableCell>
                                            <TableCell className="px-4 text-right">
                                                <Link href={`/broker/${item.broker}`}>
                                                    <span className="px-2 py-1 bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-400 rounded-lg text-xs font-bold border border-gray-100 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-indigo-900/30 hover:text-blue-600 dark:hover:text-indigo-400 cursor-pointer transition-colors shadow-sm">#{item.broker}</span>
                                                </Link>
                                            </TableCell>
                                            <TableCell className="px-4 text-right">
                                                <span className={cn(
                                                    "text-sm font-black tracking-tight",
                                                    (item.range_net ?? 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                                                )}>
                                                    {(item.range_net ?? 0) >= 0 ? '+' : ''}{formatNepaliNumber(item.range_net ?? 0)}
                                                </span>
                                            </TableCell>
                                            <TableCell className="px-4 text-right font-mono font-bold text-slate-500 dark:text-slate-400">
                                                {formatNepaliNumber(item.cumulative_net)}
                                            </TableCell>
                                            <TableCell className="px-4 text-right font-mono font-bold text-orange-600 dark:text-orange-400">
                                                {formatRupees(item.wac, 1)}
                                            </TableCell>
                                            <TableCell className="px-4 text-right font-mono font-bold text-slate-800 dark:text-slate-300">
                                                {formatRupees(item.ltp, 1)}
                                            </TableCell>
                                            <TableCell className="px-4 text-right font-mono font-bold bg-rose-50/20 dark:bg-rose-500/[0.01] text-rose-600 dark:text-rose-400">
                                                {item.roc?.toFixed(2)}%
                                            </TableCell>
                                            <TableCell className="px-3">
                                                <TrendBadge trend={item.trend_5d} change={item.change_5d} />
                                            </TableCell>
                                            <TableCell className="px-3">
                                                <TrendBadge trend={item.trend_10d} change={item.change_10d} />
                                            </TableCell>
                                            <TableCell className="px-3">
                                                <TrendBadge trend={item.trend_15d} change={item.change_15d} />
                                            </TableCell>
                                            <TableCell className="px-3">
                                                <TrendBadge trend={item.trend_20d} change={item.change_20d} />
                                            </TableCell>
                                            <TableCell className="px-3">
                                                <TrendBadge trend={item.trend_50d} change={item.change_50d} />
                                            </TableCell>
                                            <TableCell className="px-4 text-right">
                                                <Link href={`/accumulation/history?symbol=${item.symbol}&broker=${item.broker}`}>
                                                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs font-bold text-blue-600 dark:text-indigo-400 hover:bg-blue-50 dark:hover:bg-indigo-900/30 gap-1 rounded-lg opacity-0 group-hover:opacity-100 transition-all">
                                                        History <ArrowRight className="w-3 h-3" />
                                                    </Button>
                                                </Link>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                        </div>
                    </div>
                )}

                {!loading && filtered.length > pageSize && (
                    <div className="p-4 md:p-6 border-t border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.01] flex flex-col sm:flex-row items-center justify-between gap-4">
                        <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 tracking-widest">
                            Total {filtered.length} positions
                        </span>
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
