'use client';

import React, { useState, useEffect, useRef } from 'react';
import api from '@/lib/api';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CompanySelect } from '@/components/CompanySelect';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Play, TrendingUp, TrendingDown, Activity, AlertTriangle, Loader2, Zap, Settings, StopCircle, ChevronUp, ChevronDown, Upload, Check, Eye } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';

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
            <div className="w-full px-4 py-6">
                <Card className="border-gray-200 shadow-sm overflow-hidden">
                    <CardHeader className="py-6 px-6 bg-gradient-to-r from-white to-gray-50 border-b">
                        <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
                            <div className="flex items-center gap-6 flex-wrap">
                                <div className="flex items-center gap-3">
                                    <Label className="text-xs font-bold text-gray-500 uppercase whitespace-nowrap">Symbol</Label>
                                    <CompanySelect
                                        value={symbol}
                                        onChange={setSymbol}
                                        className="h-9 w-56"
                                    />
                                </div>

                                <div className="flex items-center gap-3 border-l border-gray-200 pl-6">
                                    <Label className="text-xs font-bold text-gray-500 uppercase whitespace-nowrap">Periods</Label>
                                    <div className="flex gap-1.5">
                                        {PERIODS.map(p => (
                                            <Badge key={p} variant="outline" className="px-2 py-0.5 text-[10px] font-semibold bg-white border-gray-200 transition-colors hover:border-blue-300">
                                                {p}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <Button
                                    onClick={() => handleRunComparison(false)}
                                    disabled={loading || !symbol}
                                    size="sm"
                                    className="h-9 px-4 bg-white text-blue-600 border border-blue-200 hover:bg-blue-50 hover:text-blue-700 shadow-sm transition-all"
                                >
                                    <Play size={14} className="mr-1.5" />
                                    Quick Run
                                </Button>

                                <Button
                                    onClick={() => handleRunComparison(true)}
                                    disabled={loading || !symbol}
                                    size="sm"
                                    className="h-9 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 shadow-sm transition-all border-0 ring-offset-2 focus:ring-2 focus:ring-blue-500"
                                >
                                    <Zap size={14} className="mr-1.5" />
                                    Optimize & Run
                                </Button>

                                {strategies.length > 0 && !loading && (
                                    <div className="hidden lg:flex items-center gap-1.5 ml-2 border-l border-gray-200 pl-4 py-1">
                                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                        <span className="text-[10px] font-medium text-gray-500 uppercase tracking-tight">
                                            {strategies.length} Strategies active
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </CardHeader>

                    <CardContent className="p-0">
                        {loading ? (
                            <div className="p-20 flex flex-col items-center justify-center space-y-6 text-center bg-white/50 backdrop-blur-sm">
                                <div className="relative">
                                    <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
                                    <Zap size={24} className="absolute inset-0 m-auto text-blue-600 animate-bounce" />
                                </div>
                                <div className="space-y-2">
                                    <h3 className="text-lg font-bold text-gray-800">Analyzing Market Data...</h3>
                                    <p className="text-gray-500 max-w-md mx-auto">
                                        We are running backtests and deep optimizations for all strategies across multiple timeframes.
                                    </p>
                                    <p className="text-xs text-blue-500 font-medium bg-blue-50 inline-block px-3 py-1 rounded-full border border-blue-100">
                                        Grid Search enabled: Testing all combinations
                                    </p>
                                </div>
                                <Button
                                    onClick={handleCancel}
                                    variant="outline"
                                    className="mt-4 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 hover:border-red-300 transition-all px-8"
                                >
                                    <StopCircle size={16} className="mr-2" />
                                    Cancel Operation
                                </Button>
                            </div>
                        ) : results ? (
                            <div className="flex flex-col">
                                <div className="py-4 px-6 bg-blue-50/30 border-b flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-blue-600 text-white p-2 rounded-lg shadow-md ring-2 ring-blue-100">
                                            <Activity size={18} />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-bold text-gray-900 leading-none mb-1">
                                                Comparison Results: <span className="text-blue-600">{results.symbol}</span>
                                            </h3>
                                            <p className="text-[11px] text-gray-500 font-medium">
                                                {results.results.length} strategies evaluated across {results.periods.length} historical benchmarks
                                                {results.optimized && (
                                                    <span className="ml-2 inline-flex items-center gap-1 text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-100">
                                                        <Zap size={10} /> Optimized
                                                    </span>
                                                )}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-5">
                                        <div className="flex flex-col items-center">
                                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Win Rate</span>
                                            <div className="flex items-center gap-1.5">
                                                <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                                <span className="text-[10px] font-bold text-blue-500">Benchmark Avg</span>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-center">
                                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Return %</span>
                                            <div className="flex items-center gap-1.5">
                                                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                                <span className="text-[10px] font-bold text-green-500">Positive Trend</span>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-center">
                                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Risk</span>
                                            <div className="flex items-center gap-1.5">
                                                <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                                <span className="text-[10px] font-bold text-red-500">Max Drawdown</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-gray-200">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-gray-50 border-b border-gray-200">
                                                <th rowSpan={2} className="text-left px-4 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider border-r bg-gray-50 sticky left-0 z-20 min-w-[200px] shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                                                    Strategy Name
                                                </th>
                                                {results.periods.map(period => (
                                                    <th key={period} colSpan={5} className="text-center px-2 py-2.5 text-xs font-bold text-gray-700 uppercase tracking-widest border-r border-gray-200 bg-gray-50/80">
                                                        {period} Historical Performance
                                                    </th>
                                                ))}
                                            </tr>
                                            <tr className="bg-white border-b border-gray-100">
                                                {results.periods.map(period => (
                                                    <React.Fragment key={period}>
                                                        <th
                                                            onClick={() => handleSort(period, 'win_rate')}
                                                            className="text-center px-2 py-2 text-[9px] font-bold text-blue-600 uppercase cursor-pointer hover:bg-blue-50 transition-colors tracking-tighter"
                                                        >
                                                            Win%<SortIndicator period={period} metric="win_rate" />
                                                        </th>
                                                        <th
                                                            onClick={() => handleSort(period, 'return_pct')}
                                                            className="text-center px-2 py-2 text-[9px] font-bold text-green-600 uppercase cursor-pointer hover:bg-green-50 transition-colors tracking-tighter"
                                                        >
                                                            Return<SortIndicator period={period} metric="return_pct" />
                                                        </th>
                                                        <th
                                                            onClick={() => handleSort(period, 'max_drawdown')}
                                                            className="text-center px-2 py-2 text-[9px] font-bold text-red-600 uppercase cursor-pointer hover:bg-red-50 transition-colors tracking-tighter"
                                                        >
                                                            DD%<SortIndicator period={period} metric="max_drawdown" />
                                                        </th>
                                                        <th
                                                            onClick={() => handleSort(period, 'total_trades')}
                                                            className="text-center px-2 py-2 text-[9px] font-bold text-gray-500 uppercase cursor-pointer hover:bg-gray-100 transition-colors tracking-tighter"
                                                        >
                                                            Trades<SortIndicator period={period} metric="total_trades" />
                                                        </th>
                                                        <th
                                                            onClick={() => handleSort(period, 'sharpe_ratio')}
                                                            className="text-center px-2 py-2 text-[9px] font-bold text-purple-600 uppercase border-r border-gray-200 cursor-pointer hover:bg-purple-50 transition-colors tracking-tighter"
                                                        >
                                                            Sharpe<SortIndicator period={period} metric="sharpe_ratio" />
                                                        </th>
                                                    </React.Fragment>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {getSortedResults().map((strategyResult, index) => (
                                                <tr key={strategyResult.strategy_id} className={`hover:bg-blue-50/40 transition-colors group ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                                                    <td className={`px-4 py-3 border-r border-gray-100 sticky left-0 z-10 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} group-hover:bg-blue-50 shadow-[2px_0_5px_rgba(0,0,0,0.01)]`}>
                                                        <div className="flex items-center justify-between gap-3">
                                                            <div className="min-w-0">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="font-bold text-gray-900 text-sm whitespace-nowrap overflow-hidden text-ellipsis">{strategyResult.strategy_name}</div>
                                                                    {(strategyResult.is_published || newlyPublished.has(strategyResult.strategy_id)) && (
                                                                        <Badge variant="outline" className="text-[8px] px-1.5 py-0 h-4 bg-green-50 text-green-700 border-green-200 uppercase font-black tracking-tighter">
                                                                            Live
                                                                        </Badge>
                                                                    )}
                                                                </div>
                                                                {results.optimized && strategyResult.periods[results.periods[0]]?.best_params && (
                                                                    <div className="text-[9px] font-bold text-purple-500 flex items-center gap-1 mt-0.5 uppercase tracking-tighter">
                                                                        <div className="w-1 h-1 rounded-full bg-purple-500" />
                                                                        Optimal Config
                                                                    </div>
                                                                )}
                                                            </div>
                                                            {results.optimized && strategyResult.periods[results.periods[0]]?.best_params && (
                                                                <div className="flex items-center gap-1">
                                                                    <Popover>
                                                                        <PopoverTrigger asChild>
                                                                            <button
                                                                                className="p-1.5 rounded-lg bg-white border border-gray-200 text-purple-600 hover:border-purple-300 hover:text-purple-700 transition-all transform hover:scale-110 shadow-sm"
                                                                                title="View Configuration"
                                                                            >
                                                                                <Eye size={12} strokeWidth={3} />
                                                                            </button>
                                                                        </PopoverTrigger>
                                                                        <PopoverContent className="w-64 p-3 bg-white border-gray-200 shadow-xl rounded-xl">
                                                                            <div className="space-y-3">
                                                                                <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                                                                                    <div className="p-1.5 bg-purple-50 text-purple-600 rounded-md">
                                                                                        <Settings size={14} />
                                                                                    </div>
                                                                                    <span className="text-xs font-black text-gray-800 uppercase tracking-widest">Optimized Params</span>
                                                                                </div>
                                                                                <div className="grid grid-cols-2 gap-y-2.5">
                                                                                    {Object.entries(strategyResult.periods[results.periods[0]].best_params!).map(([name, val]) => (
                                                                                        <React.Fragment key={name}>
                                                                                            <span className="text-[10px] font-bold text-gray-500 uppercase truncate pr-2">{name.replace(/_/g, ' ')}</span>
                                                                                            <span className="text-[10px] font-black text-purple-600 bg-purple-50 px-2 py-0.5 rounded-md text-center">{val}</span>
                                                                                        </React.Fragment>
                                                                                    ))}
                                                                                </div>
                                                                                <div className="pt-2 border-t border-gray-100">
                                                                                    <p className="text-[9px] text-gray-400 font-medium italic">
                                                                                        * Parameters found via Grid Search
                                                                                    </p>
                                                                                </div>
                                                                            </div>
                                                                        </PopoverContent>
                                                                    </Popover>

                                                                    <button
                                                                        onClick={() => handlePublishOptimization(
                                                                            strategyResult.strategy_id,
                                                                            strategyResult.strategy_name,
                                                                            strategyResult.periods[results.periods[0]].best_params!
                                                                        )}
                                                                        disabled={publishingStrategy === strategyResult.strategy_id || strategyResult.is_published || newlyPublished.has(strategyResult.strategy_id)}
                                                                        className={`p-1.5 rounded-lg transition-all transform hover:scale-110 disabled:opacity-50 disabled:scale-100 shadow-sm ${(strategyResult.is_published || newlyPublished.has(strategyResult.strategy_id))
                                                                                ? 'text-green-600 bg-green-50 border border-green-200'
                                                                                : 'bg-white border border-gray-200 text-blue-600 hover:border-blue-300 hover:text-blue-700'
                                                                            }`}
                                                                        title={(strategyResult.is_published || newlyPublished.has(strategyResult.strategy_id)) ? "Configuration Live" : `Publish optimized parameters`}
                                                                    >
                                                                        {publishingStrategy === strategyResult.strategy_id ? (
                                                                            <Loader2 size={12} className="animate-spin" />
                                                                        ) : (strategyResult.is_published || newlyPublished.has(strategyResult.strategy_id)) ? (
                                                                            <Check size={12} strokeWidth={3} />
                                                                        ) : (
                                                                            <Upload size={12} strokeWidth={3} />
                                                                        )}
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                    {results.periods.map(period => {
                                                        const m = strategyResult.periods[period] || {};
                                                        const hasError = m.error;
                                                        const returnPositive = (m.return_pct || 0) >= 0;

                                                        if (hasError) {
                                                            return (
                                                                <td key={`${period}-error`} colSpan={5} className="text-center px-2 py-3 text-gray-400 text-[10px] italic border-r border-gray-100">
                                                                    <div className="flex items-center justify-center gap-1 opacity-60">
                                                                        <AlertTriangle size={10} />
                                                                        {m.error}
                                                                    </div>
                                                                </td>
                                                            );
                                                        }

                                                        return (() => {
                                                            const winRateGood = (m.win_rate || 0) >= 55;
                                                            const sharpeGood = (m.sharpe_ratio || 0) >= 1.2;
                                                            const drawdownBad = Math.abs(m.max_drawdown || 0) >= 25;

                                                            return (
                                                                <React.Fragment key={period}>
                                                                    <td className={`text-center px-2 py-3 text-xs font-bold transition-colors ${winRateGood ? 'text-blue-700 bg-blue-50/20' : 'text-gray-500'}`}>
                                                                        {m.win_rate?.toFixed(0) || '-'}%
                                                                    </td>
                                                                    <td className={`text-center px-2 py-3 text-xs font-black transition-colors ${returnPositive ? 'text-green-700 bg-green-50/30' : 'text-red-700 bg-red-50/30'}`}>
                                                                        {returnPositive ? '+' : ''}{m.return_pct?.toFixed(1) || '0'}%
                                                                    </td>
                                                                    <td className={`text-center px-2 py-3 text-xs font-semibold transition-colors ${drawdownBad ? 'text-red-900 bg-red-100/50' : 'text-orange-600'}`}>
                                                                        {m.max_drawdown?.toFixed(0) || '0'}%
                                                                    </td>
                                                                    <td className="text-center px-2 py-3 text-[10px] font-medium text-gray-500">
                                                                        {m.total_trades || 0}
                                                                    </td>
                                                                    <td className={`text-center px-2 py-3 text-xs font-black border-r border-gray-100 transition-colors ${sharpeGood ? 'text-purple-700 bg-purple-50/40 shadow-[inset_0_0_10px_rgba(147,51,234,0.05)]' : 'text-purple-400/80'}`}>
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
                            </div>
                        ) : (
                            <div className="p-24 flex flex-col items-center justify-center text-center space-y-6 bg-gray-50/30 border-dashed border-2 border-gray-100 m-6 rounded-3xl">
                                <div className="relative">
                                    <div className="w-20 h-20 rounded-full bg-white shadow-xl flex items-center justify-center ring-8 ring-gray-100/50">
                                        <Activity size={36} className="text-gray-300" />
                                    </div>
                                    <div className="absolute -bottom-1 -right-1 bg-blue-500 text-white p-1.5 rounded-full shadow-lg border-2 border-white">
                                        <Play size={14} fill="white" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <h3 className="text-xl font-black text-gray-800 tracking-tight">Ready for Comparison</h3>
                                    <p className="text-sm text-gray-500 max-w-sm mx-auto font-medium">
                                        Select a symbol from the dropdown above and launch a comprehensive analysis of all your trading strategies across historical timeframes.
                                    </p>
                                </div>
                                <div className="flex gap-4">
                                    <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-white px-4 py-2 rounded-full border border-gray-100 shadow-sm">
                                        <TrendingUp size={12} className="text-green-500" />
                                        Profit Focus
                                    </div>
                                    <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-white px-4 py-2 rounded-full border border-gray-100 shadow-sm">
                                        <Zap size={12} className="text-purple-500" />
                                        Win Rate Priority
                                    </div>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </DashboardLayout>
    );
}
