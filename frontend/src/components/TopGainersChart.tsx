'use client';

import React, { useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import { useTheme } from 'next-themes';
import api from '@/lib/api';

interface StockData {
    ticker: string;
    name?: string;
    price?: number;
    change: number;
    percent_change: number;
}

interface HistoricalData {
    ticker: string;
    date: string;
    close: number;
}

interface TopGainersChartProps {
    gainers: StockData[];
    height?: number | string;
    metricTitle?: string;
}

export const TopGainersChart = ({ gainers, height = 300, metricTitle = 'One-Month Performance' }: TopGainersChartProps) => {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const [loading, setLoading] = useState(true);
    const [historyData, setHistoryData] = useState<{ [ticker: string]: HistoricalData[] }>({});

    // Use all gainers provided (the parent handles selection)
    const targetGainers = gainers;

    useEffect(() => {
        const fetchHistory = async () => {
            setLoading(true);
            try {
                const results = await Promise.all(
                    targetGainers.map(async (stock) => {
                        const response = await api.get<HistoricalData[]>(`/api/stocks/history/${stock.ticker}/`);
                        // Take the last 30 days
                        return { ticker: stock.ticker, data: response.data.slice(-30) };
                    })
                );

                const dataMap: { [ticker: string]: HistoricalData[] } = {};
                results.forEach(res => {
                    dataMap[res.ticker] = res.data;
                });
                setHistoryData(dataMap);
            } catch (error) {
                console.error('Error fetching historical data:', error);
            } finally {
                setLoading(false);
            }
        };

        if (targetGainers.length > 0) {
            fetchHistory();
        } else {
            setLoading(false);
        }
    }, [gainers]);

    if (loading) {
        return (
            <div className="w-full flex items-center justify-center bg-slate-50/10 rounded-2xl animate-pulse" style={{ height }}>
                <span className="text-[10px] uppercase font-black tracking-widest text-slate-400">Loading Performance Data...</span>
            </div>
        );
    }

    // Determine the union of dates from all stocks
    const allDatesSet = new Set<string>();
    Object.values(historyData).forEach(data => {
        data.forEach(d => allDatesSet.add(new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })));
    });
    const sortedDates = Array.from(allDatesSet).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    const colors = [
        '#3b82f6', // blue
        '#10b981', // emerald
        '#f59e0b', // amber
        '#8b5cf6', // violet
        '#ec4899', // pink
        '#06b6d4', // cyan
        '#6366f1', // indigo
        '#f43f5e', // rose
        '#84cc16', // lime
        '#a855f7'  // purple
    ];

    const hexToRGBA = (hex: string, opacity: number) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    };

    // Deterministic color generation based on ticker string
    const getStockColor = (ticker: string) => {
        let hash = 0;
        for (let i = 0; i < ticker.length; i++) {
            hash = ticker.charCodeAt(i) + ((hash << 5) - hash);
        }
        const index = Math.abs(hash) % colors.length;
        return colors[index];
    };

    const series = targetGainers.map((stock, i) => {
        const data = historyData[stock.ticker] || [];
        // Use index-based coloring for consistent top-list visualization
        const color = colors[i % colors.length];

        // Map data to the sorted dates to ensure alignment
        const chartValues = sortedDates.map(dateStr => {
            const entry = data.find(d => new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) === dateStr);
            return entry ? entry.close : null;
        });

        return {
            name: stock.ticker,
            type: 'line',
            data: chartValues,
            smooth: true,
            symbol: 'circle',
            symbolSize: 4,
            showSymbol: false,
            connectNulls: true,
            itemStyle: { color: color }, // Explicitly set itemStyle for legend to pick up
            lineStyle: {
                width: 3,
                color: color,
                shadowBlur: 10,
                shadowColor: hexToRGBA(color, 0.3)
            },
            areaStyle: {
                opacity: 0, // Hidden by default, shown on focus
                color: {
                    type: 'linear',
                    x: 0,
                    y: 0,
                    x2: 0,
                    y2: 1,
                    colorStops: [
                        { offset: 0, color: hexToRGBA(color, 0.4) },
                        { offset: 1, color: hexToRGBA(color, 0) }
                    ]
                }
            },
            emphasis: {
                focus: 'series',
                lineStyle: { width: 4 },
                areaStyle: { opacity: 1 } // Show area fill on focus
            }
        };
    });

    const option = {
        backgroundColor: 'transparent',
        animationDuration: 1500,
        tooltip: {
            trigger: 'axis',
            backgroundColor: isDark ? 'rgba(30, 41, 59, 0.95)' : 'rgba(255, 255, 255, 0.95)',
            borderColor: isDark ? '#334155' : '#e2e8f0',
            borderWidth: 1,
            padding: [12, 16],
            borderRadius: 12,
            shadowBlur: 15,
            shadowColor: 'rgba(0, 0, 0, 0.1)',
            textStyle: { color: isDark ? '#f1f5f9' : '#1e293b', fontSize: 11 },
            axisPointer: {
                type: 'line',
                lineStyle: { color: isDark ? '#475569' : '#cbd5e1', width: 1.5, type: 'dashed' }
            },
            formatter: (params: any) => {
                let res = `<div style="font-weight: 900; margin-bottom: 10px; font-size: 13px; color: ${isDark ? '#f8fafc' : '#0f172a'}; border-bottom: 1px solid ${isDark ? '#334155' : '#f1f5f9'}; padding-bottom: 6px;">${params[0].axisValue}</div>`;

                // Sort params by value descending
                const sortedParams = [...params].sort((a, b) => b.value - a.value);

                sortedParams.forEach((item: any) => {
                    const seriesIndex = item.dataIndex;
                    const currentValue = item.value;
                    let dailyChange = 0;
                    let sign = '';

                    const dataForThisSeries = series.find(s => s.name === item.seriesName)?.data;
                    const prevValFromData = dataForThisSeries?.[seriesIndex - 1];

                    if (typeof prevValFromData === 'number') {
                        dailyChange = currentValue - prevValFromData;
                        sign = dailyChange >= 0 ? '+' : '';
                    }

                    res += `
                        <div style="display: flex; flex-direction: column; gap: 2px; margin-bottom: 10px; min-width: 140px;">
                            <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px;">
                                <span style="display: flex; align-items: center; gap: 6px; font-weight: 700;">
                                    <span style="width: 10px; height: 10px; border-radius: 50%; border: 2px solid #fff; background: ${item.color}; box-shadow: 0 0 4px rgba(0,0,0,0.1);"></span>
                                    ${item.seriesName}
                                </span>
                                <span style="font-weight: 900; font-family: 'JetBrains Mono', monospace; font-size: 11px;">
                                    Rs. ${Number(currentValue).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                                </span>
                            </div>
                            ${sign || dailyChange !== 0 ? `
                            <div style="text-align: right; font-size: 10px; font-weight: 800; color: ${dailyChange >= 0 ? '#10b981' : '#f43f5e'};">
                                ${sign}${dailyChange.toFixed(2)} (${((dailyChange / (prevValFromData || 1)) * 100).toFixed(2)}%)
                            </div>` : ''}
                        </div>
                    `;
                });
                return res;
            }
        },
        legend: {
            type: 'scroll',
            data: targetGainers.map(s => s.ticker),
            bottom: 0,
            itemWidth: 10,
            itemHeight: 10,
            itemGap: 20,
            textStyle: { fontSize: 10, color: isDark ? '#94a3b8' : '#64748b', fontWeight: '800', fontFamily: 'Inter' },
            icon: 'circle',
            pageTextStyle: { color: isDark ? '#94a3b8' : '#64748b' }
        },
        dataZoom: [
            {
                type: 'inside',
                start: 0,
                end: 100
            },
            {
                show: false, // Keep it internal for cleanliness unless requested
                type: 'slider',
                bottom: 15,
                height: 12,
                borderColor: 'transparent',
                backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                fillerColor: isDark ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                handleStyle: { color: '#3b82f6' },
                moveHandleStyle: { color: '#3b82f6' },
                textStyle: { opacity: 0 }
            }
        ],
        grid: {
            top: 40,
            left: '3%',
            right: '4%',
            bottom: '15%',
            containLabel: true
        },
        xAxis: {
            type: 'category',
            data: sortedDates,
            boundaryGap: false,
            axisLine: { lineStyle: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' } },
            axisTick: { show: false },
            axisLabel: {
                fontSize: 9,
                color: isDark ? '#64748b' : '#94a3b8',
                fontFamily: 'Inter',
                fontWeight: 600,
                interval: 4
            }
        },
        yAxis: {
            type: 'value',
            scale: true,
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: {
                formatter: (val: number) => `Rs.${val > 1000 ? (val / 1000).toFixed(1) + 'k' : val.toFixed(0)}`,
                fontSize: 9,
                color: isDark ? '#475569' : '#94a3b8',
                fontFamily: 'monospace',
                fontWeight: 700
            },
            splitLine: {
                lineStyle: {
                    type: 'solid',
                    color: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'
                }
            }
        },
        series: series
    };

    return <ReactECharts option={option} style={{ height: height, width: '100%' }} />;
};
