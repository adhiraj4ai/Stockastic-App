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
    Search
} from "lucide-react";

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
}

interface ExperimentsTabProps {
    strategyId?: number; // Optional now
}

export default function ExperimentsTab({ strategyId }: ExperimentsTabProps) {
    const [experiments, setExperiments] = useState<Experiment[]>([]);
    const [bestParams, setBestParams] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<number | null>(null);

    useEffect(() => {
        fetchExperiments();
    }, [strategyId]);

    const fetchExperiments = async () => {
        setLoading(true);
        try {
            if (strategyId) {
                // Strategy Specific
                const [expRes, bestRes] = await Promise.all([
                    api.get(`/api/stocks/strategies/${strategyId}/experiments/`),
                    api.get(`/api/stocks/strategies/${strategyId}/best_parameters/`)
                ]);
                setExperiments(expRes.data);
                setBestParams(bestRes.data);
            } else {
                // Global Logs
                const response = await api.get('/api/stocks/strategies/all_experiments/');
                setExperiments(response.data.results || response.data); // Handle pagination if present
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
            // Fetch detail if not already present (e.g., if we only have the summary from the list)
            const exp = experiments.find(e => e.id === id);
            if (exp && !exp.plot_html && exp.run_type === 'BACKTEST') {
                try {
                    const response = await api.get(`/api/stocks/strategies/experiment_detail/`, { params: { id } });
                    setExperiments(prev => prev.map(e => e.id === id ? { ...e, ...response.data } : e));
                } catch (error) {
                    console.error("Failed to fetch experiment detail", error);
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
                        <span className="text-gray-500">
                            Best: {m.aggregated.best_stock?.symbol} ({m.aggregated.best_stock?.return?.toFixed(2)}%)
                        </span>
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

    if (loading) {
        return <div className="p-12 text-center text-gray-500">Loading experiments...</div>;
    }

    return (
        <div className="space-y-8 p-6">

            {/* Best Parameters Dashboard (Only for Strategy View) */}
            {strategyId && bestParams.length > 0 && (
                <section>
                    <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <Zap className="text-amber-500" size={20} /> Top Performing Configurations
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {bestParams.map((item: any, idx) => (
                            <div key={idx} className="bg-white border text-sm border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex justify-between items-start mb-2">
                                    <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800 uppercase">
                                        {item.scope_type === 'ALL' ? 'Market Wide' : item.scope_value}
                                    </span>
                                    <span className={item.return >= 0 ? "text-green-600 font-bold" : "text-red-600 font-bold"}>
                                        {item.return?.toFixed(2)}%
                                    </span>
                                </div>
                                <div className="text-xs text-gray-500 mb-2">
                                    {format(new Date(item.date), 'MMM d, yyyy')} • {item.run_type}
                                </div>
                                <div className="bg-gray-50 p-2 rounded text-xs font-mono text-gray-700 overflow-x-auto">
                                    {JSON.stringify(item.parameters, null, 2)}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* Experiment History Table */}
            <section>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <Beaker className="text-purple-500" size={20} />
                        {strategyId ? 'Experiment History' : 'Global Experiment Log'}
                    </h3>
                    {!strategyId && (
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                            Showing latest runs across all strategies
                        </span>
                    )}
                </div>

                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                {!strategyId && (
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Strategy</th>
                                )}
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Scope</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Range</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Outcome</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-3"></th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200 text-sm">
                            {experiments.length === 0 ? (
                                <tr>
                                    <td colSpan={strategyId ? 7 : 8} className="px-6 py-12 text-center text-gray-500">
                                        No experiments run yet. Run backtests or optimizations to populate this list.
                                    </td>
                                </tr>
                            ) : (
                                experiments.map((exp) => (
                                    <Fragment key={exp.id}>
                                        <tr
                                            className="hover:bg-gray-50 cursor-pointer"
                                            onClick={() => toggleExpand(exp.id)}
                                        >
                                            <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                                                {format(new Date(exp.created_at), 'MMM d, HH:mm')}
                                            </td>
                                            {!strategyId && (
                                                <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                                                    {exp.strategy_name || `ID: ${exp.strategy}`}
                                                </td>
                                            )}
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span className={`px-2 py-0.5 rounded text-xs font-semibold ${exp.run_type === 'OPTIMIZATION'
                                                    ? 'bg-purple-100 text-purple-800'
                                                    : 'bg-blue-100 text-blue-800'
                                                    }`}>
                                                    {exp.run_type}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="font-medium text-gray-900">
                                                    {exp.scope_value === 'ALL' ? 'All Market' : exp.scope_value}
                                                </div>
                                                <div className="text-xs text-gray-500">{exp.scope_type}</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-gray-500 text-xs">
                                                {exp.start_date} <br /> {exp.end_date}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                {renderMetrics(exp)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                {exp.status === 'SUCCESS' ? (
                                                    <CheckCircle size={16} className="text-green-500" />
                                                ) : (
                                                    <XCircle size={16} className="text-red-500" />
                                                )}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-gray-400">
                                                {expandedId === exp.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                            </td>
                                        </tr>
                                        {expandedId === exp.id && (
                                            <tr className="bg-gray-50">
                                                <td colSpan={strategyId ? 7 : 8} className="px-6 py-4">
                                                    <div className="flex flex-col gap-6">
                                                        {/* Chart Section */}
                                                        {exp.plot_html && (
                                                            <div className="w-full bg-white border rounded-xl overflow-hidden shadow-inner" style={{ height: '400px' }}>
                                                                <iframe
                                                                    title={`Backtest Plot ${exp.id}`}
                                                                    srcDoc={exp.plot_html}
                                                                    className="w-full h-full border-0"
                                                                    sandbox="allow-scripts"
                                                                />
                                                            </div>
                                                        )}

                                                        <div className="grid grid-cols-2 gap-6">
                                                            <div>
                                                                <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Parameters</h4>
                                                                <pre className="bg-white p-3 rounded border border-gray-200 text-xs overflow-x-auto">
                                                                    {JSON.stringify(exp.parameters, null, 2)}
                                                                </pre>
                                                            </div>
                                                            <div>
                                                                <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Detailed Metrics</h4>
                                                                <pre className="bg-white p-3 rounded border border-gray-200 text-xs overflow-x-auto max-h-60 overflow-y-auto">
                                                                    {JSON.stringify(exp.run_type === 'BACKTEST' && exp.metrics.individual
                                                                        ? { ...exp.metrics, individual: '[Truncated list of ' + exp.metrics.individual.length + ']' }
                                                                        : exp.metrics,
                                                                        null, 2)}
                                                                </pre>
                                                                {exp.error_log && (
                                                                    <div className="mt-2 text-red-600 text-xs">
                                                                        <strong>Error:</strong> {exp.error_log}
                                                                    </div>
                                                                )}
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
                </div>
            </section>
        </div>
    );
}
