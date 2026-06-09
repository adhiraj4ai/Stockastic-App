'use client';

import { useState, useEffect, useMemo } from 'react';
import api from '@/lib/api';
import { useRouter, useParams } from 'next/navigation';
import { WorkspaceShell } from '../../components/WorkspaceShell';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Zap, TrendingUp, Activity, CheckCircle, AlertTriangle, ExternalLink, ArrowRight, Layers } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

import { SymbolSelector } from '@/components/SymbolSelector';

interface Strategy {
    id: number;
    name: string;
    description: string;
    code: string;
    spec?: any;
    kind?: string;
    ticker?: string;
    optimization_config?: string;
}

// A single tunable spec parameter, keyed by the same path the backend optimizer uses
// (alpha.<p> | regime{i}.<p> | stop.<p> | exit{i}.<p>) so backtest, optimize and code agree.
interface SpecRange {
    path: string;
    label: string;
    group: string;
    type: 'int' | 'float';
    step?: number;
    default: number;
    min: number;   // search lower bound (editable)
    max: number;   // search upper bound (editable)
    regMin: number; // registry floor
    regMax: number; // registry ceiling
}

const OBJECTIVES = [
    { key: 'balanced', label: 'Balanced', desc: 'Win rate + return' },
    { key: 'win_rate', label: 'Win Rate', desc: 'Maximize hit rate' },
    { key: 'profit', label: 'Profit', desc: 'Maximize return' },
];

