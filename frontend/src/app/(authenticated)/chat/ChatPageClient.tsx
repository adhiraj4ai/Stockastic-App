'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { ChatInterface } from '@/components/chat/ChatInterface';
import { SessionList } from '@/components/chat/SessionList';
import api from '@/lib/api';
import type { ChatSession } from '@/components/chat/types';

export default function ChatPageClient() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const activeId = searchParams.get('session') || null;

    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [loading, setLoading] = useState(true);

    const refresh = async () => {
        try {
            const res = await api.get('/api/chat/sessions/');
            const items: ChatSession[] = res.data?.results || res.data || [];
            setSessions(items);
            return items;
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        refresh();
    }, []);

    const handleNew = async () => {
        const res = await api.post('/api/chat/sessions/', { title: 'New chat' });
        const created = res.data;
        await refresh();
        router.replace(`/chat?session=${created.id}`);
    };

    const handleDelete = async (id: string) => {
        await api.delete(`/api/chat/sessions/${id}/`);
        const remaining = await refresh();
        if (id === activeId) {
            router.replace(remaining.length ? `/chat?session=${remaining[0].id}` : '/chat');
        }
    };

    return (
        <DashboardLayout title="Chat" noPadding hideHeader>
            <div className="flex h-screen overflow-hidden">
                <SessionList
                    sessions={sessions}
                    activeId={activeId}
                    loading={loading}
                    onNew={handleNew}
                    onDelete={handleDelete}
                />
                <div className="flex-1 min-w-0 flex flex-col bg-background">
                    {activeId ? (
                        <ChatInterface
                            sessionId={activeId}
                            onTitleChange={refresh}
                        />
                    ) : (
                        <EmptyState onNew={handleNew} />
                    )}
                </div>
            </div>
        </DashboardLayout>
    );
}

function EmptyState({ onNew }: { onNew: () => void }) {
    return (
        <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-md">
                <div className="text-foreground text-lg font-semibold tracking-tight mb-2">
                    Stockastic chat
                </div>
                <p className="text-muted-foreground text-sm mb-6">
                    Ask about NEPSE market conditions, a specific ticker, or your portfolio.
                    The orchestrator delegates to specialist subagents and streams results back live.
                </p>
                <button
                    onClick={onNew}
                    className="px-4 py-2 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity"
                >
                    Start a new chat
                </button>
            </div>
        </div>
    );
}
