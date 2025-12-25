"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import DashboardLayout from "@/components/DashboardLayout";
import {
    Activity,
    ArrowLeft,
    Calendar,
    Zap,
    TrendingUp,
    CheckCircle,
    XCircle,
    Info,
    Search
} from "lucide-react";
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

    if (loading) {
        return (
            <DashboardLayout>
                <div className="flex items-center justify-center min-h-[60vh]">
                    <div className="animate-pulse flex flex-col items-center gap-4">
                        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                            <Activity className="text-blue-600 animate-spin" size={24} />
                        </div>
                        <p className="text-gray-500 font-medium">Loading analysis...</p>
                    </div>
                </div>
            </DashboardLayout>
        );
    }

    if (!experiment) {
        return (
            <DashboardLayout>
                <div className="p-12 text-center">
                    <h2 className="text-2xl font-bold text-gray-900">Analysis not found</h2>
                    <p className="text-gray-500 mt-2">The requested experiment could not be retrieved.</p>
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

    return (
        <DashboardLayout
            title={`${experiment.strategy_name} Strategy`}
            subtitle={`Run ID: EXP-${experiment.id} • Run Date: ${new Date(experiment.created_at).toLocaleDateString()}`}
            showBack={true}
        >
            <div className="max-w-[1600px] mx-auto space-y-8 p-6">
                {/* Compact Context Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-6">
                    <div className="flex items-center gap-6">
                        <div>
                            <h1 className="text-3xl font-black text-gray-900 tracking-tight leading-none mb-1">
                                {experiment.scope_value}
                            </h1>
                            <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Selected Symbol</p>
                        </div>

                        <div className="h-10 w-px bg-gray-200 hidden md:block" />

                        <div className="flex items-center gap-2">
                            <Badge variant={experiment.metrics.pnl_percent >= 0 ? "default" : "destructive"} className="text-md font-bold text-white px-4 py-1.5 rounded-full shadow-sm">
                                {experiment.metrics.pnl_percent?.toFixed(2)}% Return
                            </Badge>
                            {experiment.status === 'SUCCESS' ? (
                                <div className="flex items-center gap-1.5 text-green-600 bg-green-50 px-3 py-1.5 rounded-full text-xs font-bold ring-1 ring-green-100">
                                    <CheckCircle size={14} /> SUCCESS
                                </div>
                            ) : (
                                <div className="flex items-center gap-1.5 text-red-600 bg-red-50 px-3 py-1.5 rounded-full text-xs font-bold ring-1 ring-red-100">
                                    <XCircle size={14} /> FAILED
                                </div>
                            )}
                        </div>
                        <div className="h-4 w-px bg-gray-200 hidden md:block" />
                        <div className="text-sm font-medium text-gray-500 flex items-center gap-1.5">
                            <Calendar size={14} className="text-gray-400" />
                            {experiment.start_date} to {experiment.end_date}
                        </div>
                    </div>

                    {experiment.siblings && experiment.siblings.length > 0 && (
                        <div className="flex items-center gap-3 bg-white p-2 pl-4 rounded-2xl border border-gray-100 shadow-sm">
                            <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Switch Batch Symbol</span>
                            <Select
                                onValueChange={(val) => router.push(`/strategies/${strategyId}/experiments/${val}`)}
                            >
                                <SelectTrigger className="w-[180px] bg-gray-50/50 border-none shadow-none rounded-xl h-9 focus:ring-0">
                                    <div className="flex items-center gap-2">
                                        <Search size={12} className="text-gray-400" />
                                        <SelectValue placeholder="Select Symbol" />
                                    </div>
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
                </div>

                {/* High-Level Stat Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Card className="border-none shadow-lg shadow-blue-900/5 bg-white rounded-3xl overflow-hidden group hover:shadow-xl transition-all duration-300">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between mb-2">
                                <div className="p-2 bg-green-50 text-green-600 rounded-xl group-hover:scale-110 transition-transform">
                                    <TrendingUp size={20} />
                                </div>
                                <Badge variant="outline" className="text-[10px] font-bold text-green-600 border-green-100 bg-green-50/50">
                                    {experiment.metrics?.aggregated ? 'BATCH PERFORMANCE' : 'PERFORMANCE'}
                                </Badge>
                            </div>
                            <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">
                                {experiment.metrics?.aggregated ? 'Avg. Batch Return' : 'Total Return'}
                            </p>
                            <h3 className={`text-2xl font-black ${(experiment.metrics?.aggregated ? experiment.metrics.aggregated.avg_return : experiment.metrics.pnl_percent) >= 0 ? 'text-green-600' : 'text-red-600'} tracking-tight`}>
                                {experiment.metrics?.aggregated
                                    ? `${experiment.metrics.aggregated.avg_return?.toFixed(2)}%`
                                    : `${experiment.metrics.pnl_percent?.toFixed(2)}%`
                                }
                            </h3>
                        </CardContent>
                    </Card>

                    <Card className="border-none shadow-lg shadow-blue-900/5 bg-white rounded-3xl overflow-hidden group hover:shadow-xl transition-all duration-300">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between mb-2">
                                <div className="p-2 bg-blue-50 text-blue-600 rounded-xl group-hover:scale-110 transition-transform">
                                    <CheckCircle size={20} />
                                </div>
                                <Badge variant="outline" className="text-[10px] font-bold text-blue-600 border-blue-100 bg-blue-50/50">
                                    {experiment.metrics?.aggregated ? 'BATCH SCOPE' : 'RELIABILITY'}
                                </Badge>
                            </div>
                            <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">
                                {experiment.metrics?.aggregated ? 'Success Rate' : 'Win Rate'}
                            </p>
                            <h3 className="text-2xl font-black text-gray-900 tracking-tight">
                                {experiment.metrics?.aggregated
                                    ? `${((experiment.metrics.successful_backtests / experiment.metrics.total_companies) * 100).toFixed(0)}%`
                                    : `${experiment.metrics.win_rate?.toFixed(1)}%`
                                }
                            </h3>
                        </CardContent>
                    </Card>

                    <Card className="border-none shadow-lg shadow-blue-900/5 bg-white rounded-3xl overflow-hidden group hover:shadow-xl transition-all duration-300">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between mb-2">
                                <div className="p-2 bg-purple-50 text-purple-600 rounded-xl group-hover:scale-110 transition-transform">
                                    <Zap size={20} />
                                </div>
                                <Badge variant="outline" className="text-[10px] font-bold text-purple-600 border-purple-100 bg-purple-50/50">
                                    {experiment.metrics?.aggregated ? 'BATCH AVG' : 'EFFICIENCY'}
                                </Badge>
                            </div>
                            <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">
                                {experiment.metrics?.aggregated ? 'Avg. Win Rate' : 'Sharpe Ratio'}
                            </p>
                            <h3 className="text-2xl font-black text-gray-900 tracking-tight">
                                {experiment.metrics?.aggregated
                                    ? `${experiment.metrics.aggregated.avg_win_rate?.toFixed(1)}%`
                                    : (experiment.metrics.sharpe_ratio?.toFixed(2) || 'N/A')
                                }
                            </h3>
                        </CardContent>
                    </Card>

                    <Card className="border-none shadow-lg shadow-blue-900/5 bg-white rounded-3xl overflow-hidden group hover:shadow-xl transition-all duration-300">
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between mb-2">
                                <div className="p-2 bg-amber-50 text-amber-600 rounded-xl group-hover:scale-110 transition-transform">
                                    <Activity size={20} />
                                </div>
                                <Badge variant="outline" className="text-[10px] font-bold text-amber-600 border-amber-100 bg-amber-50/50">VOLUME</Badge>
                            </div>
                            <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">
                                {experiment.metrics?.aggregated ? 'Total Batch Trades' : 'Total Trades'}
                            </p>
                            <h3 className="text-2xl font-black text-gray-900 tracking-tight">
                                {experiment.metrics?.aggregated
                                    ? experiment.metrics.aggregated.total_trades
                                    : experiment.metrics.total_trades
                                }
                            </h3>
                        </CardContent>
                    </Card>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
                    {/* Left Column: Stats & Params */}
                    <div className="xl:col-span-1 space-y-6">
                        <Card className="border-none shadow-xl shadow-blue-900/5 bg-gradient-to-br from-white to-blue-50/30 overflow-hidden rounded-3xl">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-xs font-black text-blue-900/40 uppercase tracking-widest flex items-center gap-2">
                                    <TrendingUp size={14} /> Performance
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <p className="text-[10px] text-gray-400 uppercase font-bold">Win Rate</p>
                                        <p className="text-2xl font-black text-gray-900">{experiment.metrics.win_rate?.toFixed(1)}%</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] text-gray-400 uppercase font-bold">Total Trades</p>
                                        <p className="text-2xl font-black text-gray-900">{experiment.metrics.total_trades}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] text-gray-400 uppercase font-bold">Max Drawdown</p>
                                        <p className="text-2xl font-black text-red-500">{experiment.metrics.max_drawdown?.toFixed(2)}%</p>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-[10px] text-gray-400 uppercase font-bold">Profit Factor</p>
                                        <p className="text-2xl font-black text-blue-600">{experiment.metrics.profit_factor?.toFixed(2)}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-none shadow-xl shadow-gray-900/5 rounded-3xl">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                    <Zap size={14} className="text-amber-500" /> Parameters
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-3">
                                    {Object.entries(experiment.parameters || {}).map(([key, value]: [string, any]) => (
                                        <div key={key} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0 text-sm">
                                            <span className="text-gray-500 capitalize">{key.replace(/_/g, ' ')}</span>
                                            <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">{String(value)}</span>
                                        </div>
                                    ))}
                                    {Object.keys(experiment.parameters || {}).length === 0 && (
                                        <p className="text-sm text-gray-400 italic">No custom parameters</p>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        <div className="bg-blue-600 rounded-[2rem] p-6 text-white shadow-2xl shadow-blue-500/20 relative overflow-hidden group">
                            <div className="relative z-10">
                                <h3 className="text-white/60 text-xs font-black uppercase tracking-widest mb-4">Quick Insights</h3>
                                <div className="space-y-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center">
                                            <TrendingUp size={16} />
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-white/60 uppercase font-bold">Strategy Type</p>
                                            <p className="text-sm font-bold">{experiment.run_type}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center">
                                            <Info size={16} />
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-white/60 uppercase font-bold">Scope</p>
                                            <p className="text-sm font-bold">{experiment.scope_type}</p>
                                        </div>
                                    </div>
                                    {experiment.metrics?.aggregated && (
                                        <div className="pt-4 mt-4 border-t border-white/10 space-y-3">
                                            <p className="text-[10px] text-white/40 uppercase font-bold tracking-widest">Batch Averages</p>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <p className="text-[10px] text-white/60 font-medium">Avg Win Rate</p>
                                                    <p className="text-sm font-bold">{experiment.metrics.aggregated.avg_win_rate?.toFixed(1)}%</p>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] text-white/60 font-medium">Total Trades</p>
                                                    <p className="text-sm font-bold">{experiment.metrics.aggregated.total_trades}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] text-white/60 font-medium">Best Performer</p>
                                                    <p className="text-sm font-bold text-green-300">{experiment.metrics.aggregated.best_stock?.symbol}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] text-white/60 font-medium">Worst Performer</p>
                                                    <p className="text-sm font-bold text-red-300">{experiment.metrics.aggregated.worst_stock?.symbol}</p>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                            {/* Decoration */}
                            <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 bg-white/5 rounded-full blur-2xl group-hover:bg-white/10 transition-colors" />
                        </div>
                    </div>

                    {/* Right Column: immersive Chart & Categorized Metrics */}
                    <div className="xl:col-span-3 space-y-6">
                        {/* Interactive Equity Curve or Batch Table */}
                        {batchChildren.length > 0 ? (
                            <Card className="border-none shadow-2xl shadow-gray-900/10 overflow-hidden bg-white rounded-3xl">
                                <div className="px-6 py-4 border-b border-gray-50 flex justify-between items-center bg-gray-50/20">
                                    <div className="flex items-center gap-3">
                                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                                        <h3 className="text-sm font-black text-gray-700 uppercase tracking-widest">Individual Symbol Breakdown</h3>
                                    </div>
                                    <Badge variant="outline" className="text-[10px] font-black tracking-widest bg-white border-gray-100 px-3 py-1">
                                        {batchChildren.length} SYMBOLS
                                    </Badge>
                                </div>
                                <div className="p-0 overflow-x-auto">
                                    <Table>
                                        <thead className="bg-gray-50/50">
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Symbol</th>
                                                <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Return</th>
                                                <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Win Rate</th>
                                                <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Trades</th>
                                                <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {batchChildren
                                                .sort((a, b) => b.metrics.pnl_percent - a.metrics.pnl_percent)
                                                .map((child) => (
                                                    <TableRow key={child.id} className="hover:bg-blue-50/30 transition-colors group">
                                                        <TableCell className="px-6 py-4 whitespace-nowrap">
                                                            <div className="font-bold text-gray-900">{child.scope_value}</div>
                                                            <div className="text-[10px] text-gray-400 font-mono">#{child.id}</div>
                                                        </TableCell>
                                                        <TableCell className="px-6 py-4 whitespace-nowrap text-right">
                                                            <span className={`font-mono font-bold ${(child.metrics.pnl_percent || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                                {(child.metrics.pnl_percent || 0).toFixed(2)}%
                                                            </span>
                                                        </TableCell>
                                                        <TableCell className="px-6 py-4 whitespace-nowrap text-right font-mono font-bold text-gray-700">
                                                            {(child.metrics.win_rate || 0).toFixed(1)}%
                                                        </TableCell>
                                                        <TableCell className="px-6 py-4 whitespace-nowrap text-right font-mono font-bold text-gray-700">
                                                            {child.metrics.total_trades || 0}
                                                        </TableCell>
                                                        <TableCell className="px-6 py-4 whitespace-nowrap text-right">
                                                            <a
                                                                href={`/strategies/${strategyId}/experiments/${child.id}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-blue-600 hover:text-blue-800 text-xs font-bold uppercase tracking-wide hover:underline"
                                                            >
                                                                View Analysis &rarr;
                                                            </a>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                        </tbody>
                                    </Table>
                                </div>
                            </Card>
                        ) : (
                            <Card className="border-none shadow-2xl shadow-gray-900/10 overflow-hidden h-[850px] flex flex-col bg-white rounded-3xl">
                                <div className="px-6 py-4 border-b border-gray-50 flex justify-between items-center bg-gray-50/20">
                                    <div className="flex items-center gap-3">
                                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                                        <h3 className="text-sm font-black text-gray-700 uppercase tracking-widest">Interactive Equity Curve & Signal Visualization</h3>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Badge variant="outline" className="text-[10px] font-black tracking-widest bg-white border-gray-100 px-3 py-1">FULL IMMERSION</Badge>
                                    </div>
                                </div>
                                <div className="flex-1 relative">
                                    {experiment.plot_html ? (
                                        <iframe
                                            title={`Backtest Analysis Plot`}
                                            srcDoc={experiment.plot_html}
                                            className="w-full h-full border-0 absolute inset-0"
                                            sandbox="allow-scripts"
                                        />
                                    ) : (
                                        <div className="h-full flex flex-col items-center justify-center text-gray-400 bg-gray-50/50">
                                            <Activity size={64} className="mb-4 opacity-5" />
                                            <p className="font-medium">Visualization not available for this run</p>
                                        </div>
                                    )}
                                </div>
                            </Card>
                        )}

                        {/* Categorized Metrics Display */}
                        <div className="space-y-6">
                            {experiment.metrics?.categorized ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {Object.entries(experiment.metrics.categorized).map(([category, items]: [string, any]) => (
                                        <Card key={category} className="border-none shadow-xl shadow-gray-900/5 bg-white overflow-hidden rounded-3xl">
                                            <CardHeader className="border-b border-gray-50 bg-gray-50/30">
                                                <CardTitle className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                                    <Info size={14} className="text-blue-500" /> {category}
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent className="p-0">
                                                <Table>
                                                    <TableBody>
                                                        {Object.entries(items).map(([key, value]: [string, any]) => (
                                                            <TableRow key={key} className="hover:bg-blue-50/30 transition-colors border-b border-gray-50 last:border-0">
                                                                <TableCell className="py-2.5 pl-6 text-xs text-gray-600 font-medium whitespace-nowrap">
                                                                    {key}
                                                                </TableCell>
                                                                <TableCell className="py-2.5 pr-6 text-right font-mono font-bold text-gray-900 text-xs">
                                                                    {value}
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            ) : (
                                <Card className="border-none shadow-xl shadow-gray-900/5 bg-white overflow-hidden rounded-3xl">
                                    <CardHeader className="border-b border-gray-50 bg-gray-50/30">
                                        <CardTitle className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                            <Info size={14} className="text-blue-500" /> Raw Backtest Output Metrics
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-0">
                                        <div className="overflow-x-auto">
                                            <Table>
                                                <TableHeader className="bg-gray-50/50">
                                                    <TableRow>
                                                        <TableHead className="text-xs font-bold uppercase tracking-wider pl-6">Metric</TableHead>
                                                        <TableHead className="text-right text-xs font-bold uppercase tracking-wider pr-6">Value</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {Object.entries(experiment.metrics || {})
                                                        .filter(([key]) => !['aggregated', 'best_params', 'best_return', 'best_trial', 'categorized'].includes(key))
                                                        .sort(([a], [b]) => a.localeCompare(b))
                                                        .map(([key, value]) => (
                                                            <TableRow key={key} className="hover:bg-blue-50/30 transition-colors border-b border-gray-50">
                                                                <TableCell className="py-3 pl-6 capitalize text-gray-600 font-medium">
                                                                    {key.replace(/_/g, ' ').replace('[%]', '(%)').replace('[$]', '($)')}
                                                                </TableCell>
                                                                <TableCell className="py-3 pr-6 text-right font-mono font-bold text-gray-900">
                                                                    {typeof value === 'number' ?
                                                                        (Number.isInteger(value) ? value : value.toFixed(4)) :
                                                                        String(value)}
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                </TableBody>
                                            </Table>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
