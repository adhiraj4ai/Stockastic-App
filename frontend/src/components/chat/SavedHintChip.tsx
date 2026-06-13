'use client';

import { useEffect, useRef, useState } from 'react';
import { Bookmark, X } from 'lucide-react';
import { savedApi } from '@/lib/api';
import type { SavedAnalysis } from './types';

interface Props {
    text: string;
    onAttach: (sa: SavedAnalysis) => void;
}

const MIN_CHARS = 8;
const DEBOUNCE_MS = 300;

/** As the user types, surface a related saved analysis. Click to attach it. */
export function SavedHintChip({ text, onAttach }: Props) {
    const [hint, setHint] = useState<SavedAnalysis | null>(null);
    const [dismissed, setDismissed] = useState('');
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (timer.current) clearTimeout(timer.current);
        if (text.trim().length < MIN_CHARS) {
            // Clear asynchronously so we never call setState synchronously in the effect.
            timer.current = setTimeout(() => setHint(null), 0);
            return () => {
                if (timer.current) clearTimeout(timer.current);
            };
        }
        timer.current = setTimeout(() => {
            savedApi
                .suggest(text)
                .then((res) => {
                    const rows = res.data as SavedAnalysis[] | { results?: SavedAnalysis[] };
                    const list = Array.isArray(rows) ? rows : rows?.results || [];
                    setHint(list[0] ?? null);
                })
                .catch(() => setHint(null));
        }, DEBOUNCE_MS);
        return () => {
            if (timer.current) clearTimeout(timer.current);
        };
    }, [text]);

    if (!hint || hint.id === dismissed) return null;

    return (
        <div className="mb-1 flex items-center gap-2 rounded-md bg-emerald-500/10 px-2 py-1 text-xs text-emerald-500">
            <button
                type="button"
                className="flex flex-1 items-center gap-1.5 truncate text-left"
                onClick={() => onAttach(hint)}
                title={hint.one_liner}
            >
                <Bookmark size={12} className="shrink-0" />
                <span className="truncate">
                    Related saved analysis: <span className="font-medium">{hint.title}</span>
                </span>
            </button>
            <button
                type="button"
                className="shrink-0 text-emerald-500 hover:opacity-70"
                onClick={() => setDismissed(hint.id)}
                aria-label="Dismiss suggestion"
            >
                <X size={12} />
            </button>
        </div>
    );
}
