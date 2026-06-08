'use client';

import { useState, useEffect, useRef, useMemo, Suspense } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Play, AlertTriangle, ExternalLink, Check, Zap, Code, RotateCcw } from 'lucide-react';
import { PageLoader, FullPageLoader } from '@/components/ui/StockLoader';
import { toast } from 'sonner';
import { CompanySelect } from '@/components/CompanySelect';
import { Card, CardContent } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCaption,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { PeriodSelector } from '../../components/PeriodSelector';
import { MetricsDisplay } from '../../components/MetricsDisplay';
import ParameterObjectiveSelector from '../../components/ParameterObjectiveSelector';

interface Strategy {
    id: number;
    name: string;
    description: string;
    code: string;
    default_parameters?: Record<string, number>;
}

const SKIP_PARAMS = new Set(['self', 'data', 'position', 'equity', 'True', 'False', 'None']);

/** Extract numeric class-level attributes from strategy code. */
function extractParamsFromCode(code: string): Record<string, number> {
    const params: Record<string, number> = {};
    // Permissive: match any `name = number` assignment (same pattern as optimize page)
    const regex = /^\s*([a-zA-Z_]\w*)\s*=\s*(-?[\d]+(?:\.[\d]+)?)(?:\s*#.*)?$/gm;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(code)) !== null) {
        const name = m[1];
        if (SKIP_PARAMS.has(name)) continue;
        params[name] = m[2].includes('.') ? parseFloat(m[2]) : parseInt(m[2], 10);
    }
    return params;
}

/** Keep only numeric entries from the API's default_parameters. */
function filterNumericParams(raw: Record<string, unknown>): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw)) {
        if (typeof v === 'number' && !SKIP_PARAMS.has(k)) out[k] = v;
    }
    return out;
}

