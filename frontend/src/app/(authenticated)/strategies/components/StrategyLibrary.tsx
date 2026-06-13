'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Table2, LayoutGrid, Columns2, Search, Play, Activity, Settings2, Plus, ArrowUpDown, Radar,
    Lightbulb, TrendingUp, Zap, Target, Shield, BarChart3, PieChart, Flame, Rocket, Cpu, Layers } from 'lucide-react';

const ICONS: Record<string, any> = { Lightbulb, TrendingUp, Zap, Target, Activity, Shield, BarChart3, PieChart, Flame, Rocket, Cpu, Layers };

type Metrics = {
    return_pct?: number | null; sharpe?: number | null; sortino?: number | null; win_rate?: number | null;
    max_drawdown?: number | null; num_trades?: number | null; profit_factor?: number | null; exposure?: number | null;
};
type Strategy = {
    id: number; name: string; kind?: 'composed' | 'custom'; summary?: string;
    icon?: string; icon_color?: string; metrics_summary?: Metrics; published_experiments?: any[];
};
type View = 'table' | 'cards' | 'split';
type Filter = 'all' | 'composed' | 'custom' | 'published';
type SortKey = 'name' | 'return_pct' | 'sharpe' | 'win_rate';

const M = (s: Strategy): Metrics => s.metrics_summary || {};
const isPublished = (s: Strategy) => (s.published_experiments?.length || 0) > 0;
const fmt = (v: any, suffix = '', dp = 2) => (v == null ? '—' : `${Number(v).toFixed(dp)}${suffix}`);
const fmtPct = (v: any) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${Number(v).toFixed(1)}%`);
const posColor = (v: any) => (v == null ? 'text-gray-400' : v >= 0 ? 'text-emerald-600' : 'text-red-500');
const openHref = (s: Strategy) => `/strategies/${s.id}/${s.kind === 'custom' ? 'editor' : 'builder'}`;

function StratIcon({ s, size = 18 }: { s: Strategy; size?: number }) {
    const Icon = ICONS[s.icon || 'Lightbulb'] || Lightbulb;
    const color = s.icon_color && s.icon_color !== '#000000' ? s.icon_color : '#3b82f6';
    return (
        <span className="inline-flex items-center justify-center rounded-lg shrink-0"
            style={{ width: size + 14, height: size + 14, background: `${color}1a`, color }}><Icon size={size} /></span>
    );
}

function KindBadge({ kind }: { kind?: string }) {
    const composed = kind === 'composed';
    return <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${composed
        ? 'bg-primary/10 text-primary'
        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>{composed ? 'Composed' : 'Custom'}</span>;
}

function Actions({ s, router, compact }: { s: Strategy; router: any; compact?: boolean }) {
    const sz = compact ? 14 : 15;
    const go = (e: any, path: string) => { e.stopPropagation(); router.push(`/strategies/${s.id}${path}`); };
    return (
        <div className="flex items-center gap-1">
            <button onClick={(e) => { e.stopPropagation(); router.push(openHref(s)); }} title="Open workspace" className="p-1.5 rounded-lg hover:bg-primary/10 text-primary"><Settings2 size={sz} /></button>
            <button onClick={(e) => go(e, '/backtest')} title="Backtest" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"><Play size={sz} /></button>
            <button onClick={(e) => go(e, '/optimize')} title="Optimize" className="p-1.5 rounded-lg hover:bg-accent hover:text-accent-foreground text-primary"><Activity size={sz} /></button>
        </div>
    );
}

export function StrategyLibrary({ strategies, onCreate }: { strategies: Strategy[]; onCreate?: () => void }) {
    const router = useRouter();
    const [view, setView] = useState<View>('split');
    const [filter, setFilter] = useState<Filter>('all');
    const [sort, setSort] = useState<SortKey>('return_pct');
    const [q, setQ] = useState('');
    const [sel, setSel] = useState<number | null>(null);

    const rows = useMemo(() => {
        let r = strategies.filter((s) =>
            (filter === 'all' || (filter === 'published' ? isPublished(s) : s.kind === filter)) &&
            (!q || s.name.toLowerCase().includes(q.toLowerCase())));
        const key = (s: Strategy) => sort === 'name' ? s.name : (M(s) as any)[sort];
        r = [...r].sort((a, b) => sort === 'name'
            ? a.name.localeCompare(b.name)
            : ((key(b) ?? -1e9) - (key(a) ?? -1e9)));
        return r;
    }, [strategies, filter, sort, q]);

    const selected = rows.find((s) => s.id === sel) || rows[0];

    const COLS: { label: string; get: (m: Metrics) => any; fmt: (v: any) => string; color?: (v: any) => string }[] = [
        { label: 'Return', get: (m) => m.return_pct, fmt: fmtPct, color: posColor },
        { label: 'Sharpe', get: (m) => m.sharpe, fmt: (v) => fmt(v) },
        { label: 'Sortino', get: (m) => m.sortino, fmt: (v) => fmt(v) },
        { label: 'Win%', get: (m) => m.win_rate, fmt: (v) => fmt(v, '%', 0) },
        { label: 'Max DD', get: (m) => m.max_drawdown, fmt: (v) => fmt(v, '%', 1), color: () => 'text-red-500' },
        { label: 'Trades', get: (m) => m.num_trades, fmt: (v) => (v == null ? '—' : String(Math.round(v))) },
        { label: 'PF', get: (m) => m.profit_factor, fmt: (v) => fmt(v) },
    ];

    return (
        <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[180px] max-w-xs">
                    <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search strategies…"
                        className="w-full pl-8 pr-2 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900" />
                </div>
                <div className="flex gap-1 text-xs">
                    {(['all', 'composed', 'custom', 'published'] as Filter[]).map((f) => (
                        <button key={f} onClick={() => setFilter(f)}
                            className={`px-2.5 py-1.5 rounded-lg capitalize ${filter === f ? 'bg-primary text-primary-foreground' : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300'}`}>{f}</button>
                    ))}
                </div>
                <button onClick={() => setSort((s) => s === 'return_pct' ? 'sharpe' : s === 'sharpe' ? 'win_rate' : s === 'win_rate' ? 'name' : 'return_pct')}
                    className="px-2.5 py-1.5 text-xs rounded-lg bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 inline-flex items-center gap-1">
                    <ArrowUpDown size={13} /> {sort.replace('_', ' ')}
                </button>
                <div className="flex p-0.5 bg-gray-100 dark:bg-slate-800 rounded-lg ml-auto">
                    {([['split', Columns2], ['cards', LayoutGrid], ['table', Table2]] as const).map(([v, Icon]) => (
                        <button key={v} onClick={() => setView(v)} title={v}
                            className={`p-1.5 rounded-md ${view === v ? 'bg-white dark:bg-slate-700 shadow-sm text-primary' : 'text-gray-500'}`}><Icon size={16} /></button>
                    ))}
                </div>
                <button onClick={() => router.push('/strategies/scan')} title="Find the best strategy for a symbol"
                    className="px-3 py-1.5 text-sm font-semibold rounded-lg border border-border inline-flex items-center gap-1.5 hover:border-primary hover:text-primary transition-colors"><Radar size={15} /> Scan</button>
                {onCreate && <button onClick={onCreate} className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-primary text-primary-foreground inline-flex items-center gap-1.5"><Plus size={15} /> New</button>}
            </div>

            {rows.length === 0 ? (
                <div className="text-center text-sm text-gray-500 py-16">No strategies match.</div>
            ) : view === 'table' ? (
                <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-slate-800">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-slate-900 text-xs text-gray-500">
                            <tr>
                                <th className="text-left px-4 py-2">Name</th><th className="px-3">Kind</th>
                                {COLS.map((c) => <th key={c.label} className="text-right px-3 whitespace-nowrap">{c.label}</th>)}
                                <th className="px-3">Pub</th><th className="px-3"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((s) => (
                                <tr key={s.id} onClick={() => router.push(openHref(s))}
                                    className="border-t border-gray-100 dark:border-slate-800 hover:bg-accent cursor-pointer">
                                    <td className="px-4 py-2.5"><div className="flex items-center gap-2.5"><StratIcon s={s} size={15} /><div className="min-w-0"><div className="font-medium">{s.name}</div><div className="text-xs text-gray-400 truncate max-w-xs">{s.summary}</div></div></div></td>
                                    <td className="text-center"><KindBadge kind={s.kind} /></td>
                                    {COLS.map((c) => { const v = c.get(M(s)); return <td key={c.label} className={`text-right px-3 font-mono ${c.color ? c.color(v) : 'text-gray-600 dark:text-slate-300'}`}>{c.fmt(v)}</td>; })}
                                    <td className="text-center">{isPublished(s) && <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />}</td>
                                    <td className="px-3"><Actions s={s} router={router} compact /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : view === 'cards' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {rows.map((s) => (
                        <div key={s.id} onClick={() => router.push(openHref(s))}
                            className="cursor-pointer rounded-2xl border border-gray-100 dark:border-slate-800 p-4 hover:shadow-md hover:border-primary/30 transition-all bg-white dark:bg-card">
                            <div className="flex items-center justify-between mb-2">
                                <StratIcon s={s} />
                                <div className="flex items-center gap-1.5">{isPublished(s) && <span className="w-2 h-2 rounded-full bg-emerald-500" />}<KindBadge kind={s.kind} /></div>
                            </div>
                            <div className="font-semibold mb-1">{s.name}</div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 min-h-[2rem]">{s.summary}</p>
                            <div className="grid grid-cols-4 gap-1 mt-3 pt-3 border-t border-gray-100 dark:border-slate-800 text-center">
                                {COLS.slice(0, 4).map((c) => { const v = c.get(M(s)); return <div key={c.label}><div className="text-[10px] text-gray-400">{c.label}</div><div className={`text-xs font-mono ${c.color ? c.color(v) : ''}`}>{c.fmt(v)}</div></div>; })}
                            </div>
                            <div className="flex justify-end mt-3"><Actions s={s} router={router} compact /></div>
                        </div>
                    ))}
                </div>
            ) : (
                /* split: list + full overview preview */
                <div className="grid lg:grid-cols-[320px_1fr] gap-4">
                    <div className="rounded-xl border border-gray-100 dark:border-slate-800 divide-y divide-gray-100 dark:divide-slate-800 max-h-[72vh] overflow-y-auto">
                        {rows.map((s) => (
                            <button key={s.id} onClick={() => setSel(s.id)}
                                className={`w-full text-left px-3 py-2.5 hover:bg-accent ${selected?.id === s.id ? 'bg-primary/10' : ''}`}>
                                <div className="flex items-center justify-between gap-2">
                                    <span className="flex items-center gap-2 min-w-0"><StratIcon s={s} size={14} /><span className="font-medium text-sm truncate">{s.name}</span></span>
                                    <span className={`text-xs font-mono shrink-0 ${posColor(M(s).return_pct)}`}>{fmtPct(M(s).return_pct)}</span>
                                </div>
                                <div className="flex items-center gap-1.5 mt-1 pl-9"><KindBadge kind={s.kind} />{isPublished(s) && <span className="text-[10px] text-emerald-600">published</span>}</div>
                            </button>
                        ))}
                    </div>
                    {selected && (
                        <div className="rounded-xl border border-gray-100 dark:border-slate-800 p-5">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                                <div className="flex items-center gap-3"><StratIcon s={selected} size={24} /><div><div className="text-xl font-bold">{selected.name}</div><div className="flex items-center gap-2 mt-0.5"><KindBadge kind={selected.kind} />{isPublished(selected) && <span className="text-[10px] text-emerald-600 font-semibold">PUBLISHED</span>}</div></div></div>
                                <Actions s={selected} router={router} />
                            </div>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-3 max-w-2xl">{selected.summary}</p>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
                                {COLS.map((c) => { const v = c.get(M(selected)); return (
                                    <div key={c.label} className="rounded-xl bg-gray-50 dark:bg-slate-900 p-3">
                                        <div className="text-xs text-gray-500">{c.label}</div>
                                        <div className={`text-lg font-bold font-mono ${c.color ? c.color(v) : ''}`}>{c.fmt(v)}</div>
                                    </div>
                                ); })}
                                <div className="rounded-xl bg-gray-50 dark:bg-slate-900 p-3">
                                    <div className="text-xs text-gray-500">Exposure</div>
                                    <div className="text-lg font-bold font-mono">{fmt(M(selected).exposure, '%', 0)}</div>
                                </div>
                            </div>
                            <div className="flex gap-2 mt-5 flex-wrap">
                                <button onClick={() => router.push(openHref(selected))} className="px-4 py-2 text-sm font-semibold rounded-lg bg-primary text-primary-foreground inline-flex items-center gap-1.5"><Settings2 size={15} /> Open Workspace</button>
                                <button onClick={() => router.push(`/strategies/${selected.id}/backtest`)} className="px-4 py-2 text-sm font-semibold rounded-lg border border-gray-200 dark:border-slate-700 inline-flex items-center gap-1.5"><Play size={15} /> Backtest</button>
                                <button onClick={() => router.push(`/strategies/${selected.id}/optimize`)} className="px-4 py-2 text-sm font-semibold rounded-lg border border-gray-200 dark:border-slate-700 inline-flex items-center gap-1.5"><Activity size={15} /> Optimize</button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
