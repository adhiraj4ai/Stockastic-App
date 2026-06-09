'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Table2, LayoutGrid, Columns2, Search, Play, Activity, Settings2, Plus, ArrowUpDown,
    Lightbulb, TrendingUp, Zap, Target, Shield, BarChart3, PieChart, Flame, Rocket, Cpu, Layers } from 'lucide-react';

const ICONS: Record<string, any> = { Lightbulb, TrendingUp, Zap, Target, Activity, Shield, BarChart3, PieChart, Flame, Rocket, Cpu, Layers };

type Strategy = {
    id: number; name: string; kind?: 'composed' | 'custom'; summary?: string;
    pnl_percent?: any; sharpe_ratio?: any; win_rate?: any; icon?: string; icon_color?: string;
    published_experiments?: any[];
};

function StratIcon({ s, size = 18 }: { s: Strategy; size?: number }) {
    const Icon = ICONS[s.icon || 'Lightbulb'] || Lightbulb;
    const color = s.icon_color && s.icon_color !== '#000000' ? s.icon_color : '#3b82f6';
    return (
        <span className="inline-flex items-center justify-center rounded-lg shrink-0"
            style={{ width: size + 14, height: size + 14, background: `${color}1a`, color }}>
            <Icon size={size} />
        </span>
    );
}
type View = 'table' | 'cards' | 'split';
type Filter = 'all' | 'composed' | 'custom' | 'published';
type SortKey = 'name' | 'pnl_percent' | 'sharpe_ratio' | 'win_rate';

