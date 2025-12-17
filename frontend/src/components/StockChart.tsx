'use client';

import dynamic from 'next/dynamic';
import { EChartsOption } from 'echarts';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

interface StockData {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

interface StockChartProps {
    data: StockData[];
    ticker: string;
}

export default function StockChart({ data, ticker }: StockChartProps) {
    const dates = data.map(d => d.date);
    const ohlc = data.map(d => [
        parseFloat(d.open.toString()),
        parseFloat(d.close.toString()),
        parseFloat(d.low.toString()),
        parseFloat(d.high.toString())
    ]);
    const volumes = data.map(d => parseFloat(d.volume.toString()));

    const option: EChartsOption = {
        title: {
            text: ticker,
            left: 'center',
            textStyle: {
                color: '#1f2937',
                fontWeight: 700,
            },
        },
        tooltip: {
            trigger: 'axis',
            axisPointer: {
                type: 'cross',
            },
        },
        legend: {
            data: ['K-Line', 'Volume'],
            bottom: 0,
        },
        grid: [
            { left: '10%', right: '8%', bottom: '30%', height: '50%' },
            { left: '10%', right: '8%', bottom: '10%', height: '15%' },
        ],
        xAxis: [
            {
                type: 'category',
                data: dates,
                boundaryGap: false,
                axisLine: { lineStyle: { color: '#e5e7eb' } },
                axisLabel: { color: '#6b7280' },
                splitLine: { show: false },
            },
            {
                type: 'category',
                gridIndex: 1,
                data: dates,
                boundaryGap: false,
                axisLabel: { show: false },
                axisLine: { lineStyle: { color: '#e5e7eb' } },
                splitLine: { show: false },
            },
        ],
        yAxis: [
            {
                scale: true,
                splitArea: { show: true, areaStyle: { color: ['#fafafa', '#f5f5f5'] } },
                axisLabel: { color: '#6b7280' },
                axisLine: { lineStyle: { color: '#e5e7eb' } },
                splitLine: { lineStyle: { color: '#e5e7eb' } },
            },
            {
                scale: true,
                gridIndex: 1,
                splitNumber: 2,
                axisLabel: { show: false },
                axisLine: { show: false },
                axisTick: { show: false },
                splitLine: { show: false },
            },
        ],
        dataZoom: [
            { type: 'inside', xAxisIndex: [0, 1], start: 70, end: 100 },
            { show: true, xAxisIndex: [0, 1], type: 'slider', bottom: '2%', start: 70, end: 100 },
        ],
        series: [
            {
                name: 'K-Line',
                type: 'candlestick',
                data: ohlc,
                itemStyle: {
                    color: '#10b981',
                    color0: '#ef4444',
                    borderColor: '#10b981',
                    borderColor0: '#ef4444',
                },
            },
            {
                name: 'Volume',
                type: 'bar',
                xAxisIndex: 1,
                yAxisIndex: 1,
                data: volumes,
                itemStyle: {
                    color: '#3b82f6',
                    opacity: 0.5,
                },
            },
        ],
    };

    return (
        <div className="w-full h-[400px] bg-white rounded-lg border border-gray-200 p-4">
            <ReactECharts option={option} style={{ height: '100%', width: '100%' }} />
        </div>
    );
}
