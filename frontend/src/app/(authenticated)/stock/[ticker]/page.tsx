'use client';

import { useEffect, useState, use, Fragment } from 'react';
import React from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, TrendingUp, TrendingDown, DollarSign, Activity, BarChart2 } from 'lucide-react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import TransactionModal from '@/components/TransactionModal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import StockLink from '@/components/StockLink';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';

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
    const [activeTab, setActiveTab] = useState('overview');
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
                textStyle: { color: '#1f2937', fontSize: 12 },
                formatter: (params: any) => {
                    if (!params || params.length === 0) return '';
                    let res = `<div style="font-weight: 900; color: #64748b; margin-bottom: 8px; border-bottom: 1px solid #f1f5f9; padding-bottom: 6px;">FY ${params[0].name}</div>`;
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
                            <span style="display: flex; align-items: center; gap: 8px; color: #475569; font-weight: 600;">
                                <span style="width:8px;height:8px;border-radius:2px;background-color:${p.color}"></span>
                                ${p.seriesName}
                            </span>
                            <span style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-weight: 700; color: #1e293b;">${valStr}</span>
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
                axisLabel: { color: '#94a3b8', fontWeight: 600, fontSize: 11, margin: 15 },
                boundaryGap: false
            },
            yAxis: [
                {
                    type: 'value',
                    name: 'Amount (Rs)',
                    nameTextStyle: { color: '#94a3b8', fontWeight: 600, padding: [0, 40, 0, 0] },
                    axisLabel: {
                        color: '#94a3b8',
                        fontWeight: 600,
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
                    nameTextStyle: { color: '#94a3b8', fontWeight: 600, padding: [0, 0, 0, 40] },
                    axisLabel: {
                        color: '#94a3b8',
                        fontWeight: 600,
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

    return (
        <DashboardLayout
            showBack
            title={
                <div className="flex items-center gap-3">
                    {data.company?.symbol || data.fundamental?.ticker || ticker}
                    <Badge variant="secondary" className="text-xs font-bold px-2 py-0.5 bg-blue-50 text-blue-700 border-none">
                        {data.company?.sector || data.fundamental?.sector || 'Unknown'}
                    </Badge>
                </div>
            }
            subtitle={data.company?.name || data.fundamental?.company_name}
        >
            <div className="space-y-6 animate-in fade-in duration-500">
                {/* Real-time Price Info */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b">
                    <div></div>

                    <div className="flex items-end gap-6">
                        <div className="text-right">
                            <p className="text-3xl font-mono font-bold">
                                Rs. {data.price.close}
                            </p>
                            <p className={`flex items-center justify-end gap-1 ${(data.price?.change ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {(data.price?.change ?? 0) >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                                {data.price?.change ?? 0} ({(data.price?.percent_change ?? 0).toFixed(2)}%)
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                className="bg-green-600 hover:bg-green-700 text-white"
                                onClick={() => { setTxnType('BUY'); setModalOpen(true); }}
                            >
                                Buy
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={() => { setTxnType('SELL'); setModalOpen(true); }}
                            >
                                Sell
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Fundamentals Grid - Expanded */}
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    <Card className="bg-blue-50 border-blue-200 hover:shadow-md transition-shadow">
                        <CardContent className="pt-6">
                            <div className="text-sm text-blue-600 font-medium">Market Cap</div>
                            <div className="text-xl font-bold text-gray-900">
                                {data.fundamental?.market_cap ? `Rs. ${(data.fundamental.market_cap / 10000000).toFixed(2)} Cr` : 'N/A'}
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-green-50 border-green-200 hover:shadow-md transition-shadow">
                        <CardContent className="pt-6">
                            <div className="text-sm text-green-600 font-medium">EPS</div>
                            <div className="text-xl font-bold text-gray-900">Rs. {data.fundamental?.eps || 'N/A'}</div>
                        </CardContent>
                    </Card>
                    <Card className="bg-purple-50 border-purple-200 hover:shadow-md transition-shadow">
                        <CardContent className="pt-6">
                            <div className="text-sm text-purple-600 font-medium">PBV</div>
                            <div className="text-xl font-bold text-gray-900">{data.fundamental?.fundamental_indicators?.find(i => i.name === 'PBV')?.value || 'N/A'}</div>
                        </CardContent>
                    </Card>
                    <Card className="bg-orange-50 border-orange-200 hover:shadow-md transition-shadow">
                        <CardContent className="pt-6">
                            <div className="text-sm text-orange-600 font-medium">Book Value</div>
                            <div className="text-xl font-bold text-gray-900">Rs. {data.fundamental?.book_value || 'N/A'}</div>
                        </CardContent>
                    </Card>
                    <Card className="bg-pink-50 border-pink-200 hover:shadow-md transition-shadow">
                        <CardContent className="pt-6">
                            <div className="text-sm text-pink-600 font-medium">Div. Yield</div>
                            <div className="text-xl font-bold text-gray-900">{data.fundamental?.dividend_yield || '0'}%</div>
                        </CardContent>
                    </Card>
                    <Card className="bg-teal-50 border-teal-200 hover:shadow-md transition-shadow">
                        <CardContent className="pt-6">
                            <div className="text-sm text-teal-600 font-medium">52 Week High/Low</div>
                            <div className="text-xl font-bold text-gray-900">
                                {data.fundamental?.fifty_two_week_high} / {data.fundamental?.fifty_two_week_low}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <Tabs defaultValue="overview" className="w-full">
                    <TabsList className="grid w-full grid-cols-5 mb-4">
                        <TabsTrigger value="overview" className="hover:bg-gray-100 hover:text-gray-900 transition-colors">Overview</TabsTrigger>
                        <TabsTrigger value="indicators" className="hover:bg-gray-100 hover:text-gray-900 transition-colors">Indicators</TabsTrigger>
                        <TabsTrigger value="floorsheet" className="hover:bg-gray-100 hover:text-gray-900 transition-colors">Accumulation/Distribution</TabsTrigger>
                        <TabsTrigger value="dividends" className="hover:bg-gray-100 hover:text-gray-900 transition-colors">Dividends</TabsTrigger>
                        <TabsTrigger value="financials" className="hover:bg-gray-100 hover:text-gray-900 transition-colors">Financials</TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="space-y-6">
                        {/* Company Details Card */}
                        <Card>
                            <CardContent className="pt-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                    <div className="space-y-1">
                                        <div className="text-sm text-gray-500">Sector</div>
                                        <div className="font-semibold">{data.fundamental?.sector}</div>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="text-sm text-gray-500">Listed Date</div>
                                        <div className="font-semibold">{data.fundamental?.listed_date || 'N/A'}</div>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="text-sm text-gray-500">Latest Date</div>
                                        <div className="font-semibold">{data.price.date}</div>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="text-sm text-gray-500">Market Price</div>
                                        <div className={`font-semibold text-lg flex items-center gap-2 ${(data.price?.change ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            Rs. {data.price.close}
                                            <span className="text-sm font-normal">
                                                ({data.price?.change} / {data.price?.percent_change?.toFixed(2)}%)
                                            </span>
                                        </div>
                                    </div>
                                    {/* Volume removed as per request */}
                                    <div className="space-y-1">
                                        <div className="text-sm text-gray-500">Shares Outstanding</div>
                                        <div className="font-semibold">{data.fundamental?.shares_outstanding?.toLocaleString() || 'N/A'} Nos</div>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="text-sm text-gray-500">Public Shares</div>
                                        <div className="font-semibold">{data.fundamental?.public_shares?.toLocaleString() || 'N/A'} Nos</div>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="text-sm text-gray-500">Free-Float Market Cap</div>
                                        <div className="font-semibold">
                                            {data.fundamental?.free_float_market_cap ? `Rs. ${(data.fundamental.free_float_market_cap / 10000000).toFixed(2)} Cr` : 'N/A'}
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="text-sm text-gray-500">Market Capitalization</div>
                                        <div className="font-semibold">
                                            {data.fundamental?.market_cap ? `Rs. ${(data.fundamental.market_cap / 10000000).toFixed(2)} Cr` : 'N/A'}
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Technical Chart */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
                                    <Activity className="h-4 w-4" /> Technical Chart
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ReactECharts option={getChartOption()} style={{ height: '500px' }} />
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="indicators" className="space-y-6">
                        {/* Indicators Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Fundamental Indicators */}
                            {data.fundamental?.fundamental_indicators && data.fundamental.fundamental_indicators.length > 0 && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-lg flex items-center gap-2">
                                            <Activity className="h-4 w-4" /> Fundamental Indicators
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="rounded-md border overflow-x-auto">
                                            <table className="w-full text-sm text-left">
                                                <thead className="bg-gray-50 text-gray-700 font-medium border-b">
                                                    <tr>
                                                        <th className="px-4 py-3">Indicator</th>
                                                        <th className="px-4 py-3 bg-blue-50/50">{data.fundamental.ticker}</th>
                                                        <th className="px-4 py-3">Sector High</th>
                                                        <th className="px-4 py-3">Sector Low</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y">
                                                    {data.fundamental.fundamental_indicators.map((item, i) => (
                                                        <tr key={i} className="hover:bg-gray-50">
                                                            <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
                                                            <td className="px-4 py-3 font-bold bg-blue-50/30 text-blue-700">{item.value}</td>
                                                            <td className="px-4 py-3">
                                                                <div className="flex flex-col">
                                                                    <span className="font-semibold">{item.sector_high}</span>
                                                                    <StockLink ticker={item.sector_high_ticker} className="text-xs text-gray-500">
                                                                        {item.sector_high_ticker}
                                                                    </StockLink>
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-3">
                                                                <div className="flex flex-col">
                                                                    <span className="font-semibold">{item.sector_low}</span>
                                                                    <StockLink ticker={item.sector_low_ticker} className="text-xs text-gray-500">
                                                                        {item.sector_low_ticker}
                                                                    </StockLink>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            {/* Technical Indicators */}
                            {data.fundamental?.technical_indicators && data.fundamental.technical_indicators.length > 0 && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-lg flex items-center gap-2">
                                            <BarChart2 className="h-4 w-4" /> Technical Indicators
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="rounded-md border overflow-x-auto">
                                            <table className="w-full text-sm text-left">
                                                <thead className="bg-gray-50 text-gray-700 font-medium border-b">
                                                    <tr>
                                                        <th className="px-4 py-3">Indicator</th>
                                                        <th className="px-4 py-3 bg-blue-50/50">{data.fundamental.ticker}</th>
                                                        <th className="px-4 py-3">Sector High</th>
                                                        <th className="px-4 py-3">Sector Low</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y">
                                                    {data.fundamental.technical_indicators.map((item, i) => (
                                                        <tr key={i} className="hover:bg-gray-50">
                                                            <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
                                                            <td className="px-4 py-3 font-bold bg-blue-50/30 text-blue-700">{item.value}</td>
                                                            <td className="px-4 py-3">
                                                                <div className="flex flex-col">
                                                                    <span className="font-semibold">{item.sector_high}</span>
                                                                    <StockLink ticker={item.sector_high_ticker} className="text-xs text-gray-500">
                                                                        {item.sector_high_ticker}
                                                                    </StockLink>
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-3">
                                                                <div className="flex flex-col">
                                                                    <span className="font-semibold">{item.sector_low}</span>
                                                                    <StockLink ticker={item.sector_low_ticker} className="text-xs text-gray-500">
                                                                        {item.sector_low_ticker}
                                                                    </StockLink>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}
                        </div>

                        {/* Broker Accumulation - Moved to Floorsheet/Accumulation Tab */}
                    </TabsContent>

                    <TabsContent value="floorsheet" className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <Activity className="h-4 w-4" /> Accumulation / Distribution
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <Tabs defaultValue="1D" className="w-full">
                                    <TabsList className="mb-4">
                                        {['2Y', '1Y', '6M', '3M', '1W', '1D'].map((range) => (
                                            <TabsTrigger
                                                key={range}
                                                value={range}
                                                className="hover:bg-gray-100 hover:text-gray-900 transition-colors"
                                            >
                                                {range}
                                            </TabsTrigger>
                                        ))}
                                    </TabsList>
                                    {['2Y', '1Y', '6M', '3M', '1W', '1D'].map((range) => {
                                        const rangeData = data.fundamental?.broker_accumulation?.[range] || [];
                                        const buyers = rangeData.filter(d => d.type === 'BUY').sort((a, b) => b.qty - a.qty);
                                        const sellers = rangeData.filter(d => d.type === 'SELL').sort((a, b) => b.qty - a.qty);

                                        return (
                                            <TabsContent key={range} value={range}>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                    {/* Accumulation (Buyers) */}
                                                    <div className="space-y-3">
                                                        <h3 className="font-semibold text-center text-blue-700 bg-blue-50 py-2 rounded">Accumulation (Top Buyers)</h3>
                                                        <div className="rounded-md border">
                                                            <table className="w-full text-sm text-left">
                                                                <thead className="bg-gray-50 text-gray-700 font-medium border-b">
                                                                    <tr>
                                                                        <th className="px-4 py-3">Broker</th>
                                                                        <th className="px-4 py-3 text-right">Quantity</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y">
                                                                    {buyers.map((item, idx) => (
                                                                        <tr key={idx} className="hover:bg-gray-50">
                                                                            <td className="px-4 py-3 font-semibold text-blue-600">
                                                                                Broker No. {item.broker}
                                                                            </td>
                                                                            <td className="px-4 py-3 text-right">{item.qty.toLocaleString()}</td>
                                                                        </tr>
                                                                    ))}
                                                                    {buyers.length === 0 && <tr><td colSpan={2} className="px-4 py-3 text-center text-gray-500">No buyers found</td></tr>}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>

                                                    {/* Distribution (Sellers) */}
                                                    <div className="space-y-3">
                                                        <h3 className="font-semibold text-center text-red-700 bg-red-50 py-2 rounded">Distribution (Top Sellers)</h3>
                                                        <div className="rounded-md border">
                                                            <table className="w-full text-sm text-left">
                                                                <thead className="bg-gray-50 text-gray-700 font-medium border-b">
                                                                    <tr>
                                                                        <th className="px-4 py-3">Broker</th>
                                                                        <th className="px-4 py-3 text-right">Quantity</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y">
                                                                    {sellers.map((item, idx) => (
                                                                        <tr key={idx} className="hover:bg-gray-50">
                                                                            <td className="px-4 py-3 font-semibold text-red-600">
                                                                                Broker No. {item.broker}
                                                                            </td>
                                                                            <td className="px-4 py-3 text-right">{item.qty.toLocaleString()}</td>
                                                                        </tr>
                                                                    ))}
                                                                    {sellers.length === 0 && <tr><td colSpan={2} className="px-4 py-3 text-center text-gray-500">No sellers found</td></tr>}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                </div>
                                            </TabsContent>
                                        );
                                    })}
                                </Tabs>
                            </CardContent>
                        </Card>
                    </TabsContent>



                    <TabsContent value="dividends">
                        <Card>
                            <CardHeader>
                                <CardTitle>Dividend History</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="rounded-md border">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-gray-50 text-gray-700 font-medium border-b">
                                            <tr>
                                                <th className="px-4 py-3">Fiscal Year</th>
                                                <th className="px-4 py-3">Bonus (%)</th>
                                                <th className="px-4 py-3">Cash (%)</th>
                                                <th className="px-4 py-3">Total (%)</th>
                                                <th className="px-4 py-3">Date</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {dividends.map((div: any, i: number) => (
                                                <tr key={i} className="hover:bg-gray-50">
                                                    <td className="px-4 py-3">{div.fiscal_year}</td>
                                                    <td className="px-4 py-3">{div.bonus_percent}</td>
                                                    <td className="px-4 py-3">{div.cash_percent}</td>
                                                    <td className="px-4 py-3 font-bold">{div.total_percent}</td>
                                                    <td className="px-4 py-3">{div.date}</td>
                                                </tr>
                                            ))}
                                            {dividends.length === 0 && (
                                                <tr><td colSpan={5} className="px-4 py-3 text-center text-gray-500">No dividends found.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="financials">
                        <Card>
                            <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between space-y-4 md:space-y-0 pb-6">
                                <div>
                                    <CardTitle className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                                        <BarChart2 className="h-7 w-7 text-blue-600" />
                                        Financial Statements
                                    </CardTitle>
                                    <p className="text-sm text-gray-500 mt-1 font-medium">Detailed multi-year comparative analysis</p>
                                </div>
                                <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200">
                                    <Button
                                        variant={reportType === 'ANNUAL' ? 'secondary' : 'ghost'}
                                        size="sm"
                                        onClick={() => setReportType('ANNUAL')}
                                        className={`rounded-md px-4 font-bold transition-all ${reportType === 'ANNUAL' ? 'shadow-sm text-blue-700 bg-white' : 'text-gray-500 hover:text-gray-700'}`}
                                    >
                                        Annual
                                    </Button>
                                    <Button
                                        variant={reportType === 'QUARTERLY' ? 'secondary' : 'ghost'}
                                        size="sm"
                                        onClick={() => setReportType('QUARTERLY')}
                                        className={`rounded-md px-4 font-bold transition-all ${reportType === 'QUARTERLY' ? 'shadow-sm text-blue-700 bg-white' : 'text-gray-500 hover:text-gray-700'}`}
                                    >
                                        Quarterly
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {(() => {
                                    const filteredFinByReport = financials.filter(f => f.report_type === reportType);
                                    const finWithData = filteredFinByReport.filter(f => f.balance_sheet || f.profit_loss);

                                    if (finWithData.length === 0) {
                                        return (
                                            <div className="flex flex-col items-center justify-center py-20 text-gray-400 bg-gray-50/50 rounded-2xl border-2 border-dashed">
                                                <div className="bg-gray-100 p-4 rounded-full mb-4">
                                                    <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                    </svg>
                                                </div>
                                                <p className="font-medium">No granular {reportType.toLowerCase()} reports available for this stock.</p>
                                            </div>
                                        );
                                    }

                                    const metrics = [
                                        { key: 'revenue', label: 'Revenue', color: '#3b82f6' },
                                        { key: 'net_profit', label: 'Net Profit', color: '#10b981' },
                                        { key: 'operating_profit', label: 'Operating Profit', color: '#6366f1' },
                                        { key: 'paid_up_capital', label: 'Paid-up Capital', color: '#f59e0b' },
                                        { key: 'reserves_and_surplus', label: 'Reserves', color: '#ec4899' },
                                        { key: 'eps', label: 'EPS', color: '#8b5cf6' },
                                        { key: 'book_value', label: 'Book Value', color: '#f97316' },
                                    ];

                                    const sampleReport = finWithData[0];
                                    const template = sampleReport.report_template || 'GENERAL';

                                    const sections = [
                                        { title: 'Statement of Financial Position (Balance Sheet)', key: 'balance_sheet' },
                                        { title: 'Statement of Profit or Loss', key: 'profit_loss' },
                                        { title: 'Statement of Cash Flows', key: 'cash_flow' },
                                        { title: 'Key Regulatory Ratios & Metrics', key: 'key_ratios' }
                                    ];

                                    return (
                                        <div className="space-y-12">
                                            {/* Trends Visualization */}
                                            <div className="space-y-6">
                                                <div
                                                    className="flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer group/sec"
                                                    onClick={() => toggleCollapse('trends-visualization')}
                                                >
                                                    <h3 className="text-lg font-bold text-gray-800 flex items-center">
                                                        <span className="w-1.5 h-6 bg-blue-600 rounded-full mr-3"></span>
                                                        Financial Trends over Time
                                                        <ChevronDown className={cn("ml-2 w-5 h-5 text-gray-400 transition-transform duration-300", collapsedItems.has('trends-visualization') ? "-rotate-90" : "")} />
                                                    </h3>
                                                    {!collapsedItems.has('trends-visualization') && (
                                                        <div className="flex flex-wrap gap-2 items-center" onClick={(e) => e.stopPropagation()}>
                                                            <Popover>
                                                                <PopoverTrigger asChild>
                                                                    <Button variant="outline" size="sm" className="h-9 px-3 gap-2 border-gray-200 bg-white hover:bg-gray-50 text-gray-700 shadow-sm rounded-xl">
                                                                        <div className="flex items-center gap-2">
                                                                            <BarChart2 className="w-4 h-4 text-blue-500" />
                                                                            <span className="font-bold">Select Metrics</span>
                                                                            <span className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded text-[10px] font-black">{visibleMetrics.length}</span>
                                                                        </div>
                                                                        <ChevronDown className="w-4 h-4 text-gray-400" />
                                                                    </Button>
                                                                </PopoverTrigger>
                                                                <PopoverContent className="w-80 p-0 rounded-2xl shadow-2xl border-gray-100 overflow-hidden" align="end">
                                                                    <Command className="border-none">
                                                                        <CommandInput placeholder="Search financials..." className="h-12" />
                                                                        <CommandList className="max-h-[400px]">
                                                                            <CommandEmpty>No metrics found.</CommandEmpty>
                                                                            {['Standard', 'Profit & Loss', 'Balance Sheet', 'Cash Flow', 'Key Ratios'].map(sec => {
                                                                                const secMetrics = allAvailableMetrics.filter(m => m.section === sec);
                                                                                if (secMetrics.length === 0) return null;
                                                                                return (
                                                                                    <CommandGroup key={sec} heading={sec} className="px-2">
                                                                                        {secMetrics.map(m => (
                                                                                            <CommandItem
                                                                                                key={m.key}
                                                                                                onSelect={() => {
                                                                                                    setVisibleMetrics(prev =>
                                                                                                        prev.includes(m.key)
                                                                                                            ? prev.filter(k => k !== m.key)
                                                                                                            : [...prev, m.key]
                                                                                                    );
                                                                                                }}
                                                                                                className="flex items-center gap-2 rounded-lg cursor-pointer"
                                                                                            >
                                                                                                <div className={cn(
                                                                                                    "flex h-4 w-4 items-center justify-center rounded border transition-all",
                                                                                                    visibleMetrics.includes(m.key) ? "bg-blue-600 border-blue-600" : "border-gray-300"
                                                                                                )}>
                                                                                                    {visibleMetrics.includes(m.key) && <Check className="h-3 w-3 text-white" />}
                                                                                                </div>
                                                                                                <span className="flex-1 text-sm font-medium">{m.label}</span>
                                                                                                {m.category && <span className="text-[10px] text-gray-400 bg-gray-50 px-1 rounded">{m.category}</span>}
                                                                                            </CommandItem>
                                                                                        ))}
                                                                                    </CommandGroup>
                                                                                );
                                                                            })}
                                                                        </CommandList>
                                                                        <div className="p-2 border-t bg-gray-50/50 flex items-center justify-between">
                                                                            <Button
                                                                                variant="ghost"
                                                                                size="sm"
                                                                                className="h-8 text-[10px] font-bold text-gray-500 hover:text-red-500"
                                                                                onClick={() => setVisibleMetrics([])}
                                                                            >
                                                                                Clear All
                                                                            </Button>
                                                                            <Button
                                                                                variant="ghost"
                                                                                size="sm"
                                                                                className="h-8 text-[10px] font-bold text-blue-600"
                                                                                onClick={() => setVisibleMetrics(['net_profit', 'revenue'])}
                                                                            >
                                                                                Reset Defaults
                                                                            </Button>
                                                                        </div>
                                                                    </Command>
                                                                </PopoverContent>
                                                            </Popover>

                                                            {/* Selected Pills (Scrollable row) */}
                                                            <div className="flex gap-2 overflow-x-auto no-scrollbar max-w-[500px] py-1">
                                                                {allAvailableMetrics.filter(m => visibleMetrics.includes(m.key)).map(m => (
                                                                    <button
                                                                        key={m.key}
                                                                        onClick={() => setVisibleMetrics(prev => prev.filter(k => k !== m.key))}
                                                                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-100 text-blue-700 text-[10px] font-bold hover:bg-blue-100 transition-colors shrink-0"
                                                                    >
                                                                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: m.color }} />
                                                                        {m.label}
                                                                        <X className="w-3 h-3 ml-0.5 opacity-50" />
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                {!collapsedItems.has('trends-visualization') && (
                                                    <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-gray-200/50 relative overflow-hidden group">
                                                        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50/30 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-blue-100/40 transition-colors"></div>
                                                        <div className="h-[400px] w-full relative z-10">
                                                            <ReactECharts
                                                                key={`${reportType}-${visibleMetrics.join('-')}`}
                                                                option={getFinancialsTrendOption()}
                                                                style={{ height: '100%', width: '100%' }}
                                                                theme="light"
                                                                notMerge={true}
                                                            />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Financial Tables */}
                                            {sections.map((section, sIdx) => {
                                                if (!sampleReport[section.key]) return null;
                                                const sectionId = `section-${section.key}`;

                                                return (
                                                    <div key={sIdx} className="space-y-6">
                                                        <div
                                                            className="flex items-center justify-between cursor-pointer group/sec"
                                                            onClick={() => toggleCollapse(sectionId)}
                                                        >
                                                            <h3 className="text-lg font-bold text-gray-800 flex items-center">
                                                                <span className="w-1.5 h-6 bg-blue-600 rounded-full mr-3"></span>
                                                                {section.title}
                                                                <ChevronDown className={cn("ml-2 w-5 h-5 text-gray-400 transition-transform duration-300", collapsedItems.has(sectionId) ? "-rotate-90" : "")} />
                                                            </h3>
                                                        </div>

                                                        {!collapsedItems.has(sectionId) && (
                                                            <div className="bg-white rounded-3xl border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-gray-200/50 overflow-hidden">
                                                                <div className="overflow-x-auto no-scrollbar">
                                                                    <table className="w-full text-left border-collapse min-w-[1000px]">
                                                                        <thead>
                                                                            <tr className="bg-gray-50/80 backdrop-blur-md">
                                                                                <th className="px-6 py-4 text-xs font-black text-gray-500 uppercase tracking-widest sticky left-0 z-20 bg-gray-50/90 border-r border-b border-gray-100 w-80">
                                                                                    Particulars
                                                                                </th>
                                                                                {finWithData.map((fin: any, idx) => (
                                                                                    <th key={idx} className="px-6 py-4 text-center border-b border-gray-100">
                                                                                        <div className="text-xs font-black text-blue-700 tracking-tighter uppercase mb-0.5">FY {fin.fiscal_year}</div>
                                                                                        <div className="text-[10px] font-bold text-gray-400">
                                                                                            {fin.report_type === 'QUARTERLY' ? `Q${fin.quarter} PROVISIONAL` : 'AUDITED REPORT'}
                                                                                        </div>
                                                                                    </th>
                                                                                ))}
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody className="divide-y divide-gray-100 text-gray-700">
                                                                            {Object.entries(sampleReport[section.key]).map(([category, items]: [string, any], catIdx) => {
                                                                                const categoryId = `${sectionId}-cat-${category}`;
                                                                                const renderRows = (obj: any, depth = 0, pathPrefix: string[] = []) => {
                                                                                    return Object.entries(obj).map(([key, val], idx) => {
                                                                                        const isGroup = val && typeof val === 'object' && !Array.isArray(val);
                                                                                        const isTotal = key.toLowerCase().includes('total') || key.toLowerCase().includes('profit');
                                                                                        const isCollapsed = collapsedItems.has(`${categoryId}-${pathPrefix.join('-')}-${key}`);

                                                                                        return (
                                                                                            <Fragment key={`${depth}-${key}`}>
                                                                                                <tr
                                                                                                    className={cn(
                                                                                                        "hover:bg-gray-50/50 transition-colors group",
                                                                                                        isTotal && "bg-gray-50/30",
                                                                                                        isGroup ? "bg-gray-50/10 cursor-pointer" : ""
                                                                                                    )}
                                                                                                    onClick={() => isGroup && toggleCollapse(`${categoryId}-${pathPrefix.join('-')}-${key}`)}
                                                                                                >
                                                                                                    <td className={cn(
                                                                                                        "px-6 py-4 sticky left-0 z-10 border-r border-b border-gray-100 transition-colors",
                                                                                                        isTotal ? "bg-gray-50 font-bold text-gray-900" : "bg-white font-medium text-gray-600"
                                                                                                    )}>
                                                                                                        <div style={{ paddingLeft: `${depth * 20}px` }} className={cn("flex items-center gap-2", isGroup ? "text-blue-600 font-bold text-[11px]" : "")}>
                                                                                                            {isGroup ? (
                                                                                                                <ChevronDown className={cn("w-3 h-3 transition-transform", isCollapsed ? "-rotate-90" : "")} />
                                                                                                            ) : null}
                                                                                                            {key}
                                                                                                        </div>
                                                                                                    </td>
                                                                                                    {finWithData.map((fin: any, fIdx) => {
                                                                                                        let current = fin[section.key]?.[category];
                                                                                                        pathPrefix.forEach(p => current = current?.[p]);
                                                                                                        const cellVal = current?.[key];

                                                                                                        if (isGroup) return <td key={fIdx} className="px-6 py-4 border-b border-gray-100 bg-gray-50/10" />;

                                                                                                        return (
                                                                                                            <td key={fIdx} className={cn(
                                                                                                                "px-6 py-4 text-right font-mono text-[11px] border-b border-gray-100",
                                                                                                                isTotal ? "font-bold text-gray-900 bg-gray-50/20" : "",
                                                                                                                (cellVal === null || cellVal === undefined) ? "text-gray-300" : "text-gray-700"
                                                                                                            )}>
                                                                                                                {cellVal !== null && cellVal !== undefined ? (cellVal as any).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                                                                                                            </td>
                                                                                                        );
                                                                                                    })}
                                                                                                </tr>
                                                                                                {isGroup && !isCollapsed ? renderRows(val, depth + 1, [...pathPrefix, key]) : null}
                                                                                            </Fragment>
                                                                                        );
                                                                                    });
                                                                                };

                                                                                const isCatCollapsed = collapsedItems.has(categoryId);

                                                                                return (
                                                                                    <Fragment key={catIdx}>
                                                                                        <tr
                                                                                            className="bg-blue-50/10 cursor-pointer hover:bg-blue-50/20 transition-colors"
                                                                                            onClick={() => toggleCollapse(categoryId)}
                                                                                        >
                                                                                            <td colSpan={finWithData.length + 1} className="px-6 py-3 font-bold text-blue-700 uppercase tracking-widest text-[10px] border-b border-gray-100 flex items-center gap-2">
                                                                                                <ChevronDown className={cn("w-4 h-4 transition-transform", isCatCollapsed && "-rotate-90")} />
                                                                                                {category}
                                                                                            </td>
                                                                                        </tr>
                                                                                        {isCatCollapsed ? null : renderRows(items)}
                                                                                    </Fragment>
                                                                                );
                                                                            })}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}

                                            {/* Legend/Info */}
                                            <div className="flex items-center space-x-6 px-2 border-t pt-8">
                                                <div className="flex items-center text-xs text-gray-500">
                                                    <div className="w-2.5 h-2.5 bg-emerald-100 border border-emerald-200 rounded-sm mr-2"></div>
                                                    <span>Audited Figures</span>
                                                </div>
                                                <div className="flex items-center text-xs text-gray-500">
                                                    <div className="w-2.5 h-2.5 bg-blue-100 border border-blue-200 rounded-sm mr-2"></div>
                                                    <span>Regulatory Ratios Verified</span>
                                                </div>
                                                <div className="flex items-center text-xs text-gray-400 italic ml-auto">
                                                    Showing data mapped to {template} template structure.
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>



                <TransactionModal
                    isOpen={modalOpen}
                    onClose={() => setModalOpen(false)}
                    defaultTicker={ticker}
                    defaultType={txnType}
                    onSuccess={() => {
                        // re-fetch data?
                        setModalOpen(false);
                    }}
                    accounts={accounts}
                />
            </div>
        </DashboardLayout >
    );
}
