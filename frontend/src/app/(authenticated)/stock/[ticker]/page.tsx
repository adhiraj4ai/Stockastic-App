'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, TrendingUp, TrendingDown, DollarSign, Activity, BarChart2 } from 'lucide-react';
import ReactECharts from 'echarts-for-react';
import TransactionModal from '@/components/TransactionModal';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import StockLink from '@/components/StockLink';

interface StockDetailData {
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
    const [dividends, setDividends] = useState<any[]>([]);
    const [financials, setFinancials] = useState<any[]>([]);
    const [history, setHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [txnType, setTxnType] = useState('BUY');
    const [error, setError] = useState<string | null>(null);
    const [accounts, setAccounts] = useState<any[]>([]);

    useEffect(() => {
        const fetchAccounts = async () => {
            try {
                const token = localStorage.getItem('access_token');
                if (!token) return;
                const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
                const response = await axios.get(`${apiUrl}/api/stocks/accounts/`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
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
                const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

                // Fetch Details
                const detailRes = await axios.get(`${apiUrl}/api/stocks/details/${ticker}/`);
                if (!detailRes.data || (!detailRes.data.fundamental && !detailRes.data.price)) {
                    // If data is empty structure, treat as not found or loading?
                    // Let's assume valid data structure return.
                }
                setData(detailRes.data);

                // Fetch History for Chart
                try {
                    const historyRes = await axios.get(`${apiUrl}/api/stocks/history/${ticker}/`);
                    setHistory(historyRes.data);
                } catch (hErr) { console.error("History fetch failed", hErr); }

                // Fetch Floorsheet
                try {
                    const floorRes = await axios.get(`${apiUrl}/api/stocks/floorsheet/${ticker}/`);
                    setFloorsheet(floorRes.data);
                } catch (fErr) { console.error("Floorsheet fetch failed", fErr); }

                // Fetch Dividends
                try {
                    const divRes = await axios.get(`${apiUrl}/api/stocks/dividends/${ticker}/`);
                    setDividends(divRes.data);
                } catch (dErr) { console.error("Dividends fetch failed", dErr); }

                // Fetch Financials
                try {
                    const finRes = await axios.get(`${apiUrl}/api/stocks/financials/${ticker}/`);
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
        <DashboardLayout>
            <div className="space-y-6 animate-in fade-in duration-500">
                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="flex items-center gap-4">
                        <Button variant="outline" size="icon" onClick={() => router.back()}>
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <div>
                            <h1 className="text-3xl font-bold flex items-center gap-2">
                                {data.fundamental?.ticker || ticker}
                                <span className="text-sm font-normal text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                                    {data.fundamental?.sector || 'Unknown Sector'}
                                </span>
                            </h1>
                            <p className="text-gray-500">{data.fundamental?.company_name}</p>
                        </div>
                    </div>

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
                                            {dividends.map((div, i) => (
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
                            <CardHeader>
                                <CardTitle>Financial Reports</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="rounded-md border overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-gray-50 text-gray-700 font-medium border-b">
                                            <tr>
                                                <th className="px-4 py-3">Fiscal Year</th>
                                                <th className="px-4 py-3">Quarter</th>
                                                <th className="px-4 py-3 text-right">Revenue</th>
                                                <th className="px-4 py-3 text-right">Net Profit</th>
                                                <th className="px-4 py-3 text-right">EPS</th>
                                                <th className="px-4 py-3 text-right">PE Ratio</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {financials.map((fin, i) => (
                                                <tr key={i} className="hover:bg-gray-50">
                                                    <td className="px-4 py-3">{fin.fiscal_year}</td>
                                                    <td className="px-4 py-3">Q{fin.quarter}</td>
                                                    <td className="px-4 py-3 text-right">{fin.revenue ? Math.round(fin.revenue).toLocaleString() : '-'}</td>
                                                    <td className="px-4 py-3 text-right font-medium">{fin.net_profit ? Math.round(fin.net_profit).toLocaleString() : '-'}</td>
                                                    <td className="px-4 py-3 text-right">{fin.eps}</td>
                                                    <td className="px-4 py-3 text-right">{fin.pe_ratio}</td>
                                                </tr>
                                            ))}
                                            {financials.length === 0 && (
                                                <tr><td colSpan={6} className="px-4 py-3 text-center text-gray-500">No financial reports found.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
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
