'use client';

import React, { useState, useEffect, useRef } from 'react';
import api from '@/lib/api';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CompanySelect } from '@/components/CompanySelect';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Play, TrendingUp, TrendingDown, Activity, AlertTriangle, Zap, Settings, StopCircle, ChevronUp, ChevronDown, Upload, Check, Eye, ExternalLink, X } from 'lucide-react';
import { PageLoader } from '@/components/ui/StockLoader';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import Link from 'next/link';

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
    experiment_id?: number;
    error?: string;
    best_params?: Record<string, number>;
    optimized?: boolean;
}

interface StrategyResult {
    strategy_id: number;
    strategy_name: string;
    is_published: boolean;
    published_periods: string[];
    periods: Record<string, PeriodMetrics>;
}

interface ComparisonResults {
    symbol: string;
    periods: string[];
    results: StrategyResult[];
    optimized?: boolean;
}

const PERIODS = ['1Y', '3Y', '5Y'];

export default function StrategyComparePage() {
    const router = useRouter();
    const [symbol, setSymbol] = useState('');
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState<ComparisonResults | null>(null);
    const [strategies, setStrategies] = useState<Strategy[]>([]);
    const abortControllerRef = useRef<AbortController | null>(null);
    const [activePeriods, setActivePeriods] = useState<string[]>(['1Y', '3Y', '5Y']);
    const [sortConfig, setSortConfig] = useState<{ period: string; metric: string; direction: 'asc' | 'desc' } | null>({ period: '3Y', metric: 'win_rate', direction: 'desc' });
    const [newlyPublished, setNewlyPublished] = useState<Set<number>>(new Set());
    const [expandedStrategies, setExpandedStrategies] = useState<Set<number>>(new Set());
    const [forceRefresh, setForceRefresh] = useState(false);

    // Publish Dialog State
    const [isPublishDialogOpen, setIsPublishDialogOpen] = useState(false);
    const [publishTags, setPublishTags] = useState<string[]>([]);
    const [tagInput, setTagInput] = useState('');
    const [pendingPublish, setPendingPublish] = useState<{
        strategyId: number;
        strategyName: string;
        bestParams: any;
        period: string;
    } | null>(null);

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
                n_trials: 20, // Fewer trials for speed
                force_refresh: forceRefresh
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
    const [unpublishingStrategy, setUnpublishingStrategy] = useState<number | null>(null);
    const [newlyUnpublished, setNewlyUnpublished] = useState<Set<number>>(new Set());

    const initiatePublish = (
        strategyId: number,
        strategyName: string,
        bestParams: any,
        period: string
    ) => {
        setPendingPublish({ strategyId, strategyName, bestParams, period });

        // Set default tag based on period
        let defaultTags: string[] = [];
        if (period === '1Y') defaultTags = ['short term'];
        else if (period === '3Y') defaultTags = ['medium term'];
        else if (period === '5Y') defaultTags = ['long term'];

        setPublishTags(defaultTags);
        setTagInput('');
        setIsPublishDialogOpen(true);
    };

    const confirmPublish = async () => {
        if (!pendingPublish) return;

        const { strategyId, strategyName, bestParams, period } = pendingPublish;

        // Include any pending input as a tag
        const finalTags = [...publishTags];
        if (tagInput.trim()) {
            finalTags.push(tagInput.trim());
        }

        await handlePublishOptimization(strategyId, strategyName, bestParams, period, finalTags);

        setIsPublishDialogOpen(false);
        setPendingPublish(null);
    };

    const handlePublishOptimization = async (
        strategyId: number,
        strategyName: string,
        bestParams: any,
        period: string,
        tags: string[] = []
    ) => {
        if (!symbol) return;

        setPublishingStrategy(strategyId);
        try {
            const endpoint = `/api/stocks/strategies/${strategyId}/publish_optimized/`;
            await api.post(endpoint, {
                symbol,
                params: bestParams,
                period,
                tags
            });

            toast.success(`Published ${period} configuration for ${strategyName}`);

            // Update local state to reflect published status
            setNewlyPublished(prev => {
                const next = new Set(prev);
                next.add(strategyId);
                return next;
            });

            // Allow re-publishing or unpublishing right away?
            // Usually we'd want to refetch, but let's assume success updates backend state.
            // also remove from "newly unpublished" if it was there
            setNewlyUnpublished(prev => {
                const next = new Set(prev);
                next.delete(strategyId);
                return next;
            });

            setResults(prevResults => {
                if (!prevResults) return null;
                const updatedResults = prevResults.results.map(sr => {
                    if (sr.strategy_id === strategyId) {
                        return {
                            ...sr,
                            is_published: true,
                            published_periods: [...new Set([...(sr.published_periods || []), period])] // Ensure unique periods
                        };
                    }
                    return sr;
                });
                return { ...prevResults, results: updatedResults };
            });
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Failed to publish');
        } finally {
            setPublishingStrategy(null);
        }
    };

    const handleUnpublishOptimization = async (strategyId: number, strategyName: string, period: string) => {
        setUnpublishingStrategy(strategyId);
        try {
            await api.post(`/api/stocks/strategies/${strategyId}/unpublish_optimized/`, {
                symbol: symbol,
                period: period,
            });
            setNewlyUnpublished(prev => new Set(prev).add(strategyId));
            toast.success(`Unpublished ${strategyName} for ${period}`);
            // Update the results state to reflect the change
            setResults(prevResults => {
                if (!prevResults) return null;
                const updatedResults = prevResults.results.map(sr => {
                    if (sr.strategy_id === strategyId) {
                        return {
                            ...sr,
                            published_periods: sr.published_periods.filter(p => p !== period),
                            is_published: sr.published_periods.filter(p => p !== period).length > 0 // Set is_published to false if no periods are published
                        };
                    }
                    return sr;
                });
                return { ...prevResults, results: updatedResults };
            });
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Failed to unpublish');
        } finally {
            setUnpublishingStrategy(null);
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
            return { period, metric, direction: 'desc' }; // Default to DESC for new sorts
        });
    };

    // Get sorted results
    const getSortedResults = () => {
        if (!results) return [];

        // Default sort: 3Y Win Rate Desc, then Return % Desc
        const activeSort = sortConfig || { period: '3Y', metric: 'win_rate', direction: 'desc' };

        return [...results.results].sort((a, b) => {
            const aMetrics = a.periods[activeSort.period] || {};
            const bMetrics = b.periods[activeSort.period] || {};

            let aVal = 0, bVal = 0;
            switch (activeSort.metric) {
                case 'win_rate': aVal = aMetrics.win_rate || 0; bVal = bMetrics.win_rate || 0; break;
                case 'return_pct': aVal = aMetrics.return_pct || 0; bVal = bMetrics.return_pct || 0; break;
                case 'max_drawdown': aVal = aMetrics.max_drawdown || 0; bVal = bMetrics.max_drawdown || 0; break;
                case 'total_trades': aVal = aMetrics.total_trades || 0; bVal = bMetrics.total_trades || 0; break;
                case 'sharpe_ratio': aVal = aMetrics.sharpe_ratio || 0; bVal = bMetrics.sharpe_ratio || 0; break;
            }

            const diff = activeSort.direction === 'asc' ? aVal - bVal : bVal - aVal;

            // Secondary sort by Return % if Win Rate is equal (and we are sorting by win rate)
            if (Math.abs(diff) < 0.01 && activeSort.metric === 'win_rate') {
                const aRet = aMetrics.return_pct || 0;
                const bRet = bMetrics.return_pct || 0;
                return bRet - aRet; // Always desc for secondary return sort
            }

            return diff;
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

    const toggleStrategy = (strategyId: number) => {
        setExpandedStrategies(prev => {
            const next = new Set(prev);
            if (next.has(strategyId)) next.delete(strategyId);
            else next.add(strategyId);
            return next;
        });
    };

    return (
        <DashboardLayout
            title="Strategy Comparison"
            subtitle="Compare all strategies on a single symbol across time periods"
            showBack
        >
            <div className="w-full px-4 py-6">
                <Card className="border-gray-200 shadow-sm overflow-hidden">
                    <CardHeader className="py-6 px-6 bg-muted/40 border-b">
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
                                    <Label className="text-xs font-bold text-gray-500 uppercase whitespace-nowrap">View Filter</Label>
                                    <div className="flex gap-1.5">
                                        {PERIODS.map(p => (
                                            <Badge
                                                key={p}
                                                variant={activePeriods.includes(p) ? "default" : "outline"}
                                                className={`px-2 py-0.5 text-[10px] font-semibold cursor-pointer transition-all ${activePeriods.includes(p)
                                                    ? "bg-blue-600 hover:bg-blue-700 text-white border-transparent"
                                                    : "bg-white border-gray-200 hover:border-blue-300 text-gray-400"
                                                    }`}
                                                onClick={() => {
                                                    setActivePeriods(prev =>
                                                        prev.includes(p)
                                                            ? prev.filter(item => item !== p)
                                                            : [...prev, p]
                                                    );
                                                }}
                                            >
                                                {p}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>

                            </div>

                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2 mr-2">
                                    <label className="flex items-center gap-2 cursor-pointer group">
                                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${forceRefresh ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300 group-hover:border-blue-400'}`}>
                                            {forceRefresh && <Check size={10} className="text-white" strokeWidth={4} />}
                                        </div>
                                        <input
                                            type="checkbox"
                                            className="hidden"
                                            checked={forceRefresh}
                                            onChange={(e) => setForceRefresh(e.target.checked)}
                                        />
                                        <span className="text-[10px] font-bold text-gray-500 uppercase select-none group-hover:text-blue-600 transition-colors">Force Refresh</span>
                                    </label>
                                </div>

                                <Button
                                    onClick={() => handleRunComparison(true)}
                                    disabled={loading || !symbol}
                                    size="sm"
                                    className="h-9 px-4 bg-primary text-primary-foreground text-white hover:from-blue-700 hover:to-indigo-700 shadow-sm transition-all border-0 ring-offset-2 focus:ring-2 focus:ring-blue-500"
                                >
                                    <Zap size={14} className="mr-1.5" />
                                    Optimize & Run
                                </Button>
                            </div>
                        </div>
                    </CardHeader >

                    <CardContent className="p-0">
                        {loading ? (
                            <div className="p-20 flex flex-col items-center justify-center space-y-6 text-center bg-white/50 backdrop-blur-sm">
                                <PageLoader text="Analyzing market data..." />
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
                                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">Win Rate</span>
                                            <div className="flex items-center gap-1.5">
                                                <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                                <span className="text-[10px] font-bold text-blue-500">Benchmark Avg</span>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-center">
                                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">Return %</span>
                                            <div className="flex items-center gap-1.5">
                                                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                                <span className="text-[10px] font-bold text-green-500">Positive Trend</span>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-center">
                                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">Risk</span>
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
                                                <th rowSpan={2} className="text-left px-4 py-3 text-sm font-bold text-gray-600 uppercase tracking-wider border-r bg-gray-50 sticky left-0 z-20 min-w-[200px] shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                                                    Strategy Name
                                                </th>
                                                {results.periods.filter(p => activePeriods.includes(p)).map(period => (
                                                    <th key={period} colSpan={5} className="text-center px-2 py-2.5 text-sm font-bold text-gray-700 uppercase tracking-wider border-r border-gray-200 bg-gray-50/80">
                                                        {period} Historical Performance
                                                    </th>
                                                ))}
                                            </tr>
                                            <tr className="bg-white border-b border-gray-100">
                                                {results.periods.filter(p => activePeriods.includes(p)).map(period => (
                                                    <React.Fragment key={period}>
                                                        <th
                                                            onClick={() => handleSort(period, 'win_rate')}
                                                            className="text-center px-1 py-2 text-xs font-bold text-blue-600 uppercase cursor-pointer hover:bg-blue-50 transition-colors"
                                                        >
                                                            Win%<SortIndicator period={period} metric="win_rate" />
                                                        </th>
                                                        <th
                                                            onClick={() => handleSort(period, 'return_pct')}
                                                            className="text-center px-1 py-2 text-xs font-bold text-green-600 uppercase cursor-pointer hover:bg-green-50 transition-colors"
                                                        >
                                                            Return<SortIndicator period={period} metric="return_pct" />
                                                        </th>
                                                        <th
                                                            onClick={() => handleSort(period, 'max_drawdown')}
                                                            className="text-center px-1 py-2 text-xs font-bold text-red-600 uppercase cursor-pointer hover:bg-red-50 transition-colors"
                                                        >
                                                            DD%<SortIndicator period={period} metric="max_drawdown" />
                                                        </th>
                                                        <th
                                                            onClick={() => handleSort(period, 'total_trades')}
                                                            className="text-center px-1 py-2 text-xs font-bold text-gray-500 uppercase cursor-pointer hover:bg-gray-100 transition-colors"
                                                        >
                                                            Trades<SortIndicator period={period} metric="total_trades" />
                                                        </th>
                                                        <th
                                                            onClick={() => handleSort(period, 'sharpe_ratio')}
                                                            className="text-center px-1 py-2 text-xs font-bold text-purple-600 uppercase border-r border-gray-200 cursor-pointer hover:bg-purple-50 transition-colors"
                                                        >
                                                            Sharpe<SortIndicator period={period} metric="sharpe_ratio" />
                                                        </th>
                                                    </React.Fragment>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {getSortedResults().map((strategyResult, index) => {
                                                const isExpanded = expandedStrategies.has(strategyResult.strategy_id);

                                                return (
                                                    <React.Fragment key={strategyResult.strategy_id}>
                                                        <tr
                                                            onClick={() => toggleStrategy(strategyResult.strategy_id)}
                                                            className={`cursor-pointer hover:bg-blue-50/40 transition-colors group ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}
                                                        >
                                                            <td className={`px-4 py-3 border-r border-gray-100 sticky left-0 z-10 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} group-hover:bg-blue-50 shadow-[2px_0_5px_rgba(0,0,0,0.01)]`}>
                                                                <div className="flex flex-col min-w-0">
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="flex-1 min-w-0">
                                                                            <div className="font-bold text-gray-900 text-sm whitespace-nowrap overflow-hidden text-ellipsis flex items-center gap-1">
                                                                                {strategyResult.strategy_name}
                                                                                {strategyResult.is_published && (
                                                                                    <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 text-[9px] px-1 py-0 h-4 border-emerald-200">
                                                                                        Published
                                                                                    </Badge>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex-shrink-0">
                                                                            {isExpanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex items-center gap-2 mt-1">
                                                                        {results?.optimized && (
                                                                            <span className="text-[9px] text-blue-500 font-medium px-1 rounded bg-blue-50">Optimized</span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            {/* Period Columns */}
                                                            {results.periods.filter(p => activePeriods.includes(p)).map(period => {
                                                                const pMetrics = strategyResult.periods[period];

                                                                return (
                                                                    <React.Fragment key={period}>
                                                                        {pMetrics ? (
                                                                            <>
                                                                                <td className="text-center px-2 py-3 text-xs font-bold text-gray-500">
                                                                                    {pMetrics.win_rate?.toFixed(0) || '-'}%
                                                                                </td>
                                                                                <td className={`text-center px-2 py-3 text-xs font-semibold ${(pMetrics.return_pct || 0) > 0 ? 'text-green-700 bg-green-50/20' : 'text-red-700 bg-red-50/20'}`}>
                                                                                    {(pMetrics.return_pct || 0) > 0 ? '+' : ''}{(pMetrics.return_pct || 0).toFixed(1)}%
                                                                                </td>
                                                                                <td className="text-center px-2 py-3 text-xs font-semibold text-orange-600">
                                                                                    {pMetrics.max_drawdown?.toFixed(0) || '0'}%
                                                                                </td>
                                                                                <td className="text-center px-2 py-3 text-[10px] font-medium text-gray-400">
                                                                                    {pMetrics.total_trades || 0}
                                                                                </td>
                                                                                <td className="text-center px-2 py-3 text-xs border-r border-gray-100">
                                                                                    <div className="flex items-center justify-center gap-1">
                                                                                        <span className="text-purple-600 font-semibold">{pMetrics.sharpe_ratio?.toFixed(2)}</span>
                                                                                    </div>
                                                                                </td>
                                                                            </>
                                                                        ) : (
                                                                            <td colSpan={5} className="text-center py-3 text-gray-300 text-xs italic border-r">N/A</td>
                                                                        )}
                                                                    </React.Fragment>
                                                                );
                                                            })}
                                                        </tr>
                                                        {isExpanded && (
                                                            <tr className="bg-gray-50/50">
                                                                <td className="p-4 border-b border-gray-200 sticky left-0 z-20 bg-gray-50/95 border-r border-gray-200 align-top">
                                                                    <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Strategy Config</div>
                                                                    <p className="text-[10px] text-gray-400 leading-relaxed">
                                                                        Optimized parameters for each period are shown on the right.
                                                                    </p>
                                                                </td>
                                                                {results.periods.filter(p => activePeriods.includes(p)).map(period => {
                                                                    const pMetrics = strategyResult.periods[period];
                                                                    const isThisPeriodPublished = strategyResult.published_periods?.includes(period);

                                                                    if (!pMetrics?.best_params) {
                                                                        return <td key={period} colSpan={5} className="bg-gray-50 border-b border-gray-200 border-r border-gray-200"></td>;
                                                                    }

                                                                    return (
                                                                        <td key={period} colSpan={5} className="p-3 border-b border-gray-200 border-r border-gray-200 align-top bg-white">
                                                                            <div className="flex flex-col h-full justify-between gap-3">
                                                                                <div className="space-y-1.5">
                                                                                    {Object.entries(pMetrics.best_params).map(([key, value]) => (
                                                                                        <div key={key} className="flex items-center justify-between text-xs border-b border-gray-50 pb-1 last:border-0">
                                                                                            <span className="text-gray-500 font-medium truncate max-w-[80px]" title={key}>{key}</span>
                                                                                            <span className="font-mono font-bold text-gray-800 text-sm">{typeof value === 'number' ? value.toFixed(value % 1 !== 0 ? 2 : 0) : value}</span>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>

                                                                                <div className="pt-2 flex gap-2 justify-center">
                                                                                    {pMetrics.experiment_id && (
                                                                                        <button
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                router.push(`/strategies/${strategyResult.strategy_id}/experiments/${pMetrics.experiment_id}`);
                                                                                            }}
                                                                                            className="min-w-[80px] flex items-center justify-center gap-1.5 px-3 py-1 rounded text-[10px] font-bold uppercase transition-all bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300"
                                                                                        >
                                                                                            <Eye size={10} /> View Details
                                                                                        </button>
                                                                                    )}
                                                                                    <button
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            if (isThisPeriodPublished) {
                                                                                                handleUnpublishOptimization(strategyResult.strategy_id, strategyResult.strategy_name, period);
                                                                                            } else {
                                                                                                initiatePublish(
                                                                                                    strategyResult.strategy_id,
                                                                                                    strategyResult.strategy_name,
                                                                                                    pMetrics.best_params!,
                                                                                                    period
                                                                                                );
                                                                                            }
                                                                                        }}
                                                                                        disabled={publishingStrategy === strategyResult.strategy_id || unpublishingStrategy === strategyResult.strategy_id}
                                                                                        className={`min-w-[80px] flex items-center justify-center gap-1.5 px-3 py-1 rounded text-[10px] font-bold uppercase transition-all ${isThisPeriodPublished
                                                                                            ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
                                                                                            : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm border border-transparent'
                                                                                            } ${(publishingStrategy === strategyResult.strategy_id || unpublishingStrategy === strategyResult.strategy_id) ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                                                    >
                                                                                        {isThisPeriodPublished ? (
                                                                                            <>
                                                                                                <Zap size={10} className="fill-current" /> Unpublish
                                                                                            </>
                                                                                        ) : (
                                                                                            <>
                                                                                                <Upload size={10} /> Publish
                                                                                            </>
                                                                                        )}
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        </td>
                                                                    );
                                                                })}
                                                            </tr>
                                                        )}
                                                    </React.Fragment>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            <div className="p-24 flex flex-col items-center justify-center text-center space-y-6 bg-gray-50/30 border-dashed border-2 border-gray-100 m-6 rounded-xl">
                                <div className="relative">
                                    <div className="w-20 h-20 rounded-full bg-white shadow-xl flex items-center justify-center ring-8 ring-gray-100/50">
                                        <Activity size={36} className="text-gray-300" />
                                    </div>
                                    <div className="absolute -bottom-1 -right-1 bg-blue-500 text-white p-1.5 rounded-full shadow-lg border-2 border-white">
                                        <Play size={14} fill="white" />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <h3 className="text-xl font-semibold text-gray-800 tracking-tight">Ready for Comparison</h3>
                                    <p className="text-sm text-gray-500 max-w-sm mx-auto font-medium">
                                        Select a symbol from the dropdown above and launch a comprehensive analysis of all your trading strategies across historical timeframes.
                                    </p>
                                </div>
                                <div className="flex gap-4">
                                    <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-white px-4 py-2 rounded-full border border-gray-100 shadow-sm">
                                        <TrendingUp size={12} className="text-green-500" />
                                        Profit Focus
                                    </div>
                                    <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-white px-4 py-2 rounded-full border border-gray-100 shadow-sm">
                                        <Zap size={12} className="text-purple-500" />
                                        Win Rate Priority
                                    </div>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card >
            </div >
            {/* Publish Dialog */}
            <Dialog open={isPublishDialogOpen} onOpenChange={setIsPublishDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Publish Configuration</DialogTitle>
                        <DialogDescription>
                            Enter tags for this {pendingPublish?.period} configuration.
                        </DialogDescription>
                        <div className="py-2 space-y-3">
                            <div className="flex flex-wrap gap-2 mb-2">
                                {publishTags.map((tag, idx) => (
                                    <Badge key={idx} variant="secondary" className="px-2 py-1 gap-1 hover:bg-gray-200">
                                        {tag}
                                        <X
                                            size={12}
                                            className="cursor-pointer text-gray-500 hover:text-red-500"
                                            onClick={() => setPublishTags(prev => prev.filter((_, i) => i !== idx))}
                                        />
                                    </Badge>
                                ))}
                            </div>
                            <Input
                                value={tagInput}
                                onChange={(e) => setTagInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ',') {
                                        e.preventDefault();
                                        const val = tagInput.trim();
                                        if (val && !publishTags.includes(val)) {
                                            setPublishTags(prev => [...prev, val]);
                                            setTagInput('');
                                        }
                                    } else if (e.key === 'Backspace' && !tagInput && publishTags.length > 0) {
                                        setPublishTags(prev => prev.slice(0, -1));
                                    }
                                }}
                                placeholder="Type a tag and press Enter..."
                                className="mt-2"
                            />
                            <p className="text-[10px] text-gray-400">Press Enter or comma to add tag</p>
                        </div>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsPublishDialogOpen(false)}>Cancel</Button>
                        <Button onClick={confirmPublish}>Publish</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </DashboardLayout >
    );
}
