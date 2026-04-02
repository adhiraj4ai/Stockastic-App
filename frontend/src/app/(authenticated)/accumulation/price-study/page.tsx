'use client';

import { useEffect, useState, useRef } from 'react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { PageLoader } from '@/components/ui/StockLoader';
import ReactECharts from 'echarts-for-react';
import {
    TrendingUp, X, Search, Activity,
    BarChart3, Target, History, ChevronRight,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StudyData {
    study: {
        total_events: number;
        symbols_covered: number;
        date_range: { from: string; to: string };
        lags: number[];
        win_rates: { '5d': number; '10d': number; '20d': number; '30d': number };
        avg_returns: { '5d': number; '10d': number; '20d': number; '30d': number };
        median_returns: { '5d': number; '10d': number; '20d': number; '30d': number };
        p25_returns: { '5d': number; '10d': number; '20d': number; '30d': number };
        p75_returns: { '5d': number; '10d': number; '20d': number; '30d': number };
        correlation: { volume_vs_5d: number; intensity_vs_20d: number };
        scatter_data: Array<{ intensity: number; return_10d: number; symbol: string; date: string }>;
        lag_analysis: Array<{ lag: number; win_rate: number; avg_return: number }>;
    };
}

interface ForecastData {
    symbol: string;
    current: {
        ltp: number;
        date: string;
        intensity: number;
        volume_spike: number;
        turnover_spike: number;
        net_acc_10d: number;
        avg_daily_volume_20d: number;
    };
    study: {
        total_events: number;
        win_rates: { '5d': number; '10d': number; '20d': number; '30d': number };
        avg_returns: { '5d': number; '10d': number; '20d': number; '30d': number };
        scatter_data: Array<{ intensity: number; return_10d: number; symbol: string; date: string }>;
        lag_analysis: Array<{ lag: number; win_rate: number; avg_return: number }>;
    };
    projection: {
        matched_events: number;
        match_range: string;
        bands: {
            '5d': { p10: number; p25: number; p50: number; p75: number; p90: number; date: string };
            '10d': { p10: number; p25: number; p50: number; p75: number; p90: number; date: string };
            '20d': { p10: number; p25: number; p50: number; p75: number; p90: number; date: string };
            '30d': { p10: number; p25: number; p50: number; p75: number; p90: number; date: string };
        };
    };
    history: Array<{
        date: string;
        intensity: number;
        volume_spike: number;
        entry_price: number;
        price_5d: number | null;
        return_5d: number | null;
        price_10d: number | null;
        return_10d: number | null;
        price_20d: number | null;
        return_20d: number | null;
        price_30d: number | null;
        return_30d: number | null;
        outcome: 'WON' | 'LOST' | 'PENDING';
    }>;
    price_series: Array<{
        date: string;
        close: number;
        intensity: number;
        volume: number;
        turnover: number;
        is_event: boolean;
    }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPrice(n: number): string {
    return `रू${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function fmtReturn(n: number | null | undefined): string {
    if (n == null) return '—';
    return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
}

function fmtPct(n: number): string {
    return n.toFixed(1) + '%';
}

function fmtIntensity(n: number): string {
    return n.toFixed(1) + 'x';
}

// Linear regression: y = a + b*x
function linearRegression(points: Array<[number, number]>): (x: number) => number {
    if (points.length < 2) return () => 0;
    const n = points.length;
    const sumX = points.reduce((s, p) => s + p[0], 0);
    const sumY = points.reduce((s, p) => s + p[1], 0);
    const sumXY = points.reduce((s, p) => s + p[0] * p[1], 0);
    const sumX2 = points.reduce((s, p) => s + p[0] * p[0], 0);
    const denom = n * sumX2 - sumX * sumX;
    if (denom === 0) return () => sumY / n;
    const b = (n * sumXY - sumX * sumY) / denom;
    const a = (sumY - b * sumX) / n;
    return (x: number) => a + b * x;
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
    label, value, sub, color = 'indigo',
}: {
    label: string;
    value: string;
    sub?: string;
    color?: 'emerald' | 'rose' | 'indigo' | 'blue' | 'orange';
}) {
    const colorMap = {
        emerald: 'text-emerald-500 dark:text-emerald-400 bg-emerald-500/10',
        rose: 'text-rose-500 dark:text-rose-400 bg-rose-500/10',
        indigo: 'text-indigo-500 dark:text-indigo-400 bg-indigo-500/10',
        blue: 'text-blue-500 dark:text-blue-400 bg-blue-500/10',
        orange: 'text-orange-500 dark:text-orange-400 bg-orange-500/10',
    };
    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-2xl p-5 flex flex-col gap-1.5 shadow-sm">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">{label}</span>
            <span className={cn('text-2xl font-black tabular-nums', colorMap[color].split(' ')[0])}>{value}</span>
            {sub && <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">{sub}</span>}
        </div>
    );
}

// ─── Win Rate Bar Chart ────────────────────────────────────────────────────────

function WinRateChart({ winRates }: { winRates: StudyData['study']['win_rates'] }) {
    const lags = ['5d', '10d', '20d', '30d'] as const;
    const values = lags.map(l => +winRates[l].toFixed(1));

    const option = {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'axis',
            formatter: (p: any[]) => `${p[0].name}: <b>${p[0].value}%</b>`,
            backgroundColor: '#1e293b',
            borderColor: '#334155',
            textStyle: { color: '#e2e8f0', fontSize: 12 },
        },
        grid: { left: 40, right: 20, top: 20, bottom: 30 },
        xAxis: {
            type: 'category',
            data: lags,
            axisLine: { lineStyle: { color: '#334155' } },
            axisLabel: { color: '#94a3b8', fontWeight: 700, fontSize: 12 },
        },
        yAxis: {
            type: 'value',
            min: 0,
            max: 100,
            axisLabel: { formatter: '{value}%', color: '#94a3b8', fontSize: 11 },
            splitLine: { lineStyle: { color: '#1e293b' } },
        },
        series: [{
            type: 'bar',
            data: values.map(v => ({
                value: v,
                itemStyle: {
                    color: v >= 60
                        ? '#10b981'
                        : v >= 50
                            ? '#6366f1'
                            : '#ef4444',
                    borderRadius: [6, 6, 0, 0],
                },
            })),
            label: {
                show: true,
                position: 'top',
                formatter: '{c}%',
                color: '#94a3b8',
                fontWeight: 700,
                fontSize: 11,
            },
            barMaxWidth: 48,
        }],
    };

    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4">Win Rate by Horizon</h3>
            <ReactECharts option={option} style={{ height: 240 }} notMerge />
        </div>
    );
}

// ─── Avg Return Bar Chart ──────────────────────────────────────────────────────

function AvgReturnChart({
    avgReturns,
    medianReturns,
}: {
    avgReturns: StudyData['study']['avg_returns'];
    medianReturns: StudyData['study']['median_returns'];
}) {
    const lags = ['5d', '10d', '20d', '30d'] as const;

    const option = {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'axis',
            backgroundColor: '#1e293b',
            borderColor: '#334155',
            textStyle: { color: '#e2e8f0', fontSize: 12 },
        },
        legend: {
            data: ['Avg Return', 'Median Return'],
            textStyle: { color: '#94a3b8', fontSize: 11, fontWeight: 700 },
            top: 0,
        },
        grid: { left: 50, right: 20, top: 40, bottom: 30 },
        xAxis: {
            type: 'category',
            data: lags,
            axisLine: { lineStyle: { color: '#334155' } },
            axisLabel: { color: '#94a3b8', fontWeight: 700, fontSize: 12 },
        },
        yAxis: {
            type: 'value',
            axisLabel: { formatter: '{value}%', color: '#94a3b8', fontSize: 11 },
            splitLine: { lineStyle: { color: '#1e293b' } },
        },
        series: [
            {
                name: 'Avg Return',
                type: 'bar',
                data: lags.map(l => +avgReturns[l].toFixed(2)),
                itemStyle: { color: '#10b981', borderRadius: [4, 4, 0, 0] },
                barMaxWidth: 32,
                label: { show: true, position: 'top', formatter: '{c}%', color: '#10b981', fontWeight: 700, fontSize: 10 },
            },
            {
                name: 'Median Return',
                type: 'bar',
                data: lags.map(l => +medianReturns[l].toFixed(2)),
                itemStyle: { color: '#6366f1', borderRadius: [4, 4, 0, 0] },
                barMaxWidth: 32,
                label: { show: true, position: 'top', formatter: '{c}%', color: '#6366f1', fontWeight: 700, fontSize: 10 },
            },
        ],
    };

    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4">Avg vs Median Return</h3>
            <ReactECharts option={option} style={{ height: 240 }} notMerge />
        </div>
    );
}

// ─── Scatter Chart ────────────────────────────────────────────────────────────

function ScatterChart({ scatterData }: { scatterData: StudyData['study']['scatter_data'] }) {
    const filtered = scatterData.filter(d => d.intensity != null && d.return_10d != null);

    // Regression line
    const pts: Array<[number, number]> = filtered.map(d => [d.intensity, d.return_10d]);
    const regFn = linearRegression(pts);
    const xMin = Math.min(...pts.map(p => p[0]));
    const xMax = Math.max(...pts.map(p => p[0]));
    const regLine = [[xMin, regFn(xMin)], [xMax, regFn(xMax)]];

    const option = {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'item',
            formatter: (p: any) => {
                if (p.seriesType === 'line') return '';
                const [intensity, ret, symbol, date] = p.data;
                return `<b>${symbol}</b> (${date})<br/>Intensity: ${fmtIntensity(intensity)}<br/>10d Return: ${fmtReturn(ret)}`;
            },
            backgroundColor: '#1e293b',
            borderColor: '#334155',
            textStyle: { color: '#e2e8f0', fontSize: 12 },
        },
        grid: { left: 55, right: 20, top: 20, bottom: 50 },
        xAxis: {
            type: 'value',
            name: 'Accumulation Intensity',
            nameLocation: 'middle',
            nameGap: 30,
            nameTextStyle: { color: '#64748b', fontSize: 11, fontWeight: 700 },
            axisLabel: { formatter: (v: number) => v + 'x', color: '#94a3b8', fontSize: 11 },
            splitLine: { lineStyle: { color: '#1e293b' } },
        },
        yAxis: {
            type: 'value',
            name: '10d Return (%)',
            nameLocation: 'middle',
            nameGap: 40,
            nameTextStyle: { color: '#64748b', fontSize: 11, fontWeight: 700 },
            axisLabel: { formatter: '{value}%', color: '#94a3b8', fontSize: 11 },
            splitLine: { lineStyle: { color: '#1e293b' } },
        },
        series: [
            {
                type: 'scatter',
                data: filtered.map(d => [d.intensity, d.return_10d, d.symbol, d.date]),
                symbolSize: 6,
                itemStyle: {
                    color: (p: any) => p.data[1] >= 0 ? '#10b981' : '#ef4444',
                    opacity: 0.65,
                },
            },
            {
                type: 'line',
                data: regLine,
                lineStyle: { color: '#6366f1', width: 2, type: 'dashed' },
                symbol: 'none',
                tooltip: { show: false },
            },
        ],
    };

    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                    Accumulation Intensity vs 10d Return
                </h3>
                <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">{filtered.length} events</span>
            </div>
            <ReactECharts option={option} style={{ height: 300 }} notMerge />
        </div>
    );
}

// ─── Lag Analysis Chart ───────────────────────────────────────────────────────

function LagAnalysisChart({ lagAnalysis }: { lagAnalysis: StudyData['study']['lag_analysis'] }) {
    const sorted = [...lagAnalysis].sort((a, b) => a.lag - b.lag);

    const option = {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'axis',
            backgroundColor: '#1e293b',
            borderColor: '#334155',
            textStyle: { color: '#e2e8f0', fontSize: 12 },
        },
        legend: {
            data: ['Win Rate', 'Avg Return'],
            textStyle: { color: '#94a3b8', fontSize: 11, fontWeight: 700 },
            top: 0,
        },
        grid: { left: 55, right: 55, top: 40, bottom: 40 },
        xAxis: {
            type: 'category',
            data: sorted.map(d => d.lag + 'd'),
            axisLabel: { color: '#94a3b8', fontWeight: 700, fontSize: 11 },
            axisLine: { lineStyle: { color: '#334155' } },
        },
        yAxis: [
            {
                type: 'value',
                name: 'Win Rate (%)',
                min: 0,
                max: 100,
                axisLabel: { formatter: '{value}%', color: '#3b82f6', fontSize: 10 },
                nameTextStyle: { color: '#3b82f6', fontSize: 10 },
                splitLine: { lineStyle: { color: '#1e293b' } },
            },
            {
                type: 'value',
                name: 'Avg Return (%)',
                axisLabel: { formatter: '{value}%', color: '#10b981', fontSize: 10 },
                nameTextStyle: { color: '#10b981', fontSize: 10 },
                splitLine: { show: false },
            },
        ],
        series: [
            {
                name: 'Win Rate',
                type: 'line',
                yAxisIndex: 0,
                data: sorted.map(d => +d.win_rate.toFixed(1)),
                lineStyle: { color: '#3b82f6', width: 2.5 },
                itemStyle: { color: '#3b82f6' },
                smooth: true,
                symbol: 'circle',
                symbolSize: 7,
            },
            {
                name: 'Avg Return',
                type: 'line',
                yAxisIndex: 1,
                data: sorted.map(d => +d.avg_return.toFixed(2)),
                lineStyle: { color: '#10b981', width: 2.5 },
                itemStyle: { color: '#10b981' },
                smooth: true,
                symbol: 'circle',
                symbolSize: 7,
            },
        ],
    };

    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4">
                Lag Analysis — Which Horizon Has the Best Edge?
            </h3>
            <ReactECharts option={option} style={{ height: 260 }} notMerge />
        </div>
    );
}

// ─── Price Projection Chart ────────────────────────────────────────────────────

function ProjectionChart({ forecast }: { forecast: ForecastData }) {
    const { price_series, projection, current } = forecast;

    // Historical price series (last 60 points)
    const hist = price_series.slice(-60);
    const histDates = hist.map(d => d.date);
    const histPrices = hist.map(d => d.close);

    // Event markers
    const eventData = hist
        .filter(d => d.is_event)
        .map(d => ({ xAxis: d.date, yAxis: d.close }));

    // Projection dates & bands
    const bands = projection.bands;
    const projDates = ['5d', '10d', '20d', '30d'].map(k => bands[k as keyof typeof bands].date);
    const allDates = [...histDates, ...projDates];
    const todayDate = current.date;

    // Build projection series - use null for historical portion
    const histLen = histDates.length;
    const makeProjectionSeries = (key: keyof typeof bands) =>
        (percentile: 'p10' | 'p25' | 'p50' | 'p75' | 'p90') => {
            const val = bands[key][percentile];
            // Return the value only at projection dates
            return val;
        };

    // Projection data: [date, p10, p25, p50, p75, p90] for each horizon
    const horizons = (['5d', '10d', '20d', '30d'] as const).map(k => ({
        key: k,
        date: bands[k].date,
        p10: bands[k].p10,
        p25: bands[k].p25,
        p50: bands[k].p50,
        p75: bands[k].p75,
        p90: bands[k].p90,
    }));

    // Build series data arrays indexed over allDates
    // Historical price: values for histDates, null for projDates
    const historicalSeries = allDates.map((d, i) => i < histLen ? histPrices[i] : null);

    // For projection bands: null for historical, connecting from last hist price to projections
    const lastPrice = histPrices[histPrices.length - 1];

    // The "anchor" point is the last history date with last price
    // We'll create separate series for each band level
    function buildBandSeries(percentile: 'p10' | 'p25' | 'p50' | 'p75' | 'p90') {
        return allDates.map((d, i) => {
            if (i === histLen - 1) return lastPrice; // anchor at today
            if (i < histLen - 1) return null;
            const hi = horizons.find(h => h.date === d);
            return hi ? hi[percentile] : null;
        });
    }

    const p10Series = buildBandSeries('p10');
    const p25Series = buildBandSeries('p25');
    const p50Series = buildBandSeries('p50');
    const p75Series = buildBandSeries('p75');
    const p90Series = buildBandSeries('p90');

    const option = {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'axis',
            backgroundColor: '#1e293b',
            borderColor: '#334155',
            textStyle: { color: '#e2e8f0', fontSize: 12 },
            formatter: (params: any[]) => {
                const date = params[0]?.axisValue;
                let html = `<b>${date}</b><br/>`;
                params.forEach((p: any) => {
                    if (p.value != null && p.seriesName !== 'P10-P90 Area' && p.seriesName !== 'P25-P75 Area') {
                        html += `${p.marker} ${p.seriesName}: <b>${fmtPrice(p.value)}</b><br/>`;
                    }
                });
                return html;
            },
        },
        legend: {
            data: ['Price', 'P50 (Median)', 'P25-P75 Range', 'P10-P90 Range'],
            textStyle: { color: '#94a3b8', fontSize: 10, fontWeight: 700 },
            top: 4,
        },
        grid: { left: 70, right: 20, top: 50, bottom: 50 },
        xAxis: {
            type: 'category',
            data: allDates,
            axisLabel: {
                color: '#94a3b8',
                fontSize: 10,
                rotate: 30,
                interval: Math.floor(allDates.length / 8),
            },
            axisLine: { lineStyle: { color: '#334155' } },
        },
        yAxis: {
            type: 'value',
            axisLabel: {
                formatter: (v: number) => `रू${v.toLocaleString()}`,
                color: '#94a3b8',
                fontSize: 10,
            },
            splitLine: { lineStyle: { color: '#1e293b' } },
        },
        series: [
            // Historical price line
            {
                name: 'Price',
                type: 'line',
                data: historicalSeries,
                lineStyle: { color: '#e2e8f0', width: 2 },
                itemStyle: { color: '#e2e8f0' },
                symbol: 'none',
                connectNulls: false,
                markPoint: {
                    data: eventData.map(e => ({
                        coord: [e.xAxis, e.yAxis],
                        symbol: 'circle',
                        symbolSize: 10,
                        itemStyle: { color: '#f97316' },
                        label: { show: false },
                    })),
                },
                markLine: {
                    data: [{ xAxis: todayDate }],
                    lineStyle: { color: '#6366f1', type: 'dashed', width: 2 },
                    label: {
                        formatter: 'Today',
                        color: '#6366f1',
                        fontWeight: 700,
                        fontSize: 11,
                    },
                    symbol: 'none',
                },
            },
            // P10-P90 outer band (wide)
            {
                name: 'P10-P90 Range',
                type: 'line',
                data: p10Series,
                lineStyle: { opacity: 0 },
                areaStyle: { opacity: 0 },
                symbol: 'none',
                stack: 'band_outer',
                connectNulls: false,
            },
            {
                name: 'P10-P90 Area',
                type: 'line',
                data: p90Series.map((v, i) => v != null && p10Series[i] != null ? v - p10Series[i]! : null),
                lineStyle: { opacity: 0 },
                areaStyle: { color: '#3b82f6', opacity: 0.12 },
                symbol: 'none',
                stack: 'band_outer',
                connectNulls: false,
                tooltip: { show: false },
            },
            // P25-P75 inner band (tighter)
            {
                name: 'P25-P75 Range',
                type: 'line',
                data: p25Series,
                lineStyle: { opacity: 0 },
                areaStyle: { opacity: 0 },
                symbol: 'none',
                stack: 'band_inner',
                connectNulls: false,
            },
            {
                name: 'P25-P75 Area',
                type: 'line',
                data: p75Series.map((v, i) => v != null && p25Series[i] != null ? v - p25Series[i]! : null),
                lineStyle: { opacity: 0 },
                areaStyle: { color: '#3b82f6', opacity: 0.25 },
                symbol: 'none',
                stack: 'band_inner',
                connectNulls: false,
                tooltip: { show: false },
            },
            // P50 median dashed line
            {
                name: 'P50 (Median)',
                type: 'line',
                data: p50Series,
                lineStyle: { color: '#3b82f6', width: 2, type: 'dashed' },
                itemStyle: { color: '#3b82f6' },
                symbol: 'circle',
                symbolSize: 6,
                connectNulls: false,
            },
        ],
    };

    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                    Price Projection — {forecast.symbol}
                </h3>
                <div className="flex items-center gap-3 text-[11px] text-slate-400 font-medium">
                    <span className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full bg-orange-400 inline-block" />
                        Acc. Event
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-4 border-t-2 border-dashed border-indigo-500 inline-block" />
                        Today
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-4 border-t-2 border-dashed border-blue-500 inline-block" />
                        P50
                    </span>
                </div>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-4">
                Based on {forecast.projection.matched_events} matched historical events ({forecast.projection.match_range} intensity range)
            </p>
            <ReactECharts option={option} style={{ height: 360 }} notMerge />
        </div>
    );
}

// ─── Projection Target Cards ──────────────────────────────────────────────────

function ProjectionTargets({ forecast }: { forecast: ForecastData }) {
    const lags = ['5d', '10d', '20d', '30d'] as const;
    const { bands } = forecast.projection;
    const winRates = forecast.study.win_rates;

    return (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {lags.map(lag => {
                const band = bands[lag];
                const wr = winRates[lag];
                const isGood = wr >= 60;

                return (
                    <div
                        key={lag}
                        className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col gap-3"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">+{lag}</span>
                            <span className={cn(
                                'text-[11px] font-bold px-2 py-0.5 rounded-full',
                                isGood
                                    ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/15'
                                    : 'text-rose-700 dark:text-rose-400 bg-rose-100 dark:bg-rose-500/15'
                            )}>
                                Win {fmtPct(wr)}
                            </span>
                        </div>

                        <div>
                            <div className="text-[10px] text-slate-400 font-medium mb-0.5">Target Range (P25–P75)</div>
                            <div className="text-base font-black text-slate-900 dark:text-white tabular-nums">
                                {fmtPrice(band.p25)} – {fmtPrice(band.p75)}
                            </div>
                        </div>

                        <div className="flex justify-between text-[11px] font-bold">
                            <div className="flex flex-col gap-0.5">
                                <span className="text-slate-400 font-medium">Conservative</span>
                                <span className="text-rose-500">{fmtPrice(band.p10)}</span>
                            </div>
                            <div className="flex flex-col gap-0.5 items-end">
                                <span className="text-slate-400 font-medium">Optimistic</span>
                                <span className="text-emerald-500">{fmtPrice(band.p90)}</span>
                            </div>
                        </div>

                        <div className="text-[10px] text-slate-400 font-medium">
                            Median: <span className="text-blue-500 font-bold">{fmtPrice(band.p50)}</span>
                            <span className="mx-1.5 text-slate-600">·</span>
                            Target date: <span className="text-slate-600 dark:text-slate-300 font-bold">{band.date}</span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ─── Historical Events Table ──────────────────────────────────────────────────

function HistoryTable({ history }: { history: ForecastData['history'] }) {
    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                <History size={16} className="text-orange-500" />
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">Historical Accumulation Events</h3>
                <span className="ml-auto text-[11px] text-slate-400">{history.length} events</span>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                    <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-800">
                            {['Date', 'Intensity', 'Entry', '+5d', '+10d', '+20d', '+30d', 'Outcome'].map(col => (
                                <th
                                    key={col}
                                    className="px-4 py-3 text-left font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[10px] whitespace-nowrap"
                                >
                                    {col}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {history.map((row, i) => (
                            <tr
                                key={i}
                                className={cn(
                                    'border-b border-slate-50 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors',
                                    i % 2 === 0 ? '' : 'bg-slate-50/50 dark:bg-slate-900/30'
                                )}
                            >
                                <td className="px-4 py-3 font-mono font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap">{row.date}</td>
                                <td className="px-4 py-3 font-bold text-orange-500">{fmtIntensity(row.intensity)}</td>
                                <td className="px-4 py-3 font-bold text-slate-700 dark:text-slate-300 tabular-nums">{fmtPrice(row.entry_price)}</td>
                                <td className={cn('px-4 py-3 font-bold tabular-nums', row.return_5d == null ? 'text-slate-400' : row.return_5d >= 0 ? 'text-emerald-500' : 'text-rose-500')}>
                                    {fmtReturn(row.return_5d)}
                                </td>
                                <td className={cn('px-4 py-3 font-bold tabular-nums', row.return_10d == null ? 'text-slate-400' : row.return_10d >= 0 ? 'text-emerald-500' : 'text-rose-500')}>
                                    {fmtReturn(row.return_10d)}
                                </td>
                                <td className={cn('px-4 py-3 font-bold tabular-nums', row.return_20d == null ? 'text-slate-400' : row.return_20d >= 0 ? 'text-emerald-500' : 'text-rose-500')}>
                                    {fmtReturn(row.return_20d)}
                                </td>
                                <td className={cn('px-4 py-3 font-bold tabular-nums', row.return_30d == null ? 'text-slate-400' : row.return_30d >= 0 ? 'text-emerald-500' : 'text-rose-500')}>
                                    {fmtReturn(row.return_30d)}
                                </td>
                                <td className="px-4 py-3">
                                    <span className={cn(
                                        'text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider',
                                        row.outcome === 'WON'
                                            ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                                            : row.outcome === 'LOST'
                                                ? 'bg-rose-100 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400'
                                                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                                    )}>
                                        {row.outcome}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ─── Symbol Forecast View ─────────────────────────────────────────────────────

function SymbolForecastView({ forecast, loadingForecast }: { forecast: ForecastData | null; loadingForecast: boolean }) {
    if (loadingForecast) {
        return (
            <div className="flex items-center justify-center py-32">
                <PageLoader />
            </div>
        );
    }

    if (!forecast) {
        return (
            <div className="flex flex-col items-center justify-center py-32 gap-3 text-slate-400 dark:text-slate-500">
                <Activity size={40} className="opacity-30" />
                <p className="text-base font-bold">No forecast data found for this symbol.</p>
                <p className="text-sm">Make sure the symbol has recent accumulation events.</p>
            </div>
        );
    }

    const { current, study } = forecast;

    return (
        <div className="space-y-6">
            {/* Current State Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                    label="LTP"
                    value={fmtPrice(current.ltp)}
                    sub={`As of ${current.date}`}
                    color="indigo"
                />
                <StatCard
                    label="Accumulation Intensity"
                    value={fmtIntensity(current.intensity)}
                    sub="vs avg daily volume"
                    color={current.intensity >= 5 ? 'emerald' : current.intensity >= 2 ? 'orange' : 'indigo'}
                />
                <StatCard
                    label="Volume Spike"
                    value={fmtIntensity(current.volume_spike)}
                    sub="relative to 20d avg"
                    color={current.volume_spike >= 3 ? 'emerald' : 'indigo'}
                />
                <StatCard
                    label="Net Acc. (10d)"
                    value={current.net_acc_10d.toLocaleString()}
                    sub="shares net accumulated"
                    color={current.net_acc_10d > 0 ? 'emerald' : 'rose'}
                />
            </div>

            {/* Win rates summary */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                    <Target size={16} className="text-blue-500" />
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                        Symbol Study — {study.total_events} historical events
                    </span>
                </div>
                <div className="grid grid-cols-4 gap-4">
                    {(['5d', '10d', '20d', '30d'] as const).map(lag => (
                        <div key={lag} className="text-center">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">+{lag}</div>
                            <div className={cn(
                                'text-xl font-black tabular-nums',
                                study.win_rates[lag] >= 60 ? 'text-emerald-500' : study.win_rates[lag] >= 50 ? 'text-indigo-500' : 'text-rose-500'
                            )}>
                                {fmtPct(study.win_rates[lag])}
                            </div>
                            <div className="text-[10px] text-slate-400 font-medium mt-0.5">win rate</div>
                            <div className={cn(
                                'text-xs font-bold mt-1',
                                study.avg_returns[lag] >= 0 ? 'text-emerald-500' : 'text-rose-500'
                            )}>
                                avg {fmtReturn(study.avg_returns[lag])}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Price Projection Chart */}
            <ProjectionChart forecast={forecast} />

            {/* Projection Target Cards */}
            <div>
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                    <Target size={15} className="text-blue-500" />
                    Projection Targets
                </h3>
                <ProjectionTargets forecast={forecast} />
            </div>

            {/* Historical Events Table */}
            {forecast.history.length > 0 && <HistoryTable history={forecast.history} />}
        </div>
    );
}

// ─── Market Study View ────────────────────────────────────────────────────────

function MarketStudyView({ data, loading }: { data: StudyData | null; loading: boolean }) {
    if (loading) {
        return (
            <div className="flex items-center justify-center py-32">
                <PageLoader />
            </div>
        );
    }

    if (!data) {
        return (
            <div className="flex flex-col items-center justify-center py-32 gap-3 text-slate-400 dark:text-slate-500">
                <BarChart3 size={40} className="opacity-30" />
                <p className="text-base font-bold">No study data available.</p>
            </div>
        );
    }

    const { study } = data;

    return (
        <div className="space-y-6">
            {/* Evidence Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                    label="Total Events Studied"
                    value={study.total_events.toLocaleString()}
                    sub={`${study.symbols_covered} symbols · ${study.date_range.from} to ${study.date_range.to}`}
                    color="indigo"
                />
                <StatCard
                    label="20d Win Rate"
                    value={fmtPct(study.win_rates['20d'])}
                    sub="% of events where price rose"
                    color={study.win_rates['20d'] >= 60 ? 'emerald' : study.win_rates['20d'] >= 50 ? 'indigo' : 'rose'}
                />
                <StatCard
                    label="Avg 20d Return"
                    value={fmtReturn(study.avg_returns['20d'])}
                    sub={`Median: ${fmtReturn(study.median_returns['20d'])}`}
                    color={study.avg_returns['20d'] >= 0 ? 'emerald' : 'rose'}
                />
                <StatCard
                    label="Intensity Correlation"
                    value={study.correlation.intensity_vs_20d.toFixed(3)}
                    sub="intensity vs 20d return (r)"
                    color={Math.abs(study.correlation.intensity_vs_20d) > 0.3 ? 'emerald' : 'indigo'}
                />
            </div>

            {/* Win Rate + Avg Return Charts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <WinRateChart winRates={study.win_rates} />
                <AvgReturnChart avgReturns={study.avg_returns} medianReturns={study.median_returns} />
            </div>

            {/* Scatter Chart */}
            {study.scatter_data.length > 0 && (
                <ScatterChart scatterData={study.scatter_data} />
            )}

            {/* Lag Analysis */}
            {study.lag_analysis.length > 0 && (
                <LagAnalysisChart lagAnalysis={study.lag_analysis} />
            )}
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AccumulationPriceStudyPage() {
    const [symbol, setSymbol] = useState('');
    const [inputValue, setInputValue] = useState('');
    const [studyData, setStudyData] = useState<StudyData | null>(null);
    const [forecastData, setForecastData] = useState<ForecastData | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingForecast, setLoadingForecast] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    // Fetch market-wide study on mount
    useEffect(() => {
        const fetchMarketStudy = async () => {
            setLoading(true);
            try {
                const res = await api.get('/api/stocks/accumulation-study/');
                setStudyData(res.data);
            } catch (err) {
                console.error('Failed to fetch accumulation study', err);
            } finally {
                setLoading(false);
            }
        };
        fetchMarketStudy();
    }, []);

    // Fetch symbol-specific data when symbol changes
    useEffect(() => {
        if (!symbol) {
            setForecastData(null);
            return;
        }

        const fetchSymbolData = async () => {
            setLoadingForecast(true);
            try {
                const [forecastRes] = await Promise.all([
                    api.get(`/api/stocks/accumulation-forecast/${symbol}/`),
                ]);
                setForecastData(forecastRes.data);
            } catch (err) {
                console.error('Failed to fetch symbol forecast', err);
                setForecastData(null);
            } finally {
                setLoadingForecast(false);
            }
        };
        fetchSymbolData();
    }, [symbol]);

    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            const val = inputValue.trim().toUpperCase();
            if (val) setSymbol(val);
        }
    };

    const handleInputBlur = () => {
        const val = inputValue.trim().toUpperCase();
        if (val) setSymbol(val);
    };

    const clearSymbol = () => {
        setSymbol('');
        setInputValue('');
        setForecastData(null);
        inputRef.current?.focus();
    };

    const isSymbolMode = !!symbol;

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-center gap-4">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="p-2 rounded-xl bg-orange-500/10">
                            <TrendingUp size={20} className="text-orange-500" />
                        </div>
                        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                            Accumulation → Price Study
                        </h1>
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 font-medium ml-12">
                        {isSymbolMode
                            ? `Showing forecast for ${symbol} based on historical accumulation events`
                            : 'Does broker accumulation predict future price? Here\'s proof.'}
                    </p>
                </div>

                {/* Symbol Search */}
                <div className="flex items-center gap-2.5 shrink-0">
                    <div className="relative">
                        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <input
                            ref={inputRef}
                            type="text"
                            value={inputValue}
                            onChange={e => setInputValue(e.target.value.toUpperCase())}
                            onKeyDown={handleInputKeyDown}
                            onBlur={handleInputBlur}
                            placeholder="Enter symbol (e.g. NABIL)"
                            className={cn(
                                'pl-10 pr-9 py-2.5 text-sm font-bold rounded-xl border transition-all duration-200 outline-none w-56',
                                'bg-white dark:bg-slate-900 text-slate-900 dark:text-white',
                                'placeholder:text-slate-400 placeholder:font-normal',
                                isSymbolMode
                                    ? 'border-orange-400 dark:border-orange-500 ring-2 ring-orange-400/20'
                                    : 'border-slate-200 dark:border-slate-700 focus:border-indigo-400 dark:focus:border-indigo-500 focus:ring-2 focus:ring-indigo-400/20'
                            )}
                        />
                        {inputValue && (
                            <button
                                onClick={clearSymbol}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    {isSymbolMode && (
                        <button
                            onClick={clearSymbol}
                            className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 hover:text-slate-700 dark:hover:text-white px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500 transition-all"
                        >
                            <X size={12} />
                            Market Study
                        </button>
                    )}
                </div>
            </div>

            {/* Mode Indicator */}
            {isSymbolMode && (
                <div className="flex items-center gap-2 text-[12px] text-slate-500 dark:text-slate-400">
                    <button
                        onClick={clearSymbol}
                        className="font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                    >
                        Market Study
                    </button>
                    <ChevronRight size={12} />
                    <span className="font-black text-orange-500 dark:text-orange-400">{symbol}</span>
                </div>
            )}

            {/* Content */}
            {isSymbolMode ? (
                <SymbolForecastView forecast={forecastData} loadingForecast={loadingForecast} />
            ) : (
                <MarketStudyView data={studyData} loading={loading} />
            )}
        </div>
    );
}
