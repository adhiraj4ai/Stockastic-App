'use client';

import { useState, useEffect, Suspense } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';
import { Loader2, Zap, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface SmartMoneyLeaderboardItem {
    broker_id: number;
    score: number;
    rank: string;
}

interface WhaleSignal {
    broker_id: number;
    symbol: string;
    avg_buy_price: number;
    ltp: number;
    qty: number;
    amount: number;
    date: string;
}

interface SmartMoneyData {
    leaderboard?: SmartMoneyLeaderboardItem[];
    signals?: WhaleSignal[];
}

function SmartMoneyContent() {
    // Data State
    const [smartMoneyData, setSmartMoneyData] = useState<SmartMoneyData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get('/api/stocks/floorsheet/smart_money/');

            // Validate response data structure
            if (res.data && (Array.isArray(res.data.leaderboard) || Array.isArray(res.data.signals))) {
                setSmartMoneyData(res.data);
            } else {
                // Handle unexpected structure or empty object
                console.warn("Unexpected API response structure:", res.data);
                setSmartMoneyData({ leaderboard: [], signals: [] });
            }
        } catch (err: any) {
            console.error("Failed to fetch smart money data", err);
            setError(err.message || "Failed to load Smart Money data. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const formatCurrency = (val: number) => {
        if (val === undefined || val === null) return 'Rs. 0';
        return new Intl.NumberFormat('en-NP', { style: 'currency', currency: 'NPR', maximumFractionDigits: 0 }).format(val).replace('NPR', 'Rs.');
    };

    return (
        <DashboardLayout title="Smart Money Tracker">
            <div className="p-4 md:p-6 max-w-[1600px] mx-auto space-y-6">

                {/* Header */}
                <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                            <Crown className="w-6 h-6 text-amber-500" />
                            Smart Money Tracker
                        </h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Track institutional "Smart Money" flows and high-conviction whale activity.
                        </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
                        Refresh Data
                    </Button>
                </div>

                {error && (
                    <Alert variant="destructive">
                        <AlertTitle>Error</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                {loading ? (
                    <div className="h-96 flex flex-col items-center justify-center gap-4">
                        <Loader2 className="w-10 h-10 animate-spin text-amber-500" />
                        <p className="text-sm text-slate-500 animate-pulse">Analyzing broker performance and order flow...</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Leaderboard */}
                        <Card className="lg:col-span-1 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm h-fit">
                            <CardHeader className="pb-4 border-b border-slate-100 dark:border-slate-800">
                                <CardTitle className="text-lg flex items-center gap-2 text-amber-600 dark:text-amber-400">
                                    <Crown size={20} className="fill-current" />
                                    Smart Broker Leaderboard
                                </CardTitle>
                                <CardDescription>
                                    Brokers with highest historical win-rate (buying before rallies).
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {smartMoneyData?.leaderboard?.length === 0 ? (
                                        <div className="p-8 text-center text-slate-500 text-sm">No leaderboard data available.</div>
                                    ) : (
                                        smartMoneyData?.leaderboard?.map((broker, idx) => (
                                            <div key={broker.broker_id} className="p-4 flex items-center justify-between hover:bg-amber-50/50 dark:hover:bg-amber-900/10 transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <div className={`
                                                    w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm
                                                    ${idx === 0 ? 'bg-yellow-100 text-yellow-700' :
                                                            idx === 1 ? 'bg-slate-100 text-slate-700' :
                                                                idx === 2 ? 'bg-orange-100 text-orange-700' : 'bg-slate-50 text-slate-500'}
                                                `}>
                                                        {idx + 1}
                                                    </div>
                                                    <div>
                                                        <div className="font-bold text-slate-900 dark:text-slate-100">Broker {broker.broker_id}</div>
                                                        <div className="text-xs text-slate-500">{broker.rank} Tier</div>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-sm font-bold text-amber-600">{broker.score} pts</div>
                                                </div>
                                            </div>
                                        )))}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Whale Signals */}
                        <Card className="lg:col-span-2 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
                            <CardHeader className="pb-4 border-b border-slate-100 dark:border-slate-800">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle className="text-lg flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                                            <Zap size={20} className="fill-current" />
                                            Active Whale Signals
                                        </CardTitle>
                                        <CardDescription>
                                            What the smart brokers are accumulating right now (Last 3 Days).
                                        </CardDescription>
                                    </div>
                                    {smartMoneyData?.signals && smartMoneyData.signals.length > 0 && (
                                        <Badge variant="secondary" className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100">
                                            Updated: {smartMoneyData.signals[0].date || 'Today'}
                                        </Badge>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 uppercase text-xs font-bold border-b border-slate-200 dark:border-slate-800">
                                            <tr>
                                                <th className="px-6 py-4">Smart Broker</th>
                                                <th className="px-6 py-4">Accumulating</th>
                                                <th className="px-6 py-4 text-right">Qty</th>
                                                <th className="px-6 py-4 text-right">Avg Price</th>
                                                <th className="px-6 py-4 text-right">LTP</th>
                                                <th className="px-6 py-4 text-right">Est. Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                            {smartMoneyData?.signals?.length === 0 ? (
                                                <tr>
                                                    <td colSpan={6} className="p-8 text-center text-slate-500 text-sm">
                                                        No significant whale signals detected recently.
                                                    </td>
                                                </tr>
                                            ) : (
                                                smartMoneyData?.signals?.map((signal, idx) => (
                                                    <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                                                        <td className="px-6 py-4">
                                                            <div className="flex items-center gap-2">
                                                                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                                                                    Broker {signal.broker_id}
                                                                </Badge>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <span className="font-bold text-blue-600 dark:text-blue-400">{signal.symbol}</span>
                                                        </td>
                                                        <td className="px-6 py-4 text-right font-medium">
                                                            {signal.qty.toLocaleString()}
                                                        </td>
                                                        <td className="px-6 py-4 text-right font-mono text-slate-500">
                                                            {formatCurrency(signal.avg_buy_price)}
                                                        </td>
                                                        <td className="px-6 py-4 text-right font-mono font-semibold text-slate-900 dark:text-slate-100">
                                                            {formatCurrency(signal.ltp)}
                                                        </td>
                                                        <td className="px-6 py-4 text-right font-bold text-emerald-600">
                                                            {formatCurrency(signal.amount)}
                                                        </td>
                                                    </tr>
                                                )))}
                                        </tbody>
                                    </table>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}

export default function SmartMoneyPage() {
    return (
        <Suspense fallback={
            <DashboardLayout>
                <div className="flex h-[80vh] items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
                </div>
            </DashboardLayout>
        }>
            <SmartMoneyContent />
        </Suspense>
    );
}
