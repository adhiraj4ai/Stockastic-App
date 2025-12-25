'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { useRouter, useParams } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Play, ArrowLeft, Calendar, FileText, TrendingUp, Activity, Zap, Settings, AlertTriangle, ChevronRight, CheckCircle, Save, History, Beaker } from 'lucide-react';
import { toast } from 'sonner';
import { CompanySelect } from '@/components/CompanySelect';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Table,
    TableBody,
    TableCaption,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import ExperimentsTab from '../tabs/ExperimentsTab';

interface Strategy {
    id: number;
    name: string;
    description: string;
    code: string;
}

const METRIC_GROUPS = [
    {
        title: "Performance Metrics",
        metrics: [
            { label: "Return", key: "Return [%]", suffix: "%" },
            { label: "Win Rate", key: "Win Rate [%]", suffix: "%" },
            { label: "Sharpe Ratio", key: "Sharpe Ratio" },
            { label: "Sortino Ratio", key: "Sortino Ratio" },
            { label: "Calmar Ratio", key: "Calmar Ratio" },
            { label: "Avg Win/Loss Ratio", key: "Avg Win/Loss Ratio" },
            { label: "Average Win", key: "Average Win" },
            { label: "Average Loss", key: "Average Loss" },
        ]
    },
    {
        title: "Risk Metrics",
        metrics: [
            { label: "Max Drawdown", key: "Max. Drawdown [%]", suffix: "%" },
            { label: "Largest Winning Trade", key: "Largest Winning Trade" },
            { label: "Largest Losing Trade", key: "Largest Losing Trade" },
            { label: "Expectancy", key: "Expectancy [%]", suffix: "%" },
            { label: "Avg Holding Period", key: "Average Holding Period" },
            { label: "Gross Profit", key: "Gross Profit" },
            { label: "Gross Loss", key: "Gross Loss" },
        ]
    },
    {
        title: "Trade Metrics",
        metrics: [
            { label: "Total Trades", key: "# Trades" },
            { label: "Winning Trades", key: "Total Winning Trades" },
            { label: "Losing Trades", key: "Total Losing Trades" },
            { label: "Finishing Balance", key: "Equity Final [$]" },
            { label: "Longs Count", key: "Total Long Trades" },
            { label: "Shorts Count", key: "Total Short Trades" },
            { label: "Fee", key: "Commissions [$]" },
        ]
    }
];

