'use client';

import React from 'react';
import ReactECharts from 'echarts-for-react';
import { useTheme } from 'next-themes';

interface MarketHealthRadarProps {
    data: {
        volume: number;
        turnover: number;
        breadth: number;
        volatility: number;
        participation: number;
    };
    height?: number | string;
}

export const MarketHealthRadar = ({ data, height = 300 }: MarketHealthRadarProps) => {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    const option = {
        radar: {
            indicator: [
                { name: 'Volume Momentum', max: 100 },
                { name: 'Turnover Strength', max: 100 },
                { name: 'Market Breadth', max: 100 },
                { name: 'Index Stability', max: 100 },
                { name: 'Sector Participation', max: 100 }
            ],
            shape: 'circle',
            splitNumber: 5,
            axisName: {
                color: isDark ? '#94a3b8' : '#0f172a',
                fontSize: 10,
                fontWeight: 'bold'
            },
            splitLine: {
                lineStyle: {
                    color: [
                        'rgba(203, 213, 225, 0.4)',
                        'rgba(203, 213, 225, 0.6)',
                        'rgba(203, 213, 225, 0.8)',
                        isDark ? 'rgba(51, 65, 85, 0.5)' : 'rgba(148, 163, 184, 0.5)',
                        isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(15, 23, 42, 0.1)'
                    ].reverse()
                }
            },
            splitArea: {
                show: false
            },
            axisLine: {
                lineStyle: {
                    color: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(15, 23, 42, 0.2)'
                }
            }
        },
        series: [
            {
                name: 'Market Health',
                type: 'radar',
                data: [
                    {
                        value: [
                            data.volume,
                            data.turnover,
                            data.breadth,
                            data.volatility,
                            data.participation
                        ],
                        name: 'Current Market State',
                        itemStyle: {
                            color: isDark ? '#60a5fa' : '#2563eb'
                        },
                        areaStyle: {
                            color: isDark ? 'rgba(96, 165, 250, 0.3)' : 'rgba(37, 99, 235, 0.3)'
                        },
                        lineStyle: {
                            width: 2
                        },
                        symbol: 'none'
                    }
                ]
            }
        ]
    };

    return <ReactECharts option={option} style={{ height: height, width: '100%' }} />;
};
