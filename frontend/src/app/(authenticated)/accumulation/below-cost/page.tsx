'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
    AlertTriangle, ArrowRight, TrendingUp, TrendingDown, Minus, Search, Layers, ArrowUpDown, ChevronUp, ChevronDown, Filter
} from 'lucide-react';
import { PageLoader } from '@/components/ui/StockLoader';
import Link from 'next/link';
import { formatNepaliNumber, formatRupees } from '@/lib/formatters';
import { BelowCostPosition } from '@/types/accumulation';
import { TrendBadge } from '@/components/accumulation/TrendBadge';
import { cn } from '@/lib/utils';

const TIME_RANGES = [
    { label: '1D', value: '1D' },
    { label: '1W', value: '1W' },
    { label: '2W', value: '2W' },
    { label: '1M', value: '1M' },
    { label: '3M', value: '3M' },
    { label: '6M', value: '6M' },
    { label: '1Y', value: '1Y' },
    { label: '1Y+', value: 'ALL' },
] as const;

const PAGE_SIZE = 50;

type SortConfig = {
    key: keyof BelowCostPosition | null;
    direction: 'asc' | 'desc';
};

export default function BelowCostPage() {
    const [range, setRange] = useState('ALL');
    const [data, setData] = useState<BelowCostPosition[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedSector, setSelectedSector] = useState('All');
    const [sectors, setSectors] = useState<{name: string, count: number}[]>([]);
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'roc', direction: 'asc' });
    const abortController = useRef<AbortController | null>(null);

    useEffect(() => {
        // Fetch Sectors
        api.get('/api/stocks/companies/sectors/')
            .then(res => setSectors(res.data))
            .catch(err => console.error('Failed to fetch sectors', err));
    }, []);

    useEffect(() => {
        abortController.current?.abort();
        abortController.current = new AbortController();
        const { signal } = abortController.current;

        setLoading(true);
        setPage(1);
        api.get(`/api/stocks/companies/below_cost/?range=${range}&sector=${selectedSector}`, { signal })
            .then(res => setData(res.data))
            .catch(err => { if (err.name !== 'AbortError') console.error('Failed to fetch below cost', err); })
            .finally(() => setLoading(false));

        return () => abortController.current?.abort();
    }, [range, selectedSector]);

    const handleSort = (key: keyof BelowCostPosition) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const sortedAndFilteredData = useMemo(() => {
        let processed = [...data];

        // Search Filter
        if (searchQuery) {
            const up = searchQuery.toUpperCase();
            processed = processed.filter(item => 
                item.symbol.toUpperCase().includes(up) || 
                item.name.toUpperCase().includes(up) ||
                item.broker.includes(up)
            );
        }

        // Sector filter (already handled by API, but local fallback for safety)
        if (selectedSector !== 'All') {
            processed = processed.filter(item => item.sector === selectedSector);
        }

        // Sorting
        if (sortConfig.key) {
            processed.sort((a, b) => {
                const aVal = a[sortConfig.key!];
                const bVal = b[sortConfig.key!];

                if (aVal === bVal) return 0;
                if (aVal === null || aVal === undefined) return 1;
                if (bVal === null || bVal === undefined) return -1;

                const modifier = sortConfig.direction === 'asc' ? 1 : -1;
                return aVal < bVal ? -1 * modifier : 1 * modifier;
            });
        }

        return processed;
    }, [data, searchQuery, sortConfig, selectedSector]);

    const pagedData = useMemo(() => 
        sortedAndFilteredData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), 
    [sortedAndFilteredData, page]);

    const totalPages = Math.ceil(sortedAndFilteredData.length / PAGE_SIZE) || 1;

    const SortIcon = ({ column }: { column: keyof BelowCostPosition }) => {
        if (sortConfig.key !== column) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-20 group-hover:opacity-100 transition-opacity" />;
        return sortConfig.direction === 'asc' 
            ? <ChevronUp className="w-3.5 h-3.5 ml-1 text-orange-500" /> 
            : <ChevronDown className="w-3.5 h-3.5 ml-1 text-orange-500" />;
    };

    return (
        <div className="space-y-6">
            
            {/* Control Bar: Filters & Search */}
            <div className="bg-white dark:bg-card rounded-2xl border border-slate-200 dark:border-border shadow-sm px-4 py-3 flex flex-col xl:flex-row items-center justify-between gap-6 overflow-hidden">
                <div className="flex flex-col sm:flex-row items-center gap-4 w-full xl:w-auto">
                    {/* Search */}
                    <div className="relative w-full sm:w-80 group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-orange-500 transition-colors" />
                        <input 
                            type="text" 
                            placeholder="Search symbol or broker..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-11 pr-4 py-2.5 bg-slate-100/50 dark:bg-slate-800/50 border border-border dark:border-border rounded-2xl text-xs font-semibold tracking-tight focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500/50 transition-all placeholder:text-slate-400 font-mono"
                        />
                    </div>

                    {/* Sector Filter */}
                    <div className="relative w-full sm:w-64 group">
                        <Filter className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-hover:text-orange-500 transition-colors" />
                        <select 
                            value={selectedSector}
                            onChange={(e) => setSelectedSector(e.target.value)}
                            className="w-full pl-11 pr-4 py-2.5 bg-slate-100/50 dark:bg-slate-800/50 border border-border dark:border-border rounded-2xl text-xs font-semibold tracking-tight focus:outline-none focus:ring-2 focus:ring-orange-500/20 transition-all appearance-none cursor-pointer"
                        >
                            <option value="All">All Sectors</option>
                            {sectors.map(s => (
                                <option key={s.name} value={s.name}>{s.name} ({s.count})</option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                </div>

                <div className="flex items-center gap-4 w-full xl:w-auto overflow-x-auto no-scrollbar justify-center">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap hidden sm:block">Analysis Range:</span>
                    <div className="bg-slate-100/50 dark:bg-slate-800/50 p-1 rounded-2xl border border-border dark:border-border flex shrink-0">
                        {TIME_RANGES.map(t => (
                            <button key={t.value} onClick={() => setRange(t.value)}
                                className={cn(
                                    'px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-300 tracking-tight whitespace-nowrap',
                                    range === t.value
                                        ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20 scale-105'
                                        : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
                                )}>
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Terminal Table */}
            <div className="bg-white dark:bg-card rounded-2xl border border-slate-200 dark:border-border shadow-sm overflow-hidden min-h-[500px] flex flex-col">
                {loading ? <PageLoader text="Scanning institutional footprints..." /> : (
                    <>
                        <div className="overflow-x-auto flex-1 custom-scrollbar">
                            <table className="w-full text-xs border-separate border-spacing-0">
                                <thead className="sticky top-0 z-20">
                                    <tr className="bg-white/90 dark:bg-card/90 group">
                                        {[
                                            { label: 'Symbol', key: 'symbol', align: 'left' },
                                            { label: 'Broker', key: 'broker', align: 'left' },
                                            { label: 'Total Pos.', key: 'cumulative_net', align: 'left' },
                                            { label: 'WAC', key: 'wac', align: 'left', accent: 'bg-orange-50/50 dark:bg-orange-500/5' },
                                            { label: 'LTP', key: 'ltp', align: 'left' },
                                            { label: 'Capt. Alpha', key: 'roc', align: 'left', accent: 'bg-rose-50/50 dark:bg-rose-500/5' },
                                            { label: '5D', key: 'change_5d', align: 'left' },
                                            { label: '10D', key: 'change_10d', align: 'left' },
                                            { label: '20D', key: 'change_20d', align: 'left' },
                                            { label: '50D', key: 'change_50d', align: 'left' },
                                        ].map(h => (
                                            <th 
                                                key={h.label} 
                                                onClick={() => h.key && handleSort(h.key as any)}
                                                className={cn(
                                                    'px-6 py-5 text-left font-semibold uppercase tracking-wider text-[10px] border-b border-border dark:border-border cursor-pointer hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors group/th',
                                                    h.accent
                                                )}
                                            >
                                                <div className="flex items-center">
                                                    <span className={cn(
                                                        sortConfig.key === h.key ? 'text-orange-500 font-semibold' : 'text-slate-500 dark:text-slate-400 group-hover/th:text-slate-700 dark:group-hover/th:text-slate-200'
                                                    )}>{h.label}</span>
                                                    {h.key && <SortIcon column={h.key as any} />}
                                                </div>
                                            </th>
                                        ))}
                                        <th className="w-16 border-b border-border dark:border-border py-5" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50 dark:divide-white/[0.03]">
                                    {pagedData.length === 0 ? (
                                        <tr>
                                            <td colSpan={11} className="p-32 text-center">
                                                <div className="flex flex-col items-center gap-6">
                                                    <div className="w-20 h-20 bg-slate-50/50 dark:bg-slate-800/30 rounded-full flex items-center justify-center border border-border dark:border-border animate-pulse">
                                                        <Layers className="text-slate-300 dark:text-slate-600 w-8 h-8" />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <p className="text-slate-900 dark:text-slate-100 font-semibold uppercase tracking-wider text-sm">Clear Horizons</p>
                                                        <p className="text-slate-400 font-medium text-[10px] uppercase tracking-wider">No matching institutional entries found for this range</p>
                                                    </div>
                                                    <Button variant="outline" size="sm" onClick={() => {setSearchQuery(''); setSelectedSector('All');}} className="rounded-2xl border-orange-500/20 text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-500/10">Clear all filters</Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : pagedData.map((item, idx) => (
                                        <tr key={idx} className="group hover:bg-orange-50/20 dark:hover:bg-white/[0.02] transition-all duration-300 border-l-[4px] border-l-transparent hover:border-l-orange-500 animate-in slide-in-from-left-2 fade-in" style={{ animationDelay: `${idx * 15}ms` }}>
                                            <td className="px-6 py-5">
                                                <Link href={`/ticker/${item.symbol}`} className="block">
                                                    <div className="font-semibold text-sm text-slate-900 dark:text-orange-50 group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors tracking-tight">{item.symbol}</div>
                                                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-tight mt-0.5 truncate max-w-[150px]">{item.name}</div>
                                                </Link>
                                            </td>
                                            <td className="px-6 py-5">
                                                <Link href={`/broker/${item.broker}`}>
                                                    <span className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 rounded-xl text-[10px] font-semibold border border-border dark:border-border hover:border-orange-500/50 hover:bg-white dark:hover:bg-slate-800 transition-all shadow-sm">
                                                        #{item.broker}
                                                    </span>
                                                </Link>
                                            </td>
                                            <td className="px-6 py-5 font-mono font-bold text-slate-600 dark:text-slate-400 tabular-nums tracking-tighter">
                                                {formatNepaliNumber(item.cumulative_net)}
                                            </td>
                                            <td className="px-6 py-5 font-mono font-semibold text-orange-600 dark:text-orange-400 tabular-nums bg-orange-50/20 dark:bg-orange-500/[0.01]">
                                                {formatRupees(item.wac, 1)}
                                            </td>
                                            <td className="px-6 py-5 font-mono font-bold text-slate-800 dark:text-slate-200 tabular-nums tracking-tighter border-x border-slate-50 dark:border-white/[0.02]">
                                                {formatRupees(item.ltp, 1)}
                                            </td>
                                            <td className="px-6 py-5 font-semibold text-rose-600 dark:text-rose-400 tabular-nums bg-rose-50/20 dark:bg-rose-500/[0.01]">
                                                {item.roc?.toFixed(2)}%
                                            </td>
                                            <td className="px-4 py-5"><TrendBadge trend={item.trend_5d} change={item.change_5d} compact /></td>
                                            <td className="px-4 py-5"><TrendBadge trend={item.trend_10d} change={item.change_10d} compact /></td>
                                            <td className="px-4 py-5"><TrendBadge trend={item.trend_20d} change={item.change_20d} compact /></td>
                                            <td className="px-4 py-5"><TrendBadge trend={item.trend_50d} change={item.change_50d} compact /></td>
                                            <td className="px-6 py-5 text-right">
                                                <Link href={`/accumulation/history?symbol=${item.symbol}&broker=${item.broker}`}>
                                                    <Button variant="ghost" size="sm"
                                                        className="h-10 w-10 p-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-all hover:bg-orange-500 dark:hover:bg-orange-500 hover:text-white group/btn shadow-xl shadow-orange-500/0 hover:shadow-orange-500/20">
                                                        <ArrowRight className="w-5 h-5 group-hover/btn:translate-x-0.5 transition-transform" />
                                                    </Button>
                                                </Link>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination Footer */}
                        <div className="px-5 py-4 border-t border-border dark:border-border bg-slate-50/40 dark:bg-white/[0.01] flex flex-col sm:flex-row items-center justify-between gap-6 mt-auto">
                            <div className="flex items-center gap-3">
                                <div className="h-2 w-2 rounded-full bg-orange-500 pulse-glow" />
                                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{sortedAndFilteredData.length} strategic positions tracked</span>
                            </div>
                            
                            <div className="flex items-center gap-6">
                                <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                    Terminal Node <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded font-mono text-slate-900 dark:text-slate-100">{page}</span> of <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded font-mono text-slate-900 dark:text-slate-100">{totalPages}</span>
                                </span>
                                <div className="flex gap-3">
                                    <Button variant="outline" size="sm" onClick={() => {setPage(p => Math.max(1, p - 1)); window.scrollTo({top: 0, behavior: 'smooth'});}} disabled={page === 1}
                                        className="h-11 px-6 text-[10px] font-semibold rounded-2xl border-slate-200 dark:border-border hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-orange-500/50 tracking-wider transition-all">PREV NODE</Button>
                                    <Button variant="outline" size="sm" onClick={() => {setPage(p => Math.min(totalPages, p + 1)); window.scrollTo({top: 0, behavior: 'smooth'});}} disabled={page >= totalPages}
                                        className="h-11 px-6 text-[10px] font-semibold rounded-2xl border-slate-200 dark:border-border hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-orange-500/50 tracking-wider transition-all">NEXT NODE</Button>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>

            <style jsx global>{`
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
                .pulse-glow { animation: pulse-glow 2s infinite; }
                @keyframes pulse-glow {
                    0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.4); }
                    70% { transform: scale(1.1); box-shadow: 0 0 0 10px rgba(249, 115, 22, 0); }
                    100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(249, 115, 22, 0); }
                }
            `}</style>
        </div>
    );
}
