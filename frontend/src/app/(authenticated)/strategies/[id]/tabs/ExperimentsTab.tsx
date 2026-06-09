"use client";

import { useEffect, useState, Fragment } from "react";
import api from "@/lib/api";
import { format } from "date-fns";
import {
    Activity,
    Calendar,
    CheckCircle,
    XCircle,
    Beaker,
    Zap,
    Filter,
    ChevronDown,
    ChevronUp,
    Search,
    ExternalLink,
    AlertTriangle
} from "lucide-react";

import { toast } from 'sonner';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Experiment {
    id: number;
    strategy: number;
    strategy_name?: string;
    run_type: 'BACKTEST' | 'OPTIMIZATION';
    scope_type: 'SYMBOL' | 'SECTOR' | 'ALL';
    scope_value: string;
    start_date: string;
    end_date: string;
    parameters: any;
    metrics: any;
    status: 'SUCCESS' | 'FAILED';
    error_log: string;
    created_at: string;
    plot_html?: string;
    batch_id?: string;
    is_published?: boolean;
}

interface ExperimentsTabProps {
    strategyId?: number; // Optional now
}

export default function ExperimentsTab({ strategyId }: ExperimentsTabProps) {
    const [experiments, setExperiments] = useState<Experiment[]>([]);
    const [bestParams, setBestParams] = useState<any[]>([]);
    const [publishModalOpen, setPublishModalOpen] = useState(false);
    const [unpublishModalOpen, setUnpublishModalOpen] = useState(false);
    const [experimentToPublish, setExperimentToPublish] = useState<Experiment | null>(null);
    const [publishScopeType, setPublishScopeType] = useState<'ALL' | 'SECTOR' | 'SYMBOL'>('ALL');
    const [publishScopeValue, setPublishScopeValue] = useState('');
    // publishedConfig state removed: Logic moved to per-experiment flag
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [batchResults, setBatchResults] = useState<Record<string, Experiment[]>>({});

    // Pagination State
    const [page, setPage] = useState(1);
    const [hasNext, setHasNext] = useState(false);
    const [hasPrev, setHasPrev] = useState(false);

    useEffect(() => {
        fetchExperiments(page);
    }, [strategyId, page]);

    const fetchExperiments = async (currentPage = 1) => {
        setLoading(true);
        try {
            const params = { page: currentPage, page_size: 20 };

            if (strategyId) {
                // Strategy Specific
                const [expRes, bestRes, stratRes] = await Promise.all([
                    api.get(`/api/stocks/strategies/${strategyId}/experiments/`, { params }),
                    api.get(`/api/stocks/strategies/${strategyId}/best_parameters/`),
                    api.get(`/api/stocks/strategies/${strategyId}/`)
                ]);

                if (stratRes.data) {
                    // Strategy data fetched for context, but published state is now on experiments
                }

                if (expRes.data.results) {
                    setExperiments(expRes.data.results);
                    setHasNext(!!expRes.data.next);
                    setHasPrev(!!expRes.data.previous);
                } else {
                    setExperiments(expRes.data);
                    setHasNext(false); setHasPrev(false);
                }
                setBestParams(bestRes.data);
            } else {
                // Global Logs
                const response = await api.get('/api/stocks/strategies/all_experiments/', { params });
                if (response.data.results) {
                    setExperiments(response.data.results);
                    setHasNext(!!response.data.next);
                    setHasPrev(!!response.data.previous);
                } else {
                    setExperiments(response.data); // Fallback if regular list
                    setHasNext(false); setHasPrev(false);
                }
                setBestParams([]); // No best params for global view
            }
        } catch (error) {
            console.error("Failed to fetch experiments", error);
        } finally {
            setLoading(false);
        }
    };

    const toggleExpand = async (id: number) => {
        if (expandedId === id) {
            setExpandedId(null);
        } else {
            setExpandedId(id);
            const exp = experiments.find(e => e.id === id);

            // 1. Fetch detail for chart if missing
            if (exp && !exp.plot_html && exp.run_type === 'BACKTEST') {
                try {
                    const response = await api.get(`/api/stocks/strategies/experiment_detail/`, { params: { id } });
                    setExperiments(prev => prev.map(e => e.id === id ? { ...e, ...response.data } : e));
                } catch (error) {
                    console.error("Failed to fetch experiment detail", error);
                }
            }

            // 2. Fetch batch members if it's a parent run
            if (exp && exp.batch_id && exp.scope_type !== 'SYMBOL') {
                try {
                    const response = await api.get(`/api/stocks/strategies/experiment_detail/`, { params: { batch_id: exp.batch_id } });
                    setBatchResults(prev => ({ ...prev, [exp.batch_id!]: response.data }));
                } catch (error) {
                    console.error("Failed to fetch batch results", error);
                }
            }
        }
    };

    // Helper to format metrics display
    const renderMetrics = (exp: Experiment) => {
        if (exp.status === 'FAILED') return <span className="text-red-500">Failed</span>;

        const m = exp.metrics;
        if (!m) return <span>-</span>;

        // Handle Backtest metrics
        if (exp.run_type === 'BACKTEST') {
            // Single
            if (m.pnl_percent !== undefined) {
                return (
                    <span className={m.pnl_percent >= 0 ? "text-green-600 font-bold" : "text-red-600 font-bold"}>
                        {m.pnl_percent?.toFixed(2)}% Return
                    </span>
                );
            }
            // Aggregated (All/Sector)
            if (m.aggregated) {
                return (
                    <div className="flex flex-col text-xs">
                        <span className={m.aggregated.avg_return >= 0 ? "text-green-600 font-bold" : "text-red-600 font-bold"}>
                            Avg: {m.aggregated.avg_return?.toFixed(2)}%
                        </span>
                        <div className="text-xs text-gray-400">
                            Best: {m.aggregated.best_stock?.symbol} ({m.aggregated.best_stock?.return?.toFixed(2)}%)
                        </div>
                    </div>
                );
            }
        }

        // Handle Optimization metrics
        if (exp.run_type === 'OPTIMIZATION') {
            return (
                <span className="text-purple-600 font-bold">
                    Best: {m.best_return?.toFixed(2)}%
                </span>
            );
        }

        return <span>-</span>;
    };

    const handlePublish = (exp: Experiment) => {
        // Allow publishing if strategyId exists OR if experiment has strategy ID
        if (!strategyId && !exp.strategy) return;
        setExperimentToPublish(exp);
        // Default to experiment scope
        setPublishScopeType(exp.scope_type);
        setPublishScopeValue(exp.scope_value);
        setPublishModalOpen(true);
    };

    const handleUnpublish = (exp?: Experiment) => {
        // If passed an experiment (global view), we need to track it to unpublish its strategy
        if (exp) {
            setExperimentToPublish(exp); // Reuse this state as 'active experiment context' or create new state 'experimentToUnpublish'
            // Actually, handlePublish uses 'experimentToPublish'. Let's reuse it for context, or just rely on 'exp' passed to a new state?
            // To be safe and clean, let's use 'experimentToPublish' as 'selectedExperiment' generally
            setExperimentToPublish(exp);
        } else if (!strategyId) {
            return;
        }
        setUnpublishModalOpen(true);
    };

    const confirmUnpublish = async () => {
        const targetStratId = strategyId || experimentToPublish?.strategy;
        if (!targetStratId) return;

        try {
            await api.post(`/api/stocks/strategies/${targetStratId}/unpublish/`);
            toast.success("Strategy unpublished successfully.");
            // Refresh
            fetchExperiments(page);
            setUnpublishModalOpen(false);
        } catch (err) {
            toast.error("Failed to unpublish strategy.");
        }
    };

    const confirmPublish = async () => {
        if (!experimentToPublish) return;
        const targetStrategyId = strategyId || experimentToPublish.strategy;
        if (!targetStrategyId) return;

        try {
            await api.post(`/api/stocks/strategies/${targetStrategyId}/publish/`, {
                parameters: experimentToPublish.parameters,
                scope_type: publishScopeType, // Send selected scope
                scope_value: publishScopeValue, // Send selected value
                experiment_id: experimentToPublish.id // Link explicitly
            });
            toast.success("Strategy published successfully!");
            // Refresh experiments to update 'is_published' flags
            // Refresh experiments to update 'is_published' flags
            fetchExperiments(page);
            setPublishModalOpen(false);
        } catch (err) {
            toast.error("Failed to publish strategy.");
        }
    };

    if (loading) {
        return <div className="p-12 text-center text-gray-500 dark:text-slate-400">Loading experiments...</div>;
    }

    return (
        <div className="space-y-8 p-6">

            {/* Best Parameters Dashboard */}
            {strategyId && bestParams.length > 0 && (() => {
                // Deduplicate by symbol - keep only the best performing config per symbol
                const uniqueBySymbol = bestParams.reduce((acc: any[], item: any) => {
                    const existing = acc.find((x: any) => x.scope_value === item.scope_value);
                    if (!existing || item.return > existing.return) {
                        return [...acc.filter((x: any) => x.scope_value !== item.scope_value), item];
                    }
                    return acc;
                }, []);

                return (
                    <section>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-2 flex items-center gap-2">
                            <Zap className="text-amber-500" size={16} /> Top Performing Configurations
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
                            {uniqueBySymbol.map((item: any, idx) => (
                                <div key={idx} className="bg-white dark:bg-card border border-slate-200 dark:border-slate-800 rounded-lg p-3 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5">
                                    <div className="flex justify-between items-start mb-2">
                                        <Badge className="text-[10px] px-2 py-0 rounded-full bg-primary text-primary-foreground hover:opacity-90 text-white font-bold uppercase">
                                            {item.scope_type === 'ALL' ? 'Market' : item.scope_value}
                                        </Badge>
                                        <div className="text-right">
                                            <div className={`text-lg font-semibold ${item.return >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {item.return >= 0 ? '+' : ''}{item.return?.toFixed(1)}%
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mb-2 flex items-center justify-between">
                                        <span>{format(new Date(item.created_at), 'MMM d')}</span>
                                        <Badge variant="outline" className="text-[9px] px-1 py-0 font-bold">
                                            {item.run_type}
                                        </Badge>
                                    </div>
                                    <div className="border-t border-border dark:border-slate-800 pt-2">
                                        <div className="flex flex-wrap gap-1">
                                            {Object.entries(item.parameters || {}).map(([key, value]: [string, any]) => (
                                                <div key={key} className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 rounded text-[10px]">
                                                    <span className="text-slate-500 dark:text-slate-400">{key}:</span>{' '}
                                                    <span className="font-bold text-slate-900 dark:text-slate-100">{typeof value === 'number' ? (Number.isInteger(value) ? value : value.toFixed(1)) : String(value)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                );
            })()}

            {/* Experiment History Table */}
            <section>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100 flex items-center gap-2">
                        <Beaker className="text-purple-500" size={20} />
                        {strategyId ? 'Experiment History' : 'Global Experiment Log'}
                    </h3>
                    {!strategyId && (
                        <span className="text-xs text-gray-500 dark:text-slate-400 bg-gray-100 dark:bg-slate-800 px-2 py-1 rounded">
                            Showing latest runs across all strategies
                        </span>
                    )}
                </div>

                <div className="bg-white dark:bg-card border border-gray-200 dark:border-slate-800 rounded-lg overflow-hidden shadow-sm">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-800">
                        <thead className="bg-gray-50 dark:bg-slate-800">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">ID</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Date</th>
                                {!strategyId && (
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Strategy</th>
                                )}
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Type</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Scope</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Range</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Outcome</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">Action</th>
                                <th className="px-6 py-3"></th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-card divide-y divide-gray-200 dark:divide-slate-800 text-sm">
                            {experiments.length === 0 ? (
                                <tr>
                                    <td colSpan={strategyId ? 8 : 9} className="px-6 py-12 text-center text-gray-500 dark:text-slate-400">
                                        No experiments run yet. Run backtests or optimizations to populate this list.
                                    </td>
                                </tr>
                            ) : (
                                experiments
                                    .map((exp) => (
                                        <Fragment key={exp.id}>
                                            <tr
                                                className="hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer"
                                                onClick={() => toggleExpand(exp.id)}
                                            >
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    {exp.status === 'SUCCESS' ? (
                                                        <CheckCircle size={16} className="text-green-500" />
                                                    ) : (
                                                        <XCircle size={16} className="text-red-500" />
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-gray-500 dark:text-slate-400 font-mono text-xs">
                                                    <a
                                                        href={`/strategies/${exp.strategy}/experiments/${exp.id}`}
                                                        className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        #{exp.id} <ExternalLink size={10} />
                                                    </a>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-gray-900 dark:text-slate-100 font-medium">
                                                    {format(new Date(exp.created_at), 'MMM dd, HH:mm')}
                                                </td>
                                                {!strategyId && (
                                                    <td className="px-6 py-4 whitespace-nowrap text-gray-900 dark:text-slate-100 font-bold">
                                                        {exp.strategy_name}
                                                    </td>
                                                )}
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide
                                                        ${exp.run_type === 'BACKTEST' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'}`}>
                                                        {exp.run_type}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="text-sm font-bold text-gray-900 dark:text-slate-100">{exp.scope_value}</div>
                                                    <div className="text-xs text-gray-400 dark:text-slate-500 font-medium uppercase tracking-wider">{exp.scope_type}</div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500 dark:text-slate-400">
                                                    {exp.start_date}<br />{exp.end_date}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    {renderMetrics(exp)}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex items-center gap-2">
                                                        <a
                                                            href={`/strategies/${strategyId || exp.strategy}/experiments/${exp.id}`}
                                                            className="text-[10px] font-bold uppercase tracking-wider text-gray-600 dark:text-slate-300 bg-gray-50 dark:bg-slate-800 hover:bg-gray-100 dark:hover:bg-slate-700 border border-gray-200 dark:border-slate-700 px-2 py-1 rounded transition-colors flex items-center gap-1"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            View
                                                        </a>
                                                        {exp.is_published ? (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleUnpublish(exp);
                                                                }}
                                                                className="text-[10px] font-bold uppercase tracking-wider text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 px-2 py-1 rounded transition-colors"
                                                            >
                                                                Unpublish
                                                            </button>
                                                        ) : (
                                                            (strategyId || exp.strategy) && (
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handlePublish(exp);
                                                                    }}
                                                                    className="text-[10px] font-bold uppercase tracking-wider text-purple-600 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-2 py-1 rounded transition-colors"
                                                                >
                                                                    Publish
                                                                </button>
                                                            )
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-right text-gray-400 dark:text-slate-500">
                                                    {expandedId === exp.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                                </td>
                                            </tr>
                                            {/* EXPANDED DETAILS RENDERING ... */}
                                            {expandedId === exp.id && (
                                                <tr>
                                                    <td colSpan={strategyId ? 8 : 9} className="px-0 py-0 border-b bg-gray-50 dark:bg-slate-800/50">
                                                        {/* Content of expansion */}
                                                        {/* ... I will skip attempting to match inner content exactly to avoid large context mismatch, trusting that I replaced the wrapper Map. ... */}
                                                        {/* WAIT. Using ReplaceContent needs exact TargetContent. I should be careful. */}
                                                        <div className="flex flex-col gap-6">
                                                            {/* Batch Results Table */}
                                                            {exp.batch_id && exp.scope_type !== 'SYMBOL' && batchResults[exp.batch_id] && (
                                                                <div className="bg-white dark:bg-card border border-gray-200 dark:border-slate-800 rounded-lg overflow-hidden shadow-sm">
                                                                    <div className="bg-gray-50 dark:bg-slate-800 px-4 py-2 border-b dark:border-slate-700">
                                                                        <h4 className="text-xs font-bold text-gray-700 dark:text-slate-300 uppercase">Individual Symbol Outcomes ({batchResults[exp.batch_id].filter(e => e.scope_type === 'SYMBOL').length})</h4>
                                                                    </div>
                                                                    <div className="max-h-60 overflow-auto">
                                                                        <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-800 text-xs text-left">
                                                                            <thead className="bg-gray-50/50 dark:bg-slate-800/50 sticky top-0">
                                                                                <tr>
                                                                                    <th className="px-4 py-2">ID</th>
                                                                                    <th className="px-4 py-2">Symbol</th>
                                                                                    <th className="px-4 py-2">Return</th>
                                                                                    <th className="px-4 py-2">Win Rate</th>
                                                                                    <th className="px-4 py-2">Trades</th>
                                                                                    <th className="px-4 py-2">Status</th>
                                                                                </tr>
                                                                            </thead>
                                                                            <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                                                                                {[...(batchResults[exp.batch_id] || [])]
                                                                                    .filter(child => child.scope_type === 'SYMBOL')
                                                                                    .sort((a, b) => (b.metrics?.pnl_percent || 0) - (a.metrics?.pnl_percent || 0))
                                                                                    .map(child => (
                                                                                        <tr
                                                                                            key={child.id}
                                                                                            className="hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer group"
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                window.open(`/strategies/${strategyId || child.strategy}/experiments/${child.id}`, '_blank');
                                                                                            }}
                                                                                        >
                                                                                            <td className="px-4 py-2 font-mono text-xs text-gray-500 dark:text-slate-400">
                                                                                                <a
                                                                                                    href={`/strategies/${strategyId || child.strategy}/experiments/${child.id}`}
                                                                                                    className="hover:underline flex items-center gap-1"
                                                                                                    onClick={(e) => e.stopPropagation()}
                                                                                                >
                                                                                                    #{child.id}
                                                                                                </a>
                                                                                            </td>
                                                                                            <td className="px-4 py-2 font-bold group-hover:text-blue-600 dark:group-hover:text-blue-400 flex items-center gap-2">
                                                                                                {child.scope_value}
                                                                                                <ExternalLink size={12} className="opacity-0 group-hover:opacity-100" />
                                                                                            </td>
                                                                                            <td className={`px-4 py-2 font-medium ${child.metrics.pnl_percent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                                                                {child.metrics.pnl_percent?.toFixed(2)}%
                                                                                            </td>
                                                                                            <td className="px-4 py-2">{child.metrics.win_rate?.toFixed(1)}%</td>
                                                                                            <td className="px-4 py-2">{child.metrics.total_trades}</td>
                                                                                            <td className="px-4 py-2">
                                                                                                <div className="flex items-center justify-between">
                                                                                                    {child.status === 'SUCCESS' ? <CheckCircle size={14} className="text-green-500" /> : <XCircle size={14} className="text-red-500" />}
                                                                                                    <button className="text-[10px] text-blue-600 dark:text-blue-400 font-bold opacity-0 group-hover:opacity-100 uppercase">View Detail</button>
                                                                                                </div>
                                                                                            </td>
                                                                                        </tr>
                                                                                    ))}
                                                                            </tbody>
                                                                        </table>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* Chart Section */}
                                                            {exp.plot_html && (
                                                                <div className="w-full bg-white dark:bg-card border dark:border-slate-800 rounded-xl overflow-hidden shadow-inner" style={{ height: '700px' }}>
                                                                    <iframe
                                                                        title={`Backtest Plot ${exp.id}`}
                                                                        srcDoc={exp.plot_html}
                                                                        className="w-full h-full border-0"
                                                                        sandbox="allow-scripts"
                                                                    />
                                                                </div>
                                                            )}

                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                                <div>
                                                                    <div className="flex justify-between items-center mb-3">
                                                                        <h4 className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase flex items-center gap-1">
                                                                            <Zap size={14} className="text-amber-500" /> Parameters
                                                                        </h4>
                                                                    </div>
                                                                    <div className="flex flex-wrap gap-2">
                                                                        {Object.entries(exp.parameters || {}).map(([key, value]: [string, any]) => (
                                                                            <div key={key} className="bg-white dark:bg-card border border-gray-200 dark:border-slate-800 px-3 py-2 rounded-lg shadow-sm flex flex-col min-w-[120px]">
                                                                                <span className="text-[10px] text-gray-400 dark:text-slate-500 uppercase font-bold">{key.replace(/_/g, ' ')}</span>
                                                                                <span className="text-sm font-semibold text-gray-800 dark:text-slate-200">
                                                                                    {typeof value === 'number' ?
                                                                                        (Number.isInteger(value) ? value : value.toFixed(2)) :
                                                                                        String(value)}
                                                                                </span>
                                                                            </div>
                                                                        ))}
                                                                        {Object.keys(exp.parameters || {}).length === 0 && (
                                                                            <span className="text-gray-400 dark:text-slate-500 text-sm italic">No parameters defined</span>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                <div>
                                                                    <h4 className="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase mb-3 flex items-center gap-1">
                                                                        <Activity size={14} className="text-blue-500" /> Outcome Analysis
                                                                    </h4>
                                                                    <div className="bg-white dark:bg-card border border-gray-200 dark:border-slate-800 rounded-lg p-4 shadow-sm">
                                                                        {exp.run_type === 'BACKTEST' ? (
                                                                            exp.metrics.aggregated ? (
                                                                                <div className="space-y-4">
                                                                                    <div className="grid grid-cols-3 gap-2 border-b pb-3">
                                                                                        <div>
                                                                                            <p className="text-[10px] text-gray-400 dark:text-slate-500 uppercase font-bold">Avg Return</p>
                                                                                            <p className={`text-lg font-bold ${exp.metrics.aggregated.avg_return >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                                                                {exp.metrics.aggregated.avg_return?.toFixed(2)}%
                                                                                            </p>
                                                                                        </div>
                                                                                        <div>
                                                                                            <p className="text-[10px] text-gray-400 dark:text-slate-500 uppercase font-bold">Win Rate</p>
                                                                                            <p className="text-lg font-bold text-gray-800 dark:text-slate-200">{exp.metrics.aggregated.avg_win_rate?.toFixed(1)}%</p>
                                                                                        </div>
                                                                                        <div>
                                                                                            <p className="text-[10px] text-gray-400 dark:text-slate-500 uppercase font-bold">Total Trades</p>
                                                                                            <p className="text-lg font-bold text-gray-800 dark:text-slate-200">{exp.metrics.aggregated.total_trades}</p>
                                                                                        </div>
                                                                                    </div>
                                                                                    <div>
                                                                                        <p className="text-[10px] text-gray-400 dark:text-slate-500 uppercase font-bold mb-2">Performance Breakdown</p>
                                                                                        <div className="flex flex-col gap-2">
                                                                                            <div className="flex justify-between items-center text-sm p-2 bg-green-50 rounded border border-green-100">
                                                                                                <span className="text-green-800 font-medium">Top Symbol</span>
                                                                                                <span className="font-bold">{exp.metrics.aggregated.best_stock?.symbol} ({exp.metrics.aggregated.best_stock?.return?.toFixed(2)}%)</span>
                                                                                            </div>
                                                                                            <div className="flex justify-between items-center text-sm p-2 bg-red-50 rounded border border-red-100">
                                                                                                <span className="text-red-800 font-medium">Weakest Symbol</span>
                                                                                                <span className="font-bold">{exp.metrics.aggregated.worst_stock?.symbol} ({exp.metrics.aggregated.worst_stock?.return?.toFixed(2)}%)</span>
                                                                                            </div>
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                            ) : (
                                                                                exp.metrics.categorized ? (
                                                                                    <div className="space-y-4">
                                                                                        {Object.entries(exp.metrics.categorized).map(([category, metrics]: [string, any]) => (
                                                                                            <div key={category}>
                                                                                                <p className="text-[10px] text-gray-400 uppercase font-bold mb-1.5">{category}</p>
                                                                                                <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2">
                                                                                                    {Object.entries(metrics).map(([label, value]: [string, any]) => (
                                                                                                        <div key={label} className="flex flex-col">
                                                                                                            <span className="text-[10px] text-gray-500 dark:text-slate-400">{label}</span>
                                                                                                            <span className="text-xs font-bold text-gray-800 dark:text-slate-200 font-mono">{String(value)}</span>
                                                                                                        </div>
                                                                                                    ))}
                                                                                                </div>
                                                                                            </div>
                                                                                        ))}
                                                                                    </div>
                                                                                ) : (
                                                                                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                                                                                        {['pnl_percent', 'win_rate', 'total_trades', 'max_drawdown', 'sharpe_ratio', 'total_pnl'].map(key => (
                                                                                            exp.metrics[key] !== undefined && (
                                                                                                <div key={key}>
                                                                                                    <p className="text-[10px] text-gray-400 dark:text-slate-500 uppercase font-bold">{key.replace(/_/g, ' ')}</p>
                                                                                                    <p className={`text-sm font-bold ${(key.includes('pnl') || key.includes('return')) ?
                                                                                                        (exp.metrics[key] >= 0 ? 'text-green-600' : 'text-red-600') :
                                                                                                        'text-gray-800 dark:text-slate-200'
                                                                                                        }`}>
                                                                                                        {key.includes('percent') || key.includes('rate') || key.includes('drawdown') ?
                                                                                                            `${exp.metrics[key]?.toFixed(2)}%` :
                                                                                                            (typeof exp.metrics[key] === 'number' ? exp.metrics[key].toFixed(2) : exp.metrics[key])}
                                                                                                    </p>
                                                                                                </div>
                                                                                            )
                                                                                        ))}
                                                                                    </div>
                                                                                )
                                                                            )
                                                                        ) : (
                                                                            /* Optimization Metrics */
                                                                            <div className="space-y-4">
                                                                                <div className="flex justify-between items-center border-b pb-2">
                                                                                    <span className="text-xs text-gray-500 dark:text-slate-400 font-bold uppercase">Best Return</span>
                                                                                    <span className="text-lg font-bold text-purple-600 dark:text-purple-400">{exp.metrics.best_return?.toFixed(2)}%</span>
                                                                                </div>
                                                                                <div>
                                                                                    <p className="text-[10px] text-gray-400 dark:text-slate-500 uppercase font-bold mb-2">Optimal Configuration</p>
                                                                                    <div className="bg-purple-50 dark:bg-purple-900/20 p-2 rounded border border-purple-100 dark:border-purple-800 font-mono text-xs text-purple-900 dark:text-purple-300 overflow-x-auto">
                                                                                        {JSON.stringify(exp.metrics.best_params, null, 2)}
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        )}

                                                                        {exp.error_log && (
                                                                            <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-[10px] flex items-start gap-2">
                                                                                <XCircle size={14} className="mt-0.5 flex-shrink-0" />
                                                                                <div>
                                                                                    <p className="font-bold uppercase tracking-tight">Execution Error</p>
                                                                                    <p className="mt-0.5 line-clamp-3">{exp.error_log}</p>
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </Fragment>
                                    ))
                            )}
                        </tbody>
                    </table>
                    {/* Pagination Controls */}
                    <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/50">
                        <div className="text-xs text-gray-500 dark:text-slate-400 font-medium">
                            Showing page {page}
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={!hasPrev || loading}
                                className="px-3 py-1 text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-slate-300 bg-white dark:bg-card border border-gray-200 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                Previous
                            </button>
                            <button
                                onClick={() => setPage(p => p + 1)}
                                disabled={!hasNext || loading}
                                className="px-3 py-1 text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 bg-white dark:bg-card border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            <Dialog open={publishModalOpen} onOpenChange={setPublishModalOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Publish Strategy Configuration</DialogTitle>
                        <DialogDescription>
                            Review the configuration and performance metrics below. Publishing this will set these parameters as the active configuration for generating buy/sell recommendations.
                        </DialogDescription>
                    </DialogHeader>

                    {experimentToPublish && (
                        <div className="space-y-6 py-4">
                            {/* Scope Selection Section */}
                            <div>
                                <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-2">
                                    <Filter size={14} className="text-blue-500" /> Recommendation Scope
                                </h4>
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="radio"
                                            id="scope_all"
                                            name="scope"
                                            checked={publishScopeType === 'ALL'}
                                            onChange={() => { setPublishScopeType('ALL'); setPublishScopeValue('ALL'); }}
                                            disabled={experimentToPublish.scope_type !== 'ALL'} // Can only publish ALL if tested on ALL (safest assumption)
                                            className="accent-purple-600"
                                        />
                                        <label htmlFor="scope_all" className={`text-sm font-medium ${experimentToPublish.scope_type !== 'ALL' ? 'text-gray-400' : 'text-gray-900'}`}>
                                            All Market <span className="text-gray-400 font-normal text-xs ml-1">(Requires global backtest)</span>
                                        </label>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <input
                                            type="radio"
                                            id="scope_sector"
                                            name="scope"
                                            checked={publishScopeType === 'SECTOR'}
                                            onChange={() => { setPublishScopeType('SECTOR'); setPublishScopeValue(experimentToPublish.scope_type === 'SECTOR' ? experimentToPublish.scope_value : ''); }}
                                            disabled={experimentToPublish.scope_type === 'SYMBOL'} // Can't publish Sector if only tested on Symbol
                                            className="accent-purple-600"
                                        />
                                        <label htmlFor="scope_sector" className={`text-sm font-medium ${experimentToPublish.scope_type === 'SYMBOL' ? 'text-gray-400' : 'text-gray-900'}`}>
                                            Specific Sector
                                        </label>
                                        {publishScopeType === 'SECTOR' && (
                                            <input
                                                type="text"
                                                value={publishScopeValue}
                                                onChange={(e) => setPublishScopeValue(e.target.value)}
                                                placeholder="e.g. Commercial Banks"
                                                className="ml-2 border border-gray-300 rounded px-2 py-1 text-xs w-48"
                                            />
                                        )}
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <input
                                            type="radio"
                                            id="scope_symbol"
                                            name="scope"
                                            checked={publishScopeType === 'SYMBOL'}
                                            onChange={() => { setPublishScopeType('SYMBOL'); setPublishScopeValue(experimentToPublish.scope_type === 'SYMBOL' ? experimentToPublish.scope_value : ''); }}
                                            className="accent-purple-600"
                                        />
                                        <label htmlFor="scope_symbol" className="text-sm font-medium text-gray-900">
                                            Specific Symbol(s)
                                        </label>
                                        {publishScopeType === 'SYMBOL' && (
                                            <input
                                                type="text"
                                                value={publishScopeValue}
                                                onChange={(e) => setPublishScopeValue(e.target.value)}
                                                placeholder="e.g. NABIL, NICA"
                                                className="ml-2 border border-gray-300 rounded px-2 py-1 text-xs w-48"
                                            />
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Parameters Section */}
                            <div>
                                <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-2">
                                    <Zap size={14} className="text-amber-500" /> Configuration Parameters
                                </h4>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                    {Object.entries(experimentToPublish.parameters || {}).map(([key, value]) => (
                                        <div key={key} className="bg-gray-50 border border-gray-100 p-2 rounded">
                                            <span className="text-[10px] text-gray-500 uppercase font-bold block mb-0.5">{key.replace(/_/g, ' ')}</span>
                                            <span className="text-sm font-mono font-bold text-gray-900 break-all">{String(value)}</span>
                                        </div>
                                    ))}
                                    {Object.keys(experimentToPublish.parameters || {}).length === 0 && (
                                        <span className="text-sm text-gray-500 italic">No parameters defined</span>
                                    )}
                                </div>
                            </div>

                            {/* Metrics Section */}
                            <div>
                                <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-2">
                                    <Activity size={14} className="text-blue-500" /> Performance Metrics
                                </h4>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                                        <span className="text-[10px] text-gray-400 font-bold uppercase block mb-1">Return</span>
                                        <span className={`text-xl font-semibold ${experimentToPublish.metrics.pnl_percent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            {experimentToPublish.metrics.pnl_percent?.toFixed(2)}%
                                        </span>
                                    </div>
                                    <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                                        <span className="text-[10px] text-gray-400 font-bold uppercase block mb-1">Win Rate</span>
                                        <span className="text-xl font-bold text-gray-900">
                                            {experimentToPublish.metrics.win_rate?.toFixed(1)}%
                                        </span>
                                    </div>
                                    <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                                        <span className="text-[10px] text-gray-400 font-bold uppercase block mb-1">Drawdown</span>
                                        <span className="text-xl font-bold text-red-600">
                                            {experimentToPublish.metrics.max_drawdown?.toFixed(2)}%
                                        </span>
                                    </div>
                                    <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
                                        <span className="text-[10px] text-gray-400 font-bold uppercase block mb-1">Sharpe</span>
                                        <span className="text-xl font-bold text-gray-900">
                                            {experimentToPublish.metrics.sharpe_ratio?.toFixed(2)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPublishModalOpen(false)}>Cancel</Button>
                        <Button onClick={confirmPublish} className="bg-purple-600 hover:bg-purple-700">Confirm & Publish</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={unpublishModalOpen} onOpenChange={setUnpublishModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="text-red-600 flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5" /> Unpublish Strategy
                        </DialogTitle>
                        <DialogDescription>
                            Are you sure you want to unpublish this strategy?
                            <br /><br />
                            This will <strong>stop generating new recommendations</strong> and allow you to edit the strategy code again.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setUnpublishModalOpen(false)}>Cancel</Button>
                        <Button onClick={confirmUnpublish} variant="destructive">Unpublish Strategy</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div >
    );
}
