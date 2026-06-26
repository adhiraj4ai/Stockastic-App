'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import type { EChartsOption } from 'echarts';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

export interface CandleRow {
    date: string;
    open?: number | string;
    high?: number | string;
    low?: number | string;
    close?: number | string;
    volume?: number | string;
}

const num = (v: number | string | undefined): number => Number(v ?? 0) || 0;

export function toCandleSeries(rows: CandleRow[]): {
    dates: string[];
    ohlc: number[][];
    volumes: number[];
} {
    return {
        dates: rows.map((r) => r.date),
        ohlc: rows.map((r) => [num(r.open), num(r.close), num(r.low), num(r.high)]),
        volumes: rows.map((r) => num(r.volume)),
    };
}

function buildOption(rows: CandleRow[]): EChartsOption {
    const { dates, ohlc, volumes } = toCandleSeries(rows);
    return {
        tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
        grid: [
            { left: 48, right: 12, top: 8, height: '58%' },
            { left: 48, right: 12, bottom: 24, height: '18%' },
        ],
        xAxis: [
            { type: 'category', data: dates, boundaryGap: true, axisLabel: { color: '#6b7280', fontSize: 10 } },
            { type: 'category', gridIndex: 1, data: dates, axisLabel: { show: false } },
        ],
        yAxis: [
            { scale: true, axisLabel: { color: '#6b7280', fontSize: 10 } },
            { gridIndex: 1, splitNumber: 2, axisLabel: { show: false }, splitLine: { show: false } },
        ],
        series: [
            {
                name: 'Price', type: 'candlestick', data: ohlc,
                itemStyle: { color: '#10b981', color0: '#ef4444', borderColor: '#10b981', borderColor0: '#ef4444' },
            },
            { name: 'Volume', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, data: volumes, itemStyle: { color: '#6366f1', opacity: 0.45 } },
        ],
    };
}

export default function CandlestickChart({ rows }: { rows: CandleRow[] }) {
    if (!rows?.length) return null;
    return (
        <div className="w-full h-56">
            <ReactECharts option={buildOption(rows)} style={{ height: '100%', width: '100%' }} />
        </div>
    );
}
