'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import DashboardLayout from '@/components/DashboardLayout';
import ForecastChart from '@/components/ForecastChart';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Download, RefreshCw, Calendar, TrendingUp, Target, Brain } from 'lucide-react';

interface ForecastModel {
    id: number;
    model_type: string;
    trained_at: string;
    test_mape: number;
    test_rmse: number;
}

interface Forecast {
    id: number;
    forecast_date: string;
    predicted_price: number;
    confidence_lower?: number;
    confidence_upper?: number;
}

export default function SymbolForecastPage() {
    const params = useParams();
    const router = useRouter();
    const symbol = params.symbol as string;

    const [loading, setLoading] = useState(true);
    const [model, setModel] = useState<ForecastModel | null>(null);
    const [forecasts, setForecasts] = useState<Forecast[]>([]);
    const [retraining, setRetraining] = useState(false);

    useEffect(() => {
        if (symbol) {
            fetchData();
        }
    }, [symbol]);

    const fetchData = async () => {
        try {
            setLoading(true);

            // Fetch model info
            const modelsResponse = await api.get(`/api/ml/forecasts/?symbol=${symbol}&is_active=true`);
            if (modelsResponse.data.length > 0) {
                setModel(modelsResponse.data[0]);
            }

            // Fetch forecasts
            const forecastsResponse = await api.get(`/api/ml/forecasts/by_symbol/?symbol=${symbol}&limit=252`);
            setForecasts(forecastsResponse.data);
        } catch (error) {
            console.error('Failed to fetch forecast data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleRetrain = async () => {
        if (!model) return;

        if (!confirm('Are you sure you want to retrain this model? This will take several minutes.')) return;

        try {
            setRetraining(true);
            await api.post('/api/ml/forecasts/train/', {
                symbol,
                model_type: model.model_type,
                hyperparameters: {}
            });

            alert('Model retraining started! This will take a few minutes.');
            setTimeout(fetchData, 5000); // Refresh after 5 seconds
        } catch (error: any) {
            console.error('Retraining failed:', error);
            alert(`Failed to start retraining: ${error.response?.data?.error || error.message}`);
        } finally {
            setRetraining(false);
        }
    };

    const handleDownloadCSV = () => {
        if (forecasts.length === 0) return;

        // Create CSV content
        const headers = ['Date', 'Predicted Price', 'Lower Bound', 'Upper Bound'];
        const rows = forecasts.map(f => [
            f.forecast_date,
            f.predicted_price,
            f.confidence_lower || '',
            f.confidence_upper || ''
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');

        // Download
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${symbol}_forecast.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    };

    if (loading) {
        return (
            <DashboardLayout title={`${symbol} Forecast`} subtitle="Loading forecast data...">
                <div className="flex items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                </div>
            </DashboardLayout>
        );
    }

    if (!model || forecasts.length === 0) {
        return (
            <DashboardLayout title={`${symbol} Forecast`} subtitle="No forecast available">
                <Card>
                    <CardContent className="pt-12 pb-12 text-center">
                        <Brain className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold mb-2">No Forecast Available</h3>
                        <p className="text-gray-500 mb-6">Train a model first to generate forecasts for {symbol}</p>
                        <Button onClick={() => router.push('/forecasts')}>
                            Go to Forecasts Dashboard
                        </Button>
                    </CardContent>
                </Card>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout title={`${symbol} Price Forecast`} subtitle="1-year ML-based price prediction">
            <div className="space-y-6">
                {/* Header Actions */}
                <div className="flex items-center justify-between">
                    <Button variant="ghost" onClick={() => router.push('/forecasts')}>
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back to Forecasts
                    </Button>

                    <div className="flex gap-2">
                        <Button variant="outline" onClick={handleDownloadCSV}>
                            <Download className="w-4 h-4 mr-2" />
                            Download CSV
                        </Button>
                        <Button onClick={handleRetrain} disabled={retraining}>
                            <RefreshCw className={`w-4 h-4 mr-2 ${retraining ? 'animate-spin' : ''}`} />
                            {retraining ? 'Retraining...' : 'Retrain Model'}
                        </Button>
                    </div>
                </div>

                {/* Model Info Card */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle>Model Information</CardTitle>
                                <CardDescription>Current active forecasting model for {symbol}</CardDescription>
                            </div>
                            <Badge className="bg-purple-100 text-purple-700 border-purple-200">
                                {model.model_type}
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="bg-gray-50 rounded-lg p-4">
                                <div className="flex items-center gap-2 mb-1">
                                    <Calendar className="w-4 h-4 text-gray-500" />
                                    <span className="text-sm text-gray-500">Trained</span>
                                </div>
                                <p className="text-lg font-semibold">
                                    {new Date(model.trained_at).toLocaleDateString()}
                                </p>
                            </div>

                            <div className="bg-gray-50 rounded-lg p-4">
                                <div className="flex items-center gap-2 mb-1">
                                    <Target className="w-4 h-4 text-gray-500" />
                                    <span className="text-sm text-gray-500">MAPE</span>
                                </div>
                                <p className={`text-lg font-semibold ${model.test_mape < 5 ? 'text-green-600' : model.test_mape < 10 ? 'text-yellow-600' : 'text-red-600'}`}>
                                    {model.test_mape.toFixed(2)}%
                                </p>
                            </div>

                            <div className="bg-gray-50 rounded-lg p-4">
                                <div className="flex items-center gap-2 mb-1">
                                    <TrendingUp className="w-4 h-4 text-gray-500" />
                                    <span className="text-sm text-gray-500">RMSE</span>
                                </div>
                                <p className="text-lg font-semibold">
                                    {model.test_rmse.toFixed(2)}
                                </p>
                            </div>

                            <div className="bg-gray-50 rounded-lg p-4">
                                <div className="flex items-center gap-2 mb-1">
                                    <Brain className="w-4 h-4 text-gray-500" />
                                    <span className="text-sm text-gray-500">Forecasts</span>
                                </div>
                                <p className="text-lg font-semibold">
                                    {forecasts.length} days
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Forecast Chart */}
                <Card>
                    <CardHeader>
                        <CardTitle>Price Forecast Chart</CardTitle>
                        <CardDescription>
                            Predicted prices for the next {forecasts.length} trading days
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ForecastChart
                            symbol={symbol}
                            forecastData={forecasts.map(f => ({
                                date: f.forecast_date,
                                predicted_price: f.predicted_price,
                                confidence_lower: f.confidence_lower,
                                confidence_upper: f.confidence_upper
                            }))}
                            height={500}
                        />
                    </CardContent>
                </Card>

                {/* Forecast Summary Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                        <CardContent className="pt-6">
                            <div className="text-center">
                                <p className="text-sm text-gray-500 mb-1">Current Price</p>
                                <p className="text-2xl font-bold">
                                    Rs. {forecasts[0]?.predicted_price.toFixed(2)}
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="pt-6">
                            <div className="text-center">
                                <p className="text-sm text-gray-500 mb-1">1-Year Target</p>
                                <p className="text-2xl font-bold">
                                    Rs. {forecasts[forecasts.length - 1]?.predicted_price.toFixed(2)}
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardContent className="pt-6">
                            <div className="text-center">
                                <p className="text-sm text-gray-500 mb-1">Expected Change</p>
                                <p className={`text-2xl font-bold ${forecasts[forecasts.length - 1]?.predicted_price > forecasts[0]?.predicted_price
                                        ? 'text-green-600'
                                        : 'text-red-600'
                                    }`}>
                                    {(((forecasts[forecasts.length - 1]?.predicted_price - forecasts[0]?.predicted_price) / forecasts[0]?.predicted_price) * 100).toFixed(2)}%
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </DashboardLayout>
    );
}
