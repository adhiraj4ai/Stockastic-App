'use client';

import Link from 'next/link';
import { Plus, Trash2, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatSession } from './types';

interface Props {
    sessions: ChatSession[];
    activeId: string | null;
    loading: boolean;
    onNew: () => void;
    onDelete: (id: string) => void;
}

export function SessionList({ sessions, activeId, loading, onNew, onDelete }: Props) {
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
