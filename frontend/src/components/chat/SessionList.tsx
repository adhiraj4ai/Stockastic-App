'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Trash2, MessageSquare, Bookmark, ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { savedApi } from '@/lib/api';
import type { ChatSession, SavedAnalysis } from './types';

interface Props {
    sessions: ChatSession[];
    activeId: string | null;
    loading: boolean;
    onNew: () => void;
    onDelete: (id: string) => void;
}

export function SessionList({ sessions, activeId, loading, onNew, onDelete }: Props) {
    const [saved, setSaved] = useState<SavedAnalysis[]>([]);
    const [savedOpen, setSavedOpen] = useState(false);

    useEffect(() => {
        savedApi
            .list()
            .then((res) => {
                const data = res.data as SavedAnalysis[] | { results?: SavedAnalysis[] };
                setSaved(Array.isArray(data) ? data : data?.results || []);
            })
            .catch(() => setSaved([]));
    }, []);

    return (
        <aside className="w-64 shrink-0 border-r border-border bg-sidebar h-full flex flex-col">
            <div className="px-3 py-3 border-b border-border flex items-center justify-between">
                <span className="text-[13px] font-semibold text-foreground">Chats</span>
                <button
                    onClick={onNew}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[12px] font-medium bg-foreground text-background hover:opacity-90 transition-opacity"
                    title="Start new chat"
                >
                    <Plus size={12} />
                    New
                </button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-1">
                <div className="mb-1.5 border-b border-border/60 pb-1.5">
                    <button
                        type="button"
                        onClick={() => setSavedOpen((v) => !v)}
                        className="flex w-full items-center justify-between gap-2 px-2 py-1.5 rounded-md text-[12px] font-medium text-muted-foreground hover:bg-sidebar-accent transition-colors"
                    >
                        <span className="inline-flex items-center gap-2">
                            <Bookmark size={13} className="text-emerald-500 shrink-0" />
                            Saved
                            <span className="text-muted-foreground/70">({saved.length})</span>
                        </span>
                        {savedOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    </button>
                    {savedOpen && (
                        <ul className="mt-0.5 space-y-0.5">
                            {saved.map((s) => (
                                <li key={s.id}>
                                    <Link
                                        href={`/bookmarks?focus=${s.id}`}
                                        className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-sidebar-accent transition-colors"
                                        title={s.one_liner}
                                    >
                                        <Bookmark size={12} className="text-emerald-500 shrink-0" />
                                        <span className="text-[13px] text-foreground truncate">{s.title}</span>
                                    </Link>
                                </li>
                            ))}
                            {saved.length === 0 && (
                                <li className="px-2 py-1.5 text-[12px] text-muted-foreground">
                                    No saved analyses yet
                                </li>
                            )}
                            <li>
                                <Link
                                    href="/bookmarks"
                                    className="block px-2 py-1 text-[12px] font-medium text-emerald-500 hover:underline"
                                >
                                    View all →
                                </Link>
                            </li>
                        </ul>
                    )}
                </div>
                {loading ? (
                    <div className="px-3 py-4 text-[12px] text-muted-foreground">Loading…</div>
                ) : sessions.length === 0 ? (
                    <div className="px-3 py-4 text-[12px] text-muted-foreground">
                        No chats yet. Start your first one.
                    </div>
                ) : (
                    sessions.map((s) => (
                        <SessionRow
                            key={s.id}
                            session={s}
                            active={s.id === activeId}
                            onDelete={() => onDelete(s.id)}
                        />
                    ))
                )}
            </div>
        </aside>
    );
}

function SessionRow({
    session,
    active,
    onDelete,
}: {
    session: ChatSession;
    active: boolean;
    onDelete: () => void;
}) {
    return (
        <div
            className={cn(
                'group flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors',
                active ? 'bg-sidebar-accent text-sidebar-foreground' : 'hover:bg-sidebar-accent',
            )}
        >
            <Link
                href={`/chat?session=${session.id}`}
                className="flex-1 min-w-0 flex items-center gap-2"
            >
                <MessageSquare size={13} className="text-muted-foreground shrink-0" />
                <span className="text-[13px] text-foreground truncate">{session.title || 'New chat'}</span>
            </Link>
            <button
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (confirm('Delete this chat?')) onDelete();
                }}
                className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-rose-500 transition-opacity"
                title="Delete chat"
            >
                <Trash2 size={12} />
            </button>
        </div>
    );
}
