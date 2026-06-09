'use client';

import React from 'react';
import ReactECharts from 'echarts-for-react';

interface SparklineProps {
    data: number[];
    color?: string;
    height?: number;
    width?: string | number;
}

export const Sparkline: React.FC<SparklineProps> = ({
    data,
    color = '#6366f1',
    height = 40,
    width = '100%'
}) => {
    const isPositive = data.length > 1 ? data[data.length - 1] >= data[0] : true;
    const finalColor = isPositive ? '#10b981' : '#ef4444';

    const option = {
        grid: {
            left: 0,
            right: 0,
            top: 2,
            bottom: 2,
        },
        xAxis: {
            type: 'category',
            show: false,
        },
        yAxis: {
            type: 'value',
            show: false,
            scale: true,
        },
        series: [
            {
                data: data,
                type: 'line',
                smooth: true,
                showSymbol: false,
                lineStyle: {
                    color: finalColor,
                    width: 1.5,
                },
                areaStyle: {
                    color: {
                        type: 'linear',
                        x: 0,
                        y: 0,
                        x2: 0,
                        y2: 1,
                        colorStops: [
                            { offset: 0, color: finalColor + '33' },
                            { offset: 1, color: finalColor + '00' }
                        ]
                    }
                }
            },
        ],
        animation: true,
        animationDuration: 1000,
    };

    return (
        <div style={{ height, width }}>
            <ReactECharts
                option={option as any}
                style={{ height: '100%', width: '100%' }}
                notMerge
            />
        </div>
    );
};
