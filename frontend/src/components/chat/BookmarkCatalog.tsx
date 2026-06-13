'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bookmark, ChevronDown, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { savedApi } from '@/lib/api';
import { BookmarkDetailModal } from './BookmarkDetailModal';
import type { SavedAnalysis } from './types';

type GroupBy = 'series' | 'category' | 'tag' | 'date' | 'ticker';

const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
    { value: 'series', label: 'Series' },
    { value: 'category', label: 'Category' },
    { value: 'tag', label: 'Tag' },
    { value: 'date', label: 'Date' },
    { value: 'ticker', label: 'Ticker' },
];

/** Tailwind classes for a verdict badge, color-coded by sentiment. */
function verdictClass(v?: string) {
    const s = (v || '').toUpperCase();
    if (/BUY|ACCUMULATE|BULL/.test(s)) return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';
    if (/SELL|AVOID|REDUCE|BEAR/.test(s)) return 'bg-rose-500/15 text-rose-600 dark:text-rose-400';
    if (/HOLD|WATCH|NEUTRAL/.test(s)) return 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
    return 'bg-muted text-muted-foreground';
}

const PLACEHOLDER_GROUPS = new Set(['Ungrouped', 'Uncategorized', 'Untagged', 'No ticker']);

function monthLabel(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

interface Props {
    /** 'page' = full-width (multi-column cards); 'sidebar' = narrow single column. */
    variant?: 'page' | 'sidebar';
}

/**
 * Shared saved-analysis catalog: search, filter, group, and open a 90% detail
 * popup. Fills its parent's height — wrap it in a height-bounded container.
 */
export function BookmarkCatalog({ variant = 'page' }: Props) {
    const isSidebar = variant === 'sidebar';
    const [items, setItems] = useState<SavedAnalysis[]>([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState('');
    const [tag, setTag] = useState('');
    const [groupBy, setGroupBy] = useState<GroupBy>('series');
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
    const [activeId, setActiveId] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        savedApi
            .list()
            .then((res) => {
                if (cancelled) return;
                const data = res.data as SavedAnalysis[] | { results?: SavedAnalysis[] };
                setItems(Array.isArray(data) ? data : data?.results || []);
            })
            .catch(() => !cancelled && setItems([]))
            .finally(() => !cancelled && setLoading(false));
        return () => {
            cancelled = true;
        };
    }, []);

    const categories = useMemo(
        () => Array.from(new Set(items.map((i) => i.category).filter(Boolean))).sort(),
        [items],
    );
    const tags = useMemo(
        () => Array.from(new Set(items.flatMap((i) => i.tags || []))).sort(),
        [items],
    );

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return items.filter((it) => {
            if (category && it.category !== category) return false;
            if (tag && !(it.tags || []).includes(tag)) return false;
            if (!q) return true;
            const hay = [
                it.title,
                it.one_liner,
                it.category,
                ...(it.tickers || []),
                ...(it.tags || []),
            ]
                .join(' ')
                .toLowerCase();
            return hay.includes(q);
        });
    }, [items, query, category, tag]);

    const groups = useMemo(() => {
        const map = new Map<string, SavedAnalysis[]>();
        const push = (key: string, it: SavedAnalysis) => {
            const list = map.get(key) ?? [];
            list.push(it);
            map.set(key, list);
        };
        for (const it of filtered) {
            if (groupBy === 'series') push(it.series_key || 'Ungrouped', it);
            else if (groupBy === 'category') push(it.category || 'Uncategorized', it);
            else if (groupBy === 'date') push(monthLabel(it.created_at), it);
            else if (groupBy === 'tag') {
                const ts = it.tags || [];
                if (ts.length === 0) push('Untagged', it);
                else ts.forEach((t) => push(t, it));
            } else if (groupBy === 'ticker') {
                const ts = it.tickers || [];
                if (ts.length === 0) push('No ticker', it);
                else ts.forEach((t) => push(t, it));
            }
        }
        const entries = Array.from(map.entries());
        entries.sort(([ak, al], [bk, bl]) => {
            const ap = PLACEHOLDER_GROUPS.has(ak) ? 1 : 0;
            const bp = PLACEHOLDER_GROUPS.has(bk) ? 1 : 0;
            if (ap !== bp) return ap - bp; // placeholders last
            if (groupBy === 'date') {
                // newest month first
                return new Date(bl[0].created_at).getTime() - new Date(al[0].created_at).getTime();
            }
            if (bl.length !== al.length) return bl.length - al.length; // larger groups first
            return ak.localeCompare(bk);
        });
        return entries;
    }, [filtered, groupBy]);

    const toggleGroup = (key: string) =>
        setCollapsed((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });

    const clearFilters = () => {
        setQuery('');
        setCategory('');
        setTag('');
    };
    const hasFilters = !!(query || category || tag);

    const handleDeleted = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));
    const handleUpdated = (updated: SavedAnalysis) =>
        setItems((prev) => prev.map((i) => (i.id === updated.id ? { ...i, ...updated } : i)));

    const selectClass =
        'h-8 rounded-md border border-border bg-card px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500/40';

    return (
        <div className="flex h-full min-h-0 flex-col">
            {/* Toolbar */}
            <div className="shrink-0 space-y-2 border-b border-border p-3">
                <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search saved analyses…"
                        className="h-8 w-full rounded-md border border-border bg-card pl-8 pr-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
                    />
                </div>
                <div className={cn('flex flex-wrap items-center gap-2', isSidebar && 'gap-1.5')}>
                    <label className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        Group
                        <select
                            value={groupBy}
                            onChange={(e) => setGroupBy(e.target.value as GroupBy)}
                            className={selectClass}
                        >
                            {GROUP_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>
                                    {o.label}
                                </option>
                            ))}
                        </select>
                    </label>
                    <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className={selectClass}
                    >
                        <option value="">All categories</option>
                        {categories.map((c) => (
                            <option key={c} value={c}>
                                {c}
                            </option>
                        ))}
                    </select>
                    <select value={tag} onChange={(e) => setTag(e.target.value)} className={selectClass}>
                        <option value="">All tags</option>
                        {tags.map((t) => (
                            <option key={t} value={t}>
                                #{t}
                            </option>
                        ))}
                    </select>
                    {hasFilters && (
                        <button
                            onClick={clearFilters}
                            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                        >
                            <X className="h-3 w-3" /> Clear
                        </button>
                    )}
                    <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
                        {filtered.length}
                    </span>
                </div>
            </div>

            {/* Grouped list */}
            <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar p-3">
                {loading ? (
                    <p className="px-1 py-2 text-xs text-muted-foreground">Loading…</p>
                ) : groups.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                        <Bookmark className="h-6 w-6 text-muted-foreground/50" />
                        <p className="text-sm text-muted-foreground">
                            {hasFilters ? 'No matches for these filters.' : 'No saved analyses yet.'}
                        </p>
                        {hasFilters && (
                            <button
                                onClick={clearFilters}
                                className="text-xs font-medium text-emerald-500 hover:underline"
                            >
                                Clear filters
                            </button>
                        )}
                    </div>
                ) : (
                    groups.map(([key, list]) => {
                        const isCollapsed = collapsed.has(key);
                        return (
                            <section key={key} className="mb-4 last:mb-0">
                                <button
                                    onClick={() => toggleGroup(key)}
                                    className="mb-1.5 flex w-full items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
                                >
                                    <ChevronDown
                                        className={cn(
                                            'h-3.5 w-3.5 transition-transform',
                                            isCollapsed && '-rotate-90',
                                        )}
                                    />
                                    <span className="truncate">{key}</span>
                                    <span className="text-muted-foreground/60">{list.length}</span>
                                </button>
                                {!isCollapsed && (
                                    <div
                                        className={cn(
                                            'grid gap-2',
                                            isSidebar
                                                ? 'grid-cols-1'
                                                : 'sm:grid-cols-2 xl:grid-cols-3',
                                        )}
                                    >
                                        {list.map((it) => (
                                            <button
                                                key={`${key}-${it.id}`}
                                                onClick={() => setActiveId(it.id)}
                                                className="group flex flex-col rounded-lg border border-border bg-card p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-500/50 hover:shadow-md"
                                            >
                                                <div className="flex items-baseline justify-between gap-2">
                                                    <span className="line-clamp-1 font-medium text-foreground group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
                                                        {it.title}
                                                    </span>
                                                    <span className="shrink-0 text-[10px] text-muted-foreground">
                                                        {new Date(it.created_at).toLocaleDateString(undefined, {
                                                            month: 'short',
                                                            day: 'numeric',
                                                        })}
                                                    </span>
                                                </div>
                                                {it.one_liner && (
                                                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                                                        {it.one_liner}
                                                    </p>
                                                )}
                                                <div className="mt-2 flex flex-wrap items-center gap-1 text-[10px]">
                                                    {it.tickers.map((t) => (
                                                        <span
                                                            key={t}
                                                            className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-medium text-emerald-600 dark:text-emerald-400"
                                                        >
                                                            {t}
                                                        </span>
                                                    ))}
                                                    {it.verdict && (
                                                        <span
                                                            className={cn(
                                                                'rounded px-1.5 py-0.5 font-medium',
                                                                verdictClass(it.verdict),
                                                            )}
                                                        >
                                                            {it.verdict}
                                                        </span>
                                                    )}
                                                    {groupBy !== 'tag' &&
                                                        (it.tags || []).slice(0, 2).map((t) => (
                                                            <span
                                                                key={t}
                                                                className="rounded-full border border-border px-1.5 py-0.5 text-muted-foreground"
                                                            >
                                                                #{t}
                                                            </span>
                                                        ))}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </section>
                        );
                    })
                )}
            </div>

            {activeId && (
                <BookmarkDetailModal
                    key={activeId}
                    id={activeId}
                    onClose={() => setActiveId(null)}
                    onDeleted={handleDeleted}
                    onUpdated={handleUpdated}
                />
            )}
        </div>
    );
}
