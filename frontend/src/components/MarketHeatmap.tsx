'use client';

import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';

interface StockData {
    ticker: string;
    close: number;
    percent_change: number;
    turnover: number;
    sector: string;
}

interface MarketHeatmapProps {
    stocks: StockData[];
    height?: number | string;
}

export const MarketHeatmap: React.FC<MarketHeatmapProps> = ({
    stocks,
    height = 500
}) => {
    const router = useRouter();
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    const chartData = useMemo(() => {
        const sectors: Record<string, any[]> = {};

        stocks.forEach(stock => {
            const sector = stock.sector || 'Others';
            if (!sectors[sector]) {
                sectors[sector] = [];
            }
            sectors[sector].push({
                name: stock.ticker,
                value: [stock.turnover, stock.percent_change, stock.close],
                ticker: stock.ticker,
            });
        });

        return Object.entries(sectors).map(([name, children]) => ({
            name,
            children,
        }));
    }, [stocks]);

    const option = {
        tooltip: {
            formatter: (info: any) => {
                const value = info.value;
                const ticker = info.data.ticker;
                if (!ticker) return info.name;

                const change = value[1];
                const turnover = (value[0] / 1000000).toFixed(2);
                const color = change >= 0 ? '#10b981' : '#ef4444';

                return [
                    `<div style="font-weight:bold; font-size:16px; margin-bottom:4px; color: ${isDark ? '#f8fafc' : '#0f172a'};">${ticker}</div>`,
                    `<div style="display:flex; justify-content:space-between; gap:20px; color: ${isDark ? '#cbd5e1' : '#475569'};">`,
                    `<span>Change:</span> <span style="color:${color}; font-weight:bold;">${change.toFixed(2)}%</span>`,
                    `</div>`,
                    `<div style="display:flex; justify-content:space-between; gap:20px; color: ${isDark ? '#cbd5e1' : '#475569'};">`,
                    `<span>Turnover:</span> <span>Rs. ${turnover}M</span>`,
                    `</div>`,
                    `<div style="display:flex; justify-content:space-between; gap:20px; color: ${isDark ? '#cbd5e1' : '#475569'};">`,
                    `<span>LTP:</span> <span>Rs. ${value[2]}</span>`,
                    `</div>`
                ].join('');
            },
            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
            borderColor: isDark ? '#1e293b' : '#e2e8f0',
            textStyle: {
                color: isDark ? '#f8fafc' : '#0f172a'
            }
        },
        series: [{
            name: 'Market',
            type: 'treemap',
            visibleMin: 300,
            label: {
                show: true,
                formatter: (params: any) => {
                    const ticker = params.data.ticker;
                    if (!ticker) return params.name;
                    return `{name|${ticker}}\n{change|${params.value[1].toFixed(1)}%}`;
                },
                rich: {
                    name: {
                        fontSize: 14,
                        fontWeight: 'bold',
                        color: '#fff',
                        padding: [5, 0]
                    },
                    change: {
                        fontSize: 12,
                        color: '#fff'
                    }
                }
            },
            upperLabel: {
                show: true,
                height: 30,
                color: isDark ? '#e2e8f0' : '#333',
                fontWeight: 'bold',
                backgroundColor: isDark ? '#1e293b' : '#f1f5f9',
            },
            itemStyle: {
                borderColor: '#fff',
                borderWidth: 1,
                gapWidth: 1
            },
            breadcrumb: {
                show: false
            },
            levels: [
                {
                    itemStyle: {
                        borderColor: '#94a3b8',
                        borderWidth: 0,
                        gapWidth: 4
                    },
                    upperLabel: {
                        show: true
                    }
                },
                {
                    itemStyle: {
                        borderColor: '#cbd5e1',
                        borderWidth: 1,
                        gapWidth: 1
                    },
                    colorSelection: true,
                    // Color based on performance
                    color: ['#ef4444', '#f87171', '#cbd5e1', '#4ade80', '#10b981'],
                    colorMappingBy: 'value',
                    visualMin: -5,
                    visualMax: 5,
                    visualDimension: 1, // Index 1 is percent_change
                }
            ],
            data: chartData
        }]
    };

    const onChartClick = (params: any) => {
        if (params.data && params.data.ticker) {
            router.push(`/ticker/${params.data.ticker}`);
        }
    };

    return (
        <ReactECharts
            option={option}
            style={{ height, width: '100%' }}
            onEvents={{ click: onChartClick }}
        />
    );
};
