"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import DashboardLayout from "@/components/DashboardLayout";
import { MetricsDisplay } from '../../../components/MetricsDisplay';
import {
    Activity,
    ArrowLeft,
    Calendar,
    Zap,
    TrendingUp,
    CheckCircle,
    XCircle,
    Info,
    Search,
    RotateCw,
    Layers,
    BarChart3
} from "lucide-react";
import { PageLoader } from '@/components/ui/StockLoader';
import { toast } from 'sonner';
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";

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
    siblings?: { id: number; symbol: string }[];
}

export default function ExperimentDetailPage() {
    const params = useParams();
    const router = useRouter();
    const strategyId = params.id;
    const expId = params.expId;

    const [experiment, setExperiment] = useState<Experiment | null>(null);
    const [batchChildren, setBatchChildren] = useState<Experiment[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (expId) {
            fetchDetail();
        }
    }, [expId]);

    const fetchDetail = async () => {
        setLoading(true);
        try {
            const response = await api.get(`/api/stocks/strategies/experiment_detail/`, { params: { id: expId } });
            const data = response.data;
            setExperiment(data);

            // If this represents a Batch (Sector/All) run, fetch children details
            if (data.batch_id && (data.scope_type === 'SECTOR' || data.scope_type === 'ALL')) {
                try {
                    const batchRes = await api.get(`/api/stocks/strategies/experiment_detail/`, { params: { batch_id: data.batch_id } });
                    // Filter out the parent itself and ensure only SYMBOL scopes
                    const children = batchRes.data.filter((e: Experiment) => e.scope_type === 'SYMBOL');
                    setBatchChildren(children);
                } catch (err) {
                    console.error("Failed to fetch batch children", err);
                }
            }
        } catch (error) {
            console.error("Failed to fetch experiment detail", error);
        } finally {
            setLoading(false);
        }
    };

    const handleRerun = async () => {
        if (!experiment) return;

        try {
            // First, fetch the strategy to get its code
            const strategyResponse = await api.get(`/api/stocks/strategies/${strategyId}/`);
            const strategyCode = strategyResponse.data.code;

            if (!strategyCode) {
                toast.error('Strategy code not found');
                return;
            }

            // Build payload based on backend expectations
            const payload: any = {
                code: strategyCode,
                start_date: experiment.start_date,
                end_date: experiment.end_date,
                parameters: experiment.parameters
            };

            // Backend expects either 'symbol' or 'sector' keys, not scope_value/scope_type
            if (experiment.scope_type === 'SYMBOL') {
                payload.symbol = experiment.scope_value;
            } else if (experiment.scope_type === 'SECTOR' || experiment.scope_type === 'ALL') {
                payload.sector = experiment.scope_value;
            }

            // For optimization, include additional fields
            if (experiment.run_type === 'OPTIMIZATION') {
                // Add optimization-specific fields if needed
                payload.n_trials = 50; // Default value, can be made configurable
            }

            const endpoint = experiment.run_type === 'BACKTEST'
                ? `/api/stocks/strategies/${strategyId}/backtest/`
                : `/api/stocks/strategies/${strategyId}/optimize/`;

            toast.promise(
                api.post(endpoint, payload),
                {
                    loading: 'Starting new run...',
                    success: (response) => {
                        // For backtest, the response structure varies
                        // For single symbol: response contains the direct backtest result
                        // For sector/all: response contains batch_id and results

                        // Try to find the experiment ID from the response
                        // The backend saves experiments automatically, but doesn't always return the ID
                        // We'll redirect back to the experiments list for now
                        setTimeout(() => {
                            router.push(`/strategies/${strategyId}?tab=experiments`);
                        }, 1500);

                        return 'Strategy rerun initiated successfully! Redirecting to experiments...';
                    },
                    error: (err) => {
                        console.error('Rerun error:', err);
                        return `Failed to rerun strategy: ${err.response?.data?.error || err.message}`;
                    }
                }
            );
        } catch (error) {
            console.error('Failed to rerun experiment:', error);
            toast.error('An unexpected error occurred');
        }
    };

    if (loading) {
        return (
            <DashboardLayout>
                <div className="flex items-center justify-center min-h-[60vh]">
                    <PageLoader text="Loading analysis..." />
                </div>
            </DashboardLayout>
        );
    }

    if (!experiment) {
        return (
            <DashboardLayout>
                <div className="p-12 text-center">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Analysis not found</h2>
                    <p className="text-gray-500 dark:text-slate-400 mt-2">The requested experiment could not be retrieved.</p>
                    <Button
                        variant="outline"
                        className="mt-6"
                        onClick={() => router.back()}
                    >
                        <ArrowLeft size={16} className="mr-2" /> Go Back
                    </Button>
                </div>
            </DashboardLayout>
        );
    }


    // Helper to prepare stats for MetricsDisplay
    const getDisplayStats = () => {
        if (!experiment.metrics) return {};

        // If optimization, stats might be nested or need mapping
        if (experiment.run_type === 'OPTIMIZATION' && experiment.metrics.stats) {
            return {
                ...experiment.metrics.stats,
                // Ensure top-level fallback keys exist if needed
                id: experiment.id
            };
        }

        return experiment.metrics;
    };

    const displayStats = getDisplayStats();

    return (
        <DashboardLayout
            title={`${experiment.strategy_name || 'Strategy'} Analysis`}
            subtitle={`Run ${experiment.id} • ${new Date(experiment.created_at).toLocaleDateString()}`}
            showBack={true}
        >
            <div className="space-y-6 p-4 md:p-6">
                {/* 1. Command Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-card p-4 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-sm">
                    <div className="flex items-center gap-4">
                        <div className="h-12 w-12 bg-gray-100 dark:bg-slate-800 rounded-xl flex items-center justify-center text-gray-700 dark:text-slate-300 font-bold text-xl border border-gray-200 dark:border-slate-700">
                            {experiment.scope_value.slice(0, 2)}
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
                                {experiment.scope_value}
                                <Badge variant="outline" className="text-xs font-medium text-gray-500 dark:text-slate-400 bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700">
                                    {experiment.scope_type}
                                </Badge>
                            </h1>
                            <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-slate-400 font-medium">
                                <span className={`flex items-center gap-1.5 ${experiment.status === 'SUCCESS' ? 'text-green-600' : 'text-red-600'}`}>
                                    {experiment.status === 'SUCCESS' ? <CheckCircle size={14} /> : <XCircle size={14} />}
                                    {experiment.status}
                                </span>
                                <span className="h-3 w-px bg-gray-300 dark:bg-slate-700" />
                                <span className="flex items-center gap-1.5">
                                    <Calendar size={14} />
                                    {experiment.start_date} – {experiment.end_date}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {experiment.siblings && experiment.siblings.length > 0 && (
                            <div className="hidden md:flex items-center gap-2 bg-gray-50 dark:bg-slate-800 p-1 pr-3 rounded-lg border border-gray-200 dark:border-slate-700">
                                <div className="p-1.5 bg-white dark:bg-card rounded-md shadow-sm border border-gray-100 dark:border-slate-700 text-gray-500 dark:text-slate-400">
                                    <Layers size={14} />
                                </div>
                                <Select
                                    onValueChange={(val) => router.push(`/strategies/${strategyId}/experiments/${val}`)}
                                >
                                    <SelectTrigger className="w-[140px] bg-transparent border-none shadow-none h-8 p-0 text-sm font-medium focus:ring-0">
                                        <SelectValue placeholder="Switch Symbol" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {experiment.siblings.map(sib => (
                                            <SelectItem key={sib.id} value={sib.id.toString()}>
                                                {sib.symbol}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        <Button
                            onClick={handleRerun}
                            className="bg-gray-900 dark:bg-slate-800 hover:bg-gray-800 dark:hover:bg-slate-700 text-white font-medium shadow-sm transition-all"
                        >
                            <RotateCw size={16} className="mr-2" />
                            Rerun
                        </Button>
                    </div>
                </div>

                {batchChildren.length > 0 ? (
                    <div className="w-full">
                        <Card className="border border-gray-200 dark:border-slate-800 shadow-sm bg-white dark:bg-card rounded-xl overflow-visible">
                            <CardHeader className="border-b border-gray-100 dark:border-slate-800 py-4 px-6 flex flex-row items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded">
                                        <Layers size={16} />
                                    </div>
                                    <h3 className="font-semibold text-gray-900 dark:text-slate-100">Batch Breakdown</h3>
                                </div>
                                <Button variant="outline" size="sm" onClick={() => { }}>
                                    Export CSV
                                </Button>
                            </CardHeader>
                            <div className="p-0 overflow-x-auto">
                                <Table>
                                    <thead className="bg-gray-50/50 dark:bg-slate-800/50">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Symbol</th>
                                            <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Return</th>
                                            <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Win Rate</th>
                                            <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Trades</th>
                                            <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                                        {batchChildren
                                            .sort((a, b) => b.metrics.pnl_percent - a.metrics.pnl_percent)
                                            .map((child) => (
                                                <TableRow key={child.id} className="hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
                                                    <TableCell className="px-6 py-3 font-medium text-gray-900 dark:text-slate-100">
                                                        {child.scope_value}
                                                    </TableCell>
                                                    <TableCell className={`px-6 py-3 text-right font-mono font-semibold ${(child.metrics.pnl_percent || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                        {(child.metrics.pnl_percent || 0).toFixed(2)}%
                                                    </TableCell>
                                                    <TableCell className="px-6 py-3 text-right font-mono text-gray-700 dark:text-slate-300">
                                                        {(child.metrics.win_rate || 0).toFixed(1)}%
                                                    </TableCell>
                                                    <TableCell className="px-6 py-3 text-right font-mono text-gray-700 dark:text-slate-300">
                                                        {child.metrics.total_trades || 0}
                                                    </TableCell>
                                                    <TableCell className="px-6 py-3 text-right">
                                                        <a href={`/strategies/${strategyId}/experiments/${child.id}`} target="_blank" className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-xs font-bold">View</a>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                    </tbody>
                                </Table>
                            </div>
                        </Card>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                        {/* Left Panel: Parameters & Context */}
                        <div className="xl:col-span-3 space-y-6">
                            {/* Summary Tiles */}
                            <Card className="border border-gray-200 dark:border-slate-800 shadow-sm bg-white dark:bg-card rounded-xl overflow-hidden">
                                <CardHeader className="bg-gray-50/50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-800 py-3 px-4">
                                    <CardTitle className="text-sm font-bold text-gray-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                                        <BarChart3 size={14} className="text-blue-500" /> Key Metrics
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <div className="divide-y divide-gray-100 dark:divide-slate-800">
                                        <div className="flex flex-col p-4 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wide">Return</span>
                                                <TrendingUp size={16} className={(displayStats.pnl_percent || displayStats['Return [%]'] || 0) >= 0 ? "text-green-500" : "text-red-500"} />
                                            </div>
                                            <span className={`text-xl font-bold font-mono ${(displayStats.pnl_percent || displayStats['Return [%]'] || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                                                {(displayStats.pnl_percent || displayStats['Return [%]'] || 0).toFixed(2)}%
                                            </span>
                                        </div>
                                        <div className="flex flex-col p-4 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wide">Win Rate</span>
                                                <CheckCircle size={16} className="text-blue-500" />
                                            </div>
                                            <span className="text-xl font-bold font-mono text-gray-900 dark:text-slate-100">
                                                {(displayStats.win_rate || displayStats['Win Rate [%]'] || 0).toFixed(1)}%
                                            </span>
                                        </div>
                                        <div className="flex flex-col p-4 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wide">Max Drawdown</span>
                                                <Activity size={16} className="text-red-500" />
                                            </div>
                                            <span className="text-xl font-bold font-mono text-red-600">
                                                {(displayStats.max_drawdown || displayStats['Max. Drawdown [%]'] || 0).toFixed(2)}%
                                            </span>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="border border-gray-200 dark:border-slate-800 shadow-sm bg-white dark:bg-card rounded-xl overflow-hidden">
                                <CardHeader className="bg-gray-50/50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-800 py-3 px-4">
                                    <CardTitle className="text-sm font-bold text-gray-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                                        <Zap size={14} className="text-blue-500" /> Parameters
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <div className="divide-y divide-gray-100 dark:divide-slate-800">
                                        {Object.entries(experiment.parameters || {}).map(([key, value]: [string, any]) => (
                                            <div key={key} className="flex flex-col p-3 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
                                                <span className="text-[10px] uppercase font-bold text-gray-400 dark:text-slate-500 mb-0.5 tracking-wider">
                                                    {key.replace(/_/g, ' ')}
                                                </span>
                                                <span className="text-sm font-mono font-medium text-gray-800 dark:text-slate-200">
                                                    {String(value)}
                                                </span>
                                            </div>
                                        ))}
                                        {Object.keys(experiment.parameters || {}).length === 0 && (
                                            <div className="p-4 text-sm text-gray-400 dark:text-slate-500 text-center italic">Default Parameters</div>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="border border-blue-100 dark:border-blue-900/30 shadow-sm bg-muted/40 rounded-xl overflow-hidden">
                                <CardContent className="p-5">
                                    <h3 className="text-blue-900 dark:text-blue-300 font-semibold mb-3 flex items-center gap-2">
                                        <Info size={16} /> Run Details
                                    </h3>
                                    <dl className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <dt className="text-blue-700/70 dark:text-blue-400/70">Type</dt>
                                            <dd className="font-medium text-blue-900 dark:text-blue-200">{experiment.run_type}</dd>
                                        </div>
                                        <div className="flex justify-between">
                                            <dt className="text-blue-700/70 dark:text-blue-400/70">Engine</dt>
                                            <dd className="font-medium text-blue-900 dark:text-blue-200">Backtesting.py</dd>
                                        </div>
                                    </dl>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Right Panel: Standardized Metrics Display */}
                        <div className="xl:col-span-9">
                            <MetricsDisplay
                                stats={getDisplayStats()}
                                plotHtml={experiment.plot_html}
                                strategyId={Array.isArray(strategyId) ? strategyId[0] : (strategyId || '')}
                                experimentId={experiment.id}
                                chartHeight="750px"
                            />
                        </div>
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}
