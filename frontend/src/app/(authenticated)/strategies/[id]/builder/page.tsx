'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { useParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CompanySelect } from '@/components/CompanySelect';
import { PageLoader } from '@/components/ui/StockLoader';
import { MetricsDisplay } from '../../components/MetricsDisplay';
import { toast } from 'sonner';
import { Play, Save, Code, Blocks, AlertTriangle, Check, ExternalLink, X } from 'lucide-react';

// --- types (kept light, matching the codebase style) ---
type Param = { name: string; type: 'int' | 'float' | 'choice'; default: any; min?: number; max?: number; step?: number; options?: any[] };
type Comp = { type: string; label: string; category: string; desc: string; needs_symbol: boolean; params: Param[] };
type Registry = { alpha: Comp[]; regime: Comp[]; stop: Comp[]; exit: Comp[] };
type Node = { type: string; params: Record<string, any> } | null;
type Spec = { version: number; alpha: Node; regime: Node; stop: Node; exit: Node; rr: number | null; name?: string };

const KIND_META: Record<string, { title: string; hint: string; required?: boolean }> = {
    alpha: { title: 'Signal (Alpha)', hint: 'What triggers an entry', required: true },
    regime: { title: 'Regime Filter', hint: 'When entries are allowed (optional)' },
    stop: { title: 'Risk / Stop', hint: 'How losses are bounded (optional)' },
    exit: { title: 'Exit Rule', hint: 'Extra exit beyond the signal reverse (optional)' },
};

function defaultParams(comp?: Comp): Record<string, any> {
    const p: Record<string, any> = {};
    (comp?.params || []).forEach((pr) => { p[pr.name] = pr.default; });
    return p;
}

function ParamInput({ param, value, onChange }: { param: Param; value: any; onChange: (v: any) => void }) {
    if (param.type === 'choice') {
        return (
            <select value={value} onChange={(e) => onChange(e.target.value)}
                className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm">
                {(param.options || []).map((o) => <option key={String(o)} value={o}>{String(o)}</option>)}
            </select>
        );
    }
    return (
        <input type="number" value={value}
            step={param.type === 'float' ? (param.step ?? 0.1) : (param.step ?? 1)}
            min={param.min} max={param.max}
            onChange={(e) => onChange(param.type === 'int' ? parseInt(e.target.value || '0', 10) : parseFloat(e.target.value || '0'))}
            className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm font-mono" />
    );
}

