'use client';

import { useEffect, use, Fragment } from 'react';
import React from 'react';
import { useRouter, useParams } from 'next/navigation';
import api from '@/lib/api';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useState, useMemo } from 'react';
import {
    ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
    BarChart, Bar, Legend, ReferenceLine
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    ArrowLeft, TrendingUp, TrendingDown, Calendar, DollarSign,
    Activity, Clock, BarChart2, Layers, Zap, Info, Share2,
    Download, RefreshCw, Maximize2, Table2, LineChart,
    Check, ChevronDown, Search, X, PieChart, Globe
} from 'lucide-react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import TransactionModal from '@/components/TransactionModal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import StockLink from '@/components/StockLink';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';

// Terminal Suite Components
import { IntelligenceGlass } from '@/components/ticker/IntelligenceGlass';
import { BentoMetrics } from '@/components/ticker/BentoMetrics';
import { AdvancedCharting } from '@/components/ticker/AdvancedCharting';
import SignalDashboard from '@/components/SignalDashboard';
import BrokerAnalysis from '@/components/ticker/BrokerAnalysis';
import { FibonacciRetracement } from '@/components/ticker/FibonacciRetracement';

interface StockDetailData {
    company: {
        symbol: string;
        name: string;
        sector: string;
        status: string;
    } | null;
    fundamental: {
        ticker: string;
        company_name: string;
        sector: string;
        market_cap: number;
        paid_up_capital: number;
        pe_ratio: number;
        eps: number;
        book_value: number;
        dividend_yield: number;
        fifty_two_week_high: number;
        fifty_two_week_low: number;
        fundamental_indicators?: Array<{
            name: string;
            value: string;
            sector_high: string;
            sector_high_ticker: string;
            sector_low: string;
            sector_low_ticker: string;
        }>;
        technical_indicators?: Array<{
            name: string;
            value: string;
            category?: string;
            sector_high: string;
            sector_high_ticker: string;
            sector_low: string;
            sector_low_ticker: string;
        }>;
        broker_accumulation?: Record<string, Array<{ broker: string; qty: number; type: 'BUY' | 'SELL' }>>;
        listed_date?: string;
        shares_outstanding?: number;
        public_shares?: number;
        free_float_market_cap?: number;
    } | null;
    price: {
        close: number;
        open: number;
        high: number;
        low: number;
        volume: number;
        change: number;
        percent_change: number;
        date: string;
        prev_close?: number;
    };
}

interface FloorsheetItem {
    id: number;
    contract_no: string;
    buyer_id: number;
    seller_id: number;
    transaction_quantity: number;
    transaction_rate: number;
    transaction_amount: number;
    transaction_date: string;
}

