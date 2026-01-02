'use client';

import { useState, useEffect, useMemo } from 'react';
import api from '@/lib/api';
import { useRouter, useParams } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Zap, TrendingUp, Activity, CheckCircle, Play } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PeriodSelector } from '../../components/PeriodSelector';

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
    const [results, setResults] = useState<any>(null);

    // Configuration state
    const [scope, setScope] = useState<'SINGLE' | 'SECTOR' | 'ALL'>('SINGLE');
    const [symbol, setSymbol] = useState('');
    const [sector, setSector] = useState('');
    const [sectors, setSectors] = useState<{ name: string; count: number }[]>([]);
    const [method, setMethod] = useState<'auto' | 'grid' | 'bayes'>('bayes');
    const [objective, setObjective] = useState<'win_rate' | 'profit' | 'balanced'>('balanced');
    const [validationSplit, setValidationSplit] = useState(0.2);

    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [rangeType, setRangeType] = useState<'5y' | '10y' | 'all' | 'custom'>('10y');

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

    const formatParams = (params: any) => {
        return Object.entries(params)
            .map(([key, value]) => `${key}: [${(value as number[]).join(', ')}]`)
            .join('\n');
    };

    const [paramText, setParamText] = useState('');

    useEffect(() => {
        setParamText(formatParams(initialParams));
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
        setResults(null);

        try {
            // Parse parameter ranges
            let processStr = paramText.trim();
            processStr = processStr.replace(/^(\s*)(\w+)(\s*):/gm, '$1"$2"$3:');
            processStr = processStr.replace(/](?!\s*,)\s*(\n|$)/g, '],$1');
            processStr = processStr.replace(/,\s*$/, '');
            if (!processStr.startsWith('{')) processStr = '{' + processStr + '}';

            const paramRanges = JSON.parse(processStr);

            const requestData: any = {
                code: strategy!.code,
                symbol: scope === 'SINGLE' ? symbol : scope === 'ALL' ? 'ALL' : undefined,
                sector: scope === 'SECTOR' ? sector : undefined,
                start_date: startDate || undefined,
                end_date: endDate || undefined,
                param_ranges: paramRanges,
                n_trials: 100,
                method: method,
                objective: objective,
                validation_split: validationSplit
            };

            const response = await api.post(`/api/stocks/strategies/${strategy!.id}/optimize/`, requestData);
            setResults(response.data);
            toast.success(`Optimization complete! Best return: ${response.data.best_value.toFixed(2)}%`);
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Optimization failed');
        } finally {
            setOptimizing(false);
        }
    };

    const handleApplyParameters = () => {
        if (!results) return;
        const params = JSON.stringify(results.best_params, null, 2);
        const encodedParams = encodeURIComponent(params);
        router.push(`/strategies/${strategyId}/backtest?params=${encodedParams}${symbol ? `&symbol=${symbol}` : ''}`);
    };

    if (loading) return <DashboardLayout><div>Loading...</div></DashboardLayout>;

    return (
        <DashboardLayout
            title={`Optimize - ${strategy?.name || 'Strategy'}`}
            subtitle="Find the best parameters for your trading strategy"
        >
            <div className="space-y-6">
                <div className="flex items-center gap-2 -mt-4 mb-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push(`/strategies/${strategyId}`)}
                        className="h-8 gap-1 text-gray-500 hover:text-gray-900"
                    >
                        <ArrowLeft size={14} /> Back to Strategy
                    </Button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Configuration Panel */}
                    <div className="lg:col-span-5 xl:col-span-4">
                        <Card className="border-gray-200 shadow-sm overflow-hidden sticky top-6">
                            <CardHeader className="py-4 px-6 bg-purple-50/50 border-b border-purple-100">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 bg-purple-100 text-purple-600 rounded-lg">
                                        <Zap size={16} />
                                    </div>
                                    <div>
                                        <CardTitle className="text-sm font-bold uppercase tracking-wider text-purple-700">Optimization Settings</CardTitle>
                                        <CardDescription className="text-[10px] text-purple-600">Configure parameter search space</CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="p-6 space-y-6">
                                {/* Scope Selection */}
                                <div className="space-y-3">
                                    <Label className="text-xs font-bold text-gray-500 uppercase">Optimization Scope</Label>
                                    <div className="flex p-1 bg-gray-100 rounded-lg gap-1">
                                        <button
                                            onClick={() => setScope('SINGLE')}
                                            className={`flex-1 py-1.5 px-2 text-[10px] font-bold rounded-md transition-all ${scope === 'SINGLE' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500'}`}
                                        >
                                            SINGLE
                                        </button>
                                        <button
                                            onClick={() => setScope('SECTOR')}
                                            className={`flex-1 py-1.5 px-2 text-[10px] font-bold rounded-md transition-all ${scope === 'SECTOR' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500'}`}
                                        >
                                            SECTOR
                                        </button>
                                        <button
                                            onClick={() => setScope('ALL')}
                                            className={`flex-1 py-1.5 px-2 text-[10px] font-bold rounded-md transition-all ${scope === 'ALL' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500'}`}
                                        >
                                            ALL
                                        </button>
                                    </div>
                                </div>

                                {scope === 'SINGLE' && (
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold text-gray-500 uppercase">Symbol</Label>
                                        <input
                                            type="text"
                                            value={symbol}
                                            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                                            placeholder="e.g. NABIL"
                                            className="w-full h-9 px-3 rounded-md border border-gray-300 bg-white text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                                        />
                                    </div>
                                )}

                                {scope === 'SECTOR' && (
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold text-gray-500 uppercase">Sector</Label>
                                        <select
                                            value={sector}
                                            onChange={(e) => setSector(e.target.value)}
                                            className="w-full h-9 px-3 rounded-md border border-gray-300 bg-white text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                                        >
                                            <option value="">Select sector...</option>
                                            {sectors.map((s) => (
                                                <option key={s.name} value={s.name}>{s.name} ({s.count})</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold text-gray-500 uppercase">Method</Label>
                                        <select
                                            value={method}
                                            onChange={(e) => setMethod(e.target.value as any)}
                                            className="w-full h-9 px-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 text-sm bg-white outline-none"
                                        >
                                            <option value="auto">Auto</option>
                                            <option value="grid">Grid</option>
                                            <option value="bayes">Bayesian</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold text-gray-500 uppercase">Objective</Label>
                                        <select
                                            value={objective}
                                            onChange={(e) => setObjective(e.target.value as any)}
                                            className="w-full h-9 px-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 text-sm bg-white outline-none"
                                        >
                                            <option value="balanced">Balanced</option>
                                            <option value="profit">Max Profit</option>
                                            <option value="win_rate">Win Rate</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="space-y-2 pt-4 border-t border-gray-100">
                                    <Label className="text-xs font-bold text-gray-500 uppercase">Parameter Ranges</Label>
                                    <textarea
                                        value={paramText}
                                        onChange={(e) => setParamText(e.target.value)}
                                        className="w-full h-32 p-2 text-[11px] font-mono border rounded-md bg-white focus:ring-2 focus:ring-purple-500 outline-none resize-none"
                                        placeholder='n1: [5, 30]\nn2: [20, 100]'
                                    />
                                    <p className="text-[10px] text-gray-500">Format: param_name: [min, max]</p>
                                </div>

                                <div className="pt-4 border-t border-gray-100">
                                    <PeriodSelector
                                        startDate={startDate}
                                        endDate={endDate}
                                        setStartDate={setStartDate}
                                        setEndDate={setEndDate}
                                        rangeType={rangeType}
                                        setRangeType={setRangeType}
                                    />
                                </div>

                                <div className="space-y-2 pt-6">
                                    <Button
                                        onClick={handleOptimize}
                                        disabled={optimizing || (scope === 'SINGLE' && !symbol) || (scope === 'SECTOR' && !sector)}
                                        className="w-full h-10 font-bold uppercase tracking-wider text-xs shadow-md bg-purple-600 hover:bg-purple-700 text-white"
                                    >
                                        {optimizing ? (
                                            <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" /> Optimizing...</>
                                        ) : (
                                            <><Zap size={14} className="mr-2" /> Start Optimization</>
                                        )}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        onClick={() => router.push(`/strategies/${strategyId}/backtest`)}
                                        className="w-full h-9 text-[10px] uppercase font-bold"
                                    >
                                        <Play size={12} className="mr-1.5" /> Run Backtest Instead
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Results Panel */}
                    <div className="lg:col-span-7 xl:col-span-8 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col min-h-[700px]">
                        {optimizing ? (
                            <div className="h-full flex flex-col items-center justify-center space-y-4">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
                                <p className="text-gray-500 animate-pulse">Finding optimal parameters...</p>
                                <p className="text-xs text-gray-400">This may take a few minutes</p>
                            </div>
                        ) : results ? (
                            <div className="p-6 space-y-6">
                                <div className="flex items-center justify-between border-b pb-4">
                                    <div>
                                        <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                            <CheckCircle className="text-green-500" size={20} />
                                            Optimization Complete
                                        </h3>
                                        <p className="text-sm text-gray-500 mt-1">Found optimal parameters after {results.n_trials || 100} trials</p>
                                    </div>
                                    <Button
                                        onClick={handleApplyParameters}
                                        className="bg-green-600 hover:bg-green-700 text-white gap-2"
                                    >
                                        <Play size={14} /> Test These Parameters
                                    </Button>
                                </div>

                                <div className="grid grid-cols-3 gap-4">
                                    <Card className="bg-green-50 border-green-100">
                                        <CardContent className="p-4">
                                            <p className="text-xs text-green-600 font-medium mb-1">Best Return</p>
                                            <p className="text-2xl font-bold text-green-700">{results.best_value?.toFixed(2)}%</p>
                                        </CardContent>
                                    </Card>
                                    <Card className="bg-blue-50 border-blue-100">
                                        <CardContent className="p-4">
                                            <p className="text-xs text-blue-600 font-medium mb-1">Trials Completed</p>
                                            <p className="text-2xl font-bold text-blue-700">{results.n_trials || 100}</p>
                                        </CardContent>
                                    </Card>
                                    <Card className="bg-purple-50 border-purple-100">
                                        <CardContent className="p-4">
                                            <p className="text-xs text-purple-600 font-medium mb-1">Method</p>
                                            <p className="text-lg font-bold text-purple-700 capitalize">{method}</p>
                                        </CardContent>
                                    </Card>
                                </div>

                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-base">Best Parameters Found</CardTitle>
                                        <CardDescription>Use these optimized parameters in your backtest</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <pre className="bg-gray-900 text-gray-50 p-4 rounded-lg text-sm font-mono overflow-auto">
                                            {JSON.stringify(results.best_params, null, 2)}
                                        </pre>
                                    </CardContent>
                                </Card>

                                {results.validation_metrics && (
                                    <Card>
                                        <CardHeader>
                                            <CardTitle className="text-base">Validation Metrics</CardTitle>
                                            <CardDescription>Out-of-sample performance on {(validationSplit * 100).toFixed(0)}% validation set</CardDescription>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                {Object.entries(results.validation_metrics).map(([key, value]: [string, any]) => (
                                                    <div key={key} className="bg-gray-50 p-3 rounded-lg">
                                                        <p className="text-xs text-gray-500 mb-1 capitalize">{key.replace(/_/g, ' ')}</p>
                                                        <p className="font-bold text-gray-900">{typeof value === 'number' ? value.toFixed(2) : value}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </CardContent>
                                    </Card>
                                )}
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                                <div className="mb-4 p-4 bg-purple-100 rounded-full">
                                    <Zap size={32} className="text-purple-600" />
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">Ready to Optimize</h3>
                                <p className="text-sm text-gray-500 max-w-md mb-6">
                                    Configure your parameter search space on the left and start optimization to find the best parameters for your strategy.
                                </p>
                                <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 max-w-md">
                                    <p className="text-xs text-blue-700">
                                        <strong>Tip:</strong> Bayesian optimization is recommended for most cases as it intelligently explores the parameter space.
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
