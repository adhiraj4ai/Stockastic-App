'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { 
    Target, ShieldAlert, Zap, TrendingUp, TrendingDown, 
    Activity, BarChart2, Layers, Clock, ArrowRight,
    Search, Info, LineChart as LineChartIcon,
    Gauge, ArrowUpRight, ArrowDownRight,
    BarChart3
} from 'lucide-react';
import api from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { StockLoader } from '@/components/ui/StockLoader';

interface DailySignalStatusProps {
    symbol: string;
    cmp: number;
    strength: number;
    direction: 'BUY' | 'SELL';
    targetPrice?: number;
    stopLoss?: number;
    status?: string;
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

export function DailySignalStatus({ 
    symbol, 
    cmp, 
    strength, 
    direction, 
    targetPrice, 
    stopLoss, 
    status, 
    className 
}: DailySignalStatusProps) {
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
    const getInd = (pattern: string) => indicators.find((i: any) => i.name.toUpperCase().includes(pattern.toUpperCase()))?.value;
    
    const rsi = getInd('RSI');
    const macd = getInd('MACD');
    const atr = getInd('ATR');
    const pivot = getInd('PIVOT');
    const sma200 = getInd('200-DAY SMA');
    const sma50 = getInd('50-DAY SMA');
    
    // Trade Levels (Using real signal levels if available, fallback otherwise)
    const primaryTarget = targetPrice || (direction === 'BUY' ? cmp * 1.08 : cmp * 0.92);
    const primaryStop = stopLoss || (direction === 'BUY' ? cmp * 0.96 : cmp * 1.04);
    
    const targetDist = ((primaryTarget - cmp) / (cmp || 1)) * 100;
    const stopDist = ((primaryStop - cmp) / (cmp || 1)) * 100;

    const riskReward = useMemo(() => {
        const risk = Math.max(0.1, Math.abs(cmp - primaryStop));
        const reward = Math.abs(primaryTarget - cmp);
        return (reward / risk).toFixed(2);
    }, [cmp, primaryStop, primaryTarget]);

    const pricePosition = useMemo(() => {
        if (!pageData?.fundamental?.day_high || !pageData?.fundamental?.day_low) return 50;
        const low = pageData.fundamental.day_low;
        const high = pageData.fundamental.day_high;
        if (high === low) return 50;
        return ((cmp - low) / (high - low)) * 100;
    }, [cmp, pageData]);

    if (loading) {
        return (
            <div className="p-20 flex flex-col items-center justify-center space-y-4 bg-white/70 dark:bg-slate-900/50 backdrop-blur-xl rounded-3xl h-full">
                <StockLoader size="md" />
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-4">Scanning Market Ecosystem...</p>
            </div>
        );
    }

    return (
        <div className={cn("flex flex-col bg-slate-50 dark:bg-slate-950 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden h-full w-full overflow-y-auto no-scrollbar", className)}>
            {/* Header Area */}
            <div className="p-8 border-b border-slate-200 dark:border-slate-800/50 bg-white dark:bg-slate-900/40 backdrop-blur-md">
                <div className="flex flex-col md:flex-row justify-between md:items-end gap-6">
                    <div className="space-y-1">
                        <div className="flex items-center gap-3">
                            <h2 className="text-4xl font-black tracking-tighter text-slate-900 dark:text-white uppercase leading-none">{symbol}</h2>
                            <Badge className={cn(
                                "text-[10px] font-black px-3 py-1 uppercase tracking-widest border-none",
                                status === 'WON' ? "bg-emerald-500 text-white" : 
                                status === 'LOST' ? "bg-rose-500 text-white" :
                                direction === 'BUY' ? "bg-indigo-600 text-white" : "bg-rose-600 text-white"
                            )}>
                                {status ? `${status} SIGNAL` : `${direction} SIGNAL`}
                            </Badge>
                        </div>
                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 max-w-md truncate">
                            {pageData?.company?.name || 'Institutional Intelligence Hub'}
                        </p>
                    </div>
                    <div className="text-left md:text-right">
                        <div className="text-3xl font-black font-mono text-slate-900 dark:text-slate-100 tracking-tighter leading-none">Rs. {cmp.toLocaleString()}</div>
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2 flex items-center md:justify-end gap-2">
                             <Activity size={12} className="text-indigo-500" /> Current Market Price
                        </div>
                    </div>
                </div>
            </div>

            {/* Trade Dashboard Tiles */}
            <div className="px-8 pt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-6 rounded-3xl border border-emerald-200/50 dark:border-emerald-500/20 bg-emerald-50/30 dark:bg-emerald-500/5 group transition-all hover:bg-emerald-50/50 dark:hover:bg-emerald-500/10">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600"><Target size={18} /></div>
                        <span className="text-[10px] font-black text-emerald-600/60 uppercase tracking-widest font-mono">{targetDist > 0 ? '+' : ''}{targetDist.toFixed(1)}% Distance</span>
                    </div>
                    <div className="text-xs font-bold text-emerald-700/70 dark:text-emerald-400/70 uppercase tracking-wider mb-1">Primary Objective</div>
                    <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono tracking-tighter">Rs. {primaryTarget.toLocaleString()}</div>
                </div>

                <div className="p-6 rounded-3xl border border-rose-200/50 dark:border-rose-500/20 bg-rose-50/30 dark:bg-rose-500/5 group transition-all hover:bg-rose-50/50 dark:hover:bg-rose-500/10">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-2 rounded-xl bg-rose-500/10 text-rose-600"><ShieldAlert size={18} /></div>
                        <span className="text-[10px] font-black text-rose-600/60 uppercase tracking-widest font-mono">{stopDist.toFixed(1)}% Exposure</span>
                    </div>
                    <div className="text-xs font-bold text-rose-700/70 dark:text-rose-400/70 uppercase tracking-wider mb-1">Protective Stop</div>
                    <div className="text-2xl font-black text-rose-600 dark:text-rose-400 font-mono tracking-tighter">Rs. {primaryStop.toLocaleString()}</div>
                </div>

                <div className="p-6 rounded-3xl border border-indigo-200/50 dark:border-indigo-500/20 bg-indigo-50/30 dark:bg-indigo-500/5 group transition-all hover:bg-indigo-50/50 dark:hover:bg-indigo-500/10">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600"><Gauge size={18} /></div>
                        <span className="text-[10px] font-black text-indigo-600/60 uppercase tracking-widest font-mono">{riskReward}:1 Ratio</span>
                    </div>
                    <div className="text-xs font-bold text-indigo-700/70 dark:text-indigo-400/70 uppercase tracking-wider mb-1">Strategy Efficiency</div>
                    <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400 font-mono tracking-tighter">{strength}% Strength</div>
                </div>
            </div>

            <div className="p-8 grid grid-cols-1 lg:grid-cols-[1.3fr_1fr_0.7fr] gap-8">
                {/* Column 1: Deep Analytics & Oscillators */}
                <div className="space-y-8">
                    <div className="space-y-5">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <Activity size={14} className="text-indigo-500" /> Oscillator Suite
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 relative overflow-hidden group">
                                <div className="relative z-10">
                                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex justify-between">
                                        RSI (14)
                                        <span className={cn(
                                            "text-[9px] px-1.5 rounded",
                                            parseFloat(rsi || '50') > 70 ? "bg-rose-500 text-white" : 
                                            parseFloat(rsi || '50') < 30 ? "bg-emerald-500 text-white" : "bg-slate-100 dark:bg-slate-800"
                                        )}>
                                            {parseFloat(rsi || '50') > 70 ? 'Hot' : parseFloat(rsi || '50') < 30 ? 'Oversold' : 'Neutral'}
                                        </span>
                                    </div>
                                    <div className="text-2xl font-black font-mono text-slate-900 dark:text-white leading-none mb-3">{rsi || '--'}</div>
                                    <Progress value={parseFloat(rsi || '50')} className="h-1 bg-slate-100 dark:bg-slate-800" />
                                </div>
                            </div>

                            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 group">
                                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">MACD Signal</div>
                                <div className="text-xl font-black font-mono text-slate-900 dark:text-white uppercase truncate mb-3">{macd || '--'}</div>
                                <div className="flex gap-1">
                                    {[...Array(5)].map((_, i) => (
                                        <div key={i} className={cn("h-1 flex-1 rounded-full", i < 3 ? "bg-indigo-500" : "bg-slate-100 dark:bg-slate-800")} />
                                    ))}
                                </div>
                            </div>

                            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
                                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex justify-between items-center text-center">
                                    Intraday Pulse
                                    <span className="text-[9px] text-slate-500">{pricePosition.toFixed(0)}%</span>
                                </div>
                                <div className="h-10 flex items-center justify-center">
                                    <div className="w-full h-1 bg-slate-100 dark:bg-slate-800 rounded-full relative">
                                        <div 
                                            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-indigo-600 rounded-full border-2 border-white dark:border-slate-900 shadow-lg"
                                            style={{ left: `${pricePosition}%` }}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
                                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Vol Intensity</div>
                                <div className={cn("text-xl font-black font-mono mb-1", strength > 70 ? "text-indigo-500" : "text-slate-900 dark:text-white")}>
                                    {strength > 75 ? 'SURGE' : strength > 50 ? 'ACTIVE' : 'STATIC'}
                                </div>
                                <div className="text-[9px] font-bold text-slate-400 uppercase italic">Institutional Accum.</div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <BarChart2 size={14} className="text-amber-500" /> Moving Average Context
                        </h4>
                        <div className="grid gap-3">
                             <div className="flex items-center justify-between p-4 rounded-2xl bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800">
                                <div className="flex items-center gap-3">
                                    <div className="w-2 h-2 rounded-full bg-indigo-500" />
                                    <span className="text-xs font-bold text-slate-500 uppercase">Short Term (50 SMA)</span>
                                </div>
                                <div className="text-sm font-black font-mono text-slate-900 dark:text-white">Rs. {parseFloat(sma50 || '0').toLocaleString()}</div>
                             </div>
                             <div className="flex items-center justify-between p-4 rounded-2xl bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800">
                                <div className="flex items-center gap-3">
                                    <div className="w-2 h-2 rounded-full bg-slate-400" />
                                    <span className="text-xs font-bold text-slate-500 uppercase">Long Term (200 SMA)</span>
                                </div>
                                <div className="text-sm font-black font-mono text-slate-900 dark:text-white">Rs. {parseFloat(sma200 || '0').toLocaleString()}</div>
                             </div>
                        </div>
                    </div>
                </div>

                {/* Column 2: Institutional & Floorsheet Intelligence */}
                <div className="space-y-8">
                    <div className="space-y-4">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <Zap size={14} className="text-blue-500" /> Top Accumulators
                        </h4>
                        <div className="grid gap-2">
                            {brokers.length === 0 ? (
                                <div className="p-10 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                    Mapping Large Order Flows...
                                </div>
                            ) : brokers.map(b => (
                                <div key={b.broker} className="flex items-center justify-between p-4 rounded-2xl bg-white dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-slate-800 hover:border-blue-400 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center text-xs font-black text-blue-600 border border-blue-500/20">
                                            {b.broker}
                                        </div>
                                        <div>
                                            <div className="text-xs font-black text-slate-900 dark:text-slate-100 uppercase tracking-tighter">Broker {b.broker}</div>
                                            <div className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest">Buy Sentiment</div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-sm font-black text-slate-900 dark:text-slate-100 font-mono">
                                            {Math.abs(b.net_qty).toLocaleString()}
                                        </div>
                                        <div className="text-[9px] font-bold text-slate-400 uppercase">Shares Logged</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <BarChart3 size={14} className="text-emerald-500" /> Fibonacci & Pivot Support
                        </h4>
                        <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
                            <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
                                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Dynamic Pivot</span>
                                <span className="text-sm font-black font-mono text-indigo-600 dark:text-indigo-400">Rs. {parseFloat(pivot || '0').toFixed(1)}</span>
                            </div>
                            <div className="space-y-4">
                                {fibData?.levels.slice(1, 4).map(lev => (
                                    <div key={lev.label} className="space-y-1.5">
                                        <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                                            <span className="text-slate-400">Level {lev.ratio}</span>
                                            <span className="text-slate-900 dark:text-slate-100 font-mono">Rs.{lev.price.toFixed(0)}</span>
                                        </div>
                                        <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                            <div 
                                                className={cn("h-full transition-all duration-1000", lev.ratio >= 0.618 ? "bg-amber-500" : "bg-indigo-500")}
                                                style={{ width: `${lev.ratio * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Column 3: History & Context Sidebar */}
                <div className="space-y-5">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <Clock size={14} className="text-indigo-500" /> Sequence Analysis
                    </h4>
                    <div className="space-y-3 relative before:absolute before:left-3 before:top-4 before:bottom-4 before:w-0.5 before:bg-slate-100 dark:before:bg-slate-800">
                        {history.length === 0 ? (
                            <div className="p-10 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl ml-4">
                                Sequence Initiated
                            </div>
                        ) : history.slice(0, 5).map(h => (
                            <div key={h.date} className="relative pl-8 group">
                                <div className={cn(
                                    "absolute left-0 top-1.5 w-6 h-6 rounded-full border-4 border-slate-50 dark:border-slate-950 flex items-center justify-center z-10 shadow-sm",
                                    h.signal === 'BUY' ? "bg-emerald-500" : "bg-rose-500"
                                )}>
                                    {h.signal === 'BUY' ? <ArrowUpRight size={10} className="text-white" /> : <ArrowDownRight size={10} className="text-white" />}
                                </div>
                                <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 transition-all hover:bg-white dark:hover:bg-slate-800 shadow-sm group-hover:shadow-md">
                                    <div className="flex justify-between items-start mb-1">
                                        <span className="text-[10px] font-black text-slate-900 dark:text-slate-100 uppercase tracking-tighter">{h.strategy_name}</span>
                                        <span className="text-[9px] font-bold text-slate-400 font-mono">{h.date}</span>
                                    </div>
                                    <div className="text-[10px] font-black text-indigo-500 font-mono mb-2">ENTRY @ Rs.{parseFloat(h.last_close).toLocaleString()}</div>
                                    <p className="text-[9px] text-slate-500 dark:text-slate-400 leading-relaxed font-bold italic">{h.reason || 'Structural Momentum'}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                    
                    <div className="p-5 rounded-3xl bg-indigo-600 text-white space-y-4 shadow-xl shadow-indigo-500/20">
                        <div className="flex items-center gap-3">
                             <div className="p-2 rounded-xl bg-white/20"><Zap size={16} /></div>
                             <div className="text-xs font-black uppercase tracking-tighter">Neural Signal Context</div>
                        </div>
                        <p className="text-[10px] font-medium leading-relaxed opacity-90">
                           Institutional order flow is currently {strength > 70 ? 'AGRESSIVELY' : 'SUBTLY'} aligning with {direction} logic. Maintain strict SL at Rs.{primaryStop.toFixed(0)}.
                        </p>
                        <button 
                            onClick={() => window.open(`/ticker/${symbol}`, '_blank')}
                            className="w-full py-2.5 rounded-xl bg-white text-indigo-600 text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 transition-colors shadow-lg"
                        >
                            Open Market Terminal <ArrowRight size={12} className="inline ml-1" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
