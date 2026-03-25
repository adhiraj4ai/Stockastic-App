'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useTheme } from 'next-themes';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import api from '@/lib/api';
import { Loader2, Activity, TrendingUp, TrendingDown, Layers, X, Plus, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FullFeaturedChartProps {
    symbol: string;
    crossoverDate?: string;
    crossoverPrice?: number;
    signal?: 'BUY' | 'SELL';
}

interface OHLCData {
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

// Technical Indicators Configuration
const AVAILABLE_INDICATORS = {
    trend: [
        { id: 'sma', name: 'SMA', description: 'Simple Moving Average', periods: [5, 10, 20, 50, 100, 200] },
        { id: 'ema', name: 'EMA', description: 'Exponential Moving Average', periods: [9, 12, 21, 26, 50] },
    ],
    volatility: [
        { id: 'bb', name: 'Bollinger Bands', description: 'Bollinger Bands (20, 2)' },
    ],
    momentum: [
        { id: 'rsi', name: 'RSI', description: 'Relative Strength Index (14)' },
        { id: 'macd', name: 'MACD', description: 'MACD (12, 26, 9)' },
    ],
};

const TIMEFRAMES = [
    { id: '1M', label: '1M', days: 30 },
    { id: '3M', label: '3M', days: 90 },
    { id: '6M', label: '6M', days: 180 },
    { id: '1Y', label: '1Y', days: 365 },
    { id: 'ALL', label: 'ALL', days: 0 },
];

const INDICATOR_COLORS = ['#2962FF', '#FF6D00', '#00C853', '#D500F9', '#FFD600', '#00BFA5', '#FF1744', '#651FFF'];

// Technical indicator calculation functions
const calculateSMA = (data: number[], period: number): (number | null)[] => {
    if (!data?.length) return [];
    const result: (number | null)[] = [];
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
            result.push(null);
        } else {
            let sum = 0;
            for (let j = 0; j < period; j++) {
                sum += data[i - j];
            }
            result.push(sum / period);
        }
    }
    return result;
};

const calculateEMA = (data: number[], period: number): (number | null)[] => {
    if (!data?.length) return [];
    const result: (number | null)[] = [];
    const multiplier = 2 / (period + 1);
    let ema = data[0];

    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
            result.push(null);
        } else if (i === period - 1) {
            let sum = 0;
            for (let j = 0; j < period; j++) sum += data[j];
            ema = sum / period;
            result.push(ema);
        } else {
            ema = (data[i] - ema) * multiplier + ema;
            result.push(ema);
        }
    }
    return result;
};

const calculateBollingerBands = (data: number[], period: number = 20, stdDev: number = 2) => {
    if (!data?.length) return { upper: [], middle: [], lower: [] };
    const middle = calculateSMA(data, period);
    const upper: (number | null)[] = [];
    const lower: (number | null)[] = [];

    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
            upper.push(null);
            lower.push(null);
        } else {
            const mean = middle[i]!;
            let sum = 0;
            for (let j = 0; j < period; j++) {
                sum += Math.pow(data[i - j] - mean, 2);
            }
            const std = Math.sqrt(sum / period);
            upper.push(mean + stdDev * std);
            lower.push(mean - stdDev * std);
        }
    }

    return { upper, middle, lower };
};

const calculateRSI = (data: number[], period: number = 14): (number | null)[] => {
    if (!data?.length || data.length < 2) return [];
    const result: (number | null)[] = [];
    const gains: number[] = [];
    const losses: number[] = [];

    for (let i = 1; i < data.length; i++) {
        const change = data[i] - data[i - 1];
        gains.push(change > 0 ? change : 0);
        losses.push(change < 0 ? -change : 0);
    }

    result.push(null); // First value is null

    for (let i = 0; i < gains.length; i++) {
        if (i < period - 1) {
            result.push(null);
        } else if (i === period - 1) {
            const avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
            const avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
            const rs = avgGain / (avgLoss || 1);
            result.push(100 - (100 / (1 + rs)));
        } else {
            const prevRSI = result[i];
            if (prevRSI === null) {
                result.push(null);
                continue;
            }
            const avgGain = (gains.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0)) / period;
            const avgLoss = (losses.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0)) / period;
            const rs = avgGain / (avgLoss || 1);
            result.push(100 - (100 / (1 + rs)));
        }
    }

    return result;
};

