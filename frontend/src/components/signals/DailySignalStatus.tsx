'use client';

import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import {
    Zap, TrendingUp, TrendingDown,
    Activity, ArrowUpRight, ArrowDownRight,
    Briefcase, ExternalLink, Clock, Brain, Layers,
    Target, Shield, BarChart3, Building2, Gauge, Sparkles
} from 'lucide-react';
import api from '@/lib/api';
import { num, fixed, formatPrice, calcPct } from '@/lib/numbers';
import { StockLoader } from '@/components/ui/StockLoader';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import TickerAccumulation from '@/components/ticker/TickerAccumulation';

interface DailySignalStatusProps {
    symbol: string;
    cmp: number;
    entryPrice: number;
    strength: number;
    direction: 'BUY' | 'SELL';
    targetPrice?: number;
    stopLoss?: number;
    tp1?: number;
    tp2?: number;
    tp3?: number;
    status?: string;
    className?: string;
    hideHeader?: boolean;
}

interface SignalHistory {
    date: string;
    signal: 'BUY' | 'SELL' | 'HOLD' | 'NEUTRAL';
    strategy_name: string;
    last_close: string;
}

interface GeneratedSignalEntry {
    source: string;
    signal: 'BUY' | 'SELL';
    signal_tier: string;
    strength: number;
    rationale: string;
    status: string;
    generated_date: string;
}

const SOURCE_LABELS: Record<string, string> = {
    SMART_MONEY: 'Smart Money',
    BROKER_ACCUMULATION: 'Broker Accumulation',
    SMART_CROSSOVER: 'Smart Crossover',
    ICHIMOKU: 'Ichimoku',
    PRICE_ACTION: 'Price Action',
    MEAN_REVERSAL: 'Mean Reversal',
    RSI_DIVERGENCE: 'RSI Divergence',
    MACD_DIVERGENCE: 'MACD Divergence',
    DOW_SIGNAL: 'Dow Signal',
};

// ─── Numeric Helpers ──────────────────────────────────────────────────────────

const getActionability = (entryPrice: number, cmp?: number, direction?: string) => {
    const safeCmp = num(cmp, 0);
    if (safeCmp === 0 || direction === 'HOLD' || direction === 'NEUTRAL') return null;
    const ch = ((safeCmp - entryPrice) / entryPrice) * 100;
    if (direction === 'BUY') {
        if (ch < -5) return { label: 'Invalidated', status: 'invalid' };
        if (ch > 3) return { label: 'Entry Missed', status: 'missed' };
        return { label: 'In Entry Zone', status: 'valid' };
    }
    if (direction === 'SELL') {
        if (ch > 5) return { label: 'Invalidated', status: 'invalid' };
        if (ch < -3) return { label: 'Entry Missed', status: 'missed' };
        return { label: 'In Entry Zone', status: 'valid' };
    }
    return null;
};

// ─── Compact Price Ladder ─────────────────────────────────────────────────────