function SlotCard({ kind, comps, node, onChange }: { kind: string; comps: Comp[]; node: Node; onChange: (n: Node) => void }) {
    const meta = KIND_META[kind];
    const selected = node ? comps.find((c) => c.type === node.type) : undefined;
    const byCat = useMemo(() => {
        const m: Record<string, Comp[]> = {};
        comps.forEach((c) => { (m[c.category] ||= []).push(c); });
        return m;
    }, [comps]);

    return (
        <Card className="border-gray-100 dark:border-slate-800">
            <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="font-semibold text-sm flex items-center gap-2">
                            {meta.title}
                            {meta.required && <span className="text-[10px] uppercase bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 px-1.5 py-0.5 rounded">required</span>}
                        </div>
                        <div className="text-xs text-gray-500">{meta.hint}</div>
                    </div>
                    {node && !meta.required && (
                        <button onClick={() => onChange(null)} className="text-gray-400 hover:text-red-500" title="Remove"><X size={16} /></button>
                    )}
                </div>

                <select
                    value={node?.type || ''}
                    onChange={(e) => {
                        const t = e.target.value;
                        if (!t) return onChange(null);
                        onChange({ type: t, params: defaultParams(comps.find((c) => c.type === t)) });
                    }}
                    className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium">
                    {!meta.required && <option value="">— None —</option>}
                    {meta.required && !node && <option value="">Select a signal…</option>}
                    {Object.entries(byCat).map(([cat, list]) => (
                        <optgroup key={cat} label={cat}>
                            {list.map((c) => <option key={c.type} value={c.type}>{c.label}</option>)}
                        </optgroup>
                    ))}
                </select>

                {selected && (
                    <>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{selected.desc}</p>
                        {selected.needs_symbol && (
                            <p className="text-[11px] text-amber-600 dark:text-amber-400">Uses broker-flow data for the backtested symbol.</p>
                        )}
                        {selected.params.length > 0 && (
                            <div className="grid grid-cols-2 gap-2">
                                {selected.params.map((pr) => (
                                    <div key={pr.name}>
                                        <label className="text-[11px] text-gray-500 block mb-1">{pr.name}</label>
                                        <ParamInput param={pr} value={node!.params[pr.name]}
                                            onChange={(v) => onChange({ type: node!.type, params: { ...node!.params, [pr.name]: v } })} />
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    );
}

export default function StrategyBuilderPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const [registry, setRegistry] = useState<Registry | null>(null);
    const [strategy, setStrategy] = useState<any>(null);
    const [spec, setSpec] = useState<Spec>({ version: 1, alpha: null, regime: null, stop: null, exit: null, rr: null });
    const [preview, setPreview] = useState<{ valid: boolean; code: string; error: string | null }>({ valid: false, code: '', error: null });
    const [symbol, setSymbol] = useState('NABIL');
    const [running, setRunning] = useState(false);
    const [saving, setSaving] = useState(false);
    const [results, setResults] = useState<any>(null);

    useEffect(() => {
        Promise.all([
            api.get('/api/stocks/strategies/components/'),
            api.get(`/api/stocks/strategies/${id}/`),
        ]).then(([reg, strat]) => {
            setRegistry(reg.data);
            setStrategy(strat.data);
            if (strat.data.spec) setSpec({ version: 1, regime: null, stop: null, exit: null, rr: null, ...strat.data.spec });
            else setSpec((s) => ({ ...s, name: strat.data.name }));
        }).catch(() => toast.error('Failed to load builder'));
    }, [id]);

    // Live code preview (debounced) — backend renders so it matches what runs.
    useEffect(() => {
        if (!spec.alpha) { setPreview({ valid: false, code: '', error: 'Pick a signal to start.' }); return; }
        const t = setTimeout(() => {
            api.post('/api/stocks/strategies/render_spec/', { spec })
                .then((r) => setPreview(r.data))
                .catch(() => setPreview({ valid: false, code: '', error: 'Preview failed' }));
        }, 350);
        return () => clearTimeout(t);
    }, [spec]);

    const setNode = useCallback((kind: keyof Spec, node: Node) => setSpec((s) => ({ ...s, [kind]: node })), []);

    const save = async () => {
        if (!preview.valid) return toast.error('Fix the strategy before saving');
        setSaving(true);
        try {
            await api.patch(`/api/stocks/strategies/${id}/`, { spec });
            toast.success('Strategy saved');
        } catch (e: any) {
            toast.error(e?.response?.data?.spec || 'Save failed');
        } finally { setSaving(false); }
    };

    const runBacktest = async () => {
        if (!preview.valid) return toast.error('Build a valid strategy first');
        setRunning(true); setResults(null);
        const end = new Date(); const start = new Date(); start.setFullYear(end.getFullYear() - 3);
        const fmt = (d: Date) => d.toISOString().slice(0, 10);
        try {
            const r = await api.post(`/api/stocks/strategies/${id}/backtest/`, {
                code: preview.code, symbol, start_date: fmt(start), end_date: fmt(end), initial_balance: 1000000,
            });
            setResults(r.data);
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'Backtest failed');
        } finally { setRunning(false); }
    };

    if (!registry || !strategy) return <DashboardLayout><PageLoader text="Loading builder…" /></DashboardLayout>;

    return (
        <DashboardLayout>
            <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                        <div className="flex items-center gap-2 text-2xl font-bold"><Blocks className="text-blue-600" /> Strategy Builder</div>
                        <p className="text-sm text-gray-500">{strategy.name} — compose from building blocks, no code required.</p>
                    </div>
                    <div className="flex gap-2">
                        <Link href={`/strategies/${id}/editor`}>
                            <Button variant="outline" className="gap-1.5"><Code size={16} /> Code view</Button>
                        </Link>
                        <Button onClick={save} disabled={saving || !preview.valid} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
                            <Save size={16} /> {saving ? 'Saving…' : 'Save'}
                        </Button>
                    </div>
                </div>

                {strategy.code && !strategy.spec && (
                    <div className="flex items-center gap-2 text-sm bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3">
                        <AlertTriangle size={16} /> This strategy currently uses custom code. Saving from the builder will replace it with the composition below.
                    </div>
                )}

                <div className="grid lg:grid-cols-2 gap-6">
                    {/* Left: the four slots */}
                    <div className="space-y-4">
                        {(['alpha', 'regime', 'stop', 'exit'] as const).map((k) => (
                            <SlotCard key={k} kind={k} comps={registry[k]} node={spec[k] as Node} onChange={(n) => setNode(k, n)} />
                        ))}
                    </div>

                    {/* Right: live code + run */}
                    <div className="space-y-4">
                        <Card className="border-gray-100 dark:border-slate-800">
                            <CardContent className="p-4 space-y-2">
                                <div className="flex items-center justify-between">
                                    <div className="font-semibold text-sm flex items-center gap-2"><Code size={15} /> Generated code</div>
                                    {spec.alpha && (preview.valid
                                        ? <span className="text-xs text-emerald-600 flex items-center gap-1"><Check size={13} /> valid</span>
                                        : <span className="text-xs text-red-500 flex items-center gap-1"><AlertTriangle size={13} /> invalid</span>)}
                                </div>
                                {preview.error && <div className="text-xs text-red-500">{preview.error}</div>}
                                <pre className="text-xs font-mono bg-gray-50 dark:bg-slate-950 border border-gray-100 dark:border-slate-800 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap min-h-[120px]">
                                    {preview.code || '# Pick a signal to generate code'}
                                </pre>
                            </CardContent>
                        </Card>

                        <Card className="border-gray-100 dark:border-slate-800">
                            <CardContent className="p-4 space-y-3">
                                <div className="font-semibold text-sm">Quick backtest</div>
                                <div className="flex items-end gap-2">
                                    <div className="flex-1">
                                        <label className="text-[11px] text-gray-500 block mb-1">Symbol (3y)</label>
                                        <CompanySelect value={symbol} onChange={setSymbol} />
                                    </div>
                                    <Button onClick={runBacktest} disabled={running || !preview.valid} className="gap-1.5">
                                        <Play size={16} /> {running ? 'Running…' : 'Run'}
                                    </Button>
                                </div>
                                <Link href={`/strategies/${id}/backtest`} className="text-xs text-blue-600 inline-flex items-center gap-1">
                                    Full backtest & basket robustness <ExternalLink size={12} />
                                </Link>
                            </CardContent>
                        </Card>
                    </div>
                </div>

                {/* Results */}
                {running ? (
                    <PageLoader text="Running backtest…" />
                ) : results ? (
                    <Card className="border-gray-100 dark:border-slate-800">
                        <CardContent className="p-4">
                            {results.stats
                                ? <MetricsDisplay stats={results.stats} plotHtml={results.plot_html} chartHeight="560px" />
                                : <div className="text-sm text-gray-500">{results.error || 'No results.'}</div>}
                        </CardContent>
                    </Card>
                ) : null}
            </div>
        </DashboardLayout>
    );
}
