'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useTheme } from 'next-themes';
import api from '@/lib/api';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    ArrowLeft, TrendingUp, TrendingDown, Calendar, DollarSign,
    Activity, BarChart2, Layers, Zap, Info, Share2,
    Download, RefreshCw, Maximize2,
    Check, ChevronDown, Search, X, PieChart, Globe
} from 'lucide-react';
import { formatNepaliNumber, formatRupees } from '@/lib/formatters';
import { formatMetricValue } from '@/lib/metricFormat';
import { humanizeFinancialLabel, formatStatementValue, STATEMENT_UNIT_LABEL } from '@/lib/financialStatements';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import TransactionModal from '@/components/TransactionModal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import StockLink from '@/components/StockLink';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { FullPageLoader } from '@/components/ui/StockLoader';
import { InfoTooltip } from '@/components/ui/InfoTooltip';

// Terminal Suite Components
import { IntelligenceGlass } from '@/components/ticker/IntelligenceGlass';
import { BentoMetrics } from '@/components/ticker/BentoMetrics';
import { AdvancedCharting } from '@/components/ticker/AdvancedCharting';
import SignalDashboard from '@/components/SignalDashboard';
import BrokerAnalysis from '@/components/ticker/BrokerAnalysis';
import { FibonacciRetracement } from '@/components/ticker/FibonacciRetracement';
import TechnicalAnalysis from '@/components/ticker/TechnicalAnalysis';
import IndicatorTooltip from '@/components/ticker/IndicatorTooltip';
import TickerAccumulation from '@/components/ticker/TickerAccumulation';
import TickerSignals from '@/components/ticker/TickerSignals';
import TickerVerdict from '@/components/ticker/TickerVerdict';

import PriceActionTerminal from '@/components/ticker/PriceActionTerminal';
import TickerLiquidity from '@/components/ticker/TickerLiquidity';
import { ChatNotesCard, ChatNotes } from '@/components/ticker/ChatNotesCard';
import { CompanyAnalysisTimeline, AnalysisEntry } from '@/components/ticker/CompanyAnalysisTimeline';

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
            sector_median?: string;
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

