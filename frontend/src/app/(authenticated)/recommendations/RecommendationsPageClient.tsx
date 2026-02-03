'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { Target, Filter, TrendingUp, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import DashboardLayout from '@/components/DashboardLayout';
import { Card } from '@/components/ui/card';

import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

interface Recommendation {
    symbol: string;
    signal: 'BUY' | 'SELL';
    strength: number;
    reason: string;
    close: number;
    date: string;
}

const SECTORS = [
    "All", "Commercial Banks", "Corporate Debentures", "Development Banks", "Finance",
    "Hydro Power", "Investment", "Life Insurance", "Manufacturing And Processing",
    "Microfinance", "Mutual Fund", "Non Life Insurance", "Others", "Preferential Shares",
    "Promoter Share", "Tradings"
];

const STRATEGIES = [
    { id: 'smart_cross', name: 'Smart Crossover (RSI + MACD)' },
    { id: 'ema_cross', name: 'EMA Golden/Death Cross' },
    { id: 'ichimoku', name: 'Ichimoku Cloud Breakout' },
    { id: 'mean_reversion', name: 'Mean Reversion (Bollinger Bands)' },
    { id: 'stochastic', name: 'Stochastic Oscillator (Momentum)' },
    { id: 'volume_breakout', name: 'Volume Breakout (High Activity)' },
    { id: 'supertrend', name: 'Volatility Breakout (Keltner/ATR)' },
    { id: 'candlestick_engulfing', name: 'Candlestick Pattern (Engulfing)' },
];

export default function RecommendationsPage() {
    const router = useRouter();

    // Current Signals State
    const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
    const [loadingRecs, setLoadingRecs] = useState(false);
    const [recStrategy, setRecStrategy] = useState('smart_cross');
    const [recSector, setRecSector] = useState('All');

    const fetchRecommendations = async () => {
        setLoadingRecs(true);
        setRecommendations([]);
        try {
            const response = await api.get('/api/stocks/companies/recommendations/', {
                params: { strategy: recStrategy, sector: recSector }
            });
            const data = response.data.results || response.data;
            setRecommendations(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error("Failed to fetch recommendations", error);
        } finally {
            setLoadingRecs(false);
        }
    };

    useEffect(() => {
        fetchRecommendations();
    }, []);

    useEffect(() => {
        fetchRecommendations();
    }, [recStrategy, recSector]);

    return (
        <DashboardLayout
            title="Market Recommendations"
            subtitle="AI-driven market signals from current data"
        >
            <div className="space-y-6">
                <Card className="border-none shadow-sm bg-white/50 backdrop-blur-sm">
                    <div className="p-4 flex flex-col md:flex-row gap-4 items-end md:items-center justify-between border-b border-gray-100">
                        <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
                            <div className="space-y-1.5 min-w-[200px]">
                                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                                    <Target size={12} /> Strategy Model
                                </label>
                                <select
                                    value={recStrategy}
                                    onChange={(e) => setRecStrategy(e.target.value)}
                                    className="w-full h-9 rounded-md border border-gray-200 bg-white px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus:border-blue-500"
                                >
                                    {STRATEGIES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1.5 min-w-[200px]">
                                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                                    <Filter size={12} /> Sector
                                </label>
                                <select
                                    value={recSector}
                                    onChange={(e) => setRecSector(e.target.value)}
                                    className="w-full h-9 rounded-md border border-gray-200 bg-white px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus:border-blue-500"
                                >
                                    {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                        </div>
                        <Button variant="outline" size="sm" onClick={fetchRecommendations} disabled={loadingRecs}>
                            {loadingRecs ? 'Scanning...' : 'Refresh Scan'}
                        </Button>
                    </div>

                    <div className="p-0">
                        {loadingRecs ? (
                            <div className="flex flex-col items-center justify-center py-20 text-gray-500 animate-pulse">
                                <Target size={48} className="text-gray-200 mb-4" />
                                <p>Scanning market data for valid signals...</p>
                            </div>
                        ) : recommendations.length === 0 ? (
                            <div className="text-center py-20 text-gray-500">
                                <p>No signals found matching criteria.</p>
                                <p className="text-xs mt-1">Try changing the strategy or checking back later.</p>
                            </div>
                        ) : (
                            <Table>
                                <TableHeader className="bg-gray-50/50">
                                    <TableRow>
                                        <TableHead>Symbol</TableHead>
                                        <TableHead>Signal</TableHead>
                                        <TableHead>Strength</TableHead>
                                        <TableHead>Price</TableHead>
                                        <TableHead className="w-[40%]">Reason</TableHead>
                                        <TableHead className="text-right">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {recommendations.map((rec) => (
                                        <TableRow key={rec.symbol} className="hover:bg-gray-50/50">
                                            <TableCell className="font-medium text-gray-900">{rec.symbol}</TableCell>
                                            <TableCell>
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${rec.signal === 'BUY'
                                                    ? 'bg-green-50 text-green-700 border-green-200'
                                                    : 'bg-red-50 text-red-700 border-red-200'
                                                    }`}>
                                                    {rec.signal === 'BUY' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                                    {rec.signal}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <div className="h-1.5 w-16 bg-gray-100 rounded-full overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full ${rec.signal === 'BUY' ? 'bg-green-500' : 'bg-red-500'}`}
                                                            style={{ width: `${rec.strength}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-xs font-medium text-gray-600">{rec.strength}%</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="font-mono text-gray-700">Rs. {rec.close.toLocaleString()}</TableCell>
                                            <TableCell className="text-sm text-gray-500">{rec.reason}</TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-blue-600 hover:text-blue-700"
                                                    onClick={() => router.push(`/stock/${rec.symbol}`)}
                                                >
                                                    View Chart
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </div>
                </Card>
            </div>
        </DashboardLayout>
    );
}
