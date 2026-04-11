'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useTheme } from 'next-themes';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import {
    Activity, CandlestickChart, TrendingUp, TrendingDown,
    Clock, Zap, ShieldAlert, Triangle, Layers, ArrowUpRight, ArrowDownRight, Target,
    Maximize2, Minimize2
} from 'lucide-react';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import ReactECharts from 'echarts-for-react';

interface Pattern {
    name: string;
    sentiment: string;
    desc?: string;
    win_rate?: string;
}

interface SMCEvent {
    type: string;
    sentiment: string;
    desc: string;
    tag?: string;
}

interface PriceActionDay {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    body_size: number;
    shape_desc: string;
    volume_desc: string;
    patterns: Pattern[];
    smc_events?: SMCEvent[];
    sentiment: string;
}

interface Zone {
    type: string;
    yAxis0: number;
    yAxis1: number;
    desc: string;
}

interface PriceActionData {
    ticker: string;
    period: string;
    zones?: Zone[];
    history: PriceActionDay[];
}

interface PriceActionTerminalProps {
    symbol: string;
    grouping?: number;
}

// ─── OHLC header row ─────────────────────────────────────────────

function OHLCStrip({ day }: { day: PriceActionDay }) {
    const isUp = day.close >= day.open;
    const change = day.close - day.open;
    const changePct = day.open > 0 ? ((change / day.open) * 100).toFixed(2) : '0.00';
    const range = day.high - day.low;
    const bodyPct = day.high !== day.low ? ((Math.abs(day.close - day.open) / range) * 100).toFixed(0) : '0';
    const wickTopPct = day.high !== day.low ? (((day.high - Math.max(day.open, day.close)) / range) * 100).toFixed(0) : '0';
    const wickBotPct = day.high !== day.low ? (((Math.min(day.open, day.close) - day.low) / range) * 100).toFixed(0) : '0';

    const fields = [
        { label: 'Open', value: day.open.toLocaleString() },
        { label: 'High', value: day.high.toLocaleString(), accent: 'text-emerald-600 dark:text-emerald-400' },
        { label: 'Low', value: day.low.toLocaleString(), accent: 'text-rose-500 dark:text-rose-400' },
        { label: 'Close', value: day.close.toLocaleString(), accent: isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400' },
    ];

    return (
        <div className="flex flex-wrap items-center gap-2">
            {/* Sentiment pill */}
            <div className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black',
                isUp
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/40'
                    : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200/60 dark:border-rose-800/40'
            )}>
                {isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {isUp ? '+' : ''}{changePct}%
            </div>

            {/* OHLC values */}
            <div className="flex items-center divide-x divide-slate-200 dark:divide-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                {fields.map(f => (
                    <div key={f.label} className="flex flex-col items-center px-3 py-1.5 bg-white dark:bg-slate-900/60">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{f.label}</span>
                        <span className={cn('text-xs font-black font-mono tabular-nums', f.accent || 'text-slate-800 dark:text-slate-100')}>{f.value}</span>
                    </div>
                ))}
            </div>

            {/* Candle anatomy mini */}
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Body</span>
                <span className="text-xs font-black text-slate-700 dark:text-slate-200 font-mono">{bodyPct}%</span>
                <span className="text-slate-300 dark:text-slate-600">·</span>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Wicks</span>
                <span className="text-xs font-black text-slate-500 dark:text-slate-400 font-mono">↑{wickTopPct}% ↓{wickBotPct}%</span>
            </div>

            {/* Volume */}
            <div className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold',
                day.volume_desc.toLowerCase().includes('high')
                    ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800/40 text-indigo-600 dark:text-indigo-400'
                    : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
            )}>
                <Activity size={11} />
                {day.volume_desc}
            </div>
        </div>
    );
}

// ─── Zone card ───────────────────────────────────────────────────

function ZoneCard({ zone }: { zone: Zone }) {
    const isSupply = zone.type === 'Supply';
    return (
        <div className={cn(
            'flex items-start gap-3 p-3 rounded-xl border text-xs',
            isSupply
                ? 'bg-rose-50/50 dark:bg-rose-900/10 border-rose-200/60 dark:border-rose-800/30'
                : 'bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-200/60 dark:border-emerald-800/30'
        )}>
            <div className={cn(
                'mt-0.5 p-1.5 rounded-lg shrink-0',
                isSupply ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-500' : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-500'
            )}>
                <ShieldAlert size={12} />
            </div>
            <div className="min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                    <span className={cn('font-black text-[11px]', isSupply ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400')}>
                        {isSupply ? 'Supply' : 'Demand'}
                    </span>
                    <span className="font-mono font-bold text-[10px] text-slate-500 dark:text-slate-400">
                        {zone.yAxis1.toLocaleString()} – {zone.yAxis0.toLocaleString()}
                    </span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">{zone.desc}</p>
            </div>
        </div>
    );
}

