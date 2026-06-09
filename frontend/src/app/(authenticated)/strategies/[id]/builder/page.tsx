'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { CompanySelect } from '@/components/CompanySelect';
import { PageLoader } from '@/components/ui/StockLoader';
import { MetricsDisplay } from '../../components/MetricsDisplay';
import { WorkspaceShell } from '../../components/WorkspaceShell';
import { toast } from 'sonner';
import { Play, Save, Code, Check, AlertTriangle, X, Plus, Search, Zap, Filter, Shield, LogOut, Target, ExternalLink, ChevronDown } from 'lucide-react';

type Param = { name: string; label?: string; type: 'int' | 'float' | 'choice'; default: any; min?: number; max?: number; step?: number; options?: any[] };
type Comp = { type: string; label: string; category: string; desc: string; needs_symbol: boolean; params: Param[] };
type Registry = { alpha: Comp[]; regime: Comp[]; stop: Comp[]; exit: Comp[] };
type Node = { type: string; params: Record<string, any> };
type Kind = 'alpha' | 'regime' | 'stop' | 'exit';
type Spec = { version: number; alpha: Node | null; regime: Node[]; stop: Node | null; exit: Node[]; rr: number | null; name?: string };

const KIND: Record<Kind, { label: string; connective: string; icon: any; chip: string; bar: string }> = {
    alpha: { label: 'Signal', connective: 'WHEN', icon: Zap, chip: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300', bar: 'bg-blue-500' },
    regime: { label: 'Filter', connective: 'AND ONLY IF', icon: Filter, chip: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300', bar: 'bg-amber-500' },
    stop: { label: 'Risk', connective: 'PROTECT WITH', icon: Shield, chip: 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300', bar: 'bg-rose-500' },
    exit: { label: 'Exit', connective: 'EXIT WHEN', icon: LogOut, chip: 'bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-300', bar: 'bg-violet-500' },
};

const defaultParams = (c?: Comp) => { const p: Record<string, any> = {}; (c?.params || []).forEach((pr) => p[pr.name] = pr.default); return p; };

function ParamPill({ param, value, onChange }: { param: Param; value: any; onChange: (v: any) => void }) {
    return (
        <label className="inline-flex items-center gap-1.5 rounded-lg bg-gray-50 dark:bg-slate-800/70 border border-gray-200 dark:border-slate-700 px-2 py-1 text-xs">
            <span className="text-gray-500">{param.label || param.name}</span>
            {param.type === 'choice' ? (
                <select value={value} onChange={(e) => onChange(e.target.value)} className="bg-transparent font-mono font-medium outline-none">
                    {(param.options || []).map((o) => <option key={String(o)} value={o}>{String(o)}</option>)}
                </select>
            ) : (
                <input type="number" value={value} step={param.type === 'float' ? (param.step ?? 0.1) : (param.step ?? 1)}
                    min={param.min} max={param.max}
                    onChange={(e) => onChange(param.type === 'int' ? parseInt(e.target.value || '0', 10) : parseFloat(e.target.value || '0'))}
                    className="w-14 bg-transparent font-mono font-medium outline-none" />
            )}
        </label>
    );
}

function ActionBlock({ kind, comps, node, onChange, onRemove, first }: {
    kind: Kind; comps: Comp[]; node: Node; onChange: (n: Node) => void; onRemove?: () => void; first?: boolean;
}) {
    const meta = KIND[kind];
    const Icon = meta.icon;
    const selected = comps.find((c) => c.type === node.type);
    const byCat = useMemo(() => { const m: Record<string, Comp[]> = {}; comps.forEach((c) => (m[c.category] ||= []).push(c)); return m; }, [comps]);
    return (
        <div className="relative">
            {!first && <div className="absolute left-[26px] -top-3 h-3 w-0.5 bg-gray-200 dark:bg-slate-700" />}
            <div className="text-[10px] font-bold tracking-wider text-gray-400 mb-1 ml-1">{meta.connective}</div>
            <div className="rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-card shadow-sm p-3">
                <div className="flex items-start gap-3">
                    <span className={`mt-0.5 inline-flex items-center justify-center rounded-xl w-9 h-9 shrink-0 ${meta.chip}`}><Icon size={18} /></span>
                    <div className="flex-1 min-w-0">
                        <div className="relative inline-block">
                            <select value={node.type} onChange={(e) => onChange({ type: e.target.value, params: defaultParams(comps.find((c) => c.type === e.target.value)) })}
                                className="appearance-none font-semibold text-sm bg-transparent pr-5 outline-none cursor-pointer">
                                {Object.entries(byCat).map(([cat, list]) => (
                                    <optgroup key={cat} label={cat}>{list.map((c) => <option key={c.type} value={c.type}>{c.label}</option>)}</optgroup>
                                ))}
                            </select>
                            <ChevronDown size={13} className="absolute right-0 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                        </div>
                        {selected?.desc && <div className="text-xs text-gray-400 mt-0.5">{selected.desc}</div>}
                        {selected && selected.params.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                                {selected.params.map((pr) => (
                                    <ParamPill key={pr.name} param={pr} value={node.params?.[pr.name] ?? pr.default}
                                        onChange={(v) => onChange({ type: node.type, params: { ...(node.params || {}), [pr.name]: v } })} />
                                ))}
                            </div>
                        )}
                    </div>
                    {onRemove && <button onClick={onRemove} className="text-gray-300 hover:text-red-500 mt-1"><X size={16} /></button>}
                </div>
            </div>
        </div>
    );
}

export default function StrategyBuilderPage() {
    const { id } = useParams<{ id: string }>();
    const [registry, setRegistry] = useState<Registry | null>(null);
    const [strategy, setStrategy] = useState<any>(null);
    const [spec, setSpec] = useState<Spec>({ version: 1, alpha: null, regime: [], stop: null, exit: [], rr: null });
    const [preview, setPreview] = useState<{ valid: boolean; code: string; error: string | null }>({ valid: false, code: '', error: null });
    const [symbol, setSymbol] = useState('NABIL');
    const [running, setRunning] = useState(false);
    const [saving, setSaving] = useState(false);
    const [results, setResults] = useState<any>(null);
    const [palQ, setPalQ] = useState('');

    useEffect(() => {
        Promise.all([api.get('/api/stocks/strategies/components/'), api.get(`/api/stocks/strategies/${id}/`)])
            .then(([reg, strat]) => {
                const registry: Registry = reg.data;
                setRegistry(registry); setStrategy(strat.data);
                // Fill default params for nodes that omit them (auto-converted specs are minimal).
                const all: Comp[] = [...registry.alpha, ...registry.regime, ...registry.stop, ...registry.exit];
                const norm = (n: any): Node | null => {
                    if (!n) return null;
                    const c = all.find((x) => x.type === n.type);
                    return { type: n.type, params: { ...defaultParams(c), ...(n.params || {}) } };
                };
                const arr = (v: any): Node[] => (Array.isArray(v) ? v : v ? [v] : []).map(norm).filter(Boolean) as Node[];
                const sp = strat.data.spec;
                if (sp) setSpec({ version: 1, alpha: norm(sp.alpha), regime: arr(sp.regime), stop: norm(sp.stop), exit: arr(sp.exit), rr: sp.rr ?? null, name: sp.name });
                else setSpec((s) => ({ ...s, name: strat.data.name }));
            }).catch(() => toast.error('Failed to load builder'));
    }, [id]);

    useEffect(() => {
        if (!spec.alpha) { setPreview({ valid: false, code: '', error: 'Add a signal to start.' }); return; }
        const t = setTimeout(() => api.post('/api/stocks/strategies/render_spec/', { spec }).then((r) => setPreview(r.data)).catch(() => setPreview({ valid: false, code: '', error: 'Preview failed' })), 350);
        return () => clearTimeout(t);
    }, [spec]);

    const addComponent = useCallback((kind: Kind, comp: Comp) => {
        const node = { type: comp.type, params: defaultParams(comp) };
        setSpec((s) => kind === 'alpha' ? { ...s, alpha: node }
            : kind === 'stop' ? { ...s, stop: node }
                : kind === 'regime' ? { ...s, regime: [...s.regime, node] }
                    : { ...s, exit: [...s.exit, node] });
    }, []);

    const save = async () => {
        if (!preview.valid) return toast.error('Fix the strategy before saving');
        setSaving(true);
        try { await api.patch(`/api/stocks/strategies/${id}/`, { spec }); toast.success('Strategy saved'); }
        catch (e: any) { toast.error(e?.response?.data?.spec || 'Save failed'); } finally { setSaving(false); }
    };

    const runBacktest = async () => {
        if (!preview.valid) return toast.error('Build a valid strategy first');
        setRunning(true); setResults(null);
        const end = new Date(); const start = new Date(); start.setFullYear(end.getFullYear() - 3);
        const fmt = (d: Date) => d.toISOString().slice(0, 10);
        try { const r = await api.post(`/api/stocks/strategies/${id}/backtest/`, { code: preview.code, symbol, start_date: fmt(start), end_date: fmt(end), initial_balance: 1000000 }); setResults(r.data); }
        catch (e: any) { toast.error(e?.response?.data?.error || 'Backtest failed'); } finally { setRunning(false); }
    };

    if (!registry || !strategy) return <WorkspaceShell strategyId={id}><PageLoader text="Loading builder…" /></WorkspaceShell>;

    const palette: { kind: Kind; comps: Comp[] }[] = [
        { kind: 'alpha', comps: registry.alpha }, { kind: 'regime', comps: registry.regime },
        { kind: 'stop', comps: registry.stop }, { kind: 'exit', comps: registry.exit },
    ];

    return (
        <WorkspaceShell strategyId={id}>
            <div className="flex items-center justify-between mb-3">
                <div className="text-base font-semibold text-gray-500">Visual Builder</div>
                <Button onClick={save} disabled={saving || !preview.valid} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"><Save size={16} /> {saving ? 'Saving…' : 'Save'}</Button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[290px_1fr_380px] gap-4 items-start">
                {/* Palette */}
                <div className="rounded-2xl border border-gray-200 dark:border-slate-800 bg-gray-50/60 dark:bg-slate-900/40 p-3 xl:sticky xl:top-4 max-h-[80vh] overflow-y-auto">
                    <div className="relative mb-3">
                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input value={palQ} onChange={(e) => setPalQ(e.target.value)} placeholder="Search actions…"
                            className="w-full pl-8 pr-2 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900" />
                    </div>
                    {palette.map(({ kind, comps }) => {
                        const Icon = KIND[kind].icon;
                        const items = comps.filter((c) => !palQ || c.label.toLowerCase().includes(palQ.toLowerCase()) || c.category.toLowerCase().includes(palQ.toLowerCase()));
                        if (!items.length) return null;
                        return (
                            <div key={kind} className="mb-3">
                                <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-gray-400 mb-1.5 uppercase">
                                    <Icon size={12} /> {KIND[kind].label}s
                                </div>
                                <div className="space-y-1">
                                    {items.map((c) => (
                                        <button key={c.type} onClick={() => addComponent(kind, c)} title={c.desc}
                                            className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white dark:hover:bg-slate-800 group">
                                            <span className={`inline-flex items-center justify-center rounded-md w-6 h-6 shrink-0 ${KIND[kind].chip}`}><Icon size={12} /></span>
                                            <span className="text-sm truncate flex-1">{c.label}</span>
                                            <Plus size={13} className="text-gray-300 group-hover:text-blue-500" />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Flow */}
                <div className="space-y-3 min-w-0">
                    {!spec.alpha ? (
                        <div className="rounded-2xl border-2 border-dashed border-gray-200 dark:border-slate-700 p-10 text-center text-sm text-gray-400">
                            <Zap className="mx-auto mb-2 text-gray-300" size={28} />
                            Pick a <b>Signal</b> from the left to start building your strategy.
                        </div>
                    ) : (
                        <ActionBlock first kind="alpha" comps={registry.alpha} node={spec.alpha} onChange={(n) => setSpec((s) => ({ ...s, alpha: n }))} />
                    )}

                    {spec.regime.map((n, i) => (
                        <ActionBlock key={`r${i}`} kind="regime" comps={registry.regime} node={n}
                            onChange={(nn) => setSpec((s) => { const r = [...s.regime]; r[i] = nn; return { ...s, regime: r }; })}
                            onRemove={() => setSpec((s) => ({ ...s, regime: s.regime.filter((_, j) => j !== i) }))} />
                    ))}
                    {spec.stop && (
                        <ActionBlock kind="stop" comps={registry.stop} node={spec.stop}
                            onChange={(n) => setSpec((s) => ({ ...s, stop: n }))} onRemove={() => setSpec((s) => ({ ...s, stop: null }))} />
                    )}
                    {spec.exit.map((n, i) => (
                        <ActionBlock key={`e${i}`} kind="exit" comps={registry.exit} node={n}
                            onChange={(nn) => setSpec((s) => { const e = [...s.exit]; e[i] = nn; return { ...s, exit: e }; })}
                            onRemove={() => setSpec((s) => ({ ...s, exit: s.exit.filter((_, j) => j !== i) }))} />
                    ))}

                    {spec.alpha && (
                        <div className="relative">
                            <div className="absolute left-[26px] -top-3 h-3 w-0.5 bg-gray-200 dark:bg-slate-700" />
                            <div className="text-[10px] font-bold tracking-wider text-gray-400 mb-1 ml-1">TAKE PROFIT (OPTIONAL)</div>
                            <div className="rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-card shadow-sm p-3 flex items-center gap-3">
                                <span className="inline-flex items-center justify-center rounded-xl w-9 h-9 bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300"><Target size={18} /></span>
                                <div className="text-sm">Target at <input type="number" step={0.5} min={0} value={spec.rr ?? ''} placeholder="—"
                                    onChange={(e) => setSpec((s) => ({ ...s, rr: e.target.value === '' ? null : parseFloat(e.target.value) }))}
                                    className="w-16 mx-1 rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/70 px-2 py-1 font-mono text-center outline-none" /> × the stop distance <span className="text-gray-400">(needs a stop)</span></div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right: code + run */}
                <div className="space-y-3 xl:sticky xl:top-4">
                    <div className="rounded-2xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-card p-3">
                        <div className="flex items-center justify-between mb-2">
                            <div className="font-semibold text-sm flex items-center gap-2"><Code size={15} /> Generated code</div>
                            {spec.alpha && (preview.valid ? <span className="text-xs text-emerald-600 flex items-center gap-1"><Check size={13} /> valid</span> : <span className="text-xs text-red-500 flex items-center gap-1"><AlertTriangle size={13} /> invalid</span>)}
                        </div>
                        {preview.error && <div className="text-xs text-red-500 mb-1">{preview.error}</div>}
                        <pre className="text-[11px] font-mono bg-gray-50 dark:bg-slate-950 border border-gray-100 dark:border-slate-800 rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap min-h-[100px]">{preview.code || '# add a signal'}</pre>
                    </div>
                    <div className="rounded-2xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-card p-3 space-y-2">
                        <div className="font-semibold text-sm">Quick backtest</div>
                        <div className="flex items-end gap-2">
                            <div className="flex-1"><label className="text-[11px] text-gray-500 block mb-1">Symbol (3y)</label><CompanySelect value={symbol} onChange={setSymbol} /></div>
                            <Button onClick={runBacktest} disabled={running || !preview.valid} className="gap-1.5"><Play size={16} /> {running ? '…' : 'Run'}</Button>
                        </div>
                        <Link href={`/strategies/${id}/backtest`} className="text-xs text-blue-600 inline-flex items-center gap-1">Full backtest & robustness <ExternalLink size={12} /></Link>
                    </div>
                </div>
            </div>

            {running ? <PageLoader text="Running backtest…" /> : results ? (
                <div className="rounded-2xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-card p-4 mt-4">
                    {results.stats ? <MetricsDisplay stats={results.stats} plotHtml={results.plot_html} strategyId={id} chartHeight="560px" /> : <div className="text-sm text-gray-500">{results.error || 'No results.'}</div>}
                </div>
            ) : null}
        </WorkspaceShell>
    );
}
