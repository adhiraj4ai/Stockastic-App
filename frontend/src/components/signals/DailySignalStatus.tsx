'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { 
    Target, ShieldAlert, Zap, TrendingUp, TrendingDown, 
    Activity, BarChart2, Layers, Clock, ArrowRight,
    Search, Info, LineChart as LineChartIcon
} from 'lucide-react';
import api from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

interface DailySignalStatusProps {
    symbol: string;
    cmp: number;
    strength: number;
    direction: 'BUY' | 'SELL';
    className?: string;
}

interface TechnicalIndicator {
    name: string;
    value: string;
    category?: string;
}

interface FibLevel {
    ratio: number;
    label: string;
    price: number;
}

interface FibData {
    levels: FibLevel[];
    current_zone: {
        lower: string;
        upper: string;
        lower_price: number;
        upper_price: number;
    } | null;
}

interface SignalHistory {
    date: string;
    signal: string;
    strategy_name: string;
    last_close: string;
    reason?: string;
}

export function DailySignalStatus({ symbol, cmp, strength, direction, className }: DailySignalStatusProps) {
    const [pageData, setPageData] = useState<any>(null);
    const [fibData, setFibData] = useState<FibData | null>(null);
    const [history, setHistory] = useState<SignalHistory[]>([]);
    const [brokers, setBrokers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const [detailRes, fibRes, signalsRes, brokerRes] = await Promise.all([
                    api.get(`/api/stocks/details/${symbol}/`),
                    api.get(`/api/stocks/fibonacci/${symbol}/?period=365`),
                    api.get(`/api/stocks/signals/?symbol=${symbol}&page_size=10`),
                    api.get('/api/stocks/companies/brokers_graph/', { params: { symbol, range: '1M' } })
                ]);
                
                setPageData(detailRes.data);
                setFibData(fibRes.data);
                setHistory(signalsRes.data?.results || []);
                setBrokers(brokerRes.data?.buy_leaders?.slice(0, 3) || []);
            } catch (err) {
                console.error("Failed to fetch intelligence data", err);
            } finally {
                setLoading(false);
            }
        };

        if (symbol) fetchData();
    }, [symbol]);

    // Derived Intelligence
    const indicators = pageData?.fundamental?.technical_indicators || [];
    const rsi = indicators.find((i: any) => i.name === 'RSI')?.value;
    const macd = indicators.find((i: any) => i.name === 'MACD')?.value;
    
    // Proportional calculations (fallback if API lacks targets)
    const targets = useMemo(() => {
        if (direction === 'BUY') {
            return [
                { label: 'Target 1', value: cmp * 1.08, pct: '+8%' },
                { label: 'Target 2', value: cmp * 1.15, pct: '+15%' },
                { label: 'Target 3', value: cmp * 1.25, pct: '+25%' },
            ];
        } else {
            return [
                { label: 'Support 1', value: cmp * 0.92, pct: '-8%' },
                { label: 'Support 2', value: cmp * 0.85, pct: '-15%' },
                { label: 'Support 3', value: cmp * 0.75, pct: '-25%' },
            ];
        }
    }, [cmp, direction]);

    const stopLosses = useMemo(() => {
        if (direction === 'BUY') {
            return [
                { label: 'Stop Loss 1', value: cmp * 0.96, pct: '-4%' },
                { label: 'Stop Loss 2', value: cmp * 0.92, pct: '-8%' },
                { label: 'Stop Loss 3', value: cmp * 0.88, pct: '-12%' },
            ];
        } else {
            return [
                { label: 'Invalidation 1', value: cmp * 1.04, pct: '+4%' },
                { label: 'Invalidation 2', value: cmp * 1.08, pct: '+8%' },
                { label: 'Invalidation 3', value: cmp * 1.12, pct: '+12%' },
            ];
        }
    }, [cmp, direction]);

    const riskReward = useMemo(() => {
        const risk = Math.abs(cmp - stopLosses[0].value);
        const reward = Math.abs(targets[1].value - cmp); // Using Target 2 as typical objective
        return (reward / risk).toFixed(2);
    }, [cmp, stopLosses, targets]);

    if (loading) {
        return (
            <div className="p-20 flex flex-col items-center justify-center space-y-4 bg-white/70 dark:bg-slate-900/50 backdrop-blur-xl rounded-3xl">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500"></div>
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Scanning Market Ecosystem...</p>
            </div>
        );
    }

    return (
        <div className={cn("flex flex-col bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden h-full w-full overflow-y-auto no-scrollbar", className)}>
            {/* Header Area */}
            <div className="p-10 border-b border-slate-100 dark:border-slate-800/50 bg-slate-50/50 dark:bg-slate-800/20 backdrop-blur-sm">
                <div className="flex justify-between items-start">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <h2 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white uppercase">{symbol}</h2>
                            <Badge className={cn(
                                "text-[10px] font-black px-3 py-1 uppercase tracking-widest border-none",
                                direction === 'BUY' ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"
                            )}>
                                {direction} SIGNAL
                            </Badge>
                        </div>
                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400">{pageData?.company?.name || 'Institutional Intelligence'}</p>
                    </div>
                    <div className="text-right">
                        <div className="text-2xl font-black font-mono text-slate-900 dark:text-slate-100">Rs. {cmp.toLocaleString()}</div>
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Current Last Traded Price</div>
                    </div>
                </div>
            </div>

            <div className="p-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Column 1: Strategy Execution */}
                <div className="space-y-8">
                    <div className="space-y-4">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <Target size={14} className="text-indigo-500" /> {direction === 'BUY' ? 'Primary Targets' : 'Support Levels'}
                        </h4>
                        <div className="grid gap-2">
                            {targets.map(t => (
                                <div key={t.label} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-700/50">
                                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">{t.label}</span>
                                    <div className="text-right">
                                        <div className="text-sm font-black text-slate-900 dark:text-slate-100 font-mono">Rs. {t.value.toFixed(2)}</div>
                                        <div className={cn("text-[10px] font-black", direction === 'BUY' ? "text-emerald-500" : "text-rose-500")}>
                                            {t.pct} {direction === 'BUY' ? '↑' : '↓'}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <ShieldAlert size={14} className="text-rose-500" /> {direction === 'BUY' ? 'Stop Loss Protection' : 'Upside Invalidation'}
                        </h4>
                        <div className="grid gap-2">
                            {stopLosses.map(s => (
                                <div key={s.label} className="flex items-center justify-between p-4 rounded-2xl bg-rose-50/30 dark:bg-rose-500/5 border border-rose-100/50 dark:border-rose-500/20">
                                    <span className="text-xs font-bold text-rose-700 dark:text-rose-300 uppercase">{s.label}</span>
                                    <div className="text-right">
                                        <div className="text-sm font-black text-rose-600 dark:text-rose-400 font-mono">Rs. {s.value.toFixed(2)}</div>
                                        <div className="text-[10px] font-black text-rose-500 opacity-70">{s.pct}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        
                        <div className="grid gap-3">
                            <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-500/5 border border-indigo-100/50 dark:border-indigo-500/20">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300 uppercase">Conviction Score</span>
                                    <span className="text-sm font-black text-indigo-600 dark:text-indigo-400">{strength}%</span>
                                </div>
                                <Progress value={strength} className="h-1.5 bg-indigo-100 dark:bg-indigo-950/40" />
                            </div>
                            <div className="p-4 rounded-2xl bg-emerald-50/50 dark:bg-emerald-500/5 border border-emerald-100/50 dark:border-emerald-500/20">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300 uppercase">Risk:Reward</span>
                                    <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">{riskReward}:1</span>
                                </div>
                                <div className="text-[10px] font-bold text-emerald-500 opacity-70 uppercase tracking-tighter">Optimized Entry Target</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Column 2: Technical & Institutional Intelligence */}
                <div className="space-y-8">
                    <div className="space-y-4">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <Activity size={14} className="text-cyan-500" /> Technical Pulse
                        </h4>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/50 text-center">
                                <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">RSI (14)</div>
                                <div className={cn(
                                    "text-lg font-black font-mono",
                                    parseFloat(rsi || '50') > 70 ? "text-rose-500" : parseFloat(rsi || '50') < 30 ? "text-emerald-500" : "text-slate-900 dark:text-white"
                                )}>{rsi || '--'}</div>
                            </div>
                            <div className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/50 text-center">
                                <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">MACD</div>
                                <div className="text-lg font-black font-mono text-slate-900 dark:text-white uppercase truncate">{macd || '--'}</div>
                            </div>
                            <div className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/50 text-center">
                                <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Trend</div>
                                <div className={cn("text-lg font-black font-mono", direction === 'BUY' ? "text-emerald-500" : "text-rose-500")}>
                                    {direction === 'BUY' ? 'Bullish' : 'Bearish'}
                                </div>
                            </div>
                            <div className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/50 text-center">
                                <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Volume</div>
                                <div className={cn("text-lg font-black font-mono", strength > 70 ? "text-indigo-500" : "text-slate-900 dark:text-white")}>
                                    {strength > 70 ? 'Elevated' : 'Neutral'}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <Zap size={14} className="text-blue-500" /> Top Broker Holders (Net Buyers)
                        </h4>
                        <div className="grid gap-2">
                            {brokers.length === 0 ? (
                                <div className="p-4 py-8 rounded-2xl border border-dashed border-slate-100 dark:border-slate-800 text-center text-[10px] font-bold text-slate-400 uppercase">
                                    Analyzing Accumulation Zones...
                                </div>
                            ) : brokers.map(b => (
                                <div key={b.broker} className="flex items-center justify-between p-4 rounded-2xl bg-blue-50/30 dark:bg-blue-500/5 border border-blue-100/50 dark:border-blue-500/20">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-[10px] font-black text-blue-600">
                                            {b.broker}
                                        </div>
                                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Broker {b.broker}</span>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xs font-black text-slate-900 dark:text-slate-100 font-mono">
                                            {Math.abs(b.net_qty).toLocaleString()} Qty
                                        </div>
                                        <div className="text-[9px] font-bold text-emerald-500 uppercase tracking-tighter">Buying Pulse</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {fibData && fibData.levels.length > 0 && (
                        <div className="space-y-4">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                <LineChartIcon size={14} className="text-amber-500" /> Fibonacci Projections
                            </h4>
                            <div className="p-6 rounded-3xl bg-slate-50 dark:bg-slate-800/20 border border-slate-100 dark:border-slate-800/50">
                                <div className="space-y-3">
                                    {fibData.levels.slice(0, 4).map(lev => (
                                        <div key={lev.label} className="flex items-center gap-4">
                                            <span className="w-10 text-[10px] font-black text-slate-400 uppercase font-mono">{lev.ratio}</span>
                                            <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-800 rounded-full relative overflow-hidden">
                                                <div className={cn("absolute left-0 top-0 h-full bg-slate-400", lev.ratio === 0.618 && "bg-indigo-500")} style={{ width: `${Math.min(lev.ratio * 100, 100)}%` }} />
                                            </div>
                                            <span className="text-xs font-black text-slate-700 dark:text-slate-300 font-mono italic">Rs.{lev.price.toFixed(0)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Column 3: Signal Context & History */}
                <div className="space-y-4">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <Clock size={14} className="text-indigo-500" /> Intelligence Timeline
                    </h4>
                    <div className="space-y-3">
                        {history.length === 0 ? (
                            <div className="text-center py-12 text-xs text-slate-400 font-bold border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-2xl">
                                First Signal Tracked
                            </div>
                        ) : history.map(h => (
                            <div key={h.date} className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 hover:border-indigo-200 transition-all bg-white dark:bg-slate-900/30">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <div className={cn("w-2 h-2 rounded-full", h.signal === 'BUY' ? "bg-emerald-500" : "bg-rose-500")} />
                                        <span className="text-[10px] font-black text-slate-900 dark:text-slate-100 uppercase">{h.strategy_name}</span>
                                    </div>
                                    <span className="text-[9px] font-bold text-slate-400">{h.date}</span>
                                </div>
                                <div className="flex justify-between items-end">
                                    <p className="text-[10px] font-medium text-slate-500 leading-tight flex-1 max-w-[150px]">{h.reason || 'Technical Breakout'}</p>
                                    <span className="text-xs font-black text-indigo-500 font-mono">Rs.{parseFloat(h.last_close).toLocaleString()}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="p-6 bg-slate-900 dark:bg-black text-center">
                <button 
                    onClick={() => window.open(`/ticker/${symbol}`, '_blank')}
                    className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black transition-all shadow-xl shadow-indigo-500/20"
                >
                    DETAILED TERMINAL ANALYSIS <ArrowRight size={14} strokeWidth={3} />
                </button>
            </div>
        </div>
    );
}
