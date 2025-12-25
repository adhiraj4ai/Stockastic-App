'use client';

import { useEffect, useState, use, Fragment } from 'react';
import React from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, TrendingUp, TrendingDown, DollarSign, Activity, BarChart2, Clock } from 'lucide-react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import TransactionModal from '@/components/TransactionModal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import StockLink from '@/components/StockLink';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Check, ChevronDown, Search, X, PieChart, BarChart, Globe } from 'lucide-react';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';

// Terminal Suite Components
import { TerminalHeader } from '@/components/stock/TerminalHeader';
import { IntelligenceGlass } from '@/components/stock/IntelligenceGlass';
import { BentoMetrics } from '@/components/stock/BentoMetrics';

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
    transaction_no: string;
    buyer_broker: string;
    seller_broker: string;
    quantity: number;
    rate: number;
    amount: number;
    date: string;
}

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
                    <div className="text-red-500 text-xl font-bold mb-2">Error Loading Stock Data</div>
                    <div className="text-gray-600">{error}</div>
                    <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>Retry</Button>
                </div>
            </DashboardLayout>
        );
    }

    if (loading) return (
        <DashboardLayout>
            <div className="flex items-center justify-center min-h-[50vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
            </div>
        </DashboardLayout>
    );
    if (!data) return (
        <DashboardLayout>
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-4">
                <div className="text-red-500 text-xl font-bold">Stock Not Found</div>
                <p className="text-gray-500">Could not find data for ticker: {ticker}</p>
                <Button variant="outline" onClick={() => router.push('/home')}>Go Home</Button>
            </div>
        </DashboardLayout>
    );

    const isPositive = (data.price?.change ?? 0) >= 0;

    // ... (inside the component return)

    return (
        <DashboardLayout noPadding>
            <div className="bg-slate-50 text-slate-900 terminal-grid-light selection:bg-blue-500/10 font-sans relative">
                {/* Immersive Blur Backgrounds (Light Mode) */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/5 rounded-full blur-[120px]" />
                    <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-500/5 rounded-full blur-[120px]" />
                </div>

                <TerminalHeader
                    symbol={data.company?.symbol || data.fundamental?.ticker || ticker}
                    name={data.company?.name || data.fundamental?.company_name || 'N/A'}
                    sector={data.company?.sector || data.fundamental?.sector || 'Unknown'}
                    price={data.price.close}
                    change={data.price.change}
                    percentChange={data.price.percent_change}
                    onTrade={(type) => {
                        setTxnType(type);
                        setModalOpen(true);
                    }}
                />

                <div className="max-w-[1700px] mx-auto px-8 py-10 space-y-10 relative z-10 animate-in fade-in slide-in-from-bottom-6 duration-1000">
                    {/* 1. TOP INTELLIGENCE ROW */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
                        <div className="lg:col-span-4">
                            <IntelligenceGlass
                                fundamentalScore={68}
                                technicalScore={72}
                                riskLevel="MEDIUM"
                                macd="BULLISH"
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
                                    <TabsList className="bg-slate-100 border border-slate-200 p-1 h-9 rounded-xl">
                                        <TabsTrigger value="indicators" className="rounded-lg px-4 text-[10px] font-bold uppercase tracking-wider data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm">Indicators</TabsTrigger>
                                        <TabsTrigger value="floorsheet" className="rounded-lg px-4 text-[10px] font-bold uppercase tracking-wider data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm">Floorsheet</TabsTrigger>
                                        <TabsTrigger value="financials" className="rounded-lg px-4 text-[10px] font-bold uppercase tracking-wider data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm">Financials</TabsTrigger>
                                        <TabsTrigger value="dividends" className="rounded-lg px-4 text-[10px] font-bold uppercase tracking-wider data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm">Dividends</TabsTrigger>
                                        <TabsTrigger value="history" className="rounded-lg px-4 text-[10px] font-bold uppercase tracking-wider data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm">History</TabsTrigger>
                                    </TabsList>
                                </div>
                            </div>

                            <div className="animate-in fade-in zoom-in-95 duration-700">
                                <TabsContent value="floorsheet" className="mt-0 space-y-8">
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                        {/* Accumulation (Top Buyers) */}
                                        <div className="glass-card-light rounded-3xl p-8 border-slate-200">
                                            <div className="flex items-center gap-3 mb-6">
                                                <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
                                                    <TrendingUp size={18} />
                                                </div>
                                                <h4 className="font-bold text-slate-800">Top Buyers (Accumulation)</h4>
                                            </div>
                                            <div className="overflow-hidden rounded-2xl border border-slate-100">
                                                <table className="w-full text-sm">
                                                    <thead className="bg-slate-50 border-b border-slate-100">
                                                        <tr>
                                                            <th className="px-6 py-4 text-left font-bold text-slate-400 uppercase tracking-widest text-[10px]">Broker</th>
                                                            <th className="px-6 py-4 text-right font-bold text-slate-400 uppercase tracking-widest text-[10px]">Quantity</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-50">
                                                        {(data.fundamental?.broker_accumulation?.['1D'] || [])
                                                            .filter(d => d.type === 'BUY')
                                                            .sort((a, b) => b.qty - a.qty)
                                                            .slice(0, 5)
                                                            .map((item, idx) => (
                                                                <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                                                    <td className="px-6 py-4 font-bold text-blue-600">Broker {item.broker}</td>
                                                                    <td className="px-6 py-4 text-right font-mono font-bold text-slate-700">{item.qty.toLocaleString()}</td>
                                                                </tr>
                                                            ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>

                                        {/* Distribution (Top Sellers) */}
                                        <div className="glass-card-light rounded-3xl p-8 border-slate-200">
                                            <div className="flex items-center gap-3 mb-6">
                                                <div className="p-2 rounded-xl bg-rose-50 text-rose-600 border border-rose-100">
                                                    <TrendingDown size={18} />
                                                </div>
                                                <h4 className="font-bold text-slate-800">Top Sellers (Distribution)</h4>
                                            </div>
                                            <div className="overflow-hidden rounded-2xl border border-slate-100">
                                                <table className="w-full text-sm">
                                                    <thead className="bg-slate-50 border-b border-slate-100">
                                                        <tr>
                                                            <th className="px-6 py-4 text-left font-bold text-slate-400 uppercase tracking-widest text-[10px]">Broker</th>
                                                            <th className="px-6 py-4 text-right font-bold text-slate-400 uppercase tracking-widest text-[10px]">Quantity</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-50">
                                                        {(data.fundamental?.broker_accumulation?.['1D'] || [])
                                                            .filter(d => d.type === 'SELL')
                                                            .sort((a, b) => b.qty - a.qty)
                                                            .slice(0, 5)
                                                            .map((item, idx) => (
                                                                <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                                                                    <td className="px-6 py-4 font-bold text-rose-600">Broker {item.broker}</td>
                                                                    <td className="px-6 py-4 text-right font-mono font-bold text-slate-700">{item.qty.toLocaleString()}</td>
                                                                </tr>
                                                            ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Raw Floorsheet Table */}
                                    <div className="glass-card-light rounded-3xl p-8 border-slate-200">
                                        <div className="flex items-center justify-between mb-8">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
                                                    <Activity size={18} />
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-slate-800">Live Transaction Stream</h4>
                                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Real-time market depth</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Badge className="bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border-none px-3">Live Feed</Badge>
                                            </div>
                                        </div>
                                        <div className="overflow-x-auto no-scrollbar rounded-2xl border border-slate-100">
                                            <table className="w-full text-sm text-left">
                                                <thead className="bg-slate-50 text-slate-400 border-b border-slate-100">
                                                    <tr>
                                                        <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px]">Trans #</th>
                                                        <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px]">Buyer</th>
                                                        <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px]">Seller</th>
                                                        <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px]">Qty</th>
                                                        <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px]">Rate</th>
                                                        <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px] text-right">Total</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-50">
                                                    {floorsheet.slice(0, 20).map((row, i) => (
                                                        <tr key={i} className="hover:bg-slate-50/50 transition-all group">
                                                            <td className="px-6 py-4 font-mono text-xs text-slate-400">#{row.transaction_no}</td>
                                                            <td className="px-6 py-4"><span className="px-2 py-0.5 rounded bg-blue-50 text-blue-600 font-bold text-xs">{row.buyer_broker}</span></td>
                                                            <td className="px-6 py-4"><span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-bold text-xs">{row.seller_broker}</span></td>
                                                            <td className="px-6 py-4 font-bold text-slate-700">{row.quantity.toLocaleString()}</td>
                                                            <td className="px-6 py-4 font-mono text-slate-600">Rs. {row.rate}</td>
                                                            <td className="px-6 py-4 text-right font-bold text-slate-900">Rs. {row.amount.toLocaleString()}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </TabsContent>

                                <TabsContent value="dividends" className="mt-0">
                                    <div className="glass-card-light rounded-3xl p-8 border-slate-200">
                                        <div className="flex items-center gap-3 mb-8">
                                            <div className="p-2 rounded-xl bg-amber-50 text-amber-600 border border-amber-100">
                                                <PieChart size={18} />
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-slate-800">Dividend Distribution History</h4>
                                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Shareholder rewards timeline</p>
                                            </div>
                                        </div>
                                        <div className="overflow-hidden rounded-2xl border border-slate-100 shadow-sm">
                                            <table className="w-full text-sm text-left">
                                                <thead className="bg-slate-50 text-slate-400 border-b border-slate-100">
                                                    <tr>
                                                        <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px]">Fiscal Year</th>
                                                        <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px]">Bonus (%)</th>
                                                        <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px]">Cash (%)</th>
                                                        <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px]">Total (%)</th>
                                                        <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px] text-right">Declaration Date</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-50">
                                                    {dividends.map((div, i) => (
                                                        <tr key={i} className="hover:bg-slate-50 transition-colors">
                                                            <td className="px-6 py-4 font-bold text-slate-800">{div.fiscal_year}</td>
                                                            <td className="px-6 py-4"><Badge variant="outline" className="text-emerald-600 border-emerald-100 bg-emerald-50/30">{div.bonus_percent}%</Badge></td>
                                                            <td className="px-6 py-4 text-slate-600">{div.cash_percent}%</td>
                                                            <td className="px-6 py-4 font-bold text-blue-600">{div.total_percent}%</td>
                                                            <td className="px-6 py-4 text-right text-slate-400 text-xs font-mono">{div.date}</td>
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
                                    <div className="glass-card-light rounded-3xl p-8 border-slate-200">
                                        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-8">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
                                                    <BarChart size={18} />
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-slate-800">Financial Performance Matrix</h4>
                                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Multi-year trend analysis</p>
                                                </div>
                                            </div>
                                            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setReportType('ANNUAL')}
                                                    className={cn("rounded-lg px-4 font-bold text-[10px] uppercase transition-all", reportType === 'ANNUAL' ? "bg-white text-blue-600 shadow-sm" : "text-slate-400")}
                                                >
                                                    Annual
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setReportType('QUARTERLY')}
                                                    className={cn("rounded-lg px-4 font-bold text-[10px] uppercase transition-all", reportType === 'QUARTERLY' ? "bg-white text-blue-600 shadow-sm" : "text-slate-400")}
                                                >
                                                    Quarterly
                                                </Button>
                                            </div>
                                        </div>

                                        {/* Financial Summary Chart */}
                                        <div className="bg-white rounded-2xl border border-slate-100 p-6 mb-8 shadow-sm">
                                            <div className="h-[400px]">
                                                <ReactECharts
                                                    key={`${reportType}-${visibleMetrics.join('-')}`}
                                                    option={getFinancialsTrendOption()}
                                                    style={{ height: '100%', width: '100%' }}
                                                    theme="light"
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
                                                            <div key={section} className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                                                                <button
                                                                    onClick={() => toggleCollapse(`section-${section}`)}
                                                                    className="w-full flex items-center justify-between px-6 py-4 bg-slate-50 hover:bg-slate-100/50 transition-colors"
                                                                >
                                                                    <span className="font-bold text-slate-800 flex items-center gap-2">
                                                                        {section.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                                                                    </span>
                                                                    <ChevronDown size={16} className={cn("text-slate-400 transition-transform", !collapsedItems.has(`section-${section}`) && "rotate-180")} />
                                                                </button>
                                                                {!collapsedItems.has(`section-${section}`) && (
                                                                    <div className="p-6 bg-white overflow-x-auto no-scrollbar">
                                                                        <table className="w-full text-sm">
                                                                            <thead>
                                                                                <tr className="border-b border-slate-50">
                                                                                    <th className="text-left py-2 font-bold text-slate-400 text-[10px] uppercase tracking-widest">Metadata/Metric</th>
                                                                                    {financials.filter(f => f.report_type === reportType)
                                                                                        .sort((a, b) => b.fiscal_year.localeCompare(a.fiscal_year))
                                                                                        .map(f => (
                                                                                            <th key={f.fiscal_year} className="text-right px-4 font-bold text-slate-800">{f.fiscal_year}</th>
                                                                                        ))}
                                                                                </tr>
                                                                            </thead>
                                                                            <tbody>
                                                                                {Object.entries(sectionData).map(([category, items]: [string, any]) => (
                                                                                    <React.Fragment key={category}>
                                                                                        <tr className="bg-slate-50/30">
                                                                                            <td colSpan={100} className="py-2 px-2 font-bold text-blue-600/70 text-[10px] uppercase tracking-widest">{category}</td>
                                                                                        </tr>
                                                                                        {Object.entries(items).map(([key, val]: [string, any]) => (
                                                                                            <tr key={key} className="hover:bg-slate-50/30 border-b border-slate-50 last:border-0 transition-colors group">
                                                                                                <td className="py-3 px-2 font-medium text-slate-600 group-hover:text-slate-900">{key}</td>
                                                                                                {financials.filter(f => f.report_type === reportType)
                                                                                                    .sort((a, b) => b.fiscal_year.localeCompare(a.fiscal_year))
                                                                                                    .map(f => {
                                                                                                        const v = f[section]?.[category]?.[key];
                                                                                                        return (
                                                                                                            <td key={f.fiscal_year} className="text-right px-4 font-mono text-slate-700">
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
                                        <div className="glass-card-light rounded-3xl p-8 border-slate-200">
                                            <div className="flex items-center gap-3 mb-10">
                                                <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
                                                    <BarChart2 size={18} />
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-slate-800 text-lg">Fundamental Benchmarks</h4>
                                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Sector-wide comparison</p>
                                                </div>
                                            </div>

                                            <div className="overflow-hidden rounded-2xl border border-slate-100">
                                                <table className="w-full text-sm">
                                                    <thead className="bg-slate-50 border-b border-slate-100">
                                                        <tr>
                                                            <th className="px-6 py-4 text-left font-bold text-slate-400 uppercase tracking-widest text-[9px]">Metric</th>
                                                            <th className="px-6 py-4 text-center font-bold text-slate-400 uppercase tracking-widest text-[9px]">Value</th>
                                                            <th className="px-6 py-4 text-left font-bold text-slate-400 uppercase tracking-widest text-[9px]">Sector Range (Low - High)</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100 bg-white/50">
                                                        {[
                                                            { name: 'P/E Ratio', key: 'pe_ratio', label: 'P/E' },
                                                            { name: 'P/B Ratio', key: 'pb_ratio', label: 'P/B' },
                                                            { name: 'ROE (%)', key: 'roe', label: 'ROE' },
                                                            { name: 'EPS', key: 'eps', label: 'EPS' },
                                                            { name: 'Dividend Yield', key: 'dividend_yield', label: 'Div Yield' },
                                                            { name: 'Book Value', key: 'book_value', label: 'Book Value' },
                                                            { name: 'Market Cap', key: 'market_cap', label: 'Mkt Cap' }
                                                        ].map((metric, i) => {
                                                            const indicator = data.fundamental?.fundamental_indicators?.find(ind => ind.name.toLowerCase().includes(metric.label.toLowerCase())) ||
                                                                data.fundamental?.fundamental_indicators?.find(ind => ind.name === metric.name);
                                                            const rawValue = (data.fundamental as any)?.[metric.key];
                                                            const displayValue = indicator?.value || (rawValue ? (typeof rawValue === 'number' && rawValue > 10000000 ? (rawValue / 10000000).toFixed(2) + ' Cr' : rawValue.toString()) : '-');

                                                            return (
                                                                <tr key={i} className="hover:bg-slate-50/50 transition-colors group">
                                                                    <td className="px-6 py-4 font-bold text-slate-700 whitespace-nowrap">{metric.name}</td>
                                                                    <td className="px-6 py-4 text-center">
                                                                        <span className="px-2.5 py-1 rounded bg-blue-50 text-blue-600 font-bold text-xs ring-1 ring-blue-100">{displayValue}</span>
                                                                    </td>
                                                                    <td className="px-6 py-4">
                                                                        <div className="flex items-center gap-4">
                                                                            <div className="flex flex-col min-w-[40px]">
                                                                                <span className="text-xs text-rose-500 font-bold uppercase">{indicator?.sector_low || '-'}</span>
                                                                                <span className="text-[8px] text-slate-400 font-mono leading-tight">{indicator?.sector_low_ticker || ''}</span>
                                                                            </div>
                                                                            <div className="flex-1 h-1 bg-slate-100 rounded-full relative">
                                                                                <div className="absolute top-1/2 left-1/4 w-1.5 h-1.5 -translate-y-1/2 bg-blue-500 rounded-full shadow-sm" />
                                                                            </div>
                                                                            <div className="flex flex-col items-end min-w-[40px]">
                                                                                <span className="text-xs text-emerald-500 font-bold uppercase">{indicator?.sector_high || '-'}</span>
                                                                                <span className="text-[8px] text-slate-400 font-mono leading-tight">{indicator?.sector_high_ticker || ''}</span>
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
                                        <div className="glass-card-light rounded-3xl p-8 border-slate-200">
                                            <div className="flex items-center gap-3 mb-10">
                                                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
                                                    <TrendingUp size={18} />
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-slate-800 text-lg">Technical Divergence</h4>
                                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Relative strength mapping</p>
                                                </div>
                                            </div>

                                            <div className="overflow-hidden rounded-2xl border border-slate-100">
                                                <table className="w-full text-sm">
                                                    <thead className="bg-slate-50 border-b border-slate-100">
                                                        <tr>
                                                            <th className="px-6 py-4 text-left font-bold text-slate-400 uppercase tracking-widest text-[9px]">Indicator</th>
                                                            <th className="px-6 py-4 text-center font-bold text-slate-400 uppercase tracking-widest text-[9px]">Signal</th>
                                                            <th className="px-6 py-4 text-left font-bold text-slate-400 uppercase tracking-widest text-[9px]">Sector Range (Low - High)</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100 bg-white/50">
                                                        {[
                                                            { name: 'RSI (14)', label: 'RSI' },
                                                            { name: 'MACD (12, 26, 9)', label: 'MACD' },
                                                            { name: 'ADX (14)', label: 'ADX' },
                                                            { name: '20-Day SMA', label: '20 SMA' },
                                                            { name: '50-Day SMA', label: '50 SMA' },
                                                            { name: '200-Day SMA', label: '200 SMA' },
                                                            { name: 'Bollinger Bands', label: 'BB' }
                                                        ].map((metric, i) => {
                                                            const indicator = data.fundamental?.technical_indicators?.find(ind => ind.name.toLowerCase().includes(metric.label.toLowerCase())) ||
                                                                data.fundamental?.technical_indicators?.find(ind => ind.name === metric.name);
                                                            const displayValue = indicator?.value || '-';

                                                            return (
                                                                <tr key={i} className="hover:bg-slate-50/50 transition-colors group">
                                                                    <td className="px-6 py-4 font-bold text-slate-700 whitespace-nowrap">{metric.name}</td>
                                                                    <td className="px-6 py-4 text-center">
                                                                        <span className="px-2.5 py-1 rounded bg-emerald-50 text-emerald-600 font-bold text-xs ring-1 ring-emerald-100">{displayValue}</span>
                                                                    </td>
                                                                    <td className="px-6 py-4">
                                                                        <div className="flex items-center gap-4">
                                                                            <div className="flex flex-col min-w-[40px]">
                                                                                <span className="text-xs text-rose-500 font-bold uppercase">{indicator?.sector_low || '-'}</span>
                                                                                <span className="text-[8px] text-slate-400 font-mono leading-tight">{indicator?.sector_low_ticker || ''}</span>
                                                                            </div>
                                                                            <div className="flex-1 h-1 bg-slate-100 rounded-full relative">
                                                                                <div className="absolute top-1/2 left-3/4 w-1.5 h-1.5 -translate-y-1/2 bg-emerald-500 rounded-full shadow-sm" />
                                                                            </div>
                                                                            <div className="flex flex-col items-end min-w-[40px]">
                                                                                <span className="text-xs text-emerald-500 font-bold uppercase">{indicator?.sector_high || '-'}</span>
                                                                                <span className="text-[8px] text-slate-400 font-mono leading-tight">{indicator?.sector_high_ticker || ''}</span>
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
                                    </div>
                                </TabsContent>

                                <TabsContent value="history" className="mt-0">
                                    <div className="glass-card-light rounded-3xl p-8 border-slate-200">
                                        <div className="flex items-center gap-3 mb-8">
                                            <div className="p-2 rounded-xl bg-slate-50 text-slate-600 border border-slate-100">
                                                <Clock size={18} />
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-slate-800">Historical Price Action</h4>
                                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Ohlcv historical logs</p>
                                            </div>
                                        </div>
                                        <div className="overflow-x-auto no-scrollbar rounded-2xl border border-slate-100">
                                            <table className="w-full text-sm text-left">
                                                <thead className="bg-slate-50 text-slate-400 border-b border-slate-100">
                                                    <tr>
                                                        <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px]">Date</th>
                                                        <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px]">Open</th>
                                                        <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px]">High</th>
                                                        <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px]">Low</th>
                                                        <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px]">Close</th>
                                                        <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px] text-right">Volume</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-50">
                                                    {history.slice(0, 30).map((row, i) => (
                                                        <tr key={i} className="hover:bg-slate-50 transition-colors">
                                                            <td className="px-6 py-4 font-bold text-slate-800">{row.date}</td>
                                                            <td className="px-6 py-4 text-slate-600">{row.open}</td>
                                                            <td className="px-6 py-4 text-emerald-600 font-medium">{row.high}</td>
                                                            <td className="px-6 py-4 text-rose-600 font-medium">{row.low}</td>
                                                            <td className="px-6 py-4 font-bold text-slate-900">{row.close}</td>
                                                            <td className="px-6 py-4 text-right font-mono text-xs text-slate-400">{row.volume.toLocaleString()}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
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
            </div>
        </DashboardLayout>
    );
}
