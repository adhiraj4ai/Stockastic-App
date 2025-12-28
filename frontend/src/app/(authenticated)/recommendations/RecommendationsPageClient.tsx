'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { Target, Filter, TrendingUp, TrendingDown, Brain, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import DashboardLayout from '@/components/DashboardLayout';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

    // Forecast Signals State
    const [forecastSignals, setForecastSignals] = useState<any[]>([]);
    const [loadingForecast, setLoadingForecast] = useState(false);

    // Model Performance State
    const [models, setModels] = useState<any[]>([]);
    const [loadingModels, setLoadingModels] = useState(false);

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

    const fetchForecastSignals = async () => {
        setLoadingForecast(true);
        try {
            const response = await api.get('/api/ml/recommendations/');
            const data = response.data.results || response.data;
            setForecastSignals(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error("Failed to fetch forecast signals", error);
        } finally {
            setLoadingForecast(false);
        }
    };

    const fetchModels = async () => {
        setLoadingModels(true);
        try {
            const response = await api.get('/api/ml/forecasts/');
            // Handle paginated response
            const modelsData = response.data.results || response.data;
            setModels(Array.isArray(modelsData) ? modelsData : []);
        } catch (error) {
            console.error("Failed to fetch models", error);
        } finally {
            setLoadingModels(false);
        }
    };

    useEffect(() => {
        fetchRecommendations();
        fetchForecastSignals();
        fetchModels();
    }, []);

    useEffect(() => {
        fetchRecommendations();
    }, [recStrategy, recSector]);

    return (
        <DashboardLayout>
            <div className="space-y-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Market Recommendations</h1>
                    <p className="text-gray-500 text-sm mt-1">
                        AI-driven market signals from current data and ML forecasts
                    </p>
                </div>

                <Tabs defaultValue="current" className="w-full">
                    <TabsList className="grid w-full grid-cols-3 mb-6">
                        <TabsTrigger value="current" className="flex items-center gap-2">
                            <Target className="w-4 h-4" />
                            Current Signals
                        </TabsTrigger>
                        <TabsTrigger value="forecast" className="flex items-center gap-2">
                            <Brain className="w-4 h-4" />
                            Forecast-Based Signals
                        </TabsTrigger>
                        <TabsTrigger value="performance" className="flex items-center gap-2">
                            <TrendingUp className="w-4 h-4" />
                            Model Performance
                        </TabsTrigger>
                    </TabsList>

                    {/* Current Signals Tab */}
                    <TabsContent value="current">
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
                    </TabsContent>

                    {/* Forecast-Based Signals Tab */}
                    <TabsContent value="forecast">
                        <Card className="border-none shadow-sm bg-white/50 backdrop-blur-sm">
                            <div className="p-4 flex items-center justify-between border-b border-gray-100">
                                <div>
                                    <h3 className="font-semibold text-gray-900">Forecast-Based Signals</h3>
                                    <p className="text-sm text-gray-500 mt-0.5">Strategy signals from ML-predicted price data</p>
                                </div>
                                <Button variant="outline" size="sm" onClick={fetchForecastSignals} disabled={loadingForecast}>
                                    {loadingForecast ? 'Loading...' : 'Refresh'}
                                </Button>
                            </div>

                            <div className="p-0">
                                {loadingForecast ? (
                                    <div className="flex flex-col items-center justify-center py-20 text-gray-500 animate-pulse">
                                        <Brain size={48} className="text-gray-200 mb-4" />
                                        <p>Loading forecast-based signals...</p>
                                    </div>
                                ) : forecastSignals.length === 0 ? (
                                    <div className="text-center py-20 text-gray-500">
                                        <Brain size={48} className="text-gray-300 mx-auto mb-4" />
                                        <p className="font-medium">No forecast signals available</p>
                                        <p className="text-xs mt-1">Train models and generate forecasts first</p>
                                        <Button className="mt-4" onClick={() => router.push('/forecasts')}>
                                            Go to Forecasts
                                        </Button>
                                    </div>
                                ) : (
                                    <Table>
                                        <TableHeader className="bg-gray-50/50">
                                            <TableRow>
                                                <TableHead>Symbol</TableHead>
                                                <TableHead>Strategy</TableHead>
                                                <TableHead>Signal</TableHead>
                                                <TableHead>Entry Date</TableHead>
                                                <TableHead>Entry Price</TableHead>
                                                <TableHead>Exit Date</TableHead>
                                                <TableHead>Expected Return</TableHead>
                                                <TableHead>Confidence</TableHead>
                                                <TableHead className="text-right">Action</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {forecastSignals.map((signal: any, idx: number) => (
                                                <TableRow key={idx} className="hover:bg-gray-50/50">
                                                    <TableCell className="font-medium text-gray-900">{signal.symbol}</TableCell>
                                                    <TableCell className="text-sm">{signal.strategy_name}</TableCell>
                                                    <TableCell>
                                                        <Badge className={signal.signal_type === 'BUY' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-100 text-red-700 border-red-200'}>
                                                            {signal.signal_type}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-sm">
                                                        <div className="flex items-center gap-1 text-gray-600">
                                                            <Calendar className="w-3 h-3" />
                                                            {signal.entry_date ? new Date(signal.entry_date).toLocaleDateString() : 'N/A'}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="font-mono text-sm">Rs. {signal.entry_price?.toFixed(2)}</TableCell>
                                                    <TableCell className="text-sm">
                                                        {signal.exit_date ? new Date(signal.exit_date).toLocaleDateString() : 'N/A'}
                                                    </TableCell>
                                                    <TableCell>
                                                        <span className={`font-semibold ${signal.expected_return_pct > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                            {signal.expected_return_pct?.toFixed(2)}%
                                                        </span>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-2">
                                                            <div className="h-1.5 w-16 bg-gray-100 rounded-full overflow-hidden">
                                                                <div
                                                                    className="h-full rounded-full bg-purple-500"
                                                                    style={{ width: `${(signal.confidence_score * 100)}%` }}
                                                                />
                                                            </div>
                                                            <span className="text-xs font-medium text-gray-600">
                                                                {(signal.confidence_score * 100).toFixed(0)}%
                                                            </span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="text-purple-600 hover:text-purple-700"
                                                            onClick={() => router.push(`/forecasts/${signal.symbol}`)}
                                                        >
                                                            View Forecast
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                )}
                            </div>
                        </Card>
                    </TabsContent>

                    {/* Model Performance Tab */}
                    <TabsContent value="performance">
                        <Card className="border-none shadow-sm bg-white/50 backdrop-blur-sm">
                            <div className="p-4 flex items-center justify-between border-b border-gray-100">
                                <div>
                                    <h3 className="font-semibold text-gray-900">Model Performance Comparison</h3>
                                    <p className="text-sm text-gray-500 mt-0.5">Accuracy metrics for all trained forecasting models</p>
                                </div>
                                <Button variant="outline" size="sm" onClick={fetchModels} disabled={loadingModels}>
                                    {loadingModels ? 'Loading...' : 'Refresh'}
                                </Button>
                            </div>

                            <div className="p-0">
                                {loadingModels ? (
                                    <div className="flex flex-col items-center justify-center py-20 text-gray-500 animate-pulse">
                                        <Brain size={48} className="text-gray-200 mb-4" />
                                        <p>Loading model performance data...</p>
                                    </div>
                                ) : models.length === 0 ? (
                                    <div className="text-center py-20 text-gray-500">
                                        <Brain size={48} className="text-gray-300 mx-auto mb-4" />
                                        <p className="font-medium">No models trained yet</p>
                                        <p className="text-xs mt-1">Train your first model to see performance metrics</p>
                                        <Button className="mt-4" onClick={() => router.push('/forecasts')}>
                                            Train Model
                                        </Button>
                                    </div>
                                ) : (
                                    <>
                                        {/* Summary Stats */}
                                        <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4 border-b border-gray-100">
                                            <div className="bg-blue-50 rounded-lg p-4">
                                                <p className="text-xs text-blue-600 font-semibold mb-1">Total Models</p>
                                                <p className="text-2xl font-bold text-blue-900">{models.length}</p>
                                            </div>
                                            <div className="bg-green-50 rounded-lg p-4">
                                                <p className="text-xs text-green-600 font-semibold mb-1">Avg MAPE</p>
                                                <p className="text-2xl font-bold text-green-900">
                                                    {models.length > 0
                                                        ? (models.reduce((sum, m) => sum + (m.test_mape || 0), 0) / models.length).toFixed(2)
                                                        : '0.00'
                                                    }%
                                                </p>
                                            </div>
                                            <div className="bg-purple-50 rounded-lg p-4">
                                                <p className="text-xs text-purple-600 font-semibold mb-1">Best Model</p>
                                                <p className="text-lg font-bold text-purple-900">
                                                    {models.length > 0
                                                        ? models.reduce((best, m) => ((m.test_mape || 100) < (best.test_mape || 100) ? m : best), models[0])?.model_type
                                                        : 'N/A'
                                                    }
                                                </p>
                                            </div>
                                            <div className="bg-orange-50 rounded-lg p-4">
                                                <p className="text-xs text-orange-600 font-semibold mb-1">Active Models</p>
                                                <p className="text-2xl font-bold text-orange-900">
                                                    {models.filter(m => m.is_active).length}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Models Table */}
                                        <Table>
                                            <TableHeader className="bg-gray-50/50">
                                                <TableRow>
                                                    <TableHead>Symbol</TableHead>
                                                    <TableHead>Model Type</TableHead>
                                                    <TableHead>Trained</TableHead>
                                                    <TableHead>Samples</TableHead>
                                                    <TableHead>MAPE</TableHead>
                                                    <TableHead>RMSE</TableHead>
                                                    <TableHead>Status</TableHead>
                                                    <TableHead className="text-right">Action</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {models.map((model: any) => (
                                                    <TableRow key={model.id} className="hover:bg-gray-50/50">
                                                        <TableCell className="font-medium text-gray-900">{model.symbol}</TableCell>
                                                        <TableCell>
                                                            <Badge variant="outline" className="font-semibold">
                                                                {model.model_type}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell className="text-sm text-gray-600">
                                                            {new Date(model.trained_at).toLocaleDateString()}
                                                        </TableCell>
                                                        <TableCell className="text-sm">{model.training_samples?.toLocaleString()}</TableCell>
                                                        <TableCell>
                                                            <span className={`font-semibold ${model.test_mape < 5 ? 'text-green-600' :
                                                                model.test_mape < 10 ? 'text-yellow-600' :
                                                                    'text-red-600'
                                                                }`}>
                                                                {model.test_mape?.toFixed(2)}%
                                                            </span>
                                                        </TableCell>
                                                        <TableCell className="text-sm font-mono">
                                                            {model.test_rmse?.toFixed(2)}
                                                        </TableCell>
                                                        <TableCell>
                                                            {model.is_active ? (
                                                                <Badge className="bg-green-100 text-green-700 border-green-200">Active</Badge>
                                                            ) : (
                                                                <Badge variant="outline" className="text-gray-500">Inactive</Badge>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="text-blue-600 hover:text-blue-700"
                                                                onClick={() => router.push(`/forecasts/${model.symbol}`)}
                                                            >
                                                                View Details
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </>
                                )}
                            </div>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </DashboardLayout>
    );
}
