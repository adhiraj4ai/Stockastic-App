'use client';

import { useEffect, useState, Suspense } from 'react';
import api from '@/lib/api';
import DashboardLayout from '@/components/DashboardLayout';
import { CompanySelect } from '@/components/CompanySelect';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Search,
    ChevronDown,
    ChevronUp,
    Activity,
    Filter,
    BarChart2,
    ArrowRight,
    Loader2,
    Calendar as CalendarIcon,
    Layers,
    ExternalLink,
    History,
    TrendingUp,
    TrendingDown,
    Minus
} from 'lucide-react';
import { SignalsView } from '@/components/accumulation/SignalsView';
import Link from 'next/link';
import {
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import nextDynamic from 'next/dynamic';
const ReactECharts = nextDynamic(() => import('echarts-for-react'), { ssr: false });

export const dynamic = 'force-dynamic';

interface AccumulationData {
    symbol: string;
    name: string;
    sector: string;
    close: number;
    buy_qty: number;
    sell_qty: number;
    net_qty: number;
    total_qty: number;
    accumulation_ratio: number;
    top_buyers: string[];
    top_sellers: string[];
}

interface BrokerTrend {
    symbol: string;
    broker: number;
    cumulative_net: number;
    wac?: number; // Added WAC
    ltp: number; // Added LTP
    trend_5d: string;
    change_5d: number;
    trend_10d: string;
    change_10d: number;
    trend_20d: string;
    change_20d: number;
    trend_50d: string;
    change_50d: number;
}
interface VolumeLeader {
    broker: string;
    volume: number;
    percentage: number;
}

interface AggressiveTrader {
    broker: string;
    net_qty: number;
    buy_qty: number;
    sell_qty: number;
    buy_rate: number;
    sell_rate: number;
    net_amt?: number; // Added for market-wide analysis
}



interface AggressivePattern {
    symbol: string;
    name: string;
    sector: string;
    institutional_buy: number;
    institutional_sell: number;
    net_qty: number;
    avg_vol_20d: number;
    close: number;
    intensity: number;
    producers: string[];
    offloaders: string[];
}

interface BrokerFavorite {
    symbol: string;
    name: string;
    current_net: number;
    wac?: number;
    qty_accumulated: number;
    net_amount: number;
    ltp: number;
    roc: number;
}

interface AccumulationItem {
    date: string;
    buy_qty: number;
    buy_rate: number;
    buy_amount: number;
    sell_qty: number;
    sell_rate: number;
    sell_amount: number;
    net_quantity: number;
    cumulative_qty: number;
    wac: number;
}

import { useSearchParams, useRouter } from 'next/navigation';

function AccumulationContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const [data, setData] = useState<AccumulationData[]>([]);
    const [trends, setTrends] = useState<BrokerTrend[]>([]);
    const [loading, setLoading] = useState(true);
    const [trendsLoading, setTrendsLoading] = useState(true);
    const [range, setRange] = useState('3M');
    const [sector, setSector] = useState('All');
    const [sectors, setSectors] = useState<string[]>([]);

    const [graphData, setGraphData] = useState<any[]>([]);
    const [volumeLeaders, setVolumeLeaders] = useState<VolumeLeader[]>([]);
    const [buyLeaders, setBuyLeaders] = useState<AggressiveTrader[]>([]);
    const [sellLeaders, setSellLeaders] = useState<AggressiveTrader[]>([]);


    const [topBrokers, setTopBrokers] = useState<string[]>([]);

    const [graphLoading, setGraphLoading] = useState(false);
    const [selectedGraphSymbol, setSelectedGraphSymbol] = useState('');
    const [search, setSearch] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: keyof AccumulationData; direction: 'asc' | 'desc' }>({
        key: 'net_qty',
        direction: 'desc'
    });
    const [trendSortConfig, setTrendSortConfig] = useState<{ key: keyof BrokerTrend | 'change_5d' | 'change_10d' | 'change_20d' | 'change_50d'; direction: 'asc' | 'desc' }>({
        key: 'cumulative_net',
        direction: 'desc'
    });

    const [trendsPage, setTrendsPage] = useState(1);
    const [trendsPageSize, setTrendsPageSize] = useState(20);

    // Read tab from URL or default to overview
    const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'overview');

    // Broker Favorites State
    const [favorites, setFavorites] = useState<BrokerFavorite[]>([]);
    const [filteredFavorites, setFilteredFavorites] = useState<BrokerFavorite[]>([]);
    const [favoritesLoading, setFavoritesLoading] = useState(false);
    const [selectedBroker, setSelectedBroker] = useState(searchParams.get('broker') || '');
    const [allBrokers, setAllBrokers] = useState<string[]>([]);
    const [favPeriod, setFavPeriod] = useState('1W');
    const [favSearch, setFavSearch] = useState('');
    const [favPage, setFavPage] = useState(1);
    const favPageSize = 20;

    // History State
    const [historyData, setHistoryData] = useState<AccumulationItem[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState('');
    const [historyPage, setHistoryPage] = useState(1);
    const [historyPageSize, setHistoryPageSize] = useState(20);
    // const [hasMoreHistory, setHasMoreHistory] = useState(true); // Removed for client-side pagination

    // Share Transfer State
    const [transferData, setTransferData] = useState<any>(null);
    const [transferLoading, setTransferLoading] = useState(false);
    const [transferBroker1, setTransferBroker1] = useState('58');
    const [transferBroker2, setTransferBroker2] = useState('58');
    const [transferStartDate, setTransferStartDate] = useState<Date | undefined>();
    const [transferEndDate, setTransferEndDate] = useState<Date | undefined>();

    // Set default range based on tab
    useEffect(() => {
        if (activeTab === 'aggressive-trader') {
            setRange('1D'); // Keep 1D default for trader view
            // Default to 'All' symbol if not set
            if (!selectedGraphSymbol) setSelectedGraphSymbol('All');
        } else if (activeTab === 'accumulators') {
            setRange('1Y');
        } else if (activeTab === 'aggressive') {
            setRange('1D');
        } else if (activeTab === 'overview') {
            setRange('3M');
        }
    }, [activeTab]);

    // Update state if URL changes
    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab && ['overview', 'aggressive', 'trends', 'favorites', 'accumulators', 'aggressive-trader', 'history', 'share-transfer'].includes(tab)) {
            setActiveTab(tab);
        }
        const b = searchParams.get('broker');
        if (b) setSelectedBroker(b);
        const s = searchParams.get('symbol');
        if (s) setSelectedGraphSymbol(s); // Sync symbol param
    }, [searchParams]);

    const handleTabChange = (value: string) => {
        setActiveTab(value);
        // Update URL to sync with sidebar
        const params = new URLSearchParams(searchParams.toString());
        params.set('tab', value);
        router.push(`/accumulation?${params.toString()}`, { scroll: false });
    };

    // Reset range to 1Y when switching to Accumulators if currently 1D as 1D is not supported there.
    useEffect(() => {
        if (activeTab === 'accumulators' && range === '1D') {
            setRange('1Y');
        }
    }, [activeTab]);

    const handleBrokerChange = (value: string) => {
        setSelectedBroker(value);
        const params = new URLSearchParams(searchParams.toString());
        params.set('broker', value);
        router.push(`/accumulation?${params.toString()}`, { scroll: false });
    };

    const [aggressiveData, setAggressiveData] = useState<{ accumulators: AggressivePattern[]; distributors: AggressivePattern[] }>({
        accumulators: [],
        distributors: []
    });
    const [aggressiveLoading, setAggressiveLoading] = useState(false);

    const timeRanges = [
        { label: '1 Day', value: '1D' },
        { label: '1 Week', value: '1W' },
        { label: '2 Weeks', value: '2W' },
        { label: '1 Month', value: '1M' },
        { label: '3 Months', value: '3M' },
        { label: '6 Months', value: '6M' },
        { label: '1 Year', value: '1Y' },
        { label: '1+ Year', value: 'ALL' },
    ];

    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                const [secRes, broRes] = await Promise.all([
                    api.get('/api/stocks/companies/sectors/'),
                    api.get('/api/stocks/companies/accumulation_brokers/')
                ]);
                setSectors(['All', ...secRes.data.map((s: any) => s.name)]);
                setAllBrokers(broRes.data);
            } catch (err) {
                console.error('Failed to fetch filters', err);
            }
        };
        fetchInitialData();
    }, []);

    useEffect(() => {
        if (activeTab === 'overview') {
            const fetchData = async () => {
                setLoading(true);
                try {
                    const res = await api.get('/api/stocks/companies/accumulation/', {
                        params: { range, sector }
                    });
                    setData(res.data);
                } catch (err) {
                    console.error('Failed to fetch accumulation data', err);
                } finally {
                    setLoading(false);
                }
            };
            fetchData();
        }
    }, [range, sector, activeTab]);

    useEffect(() => {
        if (activeTab === 'trends') {
            const fetchTrends = async () => {
                setTrendsLoading(true);
                try {
                    const res = await api.get('/api/stocks/companies/broker_trends/');
                    setTrends(res.data);
                } catch (err) {
                    console.error('Failed to fetch broker trends', err);
                } finally {
                    setTrendsLoading(false);
                }
            };
            fetchTrends();
        }
    }, [activeTab]);

    useEffect(() => {
        if (activeTab === 'aggressive') {
            const fetchAggressive = async () => {
                setAggressiveLoading(true);
                try {
                    const res = await api.get('/api/stocks/companies/aggressive/', {
                        params: { range, sector }
                    });
                    setAggressiveData(res.data);
                } catch (err) {
                    console.error('Failed to fetch aggressive data', err);
                } finally {
                    setAggressiveLoading(false);
                }
            };
            fetchAggressive();
        }
    }, [activeTab, range, sector]);

    // Favorites Fetch Effect
    useEffect(() => {
        if (activeTab === 'favorites' && selectedBroker) {
            const fetchFavorites = async () => {
                setFavoritesLoading(true);
                try {
                    const res = await api.get('/api/stocks/companies/broker_favorites/', {
                        params: {
                            broker: selectedBroker,
                            range: favPeriod
                        }
                    });
                    const data = Array.isArray(res.data) ? res.data : [];
                    setFavorites(data);
                    setFilteredFavorites(data); // Initial set
                    setFavPage(1);
                } catch (err) {
                    console.error('Failed to fetch broker favorites', err);
                    setFavorites([]);
                    setFilteredFavorites([]);
                } finally {
                    setFavoritesLoading(false);
                }
            };

            fetchFavorites();
        }
    }, [activeTab, selectedBroker, favPeriod]);

    // Client-side Search & Pagination Effect
    useEffect(() => {
        let result = favorites;
        if (favSearch) {
            const q = favSearch.toLowerCase();
            result = result.filter(f =>
                f.symbol.toLowerCase().includes(q) ||
                f.name.toLowerCase().includes(q)
            );
        }
        setFilteredFavorites(result);

        // Adjust page if out of bounds
        const maxPage = Math.ceil(result.length / favPageSize) || 1;
        if (favPage > maxPage && favPage !== 1) setFavPage(1);

    }, [favSearch, favorites, favPageSize]);

    const getCurrentPageItems = () => {
        const startIndex = (favPage - 1) * favPageSize;
        return filteredFavorites.slice(startIndex, startIndex + favPageSize);
    };

    useEffect(() => {
        if ((activeTab === 'accumulators' || activeTab === 'aggressive-trader') && selectedGraphSymbol) {
            const fetchGraph = async () => {
                setGraphLoading(true);
                try {
                    const res = await api.get('/api/stocks/companies/brokers_graph/', {
                        params: { symbol: selectedGraphSymbol, range }
                    });
                    setGraphData(res.data.data);
                    setTopBrokers(res.data.brokers);
                    setVolumeLeaders(res.data.volume_leaders || []);
                    setBuyLeaders(res.data.buy_leaders || []);
                    setSellLeaders(res.data.sell_leaders || []);

                } catch (err) {
                    console.error('Failed to fetch graph data', err);
                } finally {
                    setGraphLoading(false);
                }
            };
            fetchGraph();
        }
    }, [activeTab, selectedGraphSymbol, range]);

    useEffect(() => {
        if (activeTab === 'history') {
            const fetchHistory = async () => {
                if (!selectedBroker || !selectedGraphSymbol) {
                    setHistoryData([]);
                    setHistoryLoading(false);
                    return;
                }

                setHistoryLoading(true);
                setHistoryError('');

                try {
                    // Fetch allow/large batch for client-side pagination
                    const res = await api.get('/api/stocks/accumulation_history/', {
                        params: {
                            broker: selectedBroker,
                            symbol: selectedGraphSymbol,
                            page: 1,
                            page_size: 5000
                        }
                    });

                    // For client-side pagination, we just set the full dataset
                    setHistoryData(res.data);
                } catch (err) {
                    console.error('Failed to fetch accumulation history', err);
                    setHistoryError('Failed to load history.');
                } finally {
                    setHistoryLoading(false);
                }
            };
            fetchHistory();
        }
    }, [activeTab, selectedBroker, selectedGraphSymbol]); // Removed historyPage dependency

    const fetchTransferData = async () => {
        if (!selectedGraphSymbol || !transferBroker1 || !transferBroker2) return;
        setTransferLoading(true);
        try {
            const res = await api.get('/api/stocks/floorsheet/broker_transfer/', {
                params: {
                    symbol: selectedGraphSymbol,
                    broker1: transferBroker1,
                    broker2: transferBroker2,
                    start_date: transferStartDate ? format(transferStartDate, 'yyyy-MM-dd') : undefined,
                    end_date: transferEndDate ? format(transferEndDate, 'yyyy-MM-dd') : undefined
                }
            });
            setTransferData(res.data);
        } catch (err) {
            console.error('Failed to fetch transfer data', err);
        } finally {
            setTransferLoading(false);
        }
    };

    // Client-side pagination logic
    const sortedHistory = [...historyData].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const historyTotalPages = Math.ceil(sortedHistory.length / historyPageSize) || 1;
    const paginatedHistory = sortedHistory.slice((historyPage - 1) * historyPageSize, historyPage * historyPageSize);

    // Reset pagination when filters change
    useEffect(() => {
        setHistoryPage(1);
        // setHasMoreHistory(true); // Removed
        // We do typically want to clear data or show loading, but the main effect handles page 1 reset if we just reset page to 1
        // However, if we change filter, we might want to ensure date is wiped immediately? 
        // Let's rely on the main effect refetching for page 1.
    }, [selectedBroker, selectedGraphSymbol]);

    // const handleHistoryScroll = ... // Removed infinite scroll handler

    const getGraphOption = () => {
        if (!graphData.length) return {};

        const brokerNames = topBrokers.map(b => `Broker ${b}`);

        return {
            tooltip: {
                trigger: 'axis',
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                borderRadius: 8,
                padding: 10,
                textStyle: {
                    color: '#1f2937',
                    fontSize: 12
                },
                extraCssText: 'box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); border: none;'
            },
            legend: {
                data: brokerNames,
                bottom: 0,
                icon: 'circle',
                itemGap: 15,
                textStyle: {
                    color: '#4b5563',
                    fontSize: 12
                }
            },
            grid: {
                left: '3%',
                right: '4%',
                bottom: '10%',
                top: '5%',
                containLabel: true
            },
            xAxis: {
                type: 'category',
                boundaryGap: false,
                data: graphData.map(d => d.date),
                axisLine: { lineStyle: { color: '#e5e7eb' } },
                axisLabel: { color: '#6b7280', fontSize: 10 }
            },
            yAxis: {
                type: 'value',
                splitLine: { lineStyle: { color: '#f3f4f6' } },
                axisLabel: {
                    color: '#6b7280',
                    fontSize: 10,
                    formatter: (val: number) => val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val
                }
            },
            series: topBrokers.map((broker, idx) => ({
                name: `Broker ${broker}`,
                type: 'line',
                data: graphData.map(d => d[broker]),
                smooth: true,
                showSymbol: false,
                lineStyle: { width: 2 },
                itemStyle: { color: `hsl(${idx * 45 + 210}, 80%, 50%)` }
            }))
        };
    };

    const getTransferChartOption = () => {
        if (!transferData || !transferData.daily_stats.length) return {};

        return {
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow' }
            },
            legend: {
                data: [`B${transferBroker1} → B${transferBroker2}`, `B${transferBroker2} → B${transferBroker1}`],
                textStyle: { color: '#6b7280', fontSize: 10 },
                top: 0
            },
            grid: {
                left: '3%',
                right: '4%',
                bottom: '3%',
                top: '15%',
                containLabel: true
            },
            xAxis: {
                type: 'category',
                data: transferData.daily_stats.map((d: any) => d.transaction_date),
                axisLabel: { color: '#6b7280', fontSize: 10 }
            },
            yAxis: {
                type: 'value',
                axisLabel: { color: '#6b7280', fontSize: 10 }
            },
            series: [
                {
                    name: `B${transferBroker1} → B${transferBroker2}`,
                    type: 'bar',
                    stack: 'total',
                    data: transferData.daily_stats.map((d: any) => d.volume_1_to_2 || 0),
                    itemStyle: { color: '#3b82f6', borderRadius: [4, 4, 0, 0] }
                },
                {
                    name: `B${transferBroker2} → B${transferBroker1}`,
                    type: 'bar',
                    stack: 'total',
                    data: transferData.daily_stats.map((d: any) => d.volume_2_to_1 || 0),
                    itemStyle: { color: '#8b5cf6', borderRadius: [4, 4, 0, 0] }
                }
            ]
        };
    };

    const getComparisonChartOption = () => {
        if (!transferData || !transferData.daily_stats.length) return {};

        const dates = transferData.daily_stats.map((d: any) => d.transaction_date);
        const transferVol = transferData.daily_stats.map((d: any) => (d.volume_1_to_2 || 0) + (d.volume_2_to_1 || 0));
        const netAcc = transferData.daily_stats.map((d: any) => d.net_accumulation || 0);

        return {
            tooltip: {
                trigger: 'axis',
                formatter: (params: any) => {
                    let res = `<div class="font-bold mb-1">${params[0].name}</div>`;
                    params.forEach((p: any) => {
                        res += `<div class="flex justify-between gap-4">
                            <span>${p.marker} ${p.seriesName}</span>
                            <span class="font-bold">${p.value.toLocaleString()}</span>
                        </div>`;
                    });
                    return res;
                }
            },
            legend: {
                data: ['Total Transfer Vol', 'Symbol Net Accumulation'],
                textStyle: { color: '#6b7280', fontSize: 10 },
                top: 0
            },
            grid: {
                left: '3%',
                right: '4%',
                bottom: '3%',
                top: '15%',
                containLabel: true
            },
            xAxis: {
                type: 'category',
                data: dates,
                axisLabel: { color: '#6b7280', fontSize: 10 }
            },
            yAxis: {
                type: 'value',
                axisLabel: { color: '#6b7280', fontSize: 10 }
            },
            series: [
                {
                    name: 'Total Transfer Vol',
                    type: 'bar',
                    data: transferVol,
                    itemStyle: { color: '#3b82f6', opacity: 0.8 }
                },
                {
                    name: 'Symbol Net Accumulation',
                    type: 'line',
                    data: netAcc,
                    smooth: true,
                    symbol: 'circle',
                    symbolSize: 6,
                    itemStyle: { color: '#10b981' },
                    lineStyle: { width: 3, shadowBlur: 10, shadowColor: 'rgba(16, 185, 129, 0.3)' },
                    areaStyle: {
                        color: {
                            type: 'linear',
                            x: 0, y: 0, x2: 0, y2: 1,
                            colorStops: [{ offset: 0, color: 'rgba(16, 185, 129, 0.2)' }, { offset: 1, color: 'rgba(16, 185, 129, 0)' }]
                        }
                    }
                }
            ]
        };
    };
    const getAggressiveGraphOption = (type: 'buy' | 'sell') => {
        const leaders = type === 'buy' ? buyLeaders : sellLeaders;
        if (!leaders.length) return {};

        const isAll = selectedGraphSymbol === 'All';
        const valueKey = isAll ? 'net_amt' : 'net_qty';

        const color = type === 'buy' ? '#16a34a' : '#dc2626'; // Green vs Red
        const title = type === 'buy'
            ? `Top Aggressive Buyers (${isAll ? 'Net Amt' : 'Net Qty'})`
            : `Top Aggressive Sellers (${isAll ? 'Net Amt' : 'Net Qty'})`;

        return {
            title: { text: title, left: 'center', textStyle: { fontSize: 14, color: '#374151' } },
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                borderRadius: 8,
                padding: 12,
                textStyle: { color: '#1f2937', fontSize: 12 },
                formatter: (params: any) => {
                    const item = params[0];
                    const data = leaders[item.dataIndex];
                    return `
                        <div class="font-bold mb-1 border-b pb-1">Broker ${data.broker}</div>
                        <div class="flex justify-between gap-4 py-1">
                            <span className="text-gray-500">${isAll ? 'Net Amt:' : 'Net Qty:'}</span>
                            <span className="font-mono font-bold ${type === 'buy' ? 'text-green-600' : 'text-red-600'}">
                                ${isAll ? 'रू ' : ''}${(((data as any)[valueKey] ?? 0) > 0 ? '+' : '') + ((data as any)[valueKey] ?? 0).toLocaleString()}
                            </span>
                        </div>
                        <div class="flex justify-between gap-4 py-1">
                            <span class="text-gray-500">Avg Rate:</span>
                            <span class="font-mono font-bold text-gray-900">रू ${type === 'buy' ? data.buy_rate : data.sell_rate}</span>
                        </div>
                        <div class="flex justify-between gap-4 py-1 text-xs">
                            <span class="text-gray-400">Total Vol:</span>
                            <span class="font-mono text-gray-500">${(data.buy_qty + data.sell_qty).toLocaleString()}</span>
                        </div>
                    `;
                }
            },
            grid: {
                left: '3%',
                right: '4%',
                bottom: '3%',
                top: '15%',
                containLabel: true
            },
            xAxis: {
                type: 'value',
                axisLabel: { show: false },
                splitLine: { show: false }
            },
            yAxis: {
                type: 'category',
                data: leaders.map(v => `Br.${v.broker}`),
                axisTick: { alignWithLabel: true },
                axisLabel: { color: '#6b7280', fontSize: 10 },
                inverse: true // Top ranks at top
            },
            series: [{
                name: 'Net Qty',
                type: 'bar',
                barWidth: '60%',
                data: leaders.map(v => Math.abs((v as any)[valueKey] ?? 0)), // Show magnitude
                itemStyle: {
                    color: color,
                    borderRadius: [0, 4, 4, 0]
                },
                label: {
                    show: true,
                    position: 'right',
                    formatter: (p: any) => {
                        const val = (leaders[p.dataIndex] as any)[valueKey] ?? 0;
                        return isAll
                            ? `रू ${(Math.abs(val) / 10000000).toFixed(2)} Cr`
                            : val.toLocaleString();
                    }, // Show real value string
                    fontSize: 10,
                    fontWeight: 'bold',
                    color: color
                }
            }]
        };
    };

    const handleSort = (key: keyof AccumulationData) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const sortedData = [...data]
        .filter(item =>
            item.symbol.toLowerCase().includes(search.toLowerCase()) ||
            item.name.toLowerCase().includes(search.toLowerCase())
        )
        .sort((a, b) => {
            const aValue = a[sortConfig.key];
            const bValue = b[sortConfig.key];
            if (typeof aValue === 'number' && typeof bValue === 'number') {
                return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
            }
            if (String(aValue) < String(bValue)) return sortConfig.direction === 'asc' ? -1 : 1;
            if (String(aValue) > String(bValue)) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

    const SortIcon = ({ column }: { column: keyof AccumulationData }) => {
        if (sortConfig.key !== column) return <div className="w-4 h-4 opacity-0" />;
        return sortConfig.direction === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />;
    };

    const handleTrendSort = (key: keyof BrokerTrend | 'change_5d' | 'change_10d' | 'change_20d' | 'change_50d') => {
        let direction: 'asc' | 'desc' = 'asc';
        if (trendSortConfig.key === key && trendSortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setTrendSortConfig({ key, direction });
    };

    const sortedTrends = [...trends]
        .filter(t =>
            t.symbol.toLowerCase().includes(search.toLowerCase()) ||
            String(t.broker).includes(search)
        )
        .sort((a, b) => {
            const key = trendSortConfig.key;
            // Depending on key, we might be sorting string or number
            // Force type assertion or check
            const aValue = a[key as keyof BrokerTrend];
            const bValue = b[key as keyof BrokerTrend];

            if (typeof aValue === 'number' && typeof bValue === 'number') {
                return trendSortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
            }
            if (String(aValue) < String(bValue)) return trendSortConfig.direction === 'asc' ? -1 : 1;
            if (String(aValue) > String(bValue)) return trendSortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

    const trendsTotalPages = Math.ceil(sortedTrends.length / trendsPageSize) || 1;
    const paginatedTrends = sortedTrends.slice((trendsPage - 1) * trendsPageSize, trendsPage * trendsPageSize);

    // Reset trends page on search or sort change
    useEffect(() => {
        setTrendsPage(1);
    }, [search, trendSortConfig]);

    const TrendSortIcon = ({ column }: { column: string }) => {
        if (trendSortConfig.key !== column) return <div className="w-4 h-4 opacity-0" />;
        return trendSortConfig.direction === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />;
    };

    const TrendBadge = ({ trend, change }: { trend: string, change: number }) => {
        const isIncreasing = trend === 'Increasing';
        const isDecreasing = trend === 'Decreasing';

        const colorClass = isIncreasing
            ? 'text-green-700 dark:text-emerald-400 bg-green-50 dark:bg-emerald-900/20 border-green-200 dark:border-emerald-800/30'
            : isDecreasing
                ? 'text-red-700 dark:text-rose-400 bg-red-50 dark:bg-rose-900/20 border-red-200 dark:border-rose-800/30'
                : 'text-gray-600 dark:text-slate-400 bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700';

        const Icon = isIncreasing ? TrendingUp : isDecreasing ? TrendingDown : Minus;

        return (
            <div className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border ${colorClass} w-full max-w-[100px] mx-auto shadow-sm transition-all hover:scale-105`}>
                <Icon className="w-3.5 h-3.5 stroke-[3px]" />
                <span className="text-xs font-black font-mono tracking-tight">
                    {Math.abs(change ?? 0).toFixed(1)}%
                </span>
            </div>
        );
    };

    const getPageTitle = () => {
        switch (activeTab) {
            case 'signals': return 'Smart Signals';
            case 'aggressive': return 'Aggressive Patterns';
            case 'aggressive-trader': return 'Aggressive Trader Analysis';
            case 'trends': return 'Broker Trends';
            case 'favorites': return 'Broker Favorites';
            case 'accumulators': return 'Accumulators Navigator';
            case 'history': return 'Accumulation History';
            case 'share-transfer': return 'Share Transfer Dashboard';
            default: return 'Accumulation Overview';
        }
    };

    return (
        <DashboardLayout title={`${getPageTitle()}`}>
            <div className="space-y-4 animate-in fade-in duration-500 pb-10">

                {activeTab === 'signals' && (
                    <SignalsView />
                )}

                {activeTab === 'overview' && (
                    <div className="bg-white dark:bg-slate-950/50 rounded-xl border dark:border-slate-800/50 shadow-sm">
                        <div className="p-4 border-b dark:border-slate-800 bg-white dark:bg-slate-900/80 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 sticky top-[73px] z-20 rounded-t-xl">
                            <div className="flex flex-wrap items-center gap-3">
                                <span className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase px-2">Analysis Range</span>
                                <div className="flex gap-1 overflow-x-auto no-scrollbar pb-1 md:pb-0">
                                    {timeRanges.map((t) => (
                                        <Button
                                            key={t.value}
                                            onClick={() => setRange(t.value)}
                                            variant={range === t.value ? "default" : "outline"}
                                            size="sm"
                                            className={`rounded-xl px-4 py-2 font-bold transition-all ${range === t.value
                                                ? 'bg-blue-600 dark:bg-indigo-600 text-white shadow-lg scale-105'
                                                : 'text-gray-600 dark:text-slate-400 hover:bg-blue-50 dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-slate-200 border-gray-200 dark:border-slate-800'
                                                }`}
                                        >
                                            {t.label}
                                        </Button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex items-center gap-3 w-full lg:w-auto">
                                <div className="relative flex-grow lg:w-64">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500" />
                                    <Input
                                        placeholder="Search symbol..."
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        className="pl-10 h-10 rounded-xl bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 shadow-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-indigo-500 transition-all dark:text-slate-100"
                                    />
                                </div>
                                <div className="flex items-center gap-2 bg-white dark:bg-slate-900 p-1.5 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm">
                                    <span className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase px-2">Sector</span>
                                    <select
                                        value={sector}
                                        onChange={(e) => setSector(e.target.value)}
                                        className="bg-transparent border-none text-sm font-bold text-gray-700 dark:text-slate-300 outline-none min-w-[100px] pr-4"
                                    >
                                        {sectors.map(s => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                        {loading ? (
                            <div className="flex flex-col items-center justify-center p-20 space-y-4">
                                <Loader2 className="w-10 h-10 text-blue-500 dark:text-indigo-400 animate-spin" />
                                <p className="text-gray-500 dark:text-slate-400 font-medium tracking-wide">Analyzing market accumulation...</p>
                            </div>
                        ) : (
                            <div>
                                <table className="w-full caption-bottom text-sm">
                                    <TableHeader className="bg-gray-50 dark:bg-slate-900 sticky top-[146px] z-10 shadow-sm border-b dark:border-slate-800">
                                        <TableRow>
                                            <TableHead className="w-[120px] cursor-pointer hover:text-blue-600 dark:hover:text-indigo-400 transition-colors" onClick={() => handleSort('symbol')}>
                                                <div className="flex items-center gap-1">Symbol <SortIcon column="symbol" /></div>
                                            </TableHead>
                                            <TableHead className="hidden lg:table-cell">Company</TableHead>
                                            <TableHead className="text-right cursor-pointer hover:text-blue-600 dark:hover:text-indigo-400 transition-colors" onClick={() => handleSort('close')}>
                                                <div className="flex items-center justify-end gap-1">Price <SortIcon column="close" /></div>
                                            </TableHead>
                                            <TableHead className="text-right cursor-pointer hover:text-blue-600 dark:hover:text-indigo-400 transition-colors" onClick={() => handleSort('net_qty')}>
                                                <div className="flex items-center justify-end gap-1">Net Acc. <SortIcon column="net_qty" /></div>
                                            </TableHead>
                                            <TableHead className="text-center w-[200px] cursor-pointer hover:text-blue-600 dark:hover:text-indigo-400 transition-colors" onClick={() => handleSort('accumulation_ratio')}>
                                                <div className="flex items-center justify-center gap-1">Intensity <SortIcon column="accumulation_ratio" /></div>
                                            </TableHead>
                                            <TableHead className="text-center hidden md:table-cell">Buyers</TableHead>
                                            <TableHead className="text-center hidden md:table-cell">Sellers</TableHead>
                                            <TableHead className="w-[60px]"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {sortedData.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={8} className="h-40 text-center text-gray-500 dark:text-slate-400">
                                                    No accumulation data found matching your criteria.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            sortedData.map((item) => (
                                                <TableRow key={item.symbol} className="hover:bg-blue-50/40 dark:hover:bg-slate-900/50 transition-colors group border-b dark:border-slate-800">
                                                    <TableCell className="font-bold text-blue-700 dark:text-indigo-400 bg-blue-50/20 dark:bg-indigo-900/10">{item.symbol}</TableCell>
                                                    <TableCell className="hidden lg:table-cell">
                                                        <div className="flex flex-col max-w-[200px]">
                                                            <span className="text-sm font-medium text-gray-900 dark:text-slate-100 truncate">{item.name}</span>
                                                            <span className="text-xs text-gray-400 dark:text-slate-500 font-bold uppercase tracking-wider">{item.sector}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono font-medium dark:text-slate-300">
                                                        रू {item.close.toLocaleString()}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <span className={`font-mono font-bold ${item.net_qty >= 0 ? 'text-green-600 dark:text-emerald-400' : 'text-red-600 dark:text-rose-400'}`}>
                                                            {item.net_qty >= 0 ? '+' : ''}{item.net_qty.toLocaleString()}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex flex-col items-center gap-1 px-4">
                                                            <div className="w-full bg-gray-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden shadow-inner border border-gray-200/50 dark:border-slate-700">
                                                                <div
                                                                    className={`h-full transition-all duration-1000 ease-out ${item.net_qty >= 0 ? 'bg-gradient-to-r from-green-400 to-green-600' : 'bg-gradient-to-r from-red-400 to-red-600'}`}
                                                                    style={{ width: `${Math.min(item.accumulation_ratio, 100)}%` }}
                                                                />
                                                            </div>
                                                            <span className="text-xs font-bold text-gray-400 dark:text-slate-500">{item.accumulation_ratio.toFixed(1)}% Strength</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="hidden md:table-cell">
                                                        <div className="flex justify-center gap-1">
                                                            {item.top_buyers?.map(b => (
                                                                <Link href={`/broker/${b}`} key={b}>
                                                                    <span className="px-2 py-0.5 bg-green-50 dark:bg-emerald-900/30 text-green-700 dark:text-emerald-400 rounded text-xs font-bold border border-green-100 dark:border-emerald-800/30 hover:bg-green-100 dark:hover:bg-emerald-800 cursor-pointer transition-colors">#{b}</span>
                                                                </Link>
                                                            ))}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="hidden md:table-cell">
                                                        <div className="flex justify-center gap-1">
                                                            {item.top_sellers?.map(b => (
                                                                <Link href={`/broker/${b}`} key={b}>
                                                                    <span className="px-2 py-0.5 bg-red-50 dark:bg-rose-900/30 text-red-700 dark:text-rose-400 rounded text-xs font-bold border border-red-100 dark:border-rose-800/30 hover:bg-red-100 dark:hover:bg-rose-800 cursor-pointer transition-colors">#{b}</span>
                                                                </Link>
                                                            ))}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <Link href={`/ticker/${item.symbol}`}>
                                                            <Button variant="ghost" size="icon" className="group-hover:text-blue-600 dark:group-hover:text-indigo-400 group-hover:bg-blue-100 dark:group-hover:bg-indigo-900/30 rounded-full transition-all">
                                                                <ArrowRight className="w-4 h-4" />
                                                            </Button>
                                                        </Link>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'aggressive' && (
                    <div className="bg-white dark:bg-slate-950/50 rounded-xl border dark:border-slate-800/50 shadow-sm">
                        <div className="p-4 border-b dark:border-slate-800 bg-white dark:bg-slate-900/80 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 sticky top-[73px] z-10 rounded-t-xl">
                            <div className="flex flex-wrap items-center gap-3">
                                <span className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase px-2">Analysis Range</span>
                                <div className="flex gap-1 overflow-x-auto no-scrollbar pb-1 md:pb-0">
                                    {timeRanges.filter(t => ['1D', '1W', '2W', '1M', '3M'].includes(t.value)).map((t) => (
                                        <Button
                                            key={t.value}
                                            onClick={() => setRange(t.value)}
                                            variant={range === t.value ? "default" : "outline"}
                                            size="sm"
                                            className={`rounded-xl px-4 py-2 font-bold transition-all ${range === t.value
                                                ? 'bg-blue-600 dark:bg-indigo-600 text-white shadow-lg scale-105'
                                                : 'text-gray-600 dark:text-slate-400 hover:bg-blue-50 dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-slate-200 border-gray-200 dark:border-slate-800'
                                                }`}
                                        >
                                            {t.label}
                                        </Button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex items-center gap-3 w-full lg:w-auto">
                                <div className="relative flex-grow lg:w-64">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500" />
                                    <Input
                                        placeholder="Search symbol..."
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        className="pl-10 h-10 rounded-xl bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 shadow-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-indigo-500 transition-all dark:text-slate-100"
                                    />
                                </div>
                                <div className="flex items-center gap-2 bg-white dark:bg-slate-900 p-1.5 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm">
                                    <span className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase px-2">Sector</span>
                                    <select
                                        value={sector}
                                        onChange={(e) => setSector(e.target.value)}
                                        className="bg-transparent border-none text-sm font-bold text-gray-700 dark:text-slate-300 outline-none min-w-[100px] pr-4"
                                    >
                                        {sectors.map(s => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div className="p-6">
                            {aggressiveLoading ? (
                                <div className="flex flex-col items-center justify-center p-20 space-y-4">
                                    <Loader2 className="w-10 h-10 text-orange-500 dark:text-orange-400 animate-spin" />
                                    <p className="text-gray-500 dark:text-slate-400 font-medium tracking-wide">Scanning for aggressive patterns...</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    {/* Accumulators List */}
                                    <div className="space-y-4">
                                        <h3 className="text-lg font-bold text-green-700 dark:text-emerald-400 flex items-center gap-2 px-1">
                                            <ChevronUp className="w-5 h-5" />
                                            Aggressive Accumulators
                                        </h3>
                                        {aggressiveData.accumulators?.length === 0 ? (
                                            <Card className="p-10 text-center text-gray-400 dark:text-slate-500 bg-white/50 dark:bg-slate-900/50">No aggressive accumulation detected.</Card>
                                        ) : (
                                            aggressiveData.accumulators.map((sym, idx) => (
                                                <Card key={idx} className="group hover:border-green-200 dark:hover:border-emerald-500/30 transition-all shadow-sm hover:shadow-md bg-white dark:bg-slate-900 overflow-hidden border-slate-100 dark:border-slate-800">
                                                    <div className="p-4">
                                                        <div className="flex justify-between items-start mb-4">
                                                            <div className="flex flex-col">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-xl font-black text-gray-900 dark:text-slate-100 group-hover:text-green-600 dark:group-hover:text-emerald-400 transition-colors tracking-tight">{sym.symbol}</span>
                                                                    <span className="text-sm font-bold text-gray-400 dark:text-slate-500">रू {sym.close?.toLocaleString()}</span>
                                                                </div>
                                                                <span className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase truncate max-w-[180px]">{sym.name}</span>
                                                            </div>
                                                            <div className="flex flex-col items-end">
                                                                <span className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1">Buy Intensity</span>
                                                                <div className="px-3 py-1 bg-green-100 dark:bg-emerald-900/30 text-green-700 dark:text-emerald-400 rounded-lg text-sm font-black border border-green-200 dark:border-emerald-800/30 shadow-sm flex items-center gap-1">
                                                                    +{sym.intensity.toFixed(1)}%
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="grid grid-cols-2 gap-4 mb-4 p-3 bg-gray-50 dark:bg-slate-800/50 rounded-xl border border-gray-100 dark:border-slate-700/50">
                                                            <div>
                                                                <span className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase block mb-1">Inst. Buy Qty</span>
                                                                <span className="text-sm font-bold text-gray-700 dark:text-slate-300">{sym.institutional_buy.toLocaleString()}</span>
                                                            </div>
                                                            <div>
                                                                <span className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase block mb-1">20D Avg Vol</span>
                                                                <span className="text-sm font-bold text-gray-700 dark:text-slate-300">{Math.round(sym.avg_vol_20d).toLocaleString()}</span>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center justify-between">
                                                            <div className="flex gap-1 items-center overflow-hidden">
                                                                <span className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase mr-1">Top Buyers</span>
                                                                {sym.producers?.map(p => (
                                                                    <Link href={`/broker/${p}`} key={p}>
                                                                        <span className="px-1.5 py-0.5 bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-400 rounded text-xs font-bold border border-gray-100 dark:border-slate-700 hover:bg-green-50 dark:hover:bg-emerald-900/30 hover:text-green-600 dark:hover:text-emerald-400 cursor-pointer transition-colors shadow-sm">#{p}</span>
                                                                    </Link>
                                                                ))}
                                                            </div>
                                                            <Link href={`/floorsheet?symbol=${sym.symbol}`}>
                                                                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs font-bold text-blue-600 dark:text-indigo-400 hover:bg-blue-50 dark:hover:bg-indigo-900/30 gap-1 rounded-lg">
                                                                    Analyze <ArrowRight className="w-3 h-3" />
                                                                </Button>
                                                            </Link>
                                                        </div>
                                                    </div>
                                                </Card>
                                            ))
                                        )}
                                    </div>

                                    {/* Distributors List */}
                                    <div className="space-y-4">
                                        <h3 className="text-lg font-bold text-red-700 dark:text-rose-400 flex items-center gap-2 px-1">
                                            <ChevronDown className="w-5 h-5" />
                                            Aggressive Distributors
                                        </h3>
                                        {aggressiveData.distributors?.length === 0 ? (
                                            <Card className="p-10 text-center text-gray-400 dark:text-slate-500 bg-white/50 dark:bg-slate-900/50">No aggressive distribution detected.</Card>
                                        ) : (
                                            aggressiveData.distributors.map((sym, idx) => (
                                                <Card key={idx} className="group hover:border-red-200 dark:hover:border-rose-500/30 transition-all shadow-sm hover:shadow-md bg-white dark:bg-slate-900 overflow-hidden border-slate-100 dark:border-slate-800">
                                                    <div className="p-4">
                                                        <div className="flex justify-between items-start mb-4">
                                                            <div className="flex flex-col">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-xl font-black text-gray-900 dark:text-slate-100 group-hover:text-red-600 dark:group-hover:text-rose-400 transition-colors tracking-tight">{sym.symbol}</span>
                                                                    <span className="text-sm font-bold text-gray-400 dark:text-slate-500">रू {sym.close?.toLocaleString()}</span>
                                                                </div>
                                                                <span className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase truncate max-w-[180px]">{sym.name}</span>
                                                            </div>
                                                            <div className="flex flex-col items-end">
                                                                <span className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1">Sell Intensity</span>
                                                                <div className="px-3 py-1 bg-red-100 dark:bg-rose-900/30 text-red-700 dark:text-rose-400 rounded-lg text-sm font-black border border-red-200 dark:border-rose-800/30 shadow-sm flex items-center gap-1">
                                                                    {sym.intensity.toFixed(1)}%
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="grid grid-cols-2 gap-4 mb-4 p-3 bg-gray-50 dark:bg-slate-800/50 rounded-xl border border-gray-100 dark:border-slate-700/50">
                                                            <div>
                                                                <span className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase block mb-1">Inst. Sell Qty</span>
                                                                <span className="text-sm font-bold text-gray-700 dark:text-slate-300">{sym.institutional_sell.toLocaleString()}</span>
                                                            </div>
                                                            <div>
                                                                <span className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase block mb-1">20D Avg Vol</span>
                                                                <span className="text-sm font-bold text-gray-700 dark:text-slate-300">{Math.round(sym.avg_vol_20d).toLocaleString()}</span>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center justify-between">
                                                            <div className="flex gap-1 items-center overflow-hidden">
                                                                <span className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase mr-1">Offloaders</span>
                                                                {sym.offloaders?.map(p => (
                                                                    <Link href={`/broker/${p}`} key={p}>
                                                                        <span className="px-1.5 py-0.5 bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-400 rounded text-xs font-bold border border-gray-100 dark:border-slate-700 hover:bg-red-50 dark:hover:bg-rose-900/30 hover:text-red-600 dark:hover:text-rose-400 cursor-pointer transition-colors shadow-sm">#{p}</span>
                                                                    </Link>
                                                                ))}
                                                            </div>
                                                            <Link href={`/floorsheet?symbol=${sym.symbol}`}>
                                                                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs font-bold text-blue-600 dark:text-indigo-400 hover:bg-blue-50 dark:hover:bg-indigo-900/30 gap-1 rounded-lg">
                                                                    Analyze <ArrowRight className="w-3 h-3" />
                                                                </Button>
                                                            </Link>
                                                        </div>
                                                    </div>
                                                </Card>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )
                }

                {
                    activeTab === 'trends' && (
                        <div className="bg-white dark:bg-slate-950/50 rounded-xl border dark:border-slate-800/50 shadow-sm">
                            <div className="p-4 border-b dark:border-slate-800 bg-white dark:bg-slate-900/80 flex items-center justify-end gap-4 sticky top-[73px] z-20 rounded-t-xl">
                                <div className="relative w-64">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500" />
                                    <Input
                                        placeholder="Filter symbols or brokers..."
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        className="pl-10 h-9 rounded-lg bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 shadow-none text-sm focus:ring-1 focus:ring-blue-500 dark:focus:ring-indigo-500 dark:text-slate-100"
                                    />
                                </div>
                            </div>
                            <div className="p-0">
                                {trendsLoading ? (
                                    <div className="flex flex-col items-center justify-center p-20 space-y-4">
                                        <Loader2 className="w-10 h-10 text-blue-500 dark:text-indigo-400 animate-spin" />
                                        <p className="text-gray-500 dark:text-slate-400 font-medium">Calculating broker trends...</p>
                                    </div>
                                ) : (
                                    <div>
                                        <table className="w-full caption-bottom text-sm">
                                            <TableHeader className="bg-gray-50 dark:bg-slate-900 sticky top-[146px] z-10 shadow-sm border-b dark:border-slate-800">
                                                <TableRow>
                                                    <TableHead className="w-[120px] cursor-pointer hover:text-blue-600 dark:hover:text-indigo-400 transition-colors" onClick={() => handleTrendSort('symbol')}>
                                                        <div className="flex items-center gap-1">Symbol <TrendSortIcon column="symbol" /></div>
                                                    </TableHead>
                                                    <TableHead className="cursor-pointer hover:text-blue-600 dark:hover:text-indigo-400 transition-colors" onClick={() => handleTrendSort('broker')}>
                                                        <div className="flex items-center gap-1">Broker ID <TrendSortIcon column="broker" /></div>
                                                    </TableHead>
                                                    <TableHead className="text-right cursor-pointer hover:text-blue-600 dark:hover:text-indigo-400 transition-colors" onClick={() => handleTrendSort('cumulative_net')}>
                                                        <div className="flex items-center justify-end gap-1">Cumulative Net <TrendSortIcon column="cumulative_net" /></div>
                                                    </TableHead>
                                                    <TableHead className="text-right cursor-pointer hover:text-blue-600 dark:hover:text-indigo-400 transition-colors" onClick={() => handleTrendSort('ltp')}>
                                                        <div className="flex items-center justify-end gap-1">LTP <TrendSortIcon column="ltp" /></div>
                                                    </TableHead>
                                                    <TableHead className="text-right cursor-pointer hover:text-blue-600 dark:hover:text-indigo-400 transition-colors" onClick={() => handleTrendSort('wac')}>
                                                        <div className="flex items-center justify-end gap-1">WAC <TrendSortIcon column="wac" /></div>
                                                    </TableHead>
                                                    <TableHead className="text-center cursor-pointer hover:text-blue-600 dark:hover:text-indigo-400 transition-colors" onClick={() => handleTrendSort('change_5d')}>
                                                        <div className="flex items-center justify-center gap-1">5D Trend <TrendSortIcon column="change_5d" /></div>
                                                    </TableHead>
                                                    <TableHead className="text-center cursor-pointer hover:text-blue-600 dark:hover:text-indigo-400 transition-colors" onClick={() => handleTrendSort('change_10d')}>
                                                        <div className="flex items-center justify-center gap-1">10D Trend <TrendSortIcon column="change_10d" /></div>
                                                    </TableHead>
                                                    <TableHead className="text-center cursor-pointer hover:text-blue-600 dark:hover:text-indigo-400 transition-colors" onClick={() => handleTrendSort('change_20d')}>
                                                        <div className="flex items-center justify-center gap-1">20D Trend <TrendSortIcon column="change_20d" /></div>
                                                    </TableHead>
                                                    <TableHead className="text-center cursor-pointer hover:text-blue-600 dark:hover:text-indigo-400 transition-colors" onClick={() => handleTrendSort('change_50d')}>
                                                        <div className="flex items-center justify-center gap-1">50D Trend <TrendSortIcon column="change_50d" /></div>
                                                    </TableHead>
                                                    <TableHead className="w-[60px]"></TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {sortedTrends.length === 0 ? (
                                                    <TableRow>
                                                        <TableCell colSpan={10} className="h-40 text-center text-gray-500 dark:text-slate-400">
                                                            No broker trends found matching "{search}".
                                                        </TableCell>
                                                    </TableRow>
                                                ) : (
                                                    paginatedTrends.map((row, idx) => (
                                                        <TableRow key={idx} className="hover:bg-blue-50/40 dark:hover:bg-slate-900/50 transition-colors group border-b dark:border-slate-800">
                                                            <TableCell className="font-bold text-blue-700 dark:text-indigo-400">{row.symbol}</TableCell>
                                                            <TableCell>
                                                                <Link href={`/broker/${row.broker}`}>
                                                                    <span className="px-2 py-1 bg-gray-100 dark:bg-slate-800 rounded text-xs font-bold border border-gray-200 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-indigo-900/30 hover:text-blue-600 dark:hover:text-indigo-400 cursor-pointer transition-all">
                                                                        Broker {row.broker}
                                                                    </span>
                                                                </Link>
                                                            </TableCell>
                                                            <TableCell className="text-right font-mono font-bold text-blue-800 dark:text-indigo-400">
                                                                {row.cumulative_net.toLocaleString()}
                                                            </TableCell>
                                                            <TableCell className="text-right font-mono font-bold text-gray-900 dark:text-slate-100">
                                                                {row.ltp?.toLocaleString()}
                                                            </TableCell>
                                                            <TableCell className="text-right font-mono font-bold text-gray-700 dark:text-slate-300">
                                                                {row.wac?.toLocaleString()}
                                                            </TableCell>
                                                            <TableCell className="text-center">
                                                                <TrendBadge trend={row.trend_5d} change={row.change_5d} />
                                                            </TableCell>
                                                            <TableCell className="text-center">
                                                                <TrendBadge trend={row.trend_10d} change={row.change_10d} />
                                                            </TableCell>
                                                            <TableCell className="text-center">
                                                                <TrendBadge trend={row.trend_20d} change={row.change_20d} />
                                                            </TableCell>
                                                            <TableCell className="text-center">
                                                                <TrendBadge trend={row.trend_50d} change={row.change_50d} />
                                                            </TableCell>
                                                            <TableCell className="text-center">
                                                                <Link href={`/accumulation?tab=history&symbol=${row.symbol}&broker=${row.broker}`}>
                                                                    <Button variant="ghost" size="icon" className="group-hover:text-blue-600 dark:group-hover:text-indigo-400 rounded-full" title="View historical accumulation">
                                                                        <History className="w-4 h-4" />
                                                                    </Button>
                                                                </Link>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))
                                                )}
                                            </TableBody>
                                        </table>

                                        {/* Trends Pagination Controls */}
                                        {!trendsLoading && sortedTrends.length > 0 && (
                                            <div className="p-4 border-t dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0 rounded-b-xl">
                                                <div className="flex items-center gap-3">
                                                    <span className="text-sm font-medium text-gray-500 dark:text-slate-400">Rows per page:</span>
                                                    <select
                                                        value={trendsPageSize}
                                                        onChange={(e) => {
                                                            setTrendsPageSize(Number(e.target.value));
                                                            setTrendsPage(1);
                                                        }}
                                                        className="h-8 rounded-lg border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 text-sm font-bold focus:ring-2 focus:ring-blue-500 dark:focus:ring-indigo-500 dark:text-slate-200"
                                                    >
                                                        {[20, 50, 100].map(size => (
                                                            <option key={size} value={size}>{size}</option>
                                                        ))}
                                                    </select>
                                                    <span className="text-xs text-gray-400 dark:text-slate-500 hidden sm:inline-block">
                                                        | Total {sortedTrends.length} records
                                                    </span>
                                                </div>

                                                <div className="flex items-center gap-4">
                                                    <span className="text-sm font-medium text-gray-600 dark:text-slate-400">
                                                        Page {trendsPage} of {trendsTotalPages}
                                                    </span>
                                                    <div className="flex gap-2">
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => setTrendsPage(p => Math.max(1, p - 1))}
                                                            disabled={trendsPage === 1}
                                                            className="h-8 px-3 font-bold"
                                                        >
                                                            Previous
                                                        </Button>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => setTrendsPage(p => Math.min(trendsTotalPages, p + 1))}
                                                            disabled={trendsPage >= trendsTotalPages}
                                                            className="h-8 px-3 font-bold"
                                                        >
                                                            Next
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                }

                {
                    activeTab === 'favorites' && (
                        <div className="bg-white dark:bg-slate-950/50 rounded-xl border dark:border-slate-800/50 shadow-sm">
                            <div className="p-4 border-b dark:border-slate-800 bg-white dark:bg-slate-900/80 flex flex-col md:flex-row justify-between items-center gap-4 sticky top-[73px] z-10 rounded-t-xl">
                                <div className="flex flex-wrap items-center gap-3 w-full justify-between">
                                    {/* Left: Time Ranges */}
                                    <div className="flex gap-1 overflow-x-auto no-scrollbar pb-1 md:pb-0">
                                        {['1D', '1W', '1M', '3M', '6M', '1Y', 'ALL'].map(p => (
                                            <Button
                                                key={p}
                                                variant={favPeriod === p ? "default" : "outline"}
                                                size="sm"
                                                onClick={() => {
                                                    setFavPeriod(p);
                                                    setFavPage(1);
                                                }}
                                                className={`rounded-lg px-3 py-1 h-8 text-xs font-bold transition-all ${favPeriod === p ? 'bg-blue-600 dark:bg-indigo-600 text-white shadow-sm' : 'text-gray-600 dark:text-slate-400 hover:bg-blue-50 dark:hover:bg-slate-800 border-gray-200 dark:border-slate-800'
                                                    }`}
                                            >
                                                {p}
                                            </Button>
                                        ))}
                                    </div>

                                    {/* Right: Broker and Search */}
                                    <div className="flex items-center gap-2">
                                        <div className="flex items-center gap-2 bg-white dark:bg-slate-900 p-1.5 rounded-xl border border-gray-200 dark:border-slate-800 shadow-sm">
                                            <span className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase px-2">Broker</span>
                                            <select
                                                value={selectedBroker}
                                                onChange={(e) => {
                                                    handleBrokerChange(e.target.value);
                                                    setFavPage(1); // Reset page on broker change
                                                    setFavSearch(''); // Reset search
                                                }}
                                                className="bg-transparent border-none text-sm font-bold text-blue-700 dark:text-indigo-400 outline-none pr-4 min-w-[80px]"
                                            >
                                                <option value="">Select ID</option>
                                                {allBrokers.map(b => <option key={b} value={b}>{b}</option>)}
                                            </select>
                                        </div>
                                        {/* Search Input */}
                                        <div className="relative w-48 hidden md:block">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-slate-500" />
                                            <Input
                                                placeholder="Search symbol..."
                                                value={favSearch}
                                                onChange={(e) => {
                                                    setFavSearch(e.target.value);
                                                    setFavPage(1);
                                                }}
                                                className="pl-9 h-9 rounded-xl bg-gray-50 dark:bg-slate-900 border-gray-200 dark:border-slate-800 text-xs shadow-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-indigo-500 dark:text-slate-100"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="p-0">
                                {favoritesLoading ? (
                                    <div className="flex flex-col items-center justify-center p-20 space-y-4">
                                        <Loader2 className="w-10 h-10 text-blue-500 dark:text-indigo-400 animate-spin" />
                                        <p className="text-gray-500 dark:text-slate-400 font-medium tracking-wide">Analyzing broker favorites...</p>
                                    </div>
                                ) : !selectedBroker ? (
                                    <div className="p-20 text-center flex flex-col items-center gap-3">
                                        <div className="w-16 h-16 bg-blue-50 dark:bg-indigo-900/30 text-blue-400 dark:text-indigo-400 rounded-full flex items-center justify-center">
                                            <Search className="w-8 h-8" />
                                        </div>
                                        <p className="text-gray-500 dark:text-slate-400 font-medium">Please select a Broker ID to view their favorites.</p>
                                    </div>
                                ) : (
                                    <div>
                                        <table className="w-full caption-bottom text-sm">
                                            <TableHeader className="bg-gray-50 dark:bg-slate-900 sticky top-[146px] z-10 shadow-sm border-b dark:border-slate-800">
                                                <TableRow>
                                                    <TableHead className="w-[120px]">Symbol</TableHead>
                                                    <TableHead className="hidden lg:table-cell">Company</TableHead>
                                                    <TableHead className="text-right">Total Net Holding</TableHead>
                                                    <TableHead className="text-right">WAC</TableHead>
                                                    <TableHead className="text-right">LTP</TableHead>
                                                    <TableHead className="text-right">ROC</TableHead>
                                                    <TableHead className="text-right bg-blue-50/50 dark:bg-indigo-900/20">Qty Accumulated ({favPeriod})</TableHead>
                                                    <TableHead className="text-right">Net Amount</TableHead>
                                                    <TableHead className="w-[100px]"></TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {getCurrentPageItems().length === 0 ? (
                                                    <TableRow>
                                                        <TableCell colSpan={9} className="h-40 text-center text-gray-500 dark:text-slate-400">
                                                            No favorites data found.
                                                        </TableCell>
                                                    </TableRow>
                                                ) : (
                                                    getCurrentPageItems().map((fav, idx) => (
                                                        <TableRow key={idx} className="hover:bg-blue-50/30 dark:hover:bg-slate-900/50 transition-colors group border-b dark:border-slate-800">
                                                            <TableCell className="font-bold text-blue-700 dark:text-indigo-400">{fav.symbol}</TableCell>
                                                            <TableCell className="hidden lg:table-cell text-sm text-gray-600 dark:text-slate-400 truncate max-w-[200px]">{fav.name}</TableCell>
                                                            <TableCell className="text-right font-mono font-medium text-gray-400 dark:text-slate-500">
                                                                {fav.current_net.toLocaleString()}
                                                            </TableCell>
                                                            <TableCell className="text-right font-mono font-bold text-orange-600 dark:text-orange-400">
                                                                {fav.wac?.toLocaleString() || '-'}
                                                            </TableCell>
                                                            <TableCell className="text-right font-mono font-bold text-slate-700 dark:text-slate-300">
                                                                {fav.ltp?.toLocaleString() || '-'}
                                                            </TableCell>
                                                            <TableCell className={`text-right font-mono font-bold ${fav.roc > 0 ? 'text-green-600 dark:text-emerald-400' : fav.roc < 0 ? 'text-red-600 dark:text-rose-400' : 'text-gray-400'}`}>
                                                                {fav.roc > 0 ? '+' : ''}{fav.roc}%
                                                            </TableCell>
                                                            <TableCell className={`text-right font-mono font-bold bg-blue-50/20 dark:bg-indigo-900/20 ${fav.qty_accumulated > 0 ? 'text-green-600 dark:text-emerald-400' : fav.qty_accumulated < 0 ? 'text-red-600 dark:text-rose-400' : 'text-gray-400 dark:text-slate-500'}`}>
                                                                {fav.qty_accumulated > 0 ? '+' : ''}{fav.qty_accumulated.toLocaleString()}
                                                            </TableCell>
                                                            <TableCell className={`text-right font-mono font-bold ${fav.net_amount > 0 ? 'text-green-600 dark:text-emerald-400' : fav.net_amount < 0 ? 'text-red-600 dark:text-rose-400' : 'text-gray-400'}`}>
                                                                {Math.abs(fav.net_amount) >= 10000000
                                                                    ? `${(fav.net_amount / 10000000).toFixed(2)} Cr`
                                                                    : Math.abs(fav.net_amount) >= 100000
                                                                        ? `${(fav.net_amount / 100000).toFixed(2)} L`
                                                                        : fav.net_amount.toLocaleString()}
                                                            </TableCell>
                                                            <TableCell className="text-center">
                                                                <Link href={`/accumulation?tab=history&symbol=${fav.symbol}&broker=${selectedBroker}`}>
                                                                    <Button variant="ghost" size="icon" className="group-hover:text-blue-600 dark:group-hover:text-indigo-400 rounded-full transition-all" title="View historical accumulation">
                                                                        <History className="w-4 h-4" />
                                                                    </Button>
                                                                </Link>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))
                                                )}
                                            </TableBody>
                                        </table>
                                        {/* Pagination Controls */}
                                        <div className="p-4 border-t dark:border-slate-800 flex items-center justify-between">
                                            <span className="text-xs text-gray-500 dark:text-slate-400">
                                                Page {favPage} of {Math.ceil(filteredFavorites.length / favPageSize) || 1} • {filteredFavorites.length} results
                                            </span>
                                            <div className="flex gap-2">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={favPage === 1}
                                                    onClick={() => setFavPage(p => Math.max(1, p - 1))}
                                                    className="h-8 px-2"
                                                >
                                                    Previous
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={favPage * favPageSize >= filteredFavorites.length}
                                                    onClick={() => setFavPage(p => p + 1)}
                                                    className="h-8 px-2"
                                                >
                                                    Next
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                }

                {
                    activeTab === 'accumulators' && (
                        <>
                            <div className="bg-white dark:bg-slate-950/50 rounded-xl border dark:border-slate-800/50 shadow-sm p-4 mb-4 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 sticky top-[73px] z-20">
                                <div className="flex flex-wrap items-center gap-3">
                                    <span className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase px-2">Analysis Range</span>
                                    <div className="flex gap-1 overflow-x-auto no-scrollbar pb-1 md:pb-0">
                                        {timeRanges
                                            .filter(t => t.value !== '1D')
                                            .map((t) => (
                                                <Button
                                                    key={t.value}
                                                    onClick={() => setRange(t.value)}
                                                    variant={range === t.value ? "default" : "outline"}
                                                    size="sm"
                                                    className={`rounded-xl px-4 py-2 font-bold transition-all ${range === t.value
                                                        ? 'bg-blue-600 dark:bg-indigo-600 text-white shadow-lg scale-105'
                                                        : 'text-gray-600 dark:text-slate-400 hover:bg-blue-50 dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-slate-200 border-gray-200 dark:border-slate-800'
                                                        }`}
                                                >
                                                    {t.label}
                                                </Button>
                                            ))}
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 w-full lg:w-auto">
                                    <div className="relative flex-grow lg:w-48">
                                        <CompanySelect
                                            value={selectedGraphSymbol}
                                            onChange={(val) => setSelectedGraphSymbol(val)}
                                            className="w-full h-10 border-gray-200"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white dark:bg-slate-950/50 rounded-xl border dark:border-slate-800/50 shadow-sm h-[45vh] flex flex-col">
                                <div className="p-4 border-b dark:border-slate-800 bg-white dark:bg-slate-900/80 rounded-t-xl">
                                    <h3 className="text-lg font-bold text-gray-800 dark:text-slate-100">Accumulation Trend</h3>
                                </div>

                                <div className="flex-1 p-4 min-h-0">
                                    {!selectedGraphSymbol ? (
                                        <div className="h-full flex flex-col items-center justify-center space-y-4 text-gray-400 dark:text-slate-500">
                                            <BarChart2 className="w-16 h-16 opacity-20" />
                                            <p className="font-bold text-lg">Enter a symbol to visualize top accumulators</p>
                                        </div>
                                    ) : graphLoading ? (
                                        <div className="h-full flex flex-col items-center justify-center space-y-4">
                                            <Loader2 className="w-10 h-10 text-blue-500 dark:text-indigo-400 animate-spin" />
                                            <p className="text-gray-500 dark:text-slate-400 font-medium">Fetching accumulation data...</p>
                                        </div>
                                    ) : graphData.length === 0 ? (
                                        <div className="h-full flex flex-col items-center justify-center space-y-4 text-gray-400 dark:text-slate-500">
                                            <p className="font-medium">No data found for {selectedGraphSymbol}</p>
                                        </div>
                                    ) : (
                                        <ReactECharts
                                            option={getGraphOption()}
                                            style={{ height: '100%', width: '100%' }}
                                            notMerge={true}
                                        />
                                    )}
                                </div>
                            </div>
                        </>
                    )
                }

                {/* Aggressive Trader Tab */}
                {
                    activeTab === 'aggressive-trader' && (
                        <>
                            <div className="bg-white rounded-xl border shadow-sm p-4 mb-4 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 sticky top-[73px] z-20">
                                <div className="flex flex-wrap items-center gap-3">
                                    <span className="text-xs font-black text-gray-400 uppercase px-2">Analysis Range</span>
                                    <div className="flex gap-1 overflow-x-auto no-scrollbar pb-1 md:pb-0">
                                        {timeRanges
                                            .filter(t => ['1D', '1W', '2W', '1M', '3M'].includes(t.value))
                                            .map((t) => (
                                                <Button
                                                    key={t.value}
                                                    onClick={() => setRange(t.value)}
                                                    variant={range === t.value ? "default" : "outline"}
                                                    size="sm"
                                                    className={`rounded-xl px-4 py-2 font-bold transition-all ${range === t.value
                                                        ? 'bg-blue-600 text-white shadow-lg scale-105'
                                                        : 'text-gray-600 hover:bg-blue-50 hover:text-blue-600 border-gray-200'
                                                        }`}
                                                >
                                                    {t.label}
                                                </Button>
                                            ))}
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 w-full lg:w-auto">
                                    <div className="relative flex-grow lg:w-48">
                                        <CompanySelect
                                            value={selectedGraphSymbol}
                                            onChange={(val) => setSelectedGraphSymbol(val)}
                                            className="w-full h-10 border-gray-200"
                                        />
                                    </div>
                                </div>
                            </div>

                            {!selectedGraphSymbol ? (
                                <div className="bg-white rounded-xl border shadow-sm h-[60vh] flex flex-col items-center justify-center space-y-4 text-gray-400">
                                    <Activity className="w-16 h-16 opacity-20" />
                                    <p className="font-bold text-lg">Select a company to analyze aggressive traders</p>
                                </div>
                            ) : graphLoading ? (
                                <div className="bg-white rounded-xl border shadow-sm h-[60vh] flex flex-col items-center justify-center space-y-4">
                                    <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                                    <p className="text-gray-500 font-medium">Identifying top buyers and sellers...</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    {/* Buyers */}
                                    <div className="bg-white rounded-xl border shadow-sm h-[60vh] flex flex-col">
                                        <div className="p-4 border-b bg-green-50/50 rounded-t-xl">
                                            <h3 className="text-lg font-bold text-green-800">Aggressive Buying Pressure</h3>
                                        </div>
                                        <div className="flex-1 p-4 min-h-0">
                                            {buyLeaders.length === 0 ? (
                                                <div className="h-full flex items-center justify-center text-gray-400">No buying pressure detected</div>
                                            ) : (
                                                <ReactECharts option={getAggressiveGraphOption('buy')} style={{ height: '100%', width: '100%' }} notMerge={true} />
                                            )}
                                        </div>
                                    </div>
                                    {/* Sellers */}
                                    <div className="bg-white rounded-xl border shadow-sm h-[60vh] flex flex-col">
                                        <div className="p-4 border-b bg-red-50/50 rounded-t-xl">
                                            <h3 className="text-lg font-bold text-red-800">Aggressive Selling Pressure</h3>
                                        </div>
                                        <div className="flex-1 p-4 min-h-0">
                                            {sellLeaders.length === 0 ? (
                                                <div className="h-full flex items-center justify-center text-gray-400">No selling pressure detected</div>
                                            ) : (
                                                <ReactECharts option={getAggressiveGraphOption('sell')} style={{ height: '100%', width: '100%' }} notMerge={true} />
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )
                }

                {
                    activeTab === 'history' && (
                        <div className="bg-white dark:bg-slate-950/50 rounded-xl border dark:border-slate-800/50 shadow-sm relative h-[calc(100vh-140px)] flex flex-col">
                            {/* Header & Filters */}
                            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 p-5 border-b dark:border-slate-800 bg-white dark:bg-slate-900/80 rounded-t-xl shrink-0">
                                <div className="flex items-center gap-4">
                                    <div>
                                        <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">Historical Flows</h2>
                                        <p className="text-xs text-gray-500 dark:text-slate-400 font-medium">Detailed transaction logs</p>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                                    {/* Broker Selector */}
                                    <div className="flex items-center gap-2 bg-gray-50 dark:bg-slate-900 p-1.5 rounded-xl border border-gray-200 dark:border-slate-800">
                                        <span className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase px-2">Broker</span>
                                        <select
                                            value={selectedBroker}
                                            onChange={(e) => handleBrokerChange(e.target.value)}
                                            className="bg-transparent border-none text-sm font-bold text-blue-700 dark:text-indigo-400 outline-none pr-4 min-w-[80px]"
                                        >
                                            <option value="">Select ID</option>
                                            {selectedBroker && !allBrokers.includes(selectedBroker) && (
                                                <option value={selectedBroker}>{selectedBroker}</option>
                                            )}
                                            {allBrokers.map(b => <option key={b} value={b}>{b}</option>)}
                                        </select>
                                    </div>

                                    {/* Symbol Selector */}
                                    <div className="min-w-[180px]">
                                        <CompanySelect
                                            value={selectedGraphSymbol}
                                            onChange={(val) => {
                                                setSelectedGraphSymbol(val);
                                                const params = new URLSearchParams(searchParams.toString());
                                                params.set('symbol', val);
                                                router.push(`/accumulation?${params.toString()}`, { scroll: false });
                                            }}
                                            className="h-9 border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900 text-sm font-bold"
                                        />
                                    </div>
                                    {selectedGraphSymbol && (
                                        <Link href={`/floorsheet?symbol=${selectedGraphSymbol}&broker=${selectedBroker || ''}`}>
                                            <Button variant="outline" size="sm" className="bg-white dark:bg-slate-900 gap-2 font-medium text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-indigo-400 border-slate-200 dark:border-slate-800">
                                                <ExternalLink className="w-4 h-4" />
                                                Floorsheet
                                            </Button>
                                        </Link>
                                    )}
                                </div>
                            </div>

                            {(!selectedBroker || !selectedGraphSymbol) ? (
                                <div className="flex flex-col items-center justify-center flex-1 text-gray-400 dark:text-slate-500 space-y-4">
                                    <div className="p-4 bg-gray-50 dark:bg-slate-900 rounded-full">
                                        <Filter className="w-8 h-8 opacity-50" />
                                    </div>
                                    <p className="font-bold text-lg">Please select both Broker and Symbol</p>
                                    <p className="text-sm">Select filters above to view history</p>
                                </div>
                            ) : historyLoading ? (
                                <div className="flex flex-col items-center justify-center p-20 space-y-4 flex-1">
                                    <Loader2 className="w-10 h-10 text-blue-500 dark:text-indigo-400 animate-spin" />
                                    <p className="text-gray-500 dark:text-slate-400 font-medium">Loading history...</p>
                                </div>
                            ) : historyError ? (
                                <div className="flex flex-col items-center justify-center flex-1 p-20 text-center text-red-500 dark:text-rose-400 font-medium space-y-2">
                                    <p>{historyError}</p>
                                    <Button variant="outline" size="sm" onClick={() => window.location.reload()}>Retry</Button>
                                </div>
                            ) : (
                                <div
                                    className="flex-1 overflow-auto no-scrollbar"
                                >
                                    <table className="w-full caption-bottom text-sm relative">
                                        <TableHeader className="bg-gray-50 dark:bg-slate-900 sticky top-0 z-10 shadow-sm border-b dark:border-slate-800">
                                            <TableRow>
                                                <TableHead className="w-[110px] whitespace-nowrap">Date</TableHead>
                                                <TableHead className="text-right text-green-700 dark:text-emerald-400 font-bold whitespace-nowrap">Buy Qty</TableHead>
                                                <TableHead className="text-right text-green-700 dark:text-emerald-400 font-bold whitespace-nowrap">Buy Rate</TableHead>
                                                <TableHead className="text-right text-green-700 dark:text-emerald-400 font-bold whitespace-nowrap">Buy Amt</TableHead>
                                                <TableHead className="text-right text-red-700 dark:text-rose-400 font-bold whitespace-nowrap">Sell Qty</TableHead>
                                                <TableHead className="text-right text-red-700 dark:text-rose-400 font-bold whitespace-nowrap">Sell Rate</TableHead>
                                                <TableHead className="text-right text-red-700 dark:text-rose-400 font-bold whitespace-nowrap">Sell Amt</TableHead>
                                                <TableHead className="text-right font-bold whitespace-nowrap">Net Qty</TableHead>
                                                <TableHead className="text-right font-bold bg-blue-50/50 dark:bg-indigo-900/20 whitespace-nowrap">Cum. Qty</TableHead>
                                                <TableHead className="text-right font-bold bg-yellow-50/50 dark:bg-yellow-900/20 whitespace-nowrap">WAC</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {historyData.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={10} className="h-40 text-center text-gray-500 dark:text-slate-400">
                                                        No accumulation data found for this selection.
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                paginatedHistory.map((item, idx) => (
                                                    <TableRow key={idx} className="hover:bg-gray-50 dark:hover:bg-slate-900/50 transition-colors border-b dark:border-slate-800 last:border-0 group">
                                                        <TableCell className="text-xs text-gray-600 dark:text-slate-400 font-medium whitespace-nowrap">
                                                            <div className="flex items-center gap-2">
                                                                {item.date}
                                                                <Link
                                                                    href={`/floorsheet?symbol=${selectedGraphSymbol}&broker=${selectedBroker}&date=${item.date}`}
                                                                    className="text-blue-500 dark:text-indigo-400 hover:text-blue-700 dark:hover:text-indigo-300 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                    title="View daily floorsheet"
                                                                >
                                                                    <ExternalLink className="w-3 h-3" />
                                                                </Link>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-right font-mono text-green-700 dark:text-emerald-400">
                                                            {item.buy_qty > 0 ? item.buy_qty.toLocaleString() : '-'}
                                                        </TableCell>
                                                        <TableCell className="text-right font-mono text-xs text-gray-500 dark:text-slate-500">
                                                            {item.buy_qty > 0 ? item.buy_rate.toFixed(2) : '-'}
                                                        </TableCell>
                                                        <TableCell className="text-right font-mono text-xs text-gray-500 dark:text-slate-500">
                                                            {item.buy_qty > 0 ? Math.round(item.buy_amount).toLocaleString() : '-'}
                                                        </TableCell>
                                                        <TableCell className="text-right font-mono text-red-700 dark:text-rose-400">
                                                            {item.sell_qty > 0 ? item.sell_qty.toLocaleString() : '-'}
                                                        </TableCell>
                                                        <TableCell className="text-right font-mono text-xs text-gray-500 dark:text-slate-500">
                                                            {item.sell_qty > 0 ? item.sell_rate.toFixed(2) : '-'}
                                                        </TableCell>
                                                        <TableCell className="text-right font-mono text-xs text-gray-500 dark:text-slate-500">
                                                            {item.sell_qty > 0 ? Math.round(item.sell_amount).toLocaleString() : '-'}
                                                        </TableCell>
                                                        <TableCell className={`text-right font-mono font-bold ${item.net_quantity > 0 ? 'text-green-600 dark:text-emerald-400' : item.net_quantity < 0 ? 'text-red-600 dark:text-rose-400' : 'text-gray-400 dark:text-slate-500'}`}>
                                                            {item.net_quantity !== 0 ? (item.net_quantity > 0 ? '+' : '') + item.net_quantity.toLocaleString() : '0'}
                                                        </TableCell>
                                                        <TableCell className="text-right font-mono font-bold bg-blue-50/30 dark:bg-indigo-900/20 text-blue-800 dark:text-indigo-400">
                                                            {item.cumulative_qty.toLocaleString()}
                                                        </TableCell>
                                                        <TableCell className="text-right font-mono font-bold bg-yellow-50/30 dark:bg-yellow-900/20 text-gray-800 dark:text-yellow-400">
                                                            {item.wac ? item.wac.toLocaleString() : '-'}
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </table>
                                </div>
                            )}

                            {/* History Pagination Controls */}
                            {!historyLoading && !historyError && historyData.length > 0 && (
                                <div className="p-4 border-t dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0 rounded-b-xl">
                                    <div className="flex items-center gap-3">
                                        <span className="text-sm font-medium text-gray-500 dark:text-slate-400">Rows per page:</span>
                                        <select
                                            value={historyPageSize}
                                            onChange={(e) => {
                                                setHistoryPageSize(Number(e.target.value));
                                                setHistoryPage(1);
                                            }}
                                            className="h-8 rounded-lg border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 text-sm font-bold focus:ring-2 focus:ring-blue-500 dark:focus:ring-indigo-500 dark:text-slate-200"
                                        >
                                            {[20, 50, 100].map(size => (
                                                <option key={size} value={size}>{size}</option>
                                            ))}
                                        </select>
                                        <span className="text-xs text-gray-400 dark:text-slate-500 hidden sm:inline-block">
                                            | Total {historyData.length} records
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-4">
                                        <span className="text-sm font-medium text-gray-600 dark:text-slate-400">
                                            Page {historyPage} of {historyTotalPages}
                                        </span>
                                        <div className="flex gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                                                disabled={historyPage === 1}
                                                className="h-8 px-3 font-bold"
                                            >
                                                Previous
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setHistoryPage(p => Math.min(historyTotalPages, p + 1))}
                                                disabled={historyPage >= historyTotalPages}
                                                className="h-8 px-3 font-bold"
                                            >
                                                Next
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                }

                {
                    activeTab === 'share-transfer' && (
                        <div className="space-y-6">
                            {/* Filters Card */}
                            <div className="bg-white dark:bg-slate-950/50 rounded-xl border dark:border-slate-800/50 shadow-sm p-4 sticky top-[73px] z-30">
                                <div className="flex flex-wrap items-end gap-3">
                                    <div className="flex-1 min-w-[150px] space-y-1.5">
                                        <label className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase px-1">Ticker</label>
                                        <CompanySelect
                                            value={selectedGraphSymbol}
                                            onChange={setSelectedGraphSymbol}
                                            className="h-10 border-gray-200 dark:border-slate-800"
                                        />
                                    </div>
                                    <div className="w-24 space-y-1.5">
                                        <label className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase px-1">Broker 1</label>
                                        <select
                                            value={transferBroker1}
                                            onChange={(e) => setTransferBroker1(e.target.value)}
                                            className="w-full h-10 px-2 rounded-lg border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-bold text-gray-700 dark:text-slate-300 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                        >
                                            <option value="">ID</option>
                                            {allBrokers.map(b => <option key={b} value={b}>{b}</option>)}
                                        </select>
                                    </div>
                                    <div className="pb-2.5 text-gray-300 hidden lg:block">
                                        <ArrowRight className="w-4 h-4" />
                                    </div>
                                    <div className="w-24 space-y-1.5">
                                        <label className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase px-1">Broker 2</label>
                                        <select
                                            value={transferBroker2}
                                            onChange={(e) => setTransferBroker2(e.target.value)}
                                            className="w-full h-10 px-2 rounded-lg border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-bold text-gray-700 dark:text-slate-300 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                        >
                                            <option value="">ID</option>
                                            {allBrokers.map(b => <option key={b} value={b}>{b}</option>)}
                                        </select>
                                    </div>

                                    <div className="flex-1 min-w-[280px] space-y-1.5">
                                        <label className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase px-1">Date Range</label>
                                        <div className="flex gap-2">
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <Button variant="outline" className={cn("flex-1 h-10 justify-start font-medium rounded-lg border-gray-200 dark:border-slate-800 dark:bg-slate-900 px-3", !transferStartDate && "text-gray-400")}>
                                                        <CalendarIcon className="mr-2 h-4 w-4 text-blue-500" />
                                                        {transferStartDate ? format(transferStartDate, "MMM dd, yyyy") : "Start"}
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-auto p-0 rounded-xl overflow-hidden shadow-2xl z-[100]" align="start">
                                                    <Calendar
                                                        mode="single"
                                                        selected={transferStartDate}
                                                        onSelect={setTransferStartDate}
                                                        initialFocus
                                                    />
                                                </PopoverContent>
                                            </Popover>

                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <Button variant="outline" className={cn("flex-1 h-10 justify-start font-medium rounded-lg border-gray-200 dark:border-slate-800 dark:bg-slate-900 px-3", !transferEndDate && "text-gray-400")}>
                                                        <CalendarIcon className="mr-2 h-4 w-4 text-purple-500" />
                                                        {transferEndDate ? format(transferEndDate, "MMM dd, yyyy") : "End"}
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-auto p-0 rounded-xl overflow-hidden shadow-2xl z-[100]" align="start">
                                                    <Calendar
                                                        mode="single"
                                                        selected={transferEndDate}
                                                        onSelect={setTransferEndDate}
                                                        initialFocus
                                                    />
                                                </PopoverContent>
                                            </Popover>
                                        </div>
                                    </div>

                                    <Button
                                        onClick={fetchTransferData}
                                        disabled={transferLoading || !selectedGraphSymbol || !transferBroker1 || !transferBroker2}
                                        className="h-10 px-6 bg-blue-600 hover:bg-blue-700 text-white font-black uppercase text-xs tracking-widest rounded-lg transition-all active:scale-95 shadow-lg shadow-blue-500/20"
                                    >
                                        {transferLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Apply Filters"}
                                    </Button>
                                </div>
                            </div>
                            {!selectedGraphSymbol || selectedGraphSymbol === 'All' || !transferBroker1 || !transferBroker2 ? (
                                <div className="p-20 text-center flex flex-col items-center gap-4 bg-white dark:bg-slate-900/50 rounded-xl border border-dashed dark:border-slate-800">
                                    <div className="p-4 bg-blue-50 dark:bg-indigo-900/20 rounded-full">
                                        <Layers className="w-8 h-8 text-blue-500" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-gray-800 dark:text-slate-200">Set Filters</h3>
                                        <p className="text-gray-500 dark:text-slate-400">Select a ticker and two brokers to compare share transfers.</p>
                                    </div>
                                </div>
                            ) : transferLoading ? (
                                <div className="p-20 flex flex-col items-center justify-center gap-4">
                                    <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                                    <p className="text-gray-500 dark:text-slate-400 font-medium">Crunching transfer data...</p>
                                </div>
                            ) : transferData ? (
                                <>
                                    {/* Summary Cards Breakdown */}
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                        {/* Direction 1: B1 to B2 */}
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-2 px-1">
                                                <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                                                <h4 className="text-xs font-black uppercase text-gray-500 dark:text-slate-400">
                                                    Broker {transferBroker1} Buying from Broker {transferBroker2}
                                                </h4>
                                            </div>
                                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                                <Card className="bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 shadow-sm p-3">
                                                    <p className="text-xs font-black uppercase text-gray-400 mb-1">Volume</p>
                                                    <p className="text-lg font-black text-blue-600 dark:text-indigo-400">
                                                        {transferData.summary.broker1_to_broker2.total_volume?.toLocaleString() || 0}
                                                    </p>
                                                </Card>
                                                <Card className="bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 shadow-sm p-3">
                                                    <p className="text-xs font-black uppercase text-gray-400 mb-1">Amount</p>
                                                    <p className="text-lg font-black text-gray-800 dark:text-slate-100">
                                                        रू {(transferData.summary.broker1_to_broker2.total_amount / 100000).toFixed(2)}L
                                                    </p>
                                                </Card>
                                                <Card className="bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 shadow-sm p-3">
                                                    <p className="text-xs font-black uppercase text-gray-400 mb-1">Avg. Rate</p>
                                                    <p className="text-sm font-black text-gray-800 dark:text-slate-100">
                                                        {transferData.summary.broker1_to_broker2.avg_rate?.toLocaleString() || 0}
                                                    </p>
                                                </Card>
                                                <Card className="bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 shadow-sm p-3">
                                                    <p className="text-xs font-black uppercase text-gray-400 mb-1">Txs</p>
                                                    <p className="text-lg font-black text-gray-800 dark:text-slate-100">
                                                        {transferData.summary.broker1_to_broker2.total_transactions || 0}
                                                    </p>
                                                </Card>
                                            </div>
                                        </div>

                                        {/* Direction 2: B2 to B1 */}
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-2 px-1">
                                                <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                                                <h4 className="text-xs font-black uppercase text-gray-500 dark:text-slate-400">
                                                    Broker {transferBroker2} Buying from Broker {transferBroker1}
                                                </h4>
                                            </div>
                                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                                <Card className="bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 shadow-sm p-3">
                                                    <p className="text-xs font-black uppercase text-gray-400 mb-1">Volume</p>
                                                    <p className="text-lg font-black text-purple-600 dark:text-purple-400">
                                                        {transferData.summary.broker2_to_broker1.total_volume?.toLocaleString() || 0}
                                                    </p>
                                                </Card>
                                                <Card className="bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 shadow-sm p-3">
                                                    <p className="text-xs font-black uppercase text-gray-400 mb-1">Amount</p>
                                                    <p className="text-lg font-black text-gray-800 dark:text-slate-100">
                                                        रू {(transferData.summary.broker2_to_broker1.total_amount / 100000).toFixed(2)}L
                                                    </p>
                                                </Card>
                                                <Card className="bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 shadow-sm p-3">
                                                    <p className="text-xs font-black uppercase text-gray-400 mb-1">Avg. Rate</p>
                                                    <p className="text-sm font-black text-gray-800 dark:text-slate-100">
                                                        {transferData.summary.broker2_to_broker1.avg_rate?.toLocaleString() || 0}
                                                    </p>
                                                </Card>
                                                <Card className="bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 shadow-sm p-3">
                                                    <p className="text-xs font-black uppercase text-gray-400 mb-1">Txs</p>
                                                    <p className="text-lg font-black text-gray-800 dark:text-slate-100">
                                                        {transferData.summary.broker2_to_broker1.total_transactions || 0}
                                                    </p>
                                                </Card>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Chart & List */}
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                        <Card className="bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 h-[350px] flex flex-col shadow-sm">
                                            <CardHeader>
                                                <CardTitle className="text-sm font-bold flex items-center gap-2">
                                                    <BarChart2 className="w-4 h-4 text-blue-500" />
                                                    Daily Transfer Volume
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent className="flex-1 p-0">
                                                {transferData.daily_stats.length > 0 ? (
                                                    <ReactECharts
                                                        option={getTransferChartOption()}
                                                        style={{ height: '100%', width: '100%' }}
                                                    />
                                                ) : (
                                                    <div className="h-full flex items-center justify-center text-gray-400 text-sm">No daily statistics available</div>
                                                )}
                                            </CardContent>
                                        </Card>

                                        <Card className="bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 h-[350px] flex flex-col shadow-sm">
                                            <CardHeader>
                                                <CardTitle className="text-sm font-bold flex items-center gap-2">
                                                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                                                    Transfer vs Net Accumulation
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent className="flex-1 p-0">
                                                {transferData.daily_stats.length > 0 ? (
                                                    <ReactECharts
                                                        option={getComparisonChartOption()}
                                                        style={{ height: '100%', width: '100%' }}
                                                    />
                                                ) : (
                                                    <div className="h-full flex items-center justify-center text-gray-400 text-sm">No comparison data available</div>
                                                )}
                                            </CardContent>
                                        </Card>
                                    </div>

                                    <Card className="bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 shadow-sm flex flex-col">
                                        <CardHeader className="border-b dark:border-slate-800 py-3">
                                            <CardTitle className="text-sm font-bold flex items-center gap-2">
                                                <History className="w-4 h-4 text-purple-500" />
                                                Daily Aggregated Transfers & Net Flow
                                            </CardTitle>
                                        </CardHeader>
                                        <CardContent className="p-0 overflow-auto">
                                            <table className="w-full text-xs">
                                                <thead className="bg-gray-50 dark:bg-slate-800 sticky top-0 z-10">
                                                    <tr>
                                                        <th className="p-2 text-left">Date</th>
                                                        <th className="p-2 text-right">Price (Chg%)</th>
                                                        <th className="p-2 text-right">Transfer Vol</th>
                                                        <th className="p-2 text-right">Trans/Sell Ratio</th>
                                                        <th className="p-2 text-right">B{transferBroker1} Net</th>
                                                        <th className="p-2 text-right">B{transferBroker2} Net</th>
                                                        <th className="p-2 text-right">Market Net</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y dark:divide-slate-800">
                                                    {!transferData.aggregated_transfers || transferData.aggregated_transfers.length === 0 ? (
                                                        <tr>
                                                            <td colSpan={6} className="p-10 text-center text-gray-400">No aggregated data found</td>
                                                        </tr>
                                                    ) : (
                                                        transferData.aggregated_transfers.map((day: any, i: number) => {
                                                            const totalTransfer = (day.volume_1_to_2 || 0) + (day.volume_2_to_1 || 0);
                                                            // Calculate ratios: what % of the selling broker's total sell volume was this transfer?
                                                            const ratio1to2 = day.b1_sell > 0 ? (day.volume_1_to_2 / day.b1_sell * 100).toFixed(1) : '0';
                                                            const ratio2to1 = day.b2_sell > 0 ? (day.volume_2_to_1 / day.b2_sell * 100).toFixed(1) : '0';

                                                            return (
                                                                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors border-b dark:border-slate-800/50 last:border-0">
                                                                    <td className="p-2 font-mono text-gray-500">{day.transaction_date}</td>
                                                                    <td className="p-2 text-right">
                                                                        <div className="font-bold flex flex-col">
                                                                            <span>रू {day.close_price?.toLocaleString()}</span>
                                                                            <span className={`text-xs ${day.price_change_pc >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                                                {day.price_change_pc > 0 ? '+' : ''}{day.price_change_pc}%
                                                                            </span>
                                                                        </div>
                                                                    </td>
                                                                    <td className="p-2 text-right font-bold text-blue-600 dark:text-blue-400">
                                                                        {totalTransfer.toLocaleString()}
                                                                    </td>
                                                                    <td className="p-2 text-right">
                                                                        <div className="flex flex-col gap-0.5">
                                                                            {day.volume_1_to_2 > 0 && <span className="text-gray-400">B1→B2: <b className="text-indigo-600">{ratio1to2}%</b></span>}
                                                                            {day.volume_2_to_1 > 0 && <span className="text-gray-400">B2→B1: <b className="text-purple-600">{ratio2to1}%</b></span>}
                                                                            {totalTransfer === 0 && <span className="text-gray-300">-</span>}
                                                                        </div>
                                                                    </td>
                                                                    <td className={`p-2 text-right font-bold ${day.b1_net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                                        {day.b1_net > 0 ? '+' : ''}{day.b1_net?.toLocaleString() || '0'}
                                                                    </td>
                                                                    <td className={`p-2 text-right font-bold ${day.b2_net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                                        {day.b2_net > 0 ? '+' : ''}{day.b2_net?.toLocaleString() || '0'}
                                                                    </td>
                                                                    <td className={`p-2 text-right font-bold ${day.net_accumulation >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                                        {day.net_accumulation > 0 ? '+' : ''}{day.net_accumulation?.toLocaleString() || '0'}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })
                                                    )}
                                                </tbody>
                                            </table>
                                        </CardContent>
                                    </Card>
                                </>
                            ) : (
                                <div className="p-20 text-center flex flex-col items-center gap-4 bg-white dark:bg-slate-900/50 rounded-xl border border-dashed dark:border-slate-800">
                                    <div className="p-4 bg-blue-50 dark:bg-indigo-900/20 rounded-full">
                                        <Activity className="w-8 h-8 text-blue-500" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-gray-800 dark:text-slate-200">Ready to Analyze</h3>
                                        <p className="text-gray-500 dark:text-slate-400">Click "Apply Filters" to fetch share transfer data for {selectedGraphSymbol}.</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                }
            </div >

            <style jsx global>{`
                .no-scrollbar::-webkit-scrollbar {
                    display: none;
                }
                .no-scrollbar {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
            `}</style>
        </DashboardLayout >
    );
}

export default function AccumulationPage() {
    return (
        <Suspense fallback={<div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-blue-500" /></div>}>
            <AccumulationContent />
        </Suspense>
    );
}
