'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
    AlertTriangle, ArrowRight, TrendingUp, TrendingDown, Minus,
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

export default function BelowCostPage() {
    const [range, setRange] = useState('1W');
    const [data, setData] = useState<BelowCostPosition[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const abortController = useRef<AbortController | null>(null);

    useEffect(() => {
        abortController.current?.abort();
        abortController.current = new AbortController();
        const { signal } = abortController.current;

        setLoading(true);
        setPage(1);
        api.get(`/api/stocks/companies/below_cost/?range=${range}`, { signal })
            .then(res => setData(res.data))
            .catch(err => { if (err.name !== 'AbortError') console.error('Failed to fetch below cost', err); })
            .finally(() => setLoading(false));

        return () => abortController.current?.abort();
    }, [range]);

    const pagedData = useMemo(() => data.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [data, page]);
    const totalPages = Math.ceil(data.length / PAGE_SIZE) || 1;

    return (
        <div className="space-y-6 max-w-[1400px] mx-auto px-1">
            
            {/* Header Controls */}
            <div className="bg-white dark:bg-slate-950/40 backdrop-blur-xl rounded-2xl border border-slate-200 dark:border-white/5 shadow-lg px-4 py-3 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="bg-orange-100 dark:bg-orange-900/30 p-2 rounded-xl border border-orange-200 dark:border-orange-800/30 text-orange-600 dark:text-orange-400">
                        <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div>
                        <h1 className="text-lg font-black text-slate-900 dark:text-white tracking-tight leading-none mb-1">Below Cost Analysis</h1>
                        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest">Tracking institutional positions trading under average cost</p>
                    </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-900/60 p-1 rounded-xl border border-slate-100 dark:border-white/5 flex overflow-x-auto no-scrollbar shrink-0">
                    {TIME_RANGES.map(t => (
                        <button key={t.value} onClick={() => setRange(t.value)}
                            className={cn(
                                'px-3 py-1.5 rounded-lg text-xs font-black transition-all duration-200 tracking-tight whitespace-nowrap',
                                range === t.value
                                    ? 'bg-orange-500 text-white shadow-md'
                                    : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
                            )}>
                            {t.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Main Content */}
            <div className="bg-white dark:bg-slate-950/40 backdrop-blur-xl rounded-2xl border border-slate-200 dark:border-white/5 shadow-2xl overflow-hidden min-h-[400px]">
                {loading ? <PageLoader text="Scanning for below cost positions..." /> : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs border-separate border-spacing-0">
                                <thead className="sticky top-0 z-10">
                                    <tr className="bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-md">
                                        {[
                                            { label: 'Symbol',    accent: '' },
                                            { label: 'Broker',    accent: '' },
                                            { label: 'Total Pos.', accent: '' },
                                            { label: 'WAC',       accent: 'orange' },
                                            { label: 'LTP',       accent: '' },
                                            { label: 'ROC',       accent: 'rose' },
                                            { label: '5D',  accent: '' },
                                            { label: '10D', accent: '' },
                                            { label: '20D', accent: '' },
                                            { label: '50D', accent: '' },
                                        ].map(h => (
                                            <th key={h.label} className={cn(
                                                'px-4 py-4 text-left font-black uppercase tracking-wider text-[10px] border-b border-slate-100 dark:border-slate-800/60',
                                                h.accent === 'orange' ? 'text-orange-500 dark:text-orange-400'
                                                    : h.accent === 'rose' ? 'text-rose-500 dark:text-rose-400'
                                                    : 'text-slate-500 dark:text-slate-400',
                                            )}>{h.label}</th>
                                        ))}
                                        <th className="w-10 border-b border-slate-100 dark:border-slate-800/60" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                                    {pagedData.length === 0 ? (
                                        <tr>
                                            <td colSpan={11} className="p-20 text-center">
                                                <div className="flex flex-col items-center gap-3">
                                                    <div className="w-12 h-12 bg-slate-50 dark:bg-slate-900 rounded-full flex items-center justify-center">
                                                        <Minus className="text-slate-300" />
                                                    </div>
                                                    <p className="text-slate-400 font-bold uppercase tracking-widest">No below-cost positions found</p>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : pagedData.map((item, idx) => (
                                        <tr key={idx} className="group hover:bg-orange-50/20 dark:hover:bg-orange-900/5 transition-colors border-l-[3px] border-l-transparent hover:border-l-orange-400 animate-in fade-in duration-150">
                                            <td className="px-4 py-3.5">
                                                <Link href={`/ticker/${item.symbol}`}>
                                                    <span className="font-black text-slate-900 dark:text-indigo-300 hover:text-indigo-600 dark:hover:text-white transition-colors">{item.symbol}</span>
                                                </Link>
                                                <div className="text-[9px] text-slate-400 font-medium truncate max-w-[120px] mt-0.5">{item.name}</div>
                                            </td>
                                            <td className="px-4 py-3.5">
                                                <Link href={`/broker/${item.broker}`}>
                                                    <span className="px-2 py-1 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-lg text-[10px] font-black border border-slate-100 dark:border-slate-700 hover:border-orange-300 dark:hover:border-orange-700 transition-colors shadow-sm">
                                                        #{item.broker}
                                                    </span>
                                                </Link>
                                            </td>
                                            <td className="px-4 py-3.5 font-mono font-bold text-slate-600 dark:text-slate-400 tabular-nums">
                                                {formatNepaliNumber(item.cumulative_net)}
                                            </td>
                                            <td className="px-4 py-3.5 font-mono font-black text-orange-600 dark:text-orange-400 tabular-nums bg-orange-50/30 dark:bg-orange-900/10">
                                                {formatRupees(item.wac, 1)}
                                            </td>
                                            <td className="px-4 py-3.5 font-mono font-bold text-slate-800 dark:text-slate-200 tabular-nums">
                                                {formatRupees(item.ltp, 1)}
                                            </td>
                                            <td className="px-4 py-3.5 font-black text-rose-600 dark:text-rose-400 tabular-nums">
                                                {item.roc?.toFixed(2)}%
                                            </td>
                                            <td className="px-2 py-3.5"><TrendBadge trend={item.trend_5d}  change={item.change_5d} /></td>
                                            <td className="px-2 py-3.5"><TrendBadge trend={item.trend_10d} change={item.change_10d} /></td>
                                            <td className="px-2 py-3.5"><TrendBadge trend={item.trend_20d} change={item.change_20d} /></td>
                                            <td className="px-2 py-3.5"><TrendBadge trend={item.trend_50d} change={item.change_50d} /></td>
                                            <td className="px-4 py-3.5">
                                                <Link href={`/accumulation/history?symbol=${item.symbol}&broker=${item.broker}`}>
                                                    <Button variant="ghost" size="sm"
                                                        className="h-8 w-8 p-0 rounded-xl opacity-0 group-hover:opacity-100 transition-all hover:bg-orange-100 dark:hover:bg-orange-900/30">
                                                        <ArrowRight className="w-4 h-4 text-orange-500" />
                                                    </Button>
                                                </Link>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {data.length > PAGE_SIZE && (
                            <div className="px-5 py-4 border-t border-slate-100 dark:border-white/5 bg-slate-50/20 dark:bg-white/[0.01] flex flex-col sm:flex-row items-center justify-between gap-4">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{data.length} total across current range</span>
                                <div className="flex items-center gap-4">
                                    <span className="text-[10px] font-black text-slate-400 dark:text-slate-500">Page {page} of {totalPages}</span>
                                    <div className="flex gap-2">
                                        <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                                            className="h-9 px-4 text-[10px] font-black rounded-xl border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-slate-800">PREV</Button>
                                        <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                                            className="h-9 px-4 text-[10px] font-black rounded-xl border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-slate-800">NEXT</Button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            <style jsx global>{`
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
        </div>
    );
}
