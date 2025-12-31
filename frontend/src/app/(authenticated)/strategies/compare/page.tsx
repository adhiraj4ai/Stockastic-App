'use client';

import React, { useState, useEffect, useRef } from 'react';
import api from '@/lib/api';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CompanySelect } from '@/components/CompanySelect';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Play, TrendingUp, TrendingDown, Activity, AlertTriangle, Loader2, Zap, Settings, StopCircle, ChevronUp, ChevronDown, Upload, Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

interface Strategy {
    id: number;
    name: string;
}

interface PeriodMetrics {
    win_rate?: number;
    return_pct?: number;
    max_drawdown?: number;
    profit_factor?: number;
    total_trades?: number;
    sharpe_ratio?: number;
    error?: string;
    best_params?: Record<string, number>;
    optimized?: boolean;
}

interface StrategyResult {
    strategy_id: number;
    strategy_name: string;
    is_published: boolean;
    periods: Record<string, PeriodMetrics>;
}

interface ComparisonResults {
    symbol: string;
    periods: string[];
    results: StrategyResult[];
    optimized?: boolean;
}

const PERIODS = ['1Y', '3Y', '5Y', '10Y'];

export default function StrategyComparePage() {
    const router = useRouter();
    const [symbol, setSymbol] = useState('');
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState<ComparisonResults | null>(null);
    const [strategies, setStrategies] = useState<Strategy[]>([]);
    const abortControllerRef = useRef<AbortController | null>(null);
    const [sortConfig, setSortConfig] = useState<{ period: string; metric: string; direction: 'asc' | 'desc' } | null>(null);
    const [newlyPublished, setNewlyPublished] = useState<Set<number>>(new Set());

    useEffect(() => {
        // Fetch available strategies
        api.get('/api/stocks/strategies/')
            .then(res => setStrategies(res.data.results || res.data))
            .catch(err => console.error('Failed to fetch strategies', err));
    }, []);

    const handleRunComparison = async (optimize: boolean = false) => {
        if (!symbol) {
            toast.error('Please select a symbol');
            return;
        }

        // Cancel any existing request
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();

        setLoading(true);
        setResults(null);

        try {
            const endpoint = optimize
                ? '/api/stocks/strategies/optimize_compare/'
                : '/api/stocks/strategies/compare/';

            const response = await api.post(endpoint, {
                symbol,
                periods: PERIODS,
                n_trials: 20  // Fewer trials for speed
            }, {
                signal: abortControllerRef.current.signal
            });
            setResults(response.data);
            toast.success(optimize ? 'Optimization complete!' : 'Comparison complete!');
        } catch (error: any) {
            if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
                toast.info('Operation cancelled');
                return;
            }
            toast.error(error.response?.data?.error || 'Comparison failed');
        } finally {
            setLoading(false);
        }
    };

    const handleCancel = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setLoading(false);
    };

    const [publishingStrategy, setPublishingStrategy] = useState<number | null>(null);

    const handlePublishOptimization = async (strategyId: number, strategyName: string, bestParams: Record<string, number>) => {
        setPublishingStrategy(strategyId);
        try {
            await api.post(`/api/stocks/strategies/${strategyId}/publish_optimized/`, {
                best_params: bestParams,
                symbol: symbol,
            });
            setNewlyPublished(prev => new Set(prev).add(strategyId));
            toast.success(`Published optimized config for ${strategyName}`);
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Failed to publish optimization');
        } finally {
            setPublishingStrategy(null);
        }
    };


    // Handle sorting
    const handleSort = (period: string, metric: string) => {
        setSortConfig(prev => {
            if (prev?.period === period && prev?.metric === metric) {
                return prev.direction === 'asc'
                    ? { period, metric, direction: 'desc' }
                    : null;
            }
            return { period, metric, direction: 'asc' };
        });
    };

    // Get sorted results
    const getSortedResults = () => {
        if (!results || !sortConfig) return results?.results || [];

        return [...results.results].sort((a, b) => {
            const aMetrics = a.periods[sortConfig.period] || {};
            const bMetrics = b.periods[sortConfig.period] || {};

            let aVal = 0, bVal = 0;
            switch (sortConfig.metric) {
                case 'win_rate': aVal = aMetrics.win_rate || 0; bVal = bMetrics.win_rate || 0; break;
                case 'return_pct': aVal = aMetrics.return_pct || 0; bVal = bMetrics.return_pct || 0; break;
                case 'max_drawdown': aVal = aMetrics.max_drawdown || 0; bVal = bMetrics.max_drawdown || 0; break;
                case 'total_trades': aVal = aMetrics.total_trades || 0; bVal = bMetrics.total_trades || 0; break;
                case 'sharpe_ratio': aVal = aMetrics.sharpe_ratio || 0; bVal = bMetrics.sharpe_ratio || 0; break;
            }

            return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
        });
    };

    // Render sort indicator
    const SortIndicator = ({ period, metric }: { period: string; metric: string }) => {
        const isActive = sortConfig?.period === period && sortConfig?.metric === metric;
        if (!isActive) return null;
        return sortConfig.direction === 'asc'
            ? <ChevronUp size={10} className="inline ml-0.5" />
            : <ChevronDown size={10} className="inline ml-0.5" />;
    };

    return (
        <DashboardLayout
            title="Strategy Comparison"
            subtitle="Compare all strategies on a single symbol across time periods"
            showBack
        >
            <div className="w-full px-4 py-6 space-y-6">
                {/* Controls */}

                <Card className="border-gray-200 shadow-sm bg-gradient-to-r from-white to-gray-50">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-4 flex-wrap">
                            <div className="flex items-center gap-2">
                                <Label className="text-xs font-bold text-gray-500 uppercase whitespace-nowrap">Symbol</Label>
                                <CompanySelect
                                    value={symbol}
                                    onChange={setSymbol}
                                    className="h-9 w-48"
                                />
                            </div>

                            <div className="flex items-center gap-2 border-l border-gray-200 pl-4">
                                <Label className="text-xs font-bold text-gray-500 uppercase whitespace-nowrap">Periods</Label>
                                <div className="flex gap-1">
                                    {PERIODS.map(p => (
                                        <Badge key={p} variant="outline" className="px-2 py-0.5 text-[10px] font-semibold bg-gray-50">
                                            {p}
                                        </Badge>
                                    ))}
                                </div>
                            </div>

                            <div className="flex items-center gap-2 ml-auto">
                                <Button
                                    onClick={() => handleRunComparison(false)}
                                    disabled={loading || !symbol}
                                    size="sm"
                                    className="h-9 px-4 bg-blue-600 hover:bg-blue-700 shadow-sm"
                                >
                                    <Play size={14} className="mr-1.5" />
                                    Quick
                                </Button>

                                <Button
                                    onClick={() => handleRunComparison(true)}
                                    disabled={loading || !symbol}
                                    size="sm"
                                    className="h-9 px-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 shadow-sm"
                                >
                                    <Zap size={14} className="mr-1.5" />
                                    Optimize
                                </Button>

                                {strategies.length > 0 && (
                                    <span className="text-[10px] text-gray-400 border-l border-gray-200 pl-3 ml-1">
                                        {strategies.length} strategies
                                    </span>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Results Table */}
                {loading && (
                    <Card className="border-gray-200 shadow-sm">
                        <CardContent className="p-12 flex flex-col items-center justify-center space-y-4">
                            <div className="w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div>
                            <p className="text-gray-500">Running optimizations for all strategies...</p>
                            <p className="text-xs text-gray-400">This may take several minutes. Please be patient.</p>
                            <Button
                                onClick={handleCancel}
                                variant="outline"
                                className="mt-4 text-red-600 border-red-200 hover:bg-red-50"
                            >
                                <StopCircle size={16} className="mr-2" />
                                Stop
                            </Button>
                        </CardContent>
                    </Card>
                )}

                {results && !loading && (
                    <Card className="border-gray-200 shadow-sm overflow-hidden">
                        <CardHeader className="py-4 px-6 bg-gray-50 border-b">
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-lg font-bold text-gray-800">
                                        Results for {results.symbol}
                                    </CardTitle>
                                    <CardDescription>
                                        {results.results.length} strategies compared across {results.periods.length} time periods
                                        {results.optimized && (
                                            <Badge className="ml-2 bg-purple-100 text-purple-700 border-purple-200">
                                                <Zap size={10} className="mr-1" /> Optimized
                                            </Badge>
                                        )}
                                    </CardDescription>
                                </div>
                                <div className="flex items-center gap-4 text-xs text-gray-500">
                                    <span className="flex items-center gap-1"><Activity size={12} className="text-blue-500" /> Win Rate</span>
                                    <span className="flex items-center gap-1"><TrendingUp size={12} className="text-green-500" /> Return %</span>
                                    <span className="flex items-center gap-1"><TrendingDown size={12} className="text-red-500" /> Drawdown</span>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-gray-100 border-b">
                                            <th rowSpan={2} className="text-left px-4 py-2 text-xs font-bold text-gray-600 uppercase tracking-wider border-r bg-gray-100 sticky left-0 z-10 min-w-[140px]">
                                                Strategy
                                            </th>
                                            {results.periods.map(period => (
                                                <th key={period} colSpan={5} className="text-center px-2 py-2 text-xs font-bold text-gray-600 uppercase tracking-wider border-r border-gray-200">
                                                    {period}
                                                </th>
                                            ))}
                                        </tr>
                                        <tr className="bg-gray-50 border-b">
                                            {results.periods.map(period => (
                                                <React.Fragment key={period}>
                                                    <th
                                                        onClick={() => handleSort(period, 'win_rate')}
                                                        className="text-center px-2 py-1 text-[10px] font-semibold text-blue-600 uppercase cursor-pointer hover:bg-blue-50 transition-colors"
                                                    >
                                                        Win%<SortIndicator period={period} metric="win_rate" />
                                                    </th>
                                                    <th
                                                        onClick={() => handleSort(period, 'return_pct')}
                                                        className="text-center px-2 py-1 text-[10px] font-semibold text-green-600 uppercase cursor-pointer hover:bg-green-50 transition-colors"
                                                    >
                                                        Return<SortIndicator period={period} metric="return_pct" />
                                                    </th>
                                                    <th
                                                        onClick={() => handleSort(period, 'max_drawdown')}
                                                        className="text-center px-2 py-1 text-[10px] font-semibold text-red-600 uppercase cursor-pointer hover:bg-red-50 transition-colors"
                                                    >
                                                        DD<SortIndicator period={period} metric="max_drawdown" />
                                                    </th>
                                                    <th
                                                        onClick={() => handleSort(period, 'total_trades')}
                                                        className="text-center px-2 py-1 text-[10px] font-semibold text-gray-500 uppercase cursor-pointer hover:bg-gray-100 transition-colors"
                                                    >
                                                        Trades<SortIndicator period={period} metric="total_trades" />
                                                    </th>
                                                    <th
                                                        onClick={() => handleSort(period, 'sharpe_ratio')}
                                                        className="text-center px-2 py-1 text-[10px] font-semibold text-purple-600 uppercase border-r border-gray-200 cursor-pointer hover:bg-purple-50 transition-colors"
                                                    >
                                                        Sharpe<SortIndicator period={period} metric="sharpe_ratio" />
                                                    </th>
                                                </React.Fragment>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {getSortedResults().map((strategyResult, index) => (
                                            <tr key={strategyResult.strategy_id} className={`hover:bg-blue-50/30 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>

                                                <td className={`px-4 py-2.5 border-r border-gray-100 sticky left-0 z-10 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <div className="font-semibold text-gray-900 text-sm whitespace-nowrap">{strategyResult.strategy_name}</div>
                                                                {(strategyResult.is_published || newlyPublished.has(strategyResult.strategy_id)) && (
                                                                    <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 bg-green-50 text-green-700 border-green-200">
                                                                        Published
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                            {results.optimized && strategyResult.periods[results.periods[0]]?.best_params && (
                                                                <div className="text-[9px] text-purple-500 flex items-center gap-0.5 mt-0.5">
                                                                    <Settings size={8} /> Optimized
                                                                </div>
                                                            )}
                                                        </div>
                                                        {results.optimized && strategyResult.periods[results.periods[0]]?.best_params && (
                                                            <button
                                                                onClick={() => handlePublishOptimization(
                                                                    strategyResult.strategy_id,
                                                                    strategyResult.strategy_name,
                                                                    strategyResult.periods[results.periods[0]].best_params!
                                                                )}
                                                                disabled={publishingStrategy === strategyResult.strategy_id || strategyResult.is_published || newlyPublished.has(strategyResult.strategy_id)}
                                                                className={`p-1 rounded transition-colors disabled:opacity-50 ${(strategyResult.is_published || newlyPublished.has(strategyResult.strategy_id))
                                                                        ? 'text-green-600 bg-green-50'
                                                                        : 'hover:bg-green-100 text-green-600'
                                                                    }`}
                                                                title={(strategyResult.is_published || newlyPublished.has(strategyResult.strategy_id)) ? "Already published" : `Publish optimized params for ${strategyResult.strategy_name}`}
                                                            >
                                                                {publishingStrategy === strategyResult.strategy_id ? (
                                                                    <Loader2 size={14} className="animate-spin" />
                                                                ) : (strategyResult.is_published || newlyPublished.has(strategyResult.strategy_id)) ? (
                                                                    <Check size={14} />
                                                                ) : (
                                                                    <Upload size={14} />
                                                                )}
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                                {results.periods.map(period => {
                                                    const m = strategyResult.periods[period] || {};
                                                    const hasError = m.error;
                                                    const returnPositive = (m.return_pct || 0) >= 0;

                                                    if (hasError) {
                                                        return (
                                                            <td key={`${period}-error`} colSpan={5} className="text-center px-2 py-2 text-gray-400 text-xs border-r border-gray-100">
                                                                <AlertTriangle size={12} className="inline mr-1" />
                                                                {m.error}
                                                            </td>
                                                        );
                                                    }

                                                    return (() => {
                                                        const winRateGood = (m.win_rate || 0) >= 50;
                                                        const sharpeGood = (m.sharpe_ratio || 0) >= 1;
                                                        const drawdownBad = Math.abs(m.max_drawdown || 0) >= 20;

                                                        return (
                                                            <React.Fragment key={period}>
                                                                <td className={`text-center px-2 py-2 text-xs font-semibold ${winRateGood ? 'text-blue-700 bg-blue-50/50' : 'text-gray-500'}`}>
                                                                    {m.win_rate?.toFixed(0) || '-'}%
                                                                </td>
                                                                <td className={`text-center px-2 py-2 text-xs font-bold ${returnPositive ? 'text-green-700 bg-green-50/50' : 'text-red-600 bg-red-50/50'}`}>
                                                                    {returnPositive ? '+' : ''}{m.return_pct?.toFixed(1) || '0'}%
                                                                </td>
                                                                <td className={`text-center px-2 py-2 text-xs font-medium ${drawdownBad ? 'text-red-600 bg-red-50/50' : 'text-orange-500'}`}>
                                                                    {m.max_drawdown?.toFixed(0) || '0'}%
                                                                </td>
                                                                <td className="text-center px-2 py-2 text-xs text-gray-500">
                                                                    {m.total_trades || 0}
                                                                </td>
                                                                <td className={`text-center px-2 py-2 text-xs font-semibold border-r border-gray-100 ${sharpeGood ? 'text-purple-700 bg-purple-50/50' : 'text-purple-400'}`}>
                                                                    {m.sharpe_ratio?.toFixed(2) || '-'}
                                                                </td>
                                                            </React.Fragment>
                                                        );
                                                    })();
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Empty State */}
                {!results && !loading && (
                    <Card className="border-gray-200 shadow-sm border-dashed">
                        <CardContent className="p-12 flex flex-col items-center justify-center text-center space-y-4">
                            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
                                <Activity size={32} className="text-gray-400" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-gray-700">No Comparison Run Yet</h3>
                                <p className="text-sm text-gray-500 mt-1">
                                    Select a symbol and click "Run Comparison" to see how your strategies perform across different time periods.
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
        </DashboardLayout>
    );
}
