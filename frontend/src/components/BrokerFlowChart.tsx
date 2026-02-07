'use client';

import React from 'react';
import ReactECharts from 'echarts-for-react';
import { useTheme } from 'next-themes';

interface BrokerFlowChartProps {
    data: {
        broker: string;
        total_turnover: number;
        top_picks: { ticker: string; turnover: number }[];
    }[];
    height?: number | string;
}

export const BrokerFlowChart = ({ data, height = 350 }: BrokerFlowChartProps) => {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    if (!data || data.length === 0) return null;

    // Transform data for ECharts (Bar chart with stack for top picks)
    const brokers = data.map(d => `Broker ${d.broker}`);

    // We need to normalize the stack data. Each broker has top 3 picks.
    // Series 1: Pick 1 turnover
    // Series 2: Pick 2 turnover
    // Series 3: Pick 3 turnover

    const series1 = data.map(d => d.top_picks[0] ? { value: d.top_picks[0].turnover, name: d.top_picks[0].ticker } : { value: 0, name: '' });
    const series2 = data.map(d => d.top_picks[1] ? { value: d.top_picks[1].turnover, name: d.top_picks[1].ticker } : { value: 0, name: '' });
    const series3 = data.map(d => d.top_picks[2] ? { value: d.top_picks[2].turnover, name: d.top_picks[2].ticker } : { value: 0, name: '' });

    const option = {
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
            borderColor: isDark ? '#1e293b' : '#e2e8f0',
            textStyle: { color: isDark ? '#f8fafc' : '#0f172a' },
            formatter: (params: any) => {
                let res = `<div style="font-weight: bold; margin-bottom: 8px;">${params[0].axisValue}</div>`;
                let total = 0;
                params.forEach((p: any) => {
                    if (p.value > 0) {
                        res += `
                            <div style="display: flex; justify-content: space-between; gap: 16px; margin-bottom: 4px;">
                                <span style="display: flex; align-items: center; gap: 6px;">
                                    <span style="width: 8px; height: 8px; border-radius: 50%; background: ${p.color};"></span>
                                    ${p.data.name}
                                </span>
                                <span style="font-weight: bold;">Rs. ${(p.value / 1000000).toFixed(1)}M</span>
                            </div>
                        `;
                        total += p.value;
                    }
                });
                res += `<div style="margin-top: 8px; border-top: 1px solid ${isDark ? '#334155' : '#e2e8f0'}; padding-top: 6px; display: flex; justify-content: space-between;">
                    <span>Total Buy</span>
                    <span style="font-weight: bold;">Rs. ${(total / 1000000).toFixed(1)}M</span>
                </div>`;
                return res;
            }
        },
        grid: {
            top: 30,
            left: '3%',
            right: '4%',
            bottom: '3%',
            containLabel: true
        },
        xAxis: {
            type: 'value',
            axisLabel: {
                formatter: (val: number) => `Rs.${(val / 1000000).toFixed(0)}M`,
                color: isDark ? '#94a3b8' : '#64748b',
                fontSize: 10
            },
            splitLine: {
                lineStyle: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }
            }
        },
        yAxis: {
            type: 'category',
            data: brokers,
            axisLabel: {
                color: isDark ? '#f8fafc' : '#0f172a',
                fontWeight: 'bold',
                fontSize: 11
            },
            axisLine: { show: false },
            axisTick: { show: false }
        },
        series: [
            {
                name: 'Pick 1',
                type: 'bar',
                stack: 'total',
                label: { show: true, position: 'inside', formatter: (p: any) => p.data.name, fontSize: 9, color: '#fff', fontWeight: 'bold' },
                data: series1,
                itemStyle: { color: '#3b82f6', borderRadius: [0, 4, 4, 0] }
            },
            {
                name: 'Pick 2',
                type: 'bar',
                stack: 'total',
                label: { show: true, position: 'inside', formatter: (p: any) => p.data.name, fontSize: 9, color: '#fff', fontWeight: 'bold' },
                data: series2,
                itemStyle: { color: '#6366f1' }
            },
            {
                name: 'Pick 3',
                type: 'bar',
                stack: 'total',
                label: { show: true, position: 'inside', formatter: (p: any) => p.data.name, fontSize: 9, color: '#fff', fontWeight: 'bold' },
                data: series3,
                itemStyle: { color: '#8b5cf6', borderRadius: [0, 4, 4, 0] } // visually rouding end only if last? Hard with stack. Actually just round last one.
            }
        ]
    };

    return <ReactECharts option={option} style={{ height: height, width: '100%' }} />;
};
