'use client';

import React, { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TrendingUp, TrendingDown, Activity, Zap, Target, Search, ArrowUpRight, BarChart3, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

interface SignalSummary {
    [key: string]: number;
}

const SIGNAL_GROUPS = [
    { 
        id: 'pa', 
        label: 'Price Action', 
        icon: <Zap size={18} />, 
        buyId: 'pa_buy', 
        sellId: 'pa_sell' 
    },
    { 
        id: 'mr', 
        label: 'Mean Reversal', 
        icon: <BarChart3 size={18} />, 
        buyId: 'mr_buy', 
        sellId: 'mr_sell' 
    },
    { 
        id: 'rsi', 
        label: 'RSI Divergence', 
        icon: <Activity size={18} />, 
        buyId: 'rsi_bull_div', 
        sellId: 'rsi_bear_div' 
    },
    { 
        id: 'macd', 
        label: 'MACD Divergence', 
        icon: <TrendingUp size={18} />, 
        buyId: 'macd_bull_div', 
        sellId: 'macd_bear_div' 
    },
    { 
        id: 'dow', 
        label: 'Dow Signal', 
        icon: <Target size={18} />, 
        buyId: 'dow_buy', 
        sellId: 'dow_sell' 
    },
];

const ALL_SIGNAL_TYPES = [
    { id: 'pa_buy', label: 'Price Action Buy', icon: <Zap size={16} />, side: 'buy' },
    { id: 'pa_sell', label: 'Price Action Sell', icon: <Zap size={16} />, side: 'sell' },
    { id: 'mr_buy', label: 'Mean Reversal Buy', icon: <BarChart3 size={16} />, side: 'buy' },
    { id: 'mr_sell', label: 'Mean Reversal Sell', icon: <BarChart3 size={16} />, side: 'sell' },
    { id: 'rsi_bull_div', label: 'RSI Bullish Divg', icon: <Activity size={16} />, side: 'buy' },
    { id: 'rsi_bear_div', label: 'RSI Bearish Divg', icon: <Activity size={16} />, side: 'sell' },
    { id: 'macd_bull_div', label: 'MACD Bullish Divg', icon: <TrendingUp size={16} />, side: 'buy' },
    { id: 'macd_bear_div', label: 'MACD Bearish Divg', icon: <TrendingUp size={16} />, side: 'sell' },
    { id: 'dow_buy', label: 'Dow Signal Buy', icon: <Target size={16} />, side: 'buy' },
    { id: 'dow_sell', label: 'Dow Signal Sell', icon: <Target size={16} />, side: 'sell' },
];

export default function TradingSignalAlerts() {
    const [summary, setSummary] = useState<SignalSummary>({});
    const [lastScanDate, setLastScanDate] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [detailSymbols, setDetailSymbols] = useState<string[]>([]);
    const [detailLoading, setDetailLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        fetchSummary();
    }, []);

    const fetchSummary = async () => {
        try {
            const res = await api.get('/api/stocks/signal-alerts/');
            setSummary(res.data.summary || {});
            setLastScanDate(res.data.date);
        } catch (err) {
            console.error("Error fetching signal summary:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleCardSideClick = async (e: React.MouseEvent, type: string) => {
        e.stopPropagation();
        setSelectedCategory(type);
        setDetailLoading(true);
        setSearchQuery('');
        try {
            const res = await api.get(`/api/stocks/signal-alerts/?category=${type}`);
            setDetailSymbols(res.data.symbols || []);
        } catch (err) {
            console.error("Error fetching signal details:", err);
        } finally {
            setDetailLoading(false);
        }
    };

    const activeType = ALL_SIGNAL_TYPES.find(t => t.id === selectedCategory);
    const filteredSymbols = detailSymbols.filter(s => s.toLowerCase().includes(searchQuery.toLowerCase()));

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
                <h2 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                    <Activity className="w-3 h-3" />
                    Institutional Signal Alerts
                </h2>
                <Badge variant="outline" className="text-[9px] font-bold bg-slate-50/50 dark:bg-muted border-slate-200 dark:border-border uppercase tracking-tight">
                    {lastScanDate ? `Snapshot: ${lastScanDate}` : 'Pipeline Live'}
                </Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {SIGNAL_GROUPS.map((group) => {
                    const buyCount = summary[group.buyId] || 0;
                    const sellCount = summary[group.sellId] || 0;
                    
                    return (
                        <Card 
                            key={group.id}
                            className="border-slate-200 dark:border-border bg-white dark:bg-card shadow-sm overflow-hidden flex flex-col group transition-all"
                        >
                            {/* Header Section */}
                            <div className="p-4 flex items-center gap-3 border-b border-border dark:border-border bg-slate-50/30 dark:bg-white/[0.01]">
                                <div className="h-9 w-9 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                                    {group.icon}
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-tight truncate leading-tight">
                                        {group.label}
                                    </h3>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">ENGINE</p>
                                </div>
                            </div>

                            {/* Dual Side Buttons */}
                            <div className="flex divide-x divide-slate-100 dark:divide-white/5 h-14">
                                <button 
                                    onClick={(e) => handleCardSideClick(e, group.buyId)}
                                    className="flex-1 flex flex-col items-center justify-center hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors group/buy"
                                >
                                    <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                                        <TrendingUp size={12} className="group-hover/buy:translate-y-[-1px] transition-transform" />
                                        {loading ? '...' : buyCount}
                                    </span>
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">BUY</span>
                                </button>
                                
                                <button 
                                    onClick={(e) => handleCardSideClick(e, group.sellId)}
                                    className="flex-1 flex flex-col items-center justify-center hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors group/sell"
                                >
                                    <span className="text-sm font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-0.5">
                                        <TrendingDown size={12} className="group-hover/sell:translate-y-[1px] transition-transform" />
                                        {loading ? '...' : sellCount}
                                    </span>
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">SELL</span>
                                </button>
                            </div>
                        </Card>
                    );
                })}
            </div>

            <Dialog open={!!selectedCategory} onOpenChange={(open) => !open && setSelectedCategory(null)}>
                <DialogContent className="max-w-2xl bg-white dark:bg-slate-950 border-slate-200 dark:border-border p-0 overflow-hidden">
                    <DialogHeader className="p-6 pb-0">
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className={cn(
                                    "h-12 w-12 rounded-2xl flex items-center justify-center",
                                    activeType?.side === 'buy' ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600" : "bg-rose-100 dark:bg-rose-900/30 text-rose-600"
                                )}>
                                    {activeType?.icon}
                                </div>
                                <div className="min-w-0">
                                    <DialogTitle className="text-xl font-semibold text-slate-900 dark:text-white truncate">
                                        {activeType?.label}
                                    </DialogTitle>
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-0.5 truncate">
                                        Institutional Analysis Drill-down
                                    </p>
                                </div>
                            </div>
                            <Badge className={cn("px-3 py-1 font-semibold shrink-0", activeType?.side === 'buy' ? "bg-emerald-500 text-white" : "bg-rose-500 text-white")}>
                                {detailSymbols.length} ACTIVE
                            </Badge>
                        </div>

                        <div className="mt-6 flex items-center gap-3 pb-4">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <Input 
                                    placeholder="Filter symbols..." 
                                    className="pl-9 h-10 bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-border text-sm font-bold"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                        </div>
                    </DialogHeader>

                    <div className="max-h-[60vh] overflow-y-auto px-6 pb-8">
                        {detailLoading ? (
                            <div className="py-20 text-center">
                                <div className="h-8 w-8 border-b-2 border-indigo-500 rounded-full animate-spin mx-auto mb-4" />
                                <p className="text-sm font-bold text-slate-500 italic">Scanning institutional order flow...</p>
                            </div>
                        ) : detailSymbols.length === 0 ? (
                            <div className="py-20 text-center bg-slate-50/50 dark:bg-white/[0.01] rounded-xl border-2 border-dashed border-border dark:border-border">
                                <Info className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                                <p className="text-sm font-bold text-slate-500">No active {activeType?.label} detected.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                                {filteredSymbols.map((symbol) => (
                                    <a 
                                        key={symbol}
                                        href={`/ticker/${symbol}`}
                                        className="p-3 rounded-xl border border-border dark:border-border bg-slate-50/30 dark:bg-muted hover:bg-white dark:hover:bg-white/[0.05] hover:border-slate-300 dark:hover:border-white/20 transition-all group flex items-center justify-between"
                                    >
                                        <div>
                                            <span className="text-sm font-semibold text-slate-900 dark:text-white leading-none">
                                                {symbol}
                                            </span>
                                            <p className="text-[10px] font-bold text-slate-400 mt-0.5 uppercase tracking-tight">ACTIVE ALERT</p>
                                        </div>
                                        <ArrowUpRight className="w-3 h-3 text-slate-300 group-hover:text-indigo-500" />
                                    </a>
                                ))}
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
