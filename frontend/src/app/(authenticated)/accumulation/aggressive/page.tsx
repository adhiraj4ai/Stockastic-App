'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
    Search,
    Loader2,
    ArrowRight,
    ChevronUp,
    ChevronDown
} from 'lucide-react';
import { Card } from "@/components/ui/card";
import Link from 'next/link';
import { formatNepaliNumber, formatRupees } from "@/lib/formatters";
import { cn } from '@/lib/utils';
import { AggressivePattern } from '@/types/accumulation';

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

export default function AggressivePage() {
    const [aggressiveData, setAggressiveData] = useState<{ accumulators: AggressivePattern[], distributors: AggressivePattern[] }>({ accumulators: [], distributors: [] });
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [range, setRange] = useState('1W');
    const [sector, setSector] = useState('All');
    const [sectors, setSectors] = useState<string[]>(['All']);

    useEffect(() => {
        const fetchAggressive = async () => {
            setLoading(true);
            try {
                const res = await api.get(`/api/stocks/companies/aggressive/?range=${range}`);
                setAggressiveData(res.data);
                const accumulators = res.data.accumulators || [];
                const distributors = res.data.distributors || [];
                const allSymbols = [...accumulators, ...distributors];
                const uniqueSectors = ['All', ...Array.from(new Set(allSymbols.map((item: any) => item.sector))) as string[]];
                setSectors(uniqueSectors);
            } catch (err) {
                console.error('Failed to fetch aggressive patterns', err);
            } finally {
                setLoading(false);
            }
        };
        fetchAggressive();
    }, [range]);

    const filteredAccumulators = aggressiveData.accumulators.filter(item =>
        (sector === 'All' || item.sector === sector) &&
        (item.symbol.toLowerCase().includes(search.toLowerCase()) ||
            item.name.toLowerCase().includes(search.toLowerCase()))
    );

    const filteredDistributors = aggressiveData.distributors.filter(item =>
        (sector === 'All' || item.sector === sector) &&
        (item.symbol.toLowerCase().includes(search.toLowerCase()) ||
            item.name.toLowerCase().includes(search.toLowerCase()))
    );

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
                                onChange={(e) => setSector(e.target.value)}
                                className="bg-transparent border-none text-xs font-black text-slate-700 dark:text-slate-300 outline-none min-w-[120px] pr-2"
                            >
                                {sectors.map(s => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="relative group max-w-md w-full xl:w-80">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                        <Input
                            placeholder="Search symbol..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-11 pr-4 h-11 w-full rounded-xl bg-white dark:bg-slate-900/60 border-slate-200 dark:border-white/5 shadow-none focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-indigo-500/20 transition-all font-bold text-sm"
                        />
                    </div>
                </div>
            <div className="p-6">
                {loading ? (
                    <div className="flex flex-col items-center justify-center p-20 space-y-4">
                        <Loader2 className="w-10 h-10 text-orange-500 dark:text-orange-400 animate-spin" />
                        <p className="text-gray-500 dark:text-slate-400 font-medium tracking-wide">Scanning for aggressive patterns...</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Accumulators List */}
                        <div className="space-y-4">
                            <h3 className="text-lg font-bold text-green-700 dark:text-emerald-400 flex items-center gap-2 px-1">
                                <ChevronUp className="w-5 h-5" />
                                Aggressive Accumulators
                            </h3>
                            {filteredAccumulators.length === 0 ? (
                                <Card className="p-10 text-center text-gray-400 dark:text-slate-500 bg-white/50 dark:bg-slate-900/50">No aggressive accumulation detected.</Card>
                            ) : (
                                filteredAccumulators.map((sym, idx) => (
                                    <Card key={idx} className="group hover:border-green-200 dark:hover:border-emerald-500/30 transition-all shadow-sm hover:shadow-md bg-white dark:bg-slate-900 overflow-hidden border-slate-100 dark:border-slate-800">
                                        <div className="p-4">
                                            <div className="flex justify-between items-start mb-4">
                                                <div className="flex flex-col">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xl font-black text-gray-900 dark:text-slate-100 group-hover:text-green-600 dark:group-hover:text-emerald-400 transition-colors tracking-tight">{sym.symbol}</span>
                                                        <span className="text-sm font-bold text-gray-400 dark:text-slate-500">{formatRupees(sym.close, 1)}</span>
                                                    </div>
                                                    <span className="text-xs font-semibold text-gray-400 dark:text-slate-500 truncate max-w-[180px]">{sym.name}</span>
                                                </div>
                                                <div className="flex flex-col items-end">
                                                    <span className="text-xs font-bold text-gray-400 dark:text-slate-500 tracking-wider mb-1">Buy Intensity</span>
                                                    <div className="px-3 py-1 bg-green-100 dark:bg-emerald-900/30 text-green-700 dark:text-emerald-400 rounded-lg text-sm font-black border border-green-200 dark:border-emerald-800/30 shadow-sm flex items-center gap-1">
                                                        +{sym.intensity.toFixed(1)}%
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4 mb-4 p-3 bg-gray-50 dark:bg-slate-800/50 rounded-xl border border-gray-100 dark:border-slate-700/50">
                                                <div>
                                                    <span className="text-xs font-bold text-gray-400 dark:text-slate-500 block mb-1">Inst. Buy Qty</span>
                                                    <span className="text-sm font-bold text-gray-700 dark:text-slate-300">{formatNepaliNumber(sym.institutional_buy)}</span>
                                                </div>
                                                <div>
                                                    <span className="text-xs font-bold text-gray-400 dark:text-slate-500 block mb-1">20D Avg Vol</span>
                                                    <span className="text-sm font-bold text-gray-700 dark:text-slate-300">{formatNepaliNumber(Math.round(sym.avg_vol_20d))}</span>
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between">
                                                <div className="flex gap-1 items-center overflow-hidden">
                                                    <span className="text-xs font-bold text-gray-400 dark:text-slate-500 mr-1">Top Buyers</span>
                                                    {sym.producers?.map(p => (
                                                        <Link href={`/broker/${p}`} key={p}>
                                                            <span className="px-1.5 py-0.5 bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-400 rounded text-xs font-bold border border-gray-100 dark:border-slate-700 hover:bg-green-50 dark:hover:bg-emerald-900/30 hover:text-green-600 dark:hover:text-emerald-400 cursor-pointer transition-colors shadow-sm">#{p}</span>
                                                        </Link>
                                                    ))}
                                                </div>
                                                <Link href={`/floorsheet?symbol=${sym.symbol}`}>
                                                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs font-bold text-blue-600 dark:text-indigo-400 hover:bg-blue-50 dark:hover:bg-indigo-900/30 gap-1 rounded-lg">
                                                        Analyze <ArrowRight className="w-3 h-3" />
                                                    </Button>
                                                </Link>
                                            </div>
                                        </div>
                                    </Card>
                                ))
                            )}
                        </div>

                        {/* Distributors List */}
                        <div className="space-y-4">
                            <h3 className="text-lg font-bold text-red-700 dark:text-rose-400 flex items-center gap-2 px-1">
                                <ChevronDown className="w-5 h-5" />
                                Aggressive Distributors
                            </h3>
                            {filteredDistributors.length === 0 ? (
                                <Card className="p-10 text-center text-gray-400 dark:text-slate-500 bg-white/50 dark:bg-slate-900/50">No aggressive distribution detected.</Card>
                            ) : (
                                filteredDistributors.map((sym, idx) => (
                                    <Card key={idx} className="group hover:border-red-200 dark:hover:border-rose-500/30 transition-all shadow-sm hover:shadow-md bg-white dark:bg-slate-900 overflow-hidden border-slate-100 dark:border-slate-800">
                                        <div className="p-4">
                                            <div className="flex justify-between items-start mb-4">
                                                <div className="flex flex-col">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xl font-black text-gray-900 dark:text-slate-100 group-hover:text-red-600 dark:group-hover:text-rose-400 transition-colors tracking-tight">{sym.symbol}</span>
                                                        <span className="text-sm font-bold text-gray-400 dark:text-slate-500">{formatRupees(sym.close, 1)}</span>
                                                    </div>
                                                    <span className="text-xs font-semibold text-gray-400 dark:text-slate-500 truncate max-w-[180px]">{sym.name}</span>
                                                </div>
                                                <div className="flex flex-col items-end">
                                                    <span className="text-xs font-bold text-gray-400 dark:text-slate-500 tracking-wider mb-1">Sell Intensity</span>
                                                    <div className="px-3 py-1 bg-red-100 dark:bg-rose-900/30 text-red-700 dark:text-rose-400 rounded-lg text-sm font-black border border-red-200 dark:border-rose-800/30 shadow-sm flex items-center gap-1">
                                                        {sym.intensity.toFixed(1)}%
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4 mb-4 p-3 bg-gray-50 dark:bg-slate-800/50 rounded-xl border border-gray-100 dark:border-slate-700/50">
                                                <div>
                                                    <span className="text-xs font-bold text-gray-400 dark:text-slate-500 block mb-1">Inst. Sell Qty</span>
                                                    <span className="text-sm font-bold text-gray-700 dark:text-slate-300">{formatNepaliNumber(sym.institutional_sell)}</span>
                                                </div>
                                                <div>
                                                    <span className="text-xs font-bold text-gray-400 dark:text-slate-500 block mb-1">20D Avg Vol</span>
                                                    <span className="text-sm font-bold text-gray-700 dark:text-slate-300">{formatNepaliNumber(Math.round(sym.avg_vol_20d))}</span>
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between">
                                                <div className="flex gap-1 items-center overflow-hidden">
                                                    <span className="text-xs font-bold text-gray-400 dark:text-slate-500 mr-1">Offloaders</span>
                                                    {sym.offloaders?.map(p => (
                                                        <Link href={`/broker/${p}`} key={p}>
                                                            <span className="px-1.5 py-0.5 bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-400 rounded text-xs font-bold border border-gray-100 dark:border-slate-700 hover:bg-red-50 dark:hover:bg-rose-900/30 hover:text-red-600 dark:hover:text-rose-400 cursor-pointer transition-colors shadow-sm">#{p}</span>
                                                        </Link>
                                                    ))}
                                                </div>
                                                <Link href={`/floorsheet?symbol=${sym.symbol}`}>
                                                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs font-bold text-blue-600 dark:text-indigo-400 hover:bg-blue-50 dark:hover:bg-indigo-900/30 gap-1 rounded-lg">
                                                        Analyze <ArrowRight className="w-3 h-3" />
                                                    </Button>
                                                </Link>
                                            </div>
                                        </div>
                                    </Card>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    </div>
    );
}
