'use client';

import React from 'react';
import ReactECharts from 'echarts-for-react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';

interface StockData {
    ticker: string;
    percent_change: number;
    turnover: number;
    sector?: string;
}

interface MarketBubbleMapProps {
    stocks: StockData[];
    height?: number | string;
}

export const MarketBubbleMap = ({ stocks, height = 400 }: MarketBubbleMapProps) => {
    const router = useRouter();
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    // Grouping by sector or just showing bubbles
    // Map data for ECharts graph
    const data = stocks.map((stock) => ({
        name: stock.ticker,
        value: Number(stock.turnover),
        symbolSize: Math.max(20, Math.min(80, (Number(stock.turnover) / 1000000) * 10)),
        itemStyle: {
            color: stock.percent_change > 0 ? '#10b981' : (stock.percent_change < 0 ? '#f43f5e' : '#94a3b8'),
            opacity: 0.8,
            borderColor: isDark ? '#1e293b' : '#fff',
            borderWidth: 1,
            shadowBlur: 10,
            shadowColor: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.1)'
        },
        label: {
            show: true,
            fontSize: 10,
            fontWeight: 'bold',
            color: '#fff'
        }
    }));

    const option = {
        tooltip: {
            trigger: 'item',
            formatter: function (params: any) {
                const stock = stocks.find(s => s.ticker === params.name);
                if (!stock) return params.name;
                return `
                    <div style="padding: 12px; font-family: sans-serif; background: ${isDark ? '#0f172a' : '#fff'}; border-radius: 8px;">
                        <div style="font-weight: bold; font-size: 14px; margin-bottom: 6px; color: ${isDark ? '#f8fafc' : '#0f172a'};">${stock.ticker}</div>
                        <div style="display: flex; justify-between; gap: 16px; font-size: 11px;">
                            <span style="color: ${isDark ? '#94a3b8' : '#64748b'};">Change:</span>
                            <span style="color: ${stock.percent_change >= 0 ? '#10b981' : '#f43f5e'}; font-weight: bold;">
                                ${stock.percent_change >= 0 ? '+' : ''}${stock.percent_change.toFixed(2)}%
                            </span>
                        </div>
                        <div style="display: flex; justify-between; gap: 16px; font-size: 11px; margin-top: 6px;">
                            <span style="color: ${isDark ? '#94a3b8' : '#64748b'};">Turnover:</span>
                            <span style="color: ${isDark ? '#f1f5f9' : '#0f172a'}; font-weight: bold;">Rs. ${(stock.turnover / 1000000).toFixed(2)}M</span>
                        </div>
                    </div>
                `;
            },
            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
            borderColor: isDark ? '#1e293b' : '#e2e8f0',
            borderWidth: 1,
            padding: 0
        },
        series: [
            {
                type: 'graph',
                layout: 'force',
                animation: true,
                data: data,
                force: {
                    repulsion: 100,
                    edgeLength: 5,
                    gravity: 0.1
                },
                roam: true,
                draggable: true,
                emphasis: {
                    focus: 'adjacency',
                    lineStyle: {
                        width: 10
                    },
                    itemStyle: {
                        opacity: 1,
                        shadowBlur: 20
                    }
                }
            }
        ]
    };

    const onChartClick = (params: any) => {
        if (params.name) {
            router.push(`/ticker/${params.name}`);
        }
    };

    return (
        <ReactECharts
            option={option}
            style={{ height: height, width: '100%' }}
            onEvents={{ click: onChartClick }}
        />
    );
};
