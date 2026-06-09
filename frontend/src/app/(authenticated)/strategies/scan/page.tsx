'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import DashboardLayout from '@/components/DashboardLayout';
import { CompanySelect } from '@/components/CompanySelect';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageLoader } from '@/components/ui/StockLoader';
import { toast } from 'sonner';
import { Radar, Play, Trophy, Shield, Settings2, ArrowUpDown } from 'lucide-react';

const ALL_TF = ['1y', '3y', '5y', 'max'] as const;

const fmtPct = (v: any) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${Number(v).toFixed(0)}%`);
const posColor = (v: any) => (v == null ? 'text-gray-400' : v >= 0 ? 'text-emerald-600' : 'text-red-500');

function KindBadge({ kind }: { kind?: string }) {
    const composed = kind === 'composed';
    return <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${composed
        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>{composed ? 'Composed' : 'Custom'}</span>;
}

function Highlight({ title, icon: Icon, row, accent, router }: { title: string; icon: any; row: any; accent: string; router: any }) {
    if (!row) return null;
    return (
        <Card className="border-gray-100 dark:border-slate-800">
            <CardContent className="p-4">
                <div className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${accent}`}><Icon size={14} /> {title}</div>
                <button onClick={() => router.push(`/strategies/${row.id}/${row.kind === 'custom' ? 'editor' : 'builder'}`)}
                    className="text-lg font-bold hover:text-blue-600 mt-1 block text-left">{row.name}</button>
                <div className="flex items-center gap-3 mt-1 text-sm">
                    <span className={`font-mono ${posColor(row.return_pct)}`}>{fmtPct(row.return_pct)}</span>
                    <span className="text-gray-400">on {row.timeframe}</span>
                    <span className="text-gray-500">Sharpe {row.sharpe} · Sortino {row.sortino}</span>
                    <span className="text-gray-500">{row.num_trades} trades</span>
                </div>
            </CardContent>
        </Card>
    );
}