export default function OptimizePage() {
    const router = useRouter();
    const params = useParams();
    const strategyId = params.id as string;

    const [strategy, setStrategy] = useState<Strategy | null>(null);
    const [registry, setRegistry] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [optimizing, setOptimizing] = useState(false);
    const [applying, setApplying] = useState(false);
    const [results, setResults] = useState<{ status: 'pending' | 'loading' | 'success' | 'error'; data?: any; folds?: number }>({ status: 'pending' });
    const [specResult, setSpecResult] = useState<any>(null);

    // Shared config
    const [symbol, setSymbol] = useState('');
    const [objective, setObjective] = useState('balanced');
    const [nTrials, setNTrials] = useState(40);

    // Custom-strategy config
    const [scope, setScope] = useState<'SINGLE' | 'SECTOR' | 'ALL'>('SINGLE');
    const [sector, setSector] = useState('');
    const [sectors, setSectors] = useState<{ name: string; count: number }[]>([]);
    const [parallelEnvs, setParallelEnvs] = useState<number>(4);

    const isComposed = !!(strategy?.spec && Object.keys(strategy.spec).length > 0);

    useEffect(() => {
        if (strategyId) {
            fetchStrategy();
            fetchSectors();
            api.get('/api/stocks/strategies/components/').then((r) => setRegistry(r.data)).catch(() => { });
        }
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
        } catch (error) {
            console.error('Failed to load sectors', error);
        }
    };

    // ── Composed: derive tunable params from spec + registry (same params as backtest/code) ──
    const [specRanges, setSpecRanges] = useState<SpecRange[]>([]);

    useEffect(() => {
        if (!isComposed || !registry || !strategy?.spec) return;
        const all = [...registry.alpha, ...registry.regime, ...registry.stop, ...registry.exit];
        const meta = (type: string) => all.find((c: any) => c.type === type);
        const out: SpecRange[] = [];
        const pushNode = (node: any, prefix: string, group: string) => {
            const m = meta(node.type);
            if (!m) return;
            (m.params || []).forEach((p: any) => {
                if (p.min === undefined || p.max === undefined) return;
                const def = node.params?.[p.name] ?? p.default;
                out.push({
                    path: `${prefix}.${p.name}`, label: p.label || p.name, group,
                    type: p.type, step: p.step, default: def,
                    min: p.min, max: p.max, regMin: p.min, regMax: p.max,
                });
            });
        };
        const spec = strategy.spec;
        const asList = (v: any) => (Array.isArray(v) ? v : v ? [v] : []);
        if (spec.alpha) pushNode(spec.alpha, 'alpha', 'Signal');
        asList(spec.regime).forEach((n: any, i: number) => pushNode(n, `regime${i}`, 'Filter'));
        if (spec.stop) pushNode(spec.stop, 'stop', 'Stop');
        asList(spec.exit).forEach((n: any, i: number) => pushNode(n, `exit${i}`, 'Exit'));
        setSpecRanges(out);
    }, [isComposed, registry, strategy]);

    // ── Custom: parse param ranges from code (legacy regex flow) ──
    const initialParams = useMemo(() => {
        if (!strategy || isComposed) return {};
        if (strategy.optimization_config) {
            try {
                const parsed = JSON.parse(strategy.optimization_config);
                if (Object.keys(parsed).length > 0) return parsed;
            } catch { /* ignore */ }
        }
        const out: any = {};
        const regex = /^\s*(\w+)\s*=\s*([\d.]+)/gm;
        let match;
        while ((match = regex.exec(strategy.code)) !== null) {
            const name = match[1];
            const valueStr = match[2];
            if (['self', 'data', 'position', 'equity'].includes(name)) continue;
            if (valueStr.includes('.')) continue;
            const value = parseInt(valueStr);
            out[name] = [Math.max(1, Math.floor(value * 0.5)), Math.ceil(value * 2)];
        }
        return Object.keys(out).length > 0 ? out : { n1: [5, 30], n2: [20, 100] };
    }, [strategy, isComposed]);

    const [parameters, setParameters] = useState<{ name: string; min: number; max: number }[]>([]);
    useEffect(() => {
        setParameters(Object.entries(initialParams).map(([name, range]: [string, any]) => ({ name, min: range[0], max: range[1] })));
    }, [initialParams]);

    // ── Run ──
    const handleOptimizeComposed = async () => {
        if (!symbol) { toast.error('Please select a stock symbol'); return; }
        setOptimizing(true);
        setResults({ status: 'loading' });
        setSpecResult(null);
        try {
            const param_ranges: Record<string, [number, number]> = {};
            specRanges.forEach((r) => { param_ranges[r.path] = [r.min, r.max]; });
            const { data } = await api.post(`/api/stocks/strategies/${strategyId}/optimize_spec/`, {
                symbol, objective, n_trials: nTrials, param_ranges,
            });
            if (!data.best) {
                setResults({ status: 'error' });
                toast.error(data.message || 'No tradable result found — widen the ranges.');
                return;
            }
            setSpecResult(data);
            setResults({ status: 'success' });
            toast.success('Optimization complete!');
        } catch (error: any) {
            const msg = error.response?.data?.error || error.message || 'Optimization failed';
            toast.error(msg);
            setResults({ status: 'error' });
        } finally {
            setOptimizing(false);
        }
    };

    const handleOptimizeCustom = async () => {
        if (scope === 'SINGLE' && !symbol) { toast.error('Please select a stock symbol'); return; }
        if (scope === 'SECTOR' && !sector) { toast.error('Please select a sector'); return; }
        setOptimizing(true);
        setResults({ status: 'loading' });
        try {
            const paramRanges: any = {};
            parameters.forEach((p) => { paramRanges[p.name] = [p.min, p.max]; });
            const { data } = await api.post(`/api/stocks/strategies/${strategyId}/optimize_multi_period/`, {
                code: strategy!.code,
                symbol: scope === 'SINGLE' ? symbol : scope === 'ALL' ? 'ALL' : undefined,
                sector: scope === 'SECTOR' ? sector : undefined,
                param_ranges: paramRanges, n_trials: 100, parallel_envs: parallelEnvs,
            });
            if (data.results && Object.keys(data.results).length > 0) {
                setResults({ status: 'success', data: data.results, folds: data.folds_evaluated });
                toast.success('K-fold optimization complete!');
            } else throw new Error(data.error || 'Optimization produced no results.');
        } catch (error: any) {
            toast.error(error.response?.data?.error || error.message || 'Optimization failed');
            setResults({ status: 'error' });
        } finally {
            setOptimizing(false);
        }
    };

    const handleOptimize = () => (isComposed ? handleOptimizeComposed() : handleOptimizeCustom());

    // Publish the tuned spec as the strategy's source of truth → backtest/optimize/code all match.
    const handleApplyComposed = async () => {
        if (!specResult?.best) return;
        setApplying(true);
        try {
            const param_ranges: Record<string, [number, number]> = {};
            specRanges.forEach((r) => { param_ranges[r.path] = [r.min, r.max]; });
            await api.post(`/api/stocks/strategies/${strategyId}/optimize_spec/`, {
                symbol, objective, n_trials: 0, publish: true, spec: specResult.best.spec,
            });
            toast.success('Tuned parameters applied to the strategy.');
            router.push(`/strategies/${strategyId}/backtest?symbol=${symbol}`);
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Failed to apply parameters');
        } finally {
            setApplying(false);
        }
    };

    const handleApplyCustom = () => {
        if (!results.data?.balanced) return;
        const encoded = encodeURIComponent(JSON.stringify(results.data.balanced.best_params, null, 2));
        router.push(`/strategies/${strategyId}/backtest?params=${encoded}${symbol ? `&symbol=${symbol}` : ''}`);
    };

    if (loading) return <WorkspaceShell strategyId={strategyId}><div>Loading...</div></WorkspaceShell>;

    return (
        <WorkspaceShell strategyId={strategyId}>
            <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* Configuration Panel */}
                    <div className="lg:col-span-4 xl:col-span-3">
                        <Card className="border-gray-200 dark:border-slate-800 shadow-sm overflow-hidden sticky top-6 dark:bg-card">
                            <CardContent className="p-6 space-y-6">
                                {isComposed ? (
                                    <>
                                        <div className="flex items-center gap-2 text-purple-700 dark:text-purple-400">
                                            <Layers size={16} />
                                            <span className="text-xs font-bold uppercase tracking-wider">Composed strategy</span>
                                        </div>
                                        <p className="text-[11px] text-gray-500 dark:text-slate-400 -mt-3">
                                            Tunes the same spec parameters shown in Build, Backtest and Code. Applying the
                                            result rewrites the strategy so all tabs stay in sync.
                                        </p>

                                        <div>
                                            <Label className="text-xs font-bold text-gray-400 mb-2 block uppercase tracking-wider">Symbol</Label>
                                            <SymbolSelector value={symbol} onChange={setSymbol} className="w-full h-11" />
                                        </div>

                                        <div>
                                            <Label className="text-xs font-bold text-gray-400 mb-2 block uppercase tracking-wider">Objective</Label>
                                            <div className="grid grid-cols-3 gap-1.5">
                                                {OBJECTIVES.map((o) => (
                                                    <button key={o.key} onClick={() => setObjective(o.key)}
                                                        className={`py-2 px-1 text-[10px] font-bold rounded-lg transition-all ${objective === o.key ? 'bg-purple-600 text-white shadow' : 'bg-gray-100 dark:bg-slate-950 text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-800'}`}
                                                        title={o.desc}>
                                                        {o.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div>
                                            <Label className="text-xs font-bold text-gray-400 mb-2 block uppercase tracking-wider">Trials: {nTrials}</Label>
                                            <input type="range" min={10} max={120} step={10} value={nTrials}
                                                onChange={(e) => setNTrials(parseInt(e.target.value))}
                                                className="w-full accent-purple-600" />
                                            <p className="text-[9px] text-gray-400 mt-1">More trials = better tuning, slower run.</p>
                                        </div>

                                        <div className="pt-6 border-t border-gray-100 dark:border-slate-800">
                                            <Label className="text-xs font-semibold text-gray-500 mb-3 block uppercase tracking-wider">Parameter Ranges</Label>
                                            <div className="relative max-h-[44vh] overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                                                {specRanges.length === 0 && (
                                                    <div className="text-[10px] text-gray-400 text-center py-4 italic">This strategy has no tunable parameters.</div>
                                                )}
                                                {specRanges.map((r, idx) => (
                                                    <div key={r.path} className="space-y-1">
                                                        <div className="flex justify-between items-center text-xs">
                                                            <span className="font-semibold text-gray-600 dark:text-slate-300">{r.label}</span>
                                                            <span className="text-[9px] text-purple-500 font-bold uppercase">{r.group}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <input type="number" value={r.min} step={r.step || 1}
                                                                onChange={(e) => { const v = [...specRanges]; v[idx] = { ...v[idx], min: parseFloat(e.target.value) || 0 }; setSpecRanges(v); }}
                                                                className="w-20 h-9 px-3 text-xs text-center border rounded-md border-gray-200 dark:border-slate-800 focus:ring-1 focus:ring-purple-500 outline-none bg-gray-50/50 dark:bg-slate-950 dark:text-slate-100 font-medium" />
                                                            <span className="text-gray-300 text-[10px]">to</span>
                                                            <input type="number" value={r.max} step={r.step || 1}
                                                                onChange={(e) => { const v = [...specRanges]; v[idx] = { ...v[idx], max: parseFloat(e.target.value) || 0 }; setSpecRanges(v); }}
                                                                className="w-20 h-9 px-3 text-xs text-center border rounded-md border-gray-200 dark:border-slate-800 focus:ring-1 focus:ring-purple-500 outline-none bg-gray-50/50 dark:bg-slate-950 dark:text-slate-100 font-medium" />
                                                        </div>
                                                        <p className="text-[9px] text-gray-400">default {r.default} · registry {r.regMin}–{r.regMax}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        {/* Custom strategy: legacy K-fold flow */}
                                        <div>
                                            <Label className="text-xs font-bold text-gray-500 dark:text-slate-400 mb-2 block uppercase tracking-wider">Scope</Label>
                                            <div className="flex p-1.5 bg-gray-100 dark:bg-slate-950 rounded-xl gap-1 shadow-inner border border-gray-200/50 dark:border-slate-800">
                                                {(['SINGLE', 'SECTOR', 'ALL'] as const).map((sc) => (
                                                    <button key={sc} onClick={() => setScope(sc)}
                                                        className={`flex-1 py-2.5 px-2 text-xs font-bold rounded-lg transition-all duration-200 ${scope === sc ? 'bg-white dark:bg-slate-800 text-purple-700 dark:text-purple-400 shadow-sm scale-[1.02]' : 'text-gray-500 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-300'}`}>
                                                        {sc === 'SINGLE' ? 'Single' : sc === 'SECTOR' ? 'Sector' : 'All'}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div>
                                            <Label className="text-xs font-bold text-gray-500 dark:text-slate-400 mb-2 block">Parallel Environments</Label>
                                            <div className="flex p-1 bg-gray-50 dark:bg-slate-950 rounded-lg gap-1 border border-gray-200/50 dark:border-slate-800">
                                                {[1, 4, 8].map((val) => (
                                                    <button key={val} onClick={() => setParallelEnvs(val)}
                                                        className={`flex-1 py-1.5 text-[10px] font-bold rounded transition-all ${parallelEnvs === val ? 'bg-purple-600 text-white shadow-sm' : 'text-gray-400 dark:text-slate-500 hover:text-gray-600'}`}>
                                                        {val} CPU
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {scope === 'SINGLE' && (
                                            <div>
                                                <Label className="text-xs font-bold text-gray-400 mb-2 block uppercase tracking-wider">Symbol Target</Label>
                                                <SymbolSelector value={symbol} onChange={setSymbol} className="w-full h-11" />
                                            </div>
                                        )}
                                        {scope === 'SECTOR' && (
                                            <div>
                                                <Label className="text-[10px] font-bold text-gray-400 dark:text-slate-500 mb-2 block uppercase tracking-wider">Sector Target</Label>
                                                <select value={sector} onChange={(e) => setSector(e.target.value)}
                                                    className="w-full h-10 px-3 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 outline-none">
                                                    <option value="">Select sector...</option>
                                                    {sectors.map((s) => <option key={s.name} value={s.name}>{s.name} ({s.count})</option>)}
                                                </select>
                                            </div>
                                        )}

                                        <div className="pt-6 border-t border-gray-100 dark:border-slate-800">
                                            <Label className="text-xs font-semibold text-gray-500 mb-3 block uppercase tracking-wider">Parameter Ranges</Label>
                                            <div className="relative max-h-[50vh] overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                                                {parameters.map((param, idx) => (
                                                    <div key={param.name} className="space-y-1">
                                                        <div className="text-xs font-mono font-semibold text-gray-600 dark:text-slate-300 truncate">{param.name}</div>
                                                        <div className="flex items-center gap-2">
                                                            <input type="number" value={param.min}
                                                                onChange={(e) => { const np = [...parameters]; np[idx].min = parseInt(e.target.value) || 0; setParameters(np); }}
                                                                className="w-20 h-9 px-3 text-xs text-center border rounded-md border-gray-200 dark:border-slate-800 outline-none bg-gray-50/50 dark:bg-slate-950 dark:text-slate-100 font-medium" />
                                                            <span className="text-gray-300 text-[10px]">to</span>
                                                            <input type="number" value={param.max}
                                                                onChange={(e) => { const np = [...parameters]; np[idx].max = parseInt(e.target.value) || 0; setParameters(np); }}
                                                                className="w-20 h-9 px-3 text-xs text-center border rounded-md border-gray-200 dark:border-slate-800 outline-none bg-gray-50/50 dark:bg-slate-950 dark:text-slate-100 font-medium" />
                                                        </div>
                                                    </div>
                                                ))}
                                                {parameters.length === 0 && <div className="text-[10px] text-gray-400 text-center py-4 italic">No parameters found</div>}
                                            </div>
                                        </div>
                                    </>
                                )}

                                <div className="pt-6 border-t border-gray-100 dark:border-slate-800">
                                    <Button onClick={handleOptimize}
                                        disabled={optimizing || (isComposed && !symbol) || (!isComposed && scope === 'SINGLE' && !symbol) || (!isComposed && scope === 'SECTOR' && !sector)}
                                        className="w-full h-11 text-xs font-bold uppercase tracking-wider bg-purple-600 hover:bg-purple-700 text-white shadow-lg active:scale-95 transition-all rounded-xl">
                                        {optimizing ? <><div className="w-4 h-4 border border-white/30 border-t-white rounded-full animate-spin mr-2" /> RUNNING</> : <><Zap size={16} className="mr-2" /> START OPTIMIZATION</>}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Results Panel */}
                    <div className="lg:col-span-8 xl:col-span-9 space-y-6 pb-20">
                        {results.status === 'pending' && (
                            <div className="h-[400px] flex flex-col items-center justify-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-gray-50/30 dark:bg-card/20 text-center px-10">
                                <div className="p-4 bg-white dark:bg-card rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800 mb-4 scale-110">
                                    <Activity size={32} className="text-purple-200 dark:text-purple-900" />
                                </div>
                                <h3 className="text-lg font-bold text-gray-800 dark:text-slate-100">Ready to Optimize</h3>
                                <p className="text-sm text-gray-500 dark:text-slate-400 max-w-sm mt-1">
                                    {isComposed
                                        ? 'Search the spec parameter ranges to find the best configuration for this stock, then apply it back to the strategy.'
                                        : 'Find the best parameters using 3-year chronological K-fold cross-validation.'}
                                </p>
                            </div>
                        )}

                        {results.status === 'loading' && (
                            <Card className="border-purple-100 dark:border-purple-900/50 dark:bg-card shadow-xl overflow-hidden">
                                <div className="p-12 flex flex-col items-center justify-center text-center">
                                    <Zap size={40} className="text-purple-600 dark:text-purple-400 animate-pulse mb-4" />
                                    <h3 className="text-xl font-semibold text-gray-900 dark:text-slate-100 uppercase tracking-tight">Optimizing Strategy</h3>
                                    <p className="text-sm font-medium text-gray-600 dark:text-slate-400 mt-2">
                                        {isComposed ? `Searching ${specRanges.length} parameters across ${nTrials} trials...` : 'Evaluating parameters across all 3-year historical folds...'}
                                    </p>
                                </div>
                            </Card>
                        )}

                        {results.status === 'error' && (
                            <Card className="border-red-100 dark:border-red-900/30 bg-red-50/30 dark:bg-red-950/10 overflow-hidden">
                                <div className="p-12 flex flex-col items-center justify-center text-center">
                                    <div className="p-3 bg-red-100 dark:bg-red-900/40 rounded-2xl mb-4"><AlertTriangle size={32} className="text-red-600 dark:text-red-400" /></div>
                                    <h3 className="text-lg font-bold text-red-900 dark:text-red-200">Optimization Failed</h3>
                                    <p className="text-sm text-red-600 dark:text-red-400 mt-1">Check the symbol and parameter ranges, then try again.</p>
                                    <Button variant="outline" className="mt-6 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400" onClick={handleOptimize}>Try Again</Button>
                                </div>
                            </Card>
                        )}

                        {/* Composed results */}
                        {results.status === 'success' && isComposed && specResult?.best && (
                            <SpecResultPanel result={specResult} symbol={symbol} objective={objective}
                                applying={applying} onApply={handleApplyComposed} />
                        )}

                        {/* Custom (K-fold) results */}
                        {results.status === 'success' && !isComposed && results.data && (
                            <div className="bg-white dark:bg-card rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                                <div className="px-8 py-5 bg-muted/60 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-purple-500/20 rounded-lg"><Activity size={18} className="text-purple-300" /></div>
                                        <div>
                                            <h3 className="text-sm font-semibold text-white uppercase tracking-wider">K-Fold Results</h3>
                                            <p className="text-[10px] text-slate-400 font-bold">Evaluated across {results.folds || 0} folds (3Y each)</p>
                                        </div>
                                    </div>
                                    <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[10px] uppercase font-semibold tracking-wider px-3 py-1">
                                        <CheckCircle size={10} className="mr-1.5" /> Complete & Auto-Published
                                    </Badge>
                                </div>
                                <div className="p-8">
                                    <div className="overflow-x-auto rounded-2xl border border-border dark:border-slate-800">
                                        <table className="w-full text-sm border-collapse">
                                            <thead>
                                                <tr>
                                                    <th className="p-4 text-left bg-slate-100/50 dark:bg-card border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 uppercase">Metric</th>
                                                    {['win_rate', 'profit', 'balanced'].map((obj) => (
                                                        <th key={obj} className={`p-4 text-left border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider text-[10px] font-semibold ${obj === 'balanced' ? 'bg-purple-600 text-white' : 'bg-slate-100/50 dark:bg-card text-slate-700 dark:text-slate-300'}`}>{obj.replace('_', ' ')}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white dark:bg-card">
                                                <tr>
                                                    <td className="p-4 font-bold text-slate-400 border-b border-border dark:border-slate-800 align-top text-xs uppercase">Best Parameters</td>
                                                    {['win_rate', 'profit', 'balanced'].map((obj) => (
                                                        <td key={obj} className={`p-4 border-b border-border dark:border-slate-800 align-top ${obj === 'balanced' ? 'bg-purple-50/30 dark:bg-purple-900/20' : ''}`}>
                                                            <pre className="text-[11px] text-slate-600 dark:text-slate-300 whitespace-pre-wrap font-mono font-bold leading-relaxed">{JSON.stringify(results.data[obj]?.best_params || {}, null, 2).replace(/[{}"]/g, '').trim()}</pre>
                                                        </td>
                                                    ))}
                                                </tr>
                                                {[
                                                    { label: 'Avg. Win Rate', path: ['stats', 'categorized', 'Trade Metrics', 'Win Rate [%]'] },
                                                    { label: 'Avg. Total Return', path: ['stats', 'categorized', 'Performance Metrics', 'Return [%]'] },
                                                    { label: 'Avg. Max Drawdown', path: ['stats', 'categorized', 'Risk Metrics', 'Max Drawdown [%]'] },
                                                    { label: 'Avg. Sharpe Ratio', path: ['stats', 'categorized', 'Performance Metrics', 'Sharpe Ratio'] },
                                                    { label: 'Total Trades', path: ['stats', 'categorized', 'Trade Metrics', 'Total Trades'] },
                                                ].map((row: any, i) => (
                                                    <tr key={i}>
                                                        <td className="p-4 font-semibold text-slate-600 dark:text-slate-300 border-b border-slate-50 dark:border-slate-800/50 text-xs">{row.label}</td>
                                                        {['win_rate', 'profit', 'balanced'].map((obj) => {
                                                            const objData = results.data[obj];
                                                            let value = '-';
                                                            if (objData?.stats) { let cur = objData; for (const k of row.path) cur = cur?.[k]; value = cur !== undefined ? String(cur) : '-'; }
                                                            return <td key={obj} className={`p-4 border-b border-slate-50 dark:border-slate-800/50 font-mono text-xs ${obj === 'balanced' ? 'bg-purple-50/30 dark:bg-purple-900/20 font-semibold text-purple-900 dark:text-purple-300' : 'text-slate-600 dark:text-slate-400 font-bold'}`}>{value}</td>;
                                                        })}
                                                    </tr>
                                                ))}
                                                <tr>
                                                    <td className="p-4 border-b border-slate-50 dark:border-slate-800"></td>
                                                    {['win_rate', 'profit', 'balanced'].map((obj) => {
                                                        const expId = results.data[obj]?.experiment_id;
                                                        return (
                                                            <td key={obj} className={`p-4 border-b border-slate-50 dark:border-slate-800 ${obj === 'balanced' ? 'bg-purple-50/30 dark:bg-purple-900/20' : ''}`}>
                                                                {expId && (
                                                                    <Button variant="ghost" size="sm" className="w-full text-[10px] h-8 uppercase font-semibold text-slate-500 hover:text-purple-600"
                                                                        onClick={() => window.open(`/strategies/${strategyId}/experiments/${expId}`, '_blank')}>
                                                                        <ExternalLink size={12} className="mr-1.5" /> View Results
                                                                    </Button>
                                                                )}
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="mt-10 p-6 bg-slate-900 dark:bg-slate-950 rounded-xl text-white flex flex-col md:flex-row items-center justify-between gap-6">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center border border-white/10"><TrendingUp size={24} className="text-purple-300" /></div>
                                            <div>
                                                <p className="text-white font-semibold uppercase tracking-wider text-[10px]">Ready to deploy?</p>
                                                <h4 className="text-blue-200 font-bold text-sm">Balanced optimization found stable parameters.</h4>
                                            </div>
                                        </div>
                                        <Button onClick={handleApplyCustom} className="h-12 px-8 rounded-2xl bg-white text-slate-900 hover:bg-slate-100 font-semibold uppercase tracking-wider text-xs shadow-lg active:scale-95">Apply Balanced Config</Button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </WorkspaceShell>
    );
}

// Side-by-side baseline vs tuned for composed strategies, with an Apply (publish) action.
function SpecResultPanel({ result, symbol, objective, applying, onApply }: { result: any; symbol: string; objective: string; applying: boolean; onApply: () => void }) {
    const base = result.baseline_metrics;
    const best = result.best.metrics;
    const space = result.space || {};
    const rows = [
        { label: 'Return %', key: 'return_pct', pct: true },
        { label: 'Buy & Hold %', key: 'buy_hold_return_pct', pct: true },
        { label: 'Win Rate %', key: 'win_rate_pct', pct: true },
        { label: 'Sharpe', key: 'sharpe' },
        { label: 'Sortino', key: 'sortino' },
        { label: 'Max Drawdown %', key: 'max_drawdown_pct', pct: true },
        { label: 'Trades', key: 'num_trades' },
    ];
    const fmt = (v: any, pct: boolean) => (v === undefined || v === null ? '-' : pct ? `${Number(v).toFixed(1)}%` : Number(v).toFixed(2));
    const better = (key: string) => base && best && (key === 'max_drawdown_pct' ? best[key] > base[key] : best[key] > base[key]);

    return (
        <div className="bg-white dark:bg-card rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-8 py-5 bg-muted/60 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-500/20 rounded-lg"><Activity size={18} className="text-purple-300" /></div>
                    <div>
                        <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Tuned vs Baseline · {symbol}</h3>
                        <p className="text-[10px] text-slate-400 font-bold">{objective.replace('_', ' ')} objective · {result.timeframes?.join(' + ')} · score {result.best.score}</p>
                    </div>
                </div>
            </div>

            <div className="p-8 space-y-8">
                <div className="overflow-x-auto rounded-2xl border border-border dark:border-slate-800">
                    <table className="w-full text-sm border-collapse">
                        <thead>
                            <tr>
                                <th className="p-4 text-left bg-slate-100/50 dark:bg-card border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 uppercase">Metric</th>
                                <th className="p-4 text-left bg-slate-100/50 dark:bg-card border-b border-slate-200 dark:border-slate-800 text-[10px] font-semibold text-slate-500 uppercase">Baseline</th>
                                <th className="p-4 text-left bg-purple-600 text-white border-b border-slate-200 dark:border-slate-800 text-[10px] font-semibold uppercase">Tuned</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-card">
                            {rows.map((r) => (
                                <tr key={r.key}>
                                    <td className="p-4 font-semibold text-slate-600 dark:text-slate-300 border-b border-slate-50 dark:border-slate-800/50 text-xs">{r.label}</td>
                                    <td className="p-4 border-b border-slate-50 dark:border-slate-800/50 font-mono text-xs text-slate-500 dark:text-slate-400">{fmt(base?.[r.key], !!r.pct)}</td>
                                    <td className={`p-4 border-b border-slate-50 dark:border-slate-800/50 font-mono text-xs font-bold bg-purple-50/30 dark:bg-purple-900/20 ${better(r.key) ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'}`}>{fmt(best?.[r.key], !!r.pct)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div>
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Tuned Parameters</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {Object.entries(result.best.params).map(([path, value]: [string, any]) => (
                            <div key={path} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
                                <p className="text-[10px] text-slate-400 truncate">{space[path]?.label || path}</p>
                                <p className="text-sm font-bold font-mono text-purple-700 dark:text-purple-400">{value}{space[path] ? <span className="text-[9px] text-slate-400 ml-1 font-normal">(was {space[path].default})</span> : null}</p>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="p-6 bg-slate-900 dark:bg-slate-950 rounded-xl text-white flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center border border-white/10"><TrendingUp size={24} className="text-purple-300" /></div>
                        <div>
                            <p className="text-white font-semibold uppercase tracking-wider text-[10px]">Apply to strategy</p>
                            <h4 className="text-blue-200 font-bold text-sm">Rewrites the spec so Build, Backtest & Code all use these values.</h4>
                        </div>
                    </div>
                    <Button onClick={onApply} disabled={applying} className="h-12 px-8 rounded-2xl bg-white text-slate-900 hover:bg-slate-100 font-semibold uppercase tracking-wider text-xs shadow-lg active:scale-95">
                        {applying ? 'Applying...' : <>Apply Tuned Spec <ArrowRight size={14} className="ml-2" /></>}
                    </Button>
                </div>
            </div>
        </div>
    );
}
