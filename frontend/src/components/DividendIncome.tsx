import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import api from '@/lib/api';
import { Loader2, DollarSign, TrendingUp, Gift, Calendar, AlertCircle } from 'lucide-react';

interface DividendItem {
    id: number;
    ticker: string;
    fiscal_year: string;
    book_close_date: string;
    shares_held: number;
    cash_dividend_gross: number;
    tax: number;
    cash_dividend_net: number;
    bonus_shares: number;
    bonus_percent: number;
    cash_percent: number;
    type: 'Received' | 'Upcoming';
}

interface DividendSummary {
    total_cash_net: number;
    total_bonus_shares: number;
    yield_on_cost: number;
    current_invested: number;
}

export function DividendIncome() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [summary, setSummary] = useState<DividendSummary | null>(null);
    const [history, setHistory] = useState<DividendItem[]>([]);
    const [upcoming, setUpcoming] = useState<DividendItem[]>([]);

    useEffect(() => {
        const fetchDividends = async () => {
            setLoading(true);
            try {
                const response = await api.get('/api/stocks/portfolio/dividends/summary/');
                setSummary(response.data.summary);
                setHistory(response.data.history);
                setUpcoming(response.data.upcoming);
            } catch (err: any) {
                console.error("Failed to fetch dividend data", err);
                setError(err.response?.data?.detail || "Failed to load dividend data.");
            } finally {
                setLoading(false);
            }
        };

        fetchDividends();
    }, []);

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-center p-4">
                <AlertCircle className="h-10 w-10 text-red-500 mb-2" />
                <p className="text-red-500 font-medium">{error}</p>
                <p className="text-sm text-gray-500 mt-1">Please try again later.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-900/10 border-emerald-200 dark:border-emerald-800">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-emerald-800 dark:text-emerald-400 flex items-center gap-2">
                            <DollarSign className="h-4 w-4" /> Total Cash Income (Net)
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-emerald-900 dark:text-emerald-300">
                            Rs. {summary?.total_cash_net.toLocaleString()}
                        </div>
                        <p className="text-xs text-emerald-700 dark:text-emerald-500 mt-1">
                            Realized cash dividends after tax
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-900/10 border-blue-200 dark:border-blue-800">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-blue-800 dark:text-blue-400 flex items-center gap-2">
                            <TrendingUp className="h-4 w-4" /> Yield on Cost
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-blue-900 dark:text-blue-300">
                            {summary?.yield_on_cost.toFixed(2)}%
                        </div>
                        <p className="text-xs text-blue-700 dark:text-blue-500 mt-1">
                            Lifetime yield based on current invested capital
                        </p>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-900/10 border-purple-200 dark:border-purple-800">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-purple-800 dark:text-purple-400 flex items-center gap-2">
                            <Gift className="h-4 w-4" /> Total Bonus Shares
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-purple-900 dark:text-purple-300">
                            {summary?.total_bonus_shares.toLocaleString()} units
                        </div>
                        <p className="text-xs text-purple-700 dark:text-purple-500 mt-1">
                            Accumulated via Stock Dividends
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Tabs defaultValue="history" className="w-full">
                <TabsList className="grid w-full grid-cols-2 lg:w-[400px]">
                    <TabsTrigger value="history">Dividend History</TabsTrigger>
                    <TabsTrigger value="upcoming">Upcoming & Projected</TabsTrigger>
                </TabsList>

                <TabsContent value="history" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Received Dividends</CardTitle>
                            <CardDescription>Historical record of cash and bonus shares credited to your account.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {history.length === 0 ? (
                                <div className="text-center py-8 text-gray-500">No dividend history found.</div>
                            ) : (
                                <DividendTable data={history} />
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="upcoming" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5 text-orange-500" /> Upcoming Dividends</CardTitle>
                            <CardDescription>Dividends announced with future book closure dates. Ensure you hold shares before the book close date to be eligible.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {upcoming.length === 0 ? (
                                <div className="text-center py-8 text-gray-500">No upcoming dividends found.</div>
                            ) : (
                                <DividendTable data={upcoming} isUpcoming={true} />
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}

function DividendTable({ data, isUpcoming = false }: { data: DividendItem[], isUpcoming?: boolean }) {
    return (
        <div className="rounded-md border border-gray-200 dark:border-gray-800 overflow-hidden">
            <Table>
                <TableHeader className="bg-gray-50 dark:bg-gray-900/50">
                    <TableRow>
                        <TableHead className="w-[100px]">Date</TableHead>
                        <TableHead>Ticker</TableHead>
                        <TableHead>Fiscal Year</TableHead>
                        <TableHead className="text-right">Shares Held</TableHead>
                        <TableHead className="text-right bg-emerald-50/50 dark:bg-emerald-900/10">Cash (Net)</TableHead>
                        <TableHead className="text-right bg-purple-50/50 dark:bg-purple-900/10">Bonus Shares</TableHead>
                        <TableHead className="text-right">Total %</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.map((item) => (
                        <TableRow key={item.id}>
                            <TableCell className="font-medium">
                                <span className="whitespace-nowrap">{item.book_close_date}</span>
                                {isUpcoming && (
                                    <Badge variant="outline" className="ml-2 text-[10px] bg-orange-100 text-orange-800 border-orange-200">
                                        Book Close
                                    </Badge>
                                )}
                            </TableCell>
                            <TableCell className="font-bold">{item.ticker}</TableCell>
                            <TableCell className="text-xs text-gray-500">{item.fiscal_year}</TableCell>
                            <TableCell className="text-right font-mono">{item.shares_held}</TableCell>
                            <TableCell className="text-right font-mono text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50/30 dark:bg-emerald-900/5">
                                {item.cash_dividend_net > 0 ? `+${item.cash_dividend_net.toLocaleString()}` : '-'}
                            </TableCell>
                            <TableCell className="text-right font-mono text-purple-600 dark:text-purple-400 font-bold bg-purple-50/30 dark:bg-purple-900/5">
                                {item.bonus_shares > 0 ? `+${item.bonus_shares}` : '-'}
                            </TableCell>
                            <TableCell className="text-right text-xs">
                                <div className="flex flex-col items-end">
                                    <span className="font-bold">{(item.bonus_percent + item.cash_percent).toFixed(2)}%</span>
                                    <span className="text-[10px] text-gray-400">
                                        (C: {item.cash_percent}% B: {item.bonus_percent}%)
                                    </span>
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}
