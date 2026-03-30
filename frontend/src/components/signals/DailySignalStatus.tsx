'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { 
    Target, ShieldAlert, Zap, TrendingUp, TrendingDown, 
    Activity, BarChart2, Layers, Clock, ArrowRight,
    Search, Info, LineChart as LineChartIcon,
    Gauge, ArrowUpRight, ArrowDownRight,
    BarChart3, MousePointer2, Briefcase
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
    raw_value?: number;
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
    const [allTimeBrokers, setAllTimeBrokers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const [detailRes, fibRes, signalsRes, brokerRes] = await Promise.all([
                    api.get(`/api/stocks/details/${symbol}/`),
                    api.get(`/api/stocks/fibonacci/${symbol}/?period=365`),
                    api.get(`/api/stocks/signals/?symbol=${symbol}&page_size=10`),
                    api.get('/api/stocks/companies/brokers_graph/', { params: { symbol, range: 'ALL' } })
                ]);
                
                setPageData(detailRes.data);
                setFibData(fibRes.data);
                setHistory(signalsRes.data?.results || []);
                
                // Process broker data from fundamental.broker_accumulation
                const accumulation = detailRes.data?.fundamental?.broker_accumulation || {};
                const topBuyers = accumulation['1M']?.filter((b: any) => b.type === 'BUY').slice(0, 3) || [];
                const topATBuyers = accumulation['AT']?.filter((b: any) => b.type === 'BUY').slice(0, 3) || [];
                
                setBrokers(topBuyers);
                setAllTimeBrokers(topATBuyers);
            } catch (err) {
                console.error("Failed to fetch intelligence data", err);
            } finally {
                setLoading(false);
            }
        };

        if (symbol) fetchData();
    }, [symbol]);

    // Derived Intelligence
    const indicators = pageData?.technical_indicators || [];
    const getInd = (pattern: string) => indicators.find((i: any) => i.name.toUpperCase().includes(pattern.toUpperCase()));
    
    const rsiObj = getInd('RSI');
    const macdObj = getInd('MACD (12,26,9)');
    const macdhObj = getInd('MACD HISTOGRAM');
    const macdsObj = getInd('MACD SIGNAL');
    const roc14Obj = getInd('ROC (14)');
    const sma200Obj = getInd('200-DAY SMA');
    const sma50Obj = getInd('50-DAY SMA');
    
    // Trends
    const t5d = getInd('5D TREND');
    const t10d = getInd('10D TREND');
    const t1m = getInd('1M TREND');
    
    // Fallback UI data
    const rsi = rsiObj?.value || '45.00'; // Sample fallback if data pending
    const macd = macdObj?.value || '0.00';
    const macdh = parseFloat(macdhObj?.value || '0');
    const macds = macdsObj?.value || '0.00';
    const roc14 = parseFloat(roc14Obj?.value || '0');
    const t5dVal = parseFloat(t5d?.value || '0');
    const t10dVal = parseFloat(t10d?.value || '0');
    const t1mVal = parseFloat(t1m?.value || '0');
    
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
                <p className="text-[10px] font-bold text-slate-900 dark:text-slate-400 mt-4">Scanning Market Ecosystem...</p>
            </div>
        );
    }

    return (
        <div className={cn("flex flex-col bg-slate-50 dark:bg-slate-950 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden h-full w-full", className)}>
            {/* Header Area - STICKY & COMPACT */}
            <div className="sticky top-0 z-40 px-6 py-2.5 border-b border-slate-200 dark:border-slate-800/60 bg-white/95 dark:bg-slate-900/90 backdrop-blur-xl flex items-center justify-between gap-4 shadow-sm shrink-0">
                <div className="flex items-center gap-4">
                    <div>
                        <h2 className="text-xl font-black tracking-tighter text-slate-900 dark:text-white leading-none">{symbol}</h2>
                        <p className="text-[10px] font-bold text-slate-900/50 dark:text-slate-400/40 mt-1 truncate max-w-[120px] md:max-w-none">
                            {pageData?.company?.name || 'Intelligence Hub'}
                        </p>
                    </div>
                    <Badge className={cn(
                        "text-[9px] font-black px-2 py-0.5 border-none rounded-lg tracking-tight",
                        status === 'WON' ? "bg-emerald-500 text-white" : 
                        status === 'LOST' ? "bg-rose-500 text-white" :
                        direction === 'BUY' ? "bg-black dark:bg-white dark:text-black text-white" : "bg-rose-600 text-white"
                    )}>
                        {status ? `${status === 'WON' ? 'WON' : 'LOST'}` : direction} SIGNAL
                    </Badge>
                </div>

                <div className="flex items-center gap-6">
                    {/* Quick Indicator Bar - Prominent RSI & MACD */}
                    <div className="hidden sm:flex items-center gap-6 px-6 border-x border-slate-100 dark:border-slate-800/50">
                        <div className="flex flex-col items-center">
                            <span className="text-[9px] font-bold text-slate-900/50 dark:text-slate-400/30 mb-0.5">RSI (14)</span>
                            <span className={cn(
                                "text-sm font-black font-mono",
                                parseFloat(rsi) > 70 ? "text-rose-500" : parseFloat(rsi) < 30 ? "text-emerald-500" : "text-slate-900 dark:text-slate-100"
                            )}>
                                {rsi}
                            </span>
                        </div>
                        <div className="flex flex-col items-center">
                            <span className="text-[9px] font-bold text-slate-900/50 dark:text-slate-400/30 mb-0.5">MACD</span>
                            <span className={cn(
                                "text-sm font-black font-mono",
                                macdh > 0 ? "text-emerald-500" : "text-rose-500"
                            )}>
                                {macd}
                            </span>
                        </div>
                    </div>

                    <div className="text-right">
                        <div className="text-xl font-black font-mono text-slate-900 dark:text-slate-100 tracking-tighter leading-none">Rs. {cmp.toLocaleString()}</div>
                        <div className="text-[9px] font-bold text-slate-900/40 dark:text-slate-400/30 mt-1">Market price</div>
                    </div>
                </div>
            </div>

            {/* Scrollable Content Container */}
            <div className="flex-1 overflow-y-auto no-scrollbar pb-10">
                {/* Trade Dashboard Tiles */}
                <div className="px-8 pt-6 grid grid-cols-1 md:grid-cols-3 gap-5">
                    <div className="p-6 rounded-3xl border border-emerald-200/50 dark:border-emerald-500/20 bg-emerald-50/20 dark:bg-emerald-500/5 transition-all hover:bg-emerald-50/40 dark:hover:bg-emerald-500/10">
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600"><Target size={18} /></div>
                            <span className="text-[10px] font-bold text-emerald-600/60 font-mono">{targetDist > 0 ? '+' : ''}{targetDist.toFixed(1)}% Distance</span>
                        </div>
                        <div className="text-[10px] font-bold text-slate-900/60 dark:text-slate-400/50 mb-1 tracking-tight">Target price</div>
                        <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono tracking-tighter leading-none">Rs. {primaryTarget.toLocaleString()}</div>
                    </div>

                    <div className="p-6 rounded-3xl border border-rose-200/50 dark:border-rose-500/20 bg-rose-50/20 dark:bg-rose-500/5 transition-all hover:bg-rose-50/40 dark:hover:bg-rose-500/10">
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-600"><ShieldAlert size={18} /></div>
                            <span className="text-[10px] font-bold text-rose-600/60 font-mono">{Math.abs(stopDist).toFixed(1)}% Exposure</span>
                        </div>
                        <div className="text-[10px] font-bold text-slate-900/60 dark:text-slate-400/50 mb-1 tracking-tight">Stop loss</div>
                        <div className="text-2xl font-black text-rose-600 dark:text-rose-400 font-mono tracking-tighter leading-none">Rs. {primaryStop.toLocaleString()}</div>
                    </div>

                    <div className="p-6 rounded-3xl border border-slate-300/50 dark:border-slate-700/20 bg-slate-100/40 dark:bg-slate-900/20 transition-all hover:bg-slate-200/40 dark:hover:bg-white/10">
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-2 rounded-xl bg-black/10 dark:bg-white/10 text-black dark:text-white"><Gauge size={18} /></div>
                            <span className="text-[10px] font-bold text-slate-900/60 dark:text-slate-400/60 font-mono">{riskReward}:1 Efficiency</span>
                        </div>
                        <div className="text-[10px] font-bold text-slate-900/60 dark:text-slate-400/50 mb-1 tracking-tight">Setup score</div>
                        <div className="text-2xl font-black text-black dark:text-white font-mono tracking-tighter leading-none">{strength}% Gravity</div>
                    </div>
                </div>

                {/* Performance Trends Row */}
                {/* Performance Trends Row - ROC, 5D, 10D, 1M */}
                <div className="px-8 mt-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {[
                            { label: 'ROC (14)', val: roc14, icon: <Activity size={10} /> },
                            { label: '5d Trend', val: t5dVal, icon: <TrendingUp size={10} /> },
                            { label: '10d Trend', val: t10dVal, icon: <Clock size={10} /> },
                            { label: '1m Trend', val: t1mVal, icon: <BarChart2 size={10} /> }
                        ].map((trend) => (
                            <div key={trend.label} className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/50 flex items-center justify-between group hover:border-black/30 transition-colors shadow-sm">
                                <div className="flex flex-col">
                                    <span className="text-[8px] font-bold text-slate-900/40 dark:text-slate-400/60 leading-none mb-1">{trend.label}</span>
                                    <span className={cn(
                                        "text-xs font-black font-mono",
                                        trend.val > 0 ? "text-emerald-500" : trend.val < 0 ? "text-rose-500" : "text-slate-500"
                                    )}>
                                        {trend.val > 0 ? '+' : ''}{trend.val.toFixed(2)}%
                                    </span>
                                </div>
                                <div className={cn(
                                    "p-1.5 rounded-lg",
                                    trend.val > 0 ? "bg-emerald-500/10 text-emerald-600" : trend.val < 0 ? "bg-rose-500/10 text-rose-600" : "bg-slate-100 text-slate-400"
                                )}>
                                    {trend.val > 0 ? <ArrowUpRight size={14} /> : trend.val < 0 ? <ArrowDownRight size={14} /> : trend.icon}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="px-8 mt-8 grid grid-cols-1 lg:grid-cols-[1.3fr_1fr_0.7fr] gap-8">
                    {/* Column 1: Deep Analytics & Oscillators */}
                    <div className="space-y-8">
                        <div className="space-y-5">
                            <h4 className="text-[10px] font-bold text-slate-900/40 dark:text-slate-400/60 flex items-center gap-2">
                                <Activity size={12} className="text-black dark:text-white" /> Momentum engine
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
                                    <div className="text-[10px] font-bold text-slate-900/40 dark:text-slate-400/60 mb-2 flex justify-between">
                                        MACD pulsar
                                        <span className="text-black dark:text-white font-mono text-[9px]">{macdh > 0 ? 'Expansion' : 'Contraction'}</span>
                                    </div>
                                    <div className="flex items-end gap-3 mb-4">
                                        <div className="text-2xl font-black font-mono text-slate-900 dark:text-white leading-none">{(macdh || 0).toFixed(2)}</div>
                                        <div className="text-[10px] font-bold text-slate-900/40 dark:text-slate-400/60 mb-0.5">Histogram</div>
                                    </div>
                                    {/* MACD Bar Visualization */}
                                    <div className="h-10 w-full bg-slate-100 dark:bg-slate-800/50 rounded-lg relative overflow-hidden flex items-center px-1">
                                        <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-slate-200 dark:bg-slate-700 z-10" />
                                        <div className="flex-1 flex gap-0.5 items-end justify-center h-full pb-1">
                                            {[...Array(20)].map((_, i) => {
                                                const isActive = macdh > 0 ? i >= 10 : i < 10;
                                                const height = Math.min(90, (Math.abs(macdh) * 20));
                                                return (
                                                    <div key={i} 
                                                        className={cn(
                                                            "w-1 rounded-full transition-all duration-500", 
                                                            isActive ? (macdh > 0 ? "bg-emerald-500" : "bg-rose-500") : "bg-slate-200 dark:bg-slate-800/30"
                                                        )}
                                                        style={{ height: isActive ? `${Math.max(10, height)}%` : '4px' }}
                                                    />
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>

                                <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
                                    <div className="text-[10px] font-bold text-slate-900/40 dark:text-slate-400/60 mb-2 flex justify-between">
                                        Relative strength
                                        <span className={cn("text-[9px] font-mono", parseFloat(rsi) > 60 ? "text-rose-500" : "text-emerald-500")}>{rsi}</span>
                                    </div>
                                    <div className="h-20 flex items-center justify-center relative">
                                        <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full relative">
                                            <div className="absolute left-[30%] right-[30%] top-0 bottom-0 bg-slate-900/10 border-x border-slate-900/20" />
                                            <div 
                                                className={cn(
                                                    "absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white dark:border-slate-900 shadow-xl z-20 transition-all duration-1000",
                                                    parseFloat(rsi) > 70 ? "bg-rose-500" : parseFloat(rsi) < 30 ? "bg-emerald-500" : "bg-black dark:bg-white"
                                                )}
                                                style={{ left: `${parseFloat(rsi)}%` }}
                                            />
                                        </div>
                                        <div className="absolute bottom-0 left-0 text-[8px] font-bold text-emerald-500">30 Over Sold</div>
                                        <div className="absolute bottom-0 right-0 text-[8px] font-bold text-rose-500">70 Over Bought</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h4 className="text-[10px] font-bold text-slate-900/40 dark:text-slate-400/60 flex items-center gap-2">
                                <BarChart2 size={12} className="text-amber-500" /> Trend infrastructure
                            </h4>
                            <div className="grid gap-3">
                                 {[
                                     { label: 'Short Term (50 SMA)', obj: sma50Obj, color: 'bg-black dark:bg-white' },
                                     { label: 'Institutional (200 SMA)', obj: sma200Obj, color: 'bg-slate-400' }
                                 ].map((sma) => (
                                     <div key={sma.label} className="flex items-center justify-between p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 transition-colors hover:border-black/30">
                                        <div className="flex items-center gap-3">
                                            <div className={cn("w-2 h-2 rounded-full", sma.color)} />
                                            <span className="text-xs font-bold text-slate-900/70 dark:text-slate-400/60">{sma.label}</span>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-sm font-black font-mono text-slate-900 dark:text-white">Rs. {parseFloat(sma.obj?.value || '0').toLocaleString()}</div>
                                            <div className={cn("text-[9px] font-bold", cmp > parseFloat(sma.obj?.value || '0') ? "text-emerald-500" : "text-rose-500")}>
                                                {cmp > parseFloat(sma.obj?.value || '0') ? 'Trading above' : 'Below pivot'}
                                            </div>
                                        </div>
                                     </div>
                                 ))}
                            </div>
                        </div>
                    </div>

                    {/* Column 2: Institutional & All-Time Intelligence */}
                    <div className="space-y-8">
                        <div className="space-y-4">
                            <h4 className="text-[10px] font-bold text-slate-900/40 dark:text-slate-400/60 flex items-center gap-2">
                                <Briefcase size={12} className="text-blue-500" /> All-time core holders
                            </h4>
                            <div className="grid gap-3">
                                {allTimeBrokers.length === 0 ? (
                                    <div className="p-10 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-[10px] font-bold text-slate-900/40 dark:text-slate-400/60">
                                        Scanning all-time cumulative flows...
                                    </div>
                                ) : allTimeBrokers.map(b => (
                                    <div key={b.broker} className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 relative overflow-hidden group transition-all hover:shadow-lg">
                                        <div className="absolute right-0 top-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                                            <Layers size={40} className="text-blue-500" />
                                        </div>
                                        <div className="flex justify-between items-start mb-4 relative z-10">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-sm font-black text-blue-600 border border-blue-500/20">
                                                    {b.broker}
                                                </div>
                                                <div>
                                                    <div className="text-xs font-black text-slate-900 dark:text-slate-100 tracking-tighter leading-none mb-1">Broker {b.broker}</div>
                                                    <div className="text-[9px] font-bold text-slate-900/40 dark:text-slate-400/60 tracking-widest">Institutional Desk</div>
                                                </div>
                                            </div>
                                            <div className={cn(
                                                "px-2 py-0.5 rounded-lg text-[9px] font-black tracking-wider",
                                                cmp > b.wac ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"
                                            )}>
                                                {cmp > b.wac ? 'In Profit' : 'Under Water'}
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4 relative z-10">
                                            <div className="space-y-0.5">
                                                <div className="text-[8px] font-bold text-slate-900/40 dark:text-slate-400/60 leading-none">All-time volume</div>
                                                <div className="text-sm font-black text-slate-900 dark:text-slate-100 font-mono tracking-tighter">{(b.qty).toLocaleString()}</div>
                                            </div>
                                            <div className="space-y-0.5 text-right">
                                                <div className="text-[8px] font-bold text-slate-900/40 dark:text-slate-400/60 leading-none">Anchor WAC</div>
                                                <div className="text-sm font-black text-slate-900 dark:text-slate-100 font-mono tracking-tighter">Rs. {b.wac}</div>
                                            </div>
                                        </div>
                                        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center text-[9px] font-bold">
                                            <span className="text-slate-900/70 dark:text-slate-400/60">Yield spread vs CMP</span>
                                            <span className={cn(cmp > b.wac ? "text-emerald-500" : "text-rose-500")}>
                                                {(( (cmp - b.wac) / b.wac ) * 100).toFixed(1)}%
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h4 className="text-[10px] font-bold text-slate-900/40 dark:text-slate-400/60 flex items-center gap-2">
                                <LineChartIcon size={12} className="text-emerald-500" /> Fibonacci anchor
                            </h4>
                            <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
                                {fibData?.levels.slice(1, 4).map(lev => (
                                    <div key={lev.label} className="space-y-1.5">
                                        <div className="flex justify-between text-[9px] font-black tracking-widest">
                                            <span className="text-slate-900/40 dark:text-slate-400/60">Level {lev.ratio}</span>
                                            <span className="text-slate-900 dark:text-slate-100 font-mono">Rs.{lev.price.toFixed(0)}</span>
                                        </div>
                                        <div className="h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                            <div 
                                                className={cn("h-full transition-all duration-1000", lev.ratio >= 0.618 ? "bg-amber-500" : "bg-black dark:bg-white")}
                                                style={{ width: `${lev.ratio * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Column 3: Sequence Timeline Sidebar */}
                    <div className="space-y-5">
                        <h4 className="text-[10px] font-bold text-slate-900/40 dark:text-slate-400/60 flex items-center gap-2">
                            <Clock size={12} className="text-black dark:text-white" /> Signal sequence
                        </h4>
                        <div className="space-y-3 relative before:absolute before:left-2 before:top-4 before:bottom-4 before:w-0.5 before:bg-slate-100 dark:before:bg-slate-800/50">
                            {history.length === 0 ? (
                                <div className="p-10 text-center text-[10px] font-bold text-slate-900/40 dark:text-slate-400/60 border border-dashed border-slate-200 dark:border-slate-800 rounded-3xl ml-4">
                                    Sequence empty
                                </div>
                            ) : history.slice(0, 5).map((h, i) => (
                                <div key={i} className="relative pl-6 group">
                                    <div className={cn(
                                        "absolute left-0 top-1 w-4 h-4 rounded-full border-2 border-white dark:border-slate-950 flex items-center justify-center z-10 shadow-sm",
                                        h.signal === 'BUY' ? "bg-emerald-500" : "bg-rose-500"
                                    )}>
                                        <MousePointer2 size={8} className="text-white fill-white" />
                                    </div>
                                    <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/40 dark:bg-slate-900/40 transition-all hover:bg-white dark:hover:bg-slate-800 group-hover:translate-x-1">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-[9px] font-bold text-slate-900 dark:text-slate-100 tracking-tighter">{h.strategy_name}</span>
                                            <span className="text-[8px] font-bold text-slate-900/40 dark:text-slate-400/60 font-mono">{h.date}</span>
                                        </div>
                                        <div className="text-[10px] font-bold text-black dark:text-white font-mono leading-none mb-1">Entry @ Rs.{parseFloat(h.last_close).toLocaleString()}</div>
                                        <p className="text-[8px] text-slate-900/40 dark:text-slate-400/60 leading-tight font-bold italic line-clamp-2">{h.reason || 'Strategic momentum shift'}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                        
                        <div className="p-5 rounded-3xl bg-slate-900 text-white space-y-4 shadow-xl">
                            <div className="flex items-center gap-3">
                                 <div className="p-2 rounded-xl bg-white/10"><Zap size={14} className="text-amber-400" /></div>
                                 <div className="text-[10px] font-bold">System advisory</div>
                            </div>
                            <p className="text-[9px] font-medium leading-relaxed opacity-80 italic">
                                Trend integrity is currently {strength > 60 ? 'high' : 'stabilizing'}. Institutional desk activity at Rs.{primaryStop.toFixed(0)} remains the primary invalidation threshold for this {direction.toLowerCase()} cycle.
                            </p>
                            <button 
                                onClick={() => window.open(`/ticker/${symbol}`, '_blank')}
                                className="w-full py-2.5 rounded-xl bg-white text-slate-900 text-[10px] font-bold hover:bg-slate-100 transition-all active:scale-95 flex items-center justify-center gap-2"
                            >
                                Deep terminal review <ArrowRight size={12} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
