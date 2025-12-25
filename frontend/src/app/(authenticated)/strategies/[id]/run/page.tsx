'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { useRouter, useParams } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Play, ArrowLeft, Calendar, FileText, TrendingUp, Activity, Zap, Settings, AlertTriangle, ChevronRight, CheckCircle, Save, History, Beaker, ExternalLink, Check } from 'lucide-react';
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

export default function RunStrategyPage() {
    const router = useRouter();
    const params = useParams();
    const strategyId = params.id;

    const [paramsJson, setParamsJson] = useState('{\n  "fast_window": 20,\n  "slow_window": 50\n}');

    const [strategy, setStrategy] = useState<Strategy | null>(null);
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState(false);
    const [results, setResults] = useState<any>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [savedExperimentId, setSavedExperimentId] = useState<number | null>(null);
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
        setSavedExperimentId(null);

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

            toast.success(mode === 'sector' ? 'Sector backtest complete' : 'Backtest complete');
        } catch (error: any) {
            console.error('Backtest failed', error);
            let errorMsg = 'Backtest failed';
            if (error.response?.data?.error) {
                errorMsg = error.response.data.error;
                if (mode === 'sector' && errorMsg.includes('No successful backtests')) {
                    errorMsg += '. Try a different date range or sector with more available data.';
                }
            } else if (error.response?.status === 404) {
                errorMsg = 'No data found for the selected parameters';
            } else if (error.message) {
                errorMsg = error.message;
            }
            toast.error(errorMsg);
        } finally {
            setRunning(false);
        }
    };

    const handleSaveExperiment = async () => {
        if (!strategy || !results || !results.metadata) return;
        setIsSaving(true);
        try {
            const saveData = {
                scope_value: results.metadata.symbol,
                start_date: results.metadata.start_date,
                end_date: results.metadata.end_date,
                parameters: results.metadata.parameters,
                metrics: { ...results.metadata.metrics, ...results.stats },
                plot_html: results.plot_html
            };
            const response = await api.post(`/api/stocks/strategies/${strategy.id}/save_experiment/`, saveData);
            setSavedExperimentId(response.data.id);
            toast.success("Experiment saved to history");
        } catch (error: any) {
            console.error("Failed to save experiment", error);
            toast.error(error.response?.data?.error || "Failed to save experiment");
        } finally {
            setIsSaving(false);
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

            if (paramRanges._scope === 'ALL') {
                requestData.symbol = 'ALL';
                delete paramRanges._scope;
            } else if (paramRanges._scope === 'SECTOR') {
                requestData.sector = paramRanges._sector;
                delete paramRanges._scope;
                delete paramRanges._sector;
            } else {
                delete paramRanges._scope;
            }

            const response = await api.post('/api/stocks/strategies/optimize/', requestData);
            setOptimizationResults(response.data);
            toast.success(`Optimization complete! Best return: ${response.data.best_value.toFixed(2)}%`);
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Optimization failed');
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
        <DashboardLayout
            title={`Run - ${strategy?.name || 'Strategy'}`}
            subtitle="Backtest and optimize your trading strategy"
        >
            <div className="space-y-6">
                <div className="flex items-center gap-2 -mt-4 mb-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push('/strategies')}
                        className="h-8 gap-1 text-gray-500 hover:text-gray-900"
                    >
                        <ArrowLeft size={14} /> Back to Strategies
                    </Button>
                </div>

                <Tabs defaultValue="run" className="space-y-6">
                    <div className="flex items-center justify-between">
                        <TabsList className="bg-gray-100/80 p-1">
                            <TabsTrigger value="run" className="flex items-center gap-2 px-4 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                                <Play size={14} /> New Run
                            </TabsTrigger>
                            <TabsTrigger value="experiments" className="flex items-center gap-2 px-4 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                                <History size={14} /> Experiment History
                            </TabsTrigger>
                        </TabsList>

                        {results && (
                            <div className="flex items-center gap-3">
                                {results.stats && (
                                    <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-full shadow-sm">
                                        <div className={`w-2 h-2 rounded-full ${results.stats.total_pnl >= 0 ? 'bg-green-500' : 'bg-red-500'}`} />
                                        <span className="text-xs font-bold text-gray-900">
                                            {results.stats.pnl_percent?.toFixed(2)}% Return
                                        </span>
                                        <div className="w-px h-3 bg-gray-200 mx-1" />
                                        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                                            SR: {results.stats.sharpe_ratio?.toFixed(2)}
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <TabsContent value="run" className="mt-0">
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                            {/* Configuration Panel */}
                            <div className="lg:col-span-4 xl:col-span-3">
                                <Card className="border-gray-200 shadow-sm overflow-hidden sticky top-6">
                                    <CardHeader className="py-4 px-6 bg-gray-50/50 border-b border-gray-100">
                                        <div className="flex items-center gap-2">
                                            <div className="p-1.5 bg-blue-100 text-blue-600 rounded-lg">
                                                <Settings size={16} />
                                            </div>
                                            <div>
                                                <CardTitle className="text-sm font-bold uppercase tracking-wider text-gray-700">Configuration</CardTitle>
                                                <CardDescription className="text-[10px]">Set your backtest parameters</CardDescription>
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="p-6 space-y-6">
                                        {/* Mode Toggle */}
                                        <div className="space-y-3">
                                            <Label className="text-xs font-bold text-gray-500 uppercase">Backtest Mode</Label>
                                            <div className="flex p-1 bg-gray-100 rounded-lg gap-1">
                                                <button
                                                    onClick={() => setMode('symbol')}
                                                    className={`flex-1 py-1.5 px-2 text-[10px] font-bold rounded-md transition-all ${mode === 'symbol' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                                >
                                                    SYMBOL
                                                </button>
                                                <button
                                                    onClick={() => setMode('sector')}
                                                    className={`flex-1 py-1.5 px-2 text-[10px] font-bold rounded-md transition-all ${mode === 'sector' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                                >
                                                    SECTOR
                                                </button>
                                                <button
                                                    onClick={() => setMode('all')}
                                                    className={`flex-1 py-1.5 px-2 text-[10px] font-bold rounded-md transition-all ${mode === 'all' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                                >
                                                    ALL
                                                </button>
                                            </div>
                                        </div>

                                        {/* Symbol or Sector Selection */}
                                        {mode === 'symbol' && (
                                            <div className="space-y-2">
                                                <Label className="text-xs font-bold text-gray-500 uppercase">Ticker Symbol</Label>
                                                <CompanySelect className="h-9 text-sm" value={symbol} onChange={(val) => setSymbol(val)} />
                                            </div>
                                        )}

                                        {mode === 'sector' && (
                                            <div className="space-y-2">
                                                <Label className="text-xs font-bold text-gray-500 uppercase">Sector</Label>
                                                <select
                                                    value={sector}
                                                    onChange={(e) => setSector(e.target.value)}
                                                    className="w-full h-9 px-3 rounded-md border border-gray-300 bg-white text-sm focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                                                >
                                                    <option value="">Select a sector...</option>
                                                    {sectors.map((s) => (
                                                        <option key={s.name} value={s.name}>
                                                            {s.name} ({s.count})
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}

                                        {mode === 'all' && (
                                            <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-3">
                                                <div className="flex gap-2">
                                                    <AlertTriangle size={14} className="text-blue-500 shrink-0 mt-0.5" />
                                                    <p className="text-[11px] text-blue-700 leading-relaxed">
                                                        Runs strategy on <strong>all active companies</strong>. This processing is resource intensive.
                                                    </p>
                                                </div>
                                            </div>
                                        )}

                                        <div className="space-y-3 pt-4 border-t border-gray-100">
                                            <Label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-2">
                                                Parameters (JSON)
                                            </Label>
                                            <textarea
                                                value={paramsJson}
                                                onChange={(e) => setParamsJson(e.target.value)}
                                                className="w-full h-24 p-2 text-[11px] font-mono border rounded-md bg-white focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                                placeholder='{ "n1": 10 }'
                                            />
                                        </div>

                                        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100">
                                            <div className="space-y-2">
                                                <Label className="text-xs font-bold text-gray-500 uppercase">Start Date</Label>
                                                <div className="relative">
                                                    <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 bg-white text-xs pl-8" />
                                                    <Calendar className="absolute left-2.5 top-2.5 text-gray-400" size={14} />
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-xs font-bold text-gray-500 uppercase">End Date</Label>
                                                <div className="relative">
                                                    <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-9 bg-white text-xs pl-8" />
                                                    <Calendar className="absolute left-2.5 top-2.5 text-gray-400" size={14} />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-2 pt-6">
                                            <Button
                                                onClick={handleRun}
                                                disabled={running || (mode === 'symbol' && !symbol) || (mode === 'sector' && !sector)}
                                                className="w-full bg-blue-600 hover:bg-blue-700 h-10 font-bold uppercase tracking-wider text-xs shadow-md shadow-blue-200 group"
                                            >
                                                {running ? (
                                                    <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" /> Running...</>
                                                ) : (
                                                    <><Play size={14} className="mr-2 group-hover:scale-110 transition-transform" /> Run Backtest</>
                                                )}
                                            </Button>
                                            <div className="grid grid-cols-2 gap-2">
                                                <Button
                                                    variant="outline"
                                                    onClick={() => setShowOptimizeDialog(true)}
                                                    disabled={optimizing}
                                                    className="h-9 text-[10px] uppercase font-bold border-purple-100 text-purple-700 hover:bg-purple-50 hover:border-purple-200"
                                                >
                                                    {optimizing ? 'Wait...' : <><Zap size={12} className="mr-1.5" /> Optimize</>}
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    onClick={() => router.push(`/strategies/${strategyId}/edit`)}
                                                    className="h-9 text-[10px] uppercase font-bold text-gray-600"
                                                >
                                                    <Save size={12} className="mr-1.5" /> Edit Code
                                                </Button>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Right Panel - Results & Visualization */}
                            <div className="lg:col-span-8 xl:col-span-9 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col min-h-[700px]">
                                {running ? (
                                    <div className="h-full flex flex-col items-center justify-center space-y-4">
                                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                                        <p className="text-gray-500 animate-pulse">Running backtest strategy...</p>
                                    </div>
                                ) : results ? (
                                    <div className="h-full flex flex-col">
                                        {/* Results Header / Action Bar */}
                                        {!savedExperimentId && results.metadata ? (
                                            <div className="bg-blue-600 px-6 py-4 flex items-center justify-between text-white border-b border-blue-700/50 shadow-inner">
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                                                        <Save size={16} />
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-black uppercase tracking-widest">Unsaved Experiment</p>
                                                        <p className="text-[10px] opacity-80 font-medium">Results are temporary. Save to persist in history.</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => setResults(null)}
                                                        className="text-white hover:bg-white/10 h-9 px-4 text-[10px] font-bold uppercase transition-colors"
                                                    >
                                                        Discard
                                                    </Button>
                                                    <Button
                                                        onClick={handleSaveExperiment}
                                                        disabled={isSaving}
                                                        className="bg-white text-blue-600 hover:bg-blue-50 h-9 px-5 text-[10px] font-black uppercase shadow-lg shadow-blue-900/20 active:scale-95 transition-all"
                                                    >
                                                        {isSaving ? (
                                                            <><div className="w-3 h-3 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin mr-2" /> Saving...</>
                                                        ) : 'Save Experiment'}
                                                    </Button>
                                                </div>
                                            </div>
                                        ) : savedExperimentId ? (
                                            <div className="bg-green-600 px-6 py-4 flex items-center justify-between text-white border-b border-green-700/50 shadow-inner">
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                                                        <Check size={16} />
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-black uppercase tracking-widest">Experiment Saved</p>
                                                        <p className="text-[10px] opacity-80 font-medium">This run has been persisted to your strategy history.</p>
                                                    </div>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => window.open(`/strategies/${strategyId}/experiments/${savedExperimentId}`, '_blank')}
                                                    className="bg-white/10 hover:bg-white/20 h-9 px-4 text-[10px] font-bold uppercase flex items-center gap-2 transition-all border border-white/10"
                                                >
                                                    <ExternalLink size={12} /> View Experiment Detail
                                                </Button>
                                            </div>
                                        ) : (
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
                                        )}
                                        <div className="flex-1 overflow-auto p-4">
                                            {results.stats ? (
                                                <MetricsView
                                                    stats={results.stats}
                                                    plotHtml={results.plot_html}
                                                    strategyId={strategyId as string}
                                                />
                                            ) : (
                                                <div className="flex flex-col h-full space-y-6">
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
                                                                    {[...(results.individual_results || [])]
                                                                        .sort((a: any, b: any) => (b.return || 0) - (a.return || 0))
                                                                        .map((res: any) => (
                                                                            <TableRow
                                                                                key={res.symbol}
                                                                                className="cursor-pointer hover:bg-gray-50"
                                                                                onClick={() => {
                                                                                    window.open(`/strategies/${strategyId}/experiments/${res.id}`, '_blank');
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
                                                                                    <Button
                                                                                        variant="ghost"
                                                                                        size="sm"
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            window.open(`/strategies/${strategyId}/experiments/${res.id}`, '_blank');
                                                                                        }}
                                                                                    >
                                                                                        <ExternalLink size={14} className="mr-1" /> View
                                                                                    </Button>
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
            {showOptimizeDialog && (
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
            )}

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
                        <MetricsView
                            stats={selectedResult.stats}
                            plotHtml={selectedResult.plot_html}
                            strategyId={strategyId as string}
                        />
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
function MetricsView({ stats, plotHtml, strategyId }: { stats: any, plotHtml?: string, strategyId: string }) {
    const hasCategorized = stats.categorized && Object.keys(stats.categorized).length > 0;

    return (
        <div className="space-y-6">
            {/* Chart Section */}
            {plotHtml && (
                <div className="w-full bg-white border rounded-xl overflow-hidden mb-6 shadow-md" style={{ height: '700px' }}>
                    <div className="px-4 py-2 bg-gray-50 border-b flex justify-between items-center">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Strategy Plot</span>
                        {stats.id && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-[10px] uppercase font-bold"
                                onClick={() => window.open(`/strategies/${strategyId}/experiments/${stats.id}`, '_blank')}
                            >
                                <ExternalLink size={12} className="mr-1" /> Full Screen immersion
                            </Button>
                        )}
                    </div>
                    <iframe
                        title="Backtest Plot"
                        srcDoc={plotHtml}
                        className="w-full h-full border-0"
                        sandbox="allow-scripts"
                    />
                </div>
            )}

            {hasCategorized ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {Object.entries(stats.categorized).map(([category, metrics]: [string, any]) => (
                        <Card key={category} className="shadow-sm border-gray-100 overflow-hidden">
                            <CardHeader className="py-3 px-4 bg-gray-50/50 border-b border-gray-100">
                                <CardTitle className="text-sm font-bold text-gray-700 uppercase tracking-tight flex items-center gap-2">
                                    {category === 'Performance Metrics' && <TrendingUp size={14} className="text-green-500" />}
                                    {category === 'Risk Metrics' && <AlertTriangle size={14} className="text-red-500" />}
                                    {category === 'Trade Metrics' && <Activity size={14} className="text-blue-500" />}
                                    {category}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <Table>
                                    <TableBody>
                                        {Object.entries(metrics).map(([label, value]: [string, any]) => (
                                            <TableRow key={label} className="hover:bg-transparent border-gray-50">
                                                <TableCell className="py-2.5 px-4 text-xs font-medium text-gray-500">
                                                    {label}
                                                </TableCell>
                                                <TableCell className="py-2.5 px-4 text-xs font-mono text-right font-bold text-gray-900">
                                                    {String(value)}
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
                <>
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
                </>
            )}
        </div>
    );
}

// Optimization Form Component
function OptimizeForm({ onOptimize, onCancel, optimizing, strategyCode, sectors, initialMode, initialSector }: any) {
    const [nTrials, setNTrials] = useState(50);
    const [scope, setScope] = useState<'SINGLE' | 'SECTOR' | 'ALL'>(
        initialMode === 'sector' ? 'SECTOR' : initialMode === 'all' ? 'ALL' : 'SINGLE'
    );
    const [selectedSector, setSelectedSector] = useState(initialMode === 'sector' ? initialSector : '');

    const extractParameters = (code: string) => {
        const params: any = {};
        const regex = /^\s*(\w+)\s*=\s*([\d.]+)/gm;
        let match;
        while ((match = regex.exec(code)) !== null) {
            const paramName = match[1];
            const valueStr = match[2];
            if (['self', 'data', 'position', 'equity'].includes(paramName)) continue;
            if (valueStr.includes('.')) continue;
            const value = parseInt(valueStr);
            const min = Math.max(1, Math.floor(value * 0.5));
            const max = Math.ceil(value * 2);
            params[paramName] = [min, max];
        }
        return Object.keys(params).length > 0 ? params : { "n1": [5, 30], "n2": [20, 100] };
    };

    const [paramJson, setParamJson] = useState(JSON.stringify(extractParameters(strategyCode), null, 2));
    const [jsonError, setJsonError] = useState('');

    const handleSubmit = () => {
        try {
            const paramRanges = JSON.parse(paramJson);
            for (const [key, value] of Object.entries(paramRanges)) {
                if (!Array.isArray(value) || value.length !== 2) {
                    setJsonError(`Invalid format for "${key}". Expected [min, max] array.`);
                    return;
                }
            }
            setJsonError('');
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