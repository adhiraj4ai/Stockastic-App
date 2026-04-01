'use client';

import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import {
    Zap, TrendingUp, TrendingDown,
    Activity, ArrowUpRight, ArrowDownRight,
    Briefcase, ExternalLink, Clock
} from 'lucide-react';
import api from '@/lib/api';
import { StockLoader } from '@/components/ui/StockLoader';

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

const getActionability = (entryPrice: number, cmp?: number, direction?: string) => {
    if (!cmp || direction === 'HOLD' || direction === 'NEUTRAL') return null;
    const ch = ((cmp - entryPrice) / entryPrice) * 100;
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

function PriceLadder({ sl, entry, cmp, tp1, tp2, tp3 }: {
    sl: number; entry: number; cmp: number; tp1: number; tp2: number; tp3: number;
}) {
    const pts = [sl, entry, cmp, tp1, tp2, tp3];
    const min = Math.min(...pts);
    const max = Math.max(...pts);
    const range = max - min || 1;
    const pct = (v: number) => ((v - min) / range) * 100;

    const nodes: { price: number; label: string; variant: 'danger' | 'entry' | 'live' | 'tp' | 'tp-hi' }[] = [
        { price: sl, label: 'SL', variant: 'danger' },
        { price: entry, label: 'Entry', variant: 'entry' },
        { price: cmp, label: 'CMP', variant: 'live' },
        { price: tp1, label: 'TP1', variant: 'tp' },
        { price: tp2, label: 'TP2', variant: 'tp' },
        { price: tp3, label: 'TP3', variant: 'tp-hi' },
    ];

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
                <div className="absolute h-0.5 bg-rose-200 dark:bg-rose-900/50 rounded-full top-3"
                    style={{ left: `${Math.min(pct(sl), pct(entry))}%`, width: `${Math.abs(pct(entry) - pct(sl))}%` }} />
                {/* Profit fill */}
                <div className="absolute h-0.5 bg-emerald-200 dark:bg-emerald-900/50 rounded-full top-3"
                    style={{ left: `${pct(entry)}%`, width: `${pct(tp3) - pct(entry)}%` }} />

                {nodes.map((n) => (
                    <div key={n.label} className="absolute -translate-x-1/2" style={{ left: `${pct(n.price)}%` }}>
                        {n.variant === 'live' ? (
                            <>
                                <div className="absolute top-0 left-1/2 -translate-x-1/2">
                                    <span className="absolute inset-0 w-5 h-5 rounded-full bg-amber-400 animate-ping opacity-40" />
                                    <span className="relative block w-5 h-5 rounded-full bg-amber-400 border-2 border-white dark:border-slate-900 shadow" />
                                </div>
                                <div className="absolute top-7 left-1/2 -translate-x-1/2 text-center whitespace-nowrap">
                                    <div className="text-[10px] font-bold text-amber-500 tracking-tight">CMP</div>
                                    <div className="text-[11px] font-bold text-slate-500 tabular-nums">{n.price.toFixed(0)}</div>
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
                                    <div className="text-[11px] font-bold text-slate-500 tabular-nums">{n.price.toFixed(0)}</div>
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
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const [detailRes, signalsRes, batchRes, accumRes, fibRes] = await Promise.all([
                    api.get(`/api/stocks/details/${symbol}/`),
                    api.get(`/api/stocks/signals/?symbol=${symbol}&page_size=10`),
                    api.get(`/api/stocks/batch-indicators/?symbols=${symbol}`),
                    api.get('/api/stocks/companies/accumulation/', { params: { range: '1W' } }),
                    api.get(`/api/stocks/fibonacci/${symbol}/`).catch(() => ({ data: null })),
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
            } catch {
                /* silent */
            } finally {
                setLoading(false);
            }
        };
        if (symbol) fetchData();
    }, [symbol]);

    // Live indicators from batch endpoint (fresh, calculated from recent price data)
    const rsi = liveInds?.rsi ?? 50;
    const macdh = liveInds?.macd_hist ?? 0;
    const roc14 = liveInds?.roc ?? 0;
    const t5d = liveInds?.trends?.['5d'] ?? 0;
    const t10d = liveInds?.trends?.['10d'] ?? 0;
    const t1m = liveInds?.trends?.['1m'] ?? 0;

    // SMAs + Pivot S&R from stored technical indicators
    const storedInds = pageData?.technical_indicators || [];
    const getStoredInd = (p: string) => storedInds.find((i: any) => i.name.toUpperCase().includes(p.toUpperCase()));
    const sma50 = parseFloat(getStoredInd('50-DAY SMA')?.value || '0');
    const sma200 = parseFloat(getStoredInd('200-DAY SMA')?.value || '0');
    const atr = parseFloat(getStoredInd('ATR')?.value || '0');
    const adx = parseFloat(getStoredInd('ADX')?.value || '0');
    const bbp = parseFloat(getStoredInd('BOLLINGER')?.value || getStoredInd('BB%B')?.value || '0');
    const stochK = parseFloat(getStoredInd('STOCHASTIC')?.value || getStoredInd('%K')?.value || '0');

    // Pivot points
    const pivotP  = parseFloat(getStoredInd('PIVOT (P)')?.value  || getStoredInd('PIVOT')?.value  || '0');
    const pivotR1 = parseFloat(getStoredInd('RESISTANCE 1')?.value || getStoredInd('R1')?.value || '0');
    const pivotR2 = parseFloat(getStoredInd('RESISTANCE 2')?.value || getStoredInd('R2')?.value || '0');
    const pivotR3 = parseFloat(getStoredInd('RESISTANCE 3')?.value || getStoredInd('R3')?.value || '0');
    const pivotS1 = parseFloat(getStoredInd('SUPPORT 1')?.value  || getStoredInd('S1')?.value || '0');
    const pivotS2 = parseFloat(getStoredInd('SUPPORT 2')?.value  || getStoredInd('S2')?.value || '0');
    const pivotS3 = parseFloat(getStoredInd('SUPPORT 3')?.value  || getStoredInd('S3')?.value || '0');

    const primaryTarget = targetPrice || (direction === 'BUY' ? entryPrice * 1.05 : entryPrice * 0.95);
    const primaryStop = stopLoss || (direction === 'BUY' ? cmp * 0.96 : cmp * 1.04);
    const finalTp1 = tp1 || primaryTarget;
    const finalTp2 = tp2 || primaryTarget * (direction === 'BUY' ? 1.05 : 0.95);
    const finalTp3 = tp3 || primaryTarget * (direction === 'BUY' ? 1.10 : 0.90);


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
            <div className="flex flex-col items-center justify-center h-full bg-white dark:bg-slate-900 rounded-3xl gap-3 border border-slate-200 dark:border-slate-800 shadow-2xl">
                <StockLoader size="md" />
                <p className="text-xs text-slate-400 font-medium">Loading intelligence...</p>
            </div>
        );
    }

    return (
        <div className={cn(
            'flex flex-col h-full bg-white dark:bg-slate-900 overflow-hidden',
            !hideHeader && 'rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl',
            className
        )}>

            {/* ── Header ── */}
            {!hideHeader && (
                <div className={cn(
                    'shrink-0 px-7 pt-5 pb-4 border-b border-slate-100 dark:border-slate-800',
                    isBuy
                        ? 'bg-gradient-to-r from-emerald-50/60 to-white dark:from-emerald-950/20 dark:to-slate-900'
                        : 'bg-gradient-to-r from-rose-50/60 to-white dark:from-rose-950/20 dark:to-slate-900'
                )}>
                    <div className="flex items-center justify-between gap-4">
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
                                    <p className="text-xs text-slate-400 truncate max-w-[200px] mt-0.5">{companyName}</p>
                                )}
                            </div>
                        </div>

                        {/* Right: price + indicators */}
                        <div className="flex items-center gap-6">
                            {/* RSI / MACD */}
                            <div className="hidden sm:flex items-center gap-4 px-4 border-x border-slate-100 dark:border-slate-800">
                                <div className="text-center">
                                    <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 tracking-tight mb-0.5">RSI</div>
                                    <div className={cn('text-sm font-bold tabular-nums',
                                        rsi > 70 ? 'text-rose-500' : rsi < 30 ? 'text-emerald-500' : 'text-slate-700 dark:text-slate-300'
                                    )}>{rsi.toFixed(1)}</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 tracking-tight mb-0.5">MACD</div>
                                    <div className={cn('text-sm font-bold tabular-nums', macdh > 0 ? 'text-emerald-500' : 'text-rose-500')}>
                                        {macdh.toFixed(2)}
                                    </div>
                                </div>
                            </div>

                            <div className="text-right">
                                <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 tracking-tight mb-0.5">Market price</div>
                                <div className="text-xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                                    Rs.{cmp.toLocaleString()}
                                </div>
                                <div className="flex items-center gap-1.5 justify-end mt-0.5">
                                    <span className="text-[10px] font-bold text-slate-400 tracking-tight">Entry Rs.{entryPrice.toLocaleString()}</span>
                                    <span className={cn('text-[10px] font-bold tabular-nums', change > 0 ? 'text-emerald-500' : 'text-rose-500')}>
                                        {change > 0 ? '+' : ''}{change.toFixed(2)}%
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Price Ladder ── */}
            <div className="shrink-0 bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
                <PriceLadder
                    sl={primaryStop} entry={entryPrice} cmp={cmp}
                    tp1={finalTp1} tp2={finalTp2} tp3={finalTp3}
                />
            </div>

            {/* ── Body: 3 columns ── */}
            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-slate-100 dark:divide-slate-800">

                {/* ── LEFT: Trade setup + technicals + brokers ── */}
                <div className="p-6 flex flex-col gap-4 overflow-y-auto no-scrollbar">

                    {/* Day range */}
                    {dayHigh && dayLow && (
                        <div className="p-3 bg-slate-50/30 dark:bg-slate-900/30 rounded-2xl">
                            <div className="text-[11px] font-bold text-slate-400 tracking-wider mb-2">Day range</div>
                            <div className="relative h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-visible mb-2">
                                <div className="absolute inset-0 bg-gradient-to-r from-rose-200 via-slate-100 to-emerald-200 dark:from-rose-900/30 dark:via-slate-800 dark:to-emerald-900/30 rounded-full" />
                                <div
                                    className="absolute top-1/2 w-3.5 h-3.5 bg-amber-400 rounded-full border-2 border-white dark:border-slate-900 shadow -translate-y-1/2 transition-all duration-700"
                                    style={{ left: `calc(${dayHigh !== dayLow ? Math.min(Math.max(((cmp - dayLow) / (dayHigh - dayLow)) * 100, 2), 97) : 50}% - 7px)` }}
                                />
                            </div>
                            <div className="flex justify-between text-[11px] font-bold tabular-nums text-slate-400">
                                <span>L {dayLow.toLocaleString()}</span>
                                <span className="text-amber-500">{cmp.toLocaleString()}</span>
                                <span>H {dayHigh.toLocaleString()}</span>
                            </div>
                        </div>
                    )}

                    {/* Momentum: RSI + MACD + trends */}
                    <div>
                        <div className="text-[11px] font-bold text-slate-400 tracking-wider mb-2.5">Momentum</div>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="p-3 bg-slate-50/30 dark:bg-slate-900/30 rounded-2xl">
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-[10px] font-bold text-slate-400 tracking-tight">RSI (14)</span>
                                    <span className={cn('text-[11px] font-bold tabular-nums',
                                        rsi > 70 ? 'text-rose-500' : rsi < 30 ? 'text-emerald-500' : 'text-slate-700 dark:text-slate-300'
                                    )}>{rsi.toFixed(1)}</span>
                                </div>
                                <div className="h-1 bg-gradient-to-r from-emerald-200 via-slate-200 to-rose-200 dark:from-emerald-900/40 dark:via-slate-700 dark:to-rose-900/40 rounded-full relative">
                                    <div
                                        className={cn('absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white dark:border-slate-800 shadow',
                                            rsi > 70 ? 'bg-rose-400' : rsi < 30 ? 'bg-emerald-400' : 'bg-slate-600 dark:bg-slate-300'
                                        )}
                                        style={{ left: `calc(${Math.min(rsi, 100)}% - 6px)` }}
                                    />
                                </div>
                            </div>
                            <div className="p-3 bg-slate-50/30 dark:bg-slate-900/30 rounded-2xl">
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-xs font-bold text-slate-400">MACD Hist.</span>
                                    <span className={cn('text-xs font-bold tabular-nums', macdh > 0 ? 'text-emerald-500' : 'text-rose-500')}>
                                        {macdh > 0 ? '+' : ''}{macdh.toFixed(2)}
                                    </span>
                                </div>
                                <div className="h-5 bg-slate-50 dark:bg-slate-800/50 rounded flex items-center gap-0.5 px-1 overflow-hidden">
                                    {[...Array(14)].map((_, i) => {
                                        const active = macdh > 0 ? i >= 7 : i < 7;
                                        return (
                                            <div key={i}
                                                className={cn('flex-1 rounded-full', active ? (macdh > 0 ? 'bg-emerald-400' : 'bg-rose-400') : 'bg-slate-200 dark:bg-slate-700')}
                                                style={{ height: active ? `${Math.min(90, Math.abs(macdh) * 15 + 20)}%` : '2px' }}
                                            />
                                        );
                                    })}
                                </div>
                            </div>
                            {trends.map(t => (
                                <div key={t.label} className="p-3 bg-slate-50/30 dark:bg-slate-900/30 rounded-2xl flex items-center justify-between">
                                    <span className="text-xs font-semibold text-slate-400">{t.label}</span>
                                    <div className="flex items-center gap-1">
                                        <div className={cn('w-4 h-4 rounded flex items-center justify-center',
                                            t.val > 0 ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-500' : t.val < 0 ? 'bg-rose-50 dark:bg-rose-900/20 text-rose-500' : 'bg-slate-100 text-slate-400'
                                        )}>
                                            {t.val > 0 ? <ArrowUpRight size={10} /> : t.val < 0 ? <ArrowDownRight size={10} /> : <Activity size={10} />}
                                        </div>
                                        <span className={cn('text-xs font-bold tabular-nums',
                                            t.val > 0 ? 'text-emerald-600 dark:text-emerald-400' : t.val < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'
                                        )}>{t.val > 0 ? '+' : ''}{t.val.toFixed(1)}%</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Moving Averages */}
                    <div className="p-3 bg-slate-50/30 dark:bg-slate-900/30 rounded-2xl">
                        <div className="text-xs font-bold text-slate-400 tracking-wider mb-2">Moving averages</div>
                        {[
                            { label: '50-Day SMA', val: sma50, dot: 'bg-amber-400' },
                            { label: '200-Day SMA', val: sma200, dot: 'bg-slate-400' },
                        ].map((s, i) => (
                            <div key={s.label} className={cn('flex items-center justify-between py-2', i > 0 && 'border-t border-slate-100 dark:border-slate-800')}>
                                <div className="flex items-center gap-2">
                                    <div className={cn('w-2 h-2 rounded-full', s.dot)} />
                                    <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{s.label}</span>
                                </div>
                                <div className="text-right">
                                    <span className="text-xs font-bold tabular-nums text-slate-800 dark:text-slate-200">Rs.{s.val.toLocaleString()}</span>
                                    <span className={cn('ml-2 text-xs font-semibold', cmp > s.val ? 'text-emerald-500' : 'text-rose-500')}>
                                        {cmp > s.val ? '▲' : '▼'}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Broker intelligence */}
                    {(brokers.length > 0 || allTimeBrokers.length > 0) && (
                        <div>
                            <div className="flex items-center gap-1.5 mb-2">
                                <Briefcase size={10} className="text-blue-500" />
                                <span className="text-xs font-bold text-slate-400 tracking-wider">Broker intelligence</span>
                            </div>
                            <div className="space-y-2">
                                {[...brokers.slice(0, 1).map(b => ({ ...b, tag: '1M' })), ...allTimeBrokers.slice(0, 1).map(b => ({ ...b, tag: 'AT' }))].map(b => {
                                    const spread = (((cmp - b.wac) / b.wac) * 100).toFixed(1);
                                    const inProfit = cmp > b.wac;
                                    return (
                                        <div key={`${b.broker}-${b.tag}`} className="p-3 flex items-center justify-between border-b border-slate-100 last:border-0 dark:border-slate-800">
                                            <div className="flex items-center gap-2.5">
                                                <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/40 flex items-center justify-center text-xs font-bold text-blue-600 dark:text-blue-400">
                                                    {b.broker}
                                                </div>
                                                <div>
                                                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">Broker {b.broker}</div>
                                                    <div className="text-xs text-slate-400">{b.tag === '1M' ? '1-month' : 'All-time'} · WAC Rs.{b.wac}</div>
                                                </div>
                                            </div>
                                            <div className={cn('text-xs font-bold tabular-nums', inProfit ? 'text-emerald-500' : 'text-rose-500')}>
                                                {inProfit ? '+' : ''}{spread}%
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Advisory */}
                    <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 p-4 flex items-start gap-3 mt-auto">
                        <div className="p-1.5 rounded-xl bg-amber-100 dark:bg-amber-900/30 shrink-0">
                            <Zap size={12} className="text-amber-500" />
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                            Signal gravity is {strength > 60 ? 'high' : 'stabilising'}.
                            Rs.{primaryStop.toFixed(0)} is the primary invalidation level.
                            {isBuy ? ' Trail stop up as each target is reached.' : ' Trail stop down as each target is reached.'}
                        </p>
                    </div>
                </div>

                {/* ── MIDDLE: Strategy signal sequence ── */}
                <div className="p-6 flex flex-col gap-4 overflow-y-auto no-scrollbar">

                    {/* Accumulation Pressure */}
                    {accumData && (
                        <div className="p-3 bg-slate-50/30 dark:bg-slate-900/30 rounded-2xl">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold text-slate-400 tracking-wider">Accumulation (1w)</span>
                                <span className={cn(
                                    'text-xs font-bold px-2 py-0.5 rounded-lg',
                                    accumData.net_qty > 0
                                        ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
                                        : 'bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400'
                                )}>
                                    {accumData.net_qty > 0 ? 'Accumulating' : 'Distributing'}
                                </span>
                            </div>
                            <div className="h-2 rounded-full overflow-hidden bg-rose-100 dark:bg-rose-900/30 mb-2">
                                <div
                                    className="h-full rounded-full bg-emerald-400 dark:bg-emerald-500 transition-all duration-700"
                                    style={{ width: `${Math.min(Math.max(accumData.accumulation_ratio ?? 50, 0), 100)}%` }}
                                />
                            </div>
                            <div className="flex justify-between text-xs text-slate-400 tabular-nums">
                                <span>Buy {(accumData.accumulation_ratio ?? 50).toFixed(1)}%</span>
                                <span className={cn('font-semibold', accumData.net_qty > 0 ? 'text-emerald-500' : 'text-rose-500')}>
                                    Net {accumData.net_qty > 0 ? '+' : ''}{accumData.net_qty?.toLocaleString()} qty
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Risk / Reward per target */}
                    <div>
                        <div className="flex items-center gap-1.5 mb-2">
                            <Zap size={10} className="text-amber-500" />
                            <span className="text-xs font-bold text-slate-400 tracking-wider">Risk / Reward</span>
                        </div>
                        <div className="rounded-xl border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800/30 overflow-hidden">
                            {[
                                { label: 'TP1', price: finalTp1, color: 'text-emerald-500', dot: 'bg-emerald-400' },
                                { label: 'TP2', price: finalTp2, color: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
                                { label: 'TP3', price: finalTp3, color: 'text-sky-500', dot: 'bg-sky-400' },
                            ].map((tp, i) => {
                                const risk = Math.max(0.01, Math.abs(entryPrice - primaryStop));
                                const reward = Math.abs(tp.price - entryPrice);
                                const rr = (reward / risk).toFixed(2);
                                const gainPct = (((tp.price - entryPrice) / entryPrice) * 100).toFixed(1);
                                return (
                                    <div key={tp.label} className={cn(
                                        'flex items-center justify-between px-3 py-2',
                                        i > 0 && 'border-t border-slate-100 dark:border-slate-800'
                                    )}>
                                        <div className="flex items-center gap-2">
                                            <div className={cn('w-2 h-2 rounded-full', tp.dot)} />
                                            <span className={cn('text-xs font-bold', tp.color)}>{tp.label}</span>
                                            <span className="text-xs tabular-nums text-slate-400">Rs.{tp.price.toLocaleString()}</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className={cn('text-xs tabular-nums font-semibold', isBuy ? 'text-emerald-500' : 'text-rose-500')}>
                                                {isBuy ? '+' : ''}{gainPct}%
                                            </span>
                                            <span className="text-xs font-bold tabular-nums text-slate-700 dark:text-slate-200">
                                                {rr}:1
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                        <Clock size={11} className="text-slate-400" />
                        <span className="text-xs font-bold text-slate-400 tracking-wider">Strategy signal sequence</span>
                    </div>

                    {history.filter(h => h.signal === 'BUY' || h.signal === 'SELL').length === 0 ? (
                        <div className="flex-1 flex items-center justify-center">
                            <p className="text-xs text-slate-400 text-center">No strategy signals recorded for this symbol yet.</p>
                        </div>
                    ) : (
                        <div className="relative space-y-0 before:absolute before:left-[11px] before:top-4 before:bottom-4 before:w-px before:bg-slate-100 dark:before:bg-slate-800">
                            {history.filter(h => h.signal === 'BUY' || h.signal === 'SELL').map((h, i) => (
                                <div key={i} className="relative flex gap-3 pb-3 last:pb-0">
                                    {/* Timeline dot */}
                                    <div className={cn(
                                        'relative z-10 mt-3 w-[22px] h-[22px] shrink-0 rounded-full border-2 border-white dark:border-slate-900 flex items-center justify-center shadow-sm',
                                        h.signal === 'BUY' ? 'bg-emerald-400' : 'bg-rose-400'
                                    )}>
                                        {h.signal === 'BUY'
                                            ? <ArrowUpRight size={10} className="text-white" />
                                            : <ArrowDownRight size={10} className="text-white" />
                                        }
                                    </div>
                                    {/* Card */}
                                    <div className="flex-1 px-3 py-2.5 transition-colors border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50/50">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 leading-snug">{h.strategy_name}</div>
                                                <div className="text-xs text-slate-400 tabular-nums mt-0.5">Entry Rs.{parseFloat(h.last_close).toLocaleString()}</div>
                                            </div>
                                            <div className="shrink-0 flex flex-col items-end gap-1">
                                                <span className={cn(
                                                    'text-xs font-bold px-1.5 py-0.5 rounded',
                                                    h.signal === 'BUY'
                                                        ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
                                                        : 'bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400'
                                                )}>{h.signal}</span>
                                                <span className="text-xs text-slate-400 tabular-nums">{h.date}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* ── RIGHT: Price Levels (Fibonacci + Pivot S&R + Volatility) ── */}
                <div className="p-6 flex flex-col gap-4 overflow-y-auto no-scrollbar">

                    {/* Fibonacci Retracement */}
                    {fibData ? (
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold text-slate-400 tracking-wider">Fibonacci</span>
                                <div className="flex items-center gap-1.5">
                                    <span className={cn(
                                        'text-xs font-bold px-2 py-0.5 rounded-lg',
                                        fibData.trend === 'UPTREND'
                                            ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
                                            : 'bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400'
                                    )}>{fibData.trend}</span>
                                    {fibData.current_zone != null && Number.isFinite(Number(fibData.current_zone)) && (
                                        <span className="text-xs text-slate-400 font-medium">Zone {(fibData.current_zone * 100).toFixed(1)}%</span>
                                    )}
                                </div>
                            </div>

                            {/* Nearest S&R from fib */}
                            <div className="grid grid-cols-2 gap-2 mb-3">
                                {fibData.nearest_support && Number.isFinite(parseFloat(fibData.nearest_support)) && (
                                    <div className="rounded-xl bg-rose-50/30 dark:bg-rose-950/10 p-2.5">
                                        <div className="text-xs text-rose-400 font-semibold mb-0.5">Nearest Support</div>
                                        <div className="text-xs font-bold tabular-nums text-rose-600 dark:text-rose-400">
                                            Rs.{parseFloat(fibData.nearest_support).toLocaleString()}
                                        </div>
                                    </div>
                                )}
                                {fibData.nearest_resistance && Number.isFinite(parseFloat(fibData.nearest_resistance)) && (
                                    <div className="rounded-xl bg-emerald-50/30 dark:bg-emerald-950/10 p-2.5">
                                        <div className="text-xs text-emerald-500 font-semibold mb-0.5">Nearest Resistance</div>
                                        <div className="text-xs font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                                            Rs.{parseFloat(fibData.nearest_resistance).toLocaleString()}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Fib level rows */}
                            <div className="bg-transparent overflow-hidden border border-slate-100 dark:border-slate-800 rounded-2xl">
                                {(fibData.levels as any[] || []).map((lv: any, i: number) => {
                                    const pct = lv.ratio != null ? lv.ratio * 100 : null;
                                    const isAbove = lv.is_above;
                                    const dist = lv.distance_pct != null ? parseFloat(lv.distance_pct) : null;
                                    return (
                                        <div key={i} className={cn(
                                            'flex items-center justify-between px-3 py-1.5 text-xs',
                                            i > 0 && 'border-t border-slate-100 dark:border-slate-800',
                                            !isAbove && 'bg-rose-50/30 dark:bg-rose-950/10'
                                        )}>
                                            <div className="flex items-center gap-2">
                                                <div className={cn('w-1.5 h-1.5 rounded-full', isAbove ? 'bg-emerald-400' : 'bg-rose-400')} />
                                                <span className="text-slate-400 font-medium">
                                                    {pct != null ? `${pct.toFixed(1)}%` : '—'}
                                                </span>
                                            </div>
                                            <span className="font-bold tabular-nums text-slate-700 dark:text-slate-200">
                                                Rs.{parseFloat(lv.price).toLocaleString()}
                                            </span>
                                            {dist != null && (
                                                <span className={cn('tabular-nums font-semibold', isAbove ? 'text-emerald-500' : 'text-rose-500')}>
                                                    {isAbove ? '+' : ''}{dist.toFixed(1)}%
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                        <div className="p-4 text-center">
                            <span className="text-xs text-slate-400">Fibonacci data unavailable</span>
                        </div>
                    )}

                    {/* Pivot Points */}
                    {pivotP > 0 && (
                        <div>
                            <div className="text-xs font-bold text-slate-400 tracking-wider mb-2">Pivot points</div>
                            <div className="rounded-xl border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800/30 overflow-hidden">
                                {[
                                    { label: 'R3', val: pivotR3, color: 'text-emerald-600 dark:text-emerald-400' },
                                    { label: 'R2', val: pivotR2, color: 'text-emerald-600 dark:text-emerald-400' },
                                    { label: 'R1', val: pivotR1, color: 'text-emerald-500' },
                                    { label: 'P',  val: pivotP,  color: 'text-amber-500', bg: 'bg-amber-50/50 dark:bg-amber-950/10' },
                                    { label: 'S1', val: pivotS1, color: 'text-rose-500' },
                                    { label: 'S2', val: pivotS2, color: 'text-rose-600 dark:text-rose-400' },
                                    { label: 'S3', val: pivotS3, color: 'text-rose-600 dark:text-rose-400' },
                                ].filter(r => r.val > 0).map((row, i) => {
                                    const distPct = ((row.val - cmp) / cmp) * 100;
                                    return (
                                        <div key={row.label} className={cn(
                                            'flex items-center justify-between px-3 py-1.5',
                                            i > 0 && 'border-t border-slate-100 dark:border-slate-800',
                                            (row as any).bg ?? '',
                                            cmp > row.val && row.label !== 'P' && row.label.startsWith('S') && 'opacity-50'
                                        )}>
                                            <span className={cn('text-xs font-bold w-5', row.color)}>{row.label}</span>
                                            <span className="text-xs font-bold tabular-nums text-slate-700 dark:text-slate-200">
                                                Rs.{row.val.toLocaleString()}
                                            </span>
                                            <span className={cn('text-xs tabular-nums font-semibold w-14 text-right',
                                                distPct > 0 ? 'text-emerald-500' : distPct < 0 ? 'text-rose-500' : 'text-slate-400'
                                            )}>
                                                {distPct > 0 ? '+' : ''}{distPct.toFixed(1)}%
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Volatility & Trend Strength */}
                    {(atr > 0 || adx > 0 || bbp > 0 || stochK > 0) && (
                        <div>
                            <div className="text-xs font-bold text-slate-400 tracking-wider mb-2">Volatility & strength</div>
                            <div className="grid grid-cols-2 gap-2">
                                {atr > 0 && (
                                    <div className="p-3 bg-slate-50/30 dark:bg-slate-900/30 rounded-2xl">
                                        <div className="text-xs font-bold text-slate-400 mb-1">ATR (14)</div>
                                        <div className="text-sm font-bold tabular-nums text-slate-800 dark:text-slate-100">{atr.toFixed(2)}</div>
                                        <div className="text-xs text-slate-400 mt-0.5">{((atr / cmp) * 100).toFixed(1)}% of price</div>
                                    </div>
                                )}
                                {adx > 0 && (
                                    <div className="p-3 bg-slate-50/30 dark:bg-slate-900/30 rounded-2xl">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-xs font-bold text-slate-400">ADX (14)</span>
                                            <span className={cn('text-xs font-bold',
                                                adx > 40 ? 'text-emerald-500' : adx > 25 ? 'text-amber-500' : 'text-slate-400'
                                            )}>{adx > 40 ? 'Strong' : adx > 25 ? 'Trending' : 'Weak'}</span>
                                        </div>
                                        <div className="h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                            <div className={cn('h-full rounded-full', adx > 40 ? 'bg-emerald-400' : adx > 25 ? 'bg-amber-400' : 'bg-slate-300')}
                                                style={{ width: `${Math.min(adx, 100)}%` }} />
                                        </div>
                                        <div className="text-xs tabular-nums text-slate-500 mt-1 font-semibold">{adx.toFixed(1)}</div>
                                    </div>
                                )}
                                {bbp > 0 && (
                                    <div className="p-3 bg-slate-50/30 dark:bg-slate-900/30 rounded-2xl">
                                        <div className="text-xs font-bold text-slate-400 mb-1">Bollinger %B</div>
                                        <div className="h-1 bg-gradient-to-r from-rose-200 via-slate-200 to-emerald-200 dark:from-rose-900/40 dark:via-slate-700 dark:to-emerald-900/40 rounded-full relative mb-1.5">
                                            <div className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-slate-600 dark:bg-slate-300 rounded-full border-2 border-white dark:border-slate-800 shadow"
                                                style={{ left: `calc(${Math.min(Math.max(bbp * 100, 2), 97)}% - 5px)` }} />
                                        </div>
                                        <div className="text-xs tabular-nums text-slate-500 font-semibold">{(bbp * 100).toFixed(1)}%</div>
                                    </div>
                                )}
                                {stochK > 0 && (
                                    <div className="p-3 bg-slate-50/30 dark:bg-slate-900/30 rounded-2xl">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-xs font-bold text-slate-400">Stoch %K</span>
                                            <span className={cn('text-xs font-bold',
                                                stochK > 80 ? 'text-rose-500' : stochK < 20 ? 'text-emerald-500' : 'text-slate-400'
                                            )}>{stochK > 80 ? 'OB' : stochK < 20 ? 'OS' : '—'}</span>
                                        </div>
                                        <div className="h-1 bg-gradient-to-r from-emerald-200 via-slate-200 to-rose-200 dark:from-emerald-900/40 dark:via-slate-700 dark:to-rose-900/40 rounded-full relative mb-1.5">
                                            <div className={cn('absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-800 shadow',
                                                stochK > 80 ? 'bg-rose-400' : stochK < 20 ? 'bg-emerald-400' : 'bg-slate-400'
                                            )} style={{ left: `calc(${Math.min(stochK, 100)}% - 5px)` }} />
                                        </div>
                                        <div className="text-xs tabular-nums text-slate-500 font-semibold">{stochK.toFixed(1)}</div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                </div>

            </div>
        </div>
    );
}
