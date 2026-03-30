'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';
import { ArrowLeft, TrendingUp, TrendingDown, Users, DollarSign, Activity, Filter, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { PageLoader } from '@/components/ui/StockLoader';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import nextDynamic from 'next/dynamic';

const ReactECharts = nextDynamic(() => import('echarts-for-react'), { ssr: false });

interface FloorsheetSummary {
    total_turnover: number;
    total_volume: number;
    total_transactions: number;
    avg_rate: number;
}

interface TopTrader {
    broker: number;
    name: string;
    qty: number;
    amount: number;
}

interface FloorsheetEntry {
    id: number;
    transaction_date: string;
    contract_no: string;
    symbol: string;
    buyer_id: string;
    seller_id: string;
    transaction_quantity: number;
    transaction_rate: number;
    transaction_amount: number;
}

function FloorsheetContent() {
    const searchParams = useSearchParams();
    const router = useRouter();

    // Filter State
    const [broker, setBroker] = useState(searchParams.get('broker') || '');
    const [symbol, setSymbol] = useState(searchParams.get('symbol') || '');
    const [date, setDate] = useState(searchParams.get('date') || '');

    // URL Params for Pagination
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = 50;

    // Data State
    const [summary, setSummary] = useState<FloorsheetSummary | null>(null);
    const [topBuyers, setTopBuyers] = useState<TopTrader[]>([]);
    const [topSellers, setTopSellers] = useState<TopTrader[]>([]);
    const [transactions, setTransactions] = useState<FloorsheetEntry[]>([]);
    const [totalPages, setTotalPages] = useState(1);
    const [totalCount, setTotalCount] = useState(0);

    const [loading, setLoading] = useState(true);
    const [tableLoading, setTableLoading] = useState(false);

    // Update URL on filter change
    const updateFilters = (resetPage = true) => {
        const params = new URLSearchParams();
        if (broker) params.set('broker', broker);
        if (symbol) params.set('symbol', symbol);
        if (date) params.set('date', date);
        if (!resetPage) params.set('page', page.toString());
        else params.set('page', '1'); // Reset to page 1 on filter change

        router.push(`/floorsheet?${params.toString()}`);
    };

    const handlePageChange = (newPage: number) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('page', newPage.toString());
        router.push(`/floorsheet?${params.toString()}`);
    };

    // Load Data
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const params: any = {};
                if (broker) params.broker = broker;
                if (symbol) params.symbol = symbol;
                if (date) params.date = date;

                const summaryRes = await api.get('/api/stocks/floorsheet/summary/', { params });
                setSummary(summaryRes.data.summary);
                setTopBuyers(summaryRes.data.top_buyers);
                setTopSellers(summaryRes.data.top_sellers);

                // Fetch Transactions List
                setTableLoading(true);
                const listRes = await api.get('/api/stocks/floorsheet_list/', {
                    params: { ...params, page, page_size: pageSize }
                });

                if (listRes.data.results) {
                    setTransactions(listRes.data.results);
                    setTotalPages(listRes.data.total_pages);
                    setTotalCount(listRes.data.total_count);
                } else {
                    setTransactions(Array.isArray(listRes.data) ? listRes.data : []);
                }
                setTableLoading(false);

            } catch (error) {
                console.error("Failed to fetch floorsheet data", error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [searchParams]);

    // Sync state with URL params if they change externally
    useEffect(() => {
        setBroker(searchParams.get('broker') || '');
        setSymbol(searchParams.get('symbol') || '');
        setDate(searchParams.get('date') || '');
    }, [searchParams]);

    const formatCurrency = (val: number) => {
        if (val === undefined || val === null) return 'Rs. 0';
        return new Intl.NumberFormat('en-NP', { style: 'currency', currency: 'NPR', maximumFractionDigits: 0 }).format(val).replace('NPR', 'Rs.');
    };

    const formatNumber = (num: number) => {
        return new Intl.NumberFormat('en-US').format(num);
    };

    const getChartOption = (data: TopTrader[], title: string, color: string) => {
        const textColor = '#94a3b8'; // Slate-400, visible in both dark/light
        const splitLineColor = 'rgba(128, 128, 128, 0.1)';

        return {
            title: {
                text: title,
                left: 'center',
                textStyle: { fontSize: 14, color: textColor }
            },
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
                backgroundColor: 'rgba(15, 23, 42, 0.9)',
                borderColor: '#334155',
                textStyle: { color: '#f8fafc' },
                formatter: (params: any) => {
                    const item = params[0];
                    const trader = data[item.dataIndex];
                    return `
                        <div class="font-bold border-b border-slate-700 pb-1 mb-1">Broker ${trader.broker}</div>
                        <div class="text-xs">
                            <div>Amount: ${formatCurrency(trader.amount)}</div>
                            <div>Qty: ${formatNumber(trader.qty)}</div>
                        </div>
                    `;
                }
            },
            grid: { left: '3%', right: '4%', bottom: '3%', top: '15%', containLabel: true },
            xAxis: {
                type: 'value',
                splitLine: { lineStyle: { color: splitLineColor } },
                axisLabel: {
                    color: textColor,
                    formatter: (val: number) => val >= 10000000 ? `${(val / 10000000).toFixed(1)}Cr` : val >= 100000 ? `${(val / 100000).toFixed(1)}L` : val,
                    fontSize: 10
                }
            },
            yAxis: {
                type: 'category',
                data: data.map(d => `Br.${d.broker}`),
                axisLabel: { color: textColor, fontSize: 10 },
                axisLine: { lineStyle: { color: splitLineColor } },
                inverse: true
            },
            series: [{
                type: 'bar',
                data: data.map(d => d.amount),
                itemStyle: { color: color, borderRadius: [0, 4, 4, 0] },
                label: {
                    show: true,
                    position: 'right',
                    formatter: (p: any) => formatCurrency(p.value).replace('Rs. ', ''),
                    fontSize: 9,
                    color: textColor
                }
            }]
        };
    };

    return (
        <DashboardLayout title="Floorsheet Analytics">
            <div className="p-4 md:p-6 max-w-[1600px] mx-auto space-y-6">

                {/* Header & Controls */}
                <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                            <Activity className="w-6 h-6 text-blue-600" />
                            Floorsheet Analytics
                        </h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Real-time transaction analysis and broker tracking
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-2 items-center bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        <Filter className="w-4 h-4 text-slate-400 ml-2" />
                        <Input
                            placeholder="Symbol"
                            value={symbol}
                            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                            onKeyDown={(e) => e.key === 'Enter' && updateFilters()}
                            className="w-24 h-9 text-sm bg-transparent border-none focus-visible:ring-0 placeholder:text-slate-400"
                        />
                        <div className="w-px h-6 bg-slate-200 dark:bg-slate-800" />
                        <Input
                            placeholder="Broker"
                            value={broker}
                            onChange={(e) => setBroker(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && updateFilters()}
                            className="w-24 h-9 text-sm bg-transparent border-none focus-visible:ring-0 placeholder:text-slate-400"
                        />
                        <div className="w-px h-6 bg-slate-200 dark:bg-slate-800" />
                        <Input
                            type="date"
                            value={date}
                            onChange={(e) => {
                                setDate(e.target.value);
                                const params = new URLSearchParams(searchParams.toString());
                                params.set('date', e.target.value);
                                if (!e.target.value) params.delete('date');
                                params.set('page', '1'); // Reset page
                                router.push(`/floorsheet?${params.toString()}`);
                            }}
                            className="w-auto h-9 text-sm bg-transparent border-none focus-visible:ring-0"
                        />
                        <Button size="sm" onClick={() => updateFilters(true)}>Search</Button>
                        {(broker || symbol || date) && (
                            <Button size="sm" variant="ghost" onClick={() => router.push('/floorsheet')}>Reset</Button>
                        )}
                    </div>
                </div>

                {loading && !tableLoading ? (
                    <PageLoader />
                ) : (
                    <>
                        {/* Summary Cards */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <Card className="bg-gradient-to-br from-blue-50 to-white dark:from-slate-900 dark:to-slate-900 border-blue-100 dark:border-slate-800">
                                <CardContent className="p-4 flex items-center gap-4">
                                    <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                                        <DollarSign className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-0.5">Total turnover</p>
                                        <p className="text-xl font-black text-slate-900 dark:text-slate-100">{formatCurrency(summary?.total_turnover || 0)}</p>
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="bg-gradient-to-br from-indigo-50 to-white dark:from-slate-900 dark:to-slate-900 border-indigo-100 dark:border-slate-800">
                                <CardContent className="p-4 flex items-center gap-4">
                                    <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                                        <Users className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-0.5">Total volume</p>
                                        <p className="text-xl font-black text-slate-900 dark:text-slate-100">{formatNumber(summary?.total_volume || 0)}</p>
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="bg-gradient-to-br from-emerald-50 to-white dark:from-slate-900 dark:to-slate-900 border-emerald-100 dark:border-slate-800">
                                <CardContent className="p-4 flex items-center gap-4">
                                    <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                                        <Activity className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-0.5">Transactions</p>
                                        <p className="text-xl font-black text-slate-900 dark:text-slate-100">{formatNumber(summary?.total_transactions || 0)}</p>
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
                                <CardContent className="p-4 flex items-center gap-4">
                                    <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg">
                                        <TrendingUp className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-0.5">Average rate</p>
                                        <p className="text-xl font-black text-slate-900 dark:text-slate-100">{formatCurrency(summary?.avg_rate || 0)}</p>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Charts Section */}
                        <div className="grid md:grid-cols-2 gap-6">
                            <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
                                <CardHeader className="pb-2 border-b border-slate-100 dark:border-slate-800/50">
                                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                                        <TrendingUp className="w-4 h-4 text-emerald-500" />
                                        Top Buyers (by Amount)
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="pt-4">
                                    <div className="h-[300px] w-full">
                                        <ReactECharts option={getChartOption(topBuyers, '', '#10b981')} style={{ height: '100%', width: '100%' }} />
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
                                <CardHeader className="pb-2 border-b border-slate-100 dark:border-slate-800/50">
                                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                                        <TrendingDown className="w-4 h-4 text-rose-500" />
                                        Top Sellers (by Amount)
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="pt-4">
                                    <div className="h-[300px] w-full">
                                        <ReactECharts option={getChartOption(topSellers, '', '#f43f5e')} style={{ height: '100%', width: '100%' }} />
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Transaction List */}
                        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
                            <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 dark:border-slate-800/50">
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <Filter className="w-4 h-4 text-slate-400" />
                                    Transaction Log
                                </CardTitle>
                                <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="font-mono">
                                        {formatNumber(totalCount)} records
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                {tableLoading ? (
                                    <PageLoader />
                                ) : transactions.length === 0 ? (
                                    <div className="p-12 text-center text-slate-500 dark:text-slate-400">
                                        No transactions found matching your criteria.
                                    </div>
                                ) : (
                                    <>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm text-left">
                                                <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 text-xs font-bold border-b border-slate-200 dark:border-slate-800">
                                                    <tr>
                                                        <th className="px-6 py-3 whitespace-nowrap">Contract</th>
                                                        <th className="px-6 py-3 whitespace-nowrap">Date</th>
                                                        <th className="px-6 py-3 whitespace-nowrap">Sym</th>
                                                        <th className="px-6 py-3 whitespace-nowrap">Buyer</th>
                                                        <th className="px-6 py-3 whitespace-nowrap">Seller</th>
                                                        <th className="px-6 py-3 text-right whitespace-nowrap">Qty</th>
                                                        <th className="px-6 py-3 text-right whitespace-nowrap">Rate</th>
                                                        <th className="px-6 py-3 text-right whitespace-nowrap">Amount</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                                    {transactions.map((tx, idx) => {
                                                        const isBuyer = broker && String(tx.buyer_id) === String(broker);
                                                        const isSeller = broker && String(tx.seller_id) === String(broker);

                                                        return (
                                                            <tr key={tx.id || idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                                                                <td className="px-6 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">
                                                                    {tx.contract_no}
                                                                </td>
                                                                <td className="px-6 py-3 text-slate-600 dark:text-slate-300 text-xs whitespace-nowrap">
                                                                    {tx.transaction_date}
                                                                </td>
                                                                <td className="px-6 py-3 font-bold text-blue-600 dark:text-blue-400">
                                                                    {tx.symbol}
                                                                </td>
                                                                <td className="px-6 py-3">
                                                                    <Badge variant="outline" className={isBuyer ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800" : "bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300"}>
                                                                        {tx.buyer_id}
                                                                    </Badge>
                                                                </td>
                                                                <td className="px-6 py-3">
                                                                    <Badge variant="outline" className={isSeller ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800" : "bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300"}>
                                                                        {tx.seller_id}
                                                                    </Badge>
                                                                </td>
                                                                <td className="px-6 py-3 text-right font-medium text-slate-900 dark:text-slate-200">
                                                                    {(tx.transaction_quantity || 0).toLocaleString()}
                                                                </td>
                                                                <td className="px-6 py-3 text-right font-mono text-slate-600 dark:text-slate-400">
                                                                    {(tx.transaction_rate || 0).toLocaleString()}
                                                                </td>
                                                                <td className="px-6 py-3 text-right font-bold text-slate-700 dark:text-slate-300">
                                                                    {formatCurrency(tx.transaction_amount || 0)}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>

                                        {/* Pagination Controls */}
                                        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                                            <div className="text-xs text-slate-500 dark:text-slate-400">
                                                Page {page} of {totalPages}
                                            </div>
                                            <div className="flex gap-2">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => handlePageChange(page - 1)}
                                                    disabled={page <= 1}
                                                    className="h-8 w-8 p-0"
                                                >
                                                    <ChevronLeft className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => handlePageChange(page + 1)}
                                                    disabled={page >= totalPages}
                                                    className="h-8 w-8 p-0"
                                                >
                                                    <ChevronRight className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    </>
                )}
            </div>
        </DashboardLayout>
    );
}

export default function FloorsheetPage() {
    return (
        <Suspense fallback={
            <DashboardLayout>
                <PageLoader />
            </DashboardLayout>
        }>
            <FloorsheetContent />
        </Suspense>
    );
}
