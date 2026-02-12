'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { useRouter, useParams } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Zap, TrendingUp, Activity, CheckCircle, Play, ChevronDown, AlertTriangle, ExternalLink, Code } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

import { MetricsDisplay } from '../../components/MetricsDisplay';
import { SymbolSelector } from '@/components/SymbolSelector';

interface Strategy {
    id: number;
    name: string;
    description: string;
    code: string;
    optimization_config?: string;
}

export default function OptimizePage() {
    const router = useRouter();
    const params = useParams();
    const strategyId = params.id as string;

    const [strategy, setStrategy] = useState<Strategy | null>(null);
    const [loading, setLoading] = useState(true);
    const [optimizing, setOptimizing] = useState(false);
    const [configExpanded, setConfigExpanded] = useState(true);
    const [results, setResults] = useState<{
        status: 'pending' | 'loading' | 'success' | 'error',
        data?: any,
        folds?: number
    }>({ status: 'pending' });

    // Configuration state
    const [scope, setScope] = useState<'SINGLE' | 'SECTOR' | 'ALL'>('SINGLE');
    const [symbol, setSymbol] = useState('');
    const [sector, setSector] = useState('');
    const [sectors, setSectors] = useState<{ name: string; count: number }[]>([]);
    const [parallelEnvs, setParallelEnvs] = useState<number>(4);

    useEffect(() => {
        if (strategyId) {
            fetchStrategy();
            fetchSectors();
        }
    }, [strategyId]);

    const fetchStrategy = async () => {
        try {
            const response = await api.get(`/api/stocks/strategies/${strategyId}/`);
            setStrategy(response.data);
        } catch (error: any) {
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


    const initialParams = useMemo(() => {
        if (!strategy) return { "n1": [5, 30], "n2": [20, 100] };

        if (strategy.optimization_config) {
            try {
                const parsed = JSON.parse(strategy.optimization_config);
                if (Object.keys(parsed).length > 0) return parsed;
            } catch (e) {
                console.warn('Failed to parse optimization_config');
            }
        }

        const params: any = {};
        const regex = /^\s*(\w+)\s*=\s*([\d.]+)/gm;
        let match;
        while ((match = regex.exec(strategy.code)) !== null) {
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
    }, [strategy]);



    const [parameters, setParameters] = useState<{ name: string, min: number, max: number }[]>([]);

    useEffect(() => {
        if (initialParams) {
            const paramsArray = Object.entries(initialParams).map(([name, range]: [string, any]) => ({
                name,
                min: range[0],
                max: range[1]
            }));
            setParameters(paramsArray);
        }
    }, [initialParams]);

    const handleOptimize = async () => {
        if (scope === 'SINGLE' && !symbol) {
            toast.error('Please select a stock symbol');
            return;
        }
        if (scope === 'SECTOR' && !sector) {
            toast.error('Please select a sector');
            return;
        }

        setOptimizing(true);
        setResults({ status: 'loading' });

        try {
            // Parse parameter ranges
            const paramRanges: any = {};
            parameters.forEach(p => {
                paramRanges[p.name] = [p.min, p.max];
            });

            const requestData: any = {
                code: strategy!.code,
                symbol: scope === 'SINGLE' ? symbol : scope === 'ALL' ? 'ALL' : undefined,
                sector: scope === 'SECTOR' ? sector : undefined,
                param_ranges: paramRanges,
                n_trials: 100, // Still send but backend will prioritize exhaustive search
                parallel_envs: parallelEnvs
            };

            const response = await api.post(`/api/stocks/strategies/${strategy!.id}/optimize_multi_period/`, requestData);

            if (response.data.success || response.data.status === 'success') {
                setResults({
                    status: 'success',
                    data: response.data.results,
                    folds: response.data.folds_evaluated
                });
                toast.success(`K-fold optimization complete!`);
            } else {
                throw new Error(response.data.error || 'Optimization failed');
            }
        } catch (error: any) {
            console.error('Optimization failed', error);
            const errorMessage = error.response?.data?.error || error.message || 'Optimization failed';
            toast.error(errorMessage);
            setResults({ status: 'error' });
        } finally {
            setOptimizing(false);
        }
    };

    const handleApplyParameters = () => {
        if (!results.data || !results.data.balanced) return;

        const params = JSON.stringify(results.data.balanced.best_params, null, 2);
        const encodedParams = encodeURIComponent(params);
        router.push(`/strategies/${strategyId}/backtest?params=${encodedParams}${symbol ? `&symbol=${symbol}` : ''}`);
    };

    if (loading) return <DashboardLayout><div>Loading...</div></DashboardLayout>;

    return (
        <DashboardLayout
            showBack={true}
            title={
                <div className="flex items-center gap-3">
                    <span className="truncate">Optimize - {strategy?.name || 'Strategy'}</span>
                    <Link
                        href={`/strategies/${strategyId}/editor`}
                        className="p-1 w-7 h-7 flex items-center justify-center rounded-md border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900 text-gray-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-white dark:hover:bg-slate-800 hover:border-blue-200 dark:hover:border-blue-900/50 transition-all shadow-sm group"
                        title="Edit Strategy code"
                    >
                        <Code size={14} className="group-hover:scale-110 transition-transform" />
                    </Link>
                </div>
            }
        >
            <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* Configuration Panel */}
                    <div className="lg:col-span-4 xl:col-span-3">
                        <Card className="border-gray-200 dark:border-slate-800 shadow-sm overflow-hidden sticky top-6 dark:bg-slate-900">
                            {configExpanded && (
                                <CardContent className="p-6 space-y-6">
                                    {/* Scope Section */}
                                    <div className="space-y-4">
                                        <div>
                                            <Label className="text-xs font-bold text-gray-500 dark:text-slate-400 mb-2 block uppercase tracking-wider">Scope</Label>
                                            <div className="flex p-1.5 bg-gray-100 dark:bg-slate-950 rounded-xl gap-1 shadow-inner border border-gray-200/50 dark:border-slate-800">
                                                <button
                                                    onClick={() => setScope('SINGLE')}
                                                    className={`flex-1 py-2.5 px-2 text-xs font-bold rounded-lg transition-all duration-200 ${scope === 'SINGLE' ? 'bg-white dark:bg-slate-800 text-purple-700 dark:text-purple-400 shadow-sm scale-[1.02]' : 'text-gray-500 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800/50'}`}
                                                >
                                                    Single
                                                </button>
                                                <button
                                                    onClick={() => setScope('SECTOR')}
                                                    className={`flex-1 py-2.5 px-2 text-xs font-bold rounded-lg transition-all duration-200 ${scope === 'SECTOR' ? 'bg-white dark:bg-slate-800 text-purple-700 dark:text-purple-400 shadow-sm scale-[1.02]' : 'text-gray-500 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800/50'}`}
                                                >
                                                    Sector
                                                </button>
                                                <button
                                                    onClick={() => setScope('ALL')}
                                                    className={`flex-1 py-2.5 px-2 text-xs font-bold rounded-lg transition-all duration-200 ${scope === 'ALL' ? 'bg-white dark:bg-slate-800 text-purple-700 dark:text-purple-400 shadow-sm scale-[1.02]' : 'text-gray-500 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800/50'}`}
                                                >
                                                    All
                                                </button>
                                            </div>
                                        </div>

                                        {/* Parallel Environments Selector */}
                                        <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                                            <Label className="text-xs font-bold text-gray-500 dark:text-slate-400 mb-2 block">Parallel Environments</Label>
                                            <div className="flex p-1 bg-gray-50 dark:bg-slate-950 rounded-lg gap-1 border border-gray-200/50 dark:border-slate-800">
                                                {[1, 4, 8].map((val) => (
                                                    <button
                                                        key={val}
                                                        onClick={() => setParallelEnvs(val)}
                                                        className={`flex-1 py-1.5 text-[10px] font-bold rounded transition-all ${parallelEnvs === val ? 'bg-purple-600 dark:bg-purple-700 text-white shadow-sm' : 'text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300'}`}
                                                    >
                                                        {val} CPU
                                                    </button>
                                                ))}
                                            </div>
                                            <p className="text-[9px] text-gray-400 dark:text-slate-500 mt-1 px-1">Speed up exhaustive search using multiple cores.</p>
                                        </div>

                                        {/* Target Selection (Symbol or Sector) - Conditionally Rendered */}
                                        {scope === 'SINGLE' && (
                                            <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                                                <Label className="text-xs font-bold text-gray-400 mb-2 block uppercase tracking-wider">Symbol Target</Label>
                                                <div className="relative">
                                                    <SymbolSelector
                                                        value={symbol}
                                                        onChange={setSymbol}
                                                        className="w-full h-11"
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        {scope === 'SECTOR' && (
                                            <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                                                <Label className="text-[10px] font-bold text-gray-400 dark:text-slate-500 mb-2 block uppercase tracking-wider">Sector Target</Label>
                                                <select
                                                    value={sector}
                                                    onChange={(e) => setSector(e.target.value)}
                                                    className="w-full h-10 px-3 text-xs rounded-xl border-2 border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-900 focus:border-purple-200 dark:focus:border-purple-900/50 focus:ring-4 focus:ring-purple-500/5 outline-none transition-all shadow-sm"
                                                >
                                                    <option value="" className="dark:bg-slate-900">Select sector...</option>
                                                    {sectors.map((s) => (
                                                        <option key={s.name} value={s.name} className="dark:bg-slate-900">{s.name} ({s.count})</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}

                                        {scope === 'ALL' && (
                                            <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                                                <Label className="text-[10px] font-bold text-gray-400 dark:text-slate-500 mb-2 block uppercase tracking-wider">Target</Label>
                                                <div className="w-full h-10 px-3 text-xs flex items-center text-gray-500 dark:text-slate-400 bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl italic">
                                                    All available symbols
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Parameters Section */}
                                    <div className="pt-6 border-t border-gray-100">
                                        <Label className="text-xs font-semibold text-gray-500 mb-3 block uppercase tracking-wider">Parameter Ranges</Label>
                                        <div className="relative max-h-[60vh] overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                                            {parameters.map((param, idx) => (
                                                <div key={param.name} className="space-y-1">
                                                    <div className="text-xs font-mono font-semibold text-gray-600 truncate flex justify-between items-center" title={param.name}>
                                                        <span>{param.name}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="number"
                                                            value={param.min}
                                                            onChange={(e) => {
                                                                const newParams = [...parameters];
                                                                newParams[idx].min = parseInt(e.target.value) || 0;
                                                                setParameters(newParams);
                                                            }}
                                                            className="w-20 h-9 px-3 text-xs text-center border rounded-md border-gray-200 dark:border-slate-800 focus:ring-1 focus:ring-purple-500 outline-none bg-gray-50/50 dark:bg-slate-950 dark:text-slate-100 font-medium"
                                                            placeholder="Min"
                                                        />
                                                        <span className="text-gray-300 text-[10px]">to</span>
                                                        <input
                                                            type="number"
                                                            value={param.max}
                                                            onChange={(e) => {
                                                                const newParams = [...parameters];
                                                                newParams[idx].max = parseInt(e.target.value) || 0;
                                                                setParameters(newParams);
                                                            }}
                                                            className="w-20 h-9 px-3 text-xs text-center border rounded-md border-gray-200 dark:border-slate-800 focus:ring-1 focus:ring-purple-500 outline-none bg-gray-50/50 dark:bg-slate-950 dark:text-slate-100 font-medium"
                                                            placeholder="Max"
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                            {parameters.length === 0 && (
                                                <div className="text-[10px] text-gray-400 text-center py-4 italic">
                                                    No parameters found
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Action Button */}
                                    <div className="pt-6 border-t border-gray-100">
                                        <Button
                                            onClick={handleOptimize}
                                            disabled={optimizing || (scope === 'SINGLE' && !symbol) || (scope === 'SECTOR' && !sector)}
                                            className="w-full h-11 text-xs font-bold uppercase tracking-wider bg-purple-600 dark:bg-purple-700 hover:bg-purple-700 dark:hover:bg-purple-800 text-white shadow-lg shadow-purple-200 dark:shadow-purple-900/20 active:scale-95 transition-all rounded-xl"
                                        >
                                            {optimizing ? (
                                                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" /> RUNNING</>
                                            ) : (
                                                <><Zap size={16} className="mr-2" /> START OPTIMIZATION</>
                                            )}
                                        </Button>
                                    </div>
                                </CardContent>
                            )}
                        </Card>
                    </div>

                    {/* K-Fold Optimization Results Panel */}
                    <div className="lg:col-span-8 xl:col-span-9 space-y-6 pb-20">
                        {results.status === 'pending' && (
                            <div className="h-[400px] flex flex-col items-center justify-center border-2 border-dashed border-gray-200 dark:border-slate-800 rounded-3xl bg-gray-50/30 dark:bg-slate-900/20 text-center px-10">
                                <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 mb-4 scale-110">
                                    <Activity size={32} className="text-purple-200 dark:text-purple-900" />
                                </div>
                                <h3 className="text-lg font-bold text-gray-800 dark:text-slate-100">Ready to Optimize</h3>
                                <p className="text-sm text-gray-500 dark:text-slate-400 max-w-sm mt-1">
                                    Click "Start Optimization" to find the best parameters using 3-year chronological K-fold cross-validation.
                                </p>
                            </div>
                        )}

                        {results.status === 'loading' && (
                            <Card className="border-purple-100 dark:border-purple-900/50 dark:bg-slate-900 shadow-xl shadow-purple-50/50 dark:shadow-purple-900/10 overflow-hidden">
                                <div className="p-12 flex flex-col items-center justify-center text-center">
                                    <div className="w-20 h-2 bg-purple-50 dark:bg-purple-900/20 rounded-full overflow-hidden mb-6">
                                        <div className="h-full bg-purple-600 dark:bg-purple-500 animate-[loading_1.5s_ease-in-out_infinite]" />
                                    </div>
                                    <Zap size={40} className="text-purple-600 dark:text-purple-400 animate-pulse mb-4" />
                                    <h3 className="text-xl font-black text-gray-900 dark:text-slate-100 uppercase tracking-tight">Optimizing Strategy</h3>
                                    <p className="text-sm font-medium text-gray-600 dark:text-slate-400 mt-2">Evaluating parameters across all 3-year historical folds...</p>
                                    <p className="text-xs text-gray-400 dark:text-slate-500 mt-2 font-mono italic">This ensures robustness across different market regimes</p>
                                </div>
                            </Card>
                        )}

                        {results.status === 'error' && (
                            <Card className="border-red-100 dark:border-red-900/30 bg-red-50/30 dark:bg-red-950/10 overflow-hidden">
                                <div className="p-12 flex flex-col items-center justify-center text-center">
                                    <div className="p-3 bg-red-100 dark:bg-red-900/40 rounded-2xl mb-4">
                                        <AlertTriangle size={32} className="text-red-600 dark:text-red-400" />
                                    </div>
                                    <h3 className="text-lg font-bold text-red-900 dark:text-red-200">Optimization Failed</h3>
                                    <p className="text-sm text-red-600 dark:text-red-400 mt-1">There was an error processing your request. Please check your strategy code and parameter ranges.</p>
                                    <Button
                                        variant="outline"
                                        className="mt-6 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
                                        onClick={handleOptimize}
                                    >
                                        Try Again
                                    </Button>
                                </div>
                            </Card>
                        )}

                        {results.status === 'success' && results.data && (
                            <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl shadow-slate-200/50 dark:shadow-slate-950 border border-slate-200 dark:border-slate-800 overflow-hidden">
                                <div className="px-8 py-5 bg-gradient-to-r from-slate-900 to-slate-800 dark:from-slate-950 dark:to-slate-900 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-purple-500/20 rounded-lg">
                                            <Activity size={18} className="text-purple-300" />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-black text-white uppercase tracking-widest">K-Fold Results</h3>
                                            <p className="text-[10px] text-slate-400 font-bold">Evaluated across {results.folds || 0} folds (3Y each)</p>
                                        </div>
                                    </div>
                                    <Badge className="bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border-emerald-500/30 text-[10px] uppercase font-black tracking-widest px-3 py-1">
                                        <CheckCircle size={10} className="mr-1.5" /> Complete & Auto-Published
                                    </Badge>
                                </div>

                                <div className="p-8">
                                    <div className="overflow-x-auto rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-950/20">
                                        <table className="w-full text-sm border-collapse">
                                            <thead>
                                                <tr>
                                                    <th className="p-4 text-left bg-slate-100/50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 w-1/4 text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Optimization Metric</th>
                                                    {['win_rate', 'profit', 'balanced'].map(obj => (
                                                        <th key={obj} className={`p-4 text-left border-b border-slate-200 dark:border-slate-800 w-1/4 uppercase tracking-widest text-[10px] font-black ${obj === 'balanced' ? 'bg-purple-600 dark:bg-purple-700 text-white' : 'bg-slate-100/50 dark:bg-slate-900/50 text-slate-700 dark:text-slate-300'}`}>
                                                            {obj.replace('_', ' ')}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white dark:bg-slate-900">
                                                {/* Parameters Row */}
                                                <tr>
                                                    <td className="p-4 font-bold text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800 align-top text-xs uppercase">Best Parameters</td>
                                                    {['win_rate', 'profit', 'balanced'].map(obj => {
                                                        const objData = results.data![obj];
                                                        return (
                                                            <td key={obj} className={`p-4 border-b border-slate-100 dark:border-slate-800 align-top ${obj === 'balanced' ? 'bg-purple-50/30 dark:bg-purple-900/20' : ''}`}>
                                                                <pre className="text-[11px] text-slate-600 dark:text-slate-300 whitespace-pre-wrap font-mono font-bold leading-relaxed">
                                                                    {JSON.stringify(objData?.best_params || {}, null, 2).replace(/{|}|"/g, '').trim()}
                                                                </pre>
                                                            </td>
                                                        );
                                                    })}
                                                </tr>

                                                {/* Key Metrics Rows */}
                                                {[
                                                    { label: 'Avg. Win Rate', path: ['stats', 'categorized', 'Trade Metrics', 'Win Rate [%]'] },
                                                    { label: 'Avg. Total Return', path: ['stats', 'categorized', 'Performance Metrics', 'Return [%]'] },
                                                    { label: 'Avg. Max Drawdown', path: ['stats', 'categorized', 'Risk Metrics', 'Max Drawdown [%]'] },
                                                    { label: 'Avg. Sharpe Ratio', path: ['stats', 'categorized', 'Performance Metrics', 'Sharpe Ratio'] },
                                                    { label: 'Avg. Profit Factor', path: ['stats', 'categorized', 'Trade Metrics', 'Profit Factor'] },
                                                    { label: 'Total Trades (Sum)', path: ['stats', 'categorized', 'Trade Metrics', 'Total Trades'] },
                                                ].map((row: any, i) => (
                                                    <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                                                        <td className="p-4 font-semibold text-slate-600 dark:text-slate-300 border-b border-slate-50 dark:border-slate-800/50 text-xs">{row.label}</td>
                                                        {['win_rate', 'profit', 'balanced'].map(obj => {
                                                            const objData = results.data![obj];
                                                            let value = '-';

                                                            if (objData) {
                                                                if (row.path && objData.stats) {
                                                                    let current = objData;
                                                                    for (const key of row.path) {
                                                                        current = current?.[key];
                                                                    }
                                                                    value = current !== undefined ? String(current) : '-';
                                                                }
                                                            }

                                                            const isBalanced = obj === 'balanced';
                                                            return (
                                                                <td key={obj} className={`p-4 border-b border-slate-50 dark:border-slate-800/50 font-mono text-xs ${isBalanced ? 'bg-purple-50/30 dark:bg-purple-900/20 font-black text-purple-900 dark:text-purple-300' : 'text-slate-600 dark:text-slate-400 font-bold'}`}>
                                                                    {value}
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                ))}

                                                {/* Action Row */}
                                                <tr>
                                                    <td className="p-4 border-b border-slate-50 dark:border-slate-800"></td>
                                                    {['win_rate', 'profit', 'balanced'].map(obj => {
                                                        const expId = results.data![obj]?.experiment_id;
                                                        return (
                                                            <td key={obj} className={`p-4 border-b border-slate-50 dark:border-slate-800 ${obj === 'balanced' ? 'bg-purple-50/30 dark:bg-purple-900/20' : ''}`}>
                                                                {expId && (
                                                                    <div className="flex flex-col gap-2">
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="sm"
                                                                            className="w-full text-[10px] h-8 uppercase font-black text-slate-500 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-white dark:hover:bg-slate-800 border border-transparent hover:border-purple-100 dark:hover:border-purple-900 transition-all"
                                                                            onClick={() => window.open(`/strategies/${strategyId}/experiments/${expId}`, '_blank')}
                                                                        >
                                                                            <ExternalLink size={12} className="mr-1.5" /> View Results
                                                                        </Button>
                                                                    </div>
                                                                )}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>

                                    <div className="mt-10 p-6 bg-slate-900 dark:bg-slate-950 rounded-3xl text-white flex flex-col md:flex-row items-center justify-between gap-6 shadow-2xl shadow-slate-400 dark:shadow-slate-950">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 bg-white/10 dark:bg-white/5 rounded-2xl flex items-center justify-center border border-white/10 dark:border-white/5">
                                                <TrendingUp size={24} className="text-purple-300 dark:text-purple-400" />
                                            </div>
                                            <div>
                                                <p className="text-white dark:text-slate-200 font-black uppercase tracking-widest text-[10px]">Ready to deploy?</p>
                                                <h4 className="text-blue-200 dark:text-blue-300 font-bold text-sm">Balanced optimization found stable parameters.</h4>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <Button
                                                onClick={handleApplyParameters}
                                                className="h-12 px-8 rounded-2xl bg-white dark:bg-slate-200 text-slate-900 dark:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-300 font-black uppercase tracking-widest text-xs shadow-lg transition-transform active:scale-95"
                                            >
                                                Apply Balanced Config
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