export default function RunStrategyPage() {
    const router = useRouter();
    const params = useParams();
    const strategyId = params.id;

    const [paramsJson, setParamsJson] = useState('{\n  "fast_window": 20,\n  "slow_window": 50\n}');

    const [strategy, setStrategy] = useState<Strategy | null>(null);
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState(false);
    const [results, setResults] = useState<any>(null);
    const [optimizing, setOptimizing] = useState(false);
    const [showOptimizeDialog, setShowOptimizeDialog] = useState(false);
    const [optimizationResults, setOptimizationResults] = useState<any>(null);
    const [selectedResult, setSelectedResult] = useState<any>(null);

    // Param State
    const [mode, setMode] = useState<'symbol' | 'sector' | 'all'>('symbol');
    const [symbol, setSymbol] = useState('');
    const [sector, setSector] = useState('');
    const [sectors, setSectors] = useState<{ name: string; count: number }[]>([]);

    // Default Dates: Last 5 Years
    const today = new Date();
    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(today.getFullYear() - 5);

    const formatDate = (date: Date) => date.toISOString().split('T')[0];

    const [startDate, setStartDate] = useState(formatDate(fiveYearsAgo));
    const [endDate, setEndDate] = useState(formatDate(today));

    useEffect(() => {
        if (strategyId) {
            fetchStrategy();
        }
        fetchSectors();
    }, [strategyId]);

    const fetchStrategy = async () => {
        try {
            const response = await api.get(`/api/stocks/strategies/${strategyId}/`);
            setStrategy(response.data);
        } catch (error: any) {
            // 401 handled by global interceptor
            toast.error('Failed to load strategy');
        } finally {
            setLoading(false);
        }
    };

    const fetchSectors = async () => {
        try {
            const response = await api.get('/api/stocks/companies/sectors/');
            setSectors(response.data);
        } catch (error) {
            console.error('Failed to load sectors', error);
        }
    };

    const handleRun = async () => {
        if (!strategy) return;

        // Validate based on mode
        if (mode === 'symbol' && !symbol) {
            toast.error('Please select a stock symbol');
            return;
        }
        if (mode === 'sector' && !sector) {
            toast.error('Please select a sector');
            return;
        }

        setRunning(true);
        setResults(null);

        let parameters = {};
        try {
            parameters = JSON.parse(paramsJson);
        } catch (e) {
            toast.error("Invalid JSON in Parameters field");
            setRunning(false);
            return;
        }

        try {
            let requestData: any = {
                code: strategy.code,
                start_date: startDate,
                end_date: endDate,
                parameters: parameters
            };

            if (mode === 'symbol') {
                requestData.symbol = symbol;
            } else if (mode === 'sector') {
                requestData.sector = sector;
            } else if (mode === 'all') {
                requestData.sector = 'ALL';
            }
            console.log('Backtest request:', requestData);
            const response = await api.post(`/api/stocks/strategies/${strategy.id}/backtest/`, requestData);
            setResults(response.data);

            // If single symbol, we have the full result with plot_html
            // If sector, we have aggregated results

            toast.success(mode === 'sector' ? 'Sector backtest complete' : 'Backtest complete');
        } catch (error: any) {
            console.error('Backtest failed', error);
            console.error('Error response:', error.response?.data);
            console.error('Error status:', error.response?.status);

            let errorMsg = 'Backtest failed';
            if (error.response?.data?.error) {
                errorMsg = error.response.data.error;

                // Add helpful context for sector backtests
                if (mode === 'sector' && errorMsg.includes('No successful backtests')) {
                    errorMsg += '. Try a different date range or sector with more available data.';
                }
            } else if (error.response?.status === 404) {
                errorMsg = 'No data found for the selected parameters';
            } else if (error.response?.statusText) {
                errorMsg = `${error.response.status}: ${error.response.statusText}`;
            } else if (error.message) {
                errorMsg = error.message;
            }

            toast.error(errorMsg);
        } finally {
            setRunning(false);
        }
    };

    const handleOptimize = async (paramRanges: any, nTrials: number) => {
        if (!strategy) return;
        if (!symbol) {
            toast.error('Please select a stock symbol');
            return;
        }
        setOptimizing(true);
        try {
            const requestData: any = {
                code: strategy.code,
                symbol,
                start_date: startDate,
                end_date: endDate,
                param_ranges: paramRanges,
                n_trials: nTrials
            };

            // Handle Scopes
            if (paramRanges._scope === 'ALL') {
                requestData.symbol = 'ALL';
                delete paramRanges._scope;
            } else if (paramRanges._scope === 'SECTOR') {
                requestData.sector = paramRanges._sector; // Pass sector name
                delete paramRanges._scope;
                delete paramRanges._sector;
            } else {
                delete paramRanges._scope; // Just clean up if single
            }

            console.log('Optimization request:', requestData);
            const response = await api.post('/api/stocks/strategies/optimize/', requestData);
            setOptimizationResults(response.data);
            toast.success(`Optimization complete! Best return: ${response.data.best_value.toFixed(2)}%`);
        } catch (error: any) {
            console.error('Optimization failed', error);
            console.error('Error response:', error.response?.data);
            console.error('Error status:', error.response?.status);

            let errorMsg = 'Optimization failed';
            if (error.response?.data?.error) {
                errorMsg = error.response.data.error;
            } else if (error.response?.data?.traceback) {
                errorMsg = error.response.data.traceback.substring(0, 200) + '...';
            } else if (error.response?.status) {
                errorMsg = `HTTP ${error.response.status}: ${error.response.statusText || 'Request failed'}`;
            } else if (error.message) {
                errorMsg = error.message;
            }

            toast.error(errorMsg);
        } finally {
            setOptimizing(false);
        }
    };

    const handleApplyOptimized = async () => {
        if (!optimizationResults || !strategy) return;
        try {
            await api.patch(`/api/stocks/strategies/${strategyId}/`,
                { code: optimizationResults.optimized_code }
            );
            setStrategy({ ...strategy, code: optimizationResults.optimized_code });
            setOptimizationResults(null);
            toast.success('Optimized parameters applied to strategy!');
        } catch (error: any) {
            toast.error('Failed to update strategy');
        }
    };

    if (loading) return <DashboardLayout><div>Loading...</div></DashboardLayout>;

    return (
        <DashboardLayout>
            <div className="space-y-6">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => router.push('/strategies')}
                            className="shrink-0"
                        >
                            <ArrowLeft size={20} />
                        </Button>
                        <div>
                            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                                <Play size={20} className="text-blue-600" />
                                Run Strategy
                            </h1>
                            <p className="text-sm text-gray-500">
                                {strategy?.name}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Main Content */}
                <Tabs defaultValue="run" className="space-y-6">
                    <TabsList>
                        <TabsTrigger value="run" className="flex items-center gap-2">
                            <Play size={16} /> New Run
                        </TabsTrigger>
                        <TabsTrigger value="experiments" className="flex items-center gap-2">
                            <History size={16} /> Experiment History
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="run">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Configuration Panel */}
                            <div className="lg:col-span-1 space-y-6">
                                <div className="w-full bg-gray-50 border-r border-gray-200 p-6 overflow-y-auto flex flex-col rounded-xl">
                                    <h3 className="font-bold text-gray-900 mb-6 uppercase tracking-wider text-sm flex items-center gap-2">
                                        <Activity size={16} /> Configuration
                                    </h3>

                                    <div className="space-y-6 flex-1">
                                        {/* Mode Toggle */}
                                        <div className="space-y-2">
                                            <Label>Backtest Mode</Label>
                                            <div className="flex gap-2">
                                                <Button
                                                    variant={mode === 'symbol' ? 'default' : 'outline'}
                                                    onClick={() => setMode('symbol')}
                                                    className="flex-1"
                                                    size="sm"
                                                >
                                                    Single Stock
                                                </Button>
                                                <Button
                                                    variant={mode === 'sector' ? 'default' : 'outline'}
                                                    onClick={() => setMode('sector')}
                                                    className="flex-1"
                                                    size="sm"
                                                >
                                                    Sector
                                                </Button>
                                                <Button
                                                    variant={mode === 'all' ? 'default' : 'outline'}
                                                    onClick={() => setMode('all')}
                                                    className="flex-1"
                                                    size="sm"
                                                >
                                                    All
                                                </Button>
                                            </div>
                                        </div>

                                        {/* Symbol or Sector Selection */}
                                        {mode === 'symbol' && (
                                            <div className="space-y-2">
                                                <Label>Ticker Symbol</Label>
                                                <CompanySelect value={symbol} onChange={(val) => setSymbol(val)} />
                                            </div>
                                        )}

                                        {mode === 'sector' && (
                                            <div className="space-y-2">
                                                <Label>Sector</Label>
                                                <select
                                                    value={sector}
                                                    onChange={(e) => setSector(e.target.value)}
                                                    className="w-full h-10 px-3 rounded-md border border-gray-300 bg-white text-sm"
                                                >
                                                    <option value="">Select a sector...</option>
                                                    {sectors.map((s) => (
                                                        <option key={s.name} value={s.name}>
                                                            {s.name} ({s.count} stocks)
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}

                                        {mode === 'all' && (
                                            <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                                                <p className="text-sm text-blue-800">
                                                    Runs backtest on <strong>all active companies</strong>. This may take a while.
                                                </p>
                                            </div>
                                        )}

                                        <div className="space-y-4 pt-4 border-t border-gray-200">
                                            <Label className="text-gray-900 font-semibold mb-2 block flex items-center gap-2">
                                                <Settings size={14} /> Strategy Parameters (JSON)
                                            </Label>
                                            <p className="text-xs text-gray-500 mb-2">
                                                Enter parameters as a valid JSON object. These will be logged and available in your strategy via <code>params.get('key')</code>.
                                            </p>

                                            <textarea
                                                value={paramsJson}
                                                onChange={(e) => setParamsJson(e.target.value)}
                                                className="w-full h-32 p-3 text-xs font-mono border rounded-md bg-white focus:ring-2 focus:ring-blue-500 outline-none resize-y"
                                                placeholder='{ "fast_window": 20, "slow_window": 50 }'
                                            />
                                        </div>

                                        <div className="space-y-2 pt-4 border-t border-gray-200">
                                            <Label>Start Date</Label>
                                            <div className="relative">
                                                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-white pl-10" />
                                                <Calendar className="absolute left-3 top-2.5 text-gray-400" size={16} />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label>End Date</Label>
                                            <div className="relative">
                                                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="bg-white pl-10" />
                                                <Calendar className="absolute left-3 top-2.5 text-gray-400" size={16} />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="space-y-3 pt-6 border-t border-gray-200 mt-6">
                                        <Button
                                            onClick={handleRun}
                                            disabled={running || (mode === 'symbol' && !symbol) || (mode === 'sector' && !sector)}
                                            className="w-full bg-blue-600 hover:bg-blue-700"
                                        >
                                            {running ? 'Running...' : <><Play size={16} className="mr-2" /> Run Backtest</>}
                                        </Button>
                                        <Button
                                            variant="outline"
                                            onClick={() => setShowOptimizeDialog(true)}
                                            disabled={optimizing}
                                            className="w-full border-purple-200 text-purple-700 hover:bg-purple-50"
                                        >
                                            {optimizing ? 'Optimizing...' : <><Zap size={16} className="mr-2" /> Optimize Parameters</>}
                                        </Button>
                                        <Button
                                            variant="outline"
                                            onClick={() => router.push(`/strategies/${strategyId}/edit`)}
                                            className="w-full"
                                        >
                                            Edit Strategy
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            {/* Right Panel - Results & Visualization */}
                            <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-full">
                                {running ? (
                                    <div className="h-full flex flex-col items-center justify-center space-y-4">
                                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                                        <p className="text-gray-500 animate-pulse">Running backtest strategy...</p>
                                    </div>
                                ) : results ? (
                                    <div className="h-full flex flex-col">
                                        <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                                            <h3 className="font-semibold text-gray-900">Backtest Results</h3>
                                            <div className="flex gap-2">
                                                {results.stats && (
                                                    <>
                                                        <Badge variant={results.stats.total_pnl >= 0 ? 'default' : 'destructive'} className={results.stats.total_pnl >= 0 ? 'bg-green-600 hover:bg-green-700' : ''}>
                                                            {results.stats.pnl_percent?.toFixed(2)}% Return
                                                        </Badge>
                                                        <Badge variant="outline">
                                                            SR: {results.stats.sharpe_ratio?.toFixed(2)}
                                                        </Badge>
                                                    </>
                                                )}
                                                {!results.stats && results.aggregated && (
                                                    <Badge variant={results.aggregated.avg_return >= 0 ? 'default' : 'destructive'} className={results.aggregated.avg_return >= 0 ? 'bg-green-600 hover:bg-green-700' : ''}>
                                                        Avg: {results.aggregated.avg_return?.toFixed(2)}%
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex-1 overflow-auto p-4">
                                            {results.stats ? (
                                                <MetricsView stats={results.stats} plotHtml={results.plot_html} />
                                            ) : (
                                                <div className="flex flex-col h-full space-y-6">
                                                    {/* Aggregated Stats Cards */}
                                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                        <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                                                            <p className="text-xs text-blue-600">Total Companies</p>
                                                            <p className="text-lg font-bold text-blue-900">{results.total_companies}</p>
                                                        </div>
                                                        <div className="bg-green-50 p-3 rounded-lg border border-green-100">
                                                            <p className="text-xs text-green-600">Successful Runs</p>
                                                            <p className="text-lg font-bold text-green-900">{results.successful_backtests}</p>
                                                        </div>
                                                        <div className="bg-gray-50 p-3 rounded-lg">
                                                            <p className="text-xs text-gray-500">Full Success Rate</p>
                                                            <p className="text-lg font-bold">{results.total_companies ? ((results.successful_backtests / results.total_companies) * 100).toFixed(0) : 0}%</p>
                                                        </div>
                                                        {results.aggregated && (
                                                            <div className="bg-gray-50 p-3 rounded-lg">
                                                                <p className="text-xs text-gray-500">Avg Return</p>
                                                                <p className={`text-lg font-bold ${results.aggregated.avg_return >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                                    {results.aggregated.avg_return?.toFixed(2)}%
                                                                </p>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Individual Results Table */}
                                                    {results.individual_results && results.individual_results.length > 0 && (
                                                        <div className="border rounded-md">
                                                            <Table>
                                                                <TableCaption>Individual Stock Performance in Sector</TableCaption>
                                                                <TableHeader>
                                                                    <TableRow>
                                                                        <TableHead>Symbol</TableHead>
                                                                        <TableHead className="text-right">Return</TableHead>
                                                                        <TableHead className="text-right">Win Rate</TableHead>
                                                                        <TableHead className="text-right">Trades</TableHead>
                                                                        <TableHead className="text-right">PnL</TableHead>
                                                                        <TableHead className="text-right">Action</TableHead>
                                                                    </TableRow>
                                                                </TableHeader>
                                                                <TableBody>
                                                                    {results.individual_results.map((res: any) => (
                                                                        <TableRow
                                                                            key={res.symbol}
                                                                            className="cursor-pointer hover:bg-gray-50"
                                                                            onClick={async () => {
                                                                                setSelectedResult(res);
                                                                                // Fetch detailed experiment for this symbol in batch
                                                                                if (results.batch_id) {
                                                                                    try {
                                                                                        const detailResp = await api.get(`/api/stocks/strategies/experiment_detail/`, {
                                                                                            params: {
                                                                                                batch_id: results.batch_id,
                                                                                                symbol: res.symbol
                                                                                            }
                                                                                        });
                                                                                        setSelectedResult({ ...res, ...detailResp.data });
                                                                                    } catch (err) {
                                                                                        console.error("Failed to fetch detail", err);
                                                                                    }
                                                                                }
                                                                            }}
                                                                        >
                                                                            <TableCell className="font-medium">{res.symbol}</TableCell>
                                                                            <TableCell className={`text-right ${res.return >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                                                {res.return?.toFixed(2)}%
                                                                            </TableCell>
                                                                            <TableCell className="text-right">{res.win_rate?.toFixed(1)}%</TableCell>
                                                                            <TableCell className="text-right">{res.total_trades}</TableCell>
                                                                            <TableCell className={`text-right ${res.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                                                {res.total_pnl?.toFixed(2)}
                                                                            </TableCell>
                                                                            <TableCell className="text-right">
                                                                                <Button variant="ghost" size="sm">View</Button>
                                                                            </TableCell>
                                                                        </TableRow>
                                                                    ))}
                                                                </TableBody>
                                                            </Table>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-gray-400">
                                        <Activity size={48} className="mb-4 opacity-20" />
                                        <p className="text-lg font-medium">Ready to Backtest</p>
                                        <p className="text-sm">Configure parameters and click "Run Backtest" to begin.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="experiments" className="h-[calc(100vh-12rem)]">
                        <ExperimentsTab strategyId={Number(strategyId)} />
                    </TabsContent>
                </Tabs>
            </div>

            {/* Optimization Dialog */}
            {
                showOptimizeDialog && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                            <div className="p-6 border-b border-gray-200">
                                <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                                    <Zap className="text-purple-600" size={24} />
                                    Optimize Strategy Parameters
                                </h2>
                                <p className="text-sm text-gray-500 mt-1">Find the best parameter values using Optuna optimization</p>
                            </div>

                            {!optimizationResults ? (
                                <OptimizeForm
                                    onOptimize={handleOptimize}
                                    onCancel={() => setShowOptimizeDialog(false)}
                                    optimizing={optimizing}
                                    strategyCode={strategy?.code || ""}
                                    sectors={sectors}
                                    initialMode={mode}
                                    initialSector={sector}
                                />
                            ) : (
                                <OptimizationResults
                                    results={optimizationResults}
                                    onApply={handleApplyOptimized}
                                    onClose={() => {
                                        setOptimizationResults(null);
                                        setShowOptimizeDialog(false);
                                    }}
                                />
                            )}
                        </div>
                    </div>
                )
            }

            {/* Selected Result Detail Dialog */}
            <Dialog open={!!selectedResult} onOpenChange={(open) => !open && setSelectedResult(null)}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            {selectedResult?.symbol} Analysis
                            <Badge variant={selectedResult?.return >= 0 ? 'default' : 'destructive'}>
                                {selectedResult?.return?.toFixed(2)}%
                            </Badge>
                        </DialogTitle>
                        <DialogDescription>
                            Detailed backtest metrics for {selectedResult?.symbol}
                        </DialogDescription>
                    </DialogHeader>

                    {selectedResult?.stats ? (
                        <MetricsView stats={selectedResult.stats} plotHtml={selectedResult.plot_html} />
                    ) : (
                        <div className="py-8 text-center text-gray-500">
                            No detailed stats available for this run.
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </DashboardLayout >
    );
}

// Reusable Metrics View Component
function MetricsView({ stats, plotHtml }: { stats: any, plotHtml?: string }) {
    return (
        <div className="space-y-6">
            {/* Chart Section */}
            {plotHtml && (
                <div className="w-full bg-white border rounded-xl overflow-hidden mb-6 shadow-inner" style={{ height: '500px' }}>
                    <iframe
                        title="Backtest Plot"
                        srcDoc={plotHtml}
                        className="w-full h-full border-0"
                        sandbox="allow-scripts"
                    />
                </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="text-xs text-gray-500">Total Trades</p>
                    <p className="text-lg font-bold">{stats.total_trades}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="text-xs text-gray-500">Win Rate</p>
                    <p className="text-lg font-bold">{stats.win_rate?.toFixed(1)}%</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="text-xs text-gray-500">Max Drawdown</p>
                    <p className="text-lg font-bold text-red-600">{stats.max_drawdown?.toFixed(2)}%</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="text-xs text-gray-500">Profit Factor</p>
                    <p className="text-lg font-bold">{stats.profit_factor?.toFixed(2)}</p>
                </div>
            </div>

            <div className="space-y-4">
                <h4 className="text-sm font-medium border-b pb-2">Full Metrics</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-8 text-sm">
                    {/* Common Important Metrics */}
                    <div>
                        <span className="text-gray-500 block text-xs">Sharpe Ratio</span>
                        <span className="font-mono">{stats.sharpe_ratio?.toFixed(2)}</span>
                    </div>
                    <div>
                        <span className="text-gray-500 block text-xs">Sortino Ratio</span>
                        <span className="font-mono">{stats.sortino_ratio?.toFixed(2)}</span>
                    </div>
                    <div>
                        <span className="text-gray-500 block text-xs">Calmar Ratio</span>
                        <span className="font-mono">{stats.calmar_ratio?.toFixed(2)}</span>
                    </div>
                    <div>
                        <span className="text-gray-500 block text-xs">Total PnL</span>
                        <span className={`font-mono ${stats.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {stats.total_pnl?.toFixed(2)}
                        </span>
                    </div>
                    <div>
                        <span className="text-gray-500 block text-xs">Avg Trade</span>
                        <span className="font-mono">{stats.avg_trade?.toFixed(2)}%</span>
                    </div>
                    <div>
                        <span className="text-gray-500 block text-xs">Max Trade Duration</span>
                        <span className="font-mono">{stats.max_trade_duration}</span>
                    </div>
                </div>
            </div>

            <div className="mt-4">
                <h4 className="text-sm font-medium mb-2">Raw Data</h4>
                <pre className="bg-slate-900 text-slate-50 p-4 rounded-lg text-xs overflow-auto max-h-40">
                    {JSON.stringify(stats, null, 2)}
                </pre>
            </div>
        </div>
    );
}

// Optimization Form Component
function OptimizeForm({ onOptimize, onCancel, optimizing, strategyCode, sectors, initialMode, initialSector }: any) {
    const [nTrials, setNTrials] = useState(50);

    // Initialize scope based on current run mode
    const [scope, setScope] = useState<'SINGLE' | 'SECTOR' | 'ALL'>(
        initialMode === 'sector' ? 'SECTOR' : initialMode === 'all' ? 'ALL' : 'SINGLE'
    );

    // Initialize sector if applicable
    const [selectedSector, setSelectedSector] = useState(initialMode === 'sector' ? initialSector : '');

    // Extract parameters from strategy code
    const extractParameters = (code: string) => {
        const params: any = {};
        // Match class attributes like "n1 = 10" or "risk_per_trade = 0.05"
        const regex = /^\s*(\w+)\s*=\s*([\d.]+)/gm;
        let match;
        while ((match = regex.exec(code)) !== null) {
            const paramName = match[1];
            const valueStr = match[2];

            // Skip common non-parameter attributes
            if (['self', 'data', 'position', 'equity'].includes(paramName)) {
                continue;
            }

            // Skip float parameters (they need manual configuration)
            if (valueStr.includes('.')) {
                continue;
            }

            // Only process integer parameters
            const value = parseInt(valueStr);
            const min = Math.max(1, Math.floor(value * 0.5));
            const max = Math.ceil(value * 2);
            params[paramName] = [min, max];
        }

        // Return default if no params found
        return Object.keys(params).length > 0 ? params : { "n1": [5, 30], "n2": [20, 100] };
    };

    const [paramJson, setParamJson] = useState(JSON.stringify(extractParameters(strategyCode), null, 2));
    const [jsonError, setJsonError] = useState('');

    const handleSubmit = () => {
        try {
            const paramRanges = JSON.parse(paramJson);

            // Validate format
            for (const [key, value] of Object.entries(paramRanges)) {
                if (!Array.isArray(value) || value.length !== 2) {
                    setJsonError(`Invalid format for "${key}". Expected [min, max] array.`);
                    return;
                }
            }

            setJsonError('');

            // Inject scope into params temporarily
            const finalParams = { ...paramRanges, _scope: scope, _sector: selectedSector };

            if (scope === 'SECTOR' && !selectedSector) {
                toast.error('Please select a sector for optimization');
                return;
            }

            onOptimize(finalParams, nTrials);
        } catch (error) {
            setJsonError('Invalid JSON format. Please check your syntax.');
        }
    };

    return (
        <div className="p-6 space-y-6">
            <div>
                <Label className="text-sm font-medium text-gray-700 mb-2 block">Number of Trials</Label>
                <Input
                    type="number"
                    value={nTrials}
                    onChange={(e) => setNTrials(parseInt(e.target.value))}
                    min={10}
                    max={200}
                    className="w-full"
                />
                <p className="text-xs text-gray-500 mt-1">More trials = better results but slower (recommended: 50-100)</p>
            </div>

            <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700 block">Optimization Scope</Label>
                <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="radio"
                            name="scope"
                            value="SINGLE"
                            checked={scope === 'SINGLE'}
                            onChange={() => setScope('SINGLE')}
                            className="w-4 h-4 text-purple-600 focus:ring-purple-500 border-gray-300"
                        />
                        <span className="text-sm text-gray-700">Current Symbol Only</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="radio"
                            name="scope"
                            value="SECTOR"
                            checked={scope === 'SECTOR'}
                            onChange={() => setScope('SECTOR')}
                            className="w-4 h-4 text-purple-600 focus:ring-purple-500 border-gray-300"
                        />
                        <span className="text-sm text-gray-700">Specific Sector</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="radio"
                            name="scope"
                            value="ALL"
                            checked={scope === 'ALL'}
                            onChange={() => setScope('ALL')}
                            className="w-4 h-4 text-purple-600 focus:ring-purple-500 border-gray-300"
                        />
                        <span className="text-sm text-gray-700">All Symbols (Market-wide)</span>
                    </label>
                </div>
            </div>

            {scope === 'SECTOR' && (
                <div className="mt-2">
                    <select
                        value={selectedSector}
                        onChange={(e) => setSelectedSector(e.target.value)}
                        className="w-full h-9 px-3 rounded-md border border-gray-300 bg-white text-sm"
                    >
                        <option value="">Select a sector...</option>
                        {sectors?.map((s: any) => (
                            <option key={s.name} value={s.name}>
                                {s.name} ({s.count})
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {scope === 'ALL' && (
                <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded border border-amber-200">
                    Warning: Optimizing across all symbols is computationally intensive and may take significantly longer.
                </p>
            )}

            <div>
                <Label className="text-sm font-medium text-gray-700 mb-2 block">Parameter Ranges (JSON)</Label>
                <textarea
                    value={paramJson}
                    onChange={(e) => {
                        setParamJson(e.target.value);
                        setJsonError('');
                    }}
                    className="w-full h-48 p-3 border border-gray-300 rounded-md font-mono text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder='{\n  "n1": [5, 30],\n  "n2": [20, 100]\n}'
                />
                {jsonError && (
                    <p className="text-xs text-red-600 mt-1">{jsonError}</p>
                )}
                <p className="text-xs text-gray-500 mt-2">
                    Format: <code className="bg-gray-100 px-1 rounded">{"{ \"param_name\": [min, max] }"}</code>
                </p>
                <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
                    <p className="text-xs text-blue-800 font-medium mb-1">Example:</p>
                    <pre className="text-xs text-blue-700 font-mono">
                        {`{
  "n1": [5, 30],
  "n2": [20, 100],
  "rsi_period": [10, 20]
}`}
                    </pre>
                </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
                <Button variant="outline" onClick={onCancel} disabled={optimizing}>
                    Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={optimizing} className="bg-purple-600 hover:bg-purple-700">
                    {optimizing ? 'Optimizing...' : 'Start Optimization'}
                </Button>
            </div>
        </div>
    );
}

// Optimization Results Component
function OptimizationResults({ results, onApply, onClose }: any) {
    return (
        <div className="p-6 space-y-6">
            <div className="bg-gradient-to-r from-purple-50 to-blue-50 p-6 rounded-lg border border-purple-200">
                <div className="text-sm text-gray-600 mb-2">Best Return Achieved</div>
                <div className="text-4xl font-bold text-purple-600">{results.best_value.toFixed(2)}%</div>
            </div>

            <div>
                <h3 className="font-semibold text-gray-900 mb-3">Optimized Parameters</h3>
                <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                    {Object.entries(results.best_params).map(([key, value]: any) => (
                        <div key={key} className="flex justify-between items-center">
                            <span className="text-gray-600 font-mono">{key}</span>
                            <span className="font-bold text-gray-900">{value}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div>
                <h3 className="font-semibold text-gray-900 mb-3">Top 5 Trials</h3>
                <div className="space-y-2">
                    {results.trials
                        .filter((t: any) => t.value !== null)
                        .sort((a: any, b: any) => b.value - a.value)
                        .slice(0, 5)
                        .map((trial: any, idx: number) => (
                            <div key={trial.number} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                <div className="flex items-center gap-3">
                                    <div className="w-6 h-6 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-sm font-bold">
                                        {idx + 1}
                                    </div>
                                    <div className="text-sm">
                                        {Object.entries(trial.params).map(([k, v]: any) => (
                                            <span key={k} className="mr-3">
                                                <span className="text-gray-500">{k}=</span>
                                                <span className="font-mono font-semibold">{v}</span>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <div className="text-sm font-bold text-gray-900">{trial.value.toFixed(2)}%</div>
                            </div>
                        ))}
                </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
                <Button variant="outline" onClick={onClose}>
                    Close
                </Button>
                <Button onClick={onApply} className="bg-green-600 hover:bg-green-700">
                    Apply to Strategy
                </Button>
            </div>
        </div>
    );
}