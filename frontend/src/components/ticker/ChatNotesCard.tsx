'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { formatDistanceToNow } from 'date-fns';
import { MarkdownComponents } from '@/components/chat/markdownComponents';
import { Card } from '@/components/ui/card';

export interface ChatNotes {
    symbol: string;
    summary: string;
    updated_at: string;
}

export function ChatNotesCard({ notes }: { notes: ChatNotes | null }) {
    if (!notes || !notes.summary?.trim()) return null;

    return (
        <Card className="p-6 space-y-3">
            <div className="flex items-baseline justify-between gap-4">
                <h3 className="text-base font-medium text-foreground">
                    Your AI notes on {notes.symbol}
                </h3>
                <span className="text-xs text-muted-foreground">
                    Updated {formatDistanceToNow(new Date(notes.updated_at), { addSuffix: true })}
                </span>
            </div>
            <div className="prose prose-sm max-w-none text-muted-foreground">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                    {notes.summary}
                </ReactMarkdown>
            </div>
        </Card>
    );
}
