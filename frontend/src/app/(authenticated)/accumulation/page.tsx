'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import DashboardLayout from '@/components/DashboardLayout';
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
    Calendar,
    Layers
} from 'lucide-react';
import Link from 'next/link';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
    trend_5d: 'Increasing' | 'Decreasing' | 'Stable';
    change_5d: number;
    trend_10d: 'Increasing' | 'Decreasing' | 'Stable';
    change_10d: number;
    trend_20d: 'Increasing' | 'Decreasing' | 'Stable';
    change_20d: number;
    trend_50d: 'Increasing' | 'Decreasing' | 'Stable';
    change_50d: number;
}

export default function AccumulationPage() {
    const [data, setData] = useState<AccumulationData[]>([]);
    const [trends, setTrends] = useState<BrokerTrend[]>([]);
    const [loading, setLoading] = useState(true);
    const [trendsLoading, setTrendsLoading] = useState(true);
    const [range, setRange] = useState('1D');
    const [sector, setSector] = useState('All');
    const [sectors, setSectors] = useState<string[]>([]);
    const [search, setSearch] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: keyof AccumulationData; direction: 'asc' | 'desc' }>({
        key: 'net_qty',
        direction: 'desc'
    });
    const [activeTab, setActiveTab] = useState('overview');
    const [aggressiveData, setAggressiveData] = useState<{ accumulators: any[]; distributors: any[] }>({
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
        const fetchSectors = async () => {
            try {
                const res = await api.get('/api/stocks/companies/sectors/');
                setSectors(['All', ...res.data.map((s: any) => s.name)]);
            } catch (err) {
                console.error('Failed to fetch sectors', err);
            }
        };
        fetchSectors();
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

    const TrendBadge = ({ trend, change }: { trend: string, change: number }) => {
        const color = trend === 'Increasing' ? 'text-green-600 bg-green-50 border-green-100' :
            trend === 'Decreasing' ? 'text-red-600 bg-red-50 border-red-100' :
                'text-blue-600 bg-blue-50 border-blue-100';

        return (
            <div className={`flex flex-col items-center px-2 py-1 rounded border ${color}`}>
                <span className="text-[10px] font-bold uppercase">{trend}</span>
                <span className="text-[9px] font-mono">{change.toLocaleString()}</span>
            </div>
        );
    };

    return (
        <DashboardLayout title="Market Accumulation">
            <div className="space-y-6 animate-in fade-in duration-500">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
                    <div className="flex flex-col gap-4">
                        <div className="flex justify-between items-center">
                            <TabsList className="bg-white border p-1 rounded-2xl shadow-sm w-fit inline-flex">
                                <TabsTrigger value="overview" className="rounded-xl px-10 py-3 data-[state=active]:bg-blue-600 data-[state=active]:text-white transition-all font-bold">Market Overview</TabsTrigger>
                                <TabsTrigger value="aggressive" className="rounded-xl px-10 py-3 data-[state=active]:bg-orange-600 data-[state=active]:text-white transition-all font-bold flex items-center gap-2">
                                    <Activity className="w-4 h-4" />
                                    Aggressive Patterns
                                </TabsTrigger>
                                <TabsTrigger value="trends" className="rounded-xl px-10 py-3 data-[state=active]:bg-blue-600 data-[state=active]:text-white transition-all font-bold">Broker Trends</TabsTrigger>
                            </TabsList>

                            <div className="hidden lg:flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-widest px-4 py-2 bg-gray-50 rounded-xl border border-dashed">
                                <Activity className="w-4 h-4 text-blue-500" />
                                Live Flow Analysis
                            </div>
                        </div>

                        {/* Filters Section - Moved outside Tabs for stability */}
                        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white p-5 rounded-2xl border shadow-sm backdrop-blur-md bg-white/80 sticky top-[73px] z-10 transition-all border-l-4 border-l-blue-600">
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg border text-xs font-bold text-gray-500 mr-2">
                                    <Calendar className="w-3.5 h-3.5" />
                                    ANALYSIS RANGE
                                </div>
                                <div className="flex gap-1 overflow-x-auto no-scrollbar pb-1 md:pb-0">
                                    {timeRanges.filter(t =>
                                        activeTab === 'aggressive' ? ['1W', '2W', '1M', '3M'].includes(t.value) : true
                                    ).map((t) => (
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
                                <div className="relative flex-grow lg:w-64">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <Input
                                        placeholder="Search symbol..."
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        className="pl-10 h-11 rounded-xl bg-gray-50/50 border-gray-200 focus:bg-white transition-all shadow-inner"
                                    />
                                </div>
                                <div className="flex items-center gap-2 h-11 px-3 bg-gray-50/50 border border-gray-200 rounded-xl">
                                    <Layers className="w-4 h-4 text-gray-400" />
                                    <select
                                        value={sector}
                                        onChange={(e) => setSector(e.target.value)}
                                        className="bg-transparent border-none text-sm font-bold text-gray-700 outline-none min-w-[100px]"
                                    >
                                        {sectors.map(s => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>

                    <TabsContent value="overview" className="space-y-6 m-0">

                        {/* Results Table */}
                        <Card className="border-none shadow-xl overflow-hidden bg-white/50 backdrop-blur-sm">
                            <CardContent className="p-0">
                                {loading ? (
                                    <div className="flex flex-col items-center justify-center p-20 space-y-4">
                                        <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                                        <p className="text-gray-500 font-medium tracking-wide">Analyzing market accumulation...</p>
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <Table>
                                            <TableHeader className="bg-gray-50/80 sticky top-0">
                                                <TableRow>
                                                    <TableHead className="w-[120px] cursor-pointer hover:text-blue-600 transition-colors" onClick={() => handleSort('symbol')}>
                                                        <div className="flex items-center gap-1">Symbol <SortIcon column="symbol" /></div>
                                                    </TableHead>
                                                    <TableHead className="hidden lg:table-cell">Company</TableHead>
                                                    <TableHead className="text-right cursor-pointer hover:text-blue-600 transition-colors" onClick={() => handleSort('close')}>
                                                        <div className="flex items-center justify-end gap-1">Price <SortIcon column="close" /></div>
                                                    </TableHead>
                                                    <TableHead className="text-right cursor-pointer hover:text-blue-600 transition-colors" onClick={() => handleSort('net_qty')}>
                                                        <div className="flex items-center justify-end gap-1">Net Acc. <SortIcon column="net_qty" /></div>
                                                    </TableHead>
                                                    <TableHead className="text-center w-[200px] cursor-pointer hover:text-blue-600 transition-colors" onClick={() => handleSort('accumulation_ratio')}>
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
                                                        <TableCell colSpan={8} className="h-40 text-center text-gray-500">
                                                            No accumulation data found matching your criteria.
                                                        </TableCell>
                                                    </TableRow>
                                                ) : (
                                                    sortedData.map((item) => (
                                                        <TableRow key={item.symbol} className="hover:bg-blue-50/40 transition-colors group">
                                                            <TableCell className="font-bold text-blue-700 bg-blue-50/20">{item.symbol}</TableCell>
                                                            <TableCell className="hidden lg:table-cell">
                                                                <div className="flex flex-col max-w-[200px]">
                                                                    <span className="text-sm font-medium text-gray-900 truncate">{item.name}</span>
                                                                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{item.sector}</span>
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="text-right font-mono font-medium">
                                                                Rs. {item.close.toLocaleString()}
                                                            </TableCell>
                                                            <TableCell className="text-right">
                                                                <span className={`font-mono font-bold ${item.net_qty >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                                    {item.net_qty >= 0 ? '+' : ''}{item.net_qty.toLocaleString()}
                                                                </span>
                                                            </TableCell>
                                                            <TableCell>
                                                                <div className="flex flex-col items-center gap-1 px-4">
                                                                    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden shadow-inner border border-gray-200/50">
                                                                        <div
                                                                            className={`h-full transition-all duration-1000 ease-out ${item.net_qty >= 0 ? 'bg-gradient-to-r from-green-400 to-green-600' : 'bg-gradient-to-r from-red-400 to-red-600'}`}
                                                                            style={{ width: `${Math.min(item.accumulation_ratio, 100)}%` }}
                                                                        />
                                                                    </div>
                                                                    <span className="text-[10px] font-bold text-gray-400">{item.accumulation_ratio.toFixed(1)}% Strength</span>
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="hidden md:table-cell">
                                                                <div className="flex justify-center gap-1">
                                                                    {item.top_buyers?.map(b => (
                                                                        <span key={b} className="px-2 py-0.5 bg-green-50 text-green-700 rounded text-[10px] font-bold border border-green-100">#{b}</span>
                                                                    ))}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="hidden md:table-cell">
                                                                <div className="flex justify-center gap-1">
                                                                    {item.top_sellers?.map(b => (
                                                                        <span key={b} className="px-2 py-0.5 bg-red-50 text-red-700 rounded text-[10px] font-bold border border-red-100">#{b}</span>
                                                                    ))}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell className="text-center">
                                                                <Link href={`/stock/${item.symbol}`}>
                                                                    <Button variant="ghost" size="icon" className="group-hover:text-blue-600 group-hover:bg-blue-100 rounded-full transition-all">
                                                                        <ArrowRight className="w-4 h-4" />
                                                                    </Button>
                                                                </Link>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))
                                                )}
                                            </TableBody>
                                        </Table>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="aggressive" className="space-y-6 m-0">
                        {aggressiveLoading ? (
                            <div className="flex flex-col items-center justify-center p-20 space-y-4">
                                <Loader2 className="w-10 h-10 text-orange-500 animate-spin" />
                                <p className="text-gray-500 font-medium tracking-wide">Scanning for aggressive patterns...</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* Accumulators List */}
                                <div className="space-y-4">
                                    <h3 className="text-lg font-bold text-green-700 flex items-center gap-2 px-1">
                                        <ChevronUp className="w-5 h-5" />
                                        Aggressive Accumulators
                                    </h3>
                                    {aggressiveData.accumulators?.length === 0 ? (
                                        <Card className="p-10 text-center text-gray-400 bg-white/50">No aggressive accumulation detected.</Card>
                                    ) : (
                                        aggressiveData.accumulators.map((sym, idx) => (
                                            <Card key={idx} className="group hover:border-green-200 transition-all shadow-sm hover:shadow-md bg-white overflow-hidden">
                                                <div className="p-4 flex justify-between items-center">
                                                    <div className="flex flex-col">
                                                        <span className="text-xl font-black text-gray-900 group-hover:text-green-600 transition-colors tracking-tight">{sym.symbol}</span>
                                                        <span className="text-xs font-semibold text-gray-400 uppercase truncate max-w-[150px]">{sym.name}</span>
                                                    </div>
                                                    <div className="flex flex-col items-end">
                                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Buy Intensity</span>
                                                        <div className="px-3 py-1 bg-green-100 text-green-700 rounded-lg text-sm font-black border border-green-200 shadow-sm flex items-center gap-1">
                                                            +{sym.intensity.toFixed(1)}%
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="px-4 pb-4 flex items-center justify-between border-t pt-3 mt-1">
                                                    <div className="flex gap-1 items-center overflow-hidden">
                                                        <span className="text-[10px] font-bold text-gray-400 uppercase mr-1">Top Actors</span>
                                                        {sym.producers?.map(p => (
                                                            <span key={p} className="px-1.5 py-0.5 bg-gray-50 text-gray-600 rounded text-[10px] font-bold border border-gray-100">#{p}</span>
                                                        ))}
                                                    </div>
                                                    <Link href={`/stock/${sym.symbol}`}>
                                                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs font-bold text-blue-600 hover:bg-blue-50 gap-1 rounded-lg">
                                                            Analyze <ArrowRight className="w-3 h-3" />
                                                        </Button>
                                                    </Link>
                                                </div>
                                            </Card>
                                        ))
                                    )}
                                </div>

                                {/* Distributors List */}
                                <div className="space-y-4">
                                    <h3 className="text-lg font-bold text-red-700 flex items-center gap-2 px-1">
                                        <ChevronDown className="w-5 h-5" />
                                        Aggressive Distributors
                                    </h3>
                                    {aggressiveData.distributors?.length === 0 ? (
                                        <Card className="p-10 text-center text-gray-400 bg-white/50">No aggressive distribution detected.</Card>
                                    ) : (
                                        aggressiveData.distributors.map((sym, idx) => (
                                            <Card key={idx} className="group hover:border-red-200 transition-all shadow-sm hover:shadow-md bg-white overflow-hidden">
                                                <div className="p-4 flex justify-between items-center">
                                                    <div className="flex flex-col">
                                                        <span className="text-xl font-black text-gray-900 group-hover:text-red-600 transition-colors tracking-tight">{sym.symbol}</span>
                                                        <span className="text-xs font-semibold text-gray-400 uppercase truncate max-w-[150px]">{sym.name}</span>
                                                    </div>
                                                    <div className="flex flex-col items-end">
                                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Sell Intensity</span>
                                                        <div className="px-3 py-1 bg-red-100 text-red-700 rounded-lg text-sm font-black border border-red-200 shadow-sm flex items-center gap-1">
                                                            {sym.intensity.toFixed(1)}%
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="px-4 pb-4 flex items-center justify-between border-t pt-3 mt-1">
                                                    <div className="flex gap-1 items-center overflow-hidden">
                                                        <span className="text-[10px] font-bold text-gray-400 uppercase mr-1">Offloaders</span>
                                                        {sym.offloaders?.map(p => (
                                                            <span key={p} className="px-1.5 py-0.5 bg-gray-50 text-gray-600 rounded text-[10px] font-bold border border-gray-100">#{p}</span>
                                                        ))}
                                                    </div>
                                                    <Link href={`/stock/${sym.symbol}`}>
                                                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs font-bold text-blue-600 hover:bg-blue-50 gap-1 rounded-lg">
                                                            Analyze <ArrowRight className="w-3 h-3" />
                                                        </Button>
                                                    </Link>
                                                </div>
                                            </Card>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="trends" className="space-y-6 m-0">
                        <Card className="border-none shadow-xl overflow-hidden bg-white/50 backdrop-blur-sm">
                            <CardContent className="p-0">
                                {trendsLoading ? (
                                    <div className="flex flex-col items-center justify-center p-20 space-y-4">
                                        <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                                        <p className="text-gray-500 font-medium">Calculating broker trends...</p>
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <Table>
                                            <TableHeader className="bg-gray-50/80">
                                                <TableRow>
                                                    <TableHead className="w-[120px]">Symbol</TableHead>
                                                    <TableHead>Broker</TableHead>
                                                    <TableHead className="text-right">Cumulative Net</TableHead>
                                                    <TableHead className="text-center">5D Trend</TableHead>
                                                    <TableHead className="text-center">10D Trend</TableHead>
                                                    <TableHead className="text-center">20D Trend</TableHead>
                                                    <TableHead className="text-center">50D Trend</TableHead>
                                                    <TableHead className="w-[60px]"></TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {trends.length === 0 ? (
                                                    <TableRow>
                                                        <TableCell colSpan={8} className="h-40 text-center text-gray-500">
                                                            No broker trends found meeting the criteria (Cumulative Net {'>'} 250k).
                                                        </TableCell>
                                                    </TableRow>
                                                ) : (
                                                    trends.map((row, idx) => (
                                                        <TableRow key={idx} className="hover:bg-blue-50/40 transition-colors group">
                                                            <TableCell className="font-bold text-blue-700">{row.symbol}</TableCell>
                                                            <TableCell>
                                                                <span className="px-2 py-1 bg-gray-100 rounded text-xs font-bold border border-gray-200">
                                                                    Broker #{row.broker}
                                                                </span>
                                                            </TableCell>
                                                            <TableCell className="text-right font-mono font-bold text-blue-800">
                                                                {row.cumulative_net.toLocaleString()}
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
                                                                <Link href={`/stock/${row.symbol}`}>
                                                                    <Button variant="ghost" size="icon" className="group-hover:text-blue-600 rounded-full">
                                                                        <ArrowRight className="w-4 h-4" />
                                                                    </Button>
                                                                </Link>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))
                                                )}
                                            </TableBody>
                                        </Table>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>

            <style jsx global>{`
                .no-scrollbar::-webkit-scrollbar {
                    display: none;
                }
                .no-scrollbar {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
            `}</style>
        </DashboardLayout>
    );
}
