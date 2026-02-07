'use client';

import React from 'react';
import ReactECharts from 'echarts-for-react';
import { useTheme } from 'next-themes';

interface MarketHealthRadarProps {
    data: {
        volume: number; // 0-100 score
        turnover: number; // 0-100 score
        breadth: number; // 0-100 score (%)
        volatility: number; // 0-100 score (Stability)
        participation: number; // 0-100 score
    };
    rawData?: {
        volume: number;
        avgVolume: number;
        turnover: number;
        avgTurnover: number;
    };
    height?: number | string;
}

export const MarketHealthRadar = ({ data, rawData, height = 300 }: MarketHealthRadarProps) => {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    const option = {
        tooltip: {
            trigger: 'item',
            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
            borderColor: isDark ? '#1e293b' : '#e2e8f0',
            textStyle: { color: isDark ? '#f8fafc' : '#0f172a' },
            formatter: (params: any) => {
                let res = `<div style="font-weight: bold; margin-bottom: 6px;">${params.name}</div>`;
                if (rawData) {
                    const volDiff = ((rawData.volume - rawData.avgVolume) / (rawData.avgVolume || 1)) * 100;
                    const turnDiff = ((rawData.turnover - rawData.avgTurnover) / (rawData.avgTurnover || 1)) * 100;

                    res += `<div style="font-size: 11px; margin-bottom: 4px;">Volume: <span style="font-weight: bold; color: ${volDiff >= 0 ? '#10b981' : '#f43f5e'}">${volDiff >= 0 ? '+' : ''}${volDiff.toFixed(1)}% vs Avg</span></div>`;
                    res += `<div style="font-size: 11px;">Turnover: <span style="font-weight: bold; color: ${turnDiff >= 0 ? '#10b981' : '#f43f5e'}">${turnDiff >= 0 ? '+' : ''}${turnDiff.toFixed(1)}% vs Avg</span></div>`;
                }
                return res;
            }
        },
        radar: {
            indicator: [
                { name: 'Volume Momentum', max: 100 }, // Today's Vol vs Avg
                { name: 'Turnover Strength', max: 100 }, // Today's Turnover vs Avg
                { name: 'Market Breadth', max: 100 }, // Advance/Decline Ratio
                { name: 'Index Stability', max: 100 }, // Inverse of volatility
                { name: 'Breadth Quality', max: 100 } // Participation score
            ],
            shape: 'circle',
            splitNumber: 4,
            axisName: {
                color: isDark ? '#94a3b8' : '#64748b',
                fontSize: 10,
                fontWeight: 'bold',
                fontFamily: 'Inter'
            },
            splitLine: {
                lineStyle: {
                    color: [
                        'rgba(203, 213, 225, 0.2)',
                        'rgba(203, 213, 225, 0.3)',
                        'rgba(203, 213, 225, 0.4)',
                        'rgba(203, 213, 225, 0.6)'
                    ].reverse()
                }
            },
            splitArea: { show: false },
            axisLine: { lineStyle: { color: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(15, 23, 42, 0.1)' } }
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
                        name: 'Today vs Average',
                        itemStyle: { color: '#3b82f6' },
                        areaStyle: { color: 'rgba(59, 130, 246, 0.2)' },
                        lineStyle: { width: 2 },
                        symbol: 'circle',
                        symbolSize: 4
                    }
                ]
            }
        ]
    };

    return <ReactECharts option={option} style={{ height: height, width: '100%' }} />;
};
