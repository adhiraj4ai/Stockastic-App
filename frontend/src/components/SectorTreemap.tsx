'use client';

import React from 'react';
import ReactECharts from 'echarts-for-react';
import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';

interface SectorSummary {
    name: string;
    change: number;
    turnover: number;
    volume: number;
    count: number;
}

interface SectorTreemapProps {
    sectors: SectorSummary[];
    height?: number | string;
}

export const SectorTreemap = ({ sectors, height = 250 }: SectorTreemapProps) => {
    const { theme } = useTheme();
    const router = useRouter();
    const isDark = theme === 'dark';

    if (!sectors || sectors.length === 0) return null;

    const data = sectors.map(s => ({
        name: s.name,
        value: s.turnover, // Area size = Turnover
        change: s.change, // Color = Change
        itemStyle: {
            color: s.change > 0
                ? `rgba(16, 185, 129, ${Math.min(0.9, 0.3 + (s.change / 5))})` // Green intensity
                : `rgba(244, 63, 94, ${Math.min(0.9, 0.3 + (Math.abs(s.change) / 5))})` // Red intensity
        }
    }));

    const option = {
        tooltip: {
            formatter: (info: any) => {
                const value = info.value;
                const change = info.data.change;
                return `
                    <div style="font-weight: bold; margin-bottom: 4px;">${info.name}</div>
                    <div style="font-size: 11px;">
                        Turnover: Rs. ${(value / 1000000).toFixed(1)}M<br/>
                        Change: <span style="color: ${change >= 0 ? '#10b981' : '#f43f5e'}">${change >= 0 ? '+' : ''}${change.toFixed(2)}%</span>
                    </div>
                `;
            },
            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
            borderColor: isDark ? '#1e293b' : '#e2e8f0',
            textStyle: { color: isDark ? '#f8fafc' : '#0f172a' }
        },
        series: [
            {
                type: 'treemap',
                data: data,
                width: '100%',
                height: '100%',
                roam: false,
                nodeClick: false, // Disable default zoom
                breadcrumb: { show: false },
                label: {
                    show: true,
                    formatter: '{b}\n{c}',
                    fontSize: 10,
                    fontWeight: 'bold',
                    color: '#fff'
                },
                itemStyle: {
                    borderColor: isDark ? '#0f172a' : '#fff',
                    borderWidth: 1,
                    gapWidth: 1
                },
                emphasis: {
                    itemStyle: {
                        shadowBlur: 10,
                        shadowColor: 'rgba(0, 0, 0, 0.3)'
                    }
                }
            }
        ]
    };

    // Custom label formatter to show Name + Change%
    // ECharts treemap value is fixed to area size, so we cheat with formatter
    (option.series[0].label as any).formatter = (params: any) => {
        return `${params.name}\n${params.data.change > 0 ? '+' : ''}${params.data.change.toFixed(1)}%`;
    };

    return <ReactECharts option={option} style={{ height: height, width: '100%', borderRadius: '12px', overflow: 'hidden' }} />;
};
