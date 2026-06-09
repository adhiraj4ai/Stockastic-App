'use client';

import React from 'react';
import ReactECharts from 'echarts-for-react';
import { useTheme } from 'next-themes';

interface SentimentGaugeProps {
    value: number; // 0 to 100
    height?: number | string;
}

export const SentimentGauge = ({ value, height = 200 }: SentimentGaugeProps) => {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    const option = {
        series: [
            {
                type: 'gauge',
                startAngle: 180,
                endAngle: 0,
                center: ['50%', '75%'],
                radius: '90%',
                min: 0,
                max: 100,
                splitNumber: 5,
                axisLine: {
                    lineStyle: {
                        width: 6,
                        color: [
                            [0.2, '#f43f5e'], // Rose
                            [0.4, '#fb923c'], // Orange
                            [0.6, '#eab308'], // Yellow
                            [0.8, '#a3e635'], // Lime
                            [1, '#10b981'] // Emerald
                        ]
                    }
                },
                pointer: {
                    icon: 'path://M12.8,0.7l12,14c0.4,0.5,0.1,1.2-0.6,1.2H0.8c-0.7,0-1-0.7-0.6-1.2l12-14C12.3,0.3,12.7,0.3,12.8,0.7z',
                    length: '12%',
                    width: 12,
                    offsetCenter: [0, '-55%'],
                    itemStyle: {
                        color: 'auto'
                    }
                },
                axisTick: {
                    length: 12,
                    lineStyle: {
                        color: 'auto',
                        width: 2
                    }
                },
                splitLine: {
                    length: 20,
                    lineStyle: {
                        color: 'auto',
                        width: 5
                    }
                },
                axisLabel: {
                    distance: -30,
                    formatter: function (value: number) {
                        if (value === 0) return '{fear|FEAR}';
                        if (value === 50) return '{neutral|NEUTRAL}';
                        if (value === 100) return '{greed|GREED}';
                        return '';
                    },
                    rich: {
                        fear: {
                            color: '#f43f5e',
                            fontSize: 12,
                            fontWeight: 'bold',
                            padding: [0, 0, -20, 0]
                        },
                        neutral: {
                            color: isDark ? '#94a3b8' : '#64748b',
                            fontSize: 10,
                            fontWeight: 'bold',
                            padding: [0, 0, -20, 0]
                        },
                        greed: {
                            color: '#10b981',
                            fontSize: 12,
                            fontWeight: 'bold',
                            padding: [0, 0, -20, 0]
                        }
                    }
                },
                title: {
                    offsetCenter: [0, '-20%'],
                    fontSize: 12,
                    fontWeight: 'bold',
                    color: isDark ? '#f1f5f9' : '#0f172a'
                },
                detail: {
                    fontSize: 24,
                    offsetCenter: [0, '0%'],
                    valueAnimation: true,
                    formatter: function (value: number) {
                        return Math.round(value).toString();
                    },
                    color: 'inherit'
                },
                data: [
                    {
                        value: value,
                        name: 'Market Mood'
                    }
                ]
            }
        ]
    };

    return <ReactECharts option={option} style={{ height: height, width: '100%' }} />;
};
