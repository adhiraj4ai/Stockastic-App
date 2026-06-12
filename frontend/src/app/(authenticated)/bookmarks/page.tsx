'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Bookmark } from 'lucide-react';
import { savedApi } from '@/lib/api';
import { Input } from '@/components/ui/input';
import type { SavedAnalysis } from '@/components/chat/types';

export default function BookmarksPage() {
    const [items, setItems] = useState<SavedAnalysis[]>([]);
    const [ticker, setTicker] = useState('');
    const [category, setCategory] = useState('');

    useEffect(() => {
        const params: Record<string, string> = {};
        if (ticker) params.ticker = ticker.toUpperCase();
        if (category) params.category = category;
        savedApi
            .list(params)
            .then((res) => {
                const data = res.data as SavedAnalysis[] | { results?: SavedAnalysis[] };
                setItems(Array.isArray(data) ? data : data?.results || []);
            })
            .catch(() => setItems([]));
    }, [ticker, category]);

    const grouped = useMemo(() => {
        const map = new Map<string, SavedAnalysis[]>();
        for (const it of items) {
            const key = it.series_key || '(ungrouped)';
            const list = map.get(key) ?? [];
            list.push(it);
            map.set(key, list);
        }
        return Array.from(map.entries());
    }, [items]);

    const categories = useMemo(
        () => Array.from(new Set(items.map((i) => i.category).filter(Boolean))),
        [items],
    );

    return (
        <div className="mx-auto w-full max-w-4xl p-6">
            <div className="mb-4 flex items-center gap-2">
                <Bookmark className="h-5 w-5 text-emerald-500" />
                <h1 className="text-2xl font-semibold text-foreground">Saved analyses</h1>
            </div>

            <div className="mb-6 flex flex-wrap gap-2">
                <Input
                    placeholder="Filter by ticker"
                    className="h-9 w-48 text-sm uppercase"
                    value={ticker}
                    onChange={(e) => setTicker(e.target.value.toUpperCase())}
                />
                <select
                    className="h-9 rounded-md border border-border bg-card px-2 text-sm text-foreground"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                >
                    <option value="">All categories</option>
                    {categories.map((c) => (
                        <option key={c} value={c}>
                            {c}
                        </option>
                    ))}
                </select>
            </div>

            {grouped.map(([series, list]) => (
                <section key={series} className="mb-6">
                    <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        {series}
                    </h2>
                    <ul className="space-y-2">
                        {list.map((it) => (
                            <li
                                key={it.id}
                                className="rounded-lg border border-border bg-card p-3 shadow-sm"
                            >
                                <div className="flex items-baseline justify-between gap-2">
                                    <span className="font-medium text-foreground">{it.title}</span>
                                    <span className="text-xs text-muted-foreground">
                                        {new Date(it.created_at).toLocaleDateString()}
                                    </span>
                                </div>
                                {it.one_liner && (
                                    <p className="mt-1 text-sm text-muted-foreground">{it.one_liner}</p>
                                )}
                                <div className="mt-2 flex flex-wrap items-center gap-1 text-xs">
                                    {it.tickers.map((t) => (
                                        <span
                                            key={t}
                                            className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-500"
                                        >
                                            {t}
                                        </span>
                                    ))}
                                    {it.verdict && (
                                        <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                                            {it.verdict}
                                        </span>
                                    )}
                                    {it.session && (
                                        <Link
                                            href={`/chat?session=${it.session}`}
                                            className="inline-flex items-center gap-0.5 text-emerald-500 hover:underline"
                                        >
                                            open transcript
                                            <ArrowRight className="h-3 w-3" />
                                        </Link>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                </section>
            ))}

            {items.length === 0 && (
                <p className="text-sm text-muted-foreground">No saved analyses yet.</p>
            )}
        </div>
    );
}