export default function StrategyScanPage() {
    const router = useRouter();
    const [symbol, setSymbol] = useState('NABIL');
    const [tfs, setTfs] = useState<string[]>([...ALL_TF]);
    const [optimize, setOptimize] = useState(false);
    const [loading, setLoading] = useState(false);
    const [res, setRes] = useState<any>(null);

    const toggleTf = (t: string) => setTfs((s) => s.includes(t) ? s.filter((x) => x !== t) : [...s, t]);

    const run = async () => {
        if (!symbol) return toast.error('Pick a symbol');
        if (!tfs.length) return toast.error('Pick at least one timeframe');
        setLoading(true); setRes(null);
        try {
            const r = await api.get('/api/stocks/strategies/scan/', {
                params: { symbol, timeframes: tfs.join(','), optimize: optimize ? 1 : 0 },
            });
            setRes(r.data);
        } catch (e: any) { toast.error(e?.response?.data?.error || 'Scan failed'); }
        finally { setLoading(false); }
    };

    const COLS: { label: string; get: (r: any) => any; fmt: (v: any) => string; color?: (v: any) => string }[] = [
        { label: 'Return', get: (r) => r.return_pct, fmt: fmtPct, color: posColor },
        { label: 'vs B&H', get: (r) => r.excess_pct, fmt: fmtPct, color: posColor },
        { label: 'Sharpe', get: (r) => r.sharpe, fmt: (v) => `${v}` },
        { label: 'Sortino', get: (r) => r.sortino, fmt: (v) => `${v}` },
        { label: 'Max DD', get: (r) => r.max_drawdown_pct, fmt: (v) => `${v}%`, color: () => 'text-red-500' },
        { label: 'Win', get: (r) => r.win_rate_pct, fmt: (v) => `${v}%` },
        { label: 'Trades', get: (r) => r.num_trades, fmt: (v) => `${v}` },
    ];

    return (
        <DashboardLayout showBack title="Strategy Scan">
            <div className="w-full px-4 sm:px-6 py-4 space-y-4">
                <div className="flex items-center gap-2 text-2xl font-bold"><Radar className="text-blue-600" /> Find the best strategy for a symbol</div>
                <p className="text-sm text-gray-500">Backtests every strategy on one stock across timeframes and ranks them.</p>

                {/* Controls */}
                <Card className="border-gray-100 dark:border-slate-800">
                    <CardContent className="p-4 flex flex-wrap items-end gap-4">
                        <div className="w-56"><label className="text-[11px] text-gray-500 block mb-1">Symbol</label><CompanySelect value={symbol} onChange={setSymbol} /></div>
                        <div>
                            <label className="text-[11px] text-gray-500 block mb-1">Timeframes</label>
                            <div className="flex gap-1">
                                {ALL_TF.map((t) => (
                                    <button key={t} onClick={() => toggleTf(t)}
                                        className={`px-2.5 py-1.5 text-xs rounded-lg uppercase ${tfs.includes(t) ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300'}`}>{t}</button>
                                ))}
                            </div>
                        </div>
                        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                            <input type="checkbox" checked={optimize} onChange={(e) => setOptimize(e.target.checked)} className="rounded" />
                            Optimize parameters <span className="text-xs text-amber-600">(slower)</span>
                        </label>
                        <Button onClick={run} disabled={loading} className="gap-1.5 ml-auto"><Play size={16} /> {loading ? 'Scanning…' : 'Run scan'}</Button>
                    </CardContent>
                </Card>

                {loading ? (
                    <PageLoader text={optimize ? 'Optimizing & scanning every strategy… this can take a minute.' : 'Backtesting every strategy across timeframes…'} />
                ) : res ? (
                    <>
                        <div className="text-sm text-gray-600 dark:text-gray-300">
                            Scanned <b>{res.count}</b> strategies on <b>{res.symbol}</b> — <b>{res.beating_bh}</b> beat buy-and-hold.
                            <span className="text-gray-400 ml-2">Buy&amp;Hold: {Object.entries(res.buy_hold_by_tf || {}).map(([k, v]: any) => `${k} ${fmtPct(v)}`).join(' · ')}</span>
                        </div>
                        <div className="grid md:grid-cols-2 gap-3">
                            <Highlight title="Best by return" icon={Trophy} row={res.best} accent="text-amber-600" router={router} />
                            <Highlight title="Best risk-adjusted" icon={Shield} row={res.best_risk_adjusted} accent="text-emerald-600" router={router} />
                        </div>

                        <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-slate-800">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 dark:bg-slate-900 text-xs text-gray-500">
                                    <tr>
                                        <th className="text-left px-3 py-2 w-8">#</th>
                                        <th className="text-left px-2">Strategy</th>
                                        <th className="px-2">TF</th>
                                        {COLS.map((c) => <th key={c.label} className="text-right px-3 whitespace-nowrap">{c.label}</th>)}
                                        <th className="px-2"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {res.results.map((r: any, i: number) => (
                                        <tr key={r.id} onClick={() => router.push(`/strategies/${r.id}/${r.kind === 'custom' ? 'editor' : 'builder'}`)}
                                            className={`border-t border-gray-100 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-900/60 cursor-pointer ${r.beats_bh ? '' : 'opacity-70'}`}>
                                            <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                                            <td className="px-2"><div className="flex items-center gap-2"><span className="font-medium">{r.name}</span><KindBadge kind={r.kind} />{r.tuned_params && <span className="text-[10px] text-purple-600" title="parameters tuned">tuned</span>}</div></td>
                                            <td className="text-center px-2 uppercase text-xs text-gray-500">{r.timeframe}</td>
                                            {COLS.map((c) => { const v = c.get(r); return <td key={c.label} className={`text-right px-3 font-mono ${c.color ? c.color(v) : 'text-gray-600 dark:text-slate-300'}`}>{c.fmt(v)}</td>; })}
                                            <td className="px-2 text-center" onClick={(e) => { e.stopPropagation(); router.push(`/strategies/${r.id}/backtest?symbol=${res.symbol}&period=${r.timeframe}`); }}>
                                                <Play size={14} className="text-blue-600 inline" />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {res.errors?.length > 0 && <div className="text-xs text-gray-400">{res.errors.length} strategies couldn’t run on {res.symbol}.</div>}
                    </>
                ) : (
                    <div className="text-center text-gray-400 py-16"><Radar size={36} className="mx-auto mb-2 text-gray-300" /> Pick a symbol and run the scan.</div>
                )}
            </div>
        </DashboardLayout>
    );
}
