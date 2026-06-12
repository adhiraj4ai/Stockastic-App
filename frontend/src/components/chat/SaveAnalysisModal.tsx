'use client';

import { useEffect, useState } from 'react';
import { savedApi } from '@/lib/api';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { SavedAnalysisDraft } from './types';

interface Props {
    sessionId: string;
    onClose: () => void;
    onSaved: () => void;
}

/** Loads an AI-suggested draft for the session, lets the user edit, then saves. */
export function SaveAnalysisModal({ sessionId, onClose, onSaved }: Props) {
    const [draft, setDraft] = useState<SavedAnalysisDraft | null>(null);
    const [tagsText, setTagsText] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;
        savedApi
            .draft(sessionId)
            .then((res) => {
                if (cancelled) return;
                const d = res.data;
                setDraft(d);
                setTagsText((d.tags || []).join(', '));
            })
            .catch(() => !cancelled && setError('Could not build a draft. Try again.'))
            .finally(() => !cancelled && setLoading(false));
        return () => {
            cancelled = true;
        };
    }, [sessionId]);

    const set = <K extends keyof SavedAnalysisDraft>(k: K, v: SavedAnalysisDraft[K]) =>
        setDraft((d) => (d ? { ...d, [k]: v } : d));

    const save = async () => {
        if (!draft) return;
        setSaving(true);
        setError('');
        try {
            await savedApi.create({
                ...draft,
                tags: tagsText
                    .split(',')
                    .map((t) => t.trim())
                    .filter(Boolean),
            });
            onSaved();
            onClose();
        } catch {
            setError('Save failed. Try again.');
            setSaving(false);
        }
    };

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Save analysis</DialogTitle>
                </DialogHeader>

                {loading && (
                    <p className="text-sm text-muted-foreground">Summarizing this thread…</p>
                )}
                {error && <p className="text-sm text-destructive">{error}</p>}

                {draft && (
                    <div className="space-y-3">
                        {draft.degraded && (
                            <p className="rounded bg-amber-500/15 px-2 py-1 text-xs text-amber-600 dark:text-amber-300">
                                Summary unavailable — saved a raw draft you can edit.
                            </p>
                        )}
                        <div className="space-y-1.5">
                            <Label htmlFor="save-title">Title</Label>
                            <Input
                                id="save-title"
                                value={draft.title}
                                onChange={(e) => set('title', e.target.value)}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="save-one-liner">One-liner</Label>
                            <Input
                                id="save-one-liner"
                                value={draft.one_liner}
                                onChange={(e) => set('one_liner', e.target.value)}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="save-category">Category</Label>
                            <Input
                                id="save-category"
                                value={draft.category}
                                onChange={(e) => set('category', e.target.value)}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="save-tags">Tags (comma-separated)</Label>
                            <Input
                                id="save-tags"
                                value={tagsText}
                                onChange={(e) => setTagsText(e.target.value)}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="save-series">Series</Label>
                            <Input
                                id="save-series"
                                value={draft.series_key}
                                onChange={(e) => set('series_key', e.target.value)}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="save-summary">Summary</Label>
                            <Textarea
                                id="save-summary"
                                className="h-40 font-mono text-xs"
                                value={draft.summary}
                                onChange={(e) => set('summary', e.target.value)}
                            />
                        </div>
                    </div>
                )}

                <DialogFooter>
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={save} disabled={!draft || saving}>
                        {saving ? 'Saving…' : 'Save'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