const num = (v: any) => (v == null || isNaN(parseFloat(v)) ? null : parseFloat(v));
const pct = (v: any) => { const n = num(v); return n == null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`; };
const isPublished = (s: Strategy) => (s.published_experiments?.length || 0) > 0;

function KindBadge({ kind }: { kind?: string }) {
    const composed = kind === 'composed';
    return <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${composed
        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>{composed ? 'Composed' : 'Custom'}</span>;
}

function Actions({ id, router, compact }: { id: number; router: any; compact?: boolean }) {
    const go = (e: any, path: string) => { e.stopPropagation(); router.push(`/strategies/${id}${path}`); };
    const sz = compact ? 14 : 15;
    return (
        <div className="flex items-center gap-1">
            <button onClick={(e) => go(e, '')} title="Open workspace" className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 text-blue-600"><Settings2 size={sz} /></button>
            <button onClick={(e) => go(e, '/backtest')} title="Backtest" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"><Play size={sz} /></button>
            <button onClick={(e) => go(e, '/optimize')} title="Optimize" className="p-1.5 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/30 text-purple-600"><Activity size={sz} /></button>
        </div>
    );
}

function MetricChips({ s }: { s: Strategy }) {
    return (
        <div className="flex items-center gap-3 text-xs">
            <span className={(num(s.pnl_percent) ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}>{pct(s.pnl_percent)}</span>
            <span className="text-gray-500">SR {num(s.sharpe_ratio)?.toFixed(2) ?? '—'}</span>
            <span className="text-gray-500">Win {num(s.win_rate) != null ? `${num(s.win_rate)!.toFixed(0)}%` : '—'}</span>
        </div>
    );
}

export function StrategyLibrary({ strategies, onCreate }: { strategies: Strategy[]; onCreate?: () => void }) {
    const router = useRouter();
    const [view, setView] = useState<View>('split');
    const [filter, setFilter] = useState<Filter>('all');
    const [sort, setSort] = useState<SortKey>('pnl_percent');
    const [q, setQ] = useState('');
    const [sel, setSel] = useState<number | null>(null);

    const rows = useMemo(() => {
        let r = strategies.filter((s) =>
            (filter === 'all' || (filter === 'published' ? isPublished(s) : s.kind === filter)) &&
            (!q || s.name.toLowerCase().includes(q.toLowerCase())));
        r = [...r].sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : (num((b as any)[sort]) ?? -1e9) - (num((a as any)[sort]) ?? -1e9));
        return r;
    }, [strategies, filter, sort, q]);

    const selected = rows.find((s) => s.id === sel) || rows[0];

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
                            className={`px-2.5 py-1.5 rounded-lg capitalize ${filter === f ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300'}`}>{f}</button>
                    ))}
                </div>
                <button onClick={() => setSort((s) => s === 'pnl_percent' ? 'sharpe_ratio' : s === 'sharpe_ratio' ? 'win_rate' : s === 'win_rate' ? 'name' : 'pnl_percent')}
                    className="px-2.5 py-1.5 text-xs rounded-lg bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300 inline-flex items-center gap-1">
                    <ArrowUpDown size={13} /> {sort.replace('_', ' ')}
                </button>
                <div className="flex p-0.5 bg-gray-100 dark:bg-slate-800 rounded-lg ml-auto">
                    {([['split', Columns2], ['cards', LayoutGrid], ['table', Table2]] as const).map(([v, Icon]) => (
                        <button key={v} onClick={() => setView(v)} title={v}
                            className={`p-1.5 rounded-md ${view === v ? 'bg-white dark:bg-slate-700 shadow-sm text-blue-600' : 'text-gray-500'}`}><Icon size={16} /></button>
                    ))}
                </div>
                {onCreate && <button onClick={onCreate} className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-blue-600 text-white inline-flex items-center gap-1.5"><Plus size={15} /> New</button>}
            </div>

            {rows.length === 0 ? (
                <div className="text-center text-sm text-gray-500 py-16">No strategies match.</div>
            ) : view === 'table' ? (
                <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-slate-800">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-slate-900 text-xs text-gray-500">
                            <tr><th className="text-left px-4 py-2">Name</th><th className="px-3">Kind</th><th className="text-right px-3">Return</th><th className="text-right px-3">Sharpe</th><th className="text-right px-3">Win</th><th className="px-3">Pub</th><th className="px-3"></th></tr>
                        </thead>
                        <tbody>
                            {rows.map((s) => (
                                <tr key={s.id} onClick={() => router.push(`/strategies/${s.id}`)}
                                    className="border-t border-gray-100 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-900/60 cursor-pointer">
                                    <td className="px-4 py-2.5"><div className="flex items-center gap-2.5"><StratIcon s={s} size={15} /><div className="min-w-0"><div className="font-medium">{s.name}</div><div className="text-xs text-gray-400 truncate max-w-md">{s.summary}</div></div></div></td>
                                    <td className="text-center"><KindBadge kind={s.kind} /></td>
                                    <td className={`text-right px-3 font-mono ${(num(s.pnl_percent) ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{pct(s.pnl_percent)}</td>
                                    <td className="text-right px-3 font-mono text-gray-600 dark:text-slate-300">{num(s.sharpe_ratio)?.toFixed(2) ?? '—'}</td>
                                    <td className="text-right px-3 font-mono text-gray-600 dark:text-slate-300">{num(s.win_rate) != null ? `${num(s.win_rate)!.toFixed(0)}%` : '—'}</td>
                                    <td className="text-center">{isPublished(s) && <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />}</td>
                                    <td className="px-3"><Actions id={s.id} router={router} compact /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : view === 'cards' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {rows.map((s) => (
                        <div key={s.id} onClick={() => router.push(`/strategies/${s.id}`)}
                            className="cursor-pointer rounded-2xl border border-gray-100 dark:border-slate-800 p-4 hover:shadow-md hover:border-blue-200 dark:hover:border-blue-800 transition-all bg-white dark:bg-card">
                            <div className="flex items-center justify-between mb-2">
                                <StratIcon s={s} />
                                <div className="flex items-center gap-1.5">{isPublished(s) && <span className="w-2 h-2 rounded-full bg-emerald-500" />}<KindBadge kind={s.kind} /></div>
                            </div>
                            <div className="font-semibold mb-1">{s.name}</div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 min-h-[2rem]">{s.summary}</p>
                            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-slate-800">
                                <MetricChips s={s} /><Actions id={s.id} router={router} compact />
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                /* split: list + live preview */
                <div className="grid lg:grid-cols-[320px_1fr] gap-4">
                    <div className="rounded-xl border border-gray-100 dark:border-slate-800 divide-y divide-gray-100 dark:divide-slate-800 max-h-[70vh] overflow-y-auto">
                        {rows.map((s) => (
                            <button key={s.id} onClick={() => setSel(s.id)}
                                className={`w-full text-left px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-slate-900/60 ${selected?.id === s.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                                <div className="flex items-center justify-between gap-2">
                                    <span className="flex items-center gap-2 min-w-0"><StratIcon s={s} size={14} /><span className="font-medium text-sm truncate">{s.name}</span></span>
                                    <span className={`text-xs font-mono shrink-0 ${(num(s.pnl_percent) ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{pct(s.pnl_percent)}</span>
                                </div>
                                <div className="flex items-center gap-1.5 mt-1 pl-9"><KindBadge kind={s.kind} />{isPublished(s) && <span className="text-[10px] text-emerald-600">published</span>}</div>
                            </button>
                        ))}
                    </div>
                    {selected && (
                        <div className="rounded-xl border border-gray-100 dark:border-slate-800 p-5">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                                <div className="flex items-center gap-3"><StratIcon s={selected} size={22} /><div className="text-xl font-bold">{selected.name}</div></div>
                                <div className="flex items-center gap-2"><KindBadge kind={selected.kind} /><Actions id={selected.id} router={router} /></div>
                            </div>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-2xl">{selected.summary}</p>
                            <div className="grid grid-cols-3 gap-3 mt-5">
                                {[['Return', pct(selected.pnl_percent), (num(selected.pnl_percent) ?? 0) >= 0],
                                ['Sharpe', num(selected.sharpe_ratio)?.toFixed(2) ?? '—', true],
                                ['Win rate', num(selected.win_rate) != null ? `${num(selected.win_rate)!.toFixed(0)}%` : '—', true]].map(([label, val, pos]: any) => (
                                    <div key={label} className="rounded-xl bg-gray-50 dark:bg-slate-900 p-3">
                                        <div className="text-xs text-gray-500">{label}</div>
                                        <div className={`text-lg font-bold font-mono ${pos ? '' : 'text-red-500'}`}>{val}</div>
                                    </div>
                                ))}
                            </div>
                            <div className="flex gap-2 mt-5">
                                <button onClick={() => router.push(`/strategies/${selected.id}`)} className="px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white">Open Workspace</button>
                                <button onClick={() => router.push(`/strategies/${selected.id}/backtest`)} className="px-4 py-2 text-sm font-semibold rounded-lg border border-gray-200 dark:border-slate-700 inline-flex items-center gap-1.5"><Play size={15} /> Backtest</button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
