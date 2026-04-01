'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { X, Sparkles, TrendingUp, ShieldAlert, BarChart3, Info } from 'lucide-react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    Cell
} from 'recharts';

interface OptimizePortfolioDialogProps {
    isOpen: boolean;
    onClose: () => void;
    currentHoldings: { ticker: string; value: number }[];
    accountId: string;
}

interface OptimizationResult {
    weights: Record<string, number>;
    metrics: {
        expected_return: number;
        volatility: number;
        sharpe_ratio: number;
        max_drawdown: number;
    };
    trades: Array<{
        ticker: string;
        action: 'BUY' | 'SELL';
        quantity: number;
        price: number;
        estimated_value: number;
    }>;
    note?: string;
}

export function OptimizePortfolioDialog({ isOpen, onClose, currentHoldings, accountId }: OptimizePortfolioDialogProps) {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<OptimizationResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [selectedMethod, setSelectedMethod] = useState('max_sharpe');

    const fetchOptimization = async (method: string) => {
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('access_token');
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

            // Add cache-busting timestamp
            let url = `${apiUrl}/api/stocks/portfolio/optimize/?method=${method}&_t=${Date.now()}`;
            if (accountId !== 'all') {
                url += `&account=${accountId}`;
            }

            const response = await axios.get(url, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setResult(response.data);
        } catch (err: any) {
            console.error('Optimization failed', err);
            setError(err.response?.data?.error || 'Failed to optimize portfolio. Ensure you have enough historical data for your assets.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchOptimization(selectedMethod);
        } else {
            setResult(null);
        }
    }, [isOpen, selectedMethod, accountId]); // Added accountId to dependencies

    if (!isOpen) return null;

    // Prepare data for chart
    const totalCurrentValue = currentHoldings.reduce((sum, h) => sum + h.value, 0);
    const chartData = result ? Object.keys(result.weights).map(ticker => {
        const currentHolding = currentHoldings.find(h => h.ticker === ticker);
        const currentWeight = currentHolding ? (currentHolding.value / totalCurrentValue) : 0;
        return {
            name: ticker,
            current: (currentWeight * 100).toFixed(2),
            suggested: (result.weights[ticker] * 100).toFixed(2)
        };
    }) : [];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-600 rounded-lg text-white">
                            <Sparkles className="h-6 w-6" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900">Portfolio Optimization</h2>
                            <p className="text-sm text-gray-500">Suggested weights and Action Plan based on {selectedMethod.replace('_', ' ')} logic</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => fetchOptimization(selectedMethod)}
                            className="p-2 text-gray-500 hover:text-blue-600 hover:bg-white rounded-lg transition-all"
                            title="Refresh Analysis"
                        >
                            <TrendingUp className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                        <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200 transition-colors">
                            <X className="h-6 w-6 text-gray-500" />
                        </button>
                    </div>
                </div>

                {/* Strategy Selector */}
                <div className="px-6 py-4 bg-gray-50/50 border-b border-gray-100">
                    <div className="flex flex-wrap gap-2">
                        {[
                            { id: 'max_sharpe', name: 'Max Sharpe', icon: <Sparkles size={14} /> },
                            { id: 'min_vol', name: 'Min Volatility', icon: <TrendingUp size={14} /> },
                            { id: 'max_diversification', name: 'Max Diversification', icon: <BarChart3 size={14} /> },
                            { id: 'risk_parity', name: 'Risk Parity', icon: <ShieldAlert size={14} /> },
                        ].map((m) => (
                            <button
                                key={m.id}
                                onClick={() => setSelectedMethod(m.id)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${selectedMethod === m.id
                                    ? 'bg-blue-600 text-white shadow-md shadow-blue-200 scale-105'
                                    : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-300 hover:text-blue-600'
                                    }`}
                            >
                                {m.icon}
                                {m.name}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 space-y-4">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                            <p className="text-gray-500 font-medium">Analyzing historical data and optimizing...</p>
                        </div>
                    ) : error ? (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
                            <ShieldAlert className="h-12 w-12 text-red-500 mx-auto mb-4" />
                            <h3 className="text-lg font-bold text-red-800 mb-2">Optimization Error</h3>
                            <p className="text-red-700">{error}</p>
                            <button
                                onClick={() => fetchOptimization(selectedMethod)}
                                className="mt-4 px-6 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-all"
                            >
                                Try Again
                            </button>
                        </div>
                    ) : result ? (
                        <div className="space-y-8">
                            {/* Result Note if solver failed */}
                            {result.note && (
                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2 items-center text-amber-800 text-xs shadow-sm">
                                    <ShieldAlert size={14} /> {result.note}
                                </div>
                            )}

                            {/* Stats Grid */}
                            <div className="grid grid-cols-4 gap-4">
                                <div className="bg-blue-50 rounded-xl p-4 border border-blue-100 transition-all hover:bg-blue-100/50">
                                    <div className="text-sm font-medium text-blue-600 mb-1 flex items-center gap-1">
                                        <TrendingUp size={14} /> Expected Return
                                    </div>
                                    <div className="text-2xl font-bold text-gray-900">
                                        {(result.metrics.expected_return * 100).toFixed(2)}%
                                    </div>
                                    <div className="text-[10px] text-blue-500 mt-1 font-semibold tracking-tight">Annualized estimate</div>
                                </div>
                                <div className="bg-purple-50 rounded-xl p-4 border border-purple-100 transition-all hover:bg-purple-100/50">
                                    <div className="text-sm font-medium text-purple-600 mb-1 flex items-center gap-1">
                                        <ShieldAlert size={14} /> Volatility (Risk)
                                    </div>
                                    <div className="text-2xl font-bold text-gray-900">
                                        {(result.metrics.volatility * 100).toFixed(2)}%
                                    </div>
                                    <div className="text-[10px] text-purple-500 mt-1 font-semibold tracking-tight">Annualized standard dev</div>
                                </div>
                                <div className="bg-red-50 rounded-xl p-4 border border-red-100 transition-all hover:bg-red-100/50">
                                    <div className="text-sm font-medium text-red-600 mb-1 flex items-center gap-1">
                                        <TrendingUp size={14} className="rotate-180" /> Max Drawdown
                                    </div>
                                    <div className="text-2xl font-bold text-gray-900 text-red-700">
                                        {(result.metrics.max_drawdown * 100).toFixed(2)}%
                                    </div>
                                    <div className="text-[10px] text-red-500 mt-1 font-semibold tracking-tight">Max draw-down loss</div>
                                </div>
                                <div className="bg-orange-50 rounded-xl p-4 border border-orange-100 transition-all hover:bg-orange-100/50">
                                    <div className="text-sm font-medium text-orange-600 mb-1 flex items-center gap-1">
                                        <BarChart3 size={14} /> Sharpe Ratio
                                    </div>
                                    <div className="text-2xl font-bold text-gray-900">
                                        {(result.metrics.sharpe_ratio || 0).toFixed(2)}
                                    </div>
                                    <div className="text-[10px] text-orange-500 mt-1 font-semibold tracking-tight">Risk-adjusted return</div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                {/* Chart */}
                                <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
                                    <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
                                        Allocation Comparison (%)
                                    </h3>
                                    <div className="h-[350px] w-full">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                                <XAxis
                                                    dataKey="name"
                                                    angle={-45}
                                                    textAnchor="end"
                                                    interval={0}
                                                    height={80}
                                                    stroke="#9ca3af"
                                                    fontSize={11}
                                                />
                                                <YAxis unit="%" stroke="#9ca3af" fontSize={11} />
                                                <Tooltip
                                                    formatter={(value: any) => [`${value}%`]}
                                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                                />
                                                <Legend verticalAlign="top" wrapperStyle={{ paddingTop: '0px', paddingBottom: '20px' }} />
                                                <Bar dataKey="current" name="Current Weight" fill="#e5e7eb" radius={[4, 4, 0, 0]} />
                                                <Bar dataKey="suggested" name="Optimized Weight" fill="#2563eb" radius={[4, 4, 0, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                {/* Trade Suggestions Table */}
                                <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm flex flex-col">
                                    <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
                                        Rebalancing Action Plan
                                    </h3>
                                    <div className="flex-1 overflow-y-auto">
                                        {result.trades.length > 0 ? (
                                            <table className="w-full text-sm">
                                                <thead className="bg-gray-50 border-y border-gray-100 text-gray-500 font-medium">
                                                    <tr>
                                                        <th className="py-3 px-4 text-left">Ticker</th>
                                                        <th className="py-3 px-4 text-left">Action</th>
                                                        <th className="py-3 px-4 text-right">Quantity</th>
                                                        <th className="py-3 px-4 text-right">Est. Value</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100">
                                                    {result.trades.map((trade, idx) => (
                                                        <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                                            <td className="py-4 px-4 font-bold text-gray-900">{trade.ticker}</td>
                                                            <td className="py-4 px-4">
                                                                <span className={`px-3 py-1 rounded-full text-[11px] font-bold ${trade.action === 'BUY'
                                                                    ? 'bg-green-100 text-green-700 border border-green-200'
                                                                    : 'bg-red-100 text-red-700 border border-red-200'
                                                                    }`}>
                                                                    {trade.action}
                                                                </span>
                                                            </td>
                                                            <td className="py-4 px-4 text-right font-medium text-gray-700">{trade.quantity.toLocaleString()}</td>
                                                            <td className="py-4 px-4 text-right font-bold text-gray-900">
                                                                Rs {(trade.estimated_value).toLocaleString()}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        ) : (
                                            <div className="flex flex-col items-center justify-center py-10 opacity-60">
                                                <ShieldAlert size={40} className="text-green-500 mb-4" />
                                                <p className="text-gray-500 font-medium">Your portfolio is perfectly balanced!</p>
                                                <p className="text-xs text-gray-400">No trades required to reach target weights.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Recommendation Info */}
                            <div className="flex gap-4 p-4 bg-blue-50/50 border border-blue-100 rounded-xl text-sm text-gray-600 mt-4 shadow-sm">
                                <Info className="h-5 w-5 text-blue-600 flex-shrink-0" />
                                <div className="space-y-1">
                                    <p className="font-bold text-blue-900">How to read this analysis:</p>
                                    <p className="text-gray-700 leading-relaxed">
                                        These suggestions are based on historical data from the past 2 years.
                                        {selectedMethod === 'max_sharpe' && " It targets the highest return for every unit of risk taken."}
                                        {selectedMethod === 'min_vol' && " It focuses on creating the most stable portfolio possible."}
                                        {selectedMethod === 'max_diversification' && " It spreads bets to minimize impact from any single sector or asset."}
                                        {selectedMethod === 'risk_parity' && " It ensures no single stock dominates the risk profile of your portfolio."}
                                    </p>
                                    <div className="flex gap-4 mt-2 text-xs font-semibold tracking-tight">
                                        <span className="text-blue-600">Max Weight: 50%</span>
                                        <span className="text-blue-600">Sample: 2 Years</span>
                                        <span className="text-blue-600">Solver: Clarabel</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : null}
                </div>

                <div className="p-6 border-t border-gray-100 flex justify-end gap-3 bg-gray-50/50">
                    <button
                        onClick={onClose}
                        className="px-8 py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-black transition-all shadow-lg hover:shadow-gray-300"
                    >
                        Close Analysis
                    </button>
                </div>
            </div>
        </div>
    );
}
