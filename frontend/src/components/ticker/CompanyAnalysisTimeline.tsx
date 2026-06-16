'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { format } from 'date-fns';
import { MarkdownComponents } from '@/components/chat/markdownComponents';
import { StanceBadge, AspectBadge } from '@/components/ticker/stanceBadge';

export interface AnalysisEntry {
    summary: string;
    stance: string;
    aspect: string;
    change_note: string;
    created_at: string;
}

function TimelineRow({ entry }: { entry: AnalysisEntry }) {
    const [open, setOpen] = useState(false);
    return (
        <li className="border-l-2 border-slate-200 dark:border-slate-700 pl-4 pb-6 relative">
            <span className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-slate-400" />
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">{format(new Date(entry.created_at), 'd MMM yyyy')}</span>
                <StanceBadge stance={entry.stance} />
                <AspectBadge aspect={entry.aspect} />
            </div>
            {entry.change_note && (
                <p className="mt-1 text-sm font-medium text-foreground">{entry.change_note}</p>
            )}
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="mt-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
                {open ? 'Hide detail' : 'Show detail'}
            </button>
            {open && (
                <div className="prose prose-sm max-w-none text-muted-foreground mt-2">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                        {entry.summary}
                    </ReactMarkdown>
                </div>
            )}
        </li>
    );
}

export function CompanyAnalysisTimeline({ entries }: { entries: AnalysisEntry[] }) {
    if (!entries || entries.length === 0) {
        return (
            <p className="text-sm text-muted-foreground py-8">
                No AI analysis yet — discuss this stock in chat to build one.
            </p>
        );
    }
    return (
        <ul className="mt-2">
            {entries.map((entry, i) => (
                <TimelineRow key={`${entry.created_at}-${i}`} entry={entry} />
            ))}
        </ul>
    );
}
