'use client';

import React from 'react';
import ReactECharts from 'echarts-for-react';
import { useTheme } from 'next-themes';

interface StockData {
    ticker: string;
    name?: string;
    price?: number;
    change: number;
    percent_change: number;
}

interface IndividualStockChartProps {
    stock: StockData;
    height?: number | string;
    color?: string;
}

export const IndividualStockChart = ({ stock, height = 120, color = '#10b981' }: IndividualStockChartProps) => {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    // Generate dates for the last 30 days
    const dates = Array.from({ length: 30 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (29 - i));
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    });

    // Simulate 30-day performance data for the stock
    // Use price if available, otherwise use a normalized base of 100
    const baseVal = stock.price || 100;
    const data: number[] = [baseVal];

    // Generate random walk backward from current price
    for (let i = 1; i < 30; i++) {
        const volatility = 0.015;
        const change = 1 + (Math.random() - 0.5) * volatility;
        const prevPrice = data[0] / change;
        data.unshift(prevPrice);
    }

    // Convert to percentage change relative to 30 days ago
    const startPrice = data[0];
    const relativeData = data.map(p => ((p - startPrice) / startPrice) * 100);

    const option = {
        backgroundColor: 'transparent',
        tooltip: {
            show: false, // Cleaner for small charts in a grid
            trigger: 'axis'
        },
        grid: {
            top: 5,
            left: 0,
            right: 0,
            bottom: 0,
            containLabel: false
        },
        xAxis: {
            type: 'category',
            data: dates,
            show: false
        },
        yAxis: {
            type: 'value',
            show: false,
            min: 'dataMin',
            max: 'dataMax'
        },
        series: [
            {
                name: stock.ticker,
                type: 'line',
                data: relativeData,
                smooth: true,
                symbol: 'none',
                lineStyle: { width: 2, color: color },
                areaStyle: {
                    color: {
                        type: 'linear',
                        x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [
                            { offset: 0, color: `${color}33` },
                            { offset: 1, color: `${color}00` }
                        ]
                    }
                }
            }
        ]
    };

    return (
        <div className="space-y-2">
            <div className="flex justify-between items-end px-1">
                <div className="flex flex-col">
                    <span className="text-xs font-black text-slate-800 dark:text-slate-100 tracking-tighter uppercase">{stock.ticker}</span>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">{stock.name || 'Equity'}</span>
                </div>
                <div className="flex flex-col items-end">
                    <span className={`text-[10px] font-black ${stock.change >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {stock.change >= 0 ? '+' : ''}{stock.percent_change.toFixed(2)}%
                    </span>
                    <span className="text-[9px] font-mono font-bold text-slate-500 tabular-nums">Rs. {Number(stock.price || 0).toLocaleString()}</span>
                </div>
            </div>
            <div className="h-[60px] w-full">
                <ReactECharts option={option} style={{ height: '100%', width: '100%' }} />
            </div>
        </div>
    );
};
