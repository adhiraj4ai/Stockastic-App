'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import api from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, CandlestickChart, TrendingUp, TrendingDown, Target, Zap, Clock, Search } from 'lucide-react';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import TradingSignalAlerts from '@/components/market/TradingSignalAlerts';
import { MarketTabs } from '@/components/MarketTabs';

export default function PriceActionScreener() {
    const router = useRouter();
    const [setups, setSetups] = useState<any[]>([]);
    const [allSignals, setAllSignals] = useState<Record<string, any[]>>({});
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        const fetchScreener = async () => {
            try {
                const [paRes, sigRes] = await Promise.all([
                    api.get('/api/stocks/price-action-screener/'),
                    api.get('/api/stocks/generated-signals/latest/')
                ]);
                
                setSetups(paRes.data.top_setups || []);
                
                // Group signals by symbol
                const signalMap: Record<string, any[]> = {};
                (sigRes.data || []).forEach((sig: any) => {
                    if (!signalMap[sig.symbol]) signalMap[sig.symbol] = [];
                    signalMap[sig.symbol].push(sig);
                });
                setAllSignals(signalMap);

            } catch (err) {
                console.error("Error fetching screener:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchScreener();
    }, []);

    const filteredSetups = setups.filter(s => 
        s.ticker.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const getSignalLabel = (source: string) => {
        const labels: Record<string, string> = {
            'PRICE_ACTION': 'PA',
            'MEAN_REVERSAL': 'MR',
            'RSI_DIVERGENCE': 'RSI',
            'MACD_DIVERGENCE': 'MACD',
            'DOW_SIGNAL': 'DOW'
        };
        return labels[source] || source;
    };

    return (
        <DashboardLayout
            title="Global Price Action Screener"
            subtitle="Real-time scanning of all active tickers for Smart Money Concepts and Institutional Algorithms."
            noPadding
        >
            <div className="px-6 lg:px-10 pt-4"><MarketTabs className="mb-0" /></div>
            <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                
                {/* Trading Signal Alerts Summary */}
                <TradingSignalAlerts />

                {/* Metrics Header */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card className="p-6 border-slate-200 dark:border-slate-800 bg-white dark:bg-card shadow-sm flex items-center justify-between">
                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase">Active Scans</p>
                            <h3 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">{setups.length} Setups</h3>
                        </div>
                        <div className="h-12 w-12 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-500">
                            <Activity size={24} />
                        </div>
                    </Card>
                    <Card className="p-6 border-slate-200 dark:border-slate-800 bg-white dark:bg-card shadow-sm flex items-center justify-between">
                        <div>
                            <p className="text-xs font-bold text-amber-500 uppercase">Sniper Confluences</p>
                            <h3 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">
                                {setups.filter(s => s.latest_event?.smc_events?.some((e: any) => e.type === 'SNIPER')).length}
                            </h3>
                        </div>
                        <div className="h-12 w-12 rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center text-amber-500">
                            <Target size={24} />
                        </div>
                    </Card>
                    <Card className="p-6 border-slate-200 dark:border-slate-800 bg-white dark:bg-card shadow-sm flex items-center justify-between">
                        <div>
                            <p className="text-xs font-bold text-violet-500 uppercase">FVG Imbalances</p>
                            <h3 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">
                                {setups.filter(s => s.latest_event?.smc_events?.some((e: any) => e.type === 'FVG')).length}
                            </h3>
                        </div>
                        <div className="h-12 w-12 rounded-full bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center text-violet-500">
                            <Zap size={24} />
                        </div>
                    </Card>
                    <Card className="p-6 border-slate-200 dark:border-slate-800 bg-white dark:bg-card shadow-sm flex items-center justify-between">
                        <div>
                            <p className="text-xs font-bold text-emerald-500 uppercase">Structure Breaks</p>
                            <h3 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">
                                {setups.filter(s => s.latest_event?.smc_events?.some((e: any) => e.type === 'BOS')).length}
                            </h3>
                        </div>
                        <div className="h-12 w-12 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center text-emerald-500">
                            <TrendingUp size={24} />
                        </div>
                    </Card>
                </div>

                {/* Main Content */}
                <div className="bg-white dark:bg-card border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden flex flex-col">
                    <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 flex flex-col sm:flex-row justify-between gap-4">
                        <div className="relative w-full max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <Input 
                                placeholder="Search symbol..." 
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 bg-white dark:bg-card border-slate-200 dark:border-slate-700"
                            />
                        </div>
                    </div>
                    
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-800">
                                <tr>
                                    <th className="px-6 py-4 font-bold text-slate-500 dark:text-slate-400">Asset</th>
                                    <th className="px-6 py-4 font-bold text-slate-500 dark:text-slate-400">Primary Triggers</th>
                                    <th className="px-6 py-4 font-bold text-slate-500 dark:text-slate-400">Institutional Signals</th>
                                    <th className="px-6 py-4 font-bold text-slate-500 dark:text-slate-400 w-1/4">Context</th>
                                    <th className="px-6 py-4 font-bold text-slate-500 dark:text-slate-400 text-right">Volume</th>
                                    <th className="px-6 py-4"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                                {loading ? (
                                    <tr>
                                        <td colSpan={6} className="py-20 text-center">
                                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mx-auto mb-4"></div>
                                            <p className="text-slate-500 font-bold">Scanning Global Market...</p>
                                        </td>
                                    </tr>
                                ) : filteredSetups.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="py-20 text-center text-slate-500 font-bold">No setups detected today.</td>
                                    </tr>
                                ) : (
                                    filteredSetups.map((setup, idx) => {
                                        const signals = allSignals[setup.ticker] || [];
                                        return (
                                            <tr key={idx} 
                                                className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors group"
                                                onClick={() => router.push(`/ticker/${setup.ticker}?tab=priceaction`)}
                                            >
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className={cn(
                                                            "h-10 w-10 flex flex-col items-center justify-center rounded-xl shrink-0 font-bold",
                                                            setup.sentiment === 'BULLISH' ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400" : "bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400"
                                                        )}>
                                                            {setup.sentiment === 'BULLISH' ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                                                        </div>
                                                        <div>
                                                            <h4 className="font-bold text-slate-900 dark:text-slate-100 text-base">{setup.ticker}</h4>
                                                            <span className="text-[10px] font-mono font-bold text-slate-500">Rs {setup.close.toLocaleString()}</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {setup.latest_event?.smc_events?.map((ev: any, i: number) => (
                                                            <Badge key={i} className={cn(
                                                                "text-[10px] px-2 py-0.5 border-none font-bold",
                                                                ev.type === 'FVG' ? "bg-violet-100 text-violet-700" :
                                                                ev.type === 'SNIPER' ? "bg-amber-100 text-amber-700 shadow-sm" : 
                                                                "bg-rose-100 text-rose-700"
                                                            )}>
                                                                {ev.tag || ev.type}
                                                            </Badge>
                                                        ))}
                                                        {setup.latest_event?.patterns?.slice(0, 2).map((p: any, i: number) => (
                                                            <Badge key={`pt-${i}`} variant="outline" className={cn(
                                                                "text-[10px] px-2 py-0.5 border-none",
                                                                p.sentiment === 'BULLISH' ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20" : "bg-rose-50 text-rose-600 dark:bg-rose-900/20"
                                                            )}>
                                                                {p.name}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-wrap gap-1">
                                                        {signals.length > 0 ? (
                                                            signals.map((sig, i) => (
                                                                <Badge key={i} className={cn(
                                                                    "text-[9px] px-1.5 py-0 border-none font-semibold uppercase tracking-tighter",
                                                                    sig.signal === 'BUY' ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"
                                                                )}>
                                                                    {getSignalLabel(sig.source)}
                                                                </Badge>
                                                            ))
                                                        ) : (
                                                            <span className="text-[10px] font-bold text-slate-300 italic">No signals</span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col gap-1 w-full relative text-xs">
                                                        <span className="font-bold text-slate-800 dark:text-slate-200 line-clamp-1 group-hover:line-clamp-none">{setup.latest_event?.shape_desc}</span>
                                                        <span className={cn(
                                                            "text-[10px] font-bold truncate",
                                                            setup.latest_event?.volume_desc.includes('High') ? "text-indigo-600 dark:text-indigo-400" : "text-slate-500"
                                                        )}>
                                                            {setup.latest_event?.volume_desc}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <span className="font-mono text-xs font-bold text-slate-600 dark:text-slate-300">
                                                        {setup.volume.toLocaleString()}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex justify-end">
                                                        <div className="h-8 w-8 rounded-lg bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 cursor-pointer">
                                                            <CandlestickChart size={16} />
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>
        </DashboardLayout>
    );
}
