'use client';

import ReactECharts from 'echarts-for-react';
import { InfoTooltip } from '@/components/ui/InfoTooltip';

function fmtPrice(n: number): string {
    return `रू${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function fmtReturn(n: number | null | undefined): string {
    if (n == null) return '—';
    return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
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

export function SectorWinRateChart({ winRates }: { winRates: Record<string, number> }) {
    const lags = ['5d', '10d', '20d', '30d'] as const;
    const values = lags.map(l => {
        const v = winRates[l] || 0;
        return +(v * 100).toFixed(1);
    });

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
            <div className="flex items-center mb-4">
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">Excess Return Probability (Win Rate)</h3>
                <InfoTooltip content="Shows the historical probability (%) that an accumulated sector outperforms the broad market across subsequent 5d, 10d, 20d, and 30d periods." />
            </div>
            <ReactECharts option={option} style={{ height: 240 }} notMerge />
        </div>
    );
}

export function SectorAvgReturnChart({
    avgReturns,
    medianReturns,
}: {
    avgReturns: Record<string, number>;
    medianReturns: Record<string, number>;
}) {
    const lags = ['5d', '10d', '20d', '30d'] as const;

    const option = {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'axis',
            backgroundColor: '#1e293b',
            borderColor: '#334155',
            textStyle: { color: '#e2e8f0', fontSize: 12 },
            formatter: (params: any[]) => {
                let s = `<b>${params[0].axisValue} Forward Edge</b><br/>`;
                params.forEach(p => {
                    s += `${p.marker} ${p.seriesName}: <b>${p.value >= 0 ? '+' : ''}${p.value}%</b><br/>`;
                });
                return s;
            }
        },
        legend: {
            data: ['Avg Excess Return', 'Median Excess Return'],
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
                name: 'Avg Excess Return',
                type: 'bar',
                data: lags.map(l => +(avgReturns[l] || 0).toFixed(2)),
                itemStyle: { color: '#10b981', borderRadius: [4, 4, 0, 0] },
                barMaxWidth: 32,
                label: { show: true, position: 'top', formatter: '{c}%', color: '#10b981', fontWeight: 700, fontSize: 10 },
            },
            {
                name: 'Median Excess Return',
                type: 'bar',
                data: lags.map(l => +(medianReturns[l] || 0).toFixed(2)),
                itemStyle: { color: '#6366f1', borderRadius: [4, 4, 0, 0] },
                barMaxWidth: 32,
                label: { show: true, position: 'top', formatter: '{c}%', color: '#6366f1', fontWeight: 700, fontSize: 10 },
            },
        ],
    };

    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center mb-4">
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">Avg vs Median Outperformance</h3>
                <InfoTooltip content="Illustrates typical sector excess returns. Use Median to understand the 'average' scenario without distortions, and Avg to gauge outlier potential." />
            </div>
            <ReactECharts option={option} style={{ height: 240 }} notMerge />
        </div>
    );
}

export function SectorScatterChart({ scatterData }: { scatterData: Array<any> }) {
    const filtered = scatterData.filter(d => d.intensity != null && d.excess_return_20d != null);

    // Regression line
    const pts: Array<[number, number]> = filtered.map(d => [d.intensity, d.excess_return_20d]);
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
                const [intensity, ret, sector, date] = p.data;
                return `<b>${sector}</b> (${date})<br/>Acc Intensity: ${fmtIntensity(intensity)}<br/>20d Excess Return: ${fmtReturn(ret)}`;
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
            name: '20d Excess Return (%)',
            nameLocation: 'middle',
            nameGap: 40,
            nameTextStyle: { color: '#64748b', fontSize: 11, fontWeight: 700 },
            axisLabel: { formatter: '{value}%', color: '#94a3b8', fontSize: 11 },
            splitLine: { lineStyle: { color: '#1e293b' } },
        },
        series: [
            {
                type: 'scatter',
                data: filtered.map(d => [d.intensity, d.excess_return_20d, d.sector, d.date]),
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
                <div className="flex items-center">
                    <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                        Intensity vs Subsequent 20d Outperformance
                    </h3>
                    <InfoTooltip content="Scatter plot demonstrating the correlation between the intensity of broker net-buying and the subsequent 20-day excess return. Shows if heavier buying translates to stronger outperformance, indicated by the dashed regression line." />
                </div>
                <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">{filtered.length} events</span>
            </div>
            <ReactECharts option={option} style={{ height: 300 }} notMerge />
        </div>
    );
}

export function SectorLagAnalysisChart({ lagAnalysis }: { lagAnalysis: Array<any> }) {
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
            data: ['Win Rate vs Broad Market', 'Avg Excess Return'],
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
                name: 'Avg Excess Return (%)',
                axisLabel: { formatter: '{value}%', color: '#10b981', fontSize: 10 },
                nameTextStyle: { color: '#10b981', fontSize: 10 },
                splitLine: { show: false },
            },
        ],
        series: [
            {
                name: 'Win Rate vs Broad Market',
                type: 'line',
                yAxisIndex: 0,
                data: sorted.map(d => +(d.win_rate * 100).toFixed(1)),
                lineStyle: { color: '#3b82f6', width: 2.5 },
                itemStyle: { color: '#3b82f6' },
                smooth: true,
                symbol: 'circle',
                symbolSize: 7,
            },
            {
                name: 'Avg Excess Return',
                type: 'line',
                yAxisIndex: 1,
                data: sorted.map(d => +(d.avg_excess_return || 0).toFixed(2)),
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
            <div className="flex items-center mb-4">
                <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                    Lag Analysis — Duration of Sector Edge
                </h3>
                <InfoTooltip content="Maps the predictive edge over time. Helps identify the 'sweet spot' for holding accumulated sectors before momentum decays." />
            </div>
            <ReactECharts option={option} style={{ height: 260 }} notMerge />
        </div>
    );
}