// @ts-ignore
export default function StockDetailPage({ params }: { params: Promise<{ ticker: string }> }) {
    const { ticker } = use(params);
    const router = useRouter();
    const [data, setData] = useState<StockDetailData | null>(null);
    const [floorsheet, setFloorsheet] = useState<FloorsheetItem[]>([]);
    const [activeTab, setActiveTab] = useState('indicators');
    const [reportType, setReportType] = useState<'ANNUAL' | 'QUARTERLY'>('ANNUAL');
    const [visibleMetrics, setVisibleMetrics] = useState<string[]>(['net_profit', 'revenue']);
    const [dividends, setDividends] = useState<any[]>([]);
    const [financials, setFinancials] = useState<any[]>([]);
    const [history, setHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [historyView, setHistoryView] = useState<'table' | 'graph'>('graph');
    const [modalOpen, setModalOpen] = useState(false);
    const [txnType, setTxnType] = useState('BUY');
    const [error, setError] = useState<string | null>(null);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [collapsedItems, setCollapsedItems] = useState<Set<string>>(new Set([
        'section-balance_sheet',
        'section-profit_loss',
        'section-cash_flow',
        'section-key_ratios'
    ]));

    const toggleCollapse = (id: string) => {
        setCollapsedItems(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    useEffect(() => {
        const fetchAccounts = async () => {
            try {
                const response = await api.get('/api/stocks/accounts/');
                setAccounts(response.data);
            } catch (err) {
                console.error('Failed to fetch accounts', err);
            }
        };
        fetchAccounts();
    }, []);

    useEffect(() => {
        const fetchData = async () => {
            try {
                // Fetch Details
                const detailRes = await api.get(`/api/stocks/details/${ticker}/`);
                setData(detailRes.data);

                // Fetch History for Chart
                try {
                    const historyRes = await api.get(`/api/stocks/history/${ticker}/`);
                    setHistory(historyRes.data);
                } catch (hErr) { console.error("History fetch failed", hErr); }

                // Fetch Floorsheet
                try {
                    const floorRes = await api.get(`/api/stocks/floorsheet/${ticker}/`);
                    setFloorsheet(floorRes.data);
                } catch (fErr) { console.error("Floorsheet fetch failed", fErr); }

                // Fetch Dividends
                try {
                    const divRes = await api.get(`/api/stocks/dividends/${ticker}/`);
                    setDividends(divRes.data);
                } catch (dErr) { console.error("Dividends fetch failed", dErr); }

                // Fetch Financials
                try {
                    const finRes = await api.get(`/api/stocks/financials/${ticker}/`);
                    setFinancials(finRes.data);
                } catch (fnErr) { console.error("Financials fetch failed", fnErr); }

            } catch (err) {
                console.error("Failed to fetch stock data", err);
                setError("Failed to load stock data. Backend might be down.");
            } finally {
                setLoading(false);
            }
        };

        if (ticker) fetchData();
    }, [ticker]);

    const allAvailableMetrics = useMemo(() => {
        const metricMap = new Map();
        const colors = ['#3b82f6', '#10b981', '#6366f1', '#f59e0b', '#ec4899', '#8b5cf6', '#f97316', '#06b6d4', '#ef4444', '#84cc16'];

        // Standard metrics
        const standard = [
            { key: 'revenue', label: 'Revenue', section: 'Standard', unit: 'currency' },
            { key: 'net_profit', label: 'Net Profit', section: 'Standard', unit: 'currency' },
            { key: 'operating_profit', label: 'Operating Profit', section: 'Standard', unit: 'currency' },
            { key: 'paid_up_capital', label: 'Paid-up Capital', section: 'Standard', unit: 'currency' },
            { key: 'reserves_and_surplus', label: 'Reserves', section: 'Standard', unit: 'currency' },
            { key: 'eps', label: 'EPS', section: 'Standard', unit: 'value' },
            { key: 'book_value', label: 'Book Value', section: 'Standard', unit: 'value' },
            { key: 'pe_ratio', label: 'PE Ratio', section: 'Standard', unit: 'value' },
            { key: 'return_on_equity', label: 'ROE (%)', section: 'Standard', unit: '%' },
        ];

        standard.forEach((m, idx) => metricMap.set(m.key, { ...m, color: colors[idx % colors.length] }));

        // Dynamic metrics
        financials.forEach(report => {
            const sections = [
                { key: 'balance_sheet', label: 'Balance Sheet' },
                { key: 'profit_loss', label: 'Profit & Loss' },
                { key: 'cash_flow', label: 'Cash Flow' },
                { key: 'key_ratios', label: 'Key Ratios' }
            ];

            const extractMetrics = (obj: any, path: string, section: string, category: string) => {
                if (!obj || typeof obj !== 'object') return;
                Object.entries(obj).forEach(([key, val]) => {
                    const fullKey = `${path}.${key}`;
                    if (val && typeof val === 'object' && !Array.isArray(val)) {
                        extractMetrics(val, fullKey, section, category);
                    } else if (val !== undefined) {
                        if (!metricMap.has(fullKey)) {
                            const isPercent = key.includes('%') || key.toLowerCase().includes('ratio') || key.toLowerCase().includes('rate');
                            metricMap.set(fullKey, {
                                key: fullKey,
                                label: key,
                                section: section,
                                category: category,
                                unit: isPercent ? '%' : 'currency',
                                color: colors[metricMap.size % colors.length]
                            });
                        }
                    }
                });
            };

            sections.forEach(sec => {
                const data = report[sec.key];
                if (!data) return;
                Object.entries(data).forEach(([category, items]: [string, any]) => {
                    if (!items) return;
                    extractMetrics(items, `${sec.key}.${category}`, sec.label, category);
                });
            });
        });

        return Array.from(metricMap.values());
    }, [financials]);

    const intelligence = useMemo(() => {
        if (!data || !history?.length) return { fundamentalScore: 0, technicalScore: 0, riskLevel: 'MEDIUM' as const, macd: 'NEUTRAL' as const };

        const sortedHistory = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const closes = sortedHistory.map(h => h.close);
        const currentPrice = data.price.close;

        // Helper: Simple Moving Average
        const getSMA = (data: number[], days: number) => {
            if (data.length < days) return data[data.length - 1];
            return data.slice(-days).reduce((a, b) => a + b, 0) / days;
        };

        // Helper: Exponential Moving Average
        const getEMA = (data: number[], days: number) => {
            if (data.length < days) return getSMA(data, days);
            const k = 2 / (days + 1);
            let ema = data[0];
            for (let i = 1; i < data.length; i++) {
                ema = data[i] * k + ema * (1 - k);
            }
            return ema;
        };

        const sma20 = getSMA(closes, 20);
        const sma50 = getSMA(closes, 50);
        const sma200 = getSMA(closes, 200);
        const ema20 = getEMA(closes, 20);
        const ema50 = getEMA(closes, 50);
        const ema200 = getEMA(closes, 200);

        // 1. Technical Score (0-100)
        let techScore = 0;

        // Trend Alignment (Max 35)
        // EMA Stack: Price > EMA20 > EMA50 > EMA200 (Signs of strong trend)
        if (currentPrice > ema20 && ema20 > ema50 && ema50 > ema200) techScore += 25;
        else if (currentPrice > sma20 && sma20 > sma50) techScore += 15;
        else if (currentPrice > sma200) techScore += 10;

        // ADX Trend Strength Approximation (Max 15)
        const getTR = (i: number) => {
            if (i === 0) return sortedHistory[i].high - sortedHistory[i].low;
            const high = sortedHistory[i].high;
            const low = sortedHistory[i].low;
            const prevClose = sortedHistory[i - 1].close;
            return Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
        };
        // Simplified ADX-like volatility check
        const adxPeriod = 14;
        const adxSlice = sortedHistory.slice(-adxPeriod);
        const adxStartIndex = sortedHistory.length - adxSlice.length;

        const atr14 = adxSlice.reduce((acc, _, i) => {
            const idx = adxStartIndex + i;
            if (idx < 0 || idx >= sortedHistory.length) return acc;
            return acc + getTR(idx);
        }, 0) / (adxSlice.length || 1);

        const trendStrength = (atr14 / currentPrice) * 100; // Volatility % as proxy for trend potential
        if (trendStrength > 2) techScore += 10; // High volatility/momentum

        if (sortedHistory.length >= 5 && currentPrice > sortedHistory[sortedHistory.length - 5].close) techScore += 5; // 5-day momentum

        // RSI Momentum (Max 25)
        const getRSI = (period = 14) => {
            if (closes.length <= period) return 50;
            let gains = 0, losses = 0;
            for (let i = 1; i <= period; i++) {
                const diff = closes[closes.length - i] - closes[closes.length - i - 1];
                if (diff > 0) gains += diff; else losses -= diff;
            }
            const avgGain = gains / period; const avgLoss = losses / period || 1;
            return 100 - (100 / (1 + avgGain / avgLoss));
        };
        const rsi = getRSI();
        if (rsi > 50 && rsi < 70) techScore += 25; // Sweet spot
        else if (rsi >= 70) techScore += 15; // Strong but overbought
        else if (rsi <= 30) techScore += 20; // Oversold bounce potential
        else if (rsi > 40) techScore += 10;

        // Volume Confirmation (Max 15)
        const avgVol20 = getSMA(sortedHistory.map(h => h.volume), 20);
        const currentVol = sortedHistory[sortedHistory.length - 1].volume;
        if (currentVol > avgVol20 * 1.5 && currentPrice > sortedHistory[sortedHistory.length - 2].close) techScore += 15;
        else if (currentVol > avgVol20) techScore += 5;

        // MACD Direction (Max 10)
        const ema12 = getEMA(closes, 12);
        const ema26 = getEMA(closes, 26);
        const macdLine = ema12 - ema26;
        if (macdLine > 0) techScore += 10;

        // 2. Fundamental Score (0-100)
        let funScore = 0;
        const pe = data.fundamental?.pe_ratio || 0;
        const pbv = data.fundamental?.book_value ? currentPrice / data.fundamental.book_value : 0;
        const roeItem = data.fundamental?.fundamental_indicators?.find(i => i.name.toLowerCase().includes('roe'));
        const roeNum = roeItem ? parseFloat(roeItem.value.replace(/[^0-9.-]/g, '')) : 0;

        // PE Value (35%)
        if (pe > 0 && pe < 15) funScore += 35;
        else if (pe >= 15 && pe < 25) funScore += 25;
        else if (pe >= 25 && pe < 40) funScore += 15;

        // PBV Value (30%)
        if (pbv > 0 && pbv < 1.5) funScore += 30;
        else if (pbv >= 1.5 && pbv < 3) funScore += 20;
        else if (pbv >= 3 && pbv < 5) funScore += 10;

        // Quality/ROE (35%)
        if (roeNum > 15) funScore += 35;
        else if (roeNum > 10) funScore += 25;
        else if (roeNum > 5) funScore += 15;

        // 3. Risk Level
        let risk: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM';
        const dlyVol = Math.abs(data.price.percent_change);
        if (dlyVol > 4.5 || pbv > 5 || pe > 45) risk = 'HIGH';
        else if (dlyVol < 1.8 && pbv < 2 && pe < 18) risk = 'LOW';

        // Determine Primary Driver for Reason
        let reason = 'Neutral Structure';
        if (techScore > 75) {
            if (trendStrength > 2) reason = 'Strong Trend Structure';
            else if (currentVol > avgVol20 * 1.5) reason = 'High Volume Breakout';
            else if (rsi > 50 && rsi < 70) reason = 'Healthy Momentum';
        } else if (techScore > 50) {
            if (macdLine > 0) reason = 'MACD Crossover';
            else if (currentPrice > sma50) reason = 'Trend Support';
        } else {
            if (rsi < 30) reason = 'Oversold Opportunity';
            else if (currentPrice < sma200) reason = 'Bearish Trend';
        }

        return {
            fundamentalScore: Math.min(Math.round(funScore), 100),
            technicalScore: Math.min(Math.round(techScore), 100),
            riskLevel: risk,
            macd: (macdLine > 0 ? 'BULLISH' : 'BEARISH') as 'BULLISH' | 'BEARISH' | 'NEUTRAL',
            reason
        };
    }, [data, history]);

    const getFinancialsTrendOption = () => {
        const filteredFin = financials
            .filter(f => f.report_type === reportType)
            .sort((a, b) => a.fiscal_year.localeCompare(b.fiscal_year));

        const metrics = allAvailableMetrics.filter(m => visibleMetrics.includes(m.key));

        const getDeepValue = (obj: any, path: string) => {
            return path.split('.').reduce((acc, part) => acc?.[part], obj);
        };

        const series = metrics.map(m => {
            const dataPoints = filteredFin.map(f => getDeepValue(f, m.key) ?? null);
            const isPercent = m.unit === '%';

            return {
                id: m.key,
                name: m.label,
                type: 'line',
                smooth: true,
                yAxisIndex: isPercent ? 1 : 0,
                data: dataPoints,
                itemStyle: { color: m.color },
                symbolSize: 8,
                lineStyle: { width: 3 },
                areaStyle: {
                    color: echarts ? new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: m.color + '44' },
                        { offset: 1, color: m.color + '00' }
                    ]) : undefined
                }
            };
        });

        return {
            tooltip: {
                trigger: 'axis',
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                borderWidth: 1,
                borderColor: '#f1f5f9',
                shadowBlur: 20,
                shadowColor: 'rgba(0, 0, 0, 0.05)',
                padding: [12, 16],
                textStyle: { color: '#1f2937', fontSize: 13 },
                formatter: (params: any) => {
                    if (!params || params.length === 0) return '';
                    let res = `<div style="font-weight: 900; color: #64748b; margin-bottom: 8px; border-bottom: 1px solid #f1f5f9; padding-bottom: 6px; font-size: 13px;">FY ${params[0].name}</div>`;
                    params.forEach((p: any) => {
                        const m = allAvailableMetrics.find(metric => metric.key === p.seriesId);
                        let valStr = '-';
                        if (p.value !== null && p.value !== undefined) {
                            if (m?.unit === '%') {
                                valStr = p.value.toLocaleString(undefined, { minimumFractionDigits: 2 }) + '%';
                            } else if (m?.unit === 'currency') {
                                if (Math.abs(p.value) >= 10000000) valStr = (p.value / 10000000).toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' Cr';
                                else if (Math.abs(p.value) >= 100000) valStr = (p.value / 100000).toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' L';
                                else valStr = p.value.toLocaleString();
                            } else {
                                valStr = p.value.toLocaleString();
                            }
                        }
                        res += `<div style="display: flex; align-items: center; justify-content: space-between; gap: 24px; margin-bottom: 4px;">
                            <span style="display: flex; align-items: center; gap: 8px; color: #475569; font-weight: 600; font-size: 12px;">
                                <span style="width:8px;height:8px;border-radius:2px;background-color:${p.color}"></span>
                                ${p.seriesName}
                            </span>
                            <span style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-weight: 700; color: #1e293b; font-size: 13px;">${valStr}</span>
                        </div>`;
                    });
                    return res;
                }
            },
            legend: { show: false },
            grid: {
                left: '2%',
                right: '4%',
                bottom: '3%',
                top: '8%',
                containLabel: true
            },
            xAxis: {
                type: 'category',
                data: filteredFin.map(f => f.fiscal_year),
                axisLine: { lineStyle: { color: '#f1f5f9' } },
                axisLabel: { color: '#64748b', fontWeight: 600, fontSize: 12, margin: 15 },
                boundaryGap: false
            },
            yAxis: [
                {
                    type: 'value',
                    name: 'Amount (Rs)',
                    nameTextStyle: { color: '#94a3b8', fontWeight: 600, padding: [0, 40, 0, 0], fontSize: 12 },
                    axisLabel: {
                        color: '#94a3b8',
                        fontWeight: 600,
                        fontSize: 11,
                        formatter: (val: number) => {
                            if (Math.abs(val) >= 10000000) return (val / 10000000).toFixed(0) + 'Cr';
                            if (Math.abs(val) >= 100000) return (val / 100000).toFixed(0) + 'L';
                            return val.toLocaleString();
                        }
                    },
                    splitLine: { lineStyle: { type: 'dashed', color: '#f8fafc' } }
                },
                {
                    type: 'value',
                    name: 'Percentage (%)',
                    nameTextStyle: { color: '#94a3b8', fontWeight: 600, padding: [0, 0, 0, 40], fontSize: 12 },
                    axisLabel: {
                        color: '#94a3b8',
                        fontWeight: 600,
                        fontSize: 11,
                        formatter: '{value}%'
                    },
                    splitLine: { show: false }
                }
            ],
            series: series
        };
    };

    const getChartOption = () => {
        if (!history.length) return {};

        const dates = history.map(item => item.date);
        const data = history.map(item => [item.open, item.close, item.low, item.high]);
        const volumes = history.map((item, index) => [index, item.volume, item.close > item.open ? 1 : -1]);

        return {
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'cross' }
            },
            grid: [
                { left: '10%', right: '8%', height: '50%' },
                { left: '10%', right: '8%', top: '63%', height: '16%' }
            ],
            xAxis: [
                { type: 'category', data: dates, boundaryGap: false },
                { type: 'category', gridIndex: 1, data: dates, boundaryGap: false, axisLabel: { show: false } }
            ],
            yAxis: [
                { scale: true, splitArea: { show: true } },
                { scale: true, gridIndex: 1, splitNumber: 2, axisLabel: { show: false }, axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false } }
            ],
            dataZoom: [
                { type: 'inside', start: 50, end: 100 },
                { show: true, type: 'slider', top: '85%', start: 50, end: 100 }
            ],
            series: [
                {
                    name: 'Stock Price',
                    type: 'candlestick',
                    data: data,
                    itemStyle: {
                        color: '#10B981',
                        color0: '#EF4444',
                        borderColor: '#10B981',
                        borderColor0: '#EF4444'
                    }
                },
                {
                    name: 'Volume',
                    type: 'bar',
                    xAxisIndex: 1,
                    yAxisIndex: 1,
                    data: volumes,
                    itemStyle: {
                        color: (params: any) => {
                            return params.data[2] > 0 ? '#10B981' : '#EF4444';
                        }
                    }
                }
            ]
        };
    };

    if (error) {
        return (
            <DashboardLayout>
                <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-8">
                    <div className="text-red-500 dark:text-red-400 text-xl font-bold mb-2">Error Loading Stock Data</div>
                    <div className="text-gray-600 dark:text-gray-400">{error}</div>
                    <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>Retry</Button>
                </div>
            </DashboardLayout>
        );
    }

    if (loading) return (
        <DashboardLayout>
            <div className="flex items-center justify-center min-h-[50vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-slate-100"></div>
            </div>
        </DashboardLayout>
    );
    if (!data) return (
        <DashboardLayout>
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-4">
                <div className="text-red-500 dark:text-red-400 text-xl font-bold">Stock Not Found</div>
                <p className="text-gray-500 dark:text-gray-400">Could not find data for ticker: {ticker}</p>
                <Button variant="outline" onClick={() => router.push('/market')}>Go Home</Button>
            </div>
        </DashboardLayout>
    );

    const isPositive = (data.price?.change ?? 0) >= 0;

    // ... (inside the component return)

    return (
        <DashboardLayout noPadding>
            <div className="bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 terminal-grid-light selection:bg-blue-500/10 font-sans relative">


                <div className="max-w-[1700px] mx-auto px-8 py-10 space-y-10 relative z-10 animate-in fade-in slide-in-from-bottom-6 duration-1000">
                    {/* 1. TOP INTELLIGENCE ROW */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
                        <div className="lg:col-span-4">
                            <IntelligenceGlass
                                symbol={data.company?.symbol || data.fundamental?.ticker || ticker}
                                name={data.company?.name || data.fundamental?.company_name || 'N/A'}
                                price={data.price.close}
                                change={data.price.change}
                                percentChange={data.price.percent_change}
                                fundamentalScore={intelligence.fundamentalScore}
                                technicalScore={intelligence.technicalScore}
                                riskLevel={intelligence.riskLevel}
                                macd={intelligence.macd}
                                reason={intelligence.reason}
                            />
                        </div>
                        <div className="lg:col-span-8">
                            <BentoMetrics fundamental={data.fundamental} />
                        </div>
                    </div>

                    {/* 2. CORE ANALYTICS HUB */}
                    <div className="space-y-8">
                        <Tabs
                            defaultValue="indicators"
                            className="w-full"
                            value={activeTab}
                            onValueChange={setActiveTab}
                        >
                            <div className="flex flex-col md:flex-row items-center justify-between gap-6 px-4 mb-8">
                                <div className="flex items-center gap-6">
                                    <TabsList className="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1 h-9 rounded-xl">
                                        <TabsTrigger value="indicators" className="rounded-lg px-4 text-xs font-medium data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 data-[state=active]:shadow-sm">Indicators</TabsTrigger>
                                        <TabsTrigger value="signals" className="rounded-lg px-4 text-xs font-medium data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 data-[state=active]:shadow-sm">Signals</TabsTrigger>
                                        <TabsTrigger value="analysis" className="rounded-lg px-4 text-xs font-medium data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 data-[state=active]:shadow-sm">Analysis</TabsTrigger>
                                        <TabsTrigger value="floorsheet" className="rounded-lg px-4 text-xs font-medium data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 data-[state=active]:shadow-sm">Floorsheet</TabsTrigger>
                                        <TabsTrigger value="financials" className="rounded-lg px-4 text-xs font-medium data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 data-[state=active]:shadow-sm">Financials</TabsTrigger>
                                        <TabsTrigger value="dividends" className="rounded-lg px-4 text-xs font-medium data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 data-[state=active]:shadow-sm">Dividends</TabsTrigger>
                                        <TabsTrigger value="history" className="rounded-lg px-4 text-xs font-medium data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-blue-600 dark:data-[state=active]:text-blue-400 data-[state=active]:shadow-sm">History</TabsTrigger>
                                        <TabsTrigger value="fibonacci" className="rounded-lg px-4 text-xs font-medium data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-amber-600 dark:data-[state=active]:text-amber-400 data-[state=active]:shadow-sm">Fibonacci</TabsTrigger>
                                    </TabsList>
                                </div>
                            </div>

                            <div className="animate-in fade-in zoom-in-95 duration-700">
                                <TabsContent value="signals" className="mt-0 space-y-8">
                                    <SignalDashboard symbol={ticker} />
                                </TabsContent>

                                <TabsContent value="floorsheet" className="mt-0 space-y-8">
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                        {/* Accumulation (Top Buyers) */}
                                        <div className="glass-card-light dark:bg-slate-900 rounded-3xl p-8 border-slate-200 dark:border-slate-700">
                                            <div className="flex items-center gap-3 mb-6">
                                                <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800">
                                                    <TrendingUp size={18} />
                                                </div>
                                                <h4 className="font-bold text-slate-800 dark:text-slate-100">Top Buyers (Accumulation)</h4>
                                            </div>
                                            <div className="overflow-hidden rounded-2xl border border-slate-100 dark:border-slate-800">
                                                <table className="w-full text-sm">
                                                    <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700">
                                                        <tr>
                                                            <th className="px-6 py-4 text-left font-semibold text-slate-500 dark:text-slate-400 text-xs">Broker</th>
                                                            <th className="px-6 py-4 text-right font-semibold text-slate-500 dark:text-slate-400 text-xs">Quantity</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                                                        {(data.fundamental?.broker_accumulation?.['1D'] || [])
                                                            .filter(d => d.type === 'BUY')
                                                            .sort((a, b) => b.qty - a.qty)
                                                            .slice(0, 5)
                                                            .map((item, idx) => (
                                                                <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                                                                    <td className="px-6 py-4 font-bold text-blue-600">Broker {item.broker}</td>
                                                                    <td className="px-6 py-4 text-right font-mono font-bold text-slate-700">{item.qty.toLocaleString()}</td>
                                                                </tr>
                                                            ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>

                                        {/* Distribution (Top Sellers) */}
                                        <div className="glass-card-light dark:bg-slate-900 rounded-3xl p-8 border-slate-200 dark:border-slate-700">
                                            <div className="flex items-center gap-3 mb-6">
                                                <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-800">
                                                    <TrendingDown size={18} />
                                                </div>
                                                <h4 className="font-bold text-slate-800 dark:text-slate-100">Top Sellers (Distribution)</h4>
                                            </div>
                                            <div className="overflow-hidden rounded-2xl border border-slate-100 dark:border-slate-800">
                                                <table className="w-full text-sm">
                                                    <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700">
                                                        <tr>
                                                            <th className="px-6 py-4 text-left font-semibold text-slate-500 dark:text-slate-400 text-xs">Broker</th>
                                                            <th className="px-6 py-4 text-right font-semibold text-slate-500 dark:text-slate-400 text-xs">Quantity</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                                                        {(data.fundamental?.broker_accumulation?.['1D'] || [])
                                                            .filter(d => d.type === 'SELL')
                                                            .sort((a, b) => b.qty - a.qty)
                                                            .slice(0, 5)
                                                            .map((item, idx) => (
                                                                <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                                                                    <td className="px-6 py-4 font-bold text-rose-600">Broker {item.broker}</td>
                                                                    <td className="px-6 py-4 text-right font-mono font-bold text-slate-700 dark:text-slate-300">{item.qty.toLocaleString()}</td>
                                                                </tr>
                                                            ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Raw Floorsheet Table */}
                                    <div className="glass-card-light dark:bg-slate-900 rounded-3xl p-8 border-slate-200 dark:border-slate-700">
                                        <div className="flex items-center justify-between mb-8">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800">
                                                    <Activity size={18} />
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-slate-800 dark:text-slate-100">Transaction Stream</h4>
                                                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">Real-time market depth</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Badge className="bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border-none px-3">Direct Feed</Badge>
                                            </div>
                                        </div>
                                        <div className="overflow-x-auto no-scrollbar rounded-2xl border border-slate-100 dark:border-slate-800">
                                            <table className="w-full text-sm text-left">
                                                <thead className="bg-slate-50 dark:bg-slate-800 text-slate-400 border-b border-slate-100 dark:border-slate-700">
                                                    <tr>
                                                        <th className="px-6 py-4 font-semibold text-[10px]">Trans #</th>
                                                        <th className="px-6 py-4 font-semibold text-[10px]">Buyer</th>
                                                        <th className="px-6 py-4 font-semibold text-[10px]">Seller</th>
                                                        <th className="px-6 py-4 font-semibold text-[10px]">Qty</th>
                                                        <th className="px-6 py-4 font-semibold text-[10px]">Rate</th>
                                                        <th className="px-6 py-4 font-semibold text-[10px] text-right">Total</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                                                    {floorsheet.slice(0, 20).map((row, i) => (
                                                        <tr key={row.id || i} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-all group">
                                                            <td className="px-6 py-4 font-mono text-xs text-slate-400">#{row.contract_no}</td>
                                                            <td className="px-6 py-4"><span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-bold text-xs">{row.buyer_id}</span></td>
                                                            <td className="px-6 py-4"><span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold text-xs">{row.seller_id}</span></td>
                                                            <td className="px-6 py-4 font-bold text-slate-700 dark:text-slate-300">{row.transaction_quantity.toLocaleString()}</td>
                                                            <td className="px-6 py-4 font-mono text-slate-600 dark:text-slate-400">Rs. {row.transaction_rate.toLocaleString()}</td>
                                                            <td className="px-6 py-4 text-right font-bold text-slate-900 dark:text-slate-100">Rs. {row.transaction_amount.toLocaleString()}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </TabsContent>

                                <TabsContent value="dividends" className="mt-0">
                                    <div className="glass-card-light dark:bg-slate-900 rounded-2xl p-8 border-slate-200 dark:border-slate-700">
                                        <div className="flex items-center gap-3 mb-8">
                                            <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-800">
                                                <PieChart size={18} />
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-slate-800 dark:text-slate-100">Dividend Distribution History</h4>
                                                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">Shareholder rewards timeline</p>
                                            </div>
                                        </div>
                                        <div className="overflow-hidden rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
                                            <table className="w-full text-sm text-left">
                                                <thead className="bg-slate-50 dark:bg-slate-800 text-slate-400 border-b border-slate-100 dark:border-slate-700">
                                                    <tr>
                                                        <th className="px-6 py-4 font-semibold text-[10px]">Fiscal Year</th>
                                                        <th className="px-6 py-4 font-semibold text-[10px]">Bonus (%)</th>
                                                        <th className="px-6 py-4 font-semibold text-[10px]">Cash (%)</th>
                                                        <th className="px-6 py-4 font-semibold text-[10px]">Total (%)</th>
                                                        <th className="px-6 py-4 font-semibold text-[10px]">Announced Date</th>
                                                        <th className="px-6 py-4 font-semibold text-[10px] text-right">Book Close Date</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                                                    {dividends.map((div, i) => (
                                                        <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                                                            <td className="px-6 py-4 font-bold text-slate-800 dark:text-slate-200">{div.fiscal_year}</td>
                                                            <td className="px-6 py-4"><Badge variant="outline" className="text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-800/50 bg-emerald-50/30 dark:bg-emerald-900/20">{div.bonus_percent}%</Badge></td>
                                                            <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{div.cash_percent}%</td>
                                                            <td className="px-6 py-4 font-bold text-blue-600">{div.total_percent}%</td>
                                                            <td className="px-6 py-4 text-slate-400 text-xs font-mono">{div.announced_date || div.date || '-'}</td>
                                                            <td className="px-6 py-4 text-right text-slate-400 text-xs font-mono">{div.book_close_date || '-'}</td>
                                                        </tr>
                                                    ))}
                                                    {dividends.length === 0 && (
                                                        <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-400 italic">No distribution records found</td></tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </TabsContent>

                                <TabsContent value="financials" className="mt-0 space-y-8">
                                    <div className="glass-card-light rounded-2xl p-8">
                                        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-8">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800">
                                                    <BarChart2 size={18} />
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-slate-800 dark:text-slate-100">Financial Performance Matrix</h4>
                                                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">Multi-year trend analysis</p>
                                                </div>
                                            </div>
                                            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 shadow-inner">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setReportType('ANNUAL')}
                                                    className={cn("rounded-lg px-4 font-bold text-[10px] transition-all", reportType === 'ANNUAL' ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm" : "text-slate-400 dark:text-slate-500")}
                                                >
                                                    Annual
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setReportType('QUARTERLY')}
                                                    className={cn("rounded-lg px-4 font-bold text-[10px] transition-all", reportType === 'QUARTERLY' ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm" : "text-slate-400 dark:text-slate-500")}
                                                >
                                                    Quarterly
                                                </Button>
                                            </div>
                                        </div>

                                        {/* Financial Summary Chart */}
                                        <div className="bg-white/50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-800 p-6 mb-8 shadow-sm">
                                            <div className="h-[400px]">
                                                <ReactECharts
                                                    key={`${reportType}-${visibleMetrics.join('-')}`}
                                                    option={getFinancialsTrendOption()}
                                                    style={{ height: '100%', width: '100%' }}
                                                    theme={document.documentElement.classList.contains('dark') ? 'dark' : 'light'}
                                                />
                                            </div>
                                        </div>

                                        {/* Financial Data Grid */}
                                        <div className="space-y-4">
                                            {financials.filter(f => f.report_type === reportType).length > 0 ? (
                                                <div className="space-y-6">
                                                    {['balance_sheet', 'profit_loss', 'cash_flow', 'key_ratios'].map((section) => {
                                                        const report = financials.filter(f => f.report_type === reportType).sort((a, b) => b.fiscal_year.localeCompare(a.fiscal_year))[0];
                                                        const sectionData = report[section];
                                                        if (!sectionData) return null;

                                                        return (
                                                            <div key={section} className="border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                                                                <button
                                                                    onClick={() => toggleCollapse(`section-${section}`)}
                                                                    className="w-full flex items-center justify-between px-6 py-4 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100/50 dark:hover:bg-slate-700/50 transition-colors"
                                                                >
                                                                    <span className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                                                                        {section.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                                                                    </span>
                                                                    <ChevronDown size={16} className={cn("text-slate-400 dark:text-slate-500 transition-transform", !collapsedItems.has(`section-${section}`) && "rotate-180")} />
                                                                </button>
                                                                {!collapsedItems.has(`section-${section}`) && (
                                                                    <div className="p-6 bg-white/50 dark:bg-slate-900/50 overflow-x-auto no-scrollbar">
                                                                        <table className="w-full text-sm">
                                                                            <thead>
                                                                                <tr className="border-b border-slate-50 dark:border-slate-800">
                                                                                    <th className="text-left py-2 font-semibold text-slate-400 dark:text-slate-500 text-[10px]">Metadata/Metric</th>
                                                                                    {financials.filter(f => f.report_type === reportType)
                                                                                        .sort((a, b) => b.fiscal_year.localeCompare(a.fiscal_year))
                                                                                        .map((f, idx) => (
                                                                                            <th key={`${f.fiscal_year}-${idx}`} className="text-right px-4 font-bold text-slate-800 dark:text-slate-200">{f.fiscal_year}</th>
                                                                                        ))}
                                                                                </tr>
                                                                            </thead>
                                                                            <tbody>
                                                                                {Object.entries(sectionData).map(([category, items]: [string, any]) => (
                                                                                    <React.Fragment key={category}>
                                                                                        <tr className="bg-slate-50/30 dark:bg-slate-800/20">
                                                                                            <td colSpan={100} className="py-2 px-2 font-bold text-blue-600/70 dark:text-blue-400/70 text-[10px]">{category}</td>
                                                                                        </tr>
                                                                                        {Object.entries(items).map(([key, val]: [string, any]) => (
                                                                                            <tr key={key} className="hover:bg-slate-50/30 dark:hover:bg-slate-800/30 border-b border-slate-50 dark:border-slate-800 last:border-0 transition-colors group">
                                                                                                <td className="py-3 px-2 font-medium text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-100">{key}</td>
                                                                                                {financials.filter(f => f.report_type === reportType)
                                                                                                    .sort((a, b) => b.fiscal_year.localeCompare(a.fiscal_year))
                                                                                                    .map((f, idx) => {
                                                                                                        const v = f[section]?.[category]?.[key];
                                                                                                        return (
                                                                                                            <td key={`${f.fiscal_year}-${idx}`} className="text-right px-4 font-mono text-slate-700 dark:text-slate-300">
                                                                                                                {typeof v === 'number' ? (v >= 10000000 ? (v / 10000000).toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' Cr' : v.toLocaleString()) : (v || '-')}
                                                                                                            </td>
                                                                                                        );
                                                                                                    })}
                                                                                            </tr>
                                                                                        ))}
                                                                                    </React.Fragment>
                                                                                ))}
                                                                            </tbody>
                                                                        </table>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <div className="text-center p-12 text-slate-400 italic">No financial statements available for this period.</div>
                                            )}
                                        </div>
                                    </div>
                                </TabsContent>


                                <TabsContent value="indicators" className="mt-0">
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                        {/* Fundamental Benchmarks */}
                                        <div className="glass-card-light rounded-2xl p-8">
                                            <div className="flex items-center gap-3 mb-10">
                                                <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800">
                                                    <BarChart2 size={18} />
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-slate-800 dark:text-slate-100 text-lg">Fundamental Benchmarks</h4>
                                                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">Sector-wide comparison</p>
                                                </div>
                                            </div>

                                            <div className="overflow-hidden rounded-2xl border border-slate-100 dark:border-slate-800">
                                                <table className="w-full text-sm">
                                                    <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
                                                        <tr>
                                                            <th className="px-6 py-4 text-left font-semibold text-slate-400 dark:text-slate-500 text-[9px]">Metric</th>
                                                            <th className="px-6 py-4 text-center font-semibold text-slate-400 dark:text-slate-500 text-[9px]">Audited</th>
                                                            <th className="px-6 py-4 text-center font-semibold text-slate-400 dark:text-slate-500 text-[9px]">Unaudited</th>
                                                            <th className="px-6 py-4 text-left font-semibold text-slate-400 dark:text-slate-500 text-[9px]">Sector Range (Low - High)</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white/30 dark:bg-slate-950/40">
                                                        {[
                                                            { name: 'P/E Ratio', key: 'pe_ratio', label: 'P/E' },
                                                            { name: 'P/B Ratio', key: 'pb_ratio', label: 'P/B' },
                                                            { name: 'ROE (%)', key: 'ro_equity', label: 'ROE' },
                                                            { name: 'EPS', key: 'eps', label: 'EPS' },
                                                            { name: 'Dividend Yield', key: 'dividend_yield', label: 'Div Yield' },
                                                            { name: 'Book Value', key: 'book_value', label: 'Book Value' },
                                                            { name: 'Market Cap', key: 'market_cap', label: 'Mkt Cap' }
                                                        ].map((metric, i) => {
                                                            const indicator = data.fundamental?.fundamental_indicators?.find(ind => ind.name.toLowerCase().includes(metric.label.toLowerCase())) ||
                                                                data.fundamental?.fundamental_indicators?.find(ind => ind.name === metric.name);

                                                            const auditedValue = (data.fundamental as any)?.[metric.key];
                                                            const unauditedValue = (data.fundamental as any)?.[`${metric.key}_unaudited`] || auditedValue;

                                                            const formatVal = (val: any) => {
                                                                if (val === null || val === undefined) return '-';
                                                                if (typeof val === 'number') {
                                                                    if (val > 10000000) return (val / 10000000).toFixed(2) + ' Cr';
                                                                    return val.toFixed(2);
                                                                }
                                                                return val.toString();
                                                            };

                                                            return (
                                                                <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors group">
                                                                    <td className="px-6 py-4 font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">{metric.name}</td>
                                                                    <td className="px-6 py-4 text-center">
                                                                        <span className="px-2.5 py-1 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-bold text-[11px] ring-1 ring-blue-100 dark:ring-blue-800">{formatVal(auditedValue)}</span>
                                                                    </td>
                                                                    <td className="px-6 py-4 text-center">
                                                                        <span className="px-2.5 py-1 rounded bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 font-bold text-[11px] ring-1 ring-amber-100 dark:ring-amber-800">{formatVal(unauditedValue)}</span>
                                                                    </td>
                                                                    <td className="px-6 py-4">
                                                                        <div className="flex items-center gap-4">
                                                                            <div className="flex flex-col min-w-[40px]">
                                                                                <span className="text-xs text-rose-500 font-bold uppercase">{indicator?.sector_low || '-'}</span>
                                                                                <span className="text-[8px] text-slate-400 dark:text-slate-500 font-mono leading-tight">{indicator?.sector_low_ticker || ''}</span>
                                                                            </div>
                                                                            <div className="flex-1 h-1 bg-slate-100 dark:bg-slate-800 rounded-full relative">
                                                                                <div className="absolute top-1/2 left-1/4 w-1.5 h-1.5 -translate-y-1/2 bg-blue-500 rounded-full shadow-sm" />
                                                                            </div>
                                                                            <div className="flex flex-col items-end min-w-[40px]">
                                                                                <span className="text-xs text-emerald-500 font-bold uppercase">{indicator?.sector_high || '-'}</span>
                                                                                <span className="text-[8px] text-slate-400 dark:text-slate-500 font-mono leading-tight">{indicator?.sector_high_ticker || ''}</span>
                                                                            </div>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>

                                        {/* Technical Divergence */}
                                        <div className="glass-card-light rounded-2xl p-8">
                                            <div className="flex items-center gap-3 mb-10">
                                                <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800">
                                                    <TrendingUp size={18} />
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-slate-800 dark:text-slate-100 text-lg">Technical Divergence</h4>
                                                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">Relative strength mapping</p>
                                                </div>
                                            </div>

                                            <div className="p-6">
                                                <Tabs defaultValue="Momentum" className="w-full">
                                                    <TabsList className="grid w-full grid-cols-4 mb-6 p-1 bg-slate-100 dark:bg-slate-900 rounded-xl">
                                                        {['Momentum', 'Trend', 'Volatility', 'Volume'].map(cat => (
                                                            <TabsTrigger
                                                                key={cat}
                                                                value={cat}
                                                                className="rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:text-primary dark:data-[state=active]:text-blue-400 data-[state=active]:shadow-sm transition-all duration-200 text-[10px] sm:text-xs"
                                                            >
                                                                {cat}
                                                            </TabsTrigger>
                                                        ))}
                                                    </TabsList>

                                                    {['Momentum', 'Trend', 'Volatility', 'Volume'].map(category => {
                                                        const indicators = data.fundamental?.technical_indicators?.filter((ind: any) => ind.category === category) || [];

                                                        return (
                                                            <TabsContent key={category} value={category} className="mt-0 focus-visible:outline-none ring-offset-background">
                                                                <div className="overflow-hidden overflow-y-auto max-h-[500px] rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm relative no-scrollbar">
                                                                    <table className="w-full text-sm">
                                                                        <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 backdrop-blur-sm sticky top-0 z-10">
                                                                            <tr>
                                                                                <th className="px-6 py-4 text-left font-semibold text-slate-400 dark:text-slate-500 text-[9px]">Indicator</th>
                                                                                <th className="px-6 py-4 text-center font-semibold text-slate-400 dark:text-slate-500 text-[9px]">Value</th>
                                                                                <th className="px-6 py-4 text-left font-semibold text-slate-400 dark:text-slate-500 text-[9px]">Sector Range (Low - High)</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white/30 dark:bg-slate-950/40">
                                                                            {indicators.length > 0 ? (
                                                                                indicators.map((indicator: any, i: number) => (
                                                                                    <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors group">
                                                                                        <td className="px-6 py-4 font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">{indicator.name}</td>
                                                                                        <td className="px-6 py-4 text-center">
                                                                                            <span className="px-2.5 py-1 rounded bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs ring-1 ring-slate-200 dark:ring-slate-700 group-hover:bg-white dark:group-hover:bg-slate-700 group-hover:shadow-sm transition-all">{indicator.value}</span>
                                                                                        </td>
                                                                                        <td className="px-6 py-4">
                                                                                            {indicator.sector_high !== '-' ? (
                                                                                                <div className="flex items-center gap-4">
                                                                                                    <div className="flex flex-col min-w-[40px]">
                                                                                                        <span className="text-xs text-rose-500 font-bold uppercase">{indicator.sector_low}</span>
                                                                                                        {/* <span className="text-[8px] text-slate-400 font-mono leading-tight">{indicator.sector_low_ticker}</span> */}
                                                                                                    </div>
                                                                                                    <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full relative overflow-hidden">
                                                                                                        <div className="absolute inset-0 bg-gradient-to-r from-rose-100 dark:from-rose-900/20 via-slate-100 dark:via-slate-800 to-emerald-100 dark:to-emerald-900/20 opacity-50"></div>
                                                                                                        {/* Calculate position based on math if possible, else center or use simplified visual */}
                                                                                                        <div className="absolute top-0 bottom-0 w-1 bg-slate-400 dark:bg-slate-500 rounded-full left-1/2 -translate-x-1/2 ring-2 ring-white dark:ring-slate-900"></div>
                                                                                                    </div>
                                                                                                    <div className="flex flex-col items-end min-w-[40px]">
                                                                                                        <span className="text-xs text-emerald-500 font-bold uppercase">{indicator.sector_high}</span>
                                                                                                        {/* <span className="text-[8px] text-slate-400 font-mono leading-tight">{indicator.sector_high_ticker}</span> */}
                                                                                                    </div>
                                                                                                </div>
                                                                                            ) : (
                                                                                                <span className="text-xs text-slate-400 italic">No Sector Data</span>
                                                                                            )}
                                                                                        </td>
                                                                                    </tr>
                                                                                ))
                                                                            ) : (
                                                                                <tr>
                                                                                    <td colSpan={3} className="px-6 py-8 text-center text-slate-400 italic">
                                                                                        No indicators available for this category.
                                                                                    </td>
                                                                                </tr>
                                                                            )}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            </TabsContent>
                                                        );
                                                    })}
                                                </Tabs>
                                            </div>
                                        </div>
                                    </div>
                                </TabsContent>

                                <TabsContent value="analysis" className="mt-8 outline-none">
                                    <BrokerAnalysis symbol={ticker} />
                                </TabsContent>

                                <TabsContent value="fibonacci" className="mt-0 space-y-8">
                                    <FibonacciRetracement symbol={ticker} />
                                </TabsContent>

                                <TabsContent value="history" className="mt-0">
                                    <div className="glass-card-light rounded-2xl p-8 border-slate-200">
                                        <div className="flex items-center justify-between mb-8">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 rounded-xl bg-slate-50 text-slate-600 border border-slate-100">
                                                    <Clock size={18} />
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-slate-800">Historical Price Action</h4>
                                                    <p className="text-[10px] text-slate-400 font-semibold">Ohlcv historical logs</p>
                                                </div>
                                            </div>
                                            <div className="flex bg-slate-100/80 dark:bg-slate-800/80 rounded-lg p-1 gap-1">
                                                <button
                                                    onClick={() => setHistoryView('graph')}
                                                    className={`p-2 rounded-md transition-all flex items-center gap-2 ${historyView === 'graph' ? 'bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400 font-bold' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'}`}
                                                >
                                                    <LineChart size={16} />
                                                    <span className="text-xs">Graph</span>
                                                </button>
                                                <button
                                                    onClick={() => setHistoryView('table')}
                                                    className={`p-2 rounded-md transition-all flex items-center gap-2 ${historyView === 'table' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-800 dark:text-slate-100 font-bold' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'}`}
                                                >
                                                    <Table2 size={16} />
                                                    <span className="text-xs">Table</span>
                                                </button>
                                            </div>
                                        </div>

                                        {historyView === 'table' ? (
                                            <div className="overflow-hidden overflow-y-auto max-h-[500px] rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm relative no-scrollbar">
                                                <table className="w-full text-sm text-left">
                                                    <thead className="bg-slate-50 dark:bg-slate-900 text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800 sticky top-0 z-10">
                                                        <tr>
                                                            <th className="px-6 py-4 font-semibold text-[10px]">Date</th>
                                                            <th className="px-6 py-4 font-semibold text-[10px]">Open</th>
                                                            <th className="px-6 py-4 font-semibold text-[10px]">High</th>
                                                            <th className="px-6 py-4 font-semibold text-[10px]">Low</th>
                                                            <th className="px-6 py-4 font-semibold text-[10px]">Close</th>
                                                            <th className="px-6 py-4 font-semibold text-[10px] text-right">Volume</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-50 dark:divide-slate-800 bg-white/30 dark:bg-slate-950/40">
                                                        {[...history]
                                                            .filter(row => new Date(row.date) > new Date(Date.now() - 90 * 24 * 60 * 60 * 1000))
                                                            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                                            .map((row, i) => (
                                                                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                                                    <td className="px-6 py-4 font-bold text-slate-800 dark:text-slate-100">{row.date}</td>
                                                                    <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{row.open}</td>
                                                                    <td className="px-6 py-4 text-emerald-600 dark:text-emerald-400 font-medium">{row.high}</td>
                                                                    <td className="px-6 py-4 text-rose-600 dark:text-rose-400 font-medium">{row.low}</td>
                                                                    <td className="px-6 py-4 font-bold text-slate-900 dark:text-slate-100">{row.close}</td>
                                                                    <td className="px-6 py-4 text-right font-mono text-xs text-slate-400 dark:text-slate-500">{row.volume.toLocaleString()}</td>
                                                                </tr>
                                                            ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        ) : (
                                            <div className="h-[500px] w-full bg-slate-50/50 dark:bg-slate-950/20 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 relative">
                                                {(() => {
                                                    // 1. Prepare Data
                                                    const historyData = [...history]
                                                        .filter(row => new Date(row.date) > new Date(Date.now() - 90 * 24 * 60 * 60 * 1000))
                                                        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

                                                    // 2. Extract Indicators & Levels
                                                    const indicators = data?.fundamental?.technical_indicators || [];
                                                    const getVal = (k: string) => {
                                                        const i = indicators.find((x: any) => x.name.includes(k));
                                                        if (!i?.value) return null;
                                                        const val = parseFloat(i.value.toString().replace(/[^0-9.-]/g, ''));
                                                        return isNaN(val) ? null : val;
                                                    };

                                                    const r3 = getVal('Resistance 3');
                                                    const r2 = getVal('Resistance 2');
                                                    const r1 = getVal('Resistance 1');
                                                    const p = getVal('Pivot');
                                                    const s1 = getVal('Support 1');
                                                    const s2 = getVal('Support 2');
                                                    const s3 = getVal('Support 3');
                                                    const current = historyData.length > 0 ? historyData[historyData.length - 1].close : null;

                                                    // 3. Calculate Domain to include ALL levels
                                                    const allValues = [r3, r2, r1, p, s1, s2, s3, current, ...historyData.map(d => d.close)].filter(v => typeof v === 'number' && !isNaN(v)) as number[];
                                                    const minDomain = allValues.length > 0 ? Math.min(...allValues) : 'auto';
                                                    const maxDomain = allValues.length > 0 ? Math.max(...allValues) : 'auto';
                                                    // Add 5% padding
                                                    let finalMin: number | 'auto' = 'auto';
                                                    let finalMax: number | 'auto' = 'auto';

                                                    if (typeof minDomain === 'number' && typeof maxDomain === 'number') {
                                                        const range = maxDomain - minDomain;
                                                        const padding = range * 0.05;
                                                        finalMin = Math.floor(minDomain - padding);
                                                        finalMax = Math.ceil(maxDomain + padding);
                                                    }

                                                    // 4. Custom Flag Component
                                                    const CustomFlag = ({ viewBox, value, color, label }: any) => {
                                                        const { width, y } = viewBox;
                                                        if (!width || !y) return null;
                                                        const flagWidth = 55;
                                                        const flagHeight = 20;
                                                        const xPos = width - flagWidth;
                                                        const yPos = y - (flagHeight / 2);
                                                        return (
                                                            <g>
                                                                <path d={`M${xPos} ${yPos} h${flagWidth} a2 2 0 0 1 2 2 v${flagHeight - 4} a2 2 0 0 1 -2 2 h-${flagWidth} l-5 -${flagHeight / 2} z`} fill={color} />
                                                                <text x={xPos + flagWidth / 2 + 2} y={yPos + 14} textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">
                                                                    {label}: {typeof value === 'number' ? value.toFixed(0) : value}
                                                                </text>
                                                            </g>
                                                        )
                                                    };

                                                    return (
                                                        <ResponsiveContainer width="100%" height="100%">
                                                            <AreaChart data={historyData}>
                                                                <defs>
                                                                    <linearGradient id="colorClose" x1="0" y1="0" x2="0" y2="1">
                                                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                                                    </linearGradient>
                                                                </defs>
                                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={document.documentElement.classList.contains('dark') ? '#334155' : '#e2e8f0'} />
                                                                <XAxis
                                                                    dataKey="date"
                                                                    tickFormatter={(str) => {
                                                                        const date = new Date(str);
                                                                        return date.toLocaleDateString("en-US", { month: "short", year: '2-digit' });
                                                                    }}
                                                                    axisLine={false}
                                                                    tickLine={false}
                                                                    tick={{ fontSize: 10, fill: document.documentElement.classList.contains('dark') ? '#64748b' : '#94a3b8' }}
                                                                    minTickGap={30}
                                                                />
                                                                <YAxis
                                                                    domain={[finalMin, finalMax]}
                                                                    axisLine={false}
                                                                    tickLine={false}
                                                                    tick={{ fontSize: 10, fill: document.documentElement.classList.contains('dark') ? '#64748b' : '#94a3b8' }}
                                                                    width={40}
                                                                />
                                                                <RechartsTooltip
                                                                    contentStyle={{
                                                                        backgroundColor: document.documentElement.classList.contains('dark') ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.9)',
                                                                        borderRadius: '12px',
                                                                        border: `1px solid ${document.documentElement.classList.contains('dark') ? '#334155' : '#e2e8f0'}`,
                                                                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                                                                    }}
                                                                    itemStyle={{ color: document.documentElement.classList.contains('dark') ? '#f1f5f9' : '#1e293b', fontWeight: 'bold', fontSize: '12px' }}
                                                                    labelStyle={{ color: document.documentElement.classList.contains('dark') ? '#94a3b8' : '#64748b', fontSize: '10px', marginBottom: '4px' }}
                                                                />
                                                                <Area
                                                                    type="monotone"
                                                                    dataKey="close"
                                                                    stroke="#3b82f6"
                                                                    strokeWidth={2}
                                                                    fillOpacity={1}
                                                                    fill="url(#colorClose)"
                                                                />

                                                                {/* Resistances (Green) */}
                                                                {r3 && <ReferenceLine y={r3} stroke="#10b981" strokeDasharray="3 3" label={(props) => <CustomFlag {...props} value={r3} color="#10b981" label="R3" />} />}
                                                                {r2 && <ReferenceLine y={r2} stroke="#10b981" strokeDasharray="3 3" label={(props) => <CustomFlag {...props} value={r2} color="#10b981" label="R2" />} />}
                                                                {r1 && <ReferenceLine y={r1} stroke="#10b981" strokeDasharray="3 3" label={(props) => <CustomFlag {...props} value={r1} color="#10b981" label="R1" />} />}

                                                                {/* Pivot (Grey) */}
                                                                {p && <ReferenceLine y={p} stroke="#64748b" strokeDasharray="5 5" />}

                                                                {/* Supports (Red) */}
                                                                {s1 && <ReferenceLine y={s1} stroke="#ef4444" strokeDasharray="3 3" label={(props) => <CustomFlag {...props} value={s1} color="#ef4444" label="S1" />} />}
                                                                {s2 && <ReferenceLine y={s2} stroke="#ef4444" strokeDasharray="3 3" label={(props) => <CustomFlag {...props} value={s2} color="#ef4444" label="S2" />} />}
                                                                {s3 && <ReferenceLine y={s3} stroke="#ef4444" strokeDasharray="3 3" label={(props) => <CustomFlag {...props} value={s3} color="#ef4444" label="S3" />} />}

                                                                {/* Current Price (Blue) */}
                                                                {current && (
                                                                    <ReferenceLine
                                                                        y={current}
                                                                        stroke="#3b82f6"
                                                                        strokeDasharray="3 3"
                                                                        label={(props) => <CustomFlag {...props} value={current} color="#3b82f6" label="CMP" />}
                                                                    />
                                                                )}
                                                            </AreaChart>
                                                        </ResponsiveContainer>
                                                    );
                                                })()}
                                            </div>
                                        )}
                                    </div>
                                </TabsContent>
                            </div>
                        </Tabs>
                    </div>
                </div>

                <TransactionModal
                    isOpen={modalOpen}
                    onClose={() => setModalOpen(false)}
                    onSuccess={() => setModalOpen(false)}
                    defaultType={txnType}
                    defaultTicker={ticker}
                    accounts={accounts}
                />
            </div >
        </DashboardLayout >
    );
}