export default function StockDetailPage() {
    const params = useParams();
    const ticker = params.ticker as string;
    const router = useRouter();
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const [data, setData] = useState<StockDetailData | null>(null);
    const [floorsheet, setFloorsheet] = useState<FloorsheetItem[]>([]);
    const [activeTab, setActiveTab] = useState('price_action');
    const [timeRange, setTimeRange] = useState('1M');
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
    const [portfolioPosition, setPortfolioPosition] = useState<any>(null);
    const [watchlistItem, setWatchlistItem] = useState<any>(null);
    const [collapsedItems, setCollapsedItems] = useState<Set<string>>(new Set([
        'section-balance_sheet',
        'section-profit_loss',
        'section-cash_flow',
        'section-key_ratios'
    ]));

    const [latestSignal, setLatestSignal] = useState<'BUY' | 'SELL' | undefined>(undefined);
    const [chatNotes, setChatNotes] = useState<ChatNotes | null>(null);
    const [analysisTimeline, setAnalysisTimeline] = useState<AnalysisEntry[]>([]);
    const [currentUser, setCurrentUser] = useState<any>(null);

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

        // Fetch user for access control
        api.get('/api/users/me/')
            .then(res => setCurrentUser(res.data))
            .catch(err => console.error("Failed to load user profile", err));
    }, []);

    // Fetch portfolio position and watchlist status for this ticker
    useEffect(() => {
        if (!ticker) return;
        const fetchContext = async () => {
            try {
                // Portfolio: check if user holds this stock
                const portfolioRes = await api.get('/api/stocks/portfolio/');
                const items = portfolioRes.data?.results ?? portfolioRes.data ?? [];
                const match = items.find((p: any) => p.ticker?.toUpperCase() === ticker.toUpperCase());
                setPortfolioPosition(match || null);
            } catch (_) { setPortfolioPosition(null); }

            try {
                // Watchlist: check if user is watching this stock
                const watchlistRes = await api.get('/api/stocks/watchlist/');
                const items = watchlistRes.data?.results ?? watchlistRes.data ?? [];
                const match = items.find((w: any) => w.ticker?.toUpperCase() === ticker.toUpperCase());
                setWatchlistItem(match || null);
            } catch (_) { setWatchlistItem(null); }
        };
        fetchContext();
    }, [ticker]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                // Fetch Details
                const detailRes = await api.get(`/api/stocks/details/${ticker}/`);
                setData(detailRes.data);

                // Fetch History for Chart
                try {
                    const historyRes = await api.get(`/api/stocks/history/${ticker}/`);
                    setHistory(Array.isArray(historyRes.data) ? historyRes.data : []);
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

                // Fetch Latest Signal for Header
                try {
                    const signalRes = await api.get('/api/stocks/generated-signals/', { params: { symbol: ticker, page_size: 1 } });
                    const latest = signalRes.data?.results?.[0] || signalRes.data?.[0];
                    if (latest) {
                        // Only show if generated in last 7 days
                        const sigDate = new Date(latest.generated_date);
                        const now = new Date();
                        const diffDays = Math.floor((now.getTime() - sigDate.getTime()) / (1000 * 60 * 60 * 24));
                        if (diffDays <= 14) {
                            setLatestSignal(latest.signal);
                        }
                    }
                } catch (sErr) { console.error("Signal fetch failed", sErr); }

                // Fetch the user's AI chat notes for this ticker (204 = none)
                try {
                    const notesRes = await api.get(`/api/stocks/company-summary/${ticker}/`);
                    setChatNotes(notesRes.data && notesRes.data.summary ? notesRes.data : null);
                } catch (nErr) { console.error("Chat notes fetch failed", nErr); }

                // Fetch the AI analysis timeline for this ticker
                try {
                    const tlRes = await api.get(`/api/stocks/company-analysis/${ticker}/`);
                    setAnalysisTimeline(Array.isArray(tlRes.data) ? tlRes.data : []);
                } catch (tErr) { console.error("Analysis timeline fetch failed", tErr); }

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
        const roeItem = data.fundamental?.fundamental_indicators?.find(i => i.name?.toLowerCase()?.includes('roe'));
        const roeNum = roeItem?.value ? parseFloat(String(roeItem.value).replace(/[^0-9.-]/g, '')) : 0;

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
                                valStr = formatRupees(p.value);
                            } else {
                                valStr = formatNepaliNumber(p.value);
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
                    name: 'Amount (रू)',
                    nameTextStyle: { color: '#94a3b8', fontWeight: 600, padding: [0, 40, 0, 0], fontSize: 12 },
                    axisLabel: {
                        color: '#94a3b8',
                        fontWeight: 600,
                        fontSize: 11,
                        formatter: (val: number) => formatRupees(val)
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
        if (!history?.length) return {};

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
            <FullPageLoader />
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
        <DashboardLayout noPadding tickerPrice={data.price.close} priceChange={data.price.percent_change}>
            <div className="bg-background text-foreground terminal-grid-light selection:bg-primary/10 font-sans relative">


                <div className="px-8 py-10 space-y-10 relative z-10 animate-in fade-in slide-in-from-bottom-6 duration-1000">
                    {/* 1. TOP INTELLIGENCE ROW */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
                        <div className="lg:col-span-4">
                            <IntelligenceGlass
                                symbol={data.company?.symbol || data.fundamental?.ticker || ticker}
                                name={data.company?.name || data.fundamental?.company_name || 'N/A'}
                                price={data.price.close}
                                change={data.price.change}
                                percentChange={data.price.percent_change}
                                signal={latestSignal}
                                fundamentalScore={intelligence.fundamentalScore}
                                technicalScore={intelligence.technicalScore}
                                riskLevel={intelligence.riskLevel}
                                macd={intelligence.macd}
                                reason={intelligence.reason}
                                portfolioPosition={portfolioPosition}
                                watchlistItem={watchlistItem}
                            />
                        </div>
                        <div className="lg:col-span-8">
                            <BentoMetrics fundamental={data.fundamental} />
                        </div>
                    </div>

                    {/* 1b. YOUR AI NOTES (from chat) — hidden when empty */}
                    <ChatNotesCard notes={chatNotes} />

                    {/* 2. CORE ANALYTICS HUB */}
                    <div className="space-y-8">
                        <Tabs
                            defaultValue="price_action"
                            className="w-full"
                            value={activeTab}
                            onValueChange={setActiveTab}
                        >
                            <div className="flex flex-col md:flex-row items-center justify-between gap-6 px-4 mb-8">
                                <div className="flex items-center gap-6">
                                    <TabsList className="bg-slate-100 dark:bg-card border border-slate-200 dark:border-slate-800 p-1 h-10 rounded-xl shadow-smCondensed">
                                        {(currentUser?.permissions === 'all' || currentUser?.permissions?.['ticker_pa']) && (
                                            <TabsTrigger value="price_action" className="rounded-lg px-4 text-xs font-bold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:shadow-sm transition-all">Price Action</TabsTrigger>
                                        )}
                                        {(currentUser?.permissions === 'all' || currentUser?.permissions?.['ticker_signals']) && (
                                            <TabsTrigger value="signals" className="rounded-lg px-4 text-xs font-bold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:shadow-sm transition-all">Signals</TabsTrigger>
                                        )}
                                        {(currentUser?.permissions === 'all' || currentUser?.permissions?.['ticker_accumulation']) && (
                                            <TabsTrigger value="accumulation" className="rounded-lg px-4 text-xs font-bold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:shadow-sm transition-all">Accumulation</TabsTrigger>
                                        )}
                                        {(currentUser?.permissions === 'all' || currentUser?.permissions?.['ticker_tech']) && (
                                            <TabsTrigger value="technical" className="rounded-lg px-4 text-xs font-bold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:shadow-sm transition-all">Technical Analysis</TabsTrigger>
                                        )}
                                        {(currentUser?.permissions === 'all' || currentUser?.permissions?.['ticker_funds']) && (
                                            <TabsTrigger value="fundamentals" className="rounded-lg px-4 text-xs font-bold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:shadow-sm transition-all">Fundamentals</TabsTrigger>
                                        )}
                                            <TabsTrigger value="ai_analysis" className="rounded-lg px-4 text-xs font-bold data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:shadow-sm transition-all">AI Analysis</TabsTrigger>
                                    </TabsList>
                                </div>
                            </div>

                            <div className="animate-in fade-in zoom-in-95 duration-700">
                                <TabsContent value="technical" forceMount className="mt-0 space-y-8 data-[state=inactive]:hidden">
                                    <TechnicalAnalysis symbol={ticker} data={data} history={history} />
                                </TabsContent>


                                <TabsContent value="signals" forceMount className="mt-0 data-[state=inactive]:hidden">
                                    <div className="space-y-6">
                                        <TickerVerdict symbol={ticker} />
                                        <TickerSignals symbol={ticker} currentPrice={data.price.close} intelligence={intelligence} fundamental={data.fundamental} />
                                    </div>
                                </TabsContent>

                                <TabsContent value="price_action" forceMount className="mt-0 space-y-8 data-[state=inactive]:hidden">
                                    {/* Unified time range selector */}
                                    <div className="flex justify-end">
                                        <div className="flex bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
                                            {['1D', '3D', '1W', '1M', '3M', '6M', '1Y'].map(r => (
                                                <button
                                                    key={r}
                                                    onClick={() => setTimeRange(r)}
                                                    className={cn(
                                                        "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all duration-200",
                                                        timeRange === r
                                                            ? "bg-white dark:bg-slate-800 text-primary shadow-sm"
                                                            : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
                                                    )}
                                                >
                                                    {r}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <PriceActionTerminal
                                        symbol={ticker}
                                        grouping={{ '1D': 1, '3D': 3, '1W': 5 }[timeRange] || 1}
                                    />
                                    <TickerLiquidity
                                        symbol={ticker}
                                        history={history}
                                        fundamental={data.fundamental}
                                        range={{ '3M': '3M', '6M': '6M', '1Y': '1Y' }[timeRange] || '1M'}
                                    />
                                </TabsContent>

                                <TabsContent value="fundamentals" forceMount className="mt-0 space-y-8 data-[state=inactive]:hidden">
                                    {/* Fundamental Benchmarks */}
                                    <div className="glass-card-light rounded-2xl p-8 border border-slate-200 dark:border-slate-800/50 shadow-sm">
                                        <div className="flex items-center gap-3 mb-10">
                                            <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
                                                <BarChart2 size={18} />
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-slate-800 dark:text-slate-100 text-lg flex items-center">
                                                    Fundamental Benchmarks
                                                    <InfoTooltip content="Side-by-side comparison of this company's valuation and efficiency metrics against the sector's highest and lowest performers." />
                                                </h4>
                                                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">Sector-wide comparison</p>
                                            </div>
                                        </div>

                                        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
                                            <table className="w-full text-sm">
                                                <thead className="bg-slate-50 dark:bg-card border-b border-slate-200 dark:border-slate-800">
                                                    <tr>
                                                        <th className="px-6 py-4 text-left font-semibold text-slate-400 dark:text-slate-500 text-[9px]">Metric</th>
                                                        <th className="px-6 py-4 text-center font-semibold text-slate-400 dark:text-slate-500 text-[9px]">Audited</th>
                                                        <th className="px-6 py-4 text-center font-semibold text-slate-400 dark:text-slate-500 text-[9px]">Unaudited</th>
                                                        <th className="px-6 py-4 text-center font-semibold text-slate-400 dark:text-slate-500 text-[9px]">Sector Median</th>
                                                        <th className="px-6 py-4 text-left font-semibold text-slate-400 dark:text-slate-500 text-[9px]">Sector Range (Low - High)</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white/30 dark:bg-card">
                                                    {([
                                                        { section: 'Per Share' },
                                                        { name: 'EPS', key: 'eps', label: 'EPS' },
                                                        { name: 'Book Value', key: 'book_value', label: 'Book Value' },
                                                        { section: 'Valuation' },
                                                        { name: 'P/E Ratio', key: 'pe_ratio', label: 'P/E Ratio' },
                                                        { name: 'P/E Ratio (5 Yrs)', key: 'pe_ratio_5yr', label: 'P/E Ratio (5 Yrs)' },
                                                        { name: 'P/B Ratio', key: 'price_to_book', label: 'P/B' },
                                                        { name: 'PEG Ratio', key: 'peg_ratio', label: 'PEG' },
                                                        { name: 'Price to Sales', key: 'price_to_sales', label: 'Price to Sales' },
                                                        { name: 'Earning Yield (E/P)', key: 'earning_yield', label: 'Earning Yield' },
                                                        { name: 'Dividend Yield', key: 'dividend_yield', label: 'Dividend Yield' },
                                                        { name: 'Market Cap', key: 'market_cap', label: 'Mkt Cap' },
                                                        { section: 'Risk' },
                                                        { name: 'Debt to Equity', key: 'debt_to_equity', label: 'Debt to Equity' },
                                                        { name: '1 Year Beta', key: 'beta_1y', label: '1 Year Beta' },
                                                        { name: 'EPS Trend', key: 'eps_trend', label: 'EPS Trend' },
                                                        { name: 'ROE Trend', key: 'roe_trend', label: 'ROE Trend' },
                                                        { section: 'Profitability' },
                                                        { name: 'ROE (%)', key: 'ro_equity', label: 'ROE' },
                                                        { name: 'ROA (%)', key: 'ro_assets', label: 'ROA' },
                                                        { name: 'Payout Ratio', key: 'dividend_payout_ratio', label: 'Payout Ratio' },
                                                        { name: 'Operating Margin', key: 'operating_margin', label: 'Operating Margin' },
                                                        { name: 'Net Margin', key: 'net_margin', label: 'Net Margin' },
                                                        { name: 'Net Margin (Quarterly)', key: 'net_margin_quarterly', label: 'Net Margin (Quarterly)' },
                                                        { name: 'Asset Turnover', key: 'asset_turnover', label: 'Asset Turnover' },
                                                    ] as Array<{ section?: string; name?: string; key?: string; label?: string }>).map((metric, i) => {
                                                        if (metric.section) {
                                                            return (
                                                                <tr key={i} className="bg-slate-50/80 dark:bg-card">
                                                                    <td colSpan={5} className="px-6 py-2 text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">{metric.section}</td>
                                                                </tr>
                                                            );
                                                        }

                                                        const indicator = data.fundamental?.fundamental_indicators?.find((ind: any) => ind.name === metric.name) ||
                                                            data.fundamental?.fundamental_indicators?.find((ind: any) => ind.name?.toLowerCase()?.includes(metric.label!.toLowerCase()));

                                                        const auditedValue = (data.fundamental as any)?.[metric.key!];
                                                        const unauditedValue = (data.fundamental as any)?.[`${metric.key}_unaudited`] || auditedValue;

                                                        const formatVal = (val: any) => formatMetricValue(metric.key!, val);

                                                        return (
                                                            <tr key={i} className="hover:bg-accent transition-colors group">
                                                                <td className="px-6 py-4 font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                                                                    <div className="flex items-center gap-1">
                                                                        {metric.name}
                                                                        <IndicatorTooltip name={metric.name!} description="" />
                                                                    </div>
                                                                </td>
                                                                <td className="px-6 py-4 text-center">
                                                                    <span className="px-2.5 py-1 rounded bg-primary/10 text-primary font-bold text-[11px] ring-1 ring-primary/20">{formatVal(auditedValue)}</span>
                                                                </td>
                                                                <td className="px-6 py-4 text-center">
                                                                    <span className="px-2.5 py-1 rounded bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 font-bold text-[11px] ring-1 ring-amber-100 dark:ring-amber-800">{formatVal(unauditedValue)}</span>
                                                                </td>
                                                                <td className="px-6 py-4 text-center">
                                                                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 tabular-nums">{indicator?.sector_median || '-'}</span>
                                                                </td>
                                                                <td className="px-6 py-4">
                                                                    <div className="flex items-center gap-4">
                                                                        <div className="flex flex-col min-w-[40px]">
                                                                            <span className="text-xs text-rose-500 font-bold uppercase">{indicator?.sector_low || '-'}</span>
                                                                            <span className="text-[8px] text-slate-400 dark:text-slate-500 font-mono leading-tight">{indicator?.sector_low_ticker || ''}</span>
                                                                        </div>
                                                                        <div className="flex-1 h-1 bg-slate-100 dark:bg-slate-800 rounded-full relative">
                                                                            <div className="absolute top-1/2 left-1/4 w-1.5 h-1.5 -translate-y-1/2 bg-primary rounded-full shadow-sm" />
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

                                    {/* Dividend Distribution History */}
                                    <div className="glass-card-light dark:bg-card rounded-2xl p-8 border border-slate-200 dark:border-slate-800/50 shadow-sm">
                                        <div className="flex items-center gap-3 mb-8">
                                            <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-800">
                                                <PieChart size={18} />
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-slate-800 dark:text-slate-100 flex items-center">
                                                    Dividend Distribution History
                                                    <InfoTooltip content="Timeline of historical shareholder rewards, including cash dividends and bonus share percentages." />
                                                </h4>
                                                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">Shareholder rewards timeline</p>
                                            </div>
                                        </div>
                                        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                                            <table className="w-full text-sm text-left">
                                                <thead className="bg-slate-50 dark:bg-slate-800 text-slate-400 border-b border-slate-200 dark:border-slate-700">
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
                                                        <tr key={i} className="hover:bg-accent transition-colors">
                                                            <td className="px-6 py-4 font-bold text-slate-800 dark:text-slate-200">{div.fiscal_year}</td>
                                                            <td className="px-6 py-4"><Badge variant="outline" className="text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-800/50 bg-emerald-50/30 dark:bg-emerald-900/20">{div.bonus_percent}%</Badge></td>
                                                            <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{div.cash_percent}%</td>
                                                            <td className="px-6 py-4 font-bold text-primary">{div.total_percent}%</td>
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

                                    {/* Financial Performance Matrix */}
                                    <div className="glass-card-light rounded-2xl p-8 border border-slate-200 dark:border-slate-800/50 shadow-sm">
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
                                                    className={cn("rounded-lg px-4 font-bold text-[10px] transition-all", reportType === 'ANNUAL' ? "bg-white dark:bg-slate-700 text-primary shadow-sm" : "text-slate-400 dark:text-slate-500")}
                                                >
                                                    Annual
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setReportType('QUARTERLY')}
                                                    className={cn("rounded-lg px-4 font-bold text-[10px] transition-all", reportType === 'QUARTERLY' ? "bg-white dark:bg-slate-700 text-primary shadow-sm" : "text-slate-400 dark:text-slate-500")}
                                                >
                                                    Quarterly
                                                </Button>
                                            </div>
                                        </div>

                                        {/* Financial Summary Chart */}
                                        <div className="bg-white/50 dark:bg-card rounded-2xl border border-slate-200 dark:border-slate-800 p-6 mb-8 shadow-sm">
                                            <div className="h-[400px]">
                                                <ReactECharts
                                                    key={`${reportType}-${visibleMetrics.join('-')}`}
                                                    option={getFinancialsTrendOption()}
                                                    style={{ height: '100%', width: '100%' }}
                                                    theme={isDark ? 'dark' : 'light'}
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
                                                            <div key={section} className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
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
                                                                    <div className="p-6 bg-white/50 dark:bg-card overflow-x-auto no-scrollbar">
                                                                        <table className="w-full text-sm">
                                                                            <thead>
                                                                                <tr className="border-b border-slate-50 dark:border-slate-800">
                                                                                    <th className="text-left py-2 font-semibold text-slate-400 dark:text-slate-500 text-[10px]">
                                                                                        Particulars
                                                                                        {section !== 'key_ratios' && <span className="ml-1 font-normal text-slate-400/80 dark:text-slate-500/80">({STATEMENT_UNIT_LABEL})</span>}
                                                                                    </th>
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
                                                                                            <td colSpan={100} className="py-2 px-2 font-bold text-blue-600/70 dark:text-blue-400/70 text-[10px]">{humanizeFinancialLabel(category)}</td>
                                                                                        </tr>
                                                                                        {Object.keys(items as Record<string, unknown>).map((key) => (
                                                                                            <tr key={key} className="hover:bg-slate-50/30 dark:hover:bg-slate-800/30 border-b border-slate-50 dark:border-slate-800 last:border-0 transition-colors group">
                                                                                                <td className="py-3 px-2 font-medium text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-100">{humanizeFinancialLabel(key)}</td>
                                                                                                {financials.filter(f => f.report_type === reportType)
                                                                                                    .sort((a, b) => b.fiscal_year.localeCompare(a.fiscal_year))
                                                                                                    .map((f, idx) => {
                                                                                                        const v = f[section]?.[category]?.[key];
                                                                                                        return (
                                                                                                            <td key={`${f.fiscal_year}-${idx}`} className="text-right px-4 tabular-nums text-slate-700 dark:text-slate-300">
                                                                                                                {section === 'key_ratios' ? formatMetricValue(key, v) : formatStatementValue(v, key)}
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

                                <TabsContent value="accumulation" className="mt-0">
                                    <TickerAccumulation symbol={ticker} />
                                </TabsContent>

                                <TabsContent value="ai_analysis" className="mt-0">
                                    <CompanyAnalysisTimeline entries={analysisTimeline} />
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
