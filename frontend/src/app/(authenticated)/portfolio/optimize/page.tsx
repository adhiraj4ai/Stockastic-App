'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';
import { Loader2, ArrowLeft, TrendingUp, Shield, PieChart, Scale, ArrowRight, Wallet, Network, ShieldAlert, Anchor, LayoutGrid } from 'lucide-react';
import { PageLoader } from '@/components/ui/StockLoader';

interface OptimizationResult {
    success: boolean;
    weights: { [ticker: string]: number };
    metrics: {
        expected_return: number;
        volatility: number;
        sharpe_ratio: number;
        max_drawdown: number;
    };
    trades: Array<{
        ticker: string;
        action: string;
        quantity: number;
        price: number;
        estimated_value: number;
    }>;
    note?: string;
}

const strategies = [
    {
        id: 'max_sharpe',
        name: 'Max Sharpe',
        desc: 'Best risk-adjusted return. (PyPfOpt)',
        icon: TrendingUp,
        color: 'text-blue-600',
        bg: 'bg-blue-50'
    },
    {
        id: 'min_vol',
        name: 'Min Volatility',
        desc: 'Lowest portfolio risk. (PyPfOpt)',
        icon: Shield,
        color: 'text-green-600',
        bg: 'bg-green-50'
    },
    {
        id: 'hrp',
        name: 'HRP Clustering',
        desc: 'AI clustering risk allocation. (Riskfolio)',
        icon: Network,
        color: 'text-indigo-600',
        bg: 'bg-indigo-50'
    },
    {
        id: 'cvar',
        name: 'Min CVaR',
        desc: 'Minimizes expected tail loss. (Riskfolio)',
        icon: ShieldAlert,
        color: 'text-red-600',
        bg: 'bg-red-50'
    },
    {
        id: 'cdar',
        name: 'Min CDaR',
        desc: 'Minimizes deep drawdowns. (Riskfolio)',
        icon: Anchor,
        color: 'text-cyan-600',
        bg: 'bg-cyan-50'
    },
    {
        id: 'equal',
        name: 'Equal Weight',
        desc: 'Simple 1/N allocation. (Baseline)',
        icon: LayoutGrid,
        color: 'text-gray-600',
        bg: 'bg-gray-50'
    },
    {
        id: 'max_diversification',
        name: 'Max Diversity',
        desc: 'Maximizes uncorrelation. (Skfolio)',
        icon: PieChart,
        color: 'text-purple-600',
        bg: 'bg-purple-50'
    },
    {
        id: 'risk_parity',
        name: 'Risk Parity',
        desc: 'Equal risk contribution. (Skfolio)',
        icon: Scale,
        color: 'text-orange-600',
        bg: 'bg-orange-50'
    }
];

export const dynamic = 'force-dynamic';

function OptimizeContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const accountId = searchParams.get('account') || 'all';

    const [selectedStrategy, setSelectedStrategy] = useState('max_sharpe');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<OptimizationResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleOptimize = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await api.get('/api/stocks/portfolio/optimize/', {
                params: {
                    account: accountId,
                    method: selectedStrategy
                }
            });
            setResult(response.data);
        } catch (err: any) {
            console.error('Optimization failed', err);
            setError(err.response?.data?.error || "Failed to generate optimization.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <DashboardLayout title="Portfolio Optimization" showBack={true}>
            <div className="space-y-6 max-w-7xl mx-auto">
                {/* Strategy Selection */}
                <section>
                    <h2 className="text-base font-semibold mb-3 text-gray-800">Strategies</h2>
                    <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
                        {strategies.filter(s => s.id !== 'equal').map((strat) => {
                            const Icon = strat.icon;
                            const isSelected = selectedStrategy === strat.id;
                            return (
                                <div
                                    key={strat.id}
                                    onClick={() => setSelectedStrategy(strat.id)}
                                    className={`relative p-2 rounded-lg border cursor-pointer transition-all duration-200 aspect-square flex flex-col justify-center items-center text-center
                                        ${isSelected
                                            ? 'border-blue-600 bg-blue-50/50 shadow-sm ring-1 ring-blue-600'
                                            : 'border-transparent bg-white shadow-sm hover:border-gray-200 hover:shadow-md'
                                        }
                                    `}
                                >
                                    <div className={`p-1.5 rounded-md w-fit mb-2 ${strat.bg}`}>
                                        <Icon className={`h-6 w-6 ${strat.color}`} />
                                    </div>
                                    <h3 className="font-semibold text-sm text-gray-900 leading-tight">{strat.name}</h3>
                                    <p className="text-xs text-gray-500 mt-1 leading-tight px-1 line-clamp-3">{strat.desc}</p>

                                    {isSelected && (
                                        <div className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-blue-600 ring-1 ring-blue-100" />
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <div className="mt-6 flex justify-end">
                        <Button
                            size="lg"
                            onClick={handleOptimize}
                            disabled={loading}
                            className="bg-gray-900 hover:bg-black text-white px-8 h-12 text-base shadow-lg hover:shadow-xl transition-all"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                    Running Solver...
                                </>
                            ) : (
                                <>
                                    <Wallet className="mr-2 h-5 w-5" />
                                    Generate Optimization Plan
                                </>
                            )}
                        </Button>
                    </div>
                </section>

                {error && (
                    <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-lg flex items-center gap-2">
                        <Shield className="h-5 w-5" />
                        {error}
                    </div>
                )}

                {/* Results Section */}
                {result && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {/* Metrics Column */}
                        <div className="lg:col-span-1 space-y-6">
                            <Card className="border-gray-200 shadow-sm overflow-hidden">
                                <CardHeader className="bg-gradient-to-r from-gray-50 to-white border-b">
                                    <CardTitle>Projected Metrics</CardTitle>
                                    <CardDescription>Based on historical data (2Y)</CardDescription>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <div className="divide-y">
                                        <div className="p-4 flex justify-between items-center">
                                            <span className="text-sm text-gray-500">Annual Return</span>
                                            <span className="font-mono font-semibold text-green-600">{(result.metrics.expected_return * 100).toFixed(2)}%</span>
                                        </div>
                                        <div className="p-4 flex justify-between items-center">
                                            <span className="text-sm text-gray-500">Volatility (Risk)</span>
                                            <span className="font-mono font-semibold text-orange-600">{(result.metrics.volatility * 100).toFixed(2)}%</span>
                                        </div>
                                        <div className="p-4 flex justify-between items-center bg-blue-50/50">
                                            <span className="text-sm font-medium text-blue-900">Sharpe Ratio</span>
                                            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-blue-200 text-blue-800 hover:bg-blue-300">
                                                {result.metrics.sharpe_ratio.toFixed(2)}
                                            </span>
                                        </div>
                                        <div className="p-4 flex justify-between items-center">
                                            <span className="text-sm text-gray-500">Max Drawdown</span>
                                            <span className="font-mono font-semibold text-red-600">{(result.metrics.max_drawdown * 100).toFixed(2)}%</span>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
                                <p className="font-semibold mb-1 flex items-center gap-2">
                                    <Shield className="h-4 w-4" /> Disclaimer
                                </p>
                                Historical performance does not guarantee future results. This optimization assumes normal market conditions.
                            </div>
                        </div>

                        {/* Allocation and Trades */}
                        <div className="lg:col-span-2 space-y-8">
                            {/* Recommended Allocation */}
                            <Card className="border-gray-200 shadow-sm">
                                <CardHeader>
                                    <CardTitle>Recommended Allocation</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-4">
                                        {Object.entries(result.weights)
                                            .sort(([, a], [, b]) => b - a)
                                            .map(([ticker, weight]) => (
                                                <div key={ticker} className="space-y-1">
                                                    <div className="flex justify-between text-sm">
                                                        <span className="font-medium">{ticker}</span>
                                                        <span className="text-gray-600">{(weight * 100).toFixed(1)}%</span>
                                                    </div>
                                                    <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-blue-600 rounded-full transition-all duration-1000 ease-out"
                                                            style={{ width: `${weight * 100}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Rebalancing Trades */}
                            <Card className="border-gray-200 shadow-sm">
                                <CardHeader>
                                    <CardTitle>Rebalancing Plan</CardTitle>
                                    <CardDescription>Trades needed to achieve this portfolio</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead className="bg-gray-50 border-b">
                                                <tr>
                                                    <th className="px-4 py-3 text-left font-medium text-gray-500">Action</th>
                                                    <th className="px-4 py-3 text-left font-medium text-gray-500">Script</th>
                                                    <th className="px-4 py-3 text-right font-medium text-gray-500">Quantity</th>
                                                    <th className="px-4 py-3 text-right font-medium text-gray-500">Price</th>
                                                    <th className="px-4 py-3 text-right font-medium text-gray-500">Est. Value</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y">
                                                {result.trades.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                                                            Your portfolio is already optimized! No trades needed.
                                                        </td>
                                                    </tr>
                                                ) : result.trades.map((trade, idx) => (
                                                    <tr key={idx} className="group hover:bg-gray-50">
                                                        <td className="px-4 py-3">
                                                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${trade.action === 'BUY'
                                                                ? 'bg-green-50 text-green-700 border-green-200'
                                                                : 'bg-red-50 text-red-700 border-red-200'
                                                                }`}>
                                                                {trade.action}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 font-medium">{trade.ticker}</td>
                                                        <td className="px-4 py-3 text-right">{trade.quantity}</td>
                                                        <td className="px-4 py-3 text-right">Rs. {trade.price}</td>
                                                        <td className="px-4 py-3 text-right font-mono text-gray-700">
                                                            Rs. {trade.estimated_value.toLocaleString()}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}

export default function OptimizePage() {
    return (
        <Suspense fallback={<PageLoader />}>
            <OptimizeContent />
        </Suspense>
    );
}
