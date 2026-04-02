'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { 
    Activity, TrendingUp, TrendingDown, Target, Zap, Waves, 
    ArrowRight, CheckCircle2, XCircle, Search, Calendar
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PageLoader } from '@/components/ui/StockLoader';

interface EnginePerformance {
    source: string;
    total: number;
    won: number;
    lost: number;
    active: number;
    win_rate: number;
    avg_pnl: number;
}

interface GeneratedSignal {
    id: number;
    source: string;
    symbol: string;
    signal: 'BUY' | 'SELL';
    signal_tier: string;
    strength: number;
    ltp: string;
    target_price?: number;
    stop_loss_price?: number;
    status: 'ACTIVE' | 'WON' | 'LOST' | 'CLOSED_MANUAL';
    pnl_percent?: number;
    closed_date?: string;
    rationale: string;
    metadata: any;
    generated_date: string;
}

const SOURCE_LABELS: Record<string, string> = {
    'SMART_MONEY': 'Smart Money',
    'BROKER_ACCUMULATION': 'Broker Accumulation',
    'SMART_CROSSOVER': 'Smart Crossover',
    'ICHIMOKU': 'Ichimoku Accumulation',
};

export default function TrackRecordClient() {
    const [stats, setStats] = useState<EnginePerformance[]>([]);
    const [signals, setSignals] = useState<GeneratedSignal[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [activeTab, setActiveTab] = useState<string>('ALL');

    useEffect(() => {
        const fetchAll = async () => {
            setLoading(true);
            try {
                const [statsRes, signalsRes] = await Promise.all([
                    api.get('/api/stocks/generated-signals/performance/'),
                    api.get('/api/stocks/generated-signals/track_record/?page_size=500')
                ]);
                setStats(statsRes.data || []);
                setSignals(signalsRes.data?.results || []);
            } catch (err) {
                console.error("Failed to load track record", err);
            } finally {
                setLoading(false);
            }
        };
        fetchAll();
    }, []);

    const filteredSignals = signals.filter(s => {
        if (search && !s.symbol.toLowerCase().includes(search.toLowerCase())) return false;
        if (activeTab !== 'ALL' && s.source !== activeTab) return false;
        return true;
    });

    const displayedStats = activeTab === 'ALL' ? stats : stats.filter(stat => stat.source === activeTab);

    if (loading) return <PageLoader />;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Tabs */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 custom-scrollbar border-b border-slate-200 dark:border-slate-800">
                <button
                    onClick={() => setActiveTab('ALL')}
                    className={cn(
                        "px-4 py-2 text-sm font-bold whitespace-nowrap border-b-2 transition-all",
                        activeTab === 'ALL' 
                            ? "border-blue-500 text-blue-600 dark:text-blue-400" 
                            : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700"
                    )}
                >
                    Overview
                </button>
                {Object.entries(SOURCE_LABELS).map(([key, label]) => (
                    <button
                        key={key}
                        onClick={() => setActiveTab(key)}
                        className={cn(
                            "px-4 py-2 text-sm font-bold whitespace-nowrap border-b-2 transition-all",
                            activeTab === key 
                                ? "border-blue-500 text-blue-600 dark:text-blue-400" 
                                : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700"
                        )}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {/* Performance Widgets */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                {displayedStats.length > 0 ? displayedStats.map((stat) => (
                    <div key={stat.source} className="bg-white dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800/60 rounded-2xl p-5 shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest">{SOURCE_LABELS[stat.source] || stat.source}</h3>
                            <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-400">
                                {stat.source === 'SMART_MONEY' ? <Zap size={16} /> : <Activity size={16} />}
                            </div>
                        </div>
                        <div className="flex items-baseline gap-2 mb-2">
                            <span className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">
                                {stat.win_rate}%
                            </span>
                            <span className="text-xs font-bold text-slate-400">WIN RATE</span>
                        </div>
                        <div className="flex items-center gap-4 text-sm font-semibold">
                            <div className="flex items-center gap-1.5 text-emerald-500">
                                <CheckCircle2 size={14} /> {stat.won} Won
                            </div>
                            <div className="flex items-center gap-1.5 text-rose-500">
                                <XCircle size={14} /> {stat.lost} Lost
                            </div>
                        </div>
                        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/80 flex justify-between items-center">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Avg P&L</span>
                            <span className={cn(
                                "text-sm font-black py-1 px-2.5 rounded-lg",
                                stat.avg_pnl >= 0 ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400" : "bg-rose-50 text-rose-500 dark:bg-rose-900/20 dark:text-rose-400"
                            )}>
                                {stat.avg_pnl > 0 ? '+' : ''}{stat.avg_pnl}%
                            </span>
                        </div>
                    </div>
                )) : (
                    <div className="col-span-full p-8 text-center border border-dashed rounded-2xl border-slate-200 dark:border-slate-800 text-slate-500">
                        No performance history available yet.
                    </div>
                )}
            </div>

            {/* Historical Signals Table */}
            <div className="bg-white dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800/60 rounded-2xl shadow-sm overflow-hidden flex flex-col">
                <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <h2 className="text-lg font-black tracking-tight text-slate-900 dark:text-white">Signal History</h2>
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input 
                            value={search} onChange={e => setSearch(e.target.value)}
                            placeholder="Filter symbol..."
                            className="pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-xl text-xs font-bold w-48 focus:outline-none focus:ring-2 focus:ring-slate-900/10 dark:text-white transition-all"
                        />
                    </div>
                </div>
                
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-slate-50/50 dark:bg-slate-800/20 border-b border-slate-200/50 dark:border-slate-800/80">
                            <tr>
                                <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Symbol</th>
                                <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date / Timeline</th>
                                <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Source & Tier</th>
                                <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Type</th>
                                <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Target Params (TP1/2/3)</th>
                                <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Outcome</th>
                                <th className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">P&L %</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                            {filteredSignals.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-5 py-12 text-center text-slate-500 font-medium italic">
                                        No resolved signals found.
                                    </td>
                                </tr>
                            ) : filteredSignals.map((sig) => (
                                <tr key={sig.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                                    <td className="px-5 py-4">
                                        <div className="font-black text-slate-900 dark:text-white tracking-tight">{sig.symbol}</div>
                                        <div className="text-[10px] font-bold text-slate-400 font-mono mt-0.5">रू{parseFloat(sig.ltp).toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                                    </td>
                                    <td className="px-5 py-4">
                                        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                                            <Calendar size={12} className="text-slate-400" />
                                            {sig.generated_date}
                                        </div>
                                        {sig.closed_date && (
                                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 mt-1">
                                                <ArrowRight size={10} />
                                                {sig.closed_date}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-5 py-4">
                                        <div className="font-bold text-slate-700 dark:text-slate-300 text-xs">{SOURCE_LABELS[sig.source] || sig.source}</div>
                                        <div className="text-[10px] font-semibold text-slate-400 mt-0.5">{sig.signal_tier || 'System'}</div>
                                    </td>
                                    <td className="px-5 py-4">
                                        <span className={cn(
                                            "px-2 py-1 rounded text-[10px] font-black tracking-wider uppercase",
                                            sig.signal === 'BUY' ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"
                                        )}>
                                            {sig.signal}
                                        </span>
                                    </td>
                                    <td className="px-5 py-4">
                                        <div className="flex flex-col gap-1.5 text-[10px] font-mono leading-none w-fit">
                                            {sig.metadata?.tp1 && (
                                                <div className="flex justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-1 w-full">
                                                    <span className="text-slate-400">TP1:</span>
                                                    <span className="font-bold text-slate-700 dark:text-slate-300">रू{sig.metadata.tp1}</span>
                                                </div>
                                            )}
                                            {sig.metadata?.tp2 && (
                                                <div className="flex justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-1 w-full">
                                                    <span className="text-slate-400">TP2:</span>
                                                    <span className="font-bold text-slate-700 dark:text-slate-300">रू{sig.metadata.tp2}</span>
                                                </div>
                                            )}
                                            {sig.metadata?.tp3 && (
                                                <div className="flex justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-1 w-full">
                                                    <span className="text-slate-400">TP3:</span>
                                                    <span className="font-bold text-slate-700 dark:text-slate-300">रू{sig.metadata.tp3}</span>
                                                </div>
                                            )}
                                            {sig.target_price && !sig.metadata?.tp1 && (
                                                <div className="flex justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-1 w-full">
                                                    <span className="text-slate-400">Target:</span>
                                                    <span className="font-bold text-slate-700 dark:text-slate-300">रू{sig.target_price}</span>
                                                </div>
                                            )}
                                            {sig.stop_loss_price && (
                                                <div className="flex justify-between gap-4 w-full mt-0.5">
                                                    <span className="text-rose-400">SL:</span>
                                                    <span className="font-black text-rose-500 dark:text-rose-400">रू{sig.stop_loss_price}</span>
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-5 py-4">
                                        <span className={cn(
                                            "flex w-fit items-center gap-1.5 px-3 py-1.5 rounded-[9px] text-[10px] font-black uppercase tracking-wider shadow-sm border",
                                            sig.status === 'WON' ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800" :
                                            sig.status === 'LOST' ? "bg-rose-50 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400 border-rose-200 dark:border-rose-800" :
                                            "bg-slate-100 text-slate-500 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                                        )}>
                                            {sig.status === 'WON' && (
                                                <><Target size={12} /> Target Met</>
                                            )}
                                            {sig.status === 'LOST' && (
                                                <><XCircle size={12} /> SL Hit</>
                                            )}
                                            {sig.status !== 'WON' && sig.status !== 'LOST' && (
                                                <>{sig.status}</>
                                            )}
                                        </span>
                                    </td>
                                    <td className="px-5 py-4 text-right">
                                        {sig.pnl_percent !== undefined && sig.pnl_percent !== null ? (
                                            <div className={cn(
                                                "inline-flex font-mono font-black py-1 px-2.5 rounded-lg text-sm",
                                                sig.pnl_percent >= 0 ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/20" : "bg-rose-500 text-white shadow-sm shadow-rose-500/20"
                                            )}>
                                                {sig.pnl_percent > 0 ? '+' : ''}{parseFloat(sig.pnl_percent as any).toFixed(2)}%
                                            </div>
                                        ) : (
                                            <span className="text-slate-400 text-xs font-mono font-bold">--</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