// ─── Pattern card ────────────────────────────────────────────────

function PatternCard({ pattern }: { pattern: Pattern }) {
    const isBull = pattern.sentiment === 'BULLISH';
    return (
        <div className={cn(
            'flex items-center gap-2.5 px-3 py-2.5 rounded-xl border',
            isBull
                ? 'bg-emerald-50/60 dark:bg-emerald-900/10 border-emerald-200/50 dark:border-emerald-800/30'
                : 'bg-rose-50/60 dark:bg-rose-900/10 border-rose-200/50 dark:border-rose-800/30'
        )}>
            <div className={cn(
                'shrink-0 p-1 rounded-md',
                isBull ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-500' : 'bg-rose-100 dark:bg-rose-900/30 text-rose-500'
            )}>
                {isBull ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 truncate">{pattern.name}</span>
                    {pattern.win_rate && (
                        <span className="shrink-0 text-[9px] font-black text-slate-400 font-mono">{pattern.win_rate}</span>
                    )}
                </div>
                {pattern.desc && (
                    <p className="text-[9px] text-slate-400 dark:text-slate-500 truncate mt-0.5">{pattern.desc}</p>
                )}
            </div>
            {pattern.desc && <InfoTooltip content={pattern.desc} />}
        </div>
    );
}

// ─── SMC event badge ─────────────────────────────────────────────

function SMCBadge({ ev }: { ev: SMCEvent }) {
    const config = {
        FVG: { bg: 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-800/40', icon: <Triangle size={10} /> },
        BOS: { bg: 'bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800/40', icon: <Zap size={10} /> },
        SNIPER: { bg: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/40', icon: <Zap size={10} /> },
    }[ev.type] || { bg: 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700', icon: <Activity size={10} /> };

    return (
        <div className={cn('flex items-center gap-1 px-2 py-1 rounded-md border text-[9px] font-black', config.bg)} title={ev.desc}>
            {config.icon}
            <span>{ev.tag || ev.type}</span>
            {ev.sentiment && (
                <span className="opacity-60">{ev.sentiment === 'BULLISH' ? '▲' : '▼'}</span>
            )}
        </div>
    );
}

// ─── Mini candle ─────────────────────────────────────────────────

function MiniCandle({ day }: { day: PriceActionDay }) {
    const isUp = day.close >= day.open;
    const range = day.high - day.low;
    if (range === 0) return <div className="w-2 h-8 bg-slate-200 dark:bg-slate-700 rounded-sm" />;

    const bodyTop = ((day.high - Math.max(day.open, day.close)) / range) * 100;
    const bodyH = (Math.abs(day.close - day.open) / range) * 100;
    const color = isUp ? '#10b981' : '#f43f5e';

    return (
        <div className="relative w-2 h-8 flex items-center justify-center">
            {/* Wick */}
            <div className="absolute inset-x-[45%] inset-y-0 rounded-full" style={{ backgroundColor: color, opacity: 0.5 }} />
            {/* Body */}
            <div
                className="absolute inset-x-0 rounded-sm"
                style={{
                    backgroundColor: color,
                    top: `${bodyTop}%`,
                    height: `${Math.max(bodyH, 8)}%`,
                    minHeight: '3px',
                }}
            />
        </div>
    );
}

// ─── Overall bias ────────────────────────────────────────────────

function TrendBias({ history }: { history: PriceActionDay[] }) {
    if (history.length < 5) return null;
    const recent = history.slice(0, 10);
    const bullDays = recent.filter(d => d.close >= d.open).length;
    const bearDays = recent.length - bullDays;
    const smcBull = recent.flatMap(d => d.smc_events || []).filter(e => e.sentiment === 'BULLISH').length;
    const smcBear = recent.flatMap(d => d.smc_events || []).filter(e => e.sentiment === 'BEARISH').length;
    const score = (bullDays - bearDays) + (smcBull - smcBear) * 0.5;
    const bias = score > 1 ? 'BULLISH' : score < -1 ? 'BEARISH' : 'NEUTRAL';

    return (
        <div className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-black',
            bias === 'BULLISH'
                ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/40 text-emerald-600 dark:text-emerald-400'
                : bias === 'BEARISH'
                ? 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800/40 text-rose-500 dark:text-rose-400'
                : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
        )}>
            {bias === 'BULLISH' ? <TrendingUp size={12} /> : bias === 'BEARISH' ? <TrendingDown size={12} /> : <Activity size={12} />}
            {bias}
            <span className="font-medium opacity-60 text-[9px]">10-session</span>
        </div>
    );
}

// ─── Root ────────────────────────────────────────────────────────

export function PriceActionTerminal({ symbol, grouping = 1 }: PriceActionTerminalProps) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const [data, setData] = useState<PriceActionData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsFullscreen(false);
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, []);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await api.get(`/api/stocks/price-action/${symbol}/?grouping=${grouping}`);
                setData(res.data);
            } catch (err: any) {
                setError(err?.response?.data?.error || 'Failed to load Price Action data');
            } finally {
                setLoading(false);
            }
        };
        if (symbol) fetchData();
    }, [symbol, grouping]);

    // ── Structural Liquidity Levels (PDH/PDL, PWH/PWL, PMH/PML) ──
    const structuralLiquidity = useMemo(() => {
        if (!data || data.history.length < 25) return null;
        const h = data.history; // latest-first
        const pdh = h[1]?.high || 0;
        const pdl = h[1]?.low || 0;
        const prevWeek = h.slice(1, 6);
        const pwh = Math.max(...prevWeek.map(d => d.high));
        const pwl = Math.min(...prevWeek.map(d => d.low));
        const prevMonth = h.slice(1, 23);
        const pmh = Math.max(...prevMonth.map(d => d.high));
        const pml = Math.min(...prevMonth.map(d => d.low));
        return [
            { name: 'PMH', price: pmh, type: 'BSL', color: '#ef4444' },
            { name: 'PWH', price: pwh, type: 'BSL', color: '#ef4444' },
            { name: 'PDH', price: pdh, type: 'BSL', color: '#ef4444' },
            { name: 'PML', price: pml, type: 'SSL', color: '#10b981' },
            { name: 'PWL', price: pwl, type: 'SSL', color: '#10b981' },
            { name: 'PDL', price: pdl, type: 'SSL', color: '#10b981' },
        ].filter(item => item.price > 0 && item.price !== Infinity);
    }, [data]);

    // ── Order Blocks (last opposing candle before impulsive move) ──
    const orderBlocks = useMemo(() => {
        if (!data || data.history.length < 20) return [];
        const sorted = [...data.history].reverse(); // oldest first
        const lookback = sorted.slice(-60);

        let atrSum = 0;
        const atrLen = Math.min(14, lookback.length - 1);
        for (let i = 1; i <= atrLen; i++) {
            const h = lookback[i].high, l = lookback[i].low, pc = lookback[i - 1].close;
            atrSum += Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
        }
        const atr = atrLen > 0 ? atrSum / atrLen : 1;

        const blocks: Array<{ type: 'bullish' | 'bearish'; date: string; high: number; low: number; mitigated: boolean; impulseIdx: number }> = [];
        for (let i = 1; i < lookback.length; i++) {
            const cO = lookback[i].open, cC = lookback[i].close, cBody = Math.abs(cC - cO);
            const pO = lookback[i - 1].open, pC = lookback[i - 1].close;
            const pH = lookback[i - 1].high, pL = lookback[i - 1].low;
            const globalIdx = sorted.length - lookback.length + i;
            if (cC > cO && cBody > 1.5 * atr && pC < pO)
                blocks.push({ type: 'bullish', date: lookback[i - 1].date, high: pH, low: pL, mitigated: false, impulseIdx: globalIdx });
            if (cC < cO && cBody > 1.5 * atr && pC > pO)
                blocks.push({ type: 'bearish', date: lookback[i - 1].date, high: pH, low: pL, mitigated: false, impulseIdx: globalIdx });
        }
        blocks.forEach(ob => {
            for (let j = ob.impulseIdx + 1; j < sorted.length; j++) {
                const c = sorted[j].close;
                if (ob.type === 'bullish' && c <= ob.high) { ob.mitigated = true; break; }
                if (ob.type === 'bearish' && c >= ob.low) { ob.mitigated = true; break; }
            }
        });
        return blocks.filter(ob => !ob.mitigated).slice(-5).reverse();
    }, [data]);

    // ── Liquidity Sweeps (wick through structural level, close back) ──
    const liquiditySweeps = useMemo(() => {
        if (!data || data.history.length < 5 || !structuralLiquidity || structuralLiquidity.length === 0) return [];
        const recent = data.history.slice(0, 10);
        const sweeps: Array<{ level: string; price: number; date: string; type: 'BSL_SWEEP' | 'SSL_SWEEP' }> = [];
        for (const candle of recent) {
            for (const level of structuralLiquidity) {
                if (level.type === 'BSL' && candle.high > level.price && Math.max(candle.close, candle.open) < level.price)
                    sweeps.push({ level: level.name, price: level.price, date: candle.date, type: 'BSL_SWEEP' });
                if (level.type === 'SSL' && candle.low < level.price && Math.min(candle.close, candle.open) > level.price)
                    sweeps.push({ level: level.name, price: level.price, date: candle.date, type: 'SSL_SWEEP' });
            }
        }
        return sweeps;
    }, [data, structuralLiquidity]);

    const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    const chartOptions = useMemo(() => {
        if (!data || data.history.length === 0) return {};

        const historyCopy = [...data.history].reverse();
        const categoryData = historyCopy.map(d =>
            new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        );
        const values = historyCopy.map(d => [d.open, d.close, d.low, d.high]);
        const volumes = historyCopy.map((d, idx) => [idx, d.volume, d.close > d.open ? 1 : -1]);

        const markPoints: any[] = [];
        historyCopy.forEach((d, idx) => {
            if (!d.smc_events) return;
            d.smc_events.forEach(ev => {
                if (ev.type === 'FVG' && ev.sentiment === 'BULLISH') {
                    markPoints.push({ coord: [idx, d.low], symbol: 'path://M0,10 L5,0 L10,10 Z', symbolSize: 12, itemStyle: { color: '#8b5cf6' }, label: { show: false } });
                }
                if (ev.type === 'FVG' && ev.sentiment === 'BEARISH') {
                    markPoints.push({ coord: [idx, d.high], symbol: 'path://M0,0 L5,10 L10,0 Z', symbolSize: 12, itemStyle: { color: '#ec4899' }, label: { show: false } });
                }
                if (ev.type === 'BOS' && ev.sentiment === 'BULLISH') {
                    markPoints.push({ coord: [idx, d.high], symbol: 'pin', symbolSize: 28, itemStyle: { color: '#10b981' }, label: { show: true, formatter: 'BoS', fontSize: 8, color: '#fff' } });
                }
                if (ev.type === 'BOS' && ev.sentiment === 'BEARISH') {
                    markPoints.push({ coord: [idx, d.low], symbol: 'pin', symbolSize: 28, itemStyle: { color: '#f43f5e' }, label: { show: true, formatter: 'BoS', fontSize: 8, color: '#fff' } });
                }
                if (ev.type === 'SNIPER') {
                    markPoints.push({ coord: [idx, d.low * 0.995], symbol: 'diamond', symbolSize: 18, itemStyle: { color: '#f59e0b', shadowBlur: 8, shadowColor: '#fcd34d' }, label: { show: false } });
                }
            });
        });

        // Overlay: Sweep markers on the chart
        liquiditySweeps.forEach(sweep => {
            const idx = historyCopy.findIndex(d => d.date === sweep.date);
            if (idx >= 0) {
                const d = historyCopy[idx];
                markPoints.push({
                    coord: [idx, sweep.type === 'BSL_SWEEP' ? d.high * 1.003 : d.low * 0.997],
                    symbol: 'circle',
                    symbolSize: 11,
                    itemStyle: { color: '#f59e0b', borderColor: '#fde68a', borderWidth: 2, shadowBlur: 6, shadowColor: '#f59e0b' },
                    label: { show: false }
                });
            }
        });

        // Overlay: OB zones as markArea (from OB date to right edge)
        const obAreas: any[] = orderBlocks.map(ob => {
            const obIdx = historyCopy.findIndex(d => d.date === ob.date);
            const isBull = ob.type === 'bullish';
            return [
                {
                    name: isBull ? 'Bull OB' : 'Bear OB',
                    yAxis: ob.low,
                    ...(obIdx >= 0 ? { xAxis: categoryData[obIdx] } : {}),
                    itemStyle: {
                        color: isBull ? 'rgba(16,185,129,0.07)' : 'rgba(239,68,68,0.07)',
                        borderColor: isBull ? 'rgba(16,185,129,0.35)' : 'rgba(239,68,68,0.35)',
                        borderWidth: 1,
                        borderType: 'dashed'
                    }
                },
                {
                    yAxis: ob.high,
                    ...(obIdx >= 0 ? { xAxis: categoryData[categoryData.length - 1] } : {})
                }
            ];
        });

        // Overlay: Structural liquidity levels as markLine
        const structLines = structuralLiquidity ? structuralLiquidity.map(level => ({
            yAxis: level.price,
            name: level.name,
            label: { formatter: level.name, show: true, position: 'insideEndTop', color: level.color, fontSize: 9, fontWeight: 700, padding: [2, 4] },
            lineStyle: { color: level.color, type: 'dotted', width: 1, opacity: 0.5 }
        })) : [];

        const upColor = isDark ? '#10b981' : '#059669';
        const downColor = isDark ? '#f43f5e' : '#e11d48';

        const totalBars = historyCopy.length;
        const targetBars = 22; // approx 1 month of trading days
        const initialZoomStart = totalBars > targetBars ? ((totalBars - targetBars) / totalBars) * 100 : 0;

        return {
            animation: false,
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'cross', crossStyle: { color: isDark ? '#475569' : '#94a3b8' } },
                backgroundColor: isDark ? 'rgba(15,23,42,0.95)' : 'rgba(255,255,255,0.97)',
                borderColor: isDark ? '#334155' : '#e2e8f0',
                borderWidth: 1,
                textStyle: { color: isDark ? '#f1f5f9' : '#0f172a', fontSize: 12 },
                extraCssText: 'box-shadow: 0 8px 32px rgba(0,0,0,0.12); border-radius:12px;'
            },
            grid: [
                { left: '1%', right: '1%', top: '3%', height: '63%', containLabel: true },
                { left: '1%', right: '1%', top: '72%', height: '20%', containLabel: true }
            ],
            xAxis: [
                {
                    type: 'category', data: categoryData, boundaryGap: true,
                    axisLine: { lineStyle: { color: isDark ? '#1e293b' : '#f1f5f9' } },
                    splitLine: { show: true, lineStyle: { color: isDark ? '#1e293b' : '#f8fafc', type: 'dashed' } },
                    axisLabel: { color: isDark ? '#64748b' : '#94a3b8', fontSize: 10, fontWeight: 600 }
                },
                {
                    type: 'category', gridIndex: 1, data: categoryData,
                    axisLabel: { show: false }, splitLine: { show: false },
                    axisLine: { lineStyle: { color: isDark ? '#1e293b' : '#f1f5f9' } }, axisTick: { show: false }
                }
            ],
            yAxis: [
                {
                    scale: true,
                    splitLine: { show: true, lineStyle: { color: isDark ? '#1e293b' : '#f8fafc', type: 'dashed', opacity: 0.8 } },
                    axisLabel: { color: isDark ? '#64748b' : '#94a3b8', fontSize: 10, fontWeight: 600 }
                },
                {
                    gridIndex: 1, splitLine: { show: false },
                    axisLine: { show: false }, axisLabel: { show: false }, axisTick: { show: false }
                }
            ],
            dataZoom: [
                { type: 'inside', xAxisIndex: [0, 1], start: initialZoomStart, end: 100 },
                { show: true, type: 'slider', xAxisIndex: [0, 1], top: '93%', start: initialZoomStart, end: 100, height: 20, borderColor: isDark ? '#334155' : '#e2e8f0', fillerColor: isDark ? 'rgba(99,102,241,0.08)' : 'rgba(99,102,241,0.06)', handleStyle: { color: '#6366f1' } },
                // Y-Axis Zooming/Scaling
                { type: 'inside', yAxisIndex: [0], start: 0, end: 100, zoomOnMouseWheel: 'alt', moveOnMouseMove: 'alt', moveOnMouseWheel: 'alt' },
                { show: isFullscreen, type: 'slider', yAxisIndex: [0], right: 10, start: 0, end: 100, width: 20, borderColor: isDark ? '#334155' : '#e2e8f0', fillerColor: isDark ? 'rgba(99,102,241,0.08)' : 'rgba(99,102,241,0.06)', handleStyle: { color: '#6366f1' } }
            ],
            series: [
                {
                    name: 'Price',
                    type: 'candlestick',
                    data: values,
                    itemStyle: { color: upColor, color0: downColor, borderColor: upColor, borderColor0: downColor, borderWidth: 1.5 },
                    markPoint: { data: markPoints, animation: false },
                    markArea: {
                        itemStyle: { opacity: 0.1 },
                        label: { show: true, position: 'insideTopRight', fontSize: 10, fontWeight: 700, opacity: 0.7, color: isDark ? '#f8fafc' : '#0f172a' },
                        data: [
                            ...(data.zones ? data.zones.map(z => [
                                { name: z.type, yAxis: z.yAxis0, itemStyle: { color: z.type === 'Supply' ? '#ef4444' : '#22c55e' } },
                                { yAxis: z.yAxis1 }
                            ]) : []),
                            ...obAreas
                        ]
                    },
                    markLine: {
                        symbol: ['none', 'none'],
                        label: { show: true, position: 'insideEndTop', fontSize: 9, fontWeight: 700 },
                        lineStyle: { type: 'dotted', width: 1 },
                        data: structLines,
                        animation: false
                    }
                },
                {
                    name: 'Volume',
                    type: 'bar',
                    xAxisIndex: 1,
                    yAxisIndex: 1,
                    barMaxWidth: 8,
                    data: volumes.map(item => ({
                        value: item[1],
                        itemStyle: { color: item[2] === 1 ? upColor : downColor, opacity: 0.55, borderRadius: [2, 2, 0, 0] }
                    }))
                }
            ]
        };
    }, [data, isDark, structuralLiquidity, orderBlocks, liquiditySweeps]);

    // ── Loading ──
    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[480px]">
                <div className="flex flex-col items-center gap-3">
                    <div className="relative w-10 h-10">
                        <div className="absolute inset-0 rounded-full border-2 border-indigo-200 dark:border-indigo-800" />
                        <div className="absolute inset-0 rounded-full border-2 border-t-indigo-500 animate-spin" />
                    </div>
                    <p className="text-xs font-bold text-slate-400 tracking-wide">Mapping price structure…</p>
                </div>
            </div>
        );
    }

    // ── Error / empty ──
    if (error || !data || data.history.length === 0) {
        return (
            <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 p-12 text-center">
                <Activity className="mx-auto mb-3 text-slate-300 dark:text-slate-700" size={36} />
                <p className="text-sm font-bold text-slate-400 dark:text-slate-500">{error || 'No price action data available'}</p>
            </div>
        );
    }

    const latest = data.history[0];
    const topPatterns = latest.patterns.slice(0, 6);
    const latestSMC = latest.smc_events || [];
    const totalSignals = data.history.reduce((acc, d) => acc + (d.smc_events?.length || 0) + d.patterns.length, 0);

    return (
        <div className="space-y-5 animate-in fade-in slide-in-from-bottom-3 duration-500">

            {/* ── Header ── */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-900/20 dark:to-violet-900/20 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800">
                        <CandlestickChart size={18} />
                    </div>
                    <div>
                        <h4 className="font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                            Price Action
                            <InfoTooltip content="Candlestick anatomy, Smart Money Concepts (FVG, BoS, Sniper), and supply/demand zone detection." />
                        </h4>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">
                            SMC · {data.history.length} sessions · {totalSignals} signals detected
                        </p>
                    </div>
                </div>
                <TrendBias history={data.history} />
            </div>

            {/* ── Session strip ── */}
            <OHLCStrip day={latest} />

            {/* ── Chart ── */}
            <div className={cn(
                "bg-white dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-all duration-300",
                isFullscreen ? "fixed inset-0 z-[100] rounded-none bg-white dark:bg-slate-950 p-6" : "relative"
            )}>
                <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                        <Activity size={13} className="text-slate-400" />
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            Structural Map {isFullscreen && "— Full Intel View"}
                        </span>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="hidden md:flex items-center gap-3">
                            <span className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400">
                                <span className="w-2 h-2 rounded-sm bg-violet-500" /> FVG
                            </span>
                            <span className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400">
                                <span className="w-2 h-2 rounded-sm bg-emerald-500" /> BoS
                            </span>
                            <span className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400">
                                <span className="w-2 h-2 rounded-sm bg-amber-500" /> Sniper
                            </span>
                            <span className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400">
                                <span className="w-3 h-2 rounded-sm bg-rose-500/10 border border-rose-400/40" /> Supply
                            </span>
                            <span className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400">
                                <span className="w-3 h-2 rounded-sm bg-emerald-500/10 border border-emerald-400/40" /> Demand
                            </span>
                        </div>
                        
                        <div className="h-4 w-[1px] bg-slate-100 dark:bg-slate-800 hidden md:block" />

                        <button
                            onClick={() => setIsFullscreen(!isFullscreen)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-indigo-500 transition-colors"
                            title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
                        >
                            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                        </button>
                    </div>
                </div>
                <div className={cn(
                    "w-full px-2 py-3 transition-all duration-300",
                    isFullscreen ? "h-[calc(100%-60px)]" : "h-[580px]"
                )}>
                    <ReactECharts
                        option={chartOptions}
                        style={{ height: '100%', width: '100%' }}
                        theme={isDark ? 'dark' : 'light'}
                        opts={{ renderer: 'canvas' }}
                        notMerge={true}
                    />
                </div>
                {isFullscreen && (
                    <div className="absolute top-20 right-8 z-[110] flex flex-col gap-2 pointer-events-none opacity-60">
                        <p className="text-[10px] font-bold text-slate-400 bg-slate-900/80 px-2 py-1 rounded">
                            Drag Chart to Zoom X · Use Alt + Scroll to Zoom Y
                        </p>
                    </div>
                )}
            </div>

            {/* ── Smart Money Structure ── */}
            {(orderBlocks.length > 0 || liquiditySweeps.length > 0) && (
                <div className="bg-white dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                    <div className="px-5 pt-4 pb-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Target size={13} className="text-indigo-500" />
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Smart Money Structure</span>
                        </div>
                        <div className="flex items-center gap-2">
                            {orderBlocks.length > 0 && (
                                <span className="text-[10px] font-bold bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full">{orderBlocks.length} OB</span>
                            )}
                            {liquiditySweeps.length > 0 && (
                                <span className="text-[10px] font-bold bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full">{liquiditySweeps.length} Sweep</span>
                            )}
                        </div>
                    </div>
                    <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
                        {/* Order Blocks */}
                        {orderBlocks.length > 0 && (
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2.5">Active Order Blocks</p>
                                <div className="space-y-2">
                                    {orderBlocks.map((ob, i) => {
                                        const midZone = (ob.high + ob.low) / 2;
                                        const latestClose = data.history[0]?.close || 0;
                                        const distPct = latestClose > 0 ? ((latestClose - midZone) / midZone * 100) : 0;
                                        const isNear = Math.abs(distPct) < 3;
                                        return (
                                            <div key={i} className={cn(
                                                "p-3 rounded-xl border text-xs",
                                                ob.type === 'bullish'
                                                    ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/80 dark:border-emerald-800/40"
                                                    : "bg-red-50/50 dark:bg-red-950/20 border-red-200/80 dark:border-red-800/40"
                                            )}>
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <span className={cn("font-bold flex items-center gap-1.5", ob.type === 'bullish' ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400")}>
                                                        {ob.type === 'bullish' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                                        {ob.type === 'bullish' ? 'Bullish OB' : 'Bearish OB'}
                                                    </span>
                                                    <span className="text-slate-400 font-medium">{fmtDate(ob.date)}</span>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <span className="font-mono font-bold text-slate-700 dark:text-slate-200">
                                                        Rs. {ob.low.toLocaleString()} — {ob.high.toLocaleString()}
                                                    </span>
                                                    <span className={cn(
                                                        "text-[10px] font-bold px-2 py-0.5 rounded-full",
                                                        isNear ? "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400" : "bg-slate-100 dark:bg-slate-800 text-slate-500"
                                                    )}>
                                                        {isNear ? 'Near zone' : `${distPct > 0 ? '+' : ''}${distPct.toFixed(1)}%`}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Liquidity Sweeps */}
                        {liquiditySweeps.length > 0 && (
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2.5">Liquidity Sweeps</p>
                                <div className="space-y-2">
                                    {liquiditySweeps.map((sweep, i) => (
                                        <div key={i} className={cn(
                                            "p-3 rounded-xl border text-xs",
                                            sweep.type === 'SSL_SWEEP'
                                                ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/80 dark:border-emerald-800/40"
                                                : "bg-red-50/50 dark:bg-red-950/20 border-red-200/80 dark:border-red-800/40"
                                        )}>
                                            <div className="flex items-center justify-between mb-1.5">
                                                <span className={cn("font-bold flex items-center gap-1.5", sweep.type === 'SSL_SWEEP' ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400")}>
                                                    <Zap size={11} />
                                                    {sweep.type === 'BSL_SWEEP' ? 'Buy-Side Sweep' : 'Sell-Side Sweep'}
                                                </span>
                                                <span className="text-slate-400 font-medium">{fmtDate(sweep.date)}</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-slate-500">Swept: <span className="font-bold text-slate-700 dark:text-slate-200">{sweep.level}</span></span>
                                                <span className="font-mono font-bold text-slate-700 dark:text-slate-200">Rs. {sweep.price.toLocaleString()}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── Signals + Zones ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

                {/* Latest session signals */}
                <div className="lg:col-span-2 space-y-4">
                    {/* SMC Events */}
                    {latestSMC.length > 0 && (
                        <div className="bg-white dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5">
                            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">
                                Smart Money Events — Latest Session
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {latestSMC.map((ev, i) => (
                                    <div key={i} className="flex items-center gap-1.5">
                                        <SMCBadge ev={ev} />
                                        <InfoTooltip content={ev.desc} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Candlestick patterns */}
                    <div className="bg-white dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5">
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                                Detected Patterns — {new Date(latest.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </p>
                            {latest.patterns.length > 6 && (
                                <span className="text-[9px] font-bold text-slate-400">+{latest.patterns.length - 6} more</span>
                            )}
                        </div>
                        {topPatterns.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {topPatterns.map((p, i) => <PatternCard key={i} pattern={p} />)}
                            </div>
                        ) : (
                            <p className="text-xs text-slate-400 dark:text-slate-500 italic">No patterns detected in this session</p>
                        )}
                        {/* Shape desc */}
                        <p className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400 italic">
                            {latest.shape_desc}
                        </p>
                    </div>
                </div>

                {/* Zones */}
                <div className="space-y-4">
                    <div className="bg-white dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-5">
                        <div className="flex items-center gap-2 mb-3">
                            <Layers size={13} className="text-slate-400" />
                            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">Active Zones</p>
                        </div>
                        {data.zones && data.zones.length > 0 ? (
                            <div className="space-y-2">
                                {data.zones.map((z, i) => <ZoneCard key={i} zone={z} />)}
                            </div>
                        ) : (
                            <p className="text-xs text-slate-400 dark:text-slate-500 italic">No active zones detected</p>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Chronological log ── */}
            <div className="bg-white dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
                    <Clock size={13} className="text-slate-400" />
                    <h4 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">Session Log</h4>
                </div>
                <div className="divide-y divide-slate-50 dark:divide-slate-800/60 max-h-[480px] overflow-y-auto">
                    {data.history.map((day, idx) => {
                        const isUp = day.close >= day.open;
                        const hasSMC = day.smc_events && day.smc_events.length > 0;
                        const pct = day.open > 0 ? (((day.close - day.open) / day.open) * 100).toFixed(1) : '0.0';

                        return (
                            <div key={idx} className={cn(
                                'flex items-center gap-4 px-5 py-3 transition-colors',
                                hasSMC
                                    ? 'bg-violet-50/40 dark:bg-violet-900/5 hover:bg-violet-50/70 dark:hover:bg-violet-900/10'
                                    : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/30'
                            )}>
                                {/* Mini candle */}
                                <div className="shrink-0 flex justify-center w-5">
                                    <MiniCandle day={day} />
                                </div>

                                {/* Date */}
                                <div className="w-16 shrink-0">
                                    <p className="text-[10px] font-black font-mono text-slate-500 dark:text-slate-400">
                                        {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    </p>
                                </div>

                                {/* OHLC values */}
                                <div className="hidden md:flex items-center divide-x divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-lg overflow-hidden shrink-0">
                                    {[
                                        { label: 'O', value: day.open, cls: 'text-slate-600 dark:text-slate-300' },
                                        { label: 'H', value: day.high, cls: 'text-emerald-600 dark:text-emerald-400' },
                                        { label: 'L', value: day.low,  cls: 'text-rose-500 dark:text-rose-400' },
                                        { label: 'C', value: day.close, cls: isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400' },
                                    ].map(f => (
                                        <div key={f.label} className="flex items-center gap-1 px-2 py-1.5 bg-white dark:bg-slate-900/40">
                                            <span className="text-[8px] font-bold text-slate-400 uppercase">{f.label}</span>
                                            <span className={cn('text-[10px] font-black font-mono tabular-nums', f.cls)}>
                                                {f.value.toLocaleString()}
                                            </span>
                                        </div>
                                    ))}
                                    <div className="flex items-center px-2 py-1.5 bg-white dark:bg-slate-900/40">
                                        <span className={cn('text-[10px] font-black', isUp ? 'text-emerald-500' : 'text-rose-500')}>
                                            {isUp ? '+' : ''}{pct}%
                                        </span>
                                    </div>
                                </div>

                                {/* Description */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 truncate">{day.shape_desc}</p>
                                </div>

                                {/* Badges */}
                                <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end max-w-[200px]">
                                    {day.smc_events?.slice(0, 2).map((ev, i) => (
                                        <SMCBadge key={i} ev={ev} />
                                    ))}
                                    {day.patterns.slice(0, 2).map((p, i) => (
                                        <span key={i} className={cn(
                                            'text-[9px] font-bold px-1.5 py-0.5 rounded border',
                                            p.sentiment === 'BULLISH'
                                                ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/30'
                                                : 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800/30'
                                        )}>
                                            {p.name}
                                        </span>
                                    ))}
                                    {(day.patterns.length + (day.smc_events?.length || 0)) > 4 && (
                                        <span className="text-[9px] text-slate-400 font-bold">
                                            +{day.patterns.length + (day.smc_events?.length || 0) - 4}
                                        </span>
                                    )}
                                    {day.volume_desc.toLowerCase().includes('high') && (
                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border bg-indigo-50 dark:bg-indigo-900/20 text-indigo-500 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/30">
                                            HVol
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

export default PriceActionTerminal;
