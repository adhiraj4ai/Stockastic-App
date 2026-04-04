'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import api from '@/lib/api';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { PageLoader } from '@/components/ui/StockLoader';
import { formatNepaliNumber } from '@/lib/formatters';
import ReactECharts from 'echarts-for-react';
import { Flame, ArrowUp, ArrowDown, Minus, Crown } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface DayRankEntry {
    symbol: string;
    rank: number;
    volume: number;
    top_brokers?: number[];
}

interface SeriesEntry {
    symbol: string;
    ranks: (number | null)[];
    volumes: (number | null)[];
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

const RANGES = ['1W', '1M'] as const;
type Range = typeof RANGES[number];

const PALETTE = [
    '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e',
    '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6',
    '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e',
    '#ce1126', '#8b4513', '#ff8c00', '#2e8b57'
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
    const prevDate   = data?.dates?.[data.dates.length - 2] ?? null;

    const latestRanking = latestDate ? (data?.daily_rankings[latestDate] ?? []) : [];
    const prevRanking   = prevDate   ? (data?.daily_rankings[prevDate]   ?? []) : [];

    // Rank change for each entry in today's top 5
    const latestWithTrend = latestRanking.map(entry => {
        const prev = prevRanking.find(p => p.symbol === entry.symbol);
        const change = prev ? prev.rank - entry.rank : null; // positive = improved (moved up)
        return { ...entry, rankChange: change };
    });

    // ─── Bump Chart ───────────────────────────────────────────────────────────

    const chartOption = useMemo(() => {
        if (!data?.series?.length) return {};

        const xLabels = data.dates.map(fmtDate);

        const series = data.series.map((s, i) => {
            const color = PALETTE[i % PALETTE.length];
            const firstIdx = s.ranks.findIndex(r => r !== null);
            const lastIdx  = s.ranks.length - 1 - [...s.ranks].reverse().findIndex(r => r !== null);

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
                            fontWeight: '600',
                            distance: 8,
                        },
                    }
                ),
                smooth: 0.35,
                connectNulls: false,
                symbolSize: (val: number | null) => val === null ? 0 : 9,
                symbol: 'circle',
                lineStyle: { width: 2.5, color },
                itemStyle: { color, borderWidth: 2, borderColor: '#0f172a' },
                endLabel: {
                    show: true,
                    formatter: s.symbol,
                    color,
                    fontSize: 10,
                    fontWeight: '600',
                    distance: 8,
                },
                emphasis: { scale: 1.4 },
            };
        });

        return {
            backgroundColor: 'transparent',
            grid: { left: 20, right: 80, top: 16, bottom: 32, containLabel: true },
            xAxis: {
                type: 'category',
                data: xLabels,
                boundaryGap: true,
                axisLine: { lineStyle: { color: '#1e293b' } },
                axisTick: { show: false },
                axisLabel: { color: '#64748b', fontSize: 10, interval: 0 },
            },
            yAxis: {
                type: 'value',
                min: 0.5,
                max: 10.5,
                inverse: true,
                interval: 1,
                axisLabel: {
                    formatter: (v: number) => Number.isInteger(v) ? `#${v}` : '',
                    color: '#64748b',
                    fontSize: 11,
                    fontWeight: '600',
                },
                splitLine: { lineStyle: { color: '#1e293b', type: 'dashed', opacity: 0.5 } },
                axisLine: { show: false },
                axisTick: { show: false },
            },
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'line', lineStyle: { color: '#334155', type: 'dashed' } },
                formatter: (params: any[]) => {
                    const date = params[0]?.axisValue ?? '';
                    const valid = params
                        .filter(p => p.value != null)
                        .sort((a, b) => (a.value ?? 11) - (b.value ?? 11));
                    if (!valid.length) return '';
                    return `
                        <div style="font-size:11px;font-weight:600;color:#94a3b8;margin-bottom:6px">${date}</div>
                        ${valid.map(p => `
                            <div style="display:flex;align-items:center;gap:8px;margin-top:4px;font-size:12px">
                                <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};flex-shrink:0"></span>
                                <span style="color:#64748b;font-weight:700;min-width:22px">#${p.value}</span>
                                <span style="color:#e2e8f0;font-weight:600">${p.seriesName}</span>
                            </div>
                        `).join('')}
                    `;
                },
                backgroundColor: '#0f172a',
                borderColor: '#1e293b',
                textStyle: { color: '#e2e8f0' },
                extraCssText: 'border-radius:10px;padding:12px 16px;box-shadow:0 8px 32px rgba(0,0,0,0.5)',
            },
            series,
        };
    }, [data]);

    // ─── Render ───────────────────────────────────────────────────────────────

    return (
        <div className="space-y-6 max-w-[1200px] mx-auto px-1">

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start gap-4 justify-between">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <Flame className="w-4 h-4 text-amber-500" />
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                            Broker Focus Ranking · {range} Window
                        </span>
                    </div>
                    <p className="text-xs text-slate-400 max-w-lg">
                        Each day's top-10 brokers by buy volume — and the 10 stocks they collectively focused on most.
                        Lines connect the same stock across dates; rank 1 = highest broker attention.
                    </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                    {RANGES.map(r => (
                        <button key={r} onClick={() => setRange(r)}
                            className={cn(
                                'px-3 py-1.5 text-[11px] font-semibold rounded-lg border transition-all',
                                range === r
                                    ? 'bg-slate-800 dark:bg-slate-100 border-slate-800 dark:border-slate-100 text-white dark:text-slate-900 shadow-sm'
                                    : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-500',
                            )}>
                            {r}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? <PageLoader text="Computing broker focus rankings..." /> : !data?.series?.length ? (
                <div className="p-16 text-center text-slate-400 text-sm">No data for this period</div>
            ) : (
                <>
                    {/* Bump Chart */}
                    <div className="bg-white dark:bg-slate-950/40 backdrop-blur-xl rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02] flex items-center justify-between">
                            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                                <Crown className="w-4 h-4 text-amber-500" />
                                Stock Rank Movement
                            </h2>
                            <span className="text-[10px] text-slate-400 tabular-nums">
                                {data.dates.length} trading days · {data.series.length} stocks tracked
                            </span>
                        </div>

                        <div className="px-4 pt-6 pb-4">
                            <ReactECharts
                                option={chartOption}
                                style={{ height: '340px' }}
                                opts={{ renderer: 'svg' }}
                            />
                        </div>

                        {/* Color legend */}
                        <div className="px-5 pb-5 flex flex-wrap gap-3">
                            {data.series.map(s => (
                                <div key={s.symbol} className="flex items-center gap-1.5">
                                    <span
                                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: symbolColor(s.symbol) }}
                                    />
                                    <Link href={`/ticker/${s.symbol}`}>
                                        <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:underline">
                                            {s.symbol}
                                        </span>
                                    </Link>
                                    <span className="text-[10px] text-slate-400">
                                        {s.appearances}d · avg #{s.avg_rank.toFixed(1)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Latest session spotlight */}
                    {latestWithTrend.length > 0 && (
                        <div className="bg-white dark:bg-slate-950/40 backdrop-blur-xl rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm overflow-hidden">
                            <div className="px-5 py-4 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02]">
                                <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                                    Latest Session — {fmtDate(latestDate!)}
                                </h2>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                                        <tr>
                                            {['Rank', 'Symbol', 'Volume', 'Top Buyers', 'vs Prev Day'].map(h => (
                                                <th key={h} className="px-5 py-3 text-left font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[10px]">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
                                        {latestWithTrend.map(entry => {
                                            const color = symbolColor(entry.symbol);
                                            const { rankChange } = entry;
                                            return (
                                                <tr key={entry.symbol} className="hover:bg-slate-50/60 dark:hover:bg-white/[0.02] transition-colors">
                                                    <td className="px-5 py-3">
                                                        <span
                                                            className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold text-white"
                                                            style={{ backgroundColor: color }}
                                                        >
                                                            {entry.rank}
                                                        </span>
                                                    </td>
                                                    <td className="px-5 py-3">
                                                        <Link href={`/ticker/${entry.symbol}`}>
                                                            <span className="font-semibold text-slate-700 dark:text-slate-200 hover:underline">
                                                                {entry.symbol}
                                                            </span>
                                                        </Link>
                                                    </td>
                                                    <td className="px-5 py-3 tabular-nums text-slate-600 dark:text-slate-300">
                                                        {formatNepaliNumber(entry.volume)}
                                                    </td>
                                                    <td className="px-5 py-3">
                                                        <div className="flex gap-1 flex-wrap">
                                                            {entry.top_brokers?.map(b => (
                                                                <span key={b} className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                                                                    #{b}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </td>
                                                    <td className="px-5 py-3">
                                                        {rankChange === null ? (
                                                            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 font-medium">
                                                                <span className="w-4 h-4 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                                                                    <Minus className="w-2.5 h-2.5" />
                                                                </span>
                                                                New entry
                                                            </span>
                                                        ) : rankChange > 0 ? (
                                                            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                                                                <ArrowUp className="w-3.5 h-3.5" />
                                                                +{rankChange} rank{rankChange > 1 ? 's' : ''}
                                                            </span>
                                                        ) : rankChange < 0 ? (
                                                            <span className="inline-flex items-center gap-1 text-[11px] text-rose-600 dark:text-rose-400 font-semibold">
                                                                <ArrowDown className="w-3.5 h-3.5" />
                                                                {rankChange} rank{Math.abs(rankChange) > 1 ? 's' : ''}
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 font-medium">
                                                                <Minus className="w-3 h-3" />
                                                                Unchanged
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Daily rankings grid */}
                    <div className="bg-white dark:bg-slate-950/40 backdrop-blur-xl rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02]">
                            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Daily Breakdown</h2>
                        </div>
                        <div className="p-5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                            {data.dates.map(date => {
                                const entries = data.daily_rankings[date] ?? [];
                                return (
                                    <div key={date} className="space-y-4 p-3 rounded-xl border border-slate-100 dark:border-white/5 bg-slate-50/30 dark:bg-slate-900/20">
                                        <div>
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="text-[10px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                                                    {fmtDate(date)}
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap gap-1 mb-3">
                                                {data.daily_top_brokers?.[date]?.slice(0, 5).map(b => (
                                                    <span key={b} className="px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/20 text-[9px] font-bold text-amber-700 dark:text-amber-400">
                                                        #{b}
                                                    </span>
                                                ))}
                                                {data.daily_top_brokers?.[date]?.length > 5 && (
                                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-medium text-slate-400">
                                                        +{data.daily_top_brokers[date].length - 5}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="space-y-1.5">
                                                {entries.map(entry => (
                                                    <Link href={`/ticker/${entry.symbol}`} key={entry.symbol}>
                                                        <div className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-white dark:hover:bg-white/5 shadow-sm border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition-all">
                                                            <span
                                                                className="w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                                                                style={{ backgroundColor: symbolColor(entry.symbol) }}
                                                            >
                                                                {entry.rank}
                                                            </span>
                                                            <div className="flex flex-col min-w-0">
                                                                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate">
                                                                    {entry.symbol}
                                                                </span>
                                                                <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                                                    {entry.top_brokers?.slice(0, 5).map(b => (
                                                                        <span key={b} className="text-[8px] font-medium text-slate-400">#{b}</span>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                            <span className="text-[9px] font-mono text-slate-500 m-auto mr-0 whitespace-nowrap">
                                                                {formatNepaliNumber(entry.volume)}
                                                            </span>
                                                        </div>
                                                    </Link>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
