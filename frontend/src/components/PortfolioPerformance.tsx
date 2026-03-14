
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import api from '@/lib/api';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp, TrendingDown, Activity, DollarSign, AlertTriangle } from 'lucide-react';
import { PageLoader } from '@/components/ui/StockLoader';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatRupees, formatNepaliNumber } from '@/lib/formatters';

interface PortfolioPerformanceProps {
    accounts: any[];
    selectedAccount: string;
}

interface PerformanceMetrics {
    alpha: number;
    beta: number;
    sharpe_ratio: number;
    total_return: number;
    max_drawdown: number;
    benchmark_return: number;
}

interface ChartDataPoint {
    date: string;
    portfolio_value: number;
    benchmark_value: number | null;
    portfolio_pct: number;
    benchmark_pct: number | null;
}

export function PortfolioPerformance({ accounts, selectedAccount }: PortfolioPerformanceProps) {
    const [period, setPeriod] = useState("1Y");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
    const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
    const [hasBenchmark, setHasBenchmark] = useState(false);

    useEffect(() => {
        const fetchPerformance = async () => {
            setLoading(true);
            setError(null);
            try {
                const response = await api.get('/api/stocks/portfolio-performance/metrics/', {
                    params: {
                        period,
                        account: selectedAccount
                    }
                });

                if (response.data.error) {
                    setError(response.data.error);
                } else {
                    setMetrics(response.data.metrics);
                    setChartData(response.data.chart_data);
                    setHasBenchmark(response.data.has_benchmark);
                }
            } catch (err: any) {
                console.error("Failed to fetch performance data", err);
                const errorMessage = err.response?.data?.detail || err.message || "Failed to load performance data. Please try again.";
                setError(errorMessage);
            } finally {
                setLoading(false);
            }
        };

        fetchPerformance();
    }, [period, selectedAccount]);

    if (loading) {
        return <PageLoader />;
    }

    if (error) {
        return (
            <div className="flex justify-center items-center h-64 text-red-500">
                <AlertTriangle className="mr-2 h-5 w-5" />
                {error}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Portfolio Performance</h2>
                    <p className="text-muted-foreground">
                        Analyze your returns against member benchmarks.
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <Select value={period} onValueChange={setPeriod}>
                        <SelectTrigger className="w-[120px]">
                            <SelectValue placeholder="Period" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="1M">1 Month</SelectItem>
                            <SelectItem value="3M">3 Months</SelectItem>
                            <SelectItem value="6M">6 Months</SelectItem>
                            <SelectItem value="YTD">Year to Date</SelectItem>
                            <SelectItem value="1Y">1 Year</SelectItem>
                            <SelectItem value="ALL">All Time</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Key Metrics Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Return</CardTitle>
                        <DollarSign className={`h-4 w-4 ${metrics && metrics.total_return >= 0 ? "text-green-500" : "text-red-500"}`} />
                    </CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold ${metrics && metrics.total_return >= 0 ? "text-green-600" : "text-red-600"}`}>
                            {metrics?.total_return}%
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {hasBenchmark ? (
                                <>vs Benchmark: <span className={metrics && metrics.benchmark_return >= 0 ? "text-green-500" : "text-red-500"}>{metrics?.benchmark_return}%</span></>
                            ) : "No benchmark data"}
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Alpha (Excess Return)</CardTitle>
                        <Activity className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold ${metrics && metrics.alpha > 0 ? "text-green-600" : "text-red-600"}`}>
                            {metrics?.alpha}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Risk-adjusted outperformance
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Beta (Volatility)</CardTitle>
                        <Activity className="h-4 w-4 text-yellow-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {metrics?.beta}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {metrics && metrics.beta > 1 ? "More volatile than market" : "Less volatile than market"}
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Sharpe Ratio</CardTitle>
                        <TrendingUp className="h-4 w-4 text-purple-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {metrics?.sharpe_ratio}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Return per unit of risk
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Comparison Chart */}
            <Card className="col-span-4">
                <CardHeader>
                    <CardTitle>Portfolio Growth vs Benchmark</CardTitle>
                    <CardDescription>
                        Cumulative return percentage over time.
                    </CardDescription>
                </CardHeader>
                <CardContent className="pl-2">
                    <div className="h-[400px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData}>
                                <defs>
                                    <linearGradient id="colorPortfolio" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8} />
                                        <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorBenchmark" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#82ca9d" stopOpacity={0.8} />
                                        <stop offset="95%" stopColor="#82ca9d" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis
                                    dataKey="date"
                                    tickFormatter={(str) => {
                                        const date = new Date(str);
                                        return `${date.getMonth() + 1}/${date.getDate()}`;
                                    }}
                                    fontSize={12}
                                />
                                <YAxis
                                    tickFormatter={(val) => `${val}%`}
                                    fontSize={12}
                                />
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <Tooltip
                                    formatter={(value: any) => [`${Number(value).toFixed(2)}%`, 'Return']}
                                    labelFormatter={(label) => new Date(label).toLocaleDateString()}
                                />
                                <Legend />
                                <Area
                                    type="monotone"
                                    dataKey="portfolio_pct"
                                    name="Portfolio"
                                    stroke="#8884d8"
                                    fillOpacity={1}
                                    fill="url(#colorPortfolio)"
                                />
                                {hasBenchmark && (
                                    <Area
                                        type="monotone"
                                        dataKey="benchmark_pct"
                                        name="NEPSE Index"
                                        stroke="#82ca9d"
                                        fillOpacity={1}
                                        fill="url(#colorBenchmark)"
                                    />
                                )}
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