function PriceLadder({ sl: rawSl, entry: rawEntry, cmp: rawCmp, tp1: rawTp1, tp2: rawTp2, tp3: rawTp3, direction = 'BUY' }: {
    sl: number; entry: number; cmp: number; tp1: number; tp2: number; tp3: number; direction?: 'BUY' | 'SELL';
}) {
    // Defensive: ensure all values are valid finite numbers
    const entry = num(rawEntry);
    const cmp = num(rawCmp, entry);
    const sl = num(rawSl) > 0 ? num(rawSl) : entry * 0.96;
    const tp1 = num(rawTp1) > 0 ? num(rawTp1) : entry * 1.03;
    const tp2 = num(rawTp2) > 0 ? num(rawTp2) : entry * 1.06;
    const tp3 = num(rawTp3) > 0 ? num(rawTp3) : entry * 1.10;

    const pts = [sl, entry, cmp, tp1, tp2, tp3].filter(n => num(n) !== 0);
    if (pts.length === 0) return null;
    const min = Math.min(...pts);
    const max = Math.max(...pts);
    const isBuy = direction === 'BUY';
    const nodes: { price: number; label: string; variant: 'danger' | 'entry' | 'live' | 'tp' | 'tp-hi' }[] = [
        { price: sl, label: 'SL', variant: 'danger' },
        { price: entry, label: 'Entry', variant: 'entry' },
        { price: cmp, label: 'CMP', variant: 'live' },
        { price: tp1, label: 'TP1', variant: 'tp' },
        { price: tp2, label: 'TP2', variant: 'tp' },
        { price: tp3, label: 'TP3', variant: 'tp-hi' },
    ];

    // Sort nodes to ensure progress bars are drawn correctly across the price range
    const sortedPrices = [...nodes].sort((a,b) => a.price - b.price);
    const minNode = sortedPrices[0];
    const maxNode = sortedPrices[sortedPrices.length-1];
    const range = (maxNode.price - minNode.price) || 1;
    const pct = (v: number) => ((num(v) - minNode.price) / range) * 100;

    // Detect overlap between CMP and Entry
    const isOverlapping = Math.abs(pct(cmp) - pct(entry)) < 6;

    const dotCls = {
        danger: 'bg-rose-400 border-white dark:border-slate-900',
        entry: 'bg-slate-600 dark:bg-slate-300 border-white dark:border-slate-900',
        live: 'bg-amber-400 border-white dark:border-slate-900',
        tp: 'bg-emerald-400 border-white dark:border-slate-900',
        'tp-hi': 'bg-sky-400 border-white dark:border-slate-900',
    };
    const labelCls = {
        danger: 'text-rose-500',
        entry: 'text-slate-600 dark:text-slate-400',
        live: 'text-amber-500',
        tp: 'text-emerald-600 dark:text-emerald-400',
        'tp-hi': 'text-sky-500',
    };

    return (
        <div className="px-8 pt-4 pb-7">
            <div className="relative h-12">
                {/* Track */}
                <div className="absolute left-0 right-0 h-0.5 bg-slate-100 dark:bg-slate-800 rounded-full top-3" />
                {/* Risk fill */}
                <div className="absolute h-0.5 bg-rose-200 dark:bg-rose-900/50 rounded-full top-3 transition-all duration-700"
                    style={{ left: `${Math.min(pct(sl), pct(entry))}%`, width: `${Math.abs(pct(entry) - pct(sl))}%` }} />
                {/* Profit fill */}
                <div className="absolute h-0.5 bg-emerald-200 dark:bg-emerald-900/50 rounded-full top-3 transition-all duration-700"
                    style={{ left: `${Math.min(pct(entry), pct(tp3))}%`, width: `${Math.abs(pct(tp3) - pct(entry))}%` }} />

                {nodes.map((n) => (
                    <div key={n.label} className="absolute -translate-x-1/2" style={{ left: `${pct(n.price)}%` }}>
                        {n.variant === 'live' ? (
                            <>
                                <div className="absolute top-0 left-1/2 -translate-x-1/2">
                                    <span className="absolute inset-0 w-5 h-5 rounded-full bg-amber-400 animate-ping opacity-40" />
                                    <span className="relative block w-5 h-5 rounded-full bg-amber-400 border-2 border-white dark:border-slate-900 shadow" />
                                </div>
                                <div className={cn("absolute left-1/2 -translate-x-1/2 text-center whitespace-nowrap transition-all duration-300", isOverlapping ? "top-11" : "top-7")}>
                                    <div className="text-[10px] font-bold text-amber-500 tracking-tight">CMP</div>
                                    <div className="text-[11px] font-bold text-slate-500 tabular-nums">{num(n.price).toLocaleString(undefined, { maximumFractionDigits: 1 })}</div>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className={cn(
                                    'absolute w-3 h-3 rounded-full border-2 left-1/2 -translate-x-1/2',
                                    n.variant === 'entry' ? 'top-1.5 w-4 h-4' : 'top-[6px]',
                                    dotCls[n.variant]
                                )} />
                                <div className={cn(
                                    'absolute left-1/2 -translate-x-1/2 text-center whitespace-nowrap',
                                    n.variant === 'entry' || n.variant === 'danger' ? 'top-7' : '-top-5'
                                )}>
                                    <div className={cn('text-[10px] font-bold tracking-tight', labelCls[n.variant])}>{n.label}</div>
                                    <div className="text-[11px] font-bold text-slate-500 tabular-nums">{num(n.price).toLocaleString(undefined, { maximumFractionDigits: 1 })}</div>
                                </div>
                            </>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── Main Export ───────────────────────────────────────────────────────────────

export function DailySignalStatus({
    symbol, cmp, entryPrice, strength, direction,
    targetPrice, stopLoss, tp1, tp2, tp3, status, className,
    hideHeader = false
}: DailySignalStatusProps) {
    const [pageData, setPageData] = useState<any>(null);
    const [liveInds, setLiveInds] = useState<any>(null);
    const [accumData, setAccumData] = useState<any>(null);
    const [fibData, setFibData] = useState<any>(null);
    const [brokers, setBrokers] = useState<any[]>([]);
    const [allTimeBrokers, setAllTimeBrokers] = useState<any[]>([]);
    const [history, setHistory] = useState<SignalHistory[]>([]);
    const [generatedSignals, setGeneratedSignals] = useState<GeneratedSignalEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('overview');

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const [detailRes, signalsRes, batchRes, accumRes, fibRes, genRes] = await Promise.all([
                    api.get(`/api/stocks/details/${symbol}/`),
                    api.get(`/api/stocks/signals/?symbol=${symbol}&page_size=10`),
                    api.get(`/api/stocks/batch-indicators/?symbols=${symbol}`),
                    api.get('/api/stocks/companies/accumulation/', { params: { range: '1W' } }),
                    api.get(`/api/stocks/fibonacci/${symbol}/`).catch(() => ({ data: null })),
                    api.get('/api/stocks/generated-signals/latest/').catch(() => ({ data: [] })),
                ]);
                setPageData(detailRes.data);
                setHistory(signalsRes.data?.results || []);
                setLiveInds(batchRes.data?.[symbol] || null);
                const accumList: any[] = accumRes.data || [];
                setAccumData(accumList.find(s => s.symbol === symbol) || null);
                setFibData(fibRes.data || null);
                const acc = detailRes.data?.fundamental?.broker_accumulation || {};
                setBrokers(acc['1M']?.filter((b: any) => b.type === 'BUY').slice(0, 2) || []);
                setAllTimeBrokers(acc['AT']?.filter((b: any) => b.type === 'BUY').slice(0, 2) || []);
                const allGen: any[] = genRes.data || [];
                setGeneratedSignals(allGen.filter((s: any) => s.symbol === symbol));
            } catch {
                /* silent */
            } finally {
                setLoading(false);
            }
        };
        if (symbol) fetchData();
    }, [symbol]);

    // Determine the most accurate CMP
    const liveCmp = num(liveInds?.ltp) || num(pageData?.price?.last_price) || num(pageData?.fundamental?.last_price) || cmp;

    // Live indicators from batch endpoint (fresh, calculated from recent price data)
    const rsi = liveInds?.rsi ?? 50;
    const macdh = liveInds?.macd_hist ?? 0;
    const roc14 = liveInds?.roc ?? 0;
    const t5d = liveInds?.trends?.['5d'] ?? 0;
    const t10d = liveInds?.trends?.['10d'] ?? 0;
    const t1m = liveInds?.trends?.['1m'] ?? 0;

    // SMAs + Pivot S&R from stored technical indicators
    const storedInds = pageData?.technical_indicators || [];
    const getStoredInd = (p: string) => storedInds.find((i: any) => i.name?.toUpperCase().includes(p.toUpperCase()));
    const safeParse = (v: any) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
    const sma50 = safeParse(getStoredInd('50-DAY SMA')?.raw_value ?? getStoredInd('50-DAY SMA')?.value);
    const sma200 = safeParse(getStoredInd('200-DAY SMA')?.raw_value ?? getStoredInd('200-DAY SMA')?.value);
    const atr = safeParse(getStoredInd('ATR')?.raw_value ?? getStoredInd('ATR')?.value);
    const adx = safeParse(getStoredInd('ADX')?.raw_value ?? getStoredInd('ADX')?.value);
    const vwap = safeParse(getStoredInd('VWAP')?.raw_value ?? getStoredInd('VWAP')?.value);
    const bbp = safeParse(getStoredInd('BOLLINGER')?.raw_value ?? getStoredInd('BB%B')?.raw_value);

    // Pivot points
    const pivotP = safeParse(getStoredInd('PIVOT (P)')?.raw_value ?? getStoredInd('PIVOT')?.raw_value);
    const pivotR1 = safeParse(getStoredInd('RESISTANCE 1')?.raw_value ?? getStoredInd('R1')?.raw_value);
    const pivotR2 = safeParse(getStoredInd('RESISTANCE 2')?.raw_value ?? getStoredInd('R2')?.raw_value);
    const pivotR3 = safeParse(getStoredInd('RESISTANCE 3')?.raw_value ?? getStoredInd('R3')?.raw_value);
    const pivotS1 = safeParse(getStoredInd('SUPPORT 1')?.raw_value ?? getStoredInd('S1')?.raw_value);
    const pivotS2 = safeParse(getStoredInd('SUPPORT 2')?.raw_value ?? getStoredInd('S2')?.raw_value);
    const pivotS3 = safeParse(getStoredInd('SUPPORT 3')?.raw_value ?? getStoredInd('S3')?.raw_value);

    const primaryTarget = targetPrice || (direction === 'BUY' ? entryPrice * 1.05 : entryPrice * 0.95);
    const primaryStop = stopLoss || (direction === 'BUY' ? entryPrice * 0.96 : entryPrice * 1.04);
    const finalTp1 = tp1 || primaryTarget;
    const finalTp2 = tp2 || primaryTarget * (direction === 'BUY' ? 1.05 : 0.95);
    const finalTp3 = tp3 || primaryTarget * (direction === 'BUY' ? 1.10 : 0.90);

    // Fundamentals from pageData
    const fund = pageData?.fundamental || {};
    const w52High = num(fund.fifty_two_week_high);
    const w52Low = num(fund.fifty_two_week_low);
    const peRatio = num(fund.pe_ratio_unaudited || fund.pe_ratio);
    const eps = num(fund.eps_unaudited || fund.eps);
    const bookVal = num(fund.book_value_unaudited || fund.book_value);
    const priceToBook = num(fund.price_to_book);
    const roe = num(fund.ro_equity);
    const divYield = num(fund.dividend_yield);
    const marketCap = num(fund.market_cap);
    const yoyGrowth = num(fund.yoy_earnings_growth);
    const qoqGrowth = num(fund.qoq_earnings_growth);
    const debtEquity = num(fund.debt_to_equity);
    const sector = fund.sector || pageData?.company?.sector || '';

    // Price data
    const priceData = pageData?.price || {};
    const volume = num(priceData.volume);
    const turnover = num(priceData.turnover);

    // Fundamental indicators with sector comparison
    const fundIndicators: any[] = fund.fundamental_indicators || [];

    const action = getActionability(entryPrice, cmp, direction);
    const change = entryPrice ? ((cmp - entryPrice) / entryPrice) * 100 : 0;
    const isBuy = direction === 'BUY';

    const statusLabel = status === 'WON' ? 'Target Hit' : status === 'LOST' ? 'Stopped Out' : action?.label || 'Monitoring';
    const statusCls = (status === 'WON' || action?.status === 'valid')
        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
        : (status === 'LOST' || action?.status === 'invalid')
            ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
            : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';

    const dayHigh = pageData?.fundamental?.day_high;
    const dayLow = pageData?.fundamental?.day_low;
    const companyName = pageData?.company?.name;

    const trends = [
        { label: '5D', val: t5d },
        { label: '10D', val: t10d },
        { label: '1M', val: t1m },
        { label: 'ROC', val: roc14 },
    ];

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-full bg-white dark:bg-card rounded-xl gap-3 border border-slate-200 dark:border-slate-800 shadow-sm">
                <StockLoader size="md" />
                <p className="text-xs text-slate-400 font-medium">Loading intelligence...</p>
            </div>
        );
    }

    return (
        <div className={cn(
            'flex flex-col h-full bg-white dark:bg-card overflow-hidden',
            !hideHeader && 'rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm',
            className
        )}>

            {/* ── Header ── */}
            {!hideHeader && (
                <div className={cn(
                    'shrink-0 px-7 pt-5 pb-4 border-b border-border dark:border-slate-800',
                    isBuy
                        ? 'bg-gradient-to-r from-emerald-50/60 to-white dark:from-emerald-950/20 dark:to-slate-900'
                        : 'bg-gradient-to-r from-rose-50/60 to-white dark:from-rose-950/20 dark:to-slate-900'
                )}>
                    <div className="flex items-center gap-8">
                        <div className="flex items-center gap-4">
                            {/* Direction icon */}
                            <div className={cn(
                                'w-11 h-11 rounded-2xl flex flex-col items-center justify-center border shrink-0',
                                isBuy
                                    ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800/40'
                                    : 'bg-rose-50 border-rose-200 dark:bg-rose-900/20 dark:border-rose-800/40'
                            )}>
                                {isBuy
                                    ? <TrendingUp size={16} className="text-emerald-600 dark:text-emerald-400" />
                                    : <TrendingDown size={16} className="text-rose-600 dark:text-rose-400" />
                                }
                                <span className={cn('text-[7px] font-bold tracking-tight', isBuy ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
                                    {direction}
                                </span>
                            </div>

                            <div>
                                <div className="flex items-center gap-2">
                                    <a
                                        href={`/ticker/${symbol}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 hover:opacity-75 transition-opacity flex items-center gap-1"
                                    >
                                        {symbol}
                                        <ExternalLink size={12} className="text-slate-400" />
                                    </a>
                                    <span className={cn('px-2 py-0.5 rounded-lg text-xs font-semibold', statusCls)}>
                                        {statusLabel}
                                    </span>
                                </div>
                                {companyName && (
                                    <p className="text-xs text-slate-400 truncate max-w-[180px] mt-0.5">{companyName}</p>
                                )}
                            </div>
                        </div>

                        {/* Indicators & price moved near symbol */}
                        <div className="flex items-center gap-8 border-l border-border dark:border-slate-800 pl-8">
                            {/* RSI / MACD */}
                            <div className="hidden sm:flex items-center gap-5">
                                <div className="text-center">
                                    <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 tracking-tight mb-0.5 uppercase flex items-center justify-center gap-1">
                                        RSI<InfoTooltip content="Relative Strength Index (14). Above 70 is overbought, below 30 is oversold." />
                                    </div>
                                    <div className={cn('text-sm font-bold tabular-nums',
                                        num(rsi) > 70 ? 'text-rose-500' : num(rsi) < 30 ? 'text-emerald-500' : 'text-slate-700 dark:text-slate-300'
                                    )}>{fixed(rsi, 1)}</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 tracking-tight mb-0.5 uppercase flex items-center justify-center gap-1">
                                        MACD<InfoTooltip content="Moving Average Convergence Divergence Histogram. Measures momentum direction and strength." />
                                    </div>
                                    <div className={cn('text-sm font-semibold tabular-nums', num(macdh) > 0 ? 'text-emerald-500' : 'text-rose-500')}>
                                        {num(macdh) > 0 ? '+' : ''}{fixed(macdh, 2)}
                                    </div>
                                </div>
                            </div>

                            <div className="border-l border-border dark:border-slate-800 pl-8">
                                <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 tracking-tight mb-0.5 uppercase flex items-center gap-1">
                                    Market price<InfoTooltip content="Current Market Price (CMP) and percentage change from the signal entry price." />
                                </div>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                                        Rs.{num(cmp).toLocaleString()}
                                    </span>
                                    <span className={cn('text-xs font-bold tabular-nums', num(change) > 0 ? 'text-emerald-500' : 'text-rose-500')}>
                                        {num(change) > 0 ? '+' : ''}{fixed(change, 2)}%
                                    </span>
                                </div>
                                <div className="text-[10px] font-bold text-slate-400 mt-0.5">
                                    Entry Rs.{num(entryPrice).toLocaleString()}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Price Ladder ── */}
            <div className="shrink-0 bg-slate-50/50 dark:bg-card border-b border-border dark:border-slate-800">
                <PriceLadder
                    sl={primaryStop} entry={entryPrice} cmp={liveCmp}
                    tp1={finalTp1} tp2={finalTp2} tp3={finalTp3}
                    direction={direction}
                />
            </div>

            {/* ── Tabs ── */}
            <div className="shrink-0 flex items-center gap-1 px-6 pt-2 border-b border-border dark:border-slate-800 bg-white dark:bg-card overflow-x-auto no-scrollbar">
                {[
                    { key: 'overview', label: 'Signal Engine', icon: <Activity className="w-3.5 h-3.5" /> },
                    { key: 'technicals', label: 'Technicals', icon: <Gauge className="w-3.5 h-3.5" /> },
                    { key: 'fundamentals', label: 'Fundamentals', icon: <Building2 className="w-3.5 h-3.5" /> },
                    { key: 'accumulators', label: 'Accumulators', icon: <Layers className="w-3.5 h-3.5" /> },
                ].map(tab => (
                    <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                        className={cn(
                            'flex items-center gap-2 px-4 py-2.5 text-xs font-bold tracking-tight border-b-2 transition-all whitespace-nowrap',
                            activeTab === tab.key
                                ? 'border-orange-500 text-orange-500'
                                : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                        )}>
                        {tab.icon}{tab.label}
                    </button>
                ))}
            </div>

            {/* ── Body: 3 columns ── */}
            {activeTab === 'overview' && (
                <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-slate-100 dark:divide-slate-800">

                {/* ── LEFT: Trade setup + technicals + brokers ── */}
                <div className="p-6 flex flex-col gap-4 overflow-y-auto no-scrollbar">

                    {/* Unified Market Context: Day & 52W Ranges */}
                    <div className="p-4 bg-slate-50/50 dark:bg-card rounded-2xl border border-border dark:border-slate-800/50">
                        <div className="flex items-center text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Price Context</div>
                        <div className="space-y-4">
                            {/* Day Range */}
                            {dayHigh && dayLow && (
                                <div>
                                    <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-tighter">
                                        <span>Day Range</span>
                                        <span className="text-amber-500 tabular-nums">Rs.{cmp.toLocaleString()}</span>
                                    </div>
                                    <div className="relative h-1 bg-slate-100 dark:bg-slate-800 rounded-full">
                                        <div className="absolute inset-y-0 bg-gradient-to-r from-rose-400/20 via-slate-400/20 to-emerald-400/20 rounded-full w-full" />
                                        <div
                                            className="absolute top-1/2 w-2.5 h-2.5 bg-amber-400 rounded-full shadow -translate-y-1/2 transition-all duration-700"
                                            style={{ left: `calc(${dayHigh !== dayLow ? Math.min(Math.max(((cmp - dayLow) / (dayHigh - dayLow)) * 100, 2), 98) : 50}% - 5px)` }}
                                        />
                                    </div>
                                    <div className="flex justify-between text-[9px] font-bold tabular-nums text-slate-400 mt-1 opacity-60">
                                        <span>L {dayLow.toLocaleString()}</span>
                                        <span>H {dayHigh.toLocaleString()}</span>
                                    </div>
                                </div>
                            )}

                            {/* 52W Range */}
                            {w52High > 0 && w52Low > 0 && (
                                <div>
                                    <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-tighter">
                                        <span>52W Low/High</span>
                                        <span className={cn('tabular-nums', cmp > (w52High + w52Low) / 2 ? 'text-emerald-500' : 'text-rose-500')}>
                                            {fixed(((cmp - w52Low) / (w52High - w52Low)) * 100, 0)}% from low
                                        </span>
                                    </div>
                                    <div className="relative h-1 bg-slate-100 dark:bg-slate-800 rounded-full">
                                        <div className="absolute inset-y-0 bg-gradient-to-r from-rose-400/20 via-slate-400/20 to-emerald-400/20 rounded-full w-full" />
                                        <div
                                            className="absolute top-1/2 w-2.5 h-2.5 bg-amber-500 rounded-full shadow -translate-y-1/2"
                                            style={{ left: `calc(${w52High !== w52Low ? Math.min(Math.max(((cmp - w52Low) / (w52High - w52Low)) * 100, 2), 98) : 50}% - 5px)` }}
                                        />
                                    </div>
                                    <div className="flex justify-between text-[9px] font-bold tabular-nums text-slate-400 mt-1 opacity-60">
                                        <span>L {w52Low.toLocaleString()}</span>
                                        <span>H {w52High.toLocaleString()}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Integrated Stats: Volume & Trends */}
                    <div className="grid grid-cols-2 gap-2">
                        <div className="p-3 bg-slate-50/50 dark:bg-card rounded-2xl border border-border dark:border-slate-800/50 flex flex-col justify-between">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Volume</div>
                            <div className="text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                                {volume >= 1000 ? `${fixed(volume / 1000, 1)}K` : volume.toLocaleString()}
                            </div>
                            <div className="text-[9px] text-slate-400 font-bold truncate">Rs.{turnover >= 10000000 ? `${fixed(turnover / 10000000, 1)}Cr` : turnover >= 100000 ? `${fixed(turnover / 100000, 1)}L` : turnover.toLocaleString()}</div>
                        </div>
                        <div className="p-3 bg-slate-50/50 dark:bg-card rounded-2xl border border-border dark:border-slate-800/50 flex flex-col justify-between">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Trends</div>
                            <div className="flex items-center gap-1.5 overflow-hidden">
                                {trends.slice(0, 2).map((t, idx) => (
                                    <div key={t.label} className={cn('px-1.5 py-0.5 rounded-md text-[9px] font-bold', num(t.val) > 0 ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400')}>
                                        {t.label} {num(t.val) > 0 ? '▲' : '▼'}
                                    </div>
                                ))}
                            </div>
                            <div className="text-[9px] text-slate-400 font-bold">{num(cmp) > num(sma50) ? 'Above 50 SMA' : 'Below 50 SMA'}</div>
                        </div>
                    </div>

                    {/* Momentum: RSI + MACD Grid */}
                    <div className="grid grid-cols-2 gap-2">
                        <div className="p-3 bg-slate-50/50 dark:bg-card rounded-2xl border border-border dark:border-slate-800/50">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">RSI</span>
                                <span className={cn('text-xs font-semibold tabular-nums', num(rsi) > 70 ? 'text-rose-500' : num(rsi) < 30 ? 'text-emerald-500' : 'text-slate-700 dark:text-slate-300')}>{fixed(rsi, 0)}</span>
                            </div>
                            <div className="h-1 bg-slate-100 dark:bg-slate-800 rounded-full relative">
                                <div className={cn('absolute h-full rounded-full', num(rsi) > 70 ? 'bg-rose-400' : num(rsi) < 30 ? 'bg-emerald-400' : 'bg-indigo-400')} style={{ width: `${num(rsi)}%` }} />
                            </div>
                        </div>
                        <div className="p-3 bg-slate-50/50 dark:bg-card rounded-2xl border border-border dark:border-slate-800/50">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">MACD</span>
                                <span className={cn('text-xs font-semibold tabular-nums', num(macdh) > 0 ? 'text-emerald-500' : 'text-rose-500')}>{fixed(macdh, 2)}</span>
                            </div>
                            <div className="flex gap-0.5 h-1 items-end">
                                {[...Array(8)].map((_, i) => (
                                    <div key={i} className={cn('flex-1 rounded-full', num(macdh) > 0 ? 'bg-emerald-400' : 'bg-rose-400')} style={{ height: `${20 + i * 10}%` }} />
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Broker / Smart Money Insight */}
                    {brokers.length > 0 && (
                        <div className="p-4 bg-indigo-50/30 dark:bg-indigo-950/10 rounded-2xl border border-indigo-100 dark:border-indigo-900/40">
                            <div className="flex items-center gap-1.5 mb-2.5">
                                <Briefcase size={10} className="text-indigo-500" />
                                <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">Broker Context</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    <div className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/50">
                                        #{brokers[0].broker}
                                    </div>
                                    <div>
                                        <div className="text-[11px] font-bold text-slate-700 dark:text-slate-200">Top Accumulator</div>
                                        <div className="text-[10px] text-slate-400 font-medium">Cost Rs.{num(brokers[0].wac).toLocaleString()}</div>
                                    </div>
                                </div>
                                <div className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-lg', num(cmp) > num(brokers[0].wac) ? 'text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'text-rose-500 bg-rose-50 dark:bg-rose-900/20')}>
                                    {num(cmp) > num(brokers[0].wac) ? '+' : ''}{fixed(((num(cmp) - num(brokers[0].wac)) / num(brokers[0].wac)) * 100, 1)}%
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Primary Advisory */}
                    <div className="mt-auto p-4 rounded-2xl bg-slate-900 dark:bg-slate-800/50 text-white">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-5 h-5 rounded-lg bg-amber-400 flex items-center justify-center text-slate-950">
                                <Zap size={10} strokeWidth={3} />
                            </div>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-white/60">Logic Engine</span>
                        </div>
                        <p className="text-[11px] font-medium leading-relaxed text-slate-300">
                            Signal gravity is {num(strength) > 60 ? 'strong' : 'neutral'}. 
                            Rs.{fixed(primaryStop, 0)} is the critical invalidation.
                            Trail stop as targets HIT.
                        </p>
                    </div>
                </div>

                {/* ── MIDDLE: Signal confluence + Strategy signals ── */}
                <div className="p-6 flex flex-col gap-5 overflow-y-auto no-scrollbar">

                    {/* Signal Confluence */}
                    {generatedSignals.length > 0 && (
                        <div className="p-4 rounded-2xl border border-border dark:border-slate-800 bg-white dark:bg-card">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <Target size={14} className="text-indigo-500" />
                                    <span className="flex items-center text-[11px] font-bold text-slate-400 tracking-wider uppercase">Signal Confluence<InfoTooltip content="Shows all signal engines that have a signal for this stock and whether they agree with the current direction. More agreement = higher conviction." /></span>
                                </div>
                                <span className={cn(
                                    'text-[10px] font-bold px-2 py-0.5 rounded-lg',
                                    generatedSignals.filter(s => s.signal === direction).length >= 2
                                        ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
                                        : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                )}>
                                    {generatedSignals.filter(s => s.signal === direction).length} / {generatedSignals.length} agree
                                </span>
                            </div>
                            <div className="space-y-1.5">
                                {generatedSignals.map((sig, i) => {
                                    const agrees = sig.signal === direction;
                                    return (
                                        <div key={i} className={cn(
                                            'flex items-center justify-between px-3 py-2 rounded-xl transition-all',
                                            agrees
                                                ? 'bg-emerald-50/50 dark:bg-emerald-950/10 border border-emerald-100 dark:border-emerald-900/30'
                                                : 'bg-slate-50/50 dark:bg-slate-800/30 border border-border dark:border-slate-800/50'
                                        )}>
                                            <div className="flex items-center gap-2 min-w-0">
                                                <div className={cn(
                                                    'w-1.5 h-1.5 rounded-full shrink-0',
                                                    agrees ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
                                                )} />
                                                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
                                                    {SOURCE_LABELS[sig.source] || sig.source}
                                                </span>
                                                {sig.signal_tier && (
                                                    <span className="text-[9px] text-slate-400 font-medium truncate hidden sm:inline">{sig.signal_tier}</span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <span className={cn(
                                                    'text-[10px] font-bold px-1.5 py-0.5 rounded',
                                                    sig.signal === 'BUY'
                                                        ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                                                        : 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400'
                                                )}>{sig.signal}</span>
                                                <div className="w-10 h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                                    <div className={cn('h-full rounded-full', agrees ? 'bg-emerald-400' : 'bg-slate-300 dark:bg-slate-600')}
                                                        style={{ width: `${Math.min(sig.strength, 100)}%` }} />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Signal Logic: Confluence + AI Justification */}
                    <div className="p-4 rounded-2xl bg-indigo-50/30 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <Brain size={14} className="text-indigo-500" />
                                <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">Logic Engine</span>
                            </div>
                            <div className="flex -space-x-1.5 overflow-hidden">
                                {generatedSignals.slice(0, 4).map((sig, i) => (
                                    <div key={i} className={cn(
                                        'w-5 h-5 rounded-full border-2 border-white dark:border-slate-900 flex items-center justify-center text-[8px] font-semibold',
                                        sig.signal === direction ? 'bg-emerald-400 text-white' : 'bg-slate-200 text-slate-500'
                                    )}>
                                        {sig.source[0]}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-4">
                            {/* Key Intelligence Tags */}
                            <div className="flex flex-wrap gap-1.5">
                                {num(strength) > 75 && (
                                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-indigo-500 text-white">HI-CONVICTION</span>
                                )}
                                {num(accumData?.accumulation_ratio) > 60 && (
                                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500 text-white">INSTITUTIONAL-BUY</span>
                                )}
                                {num(rsi) < 35 && direction === 'BUY' && (
                                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-white">OVERSOLD</span>
                                )}
                            </div>

                            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed font-semibold">
                                {direction === 'BUY' 
                                    ? `Buy signal anchored by ${num(accumData?.accumulation_ratio) > 55 ? 'surging institutional flow' : 'price-action breakout'}. ${num(rsi) < 45 ? 'Low RSI provides probability edge' : 'Momentum confirms follow-through'}.`
                                    : `Sell bias due to ${num(rsi) > 65 ? 'momentum exhaust' : 'price structural breakdown'}. ${num(accumData?.accumulation_ratio) < 45 ? 'Distribution mounting' : 'Watching support break'}.`
                                }
                            </p>
                        </div>
                    </div>

                    {/* Accumulation Pressure: Compact */}
                    {accumData && (
                        <div className="p-4 bg-slate-50/50 dark:bg-card rounded-2xl border border-border dark:border-slate-800/50">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Institutional Flow</span>
                                <span className={cn('text-[10px] font-semibold tabular-nums', num(accumData.net_qty) > 0 ? 'text-emerald-500' : 'text-rose-500')}>
                                    {num(accumData.net_qty) > 0 ? 'ACCUMULATING' : 'DISTRIBUTING'}
                                </span>
                            </div>
                            <div className="h-1.5 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800">
                                <div
                                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-700"
                                    style={{ width: `${fixed(accumData.accumulation_ratio, 0)}%` }}
                                />
                            </div>
                            <div className="flex justify-between mt-1 text-[9px] font-bold text-slate-400 uppercase">
                                <span>{fixed(accumData.accumulation_ratio, 0)}% Buy Pressure</span>
                                <span>{num(accumData.net_qty).toLocaleString()} Net Qty</span>
                            </div>
                        </div>
                    )}

                    {/* Targets: Horizontal UX */}
                    <div className="p-4 bg-slate-50/50 dark:bg-card rounded-2xl border border-border dark:border-slate-800/50">
                        <div className="flex items-center gap-1.5 mb-3">
                            <Target size={12} className="text-slate-400" />
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Trade Targets</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            {[
                                { label: 'T1', price: num(finalTp1), cls: 'bg-emerald-500', tcls: 'text-emerald-500' },
                                { label: 'T2', price: num(finalTp2), cls: 'bg-indigo-500', tcls: 'text-indigo-500' },
                                { label: 'T3', price: num(finalTp3), cls: 'bg-sky-500', tcls: 'text-sky-500' },
                            ].map((tp, i) => {
                                const ret = Math.abs(((tp.price - num(entryPrice)) / num(entryPrice)) * 100);
                                if (tp.price === 0) return null;
                                return (
                                    <div key={i} className="flex flex-col gap-1">
                                        <div className="flex items-center gap-1.5">
                                            <div className={cn('w-1.5 h-1.5 rounded-full', tp.cls)} />
                                            <span className="text-[10px] font-semibold text-slate-400 opacity-60">{tp.label}</span>
                                        </div>
                                        <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-100 tabular-nums">Rs.{tp.price.toLocaleString()}</div>
                                        <div className={cn('text-[9px] font-bold', tp.tcls)}>+{fixed(ret, 1)}%</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* ── RIGHT: Price Levels (Fibonacci + Pivot S&R + Volatility) ── */}
                <div className="p-6 flex flex-col gap-4 overflow-y-auto no-scrollbar">

                    {/* Fibonacci: Compact */}
                    {fibData ? (
                        <div className="p-4 bg-slate-50/50 dark:bg-card rounded-2xl border border-border dark:border-slate-800/50">
                            <div className="flex items-center justify-between mb-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                                <span>Fibonacci Levels</span>
                                <span className={cn('px-1.5 py-0.5 rounded', fibData.trend === 'UPTREND' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600')}>
                                    {fibData.trend}
                                </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 mb-3">
                                {num(fibData.nearest_support) > 0 && (
                                    <div className="p-2 bg-rose-50/30 dark:bg-rose-950/10 rounded-xl">
                                        <div className="text-[9px] text-rose-400 font-bold uppercase">Support</div>
                                        <div className="text-[11px] font-semibold tabular-nums text-rose-600 dark:text-rose-400">Rs.{num(fibData.nearest_support).toLocaleString()}</div>
                                    </div>
                                )}
                                {num(fibData.nearest_resistance) > 0 && (
                                    <div className="p-2 bg-emerald-50/30 dark:bg-emerald-950/10 rounded-xl">
                                        <div className="text-[9px] text-emerald-500 font-bold uppercase">Resistance</div>
                                        <div className="text-[11px] font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">Rs.{num(fibData.nearest_resistance).toLocaleString()}</div>
                                    </div>
                                )}
                            </div>
                        {/* Fib level rows */}
                        <div className="bg-transparent overflow-hidden border border-border dark:border-slate-800 rounded-2xl">
                            {(fibData.levels as any[] || []).map((lv: any, i: number) => {
                                const pctVal = lv.ratio != null ? num(lv.ratio) * 100 : null;
                                const isAbove = lv.is_above;
                                const dist = lv.distance_pct != null ? num(lv.distance_pct) : null;
                                return (
                                    <div key={i} className={cn(
                                        'flex items-center justify-between px-3 py-1.5 text-xs',
                                        i > 0 && 'border-t border-border dark:border-slate-800',
                                        !isAbove && 'bg-rose-50/30 dark:bg-rose-950/10'
                                    )}>
                                        <div className="flex items-center gap-2">
                                            <div className={cn('w-1.5 h-1.5 rounded-full', isAbove ? 'bg-emerald-400' : 'bg-rose-400')} />
                                            <span className="text-slate-400 font-medium">
                                                {pctVal != null ? `${fixed(pctVal, 1)}%` : '—'}
                                            </span>
                                        </div>
                                        <span className="font-bold tabular-nums text-slate-700 dark:text-slate-200">
                                            Rs.{num(lv.price).toLocaleString()}
                                        </span>
                                        {dist != null && (
                                            <span className={cn('tabular-nums font-semibold', isAbove ? 'text-emerald-500' : 'text-rose-500')}>
                                                {isAbove ? '+' : ''}{fixed(dist, 1)}%
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <div className="p-4 bg-slate-50/50 dark:bg-card rounded-2xl border border-border dark:border-slate-800/50 text-center">
                        <span className="text-xs text-slate-400 font-bold uppercase opacity-50">Fibonacci data unavailable</span>
                    </div>
                )}

                    {/* Pivot Points: Compact Row */}
                    {pivotP > 0 && (
                        <div className="p-4 bg-slate-50/50 dark:bg-card rounded-2xl border border-border dark:border-slate-800/50">
                            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Pivot Cluster</div>
                            <div className="flex gap-1">
                                {[
                                    { label: 'S1', val: num(pivotS1), color: 'bg-rose-400' },
                                    { label: 'P', val: num(pivotP), color: 'bg-amber-400' },
                                    { label: 'R1', val: num(pivotR1), color: 'bg-emerald-400' },
                                ].map(p => (
                                    <div key={p.label} className="flex-1 text-center p-1.5 rounded-xl bg-white dark:bg-card border border-border dark:border-slate-800/40">
                                        <div className={cn('text-[8px] font-semibold mb-0.5 uppercase opacity-60')}>{p.label}</div>
                                        <div className="text-[10px] font-semibold text-slate-700 dark:text-slate-200 tabular-nums">{num(p.val).toLocaleString()}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Volatility Grid */}
                    <div className="grid grid-cols-2 gap-2">
                        <div className="p-3 bg-slate-50/50 dark:bg-card rounded-2xl border border-border dark:border-slate-800/50">
                            <div className="text-[9px] font-semibold text-slate-400 uppercase tracking-tighter mb-1">ATR (14)</div>
                            <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 tabular-nums">{fixed(atr, 1)}</div>
                        </div>
                        <div className="p-3 bg-slate-50/50 dark:bg-card rounded-2xl border border-border dark:border-slate-800/50">
                            <div className="text-[9px] font-semibold text-slate-400 uppercase tracking-tighter mb-1">Trend Strength</div>
                            <div className={cn('text-xs font-semibold uppercase', num(adx) > 30 ? 'text-emerald-500' : 'text-slate-400')}>{num(adx) > 30 ? 'Strong' : 'Ranging'}</div>
                        </div>
                    </div>

                    {/* Moved History: Strategy signal sequence */}
                    <div className="flex-1 overflow-hidden flex flex-col pt-2">
                        <div className="flex items-center gap-1.5 mb-3 px-1">
                            <Clock size={11} className="text-slate-400" />
                            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Signal History</span>
                        </div>
                        <div className="flex-1 overflow-y-auto no-scrollbar space-y-2 pr-1">
                            {history.filter(h => h.signal === 'BUY' || h.signal === 'SELL').slice(0, 5).map((h, i) => (
                                <div key={i} className="p-3 bg-white dark:bg-card rounded-2xl border border-border dark:border-slate-800/50 flex items-center justify-between transition-colors hover:bg-slate-50/50">
                                    <div className="flex items-center gap-2.5">
                                        <div className={cn('w-6 h-6 rounded-lg flex items-center justify-center shrink-0', h.signal === 'BUY' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-500' : 'bg-rose-50 dark:bg-rose-900/20 text-rose-500')}>
                                            {h.signal === 'BUY' ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-[11px] font-bold text-slate-700 dark:text-slate-200 truncate">{h.strategy_name}</div>
                                            <div className="text-[9px] text-slate-400 font-medium tabular-nums">{h.date}</div>
                                        </div>
                                    </div>
                                    <div className="text-[10px] font-semibold tabular-nums text-slate-800 dark:text-slate-100">Rs.{num(h.last_close).toLocaleString()}</div>
                                </div>
                            ))}
                            {history.filter(h => h.signal === 'BUY' || h.signal === 'SELL').length === 0 && (
                                <div className="text-center py-4 text-[10px] font-bold text-slate-400 uppercase opacity-50">No History</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            )}
            
            {activeTab === 'technicals' && (() => {
                // Extract all stored indicators by name
                const ind = (name: string) => {
                    const match = storedInds.find((i: any) => i.name?.toUpperCase().includes(name.toUpperCase()));
                    return { val: safeParse(match?.raw_value ?? match?.value), display: match?.value || '—', sectorHigh: match?.sector_high, sectorLow: match?.sector_low, sectorHighTicker: match?.sector_high_ticker, sectorLowTicker: match?.sector_low_ticker };
                };

                const rsiVal = liveInds?.rsi ?? 50;
                const rocVal = liveInds?.roc ?? 0;
                const cci = ind('CCI');
                const willR = ind('WILLIAMS');
                const mfi = ind('MFI');
                const ultimateOsc = ind('ULTIMATE');
                const stD = ind('STOCHASTIC (%D)') || ind('%D');
                const stK = ind('STOCHASTIC') || ind('%K');
                const aroonUp = ind('AROON UP') || ind('AROONUP');
                const aroonDown = ind('AROON DOWN') || ind('AROONDOWN');
                const ichimokuBase = ind('ICHIMOKU');
                const psar = ind('PSAR');
                const cmf = ind('CMF');
                const obv = ind('OBV');
                const keltnerUpper = ind('KELTNER');
                const donchianUpper = ind('DONCHIAN');
                const vwapVal = ind('VWAP').val;
                const macdVal = num(liveInds?.macd);
                const macdSig = num(liveInds?.macd_signal);
                const macdCrossover = macdVal > macdSig ? 'bullish' : macdVal < macdSig ? 'bearish' : 'neutral';

                // Aggregate scoring
                type Rating = 'bullish' | 'bearish' | 'neutral';
                const signals: { name: string; rating: Rating }[] = [
                    { name: 'RSI', rating: num(rsiVal) < 30 ? 'bullish' : num(rsiVal) > 70 ? 'bearish' : 'neutral' },
                    { name: 'MACD', rating: macdCrossover as Rating },
                    { name: 'Stochastic', rating: stK.val < 20 ? 'bullish' : stK.val > 80 ? 'bearish' : 'neutral' },
                    { name: 'CCI', rating: cci.val < -100 ? 'bullish' : cci.val > 100 ? 'bearish' : 'neutral' },
                    { name: 'Williams %R', rating: willR.val < -80 ? 'bullish' : willR.val > -20 ? 'bearish' : 'neutral' },
                    { name: 'MFI', rating: mfi.val < 20 ? 'bullish' : mfi.val > 80 ? 'bearish' : 'neutral' },
                    { name: 'ROC', rating: num(rocVal) > 2 ? 'bullish' : num(rocVal) < -2 ? 'bearish' : 'neutral' },
                    { name: 'ADX', rating: num(adx) > 25 && num(t5d) > 0 ? 'bullish' : num(adx) > 25 && num(t5d) < 0 ? 'bearish' : 'neutral' },
                    { name: 'SMA 50/200', rating: num(cmp) > num(sma50) && num(sma50) > num(sma200) ? 'bullish' : num(cmp) < num(sma50) && num(sma50) < num(sma200) ? 'bearish' : 'neutral' },
                    { name: 'CMF', rating: cmf.val > 0.05 ? 'bullish' : cmf.val < -0.05 ? 'bearish' : 'neutral' },
                ];
                const bullCount = signals.filter(s => s.rating === 'bullish').length;
                const bearCount = signals.filter(s => s.rating === 'bearish').length;
                const totalRated = signals.length;
                const overallRating = bullCount > bearCount + 2 ? 'Strong Buy' : bullCount > bearCount ? 'Buy' : bearCount > bullCount + 2 ? 'Strong Sell' : bearCount > bullCount ? 'Sell' : 'Neutral';
                const ratingColor = overallRating.includes('Buy') ? 'text-emerald-500' : overallRating.includes('Sell') ? 'text-rose-500' : 'text-slate-400';

                // Gauge component for oscillators
                const OscGauge = ({ label, value, min, max, oversold, overbought, invert, tooltip }: { label: string; value: number; min: number; max: number; oversold: number; overbought: number; invert?: boolean; tooltip?: string }) => {
                    if (value === 0 && label !== 'CMF') return null;
                    const range = max - min;
                    const pct = range > 0 ? Math.min(Math.max(((value - min) / range) * 100, 2), 98) : 50;
                    const isOS = invert ? value > overbought : value < oversold;
                    const isOB = invert ? value < oversold : value > overbought;
                    return (
                        <div className="p-3 bg-white dark:bg-card rounded-2xl border border-border dark:border-slate-800/60">
                            <div className="flex items-center justify-between mb-2">
                                <span className="flex items-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}{tooltip && <InfoTooltip content={tooltip} />}</span>
                                <span className={cn('text-xs font-semibold tabular-nums',
                                    isOS ? 'text-emerald-500' : isOB ? 'text-rose-500' : 'text-slate-700 dark:text-slate-200'
                                )}>{typeof value === 'number' ? fixed(value, 1) : value}</span>
                            </div>
                            <div className="relative h-1.5 bg-gradient-to-r from-emerald-200 via-slate-100 to-rose-200 dark:from-emerald-900/40 dark:via-slate-700 dark:to-rose-900/40 rounded-full overflow-visible">
                                <div className={cn(
                                    'absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white dark:border-slate-800 shadow',
                                    isOS ? 'bg-emerald-500' : isOB ? 'bg-rose-500' : 'bg-slate-500 dark:bg-slate-300'
                                )} style={{ left: `calc(${pct}% - 6px)` }} />
                            </div>
                            <div className="flex justify-between mt-1.5 text-[9px] font-bold text-slate-300 dark:text-slate-600">
                                <span>{invert ? 'OB' : 'OS'}</span>
                                <span className={cn('text-[10px]',
                                    isOS ? 'text-emerald-500' : isOB ? 'text-rose-500' : 'text-slate-400'
                                )}>{isOS ? 'Oversold' : isOB ? 'Overbought' : 'Neutral'}</span>
                                <span>{invert ? 'OS' : 'OB'}</span>
                            </div>
                        </div>
                    );
                };

                return (
                    <div className="flex-1 min-h-0 overflow-y-auto p-4 bg-slate-50/10 dark:bg-slate-950/20 no-scrollbar">
                        <div className="max-w-5xl mx-auto space-y-4">
                            {/* Row 1: Rating Hero + Momentum Cluster */}
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                                {/* Hero: Technical Rating (4 cols) */}
                                <div className="lg:col-span-4 bg-white dark:bg-card rounded-xl border border-border dark:border-slate-800/60 p-5 flex flex-col justify-between">
                                    <div className="mb-4">
                                        <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Technical Bias</div>
                                        <div className={cn('text-3xl font-semibold tracking-tighter', ratingColor)}>{overallRating}</div>
                                        <div className="text-[11px] font-bold text-slate-400 mt-1 opacity-70">Aggregate of {totalRated} Indicators</div>
                                    </div>
                                    <div className="space-y-3">
                                        <div className="flex h-1.5 rounded-full overflow-hidden gap-0.5">
                                            <div className="bg-emerald-500 rounded-full transition-all" style={{ width: `${(bullCount / totalRated) * 100}%` }} />
                                            <div className="bg-slate-200 dark:bg-slate-700 rounded-full transition-all" style={{ width: `${((totalRated - bullCount - bearCount) / totalRated) * 100}%` }} />
                                            <div className="bg-rose-500 rounded-full transition-all" style={{ width: `${(bearCount / totalRated) * 100}%` }} />
                                        </div>
                                        <div className="flex justify-between items-end">
                                            <div className="flex items-center gap-3">
                                                <div className="text-center">
                                                    <div className="text-[14px] font-semibold text-emerald-500">{bullCount}</div>
                                                    <div className="text-[8px] font-semibold text-slate-400 uppercase">Buy</div>
                                                </div>
                                                <div className="text-center">
                                                    <div className="text-[14px] font-semibold text-slate-400">{totalRated - bullCount - bearCount}</div>
                                                    <div className="text-[8px] font-semibold text-slate-400 uppercase">Neu</div>
                                                </div>
                                                <div className="text-center">
                                                    <div className="text-[14px] font-semibold text-rose-500">{bearCount}</div>
                                                    <div className="text-[8px] font-semibold text-slate-400 uppercase">Sell</div>
                                                </div>
                                            </div>
                                            <div className={cn('px-2 py-1 rounded-xl text-[10px] font-semibold border uppercase',
                                                overallRating.includes('Buy') ? 'bg-emerald-50/50 text-emerald-600 border-emerald-100' : 
                                                overallRating.includes('Sell') ? 'bg-rose-50/50 text-rose-500 border-rose-100' : 
                                                'bg-slate-50 text-slate-400 border-border'
                                            )}>{overallRating.includes('Strong') ? 'High Conviction' : 'Avg Conviction'}</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Momentum: Oscillators Grid (8 cols) */}
                                <div className="lg:col-span-8 bg-white dark:bg-card rounded-xl border border-border dark:border-slate-800/60 p-5">
                                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-4">Momentum Oscillators</div>
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                        <OscGauge label="RSI" value={num(rsiVal)} min={0} max={100} oversold={30} overbought={70} />
                                        <OscGauge label="Stoch %K" value={stK.val} min={0} max={100} oversold={20} overbought={80} />
                                        <OscGauge label="CCI" value={cci.val} min={-200} max={200} oversold={-100} overbought={100} />
                                        <OscGauge label="MFI" value={mfi.val} min={0} max={100} oversold={20} overbought={80} />
                                        <OscGauge label="Williams %R" value={willR.val} min={-100} max={0} oversold={-80} overbought={-20} invert />
                                        {ultimateOsc.val > 0 && <OscGauge label="Ultimate" value={ultimateOsc.val} min={0} max={100} oversold={30} overbought={70} />}
                                        <div className="p-3 bg-slate-50/50 dark:bg-slate-800/40 rounded-2xl flex flex-col justify-center border border-border dark:border-slate-800/50">
                                            <div className="text-[9px] font-semibold text-slate-400 uppercase mb-1">ROC (14)</div>
                                            <div className={cn('text-sm font-semibold tabular-nums', num(rocVal) > 0 ? 'text-emerald-500' : 'text-rose-500')}>{num(rocVal) > 0 ? '+' : ''}{fixed(rocVal, 1)}%</div>
                                        </div>
                                        <div className="p-3 bg-slate-50/50 dark:bg-slate-800/40 rounded-2xl flex flex-col justify-center border border-border dark:border-slate-800/50">
                                            <div className="text-[9px] font-semibold text-slate-400 uppercase mb-1">Stoch %D</div>
                                            <div className="text-sm font-semibold tabular-nums text-slate-700 dark:text-slate-200">{fixed(stD.val, 1)}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Row 2: Trend Engine + Volume Flow + Volatility */}
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                {/* Trend Intelligence */}
                                <div className="bg-white dark:bg-card rounded-xl border border-border dark:border-slate-800/60 p-5">
                                    <div className="flex items-center justify-between mb-4">
                                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Trend Intelligence</span>
                                        <div className={cn('text-[9px] font-semibold px-1.5 py-0.5 rounded-lg border uppercase',
                                            macdCrossover === 'bullish' ? 'bg-emerald-50/50 text-emerald-600 border-emerald-100' : 'bg-rose-50/50 text-rose-500 border-rose-100'
                                        )}>MACD: {macdCrossover}</div>
                                    </div>
                                    <div className="space-y-3">
                                        {/* MACD High Density */}
                                        <div className="p-3 bg-slate-50/50 dark:bg-slate-800/40 rounded-2xl border border-border dark:border-slate-800/50">
                                            <div className="grid grid-cols-3 divide-x divide-slate-200 dark:divide-slate-700">
                                                <div className="px-2">
                                                    <div className="text-[8px] font-semibold text-slate-400 uppercase mb-1">MACD</div>
                                                    <div className={cn('text-[11px] font-semibold tabular-nums', macdVal > 0 ? 'text-emerald-500' : 'text-rose-500')}>{fixed(macdVal, 2)}</div>
                                                </div>
                                                <div className="px-2">
                                                    <div className="text-[8px] font-semibold text-slate-400 uppercase mb-1">Signal</div>
                                                    <div className="text-[11px] font-semibold tabular-nums text-slate-700 dark:text-slate-200">{fixed(macdSig, 2)}</div>
                                                </div>
                                                <div className="px-2">
                                                    <div className="text-[8px] font-semibold text-slate-400 uppercase mb-1">Hist</div>
                                                    <div className={cn('text-[11px] font-semibold tabular-nums', num(macdh) > 0 ? 'text-emerald-500' : 'text-rose-500')}>{fixed(macdh, 2)}</div>
                                                </div>
                                            </div>
                                        </div>
                                        {/* ADX + PSAR + Ichimoku mini rows */}
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between px-1">
                                                <span className="text-[10px] font-bold text-slate-500">ADX Strength</span>
                                                <span className={cn('text-[10px] font-semibold tabular-nums', num(adx) > 25 ? 'text-emerald-500' : 'text-slate-400')}>{fixed(adx, 1)} ({num(adx) > 25 ? 'Strong' : 'Weak'})</span>
                                            </div>
                                            <div className="flex items-center justify-between px-1">
                                                <span className="text-[10px] font-bold text-slate-500">SMA Structure</span>
                                                <span className={cn('text-[10px] font-semibold uppercase', num(sma50) > num(sma200) ? 'text-emerald-500' : 'text-rose-500')}>{num(sma50) > num(sma200) ? 'Golden Cross' : 'Death Cross'}</span>
                                            </div>
                                            {psar.val > 0 && (
                                                <div className="flex items-center justify-between px-1">
                                                    <span className="text-[10px] font-bold text-slate-500">Parabolic SAR</span>
                                                    <span className={cn('text-[10px] font-semibold uppercase', num(cmp) > psar.val ? 'text-emerald-500' : 'text-rose-500')}>{num(cmp) > psar.val ? 'Bullish' : 'Bearish'}</span>
                                                </div>
                                            )}
                                            {aroonUp.val > 0 && (
                                                <div className="flex items-center justify-between px-1">
                                                    <span className="text-[10px] font-bold text-slate-500">Aroon Bias</span>
                                                    <span className={cn('text-[10px] font-semibold uppercase', aroonUp.val > aroonDown.val ? 'text-emerald-500' : 'text-rose-500')}>{aroonUp.val > aroonDown.val ? 'Bullish' : 'Bearish'}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Volume Pressure */}
                                <div className="bg-white dark:bg-card rounded-xl border border-border dark:border-slate-800/60 p-5">
                                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-4">Volume Pressure</div>
                                    <div className="space-y-4">
                                        <div className="p-4 bg-slate-50/50 dark:bg-slate-800/40 rounded-2xl border border-border dark:border-slate-800/50">
                                            <div className="text-[9px] font-semibold text-slate-400 uppercase mb-2">Chaikin Money Flow (CMF)</div>
                                            <div className={cn('text-2xl font-semibold tabular-nums', cmf.val > 0 ? 'text-emerald-500' : 'text-rose-500')}>{cmf.val > 0 ? '+' : ''}{fixed(cmf.val, 3)}</div>
                                            <div className="h-1.5 mt-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                                <div className={cn('h-full transition-all', cmf.val > 0 ? 'bg-emerald-500' : 'bg-rose-500')} style={{ width: `${Math.min(Math.abs(cmf.val) * 200, 100)}%` }} />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="p-3 bg-slate-50/50 dark:bg-slate-800/40 rounded-2xl border border-border dark:border-slate-800/50">
                                                <div className="text-[9px] font-semibold text-slate-400 uppercase mb-1 text-center">OBV Dir</div>
                                                <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 text-center uppercase tabular-nums">
                                                    {obv.val >= 1000000 ? `${fixed(obv.val/1000000, 1)}M` : `${fixed(obv.val/1000, 0)}K`}
                                                </div>
                                            </div>
                                            <div className="p-3 bg-slate-50/50 dark:bg-slate-800/40 rounded-2xl border border-border dark:border-slate-800/50">
                                                <div className="text-[9px] font-semibold text-slate-400 uppercase mb-1 text-center">VWAP Dist</div>
                                                <div className={cn('text-xs font-semibold text-center tabular-nums', num(cmp) > num(vwapVal) ? 'text-emerald-500' : 'text-rose-500')}>
                                                    {num(cmp) > num(vwapVal) ? '+' : ''}{fixed(num(vwapVal) > 0 ? ((num(cmp)-num(vwapVal))/num(vwapVal))*100 : 0, 2)}%
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Volatility & Channels */}
                                <div className="bg-white dark:bg-card rounded-xl border border-border dark:border-slate-800/60 p-5">
                                    <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-4">Volatility & Channels</div>
                                    <div className="space-y-3">
                                        <div className="p-4 bg-slate-50/50 dark:bg-slate-800/40 rounded-2xl border border-border dark:border-slate-800/50">
                                            <div className="text-[9px] font-semibold text-slate-400 uppercase mb-1 text-center">ATR (14) Volatility</div>
                                            <div className="text-2xl font-semibold text-slate-800 dark:text-slate-100 text-center tabular-nums">Rs.{fixed(atr, 1)}</div>
                                            <div className="text-[10px] text-center font-bold text-slate-400 mt-0.5">{fixed((num(atr)/num(cmp))*100, 1)}% Daily Range</div>
                                        </div>
                                        <div className="p-3 bg-slate-50/50 dark:bg-slate-800/40 rounded-2xl border border-border dark:border-slate-800/50">
                                            <div className="text-[9px] font-semibold text-slate-400 uppercase mb-2">Bollinger Position (%B)</div>
                                            <div className="relative h-2 bg-gradient-to-r from-rose-200 via-slate-100 to-emerald-200 dark:from-rose-900/40 dark:via-slate-700 dark:to-rose-900/40 rounded-full overflow-visible">
                                                <div className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white dark:bg-slate-200 rounded-full border-2 border-indigo-500 shadow-lg"
                                                    style={{ left: `calc(${Math.min(Math.max(num(bbp) * 100, 2), 97)}% - 8px)` }} />
                                            </div>
                                            <div className="flex justify-between mt-2 text-[10px] font-semibold tabular-nums text-slate-500">
                                                <span>LB</span>
                                                <span className="text-indigo-500">{fixed(num(bbp) * 100, 1)}%</span>
                                                <span>UB</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {activeTab === 'fundamentals' && (
                <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 bg-slate-50/10 dark:bg-slate-950/20 no-scrollbar">
                    <div className="space-y-6 pb-12">
                        
                        {/* ── Intelligence Hero: Health Diagnosis ── */}
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                            <div className="md:col-span-8 p-6 rounded-2xl bg-indigo-600 dark:bg-indigo-500 text-white relative overflow-hidden shadow-sm shadow-indigo-200/50 dark:shadow-none">
                                <div className="relative z-10">
                                    <div className="flex items-center gap-2 mb-6 opacity-80">
                                        <Sparkles size={14} fill="currentColor" />
                                        <span className="text-[10px] font-semibold uppercase tracking-[0.2em]">Fundamental Intelligence</span>
                                    </div>
                                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                                        <div>
                                            <h2 className="text-3xl font-semibold tracking-tighter mb-2">
                                                {peRatio > 0 && peRatio < 30 ? 'Quality Value' : peRatio > 30 ? 'Growth Premium' : (eps > 0 ? 'Stable Core' : 'Neutral Outlook')}
                                            </h2>
                                            <div className="flex items-center gap-4 mb-3">
                                                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/20">
                                                    <TrendingUp size={10} className="text-emerald-400" />
                                                    <span className="text-[10px] font-semibold uppercase tracking-tight">ROE: {fixed(roe, 1)}%</span>
                                                </div>
                                                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/20">
                                                    <Shield size={10} className="text-sky-400" />
                                                    <span className="text-[10px] font-semibold uppercase tracking-tight">D/E: {fixed(debtEquity, 1)}</span>
                                                </div>
                                            </div>
                                            <p className="text-[13px] font-medium text-white/75 max-w-lg leading-relaxed">
                                                {symbol} presents a <span className="text-white font-bold">{peRatio < 20 ? 'value-oriented' : 'growth-centric'}</span> profile. 
                                                With a {roe > 15 ? 'top-tier' : 'stable'} return on equity of {fixed(roe, 1)}% and {debtEquity < 1.2 ? 'conservative' : 'managed'} debt, the fundamental core is {eps > 0 ? 'highly resilient' : 'under evaluation'}. 
                                                Benchmark comparison suggests {peRatio < 15 ? 'significant undervaluation' : 'fair market pricing'} relative to its {sector} peers.
                                            </p>
                                        </div>
                                        <div className="flex gap-4">
                                            <div className="px-5 py-3 rounded-[1.5rem] bg-white text-indigo-600 shadow-xl shadow-indigo-700/20">
                                                <div className="text-[9px] font-semibold uppercase opacity-60 mb-0.5 whitespace-nowrap tracking-wide">Strategic Verdict</div>
                                                <div className="text-xl font-semibold">{peRatio > 0 && roe > 12 ? 'ACCUMULATE' : 'MONITOR'}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
                            </div>

                            <div className="md:col-span-4 p-6 rounded-2xl bg-white dark:bg-card border border-border dark:border-slate-800 flex flex-col justify-between">
                                <div className="flex items-center justify-between mb-4">
                                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Financial Health</span>
                                    <Shield size={14} className="text-emerald-500" />
                                </div>
                                <div className="flex-1 flex flex-col justify-center items-center py-4">
                                    <div className="relative w-24 h-24">
                                        <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                                            <path className="stroke-slate-100 dark:stroke-slate-800" strokeWidth="3" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                                            <path className="stroke-emerald-500 transition-all duration-1000" strokeWidth="3" strokeDasharray={`${Math.min(100, (roe + (peRatio < 25 ? 20 : 0) + (debtEquity < 1 ? 20 : 0))), 100}, 100`} strokeLinecap="round" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                                        </svg>
                                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                                            <span className="text-2xl font-semibold text-slate-800 dark:text-slate-100">{fixed(Math.min(100, (roe + (peRatio < 25 ? 20 : 0) + (debtEquity < 1 ? 20 : 0))), 0)}</span>
                                            <span className="text-[8px] font-semibold text-slate-400 uppercase">Score</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="text-center text-[10px] font-bold text-slate-400">Based on 12 fundamental check-points</div>
                            </div>
                        </div>

                        {/* ── Intelligence Cards: Categorized Metrics ── */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            
                            {/* Card 1: Valuation Intelligence */}
                            <div className="bg-white dark:bg-card rounded-2xl border border-border dark:border-slate-800/60 overflow-hidden">
                                <div className="p-6 border-b border-border dark:border-slate-800">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Building2 size={14} className="text-indigo-500" />
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-800 dark:text-slate-100">Valuation Matrix</h3>
                                    </div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Market pricing intelligence</p>
                                </div>
                                <div className="p-4 space-y-3">
                                    {[
                                        { label: 'P/E Ratio', val: peRatio > 0 ? `${fixed(peRatio, 1)}x` : '—', sub: peRatio < 25 ? 'Fairly Valued' : 'Premium', cls: peRatio < 25 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500' },
                                        { label: 'P/B Ratio', val: priceToBook > 0 ? `${fixed(priceToBook, 1)}x` : '—', sub: 'Price/Book', cls: 'bg-slate-50 text-slate-600' },
                                        { label: 'EPS (TTM)', val: eps > 0 ? `Rs.${fixed(eps, 1)}` : '—', sub: 'Earnings Power', cls: 'bg-slate-50 text-slate-600' },
                                        { label: 'Avg Dividend', val: divYield > 0 ? `${fixed(divYield, 1)}%` : '—', sub: 'Yield to Price', cls: 'bg-slate-50 text-slate-600' },
                                    ].map(item => (
                                        <div key={item.label} className="flex items-center justify-between p-3 rounded-2xl bg-slate-50/50 dark:bg-slate-800/30 border border-border/50 dark:border-slate-800/50">
                                            <div>
                                                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-tight">{item.label}</div>
                                                <div className="text-[9px] font-bold opacity-60">{item.sub}</div>
                                            </div>
                                            <div className={cn('px-2.5 py-1 rounded-xl text-xs font-semibold tabular-nums', item.cls)}>{item.val}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Card 2: Strategic Efficiency */}
                            <div className="bg-white dark:bg-card rounded-2xl border border-border dark:border-slate-800/60 overflow-hidden">
                                <div className="p-6 border-b border-border dark:border-slate-800">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Zap size={14} className="text-amber-500" />
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-800 dark:text-slate-100">Efficiency Hub</h3>
                                    </div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Operational competency</p>
                                </div>
                                <div className="p-4 space-y-3">
                                    {[
                                        { label: 'ROE', val: roe > 0 ? `${fixed(roe, 1)}%` : '—', sub: roe > 15 ? 'High Efficiency' : 'Stable', cls: roe > 15 ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-600' },
                                        { label: 'Debt to Equity', val: debtEquity > 0 ? fixed(debtEquity, 2) : '—', sub: debtEquity < 1.5 ? 'Conservative' : 'Leveraged', cls: debtEquity < 1.5 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500' },
                                        { label: 'YoY Growth', val: yoyGrowth !== 0 ? `${yoyGrowth > 0 ? '+' : ''}${fixed(yoyGrowth, 1)}%` : '—', sub: 'Earnings Momentum', cls: yoyGrowth > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500' },
                                        { label: 'QoQ Growth', val: qoqGrowth !== 0 ? `${qoqGrowth > 0 ? '+' : ''}${fixed(qoqGrowth, 1)}%` : '—', sub: 'Quarterly Speed', cls: qoqGrowth > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500' },
                                    ].map(item => (
                                        <div key={item.label} className="flex items-center justify-between p-3 rounded-2xl bg-slate-50/50 dark:bg-slate-800/30 border border-border/50 dark:border-slate-800/50">
                                            <div>
                                                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-tight">{item.label}</div>
                                                <div className="text-[9px] font-bold opacity-60">{item.sub}</div>
                                            </div>
                                            <div className={cn('px-2.5 py-1 rounded-xl text-xs font-semibold tabular-nums', item.cls)}>{item.val}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Card 3: Sector & Health Diagnostic */}
                            <div className="flex flex-col gap-6">
                                {/* Sector Progress */}
                                <div className="flex-1 bg-white dark:bg-card rounded-2xl border border-border dark:border-slate-800/60 p-6">
                                    <div className="flex items-center gap-2 mb-4">
                                        <BarChart3 size={14} className="text-indigo-500" />
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-800 dark:text-slate-100">Market Benchmarking</h3>
                                    </div>
                                    <div className="space-y-4">
                                        {fundIndicators.length > 0 ? fundIndicators.slice(0, 3).map((ind: any, i: number) => {
                                            const val = num(ind.value);
                                            const sHigh = num(ind.sector_high);
                                            const sLow = num(ind.sector_low);
                                            const range = sHigh - sLow || 1;
                                            const pct = Math.min(Math.max(((val - sLow) / range) * 100, 2), 98);
                                            return (
                                                <div key={i}>
                                                    <div className="flex items-center justify-between mb-1.5 px-0.5">
                                                        <span className="text-[9px] font-semibold text-slate-400 uppercase">{ind.name}</span>
                                                        <span className="text-[10px] font-semibold tabular-nums text-indigo-500">{ind.value}</span>
                                                    </div>
                                                    <div className="relative h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                                        <div className="absolute top-0 bottom-0 left-0 bg-indigo-500/20" style={{ width: `${pct}%` }} />
                                                        <div className="absolute top-0 bottom-0 w-1 bg-indigo-500" style={{ left: `${pct}%` }} />
                                                    </div>
                                                </div>
                                            );
                                        }) : (
                                            <div className="py-6 text-center">
                                                <div className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider">Sector Benchmarking Unavailable</div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Health Checks */}
                                <div className="bg-slate-900 rounded-2xl p-6 text-white overflow-hidden relative">
                                    <div className="flex items-center gap-2 mb-4 relative z-10">
                                        <Shield size={14} className="text-emerald-400" />
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-white/60">Risk Audit</h3>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3 relative z-10">
                                        {[
                                            { label: 'Debt', pass: debtEquity < 1.5, val: debtEquity > 0 ? 'SAFE' : 'N/A' },
                                            { label: 'Payout', pass: divYield > 0, val: divYield > 0 ? 'PAYING' : 'N/A' },
                                            { label: 'Equity', pass: roe > 10, val: roe > 10 ? 'GOOD' : 'LOW' },
                                            { label: 'Growth', pass: yoyGrowth > 0, val: yoyGrowth > 0 ? 'EXPAND' : 'STAG' },
                                        ].map(check => (
                                            <div key={check.label} className="p-3 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-between">
                                                <span className="text-[9px] font-semibold opacity-50 uppercase">{check.label}</span>
                                                <span className={cn('text-[10px] font-semibold', check.pass ? 'text-emerald-400' : 'text-rose-400')}>{check.val}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="absolute bottom-0 right-0 translate-y-1/2 translate-x-1/2 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'accumulators' && (
                <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 bg-slate-50/30 dark:bg-slate-950/20">
                    <TickerAccumulation symbol={symbol} />
                </div>
            )}
        </div>
    );
}
