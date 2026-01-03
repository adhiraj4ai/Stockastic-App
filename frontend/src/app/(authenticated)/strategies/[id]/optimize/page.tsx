'use client';

import { useState, useEffect, useMemo } from 'react';
import api from '@/lib/api';
import { useRouter, useParams } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Zap, TrendingUp, Activity, CheckCircle, Play, ChevronDown, AlertTriangle, ExternalLink } from 'lucide-react';
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
    // State for progressive optimization
    const [periodResults, setPeriodResults] = useState<Record<string, { status: 'pending' | 'loading' | 'success' | 'error', data?: any }>>({
        '1Y': { status: 'pending' },
        '3Y': { status: 'pending' },
        '5Y': { status: 'pending' },
        '10Y': { status: 'pending' }
    });
    // const [results, setResults] = useState<any>(null); // Deprecated

    // Configuration state
    const [scope, setScope] = useState<'SINGLE' | 'SECTOR' | 'ALL'>('SINGLE');
    const [symbol, setSymbol] = useState('');
    const [sector, setSector] = useState('');
    const [sectors, setSectors] = useState<{ name: string; count: number }[]>([]);
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
        // Reset state
        setPeriodResults({
            '1Y': { status: 'pending' },
            '3Y': { status: 'pending' },
            '5Y': { status: 'pending' },
            '10Y': { status: 'pending' }
        });

        const periods = ['1Y', '3Y', '5Y', '10Y'];

        try {
            // Parse parameter ranges
            const paramRanges: any = {};
            parameters.forEach(p => {
                paramRanges[p.name] = [p.min, p.max];
            });

            for (const period of periods) {
                // Update status to loading for this period
                setPeriodResults(prev => ({
                    ...prev,
                    [period]: { status: 'loading' }
                }));

                const requestData: any = {
                    code: strategy!.code,
                    symbol: scope === 'SINGLE' ? symbol : scope === 'ALL' ? 'ALL' : undefined,
                    sector: scope === 'SECTOR' ? sector : undefined,
                    start_date: startDate || undefined,
                    end_date: endDate || undefined,
                    param_ranges: paramRanges,
                    n_trials: 100,
                    validation_split: validationSplit,
                    periods: [period]
                };

                try {
                    const response = await api.post(`/api/stocks/strategies/${strategy!.id}/optimize_multi_period/`, requestData);
                    const periodData = response.data.results_by_period[period];

                    setPeriodResults(prev => ({
                        ...prev,
                        [period]: { status: 'success', data: periodData }
                    }));
                } catch (error) {
                    console.error(`Failed period ${period}`, error);
                    setPeriodResults(prev => ({
                        ...prev,
                        [period]: { status: 'error' }
                    }));
                }
            }
            toast.success(`Sequential optimization complete!`);
        } catch (error: any) {
            toast.error('Optimization sequence failed');
        } finally {
            setOptimizing(false);
        }
    };

    const handleApplyParameters = () => {
        // Find best overall (e.g. from 3Y or 5Y)
        const bestPeriod = periodResults['3Y'].data ? '3Y' : '1Y';
        if (!periodResults[bestPeriod].data) return;

        const params = JSON.stringify(periodResults[bestPeriod].data.balanced.best_params, null, 2);
        const encodedParams = encodeURIComponent(params);
        router.push(`/strategies/${strategyId}/backtest?params=${encodedParams}${symbol ? `&symbol=${symbol}` : ''}`);
    };

    if (loading) return <DashboardLayout><div>Loading...</div></DashboardLayout>;

    return (
        <DashboardLayout
            showBack={true}
            title={`Optimize - ${strategy?.name || 'Strategy'}`}
        >
            <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* Configuration Panel */}
                    <div className="lg:col-span-4 xl:col-span-3">
                        <Card className="border-gray-200 shadow-sm overflow-hidden sticky top-6">
                            {configExpanded && (
                                <CardContent className="p-6 space-y-6">
                                    {/* Scope Section */}
                                    <div className="space-y-4">
                                        <div>
                                            <Label className="text-[10px] font-bold text-gray-500 mb-2 block uppercase tracking-wider">Scope</Label>
                                            <div className="flex p-1 bg-gray-100 rounded-xl gap-1 shadow-inner border border-gray-200/50">
                                                <button
                                                    onClick={() => setScope('SINGLE')}
                                                    className={`flex-1 py-2 px-1 text-[10px] font-black rounded-lg transition-all duration-200 ${scope === 'SINGLE' ? 'bg-white text-purple-700 shadow-sm scale-[1.02]' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                                                >
                                                    SINGLE
                                                </button>
                                                <button
                                                    onClick={() => setScope('SECTOR')}
                                                    className={`flex-1 py-2 px-1 text-[10px] font-black rounded-lg transition-all duration-200 ${scope === 'SECTOR' ? 'bg-white text-purple-700 shadow-sm scale-[1.02]' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                                                >
                                                    SECTOR
                                                </button>
                                                <button
                                                    onClick={() => setScope('ALL')}
                                                    className={`flex-1 py-2 px-1 text-[10px] font-black rounded-lg transition-all duration-200 ${scope === 'ALL' ? 'bg-white text-purple-700 shadow-sm scale-[1.02]' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                                                >
                                                    ALL
                                                </button>
                                            </div>
                                        </div>

                                        {/* Target Selection (Symbol or Sector) - Conditionally Rendered */}
                                        {scope === 'SINGLE' && (
                                            <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                                                <Label className="text-[10px] font-bold text-gray-400 mb-2 block uppercase tracking-wider">Symbol Target</Label>
                                                <div className="relative">
                                                    <SymbolSelector
                                                        value={symbol}
                                                        onChange={setSymbol}
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        {scope === 'SECTOR' && (
                                            <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                                                <Label className="text-[10px] font-bold text-gray-400 mb-2 block uppercase tracking-wider">Sector Target</Label>
                                                <select
                                                    value={sector}
                                                    onChange={(e) => setSector(e.target.value)}
                                                    className="w-full h-10 px-3 text-xs rounded-xl border-2 border-gray-100 bg-gray-50/50 focus:bg-white focus:border-purple-200 focus:ring-4 focus:ring-purple-500/5 outline-none transition-all shadow-sm"
                                                >
                                                    <option value="">Select sector...</option>
                                                    {sectors.map((s) => (
                                                        <option key={s.name} value={s.name}>{s.name} ({s.count})</option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}

                                        {scope === 'ALL' && (
                                            <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                                                <Label className="text-[10px] font-bold text-gray-400 mb-2 block uppercase tracking-wider">Target</Label>
                                                <div className="w-full h-10 px-3 text-xs flex items-center text-gray-500 bg-gray-50 border border-gray-200 rounded-xl italic">
                                                    All available symbols
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Parameters Section */}
                                    <div className="pt-6 border-t border-gray-100">
                                        <Label className="text-[10px] font-semibold text-gray-500 mb-3 block uppercase tracking-wider">Parameter Ranges</Label>
                                        <div className="relative max-h-[250px] overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                                            {parameters.map((param, idx) => (
                                                <div key={param.name} className="space-y-1.5">
                                                    <div className="text-[10px] font-mono font-semibold text-gray-600 truncate flex justify-between items-center" title={param.name}>
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
                                                            className="flex-1 h-8 px-2 text-[10px] text-center border rounded-md border-gray-200 focus:ring-1 focus:ring-purple-500 outline-none bg-gray-50/50"
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
                                                            className="flex-1 h-8 px-2 text-[10px] text-center border rounded-md border-gray-200 focus:ring-1 focus:ring-purple-500 outline-none bg-gray-50/50"
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
                                            className="w-full h-11 text-xs font-bold uppercase tracking-wider bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-200 active:scale-95 transition-all rounded-xl"
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

                    {/* Progressive Results Panel */}
                    <div className="lg:col-span-8 xl:col-span-9 space-y-6 pb-20">
                        {['1Y', '3Y', '5Y', '10Y'].map((period) => {
                            const result = periodResults[period];
                            if (result.status === 'pending') return null;

                            return (
                                <div key={period} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                                    <div className="px-6 py-3 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Activity size={16} className="text-purple-600" />
                                            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">{period} Optimization</h3>
                                        </div>
                                        {result.status === 'success' && (
                                            <Badge variant="outline" className="text-[10px] bg-white text-green-600 border-green-100 flex items-center gap-1">
                                                <CheckCircle size={10} /> Success
                                            </Badge>
                                        )}
                                        {result.status === 'loading' && (
                                            <Badge variant="outline" className="text-[10px] bg-white text-purple-600 border-purple-100 animate-pulse">
                                                Processing...
                                            </Badge>
                                        )}
                                    </div>
                                    {result.status === 'loading' && (
                                        <div className="p-12 flex flex-col items-center justify-center text-center">
                                            <div className="w-16 h-1 bg-purple-100 rounded-full overflow-hidden mb-4">
                                                <div className="w-1/2 h-full bg-purple-600 animate-[loading_1s_ease-in-out_infinite]" />
                                            </div>
                                            <p className="text-sm font-medium text-gray-600">Running genetic optimization...</p>
                                            <p className="text-xs text-gray-400 mt-1">Testing {parameters.length} parameters on {period} historical data</p>
                                        </div>
                                    )}

                                    {result.status === 'success' && result.data && (
                                        <div className="p-6">
                                            {/* Side-by-Side Comparison Table */}
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-sm border-collapse">
                                                    <thead>
                                                        <tr>
                                                            <th className="p-3 text-left bg-gray-50 border-b w-1/4">Metric</th>
                                                            {['win_rate', 'profit', 'balanced'].map(obj => (
                                                                <th key={obj} className={`p-3 text-left border-b w-1/4 uppercase tracking-wider ${obj === 'balanced' ? 'bg-purple-50 text-purple-700' : 'bg-gray-50 text-gray-700'}`}>
                                                                    {obj.replace('_', ' ')}
                                                                </th>
                                                            ))}
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {/* Parameters Row */}
                                                        <tr>
                                                            <td className="p-3 font-bold text-gray-500 bg-gray-50/30 border-b align-top">Parameters</td>
                                                            {['win_rate', 'profit', 'balanced'].map(obj => {
                                                                const objData = result.data![obj];
                                                                return (
                                                                    <td key={obj} className={`p-3 border-b align-top ${obj === 'balanced' ? 'bg-purple-50/30' : ''}`}>
                                                                        <pre className="text-[10px] text-gray-600 whitespace-pre-wrap font-mono">
                                                                            {JSON.stringify(objData?.best_params || {}, null, 2).replace(/{|}|"/g, '').trim()}
                                                                        </pre>
                                                                    </td>
                                                                );
                                                            })}
                                                        </tr>

                                                        {/* Key Metrics Rows */}
                                                        {[
                                                            { label: 'Primary Result', key: 'best_value', format: (v: number) => v.toFixed(4) },
                                                            { label: 'Win Rate', path: ['stats', 'categorized', 'Trade Metrics', 'Win Rate'] },
                                                            { label: 'Total Return', path: ['stats', 'categorized', 'Performance Metrics', 'Return'] },
                                                            { label: 'Max Drawdown', path: ['stats', 'categorized', 'Risk Metrics', 'Max Drawdown'] },
                                                            { label: 'Sharpe Ratio', path: ['stats', 'categorized', 'Performance Metrics', 'Sharpe Ratio'] },
                                                            { label: 'Profit Factor', path: ['stats', 'categorized', 'Trade Metrics', 'Profit Factor'] },
                                                            { label: 'Total Trades', path: ['stats', 'categorized', 'Trade Metrics', 'Total Trades'] },
                                                        ].map((row: any, i) => (
                                                            <tr key={i} className="hover:bg-gray-50">
                                                                <td className="p-3 font-medium text-gray-600 border-b">{row.label}</td>
                                                                {['win_rate', 'profit', 'balanced'].map(obj => {
                                                                    const objData = result.data![obj];
                                                                    let value = '-';

                                                                    if (objData) {
                                                                        if (row.key === 'best_value') {
                                                                            // Specific formatting for primary objective value
                                                                            const rawVal = objData.best_value;
                                                                            value = obj === 'profit' || obj === 'win_rate' ? `${rawVal.toFixed(2)}%` : rawVal.toFixed(4);
                                                                            if (obj === 'balanced') value = rawVal.toFixed(4); // Score
                                                                        } else if (row.path && objData.stats) {
                                                                            // Deep access safe getter
                                                                            let current = objData;
                                                                            for (const key of row.path) {
                                                                                current = current?.[key];
                                                                            }
                                                                            value = current !== undefined ? String(current) : '-';
                                                                        }
                                                                    }

                                                                    const isBalanced = obj === 'balanced';
                                                                    return (
                                                                        <td key={obj} className={`p-3 border-b font-mono ${isBalanced ? 'bg-purple-50/30 font-bold text-purple-900' : 'text-gray-900'}`}>
                                                                            {value}
                                                                        </td>
                                                                    );
                                                                })}
                                                            </tr>
                                                        ))}

                                                        {/* Action Row */}
                                                        <tr>
                                                            <td className="p-3 border-b"></td>
                                                            {['win_rate', 'profit', 'balanced'].map(obj => {
                                                                const expId = result.data![obj]?.experiment_id;
                                                                return (
                                                                    <td key={obj} className={`p-3 border-b ${obj === 'balanced' ? 'bg-purple-50/30' : ''}`}>
                                                                        {expId && (
                                                                            <Button
                                                                                variant="outline"
                                                                                size="sm"
                                                                                className="w-full text-[10px] h-7 uppercase font-bold text-gray-600 hover:text-purple-600"
                                                                                onClick={() => window.open(`/strategies/${strategyId}/experiments/${expId}`, '_blank')}
                                                                            >
                                                                                <ExternalLink size={12} className="mr-1" /> View Graph
                                                                            </Button>
                                                                        )}
                                                                    </td>
                                                                );
                                                            })}
                                                        </tr>
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}

                                    {/* Debug/Error State */}
                                    {result.status === 'success' && !result.data && (
                                        <div className="p-6 text-red-500 bg-red-50">
                                            <p className="font-bold">Error: Valid response status but no data received.</p>
                                            <pre className="text-xs mt-2 overflow-auto max-h-40 p-2 bg-white rounded border">
                                                {JSON.stringify(result, null, 2)}
                                            </pre>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