const calculateMACD = (data: number[], fast: number = 12, slow: number = 26, signal: number = 9) => {
    if (!data?.length) return { macdLine: [], signalLine: [], histogram: [] };
    const emaFast = calculateEMA(data, fast);
    const emaSlow = calculateEMA(data, slow);
    const macdLine: (number | null)[] = emaFast.map((f, i) => (f !== null && emaSlow[i] !== null) ? f - emaSlow[i]! : null);
    const signalLine = calculateEMA(macdLine.filter(v => v !== null) as number[], signal);

    // Pad signal line to match length
    const paddedSignal: (number | null)[] = [];
    let signalIndex = 0;
    for (let i = 0; i < macdLine.length; i++) {
        if (macdLine[i] === null) {
            paddedSignal.push(null);
        } else {
            paddedSignal.push(signalLine[signalIndex++] ?? null);
        }
    }

    const histogram: (number | null)[] = macdLine.map((m, i) =>
        (m !== null && paddedSignal[i] !== null) ? m - paddedSignal[i]! : null
    );

    return { macdLine, signalLine: paddedSignal, histogram };
};

export function FullFeaturedChart({ symbol, crossoverDate, crossoverPrice, signal }: FullFeaturedChartProps) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [ohlcData, setOhlcData] = useState<OHLCData[]>([]);
    const [timeframe, setTimeframe] = useState('1Y');
    const [activeIndicators, setActiveIndicators] = useState<string[]>([]);
    const [indicatorPanelOpen, setIndicatorPanelOpen] = useState(false);

    // Fetch OHLC data
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                const response = await api.get(`/api/stocks/chart-history/${symbol}/`);
                const data = response.data as OHLCData[];
                setOhlcData(data);
            } catch (err) {
                console.error('Failed to fetch chart data:', err);
                setError('Failed to load chart data');
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [symbol]);

    // Filter data by timeframe
    const filteredData = useMemo(() => {
        if (!ohlcData.length) return [];

        const tf = TIMEFRAMES.find(t => t.id === timeframe);
        if (!tf || tf.days === 0) return ohlcData;

        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - tf.days);

        return ohlcData.filter(d => new Date(d.time) >= cutoff);
    }, [ohlcData, timeframe]);

    // Prepare chart data
    const chartOption = useMemo(() => {
        if (!filteredData.length) return null;

        const dates = filteredData.map(d => d.time);
        const ohlc = filteredData.map(d => [d.open, d.close, d.low, d.high]);
        const volumes = filteredData.map(d => d.volume);
        const closes = filteredData.map(d => d.close);

        // Base series
        const series: any[] = [
            {
                name: 'Candlestick',
                type: 'candlestick',
                data: ohlc,
                itemStyle: {
                    color: '#10b981',
                    color0: '#ef4444',
                    borderColor: '#10b981',
                    borderColor0: '#ef4444',
                },
                markPoint: crossoverDate && crossoverPrice ? {
                    data: [{
                        name: `${signal} Signal`,
                        coord: [dates.indexOf(crossoverDate), crossoverPrice],
                        value: signal,
                        symbol: signal === 'BUY' ? 'pin' : 'pin',
                        symbolSize: 50,
                        itemStyle: {
                            color: signal === 'BUY' ? '#10b981' : '#ef4444',
                        },
                        label: {
                            show: true,
                            formatter: '{c}',
                            color: '#fff',
                            fontSize: 10,
                            fontWeight: 'bold',
                        },
                    }],
                } : undefined,
            },
            {
                name: 'Volume',
                type: 'bar',
                xAxisIndex: 1,
                yAxisIndex: 1,
                data: volumes.map((v, i) => ({
                    value: v,
                    itemStyle: {
                        color: filteredData[i].close >= filteredData[i].open ? 'rgba(16, 185, 129, 0.5)' : 'rgba(239, 68, 68, 0.5)',
                    },
                })),
            },
        ];

        // Add active indicators
        let colorIndex = 0;
        activeIndicators.forEach(ind => {
            if (ind.startsWith('sma-')) {
                const period = parseInt(ind.split('-')[1]);
                const smaData = calculateSMA(closes, period);
                series.push({
                    name: `SMA ${period}`,
                    type: 'line',
                    data: smaData,
                    smooth: true,
                    lineStyle: { width: 2, color: INDICATOR_COLORS[colorIndex++ % INDICATOR_COLORS.length] },
                    showSymbol: false,
                });
            } else if (ind.startsWith('ema-')) {
                const period = parseInt(ind.split('-')[1]);
                const emaData = calculateEMA(closes, period);
                series.push({
                    name: `EMA ${period}`,
                    type: 'line',
                    data: emaData,
                    smooth: true,
                    lineStyle: { width: 2, color: INDICATOR_COLORS[colorIndex++ % INDICATOR_COLORS.length] },
                    showSymbol: false,
                });
            } else if (ind === 'bb') {
                const bb = calculateBollingerBands(closes);
                series.push(
                    {
                        name: 'BB Upper',
                        type: 'line',
                        data: bb.upper,
                        lineStyle: { width: 1, color: '#8b5cf6', type: 'dashed' },
                        showSymbol: false,
                    },
                    {
                        name: 'BB Middle',
                        type: 'line',
                        data: bb.middle,
                        lineStyle: { width: 1, color: '#a78bfa' },
                        showSymbol: false,
                    },
                    {
                        name: 'BB Lower',
                        type: 'line',
                        data: bb.lower,
                        lineStyle: { width: 1, color: '#8b5cf6', type: 'dashed' },
                        showSymbol: false,
                    }
                );
            } else if (ind === 'rsi') {
                const rsiData = calculateRSI(closes);
                series.push({
                    name: 'RSI',
                    type: 'line',
                    xAxisIndex: 2,
                    yAxisIndex: 2,
                    data: rsiData,
                    lineStyle: { width: 2, color: '#2962FF' },
                    showSymbol: false,
                });
            } else if (ind === 'macd') {
                const macd = calculateMACD(closes);
                series.push(
                    {
                        name: 'MACD',
                        type: 'line',
                        xAxisIndex: 3,
                        yAxisIndex: 3,
                        data: macd.macdLine,
                        lineStyle: { width: 2, color: '#2962FF' },
                        showSymbol: false,
                    },
                    {
                        name: 'Signal',
                        type: 'line',
                        xAxisIndex: 3,
                        yAxisIndex: 3,
                        data: macd.signalLine,
                        lineStyle: { width: 2, color: '#FF6D00' },
                        showSymbol: false,
                    },
                    {
                        name: 'Histogram',
                        type: 'bar',
                        xAxisIndex: 3,
                        yAxisIndex: 3,
                        data: macd.histogram.map(h => ({
                            value: h,
                            itemStyle: { color: (h ?? 0) >= 0 ? 'rgba(16, 185, 129, 0.6)' : 'rgba(239, 68, 68, 0.6)' },
                        })),
                    }
                );
            }
        });

        // Grid configuration
        const grids: any[] = [
            { left: '10%', right: '8%', top: '8%', height: '50%' },
            { left: '10%', right: '8%', top: '63%', height: '12%' },
        ];

        const xAxes: any[] = [
            { type: 'category', data: dates, gridIndex: 0, show: false },
            { type: 'category', data: dates, gridIndex: 1, show: false },
        ];

        const gridColor = isDark ? '#334155' : '#f1f5f9';
        const textColor = isDark ? '#94a3b8' : '#334155';

        const yAxes: any[] = [
            { scale: true, gridIndex: 0, splitLine: { show: true, lineStyle: { color: gridColor } } },
            { scale: true, gridIndex: 1, splitLine: { show: false } },
        ];

        // Add RSI grid if active
        if (activeIndicators.includes('rsi')) {
            grids.push({ left: '10%', right: '8%', top: '78%', height: '10%' });
            xAxes.push({ type: 'category', data: dates, gridIndex: 2, show: false });
            yAxes.push({ scale: true, gridIndex: 2, min: 0, max: 100, splitLine: { show: true, lineStyle: { color: gridColor } } });
        }

        // Add MACD grid if active
        if (activeIndicators.includes('macd')) {
            const gridTop = activeIndicators.includes('rsi') ? '90%' : '78%';
            grids.push({ left: '10%', right: '8%', top: gridTop, height: '8%' });
            xAxes.push({ type: 'category', data: dates, gridIndex: activeIndicators.includes('rsi') ? 3 : 2 });
            yAxes.push({ scale: true, gridIndex: activeIndicators.includes('rsi') ? 3 : 2, splitLine: { show: true, lineStyle: { color: gridColor } } });
        }

        return {
            animation: false,
            backgroundColor: 'transparent',
            textStyle: { fontFamily: 'Inter, sans-serif', color: textColor },
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'cross' },
                backgroundColor: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                borderColor: isDark ? '#334155' : '#e2e8f0',
                borderWidth: 1,
                textStyle: { color: isDark ? '#f1f5f9' : '#334155', fontSize: 11 },
            },
            axisPointer: {
                link: [{ xAxisIndex: 'all' }],
                label: { backgroundColor: '#334155' },
            },
            grid: grids,
            xAxis: xAxes,
            yAxis: yAxes,
            dataZoom: [
                { type: 'inside', xAxisIndex: [0, 1, 2, 3], start: 0, end: 100 },
                { show: true, xAxisIndex: [0, 1, 2, 3], type: 'slider', bottom: '2%', height: 20 },
            ],
            series,
        };
    }, [filteredData, activeIndicators, crossoverDate, crossoverPrice, signal]);

    const toggleIndicator = (indicatorId: string) => {
        setActiveIndicators(prev =>
            prev.includes(indicatorId) ? prev.filter(i => i !== indicatorId) : [...prev, indicatorId]
        );
    };

    const addIndicatorWithPeriod = (baseId: string, period: number) => {
        const fullId = `${baseId}-${period}`;
        toggleIndicator(fullId);
    };

    if (loading) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-white dark:bg-slate-900">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                    <div className="text-center">
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Loading Advanced Charts</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Fetching OHLC data from local source...</p>
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-white dark:bg-slate-900">
                <div className="flex flex-col items-center gap-3 text-rose-500">
                    <Activity className="w-8 h-8" />
                    <span className="text-sm font-medium">{error}</span>
                </div>
            </div>
        );
    }

    return (
        <div className="relative w-full h-full flex flex-col bg-white dark:bg-slate-900">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-slate-50 dark:from-slate-800 to-white dark:to-slate-900 shrink-0">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{symbol}</span>
                        <span className="text-xs text-slate-400 dark:text-slate-500">NEPSE</span>
                    </div>

                    {signal && (
                        <div className={cn(
                            "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold",
                            signal === 'BUY'
                                ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
                                : "bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800"
                        )}>
                            {signal === 'BUY' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                            {signal} Signal
                        </div>
                    )}

                    {crossoverDate && crossoverPrice && (
                        <div className="flex items-center gap-2 text-xs">
                            <span className="text-slate-400 dark:text-slate-500">Crossover:</span>
                            <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">{crossoverDate}</span>
                            <span className="text-slate-300 dark:text-slate-700">@</span>
                            <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">Rs. {crossoverPrice.toLocaleString()}</span>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {/* Timeframe Selector */}
                    <div className="flex items-center gap-1">
                        {TIMEFRAMES.map(tf => (
                            <button
                                key={tf.id}
                                onClick={() => setTimeframe(tf.id)}
                                className={cn(
                                    "px-2.5 py-1 text-xs font-bold rounded transition-all",
                                    timeframe === tf.id
                                        ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-sm"
                                        : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                                )}
                            >
                                {tf.label}
                            </button>
                        ))}
                    </div>

                    {/* Indicator Dropdown */}
                    <div className="relative">
                        <button
                            onClick={() => setIndicatorPanelOpen(!indicatorPanelOpen)}
                            className="flex items-center gap-2 px-3 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        >
                            <Layers size={14} />
                            Indicators
                            {activeIndicators.length > 0 && (
                                <span className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                    {activeIndicators.length}
                                </span>
                            )}
                            <ChevronDown size={14} className={cn("transition-transform", indicatorPanelOpen && "rotate-180")} />
                        </button>

                        {indicatorPanelOpen && (
                            <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-50 overflow-hidden">
                                <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 flex items-center justify-between">
                                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">Technical Indicators</span>
                                    <button onClick={() => setIndicatorPanelOpen(false)} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300">
                                        <X size={14} />
                                    </button>
                                </div>
                                <div className="max-h-[400px] overflow-y-auto p-2 space-y-3">
                                    {/* Trend Indicators */}
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-2 mb-1">Trend</p>
                                        <div className="space-y-1">
                                            {AVAILABLE_INDICATORS.trend.map(ind => (
                                                <div key={ind.id} className="px-2">
                                                    <div className="flex items-center justify-between py-1">
                                                        <span className="text-xs font-medium text-slate-700 dark:text-slate-200">{ind.name}</span>
                                                        <div className="flex gap-1">
                                                            {ind.periods?.map(p => (
                                                                <button
                                                                    key={p}
                                                                    onClick={() => addIndicatorWithPeriod(ind.id, p)}
                                                                    className={cn(
                                                                        "text-[10px] font-bold px-2 py-0.5 rounded transition-colors",
                                                                        activeIndicators.includes(`${ind.id}-${p}`)
                                                                            ? "bg-blue-500 text-white"
                                                                            : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                                                                    )}
                                                                >
                                                                    {p}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Volatility Indicators */}
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-2 mb-1">Volatility</p>
                                        <div className="space-y-1">
                                            {AVAILABLE_INDICATORS.volatility.map(ind => (
                                                <button
                                                    key={ind.id}
                                                    onClick={() => toggleIndicator(ind.id)}
                                                    className={cn(
                                                        "w-full flex items-center justify-between px-2 py-1.5 rounded-md transition-colors text-left",
                                                        activeIndicators.includes(ind.id)
                                                            ? "bg-blue-50 text-blue-700"
                                                            : "hover:bg-slate-50 text-slate-600"
                                                    )}
                                                >
                                                    <span className="text-xs font-medium">{ind.name}</span>
                                                    {activeIndicators.includes(ind.id) ? <X size={12} /> : <Plus size={12} className="text-slate-400" />}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Momentum Indicators */}
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-2 mb-1">Momentum</p>
                                        <div className="space-y-1">
                                            {AVAILABLE_INDICATORS.momentum.map(ind => (
                                                <button
                                                    key={ind.id}
                                                    onClick={() => toggleIndicator(ind.id)}
                                                    className={cn(
                                                        "w-full flex items-center justify-between px-2 py-1.5 rounded-md transition-colors text-left",
                                                        activeIndicators.includes(ind.id)
                                                            ? "bg-blue-50 text-blue-700"
                                                            : "hover:bg-slate-50 text-slate-600"
                                                    )}
                                                >
                                                    <span className="text-xs font-medium">{ind.name}</span>
                                                    {activeIndicators.includes(ind.id) ? <X size={12} /> : <Plus size={12} className="text-slate-400" />}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Active Indicators Pills */}
            {activeIndicators.length > 0 && (
                <div className="flex flex-wrap gap-1 px-4 py-2 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
                    {activeIndicators.map((ind, idx) => (
                        <span
                            key={ind}
                            className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full border"
                            style={{
                                backgroundColor: `${INDICATOR_COLORS[idx % INDICATOR_COLORS.length]}15`,
                                borderColor: `${INDICATOR_COLORS[idx % INDICATOR_COLORS.length]}40`,
                                color: INDICATOR_COLORS[idx % INDICATOR_COLORS.length],
                            }}
                        >
                            {ind.toUpperCase().replace('-', ' ')}
                            <button onClick={() => toggleIndicator(ind)} className="hover:opacity-70">
                                <X size={10} />
                            </button>
                        </span>
                    ))}
                </div>
            )}

            {/* Chart */}
            <div className="flex-1 w-full p-2">
                {chartOption && (
                    <ReactECharts
                        option={chartOption}
                        style={{ height: '100%', width: '100%' }}
                        opts={{ renderer: 'canvas' }}
                    />
                )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800 border-t border-slate-100 dark:border-slate-800 shrink-0">
                <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                    <div className="flex items-center gap-4">
                        <span>🖱️ Drag to zoom • Scroll to pan • Click legend to toggle series</span>
                    </div>
                    <span className="text-slate-400 dark:text-slate-500 font-medium">Professional-grade charting with local data</span>
                </div>
            </div>
        </div>
    );
}
