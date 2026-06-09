'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { Blocks, Code, Play, Activity, LayoutDashboard, GitCompare } from 'lucide-react';

type Tab = 'overview' | 'build' | 'code' | 'backtest' | 'optimize';

const TABS: { key: Tab; label: string; icon: any; href: (id: string) => string }[] = [
    { key: 'overview', label: 'Overview', icon: LayoutDashboard, href: (id) => `/strategies/${id}` },
    { key: 'build', label: 'Build', icon: Blocks, href: (id) => `/strategies/${id}/builder` },
    { key: 'code', label: 'Code', icon: Code, href: (id) => `/strategies/${id}/editor` },
    { key: 'backtest', label: 'Backtest', icon: Play, href: (id) => `/strategies/${id}/backtest` },
    { key: 'optimize', label: 'Optimize', icon: Activity, href: (id) => `/strategies/${id}/optimize` },
];

/**
 * Persistent workspace header + tab bar shared across a strategy's sub-pages, so
 * Build / Code / Backtest / Optimize feel like one workspace. Fetches the strategy's
 * lightweight identity (name, kind, summary, published) itself.
 */
export function StrategyWorkspaceNav({ strategyId, active }: { strategyId: string; active: Tab }) {
    const [s, setS] = useState<any>(null);
    useEffect(() => {
        api.get(`/api/stocks/strategies/${strategyId}/`).then((r) => setS(r.data)).catch(() => { });
    }, [strategyId]);

    const composed = s?.kind === 'composed';
    const published = (s?.published_experiments?.length || 0) > 0;

    return (
        <div className="mb-5 border-b border-gray-100 dark:border-slate-800 pb-2">
            <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-lg font-bold truncate">{s?.name || 'Strategy'}</span>
                        {s && (
                            <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${composed
                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                                {composed ? 'Composed' : 'Custom'}
                            </span>
                        )}
                        {published && <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">Published</span>}
                    </div>
                    {s?.summary && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 max-w-3xl">{s.summary}</p>}
                </div>
                <Link href="/strategies/compare" className="text-xs text-blue-600 inline-flex items-center gap-1 shrink-0 mt-1">
                    <GitCompare size={13} /> Compare
                </Link>
            </div>
            <div className="flex gap-1 overflow-x-auto">
                {TABS.map((t) => {
                    const isActive = t.key === active;
                    // Code tab is the natural home for Custom strategies; Build for Composed.
                    const dimmed = (t.key === 'build' && s && !composed);
                    return (
                        <Link key={t.key} href={t.href(strategyId)}
                            className={`px-3 py-2 text-sm font-medium rounded-t-lg flex items-center gap-1.5 whitespace-nowrap border-b-2 transition-colors ${isActive
                                ? 'border-blue-600 text-blue-600'
                                : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'} ${dimmed ? 'opacity-60' : ''}`}>
                            <t.icon size={15} /> {t.label}
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
