'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
    ArrowRight,
    Loader2,
    Minus,
    Pencil,
    Target,
    TrendingDown,
    TrendingUp,
    Trash2,
    X,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { MarkdownComponents } from './markdownComponents';
import { savedApi } from '@/lib/api';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { SavedAnalysis } from './types';

interface Props {
    /** Id of the saved analysis to view. The full record (incl. summary) is fetched on open. */
    id: string;
    onClose: () => void;
    /** Called after a successful delete so the catalog can drop the row. */
    onDeleted: (id: string) => void;
    /** Called after a successful edit so the catalog can refresh the row. */
    onUpdated?: (item: SavedAnalysis) => void;
}

interface Draft {
    title: string;
    one_liner: string;
    category: string;
    series_key: string;
    verdict: string;
    summary: string;
    tags: string; // comma-separated in the editor
    tickers: string; // comma-separated in the editor
}

const splitList = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

/** Verdict icon + badge classes — matches the badge styling used in BookmarkCatalog. */
function verdictTone(v?: string) {
    const s = (v || '').toUpperCase();
    if (/BUY|ACCUMULATE|BULL|LONG/.test(s))
        return { Icon: TrendingUp, badge: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' };
    if (/SELL|AVOID|REDUCE|BEAR|SHORT/.test(s))
        return { Icon: TrendingDown, badge: 'bg-rose-500/15 text-rose-600 dark:text-rose-400' };
    if (/HOLD|WATCH|NEUTRAL/.test(s))
        return { Icon: Minus, badge: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' };
    return { Icon: Target, badge: 'bg-muted text-muted-foreground' };
}

const LABEL = 'mb-2 text-xs font-semibold text-muted-foreground';
const INPUT =
    'w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500/40';

/** Full-context viewer for one saved analysis, shown in a 90% popup, with view/edit/delete. */
export function BookmarkDetailModal({ id, onClose, onDeleted, onUpdated }: Props) {
    const [item, setItem] = useState<SavedAnalysis | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [deleting, setDeleting] = useState(false);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [saving, setSaving] = useState(false);
    const [view, setView] = useState<'summary' | 'original'>('summary');

    // The parent mounts this with key={id}, so each bookmark gets a fresh
    // component instance — initial state (loading=true) needs no synchronous reset here.
    useEffect(() => {
        let cancelled = false;
        savedApi
            .get(id)
            .then((res) => !cancelled && setItem(res.data))
            .catch(() => !cancelled && setError('Could not load this bookmark.'))
            .finally(() => !cancelled && setLoading(false));
        return () => {
            cancelled = true;
        };
    }, [id]);

    const remove = async () => {
        if (!confirm('Delete this saved analysis? This cannot be undone.')) return;
        setDeleting(true);
        setError('');
        try {
            await savedApi.remove(id);
            onDeleted(id);
            onClose();
        } catch {
            setError('Delete failed. Try again.');
            setDeleting(false);
        }
    };

    const startEdit = () => {
        if (!item) return;
        setDraft({
            title: item.title,
            one_liner: item.one_liner || '',
            category: item.category || '',
            series_key: item.series_key || '',
            verdict: item.verdict || '',
            summary: item.summary || '',
            tags: (item.tags || []).join(', '),
            tickers: (item.tickers || []).join(', '),
        });
        setError('');
        setEditing(true);
    };

    const cancelEdit = () => {
        setEditing(false);
        setDraft(null);
        setError('');
    };

    const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
        setDraft((d) => (d ? { ...d, [k]: v } : d));

    const saveEdit = async () => {
        if (!draft) return;
        setSaving(true);
        setError('');
        try {
            const res = await savedApi.update(id, {
                title: draft.title.trim(),
                one_liner: draft.one_liner.trim(),
                category: draft.category.trim(),
                series_key: draft.series_key.trim(),
                verdict: draft.verdict.trim(),
                summary: draft.summary,
                tags: splitList(draft.tags),
                tickers: splitList(draft.tickers).map((t) => t.toUpperCase()),
            });
            setItem(res.data);
            onUpdated?.(res.data);
            setEditing(false);
            setDraft(null);
        } catch {
            setError('Save failed. Try again.');
        } finally {
            setSaving(false);
        }
    };

    const structuredEntries =
        item?.structured && typeof item.structured === 'object'
            ? Object.entries(item.structured as Record<string, unknown>)
            : [];

    const { Icon: ToneIcon, badge } = verdictTone(editing ? draft?.verdict : item?.verdict);
    const hasOriginal = !!item?.source_answer;
    const showOriginal = view === 'original' && hasOriginal && !editing;

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent
                showCloseButton={false}
                className="flex h-[90vh] w-[90vw] max-w-[90vw] flex-col gap-0 overflow-hidden rounded-xl border-border p-0 shadow-xl sm:max-w-[90vw]"
            >
                <DialogDescription className="sr-only">Saved analysis details</DialogDescription>

                {/* Header */}
                <DialogHeader className="shrink-0 border-b border-border px-7 pb-5 pt-6 text-left">
                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                {editing && draft ? (
                                    <>
                                        <input
                                            value={draft.category}
                                            onChange={(e) => set('category', e.target.value)}
                                            placeholder="Category"
                                            className="w-40 rounded border border-border bg-card px-1.5 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
                                        />
                                        <input
                                            value={draft.series_key}
                                            onChange={(e) => set('series_key', e.target.value)}
                                            placeholder="Series"
                                            className="w-56 rounded border border-border bg-card px-1.5 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
                                        />
                                    </>
                                ) : (
                                    <>
                                        {item?.category && <span>{item.category}</span>}
                                        {item?.category && item?.series_key && (
                                            <span className="text-muted-foreground/40">·</span>
                                        )}
                                        {item?.series_key && <span className="truncate">{item.series_key}</span>}
                                    </>
                                )}
                            </div>

                            {editing && draft ? (
                                <input
                                    value={draft.title}
                                    onChange={(e) => set('title', e.target.value)}
                                    placeholder="Title"
                                    className="mt-2 w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-xl font-semibold tracking-tight text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
                                />
                            ) : (
                                <DialogTitle className="mt-1.5 text-2xl font-semibold leading-tight tracking-tight text-foreground">
                                    {item?.title || (loading ? 'Loading…' : 'Saved analysis')}
                                </DialogTitle>
                            )}

                            {editing && draft ? (
                                <input
                                    value={draft.one_liner}
                                    onChange={(e) => set('one_liner', e.target.value)}
                                    placeholder="One-liner"
                                    className="mt-2 w-full max-w-2xl rounded-md border border-border bg-card px-2.5 py-1.5 text-sm text-muted-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
                                />
                            ) : (
                                item?.one_liner && (
                                    <p className="mt-2 max-w-2xl text-[15px] leading-snug text-muted-foreground">
                                        {item.one_liner}
                                    </p>
                                )
                            )}
                        </div>

                        <div className="flex shrink-0 flex-col items-end gap-3">
                            <button
                                onClick={onClose}
                                aria-label="Close"
                                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                            >
                                <X className="h-4 w-4" />
                            </button>
                            {editing && draft ? (
                                <input
                                    value={draft.verdict}
                                    onChange={(e) => set('verdict', e.target.value)}
                                    placeholder="Verdict"
                                    maxLength={16}
                                    className="w-32 rounded-full border border-border bg-card px-3 py-1 text-sm font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
                                />
                            ) : (
                                item?.verdict && (
                                    <span
                                        className={cn(
                                            'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium',
                                            badge,
                                        )}
                                    >
                                        <ToneIcon className="h-3.5 w-3.5" />
                                        {item.verdict}
                                    </span>
                                )
                            )}
                        </div>
                    </div>
                </DialogHeader>

                {/* Body */}
                {!item ? (
                    <div className="flex min-h-0 flex-1 items-center justify-center">
                        {error ? (
                            <p className="text-sm text-destructive">{error}</p>
                        ) : (
                            <div className="flex flex-col items-center gap-3 text-muted-foreground">
                                <Loader2 className="h-5 w-5 animate-spin" />
                                <span className="text-sm">Loading full analysis…</span>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
                        <div className="grid lg:grid-cols-[minmax(0,1fr)_320px]">
                            {/* Reading / editing column */}
                            <article className="px-7 py-6">
                                {/* Summary / Original toggle */}
                                {hasOriginal && !editing && (
                                    <div className="mb-4 inline-flex rounded-lg border border-border bg-card p-0.5 text-sm">
                                        {(['summary', 'original'] as const).map((v) => (
                                            <button
                                                key={v}
                                                onClick={() => setView(v)}
                                                className={cn(
                                                    'rounded-md px-3 py-1 font-medium transition-colors',
                                                    view === v
                                                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                                        : 'text-muted-foreground hover:text-foreground',
                                                )}
                                            >
                                                {v === 'summary' ? 'Summary' : 'Original answer'}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {editing && draft ? (
                                    <>
                                        <p className={LABEL}>Summary</p>
                                        <textarea
                                            value={draft.summary}
                                            onChange={(e) => set('summary', e.target.value)}
                                            placeholder="Markdown summary…"
                                            className="min-h-[320px] w-full max-w-3xl rounded-lg border border-border bg-card p-3 font-mono text-xs leading-relaxed text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
                                        />
                                    </>
                                ) : showOriginal ? (
                                    <div className="max-w-3xl space-y-4">
                                        {item.source_question && (
                                            <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
                                                <p className={LABEL}>You asked</p>
                                                <p className="text-sm text-foreground/90">{item.source_question}</p>
                                            </div>
                                        )}
                                        <div>
                                            <p className={LABEL}>Assistant answer</p>
                                            <div className="text-[15px] leading-relaxed text-foreground/90">
                                                <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                                                    {item.source_answer || ''}
                                                </ReactMarkdown>
                                            </div>
                                        </div>
                                    </div>
                                ) : item.summary ? (
                                    <div className="max-w-3xl text-[15px] leading-relaxed text-foreground/90">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                                            {item.summary}
                                        </ReactMarkdown>
                                    </div>
                                ) : (
                                    <p className="text-sm italic text-muted-foreground">
                                        No summary was captured for this analysis.
                                    </p>
                                )}
                            </article>

                            {/* Metadata rail */}
                            <aside className="space-y-6 self-start border-t border-border bg-muted/20 px-6 py-6 lg:sticky lg:top-0 lg:border-l lg:border-t-0">
                                <section>
                                    <p className={LABEL}>Coverage</p>
                                    {editing && draft ? (
                                        <input
                                            value={draft.tickers}
                                            onChange={(e) => set('tickers', e.target.value)}
                                            placeholder="NABIL, GBIME"
                                            className={INPUT}
                                        />
                                    ) : item.tickers?.length > 0 ? (
                                        <div className="flex flex-wrap gap-1.5">
                                            {item.tickers.map((t) => (
                                                <Link
                                                    key={t}
                                                    href={`/ticker/${t}`}
                                                    className="rounded bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-600 transition-colors hover:bg-emerald-500/25 dark:text-emerald-400"
                                                >
                                                    {t}
                                                </Link>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-muted-foreground">—</p>
                                    )}
                                </section>

                                {structuredEntries.length > 0 && !editing && (
                                    <section>
                                        <p className={LABEL}>Signals</p>
                                        <dl className="divide-y divide-border/70 overflow-hidden rounded-lg border border-border bg-card">
                                            {structuredEntries.map(([k, v]) => (
                                                <div key={k} className="flex items-baseline justify-between gap-3 px-3 py-2">
                                                    <dt className="text-xs text-muted-foreground">{k}</dt>
                                                    <dd className="text-right text-xs font-medium text-foreground/90">
                                                        {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                                                    </dd>
                                                </div>
                                            ))}
                                        </dl>
                                    </section>
                                )}

                                <section>
                                    <p className={LABEL}>Tags</p>
                                    {editing && draft ? (
                                        <input
                                            value={draft.tags}
                                            onChange={(e) => set('tags', e.target.value)}
                                            placeholder="q2, fundamentals"
                                            className={INPUT}
                                        />
                                    ) : item.tags?.length > 0 ? (
                                        <div className="flex flex-wrap gap-1.5">
                                            {item.tags.map((tag) => (
                                                <span
                                                    key={tag}
                                                    className="rounded-full border border-border bg-card px-2 py-0.5 text-xs text-muted-foreground"
                                                >
                                                    #{tag}
                                                </span>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-muted-foreground">—</p>
                                    )}
                                </section>

                                <section>
                                    <p className={LABEL}>Saved</p>
                                    <p className="text-xs text-foreground/80">
                                        {new Date(item.created_at).toLocaleString(undefined, {
                                            dateStyle: 'medium',
                                            timeStyle: 'short',
                                        })}
                                    </p>
                                </section>
                            </aside>
                        </div>
                    </div>
                )}

                {/* Footer */}
                <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border bg-card/40 px-7 py-3.5">
                    {editing ? (
                        <>
                            <span className="text-xs text-muted-foreground">Editing</span>
                            <div className="flex items-center gap-3">
                                {error && <span className="text-xs text-destructive">{error}</span>}
                                <Button variant="ghost" onClick={cancelEdit} disabled={saving}>
                                    Cancel
                                </Button>
                                <Button
                                    onClick={saveEdit}
                                    disabled={saving || !draft?.title.trim()}
                                    className="bg-emerald-600 text-white hover:bg-emerald-600/90"
                                >
                                    {saving ? 'Saving…' : 'Save changes'}
                                </Button>
                            </div>
                        </>
                    ) : (
                        <>
                            <Button
                                variant="ghost"
                                onClick={remove}
                                disabled={deleting || loading}
                                className="text-rose-500 hover:bg-rose-500/10 hover:text-rose-500"
                            >
                                <Trash2 className="mr-1.5 h-4 w-4" />
                                {deleting ? 'Deleting…' : 'Delete'}
                            </Button>
                            <div className="flex items-center gap-3">
                                {error && item && <span className="text-xs text-destructive">{error}</span>}
                                {item?.session && (
                                    <Link
                                        href={`/chat?session=${item.session}`}
                                        className="group inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-emerald-600 transition-colors hover:bg-emerald-500/10 dark:text-emerald-400"
                                    >
                                        Open transcript
                                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                                    </Link>
                                )}
                                <Button variant="ghost" onClick={startEdit} disabled={!item}>
                                    <Pencil className="mr-1.5 h-4 w-4" />
                                    Edit
                                </Button>
                                <Button variant="ghost" onClick={onClose}>
                                    Close
                                </Button>
                            </div>
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