function BacktestContent() {
    const router = useRouter();
    const params = useParams();
    const strategyId = params.id as string;
    const searchParams = useSearchParams();

    const [strategy, setStrategy] = useState<Strategy | null>(null);
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState(false);
    const [results, setResults] = useState<any>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [savedExperimentId, setSavedExperimentId] = useState<number | null>(null);

    // Configuration state
    const [mode, setMode] = useState<'symbol' | 'sector' | 'all'>('symbol');
    const [symbol, setSymbol] = useState('');
    const [sector, setSector] = useState('');
    const [sectors, setSectors] = useState<{ name: string; count: number }[]>([]);

    // Parameters form state: Record<name, value>
    const [parameters, setParameters] = useState<Record<string, number>>({});

    // Period state
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [rangeType, setRangeType] = useState<'1y' | '3y' | '5y' | '10y' | 'all' | 'custom'>('5y');
    const [initialBalance, setInitialBalance] = useState<number>(100000);

    const abortControllerRef = useRef<AbortController | null>(null);
    const autorunRef = useRef(false);

    // Derive default params from API or by parsing code
    const defaultParams = useMemo(() => {
        if (!strategy) return {};
        if (strategy.default_parameters) {
            const fromApi = filterNumericParams(strategy.default_parameters as Record<string, unknown>);
            if (Object.keys(fromApi).length > 0) return fromApi;
        }
        return extractParamsFromCode(strategy.code);
    }, [strategy]);

    // Seed parameters once strategy loads (or URL overrides)
    useEffect(() => {
        if (!strategy) return;
        const urlParams = searchParams.get('params');
        if (urlParams) {
            try {
                const parsed = JSON.parse(decodeURIComponent(urlParams));
                setParameters(parsed);
                return;
            } catch { /* fall through */ }
        }
        setParameters(defaultParams);
    }, [defaultParams, searchParams]);

    useEffect(() => {
        if (strategyId) {
            fetchStrategy();
            fetchSectors();
        }
        const symbolParam = searchParams.get('symbol');
        if (symbolParam) setSymbol(symbolParam);
    }, [strategyId]);

    const fetchStrategy = async () => {
        try {
            const response = await api.get(`/api/stocks/strategies/${strategyId}/`);
            setStrategy(response.data);
        } catch {
            toast.error('Failed to load strategy');
        } finally {
            setLoading(false);
        }
    };

    const fetchSectors = async () => {
        try {
            const response = await api.get('/api/stocks/companies/sectors/');
            setSectors(response.data);
        } catch { /* silent */ }
    };

    // Auto-fetch published best config when scope changes
    useEffect(() => {
        if (!strategyId || !strategy || searchParams.get('params')) return;

        const fetchBestConfig = async () => {
            try {
                let query = '';
                if (mode === 'symbol' && symbol) query = `?symbol=${symbol}`;
                else if (mode === 'sector' && sector) query = `?sector=${sector}`;
                else if (mode === 'all') query = `?scope_type=ALL`;

                if (!query) return;
                const response = await api.get(`/api/stocks/strategies/${strategyId}/get_published_config/${query}`);
                if (response.data.parameters && Object.keys(response.data.parameters).length > 0) {
                    setParameters(response.data.parameters);
                }
            } catch { /* 404 expected when no published config */ }
        };

        const t = setTimeout(fetchBestConfig, 300);
        return () => clearTimeout(t);
    }, [symbol, sector, mode, strategyId, strategy]);

    // Auto-run from deep link
    useEffect(() => {
        if (
            searchParams.get('autorun') === 'true' &&
            strategy && !loading && !running && !results && !autorunRef.current && symbol
        ) {
            autorunRef.current = true;
            setTimeout(() => handleRun(), 500);
        }
    }, [strategy, loading, symbol, running, results]);

    const handleCancel = () => {
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        toast.info('Operation cancelled');
    };

    const handleRun = async () => {
        if (!strategy) return;
        if (mode === 'symbol' && !symbol) { toast.error('Please select a stock symbol'); return; }
        if (mode === 'sector' && !sector) { toast.error('Please select a sector'); return; }

        setRunning(true);
        setResults(null);
        setSavedExperimentId(null);

        try {
            const requestData: any = {
                code: strategy.code,
                start_date: startDate,
                end_date: endDate,
                parameters,
                initial_balance: initialBalance,
            };
            if (mode === 'symbol') requestData.symbol = symbol;
            else if (mode === 'sector') requestData.sector = sector;
            else if (mode === 'all') requestData.sector = 'ALL';

            abortControllerRef.current?.abort();
            abortControllerRef.current = new AbortController();

            const response = await api.post(
                `/api/stocks/strategies/${strategy.id}/backtest/`,
                requestData,
                { signal: abortControllerRef.current.signal },
            );
            setResults(response.data);
            toast.success(mode === 'sector' ? 'Sector backtest complete' : 'Backtest complete');
        } catch (error: any) {
            if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') return;
            toast.error(error.response?.data?.error || 'Backtest failed');
        } finally {
            setRunning(false);
        }
    };

    const handleSaveExperiment = async () => {
        if (!strategy || !results?.metadata) return;
        setIsSaving(true);
        try {
            const response = await api.post(`/api/stocks/strategies/${strategy.id}/save_experiment/`, {
                scope_type: results.metadata.scope_type,
                scope_value: results.metadata.scope_value,
                start_date: results.metadata.start_date,
                end_date: results.metadata.end_date,
                parameters: results.metadata.parameters,
                metrics: results.metadata.metrics,
                plot_html: results.plot_html,
            });
            setSavedExperimentId(response.data.id);
            toast.success('Experiment saved to history');
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Failed to save experiment');
        } finally {
            setIsSaving(false);
        }
    };

    const setParam = (name: string, value: number) =>
        setParameters(prev => ({ ...prev, [name]: value }));

    const isFloat = (v: number) => !Number.isInteger(v);

    const paramEntries = Object.entries(parameters);

    if (loading) return <DashboardLayout><div>Loading...</div></DashboardLayout>;

    return (
        <DashboardLayout
            showBack={true}
            title={
                <div className="flex items-center gap-3">
                    <span className="truncate dark:text-slate-100">Backtest — {strategy?.name || 'Strategy'}</span>
                    <Link
                        href={`/strategies/${strategyId}/editor`}
                        className="p-1 w-7 h-7 flex items-center justify-center rounded-md border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-card text-gray-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-white dark:hover:bg-slate-800 hover:border-blue-200 dark:hover:border-blue-900 transition-all shadow-sm group"
                        title="Edit Strategy code"
                    >
                        <Code size={14} className="group-hover:scale-110 transition-transform" />
                    </Link>
                </div>
            }
        >
            <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

                    {/* ── Configuration Panel ── */}
                    <div className="lg:col-span-4 xl:col-span-3">
                        <Card className="border-gray-200 dark:border-slate-800 shadow-md overflow-hidden sticky top-6 dark:bg-card">
                            <CardContent className="p-6 space-y-8">

                                {/* Mode Toggle */}
                                <div className="space-y-4">
                                    <Label className="text-sm font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wide">Backtest Mode</Label>
                                    <div className="flex p-1.5 bg-gray-100 dark:bg-slate-800 rounded-xl gap-1 shadow-inner">
                                        {(['symbol', 'sector', 'all'] as const).map(m => (
                                            <button
                                                key={m}
                                                onClick={() => setMode(m)}
                                                className={`flex-1 py-2 px-3 text-xs font-bold rounded-lg transition-all capitalize ${mode === m ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-md scale-105' : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800/50'}`}
                                            >
                                                {m}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Scope selector */}
                                {mode === 'symbol' && (
                                    <div className="space-y-3">
                                        <Label className="text-sm font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wide">Ticker Symbol</Label>
                                        <CompanySelect className="h-11 text-base dark:bg-card dark:border-slate-800 dark:text-slate-100" value={symbol} onChange={setSymbol} />
                                    </div>
                                )}
                                {mode === 'sector' && (
                                    <div className="space-y-3">
                                        <Label className="text-sm font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wide">Sector</Label>
                                        <select
                                            value={sector}
                                            onChange={e => setSector(e.target.value)}
                                            className="w-full h-11 px-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-card dark:text-slate-100 text-base focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none shadow-sm"
                                        >
                                            <option value="">Select a sector...</option>
                                            {sectors.map(s => <option key={s.name} value={s.name} className="dark:bg-card">{s.name} ({s.count})</option>)}
                                        </select>
                                    </div>
                                )}
                                {mode === 'all' && (
                                    <div className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-lg p-3">
                                        <div className="flex gap-2">
                                            <AlertTriangle size={14} className="text-blue-500 shrink-0 mt-0.5" />
                                            <p className="text-[11px] text-blue-700 dark:text-blue-400 leading-relaxed">
                                                Runs strategy on <strong>all active companies</strong>. This processing is resource intensive.
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* Optimized param selector */}
                                {mode === 'symbol' && symbol && (
                                    <ParameterObjectiveSelector
                                        strategyId={parseInt(strategyId)}
                                        symbol={symbol}
                                        onParametersSelected={(p, objective) => {
                                            setParameters(p);
                                            toast.success(`Using ${objective.replace('_', ' ')} optimized parameters`);
                                        }}
                                    />
                                )}

                                {/* ── Parameters Form ── */}
                                <div className="space-y-3 pt-6 border-t border-slate-100 dark:border-slate-800">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-sm font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wide">Parameters</Label>
                                        {Object.keys(defaultParams).length > 0 && (
                                            <button
                                                onClick={() => setParameters(defaultParams)}
                                                className="flex items-center gap-1 text-[10px] font-semibold text-gray-400 dark:text-slate-500 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
                                                title="Reset to code defaults"
                                            >
                                                <RotateCcw size={10} /> Reset
                                            </button>
                                        )}
                                    </div>

                                    {paramEntries.length === 0 ? (
                                        <p className="text-[11px] text-gray-400 dark:text-slate-500 italic py-2">
                                            No parameters detected in strategy code.
                                        </p>
                                    ) : (
                                        <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                                            {paramEntries.map(([name, value]) => (
                                                <div key={name} className="flex items-center gap-2">
                                                    <label
                                                        htmlFor={`param-${name}`}
                                                        className="flex-1 text-xs font-mono font-semibold text-gray-600 dark:text-slate-400 truncate"
                                                        title={name}
                                                    >
                                                        {name}
                                                    </label>
                                                    <input
                                                        id={`param-${name}`}
                                                        type="number"
                                                        value={value}
                                                        step={isFloat(defaultParams[name] ?? value) ? 0.01 : 1}
                                                        onChange={e => {
                                                            const raw = e.target.value;
                                                            const num = isFloat(defaultParams[name] ?? value)
                                                                ? parseFloat(raw)
                                                                : parseInt(raw, 10);
                                                            if (!isNaN(num)) setParam(name, num);
                                                        }}
                                                        className="w-24 h-8 px-2 text-xs text-right font-mono rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Capital & Period */}
                                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-4">
                                    <div className="space-y-3">
                                        <Label className="text-sm font-bold text-gray-700 dark:text-slate-300 uppercase tracking-wide">Initial Capital (NPR)</Label>
                                        <input
                                            type="number"
                                            value={initialBalance}
                                            onChange={e => setInitialBalance(Number(e.target.value))}
                                            className="w-full h-11 px-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-card dark:text-slate-100 text-base focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none shadow-sm"
                                            placeholder="100,000"
                                        />
                                    </div>
                                    <PeriodSelector
                                        startDate={startDate}
                                        endDate={endDate}
                                        setStartDate={setStartDate}
                                        setEndDate={setEndDate}
                                        rangeType={rangeType}
                                        setRangeType={setRangeType}
                                    />
                                </div>

                                {/* Actions */}
                                <div className="space-y-3 pt-8">
                                    <Button
                                        onClick={running ? handleCancel : handleRun}
                                        disabled={(mode === 'symbol' && !symbol) || (mode === 'sector' && !sector)}
                                        className={`w-full h-12 font-semibold uppercase tracking-wider text-sm shadow-lg group border-0 transition-all ${running ? 'bg-destructive text-white hover:opacity-90' : 'bg-primary text-primary-foreground hover:opacity-90 shadow-blue-300 text-white hover:shadow-xl hover:scale-105'}`}
                                    >
                                        {running ? (
                                            <><div className="w-4 h-4 border border-white/30 border-t-white rounded-full animate-spin mr-2" /> Cancel Run</>
                                        ) : (
                                            <><Play size={16} className="mr-2 group-hover:scale-110 transition-transform" /> Run Backtest</>
                                        )}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        onClick={() => router.push(`/strategies/${strategyId}/optimize`)}
                                        className="w-full h-11 text-xs uppercase font-extrabold border border-purple-200 dark:border-purple-900/50 text-purple-700 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 dark:bg-card hover:border-purple-300 dark:hover:border-purple-800 hover:shadow-md transition-all"
                                    >
                                        <Zap size={14} className="mr-2" /> Find Best Parameters
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* ── Results Panel ── */}
                    <div className="lg:col-span-8 xl:col-span-9 bg-white dark:bg-card rounded-2xl shadow-lg border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col min-h-[700px]">
                        {running ? (
                            <div className="h-full flex flex-col items-center justify-center">
                                <PageLoader text="Running backtest strategy..." />
                            </div>
                        ) : results ? (
                            <div className="h-full flex flex-col">
                                {/* Results header */}
                                {!savedExperimentId && results.metadata ? (
                                    <div className="bg-blue-600 px-6 py-4 flex items-center justify-between text-white border-b border-blue-700/50 shadow-inner">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm"><Check size={16} /></div>
                                            <div>
                                                <p className="text-xs font-bold text-white">Unsaved Experiment</p>
                                                <p className="text-[10px] opacity-80 font-medium text-white/90">Results are temporary. Save to persist in history.</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <Button variant="ghost" size="sm" onClick={() => setResults(null)} className="text-white hover:bg-white/10 h-9 px-4 text-[10px] font-bold uppercase">Discard</Button>
                                            <Button onClick={handleSaveExperiment} disabled={isSaving} className="bg-white text-blue-600 hover:bg-blue-50 h-9 px-5 text-[10px] font-semibold uppercase shadow-lg">
                                                {isSaving ? 'Saving...' : 'Save Experiment'}
                                            </Button>
                                        </div>
                                    </div>
                                ) : savedExperimentId ? (
                                    <div className="bg-green-600 px-6 py-4 flex items-center justify-between text-white border-b border-green-700/50 shadow-inner">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm"><Check size={16} /></div>
                                            <div>
                                                <p className="text-xs font-semibold uppercase tracking-wider">Experiment Saved</p>
                                                <p className="text-[10px] opacity-80 font-medium">This run has been persisted to your strategy history.</p>
                                            </div>
                                        </div>
                                        <Button variant="ghost" size="sm" onClick={() => window.open(`/strategies/${strategyId}/experiments/${savedExperimentId}`, '_blank')} className="bg-white/10 hover:bg-white/20 h-9 px-4 text-[10px] font-bold uppercase flex items-center gap-2 border border-white/10">
                                            <ExternalLink size={12} /> View Detail
                                        </Button>
                                    </div>
                                ) : null}

                                <div className="flex-1 overflow-auto p-4">
                                    {results.stats ? (
                                        <MetricsDisplay
                                            stats={results.stats}
                                            plotHtml={results.plot_html}
                                            strategyId={strategyId}
                                            chartHeight="750px"
                                        />
                                    ) : (
                                        /* Sector / All results table */
                                        <div className="flex flex-col h-full space-y-6">
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                <div className="bg-blue-50 dark:bg-blue-900/10 p-3 rounded-lg border border-blue-100 dark:border-blue-900/30">
                                                    <p className="text-xs text-blue-600 dark:text-blue-400">Total Companies</p>
                                                    <p className="text-lg font-bold text-blue-900 dark:text-blue-200">{results.total_companies}</p>
                                                </div>
                                                <div className="bg-green-50 dark:bg-green-900/10 p-3 rounded-lg border border-green-100 dark:border-green-900/30">
                                                    <p className="text-xs text-green-600 dark:text-green-400">Successful Runs</p>
                                                    <p className="text-lg font-bold text-green-900 dark:text-green-200">{results.successful_backtests}</p>
                                                </div>
                                                <div className="bg-gray-50 dark:bg-slate-800 p-3 rounded-lg">
                                                    <p className="text-xs text-gray-500 dark:text-slate-400">Success Rate</p>
                                                    <p className="text-lg font-bold dark:text-slate-100">{results.total_companies ? ((results.successful_backtests / results.total_companies) * 100).toFixed(0) : 0}%</p>
                                                </div>
                                                {results.aggregated && (
                                                    <div className="bg-gray-50 dark:bg-slate-800 p-3 rounded-lg">
                                                        <p className="text-xs text-gray-500 dark:text-slate-400">Avg Return</p>
                                                        <p className={`text-lg font-bold ${results.aggregated.avg_return >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                                            {results.aggregated.avg_return?.toFixed(2)}%
                                                        </p>
                                                    </div>
                                                )}
                                            </div>

                                            {results.individual_results?.length > 0 && (
                                                <div className="border border-slate-200 dark:border-slate-800 rounded-md">
                                                    <Table>
                                                        <TableCaption className="text-slate-500 dark:text-slate-400">Individual Stock Performance in Sector</TableCaption>
                                                        <TableHeader>
                                                            <TableRow className="bg-slate-50 dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800">
                                                                <TableHead className="text-slate-700 dark:text-slate-300">Symbol</TableHead>
                                                                <TableHead className="text-right text-slate-700 dark:text-slate-300">Return</TableHead>
                                                                <TableHead className="text-right text-slate-700 dark:text-slate-300">Win Rate</TableHead>
                                                                <TableHead className="text-right text-slate-700 dark:text-slate-300">Trades</TableHead>
                                                                <TableHead className="text-right text-slate-700 dark:text-slate-300">PnL</TableHead>
                                                            </TableRow>
                                                        </TableHeader>
                                                        <TableBody>
                                                            {results.individual_results.map((r: any, idx: number) => (
                                                                <TableRow key={idx} className="hover:bg-blue-50/20 dark:hover:bg-blue-900/10 border-border dark:border-slate-800">
                                                                    <TableCell className="font-medium dark:text-slate-200">{r.symbol}</TableCell>
                                                                    <TableCell className={`text-right font-bold ${r.pnl_percent >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{r.pnl_percent?.toFixed(2)}%</TableCell>
                                                                    <TableCell className="text-right dark:text-slate-300">{r.win_rate?.toFixed(1)}%</TableCell>
                                                                    <TableCell className="text-right dark:text-slate-300">{r.total_trades}</TableCell>
                                                                    <TableCell className={`text-right font-mono ${r.total_pnl >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{r.total_pnl?.toFixed(2)}</TableCell>
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
                            /* Empty state */
                            <div className="h-full flex flex-col items-center justify-center p-12 text-center bg-muted/40">
                                <div className="mb-6 p-6 surface">
                                    <Play size={48} className="text-blue-600 dark:text-blue-400" />
                                </div>
                                <h3 className="text-2xl font-semibold text-gray-900 dark:text-slate-100 mb-3">Ready to Backtest</h3>
                                <p className="text-base text-gray-600 dark:text-slate-400 max-w-lg mb-8 leading-relaxed">
                                    Configure your parameters on the left and run a backtest to see how your strategy would have performed with historical data.
                                </p>
                                <div className="bg-purple-50 dark:bg-purple-900/10 border border-purple-200 dark:border-purple-900/30 rounded-xl p-4 max-w-md">
                                    <p className="text-sm text-purple-900 dark:text-purple-300 font-medium mb-2">💡 Pro Tip</p>
                                    <p className="text-sm text-purple-700 dark:text-purple-400">
                                        Need help finding the best parameters?{' '}
                                        <button onClick={() => router.push(`/strategies/${strategyId}/optimize`)} className="text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 font-bold underline">
                                            Try Parameter Optimization →
                                        </button>
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}

export default function BacktestPage() {
    return (
        <Suspense fallback={<FullPageLoader />}>
            <BacktestContent />
        </Suspense>
    );
}
