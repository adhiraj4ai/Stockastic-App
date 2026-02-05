'use client';

import React from 'react';
import ReactECharts from 'echarts-for-react';
import { useTheme } from 'next-themes';

interface MarketBreadthTrendProps {
    height?: number | string;
}

export const MarketBreadthTrend = ({ height = 180 }: MarketBreadthTrendProps) => {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    // Simulated 5-day history of Advancers vs Decliners
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    const advancers = [120, 145, 110, 160, 147];
    const decliners = [150, 120, 155, 100, 169];

    const option = {
        tooltip: {
            trigger: 'axis',
        },
        legend: {
            data: ['Advancers', 'Decliners'],
            bottom: 0,
            textStyle: { fontSize: 10, color: isDark ? '#64748b' : '#94a3b8' },
            icon: 'circle'
        },
        grid: {
            top: 20,
            left: '3%',
            right: '4%',
            bottom: '15%',
            containLabel: true
        },
        xAxis: {
            type: 'category',
            data: days,
            axisLine: { lineStyle: { color: isDark ? '#1e293b' : '#e2e8f0' } },
            axisLabel: { fontSize: 10, color: isDark ? '#64748b' : '#94a3b8' }
        },
        yAxis: {
            type: 'value',
            splitLine: { lineStyle: { type: 'dashed', color: isDark ? '#1e293b' : '#f1f5f9' } },
            axisLabel: { fontSize: 10, color: isDark ? '#64748b' : '#94a3b8' }
        },
        series: [
            {
                name: 'Advancers',
                type: 'line',
                data: advancers,
                smooth: true,
                symbol: 'none',
                lineStyle: { color: '#10b981', width: 2 },
                areaStyle: {
                    color: {
                        type: 'linear',
                        x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [{ offset: 0, color: 'rgba(16, 185, 129, 0.2)' }, { offset: 1, color: 'rgba(16, 185, 129, 0)' }]
                    }
                }
            },
            {
                name: 'Decliners',
                type: 'line',
                data: decliners,
                smooth: true,
                symbol: 'none',
                lineStyle: { color: '#f43f5e', width: 2 },
                areaStyle: {
                    color: {
                        type: 'linear',
                        x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [{ offset: 0, color: 'rgba(244, 63, 94, 0.2)' }, { offset: 1, color: 'rgba(244, 63, 94, 0)' }]
                    }
                }
            }
        ]
    };

    return <ReactECharts option={option} style={{ height: height, width: '100%' }} />;
};
