'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import api from '@/lib/api';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { PageLoader } from '@/components/ui/StockLoader';
import { formatNepaliNumber } from '@/lib/formatters';
import ReactECharts from 'echarts-for-react';
import { Flame, ArrowUp, ArrowDown, Minus, Crown, Zap, Activity, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';

// ─── Types ───────────────────────────────────────────────────────────────────

interface DayRankEntry {
    symbol: string;
    rank: number;
    volume: number; // This is Net Volume
    ltp?: number | null;
    buy_price?: number;
    top_brokers?: number[];
    top_sellers?: number[];
}

interface SeriesEntry {
    symbol: string;
    ltp?: number | null;
    ranks: (number | null)[];
    volumes: (number | null)[]; // These are Net Volumes
    appearances: number;
    avg_rank: number;
}

interface FocusRankingData {
    dates: string[];
    daily_rankings: Record<string, DayRankEntry[]>;
    daily_top_brokers: Record<string, number[]>;
    series: SeriesEntry[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const RANGES = ['1W', '2W', '1M'] as const;
type Range = typeof RANGES[number];

const PALETTE = [
    '#f97316', '#3b82f6', '#10b981', '#ef4444', '#f59e0b',
    '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#14b8a6',
    '#6366f1', '#f43f5e', '#a855f7', '#0ea5e9', '#22c55e',
    '#d946ef', '#fcd34d', '#4ade80', '#fb923c', '#818cf8'
];

function fmtDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function FocusRankingPage() {
    const [range, setRange] = useState<Range>('1W');
    const [data, setData] = useState<FocusRankingData | null>(null);
    const [loading, setLoading] = useState(true);
    const abortRef = useRef<AbortController | null>(null);

    const symbolColors = useMemo(() => {
        const map: Record<string, string> = {};
        if (data?.series) {
            data.series.forEach((s, i) => {
                map[s.symbol] = PALETTE[i % PALETTE.length];
            });
        }
        return map;
    }, [data?.series]);

    const symbolColor = (sym: string) => symbolColors[sym] ?? '#94a3b8';

    useEffect(() => {
        abortRef.current?.abort();
        abortRef.current = new AbortController();
        const { signal } = abortRef.current;

        setLoading(true);
        api.get(`/api/stocks/floorsheet/broker_focus_ranking/?range=${range}`, { signal })
            .then(res => setData(res.data))
            .catch(err => { if (err.name !== 'AbortError') console.error(err); })
            .finally(() => setLoading(false));

        return () => abortRef.current?.abort();
    }, [range]);

    // ─── Derived ──────────────────────────────────────────────────────────────

    const latestDate = data?.dates?.[data.dates.length - 1] ?? null;
    const prevDate = data?.dates?.[data.dates.length - 2] ?? null;

    const latestRanking = latestDate ? (data?.daily_rankings[latestDate] ?? []) : [];
    const prevRanking = prevDate ? (data?.daily_rankings[prevDate] ?? []) : [];

    const latestWithTrend = latestRanking.map(entry => {
        const prev = prevRanking.find(p => p.symbol === entry.symbol);
        const change = prev ? prev.rank - entry.rank : null;
        return { ...entry, rankChange: change };
    });

    // ─── Bump Chart ───────────────────────────────────────────────────────────

    const chartOption = useMemo(() => {
        if (!data?.series?.length) return {};

        const xLabels = data.dates.map(fmtDate);

        const series = data.series.map((s, i) => {
            const color = symbolColor(s.symbol);
            const firstIdx = s.ranks.findIndex(r => r !== null);
            const lastIdx = s.ranks.length - 1 - [...s.ranks].reverse().findIndex(r => r !== null);

            return {
                name: s.symbol,
                type: 'line',
                data: s.ranks.map((r, i) =>
                    r === null ? { value: null } : {
                        value: r,
                        label: {
                            show: i === firstIdx && i !== lastIdx,
                            formatter: s.symbol,
                            position: 'left',
                            color,
                            fontSize: 10,
                            fontWeight: '800',
                            distance: 8,
                        },
                    }
                ),
                smooth: 0.4,
                connectNulls: false,
                symbolSize: (val: number | null) => val === null ? 0 : 8,
                symbol: 'circle',
                lineStyle: { width: 3, color, shadowBlur: 10, shadowColor: color + '44' },
                itemStyle: { color, borderWidth: 3, borderColor: '#0f172a' },
                endLabel: {
                    show: true,
                    formatter: s.symbol,
                    color,
                    fontSize: 10,
                    fontWeight: '800',
                    distance: 10,
                },
                emphasis: {
                    scale: 1.5,
                    lineStyle: { width: 5 },
                    label: { show: true, fontSize: 12 }
                },
            };
        });

        return {
            backgroundColor: 'transparent',
            grid: { left: 40, right: 100, top: 40, bottom: 40, containLabel: true },
            xAxis: {
                type: 'category',
                data: xLabels,
                boundaryGap: true,
                axisLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } },
                axisTick: { show: false },
                axisLabel: { color: '#64748b', fontSize: 10, fontWeight: '700', margin: 20 },
            },
            yAxis: {
                type: 'value',
                min: 0.5,
                max: 10.5,
                inverse: true,
                interval: 1,
                axisLabel: {
                    formatter: (v: number) => Number.isInteger(v) ? `#${v}` : '',
                    color: '#94a3b8',
                    fontSize: 12,
                    fontWeight: '800',
                    fontFamily: 'JetBrains Mono, monospace'
                },
                splitLine: { lineStyle: { color: 'rgba(255,255,255,0.03)', type: 'solid' } },
                axisLine: { show: false },
                axisTick: { show: false },
            },
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'line', lineStyle: { color: 'rgba(255,255,255,0.1)', type: 'dashed' } },
                formatter: (params: any[]) => {
                    const date = params[0]?.axisValue ?? '';
                    const valid = params
                        .filter(p => p.value != null)
                        .sort((a, b) => (a.value ?? 11) - (b.value ?? 11));
                    if (!valid.length) return '';
                    return `
                        <div style="background:#0f172a; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.5)">
                            <div style="font-size:10px;font-weight:900;color:#64748b;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px">${date}</div>
                            ${valid.map(p => `
                                <div style="display:flex;align-items:center;gap:12px;margin-top:6px">
                                    <div style="width:12px;height:12px;border-radius:4px;background:${p.color}"></div>
                                    <span style="color:#ffffff;font-size:13px;font-weight:900;min-width:30px">#${p.value}</span>
                                    <span style="color:#94a3b8;font-size:12px;font-weight:700">${p.seriesName}</span>
                                </div>
                            `).join('')}
                        </div>
                    `;
                },
                renderMode: 'html',
                backgroundColor: 'transparent',
                borderWidth: 0,
            },
            series,
        };
    }, [data, symbolColor]);

    // ─── Render ───────────────────────────────────────────────────────────────

    return (
        <div className="space-y-8 max-w-full mx-auto px-4 pb-20">

            {loading ? <PageLoader text="Syncing institutional datasets..." /> : !data?.series?.length ? (
                <div className="flex flex-col items-center justify-center p-32 space-y-4">
                    <Activity className="w-12 h-12 text-slate-300 animate-pulse" />
                    <p className="text-slate-500 font-black uppercase tracking-widest">No data matching range</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-8">

                    {/* Bump Chart Terminal */}
                    <div className="bg-white/80 dark:bg-slate-950/40 backdrop-blur-2xl rounded-[2.5rem] border border-slate-200/50 dark:border-white/5 shadow-2xl overflow-hidden flex flex-col">
                        <div className="px-8 py-6 border-b border-slate-100 dark:border-white/5 bg-slate-50/20 dark:bg-white/[0.02] flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Activity className="w-5 h-5 text-indigo-500" />
                                <h2 className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-widest">
                                    Smart Money Net Accumulation History
                                </h2>
                            </div>
                            <div className="flex items-center gap-6">
                                <div className="flex p-1 bg-slate-100/50 dark:bg-slate-900/60 rounded-xl border border-slate-200/50 dark:border-white/5">
                                    {RANGES.map(r => (
                                        <button key={r} onClick={() => setRange(r)}
                                            className={cn(
                                                'px-4 py-1.5 text-[10px] font-black rounded-lg transition-all duration-300 tracking-widest uppercase',
                                                range === r
                                                    ? 'bg-white dark:bg-slate-800 text-orange-500 shadow-sm'
                                                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200',
                                            )}>
                                            {r}
                                        </button>
                                    ))}
                                </div>
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-100 dark:bg-white/5 px-3 py-1 rounded-lg">
                                    {data.dates.length} SESSIONS
                                </span>
                            </div>
                        </div>

                        <div className="p-4 sm:p-8">
                            <ReactECharts
                                option={chartOption}
                                style={{ height: '500px', width: '100%' }}
                                opts={{ renderer: 'svg' }}
                            />
                        </div>

                        {/* Legend Grid */}
                        <div className="px-8 pb-8 flex flex-wrap gap-4">
                            {data.series.map(s => (
                                <Link href={`/ticker/${s.symbol}`} key={s.symbol}>
                                    <div className="group flex items-center gap-3 px-4 py-2 bg-slate-50/50 dark:bg-white/[0.02] border border-slate-200/50 dark:border-white/5 rounded-2xl hover:bg-white dark:hover:bg-slate-800 transition-all hover:scale-105 cursor-pointer">
                                        <span
                                            className="w-3 h-3 rounded-full flex-shrink-0 animate-pulse"
                                            style={{ backgroundColor: symbolColor(s.symbol) }}
                                        />
                                        <div className="flex flex-col">
                                            <span className="text-xs font-black text-slate-900 dark:text-slate-200 group-hover:text-orange-500 transition-colors">
                                                {s.symbol}
                                            </span>
                                            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">
                                                Avg #{s.avg_rank.toFixed(1)} · {s.appearances}d
                                            </span>
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-8">
                        {/* Latest session spotlight (Full width) */}
                        <div className="bg-white/80 dark:bg-slate-950/40 backdrop-blur-2xl rounded-[2.5rem] border border-slate-200/50 dark:border-white/5 shadow-2xl overflow-hidden">
                            <div className="px-8 py-6 border-b border-slate-100 dark:border-white/5 bg-slate-50/20 dark:bg-white/[0.02] flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <Zap className="w-5 h-5 text-yellow-500" />
                                    <h2 className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-widest">
                                        Latest Tactical Pulse — {fmtDate(latestDate!)}
                                    </h2>
                                </div>
                            </div>
                            <div className="overflow-x-auto custom-scrollbar">
                                <table className="w-full text-xs border-separate border-spacing-0">
                                    <thead>
                                        <tr className="bg-slate-50/50 dark:bg-white/[0.01]">
                                            {['Rank', 'Symbol', 'LTP', 'Buy Price', 'Net Vol', 'Top 5 Sellers', 'Momentum'].map(h => (
                                                <th key={h} className="px-8 py-5 text-left font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-[10px] border-b border-slate-100 dark:border-white/5">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50 dark:divide-white/[0.02]">
                                        {latestWithTrend.map((entry, idx) => {
                                            const color = symbolColor(entry.symbol);
                                            const { rankChange } = entry;
                                            const isAccumulation = entry.volume > 0;

                                            return (
                                                <tr key={entry.symbol} className="group hover:bg-slate-50/60 dark:hover:bg-white/[0.02] transition-all duration-300">
                                                    <td className="px-8 py-5">
                                                        <div
                                                            className="w-9 h-9 rounded-2xl flex items-center justify-center text-xs font-black text-white shadow-lg shadow-inner"
                                                            style={{ backgroundColor: color, boxShadow: `0 8px 16px ${color}33` }}
                                                        >
                                                            {entry.rank}
                                                        </div>
                                                    </td>
                                                    <td className="px-8 py-5">
                                                        <Link href={`/ticker/${entry.symbol}`}>
                                                            <div className="font-black text-sm text-slate-900 dark:text-white group-hover:text-orange-500 transition-colors tracking-tight">
                                                                {entry.symbol}
                                                            </div>
                                                        </Link>
                                                    </td>
                                                    <td className="px-8 py-5 font-black text-slate-900 dark:text-white">
                                                        {entry.ltp ? `Rs. ${entry.ltp.toLocaleString()}` : <Minus className="w-3 h-3 text-slate-300" />}
                                                    </td>
                                                    <td className="px-8 py-5 text-slate-500 dark:text-slate-400 font-bold">
                                                        {entry.buy_price ? `Rs. ${entry.buy_price.toLocaleString()}` : <Minus className="w-3 h-3 text-slate-300" />}
                                                    </td>
                                                    <td className={cn(
                                                        "px-8 py-5 font-mono font-black tabular-nums",
                                                        isAccumulation ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                                                    )}>
                                                        {isAccumulation ? '+' : ''}{formatNepaliNumber(entry.volume)}
                                                    </td>
                                                    <td className="px-8 py-5">
                                                        <div className="flex gap-1.5 flex-wrap max-w-[200px]">
                                                            {entry.top_sellers?.slice(0, 5).map(b => (
                                                                <span key={b} className="px-2 py-1 rounded-lg text-[9px] font-black bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-900/50 hover:scale-110 transition-transform cursor-default">
                                                                    #{b}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </td>
                                                    <td className="px-8 py-5">
                                                        {rankChange === null ? (
                                                            <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-100/50 dark:bg-slate-800/50 px-3 py-1.5 rounded-full w-fit">
                                                                <Zap className="w-3 h-3 text-orange-500" />
                                                                New Focus
                                                            </div>
                                                        ) : rankChange > 0 ? (
                                                            <div className="flex items-center gap-2 text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest bg-emerald-50 dark:bg-emerald-950/30 px-3 py-1.5 rounded-full w-fit border border-emerald-100 dark:border-emerald-900/30">
                                                                <ArrowUp className="w-3 h-3" />
                                                                +{rankChange} Rank
                                                            </div>
                                                        ) : rankChange < 0 ? (
                                                            <div className="flex items-center gap-2 text-[10px] font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest bg-rose-50 dark:bg-rose-950/30 px-3 py-1.5 rounded-full w-fit border border-rose-100 dark:border-rose-900/30">
                                                                <ArrowDown className="w-3 h-3" />
                                                                {rankChange} Rank
                                                            </div>
                                                        ) : (
                                                            <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 dark:bg-slate-900/50 px-3 py-1.5 rounded-full w-fit">
                                                                <Minus className="w-3 h-3" />
                                                                Stable
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    {/* Daily Breakdown Grid */}
                    <div className="bg-white/80 dark:bg-slate-950/40 backdrop-blur-2xl rounded-[2.5rem] border border-slate-100 dark:border-white/5 shadow-2xl overflow-hidden">
                        <div className="px-8 py-6 border-b border-slate-100 dark:border-white/5 bg-slate-50/20 dark:bg-white/[0.02]">
                            <h2 className="text-sm font-black text-slate-900 dark:text-slate-100 uppercase tracking-widest flex items-center gap-3">
                                <Activity className="w-5 h-5 text-emerald-500" />
                                Daily Displacement Matrix
                            </h2>
                        </div>
                        <div className="p-8 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                            {[...data.dates].reverse().map(date => {
                                const entries = data.daily_rankings[date] ?? [];
                                return (
                                    <div key={date} className="flex flex-col h-full rounded-3xl border border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02] p-5 hover:border-orange-500/30 transition-all duration-300">
                                        <div className="flex items-center justify-between mb-4">
                                            <span className="text-[11px] font-black text-slate-900 dark:text-slate-100 uppercase tracking-widest">{fmtDate(date)}</span>
                                            <span className="text-[9px] font-mono text-slate-400">10 ITEMS</span>
                                        </div>

                                        <div className="space-y-2">
                                            {entries.map(entry => (
                                                <Link href={`/ticker/${entry.symbol}`} key={entry.symbol}>
                                                    <div className="group flex items-center gap-3 p-2 rounded-xl bg-white dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 hover:border-orange-500/50 transition-all cursor-pointer">
                                                        <span
                                                            className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black text-white shrink-0"
                                                            style={{ backgroundColor: symbolColor(entry.symbol) }}
                                                        >
                                                            {entry.rank}
                                                        </span>
                                                        <div className="flex flex-col min-w-0 flex-1">
                                                            <span className="text-[11px] font-black text-slate-900 dark:text-slate-200 truncate group-hover:text-orange-500 transition-colors">
                                                                {entry.symbol}
                                                            </span>
                                                            <div className="flex items-center gap-1">
                                                                <span className={cn(
                                                                    "text-[8px] font-mono tabular-nums",
                                                                    entry.volume > 0 ? "text-emerald-500" : "text-rose-500"
                                                                )}>
                                                                    {entry.volume > 0 ? '+' : ''}{formatNepaliNumber(entry.volume)}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </Link>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 10px; }
                .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); }
                .pulse-glow { animation: pulse-glow 2s infinite; }
                @keyframes pulse-glow {
                    0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.4); }
                    70% { transform: scale(1.05); box-shadow: 0 0 0 10px rgba(249, 115, 22, 0); }
                    100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(249, 115, 22, 0); }
                }
            `}</style>
        </div>
    );
}
