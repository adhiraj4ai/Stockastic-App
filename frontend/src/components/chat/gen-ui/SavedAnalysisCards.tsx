/**
 * Cards for the chat agent's saved-analysis recall tools.
 *
 *  - SavedAnalysesCard  (type="saved_analyses")  — catalog of matches
 *  - SavedAnalysisCard  (type="saved_analysis")  — frozen detail + series
 */

import React from 'react';

interface CatalogItem {
    id: string;
    title: string;
    category?: string;
    tags?: string[];
    tickers?: string[];
    series_key?: string;
    verdict?: string;
    date?: string;
    one_liner?: string;
}

/** type="saved_analyses" — compact catalog of matched saved analyses. */
export function SavedAnalysesCard({ items }: { items: CatalogItem[] }) {
    if (!items?.length) {
        return (
            <div className="surface px-4 py-3 text-sm text-muted-foreground">
                No saved analyses found.
            </div>
        );
    }
    return (
        <div className="surface overflow-hidden text-sm">
            <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
                <span className="font-medium text-foreground">Saved analyses</span>
                <span className="text-[11px] text-muted-foreground">{items.length}</span>
            </div>
            <ul className="divide-y divide-border">
                {items.map((it) => (
                    <li key={it.id} className="px-4 py-2.5">
                        <div className="flex items-baseline justify-between gap-2">
                            <span className="font-medium text-foreground">{it.title}</span>
                            {it.date && <span className="text-[10px] text-muted-foreground">{it.date}</span>}
                        </div>
                        {it.one_liner && <p className="mt-0.5 text-[12px] text-muted-foreground">{it.one_liner}</p>}
                        <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px]">
                            {(it.tickers || []).map((t) => (
                                <span key={t} className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-500">{t}</span>
                            ))}
                            {it.verdict && <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">{it.verdict}</span>}
                            {it.series_key && <span className="text-muted-foreground">· {it.series_key}</span>}
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}

interface SeriesItem { id: string; title: string; date?: string; verdict?: string; one_liner?: string; }

interface DetailData {
    title: string;
    summary?: string;
    category?: string;
    tags?: string[];
    tickers?: string[];
    series_key?: string;
    verdict?: string;
    date?: string;
    transcript?: string;
    series?: SeriesItem[];
}

/** type="saved_analysis" — full frozen analysis + series timeline. */
export function SavedAnalysisCard(data: DetailData) {
    const transcriptHref =
        data.transcript && data.transcript.startsWith('/chat') ? data.transcript : null;
    return (
        <div className="surface overflow-hidden text-sm">
            <div className="px-4 py-2.5 border-b border-border">
                <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium text-foreground">{data.title}</span>
                    {data.date && <span className="text-[10px] text-muted-foreground">{data.date}</span>}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px]">
                    {(data.tickers || []).map((t) => (
                        <span key={t} className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-500">{t}</span>
                    ))}
                    {data.verdict && <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">{data.verdict}</span>}
                    {data.category && <span className="text-muted-foreground">{data.category}</span>}
                </div>
            </div>
            {data.summary && (
                <div className="px-4 py-3 whitespace-pre-wrap text-[12px] text-foreground/90">{data.summary}</div>
            )}
            {data.series && data.series.length > 1 && (
                <div className="px-4 py-2.5 border-t border-border">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Series: {data.series_key}
                    </div>
                    <ul className="space-y-1">
                        {data.series.map((s) => (
                            <li key={s.id} className="text-[11px] text-muted-foreground">
                                {s.date} — {s.title} {s.verdict ? `(${s.verdict})` : ''}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {transcriptHref && (
                <div className="px-4 py-2 border-t border-border">
                    <a href={transcriptHref} className="text-[11px] text-emerald-500 hover:underline">open transcript →</a>
                </div>
            )}
        </div>
    );
}
