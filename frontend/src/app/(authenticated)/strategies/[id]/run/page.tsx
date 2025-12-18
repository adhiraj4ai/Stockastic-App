'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { useRouter, useParams } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Play, ArrowLeft, Calendar, FileText, TrendingUp, Activity } from 'lucide-react';
import { toast } from 'sonner';

interface Strategy {
    id: number;
    name: string;
    description: string;
    code: string;
}

export default function RunStrategyPage() {
    const router = useRouter();
    const params = useParams();
    const strategyId = params.id;

    const [strategy, setStrategy] = useState<Strategy | null>(null);
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState(false);
    const [results, setResults] = useState<any>(null);

    // Param State
    const [symbol, setSymbol] = useState('NABIL');
    const [startDate, setStartDate] = useState('2023-01-01');
    const [endDate, setEndDate] = useState('2023-12-31');

    useEffect(() => {
        if (strategyId) {
            fetchStrategy();
        }
    }, [strategyId]);

    const fetchStrategy = async () => {
        try {
            const token = localStorage.getItem('access_token');
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            const response = await axios.get(`${apiUrl}/api/stocks/strategies/${strategyId}/`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setStrategy(response.data);
        } catch (error: any) {
            if (error.response?.status === 401) {
                window.location.href = '/login';
                return;
            }
            toast.error('Failed to load strategy');
        } finally {
            setLoading(false);
        }
    };

    const handleRun = async () => {
        if (!strategy) return;
        setRunning(true);
        setResults(null);
        try {
            const token = localStorage.getItem('access_token');
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            // We use the SAVED code from the backend strategy object, NOT local editor state
            // because we are on a separate page.
            const response = await axios.post(`${apiUrl}/api/stocks/strategies/backtest/`,
                { code: strategy.code, symbol, start_date: startDate, end_date: endDate },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setResults(response.data);
            toast.success('Backtest complete');
        } catch (error: any) {
            console.error('Backtest failed', error);
            toast.error(error.response?.data?.error || 'Backtest failed');
        } finally {
            setRunning(false);
        }
    };

    if (loading) return <DashboardLayout><div>Loading...</div></DashboardLayout>;

    return (
        <DashboardLayout>
            <div className="flex flex-col h-[calc(100vh-64px)]">
                {/* Header */}
                <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => router.push('/strategies')}
                        >
                            <ArrowLeft size={20} />
                        </Button>
                        <div>
                            <h1 className="text-xl font-bold text-gray-900">{strategy?.name || 'Strategy Backtest'}</h1>
                            <p className="text-sm text-gray-500">Backtest Configuration & Results</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button variant="outline" onClick={() => router.push(`/strategies/${strategyId}/edit`)}>
                            Edit Strategy Only
                        </Button>
                        <Button onClick={handleRun} disabled={running} className="bg-blue-600 hover:bg-blue-700">
                            {running ? 'Running...' : <><Play size={16} className="mr-2" /> Run Backtest</>}
                        </Button>
                    </div>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Sidebar: Config */}
                    <div className="w-80 bg-gray-50 border-r border-gray-200 p-6 overflow-y-auto">
                        <h3 className="font-bold text-gray-900 mb-6 uppercase tracking-wider text-sm flex items-center gap-2">
                            <Activity size={16} /> Configuration
                        </h3>

                        <div className="space-y-6">
                            <div className="space-y-2">
                                <Label>Ticker Symbol</Label>
                                <Input value={symbol} onChange={(e) => setSymbol(e.target.value)} className="bg-white" />
                            </div>

                            <div className="space-y-2">
                                <Label>Start Date</Label>
                                <div className="relative">
                                    <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-white pl-10" />
                                    <Calendar className="absolute left-3 top-2.5 text-gray-400" size={16} />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>End Date</Label>
                                <div className="relative">
                                    <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="bg-white pl-10" />
                                    <Calendar className="absolute left-3 top-2.5 text-gray-400" size={16} />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Main Content: Results */}
                    <div className="flex-1 bg-gray-50/50 p-6 overflow-y-auto">
                        {results ? (
                            <div className="max-w-5xl mx-auto space-y-6">
                                {/* KPI Cards */}
                                <div className="grid grid-cols-4 gap-4">
                                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                                        <div className="text-sm text-gray-500 mb-1">Total PnL</div>
                                        <div className={`text-2xl font-bold ${results.stats.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            {results.stats.total_pnl.toLocaleString('en-US', { style: 'currency', currency: 'NPR' })}
                                        </div>
                                    </div>
                                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                                        <div className="text-sm text-gray-500 mb-1">Win Rate</div>
                                        <div className="text-2xl font-bold text-gray-900">
                                            {results.stats.win_rate.toFixed(1)}%
                                        </div>
                                    </div>
                                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                                        <div className="text-sm text-gray-500 mb-1">Total Trades</div>
                                        <div className="text-2xl font-bold text-gray-900">
                                            {results.stats.total_trades}
                                        </div>
                                    </div>
                                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                                        <div className="text-sm text-gray-500 mb-1">Return %</div>
                                        <div className={`text-2xl font-bold ${results.stats.pnl_percent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            {results.stats.pnl_percent.toFixed(2)}%
                                        </div>
                                    </div>
                                </div>

                                {/* Equity Curve Placeholder - Can use Recharts later */}
                                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                                    <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                                        <TrendingUp size={18} /> Equity Curve
                                    </h3>
                                    <div className="h-64 flex items-center justify-center bg-gray-50 rounded border border-dashed border-gray-300 text-gray-400">
                                        Chart Visualization Coming Soon
                                    </div>
                                </div>

                                {/* Trade Log */}
                                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                                    <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                                        <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                            <FileText size={18} /> Trade Log
                                        </h3>
                                    </div>
                                    <div className="divide-y divide-gray-100">
                                        {results.trades.slice().reverse().map((trade: any, idx: number) => (
                                            <div key={idx} className="px-6 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors">
                                                <div className="flex items-center gap-4">
                                                    <span className={`px-2 py-1 rounded text-xs font-bold w-16 text-center ${trade.type === 'BUY' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                                                        {trade.type}
                                                    </span>
                                                    <span className="text-sm text-gray-600 font-mono">{trade.date}</span>
                                                </div>
                                                <div className="text-right flex items-center gap-8">
                                                    <div className="text-sm">
                                                        <span className="text-gray-500 mr-2">Price:</span>
                                                        <span className="font-medium">{trade.price}</span>
                                                    </div>
                                                    <div className="text-sm w-24 text-right">
                                                        {trade.pnl !== undefined ? (
                                                            <span className={`font-bold ${trade.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                                {trade.pnl > 0 ? '+' : ''}{trade.pnl.toFixed(0)}
                                                            </span>
                                                        ) : (
                                                            <span className="text-gray-400">-</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-gray-400">
                                <Activity size={48} className="mb-4 opacity-20" />
                                <p className="text-lg font-medium">Ready to Backtest</p>
                                <p className="text-sm">Configure parameters and click "Run Backtest" to begin.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
