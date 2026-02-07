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

interface TopGainersChartProps {
    gainers: StockData[];
    height?: number | string;
}

export const TopGainersChart = ({ gainers, height = 300 }: TopGainersChartProps) => {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    // Take top 5 gainers
    const targetGainers = gainers.slice(0, 5);

    // Generate dates for the last 30 days
    const dates = Array.from({ length: 30 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (29 - i));
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    });

    // Simulate 30-day performance data for each gainer
    const series = targetGainers.map((stock, index) => {
        // Use price if available, otherwise use a normalized base of 100 for percentage visualization
        const baseVal = stock.price || 100;
        let currentPrice = baseVal / (1 + stock.percent_change / 100);
        const data = [baseVal];

        // Generate random walk backward from current price
        for (let i = 1; i < 30; i++) {
            const volatility = 0.02;
            const change = 1 + (Math.random() - 0.5) * volatility;
            const prevPrice = data[0] / change;
            data.unshift(prevPrice);
        }

        const colors = [
            '#3b82f6', // blue
            '#10b981', // emerald
            '#f59e0b', // amber
            '#8b5cf6', // violet
            '#ec4899'  // pink
        ];

        return {
            name: stock.ticker,
            type: 'line',
            data: data,
            smooth: true,
            symbol: 'none',
            lineStyle: { width: 3, color: colors[index % colors.length] },
            emphasis: {
                focus: 'series',
                lineStyle: { width: 4 }
            }
        };
    });

    const option = {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'axis',
            backgroundColor: isDark ? '#1e293b' : '#ffffff',
            borderColor: isDark ? '#334155' : '#e2e8f0',
            textStyle: { color: isDark ? '#f1f5f9' : '#1e293b' },
            formatter: (params: any) => {
                let res = `<div style="font-weight: bold; margin-bottom: 4px;">${params[0].axisValue}</div>`;
                params.forEach((item: any) => {
                    res += `
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
                            <span style="display: flex; align-items: center; gap: 4px;">
                                <span style="width: 8px; height: 8px; border-radius: 50%; background: ${item.color};"></span>
                                ${item.seriesName}
                            </span>
                            <span style="font-weight: bold; color: ${isDark ? '#f1f5f9' : '#1e293b'}">
                                Rs. ${item.value.toFixed(2)}
                            </span>
                        </div>
                    `;
                });
                return res;
            }
        },
        legend: {
            data: targetGainers.map(s => s.ticker),
            bottom: 0,
            textStyle: { fontSize: 10, color: isDark ? '#94a3b8' : '#64748b', fontWeight: 'bold' },
            icon: 'rect'
        },
        grid: {
            top: 40,
            left: '3%',
            right: '4%',
            bottom: '15%',
            containLabel: true
        },
        xAxis: {
            type: 'category',
            data: dates,
            axisLine: { lineStyle: { color: isDark ? '#1e293b' : '#e2e8f0' } },
            axisLabel: {
                fontSize: 9,
                color: isDark ? '#64748b' : '#94a3b8',
                interval: 5
            }
        },
        yAxis: {
            type: 'value',
            axisLabel: {
                formatter: (val: number) => `Rs.${val.toFixed(0)}`,
                fontSize: 9,
                color: isDark ? '#64748b' : '#94a3b8'
            },
            splitLine: { lineStyle: { type: 'dashed', color: isDark ? '#1e293b' : '#f1f5f9' } }
        },
        series: series
    };

    return <ReactECharts option={option} style={{ height: height, width: '100%' }} />;
};
