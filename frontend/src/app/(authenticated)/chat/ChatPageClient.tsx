'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Bookmark, CalendarDays, PanelRightClose, PanelRightOpen } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { ChatInterface } from '@/components/chat/ChatInterface';
import { SessionList } from '@/components/chat/SessionList';
import { BookmarkCatalog } from '@/components/chat/BookmarkCatalog';
import { PlanSidebar } from '@/components/chat/PlanSidebar';
import api from '@/lib/api';
import type { ChatSession } from '@/components/chat/types';

type SidebarTab = 'analyses' | 'plan';

export default function ChatPageClient() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const activeId = searchParams.get('session') || null;

    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [loading, setLoading] = useState(true);
    // Captured once from ?q= (home omnibox handoff); the URL is then cleaned.
    const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
    // Right-side sidebar; open/collapsed and active tab persisted across visits.
    const [bookmarksOpen, setBookmarksOpen] = useState<boolean>(() =>
        typeof window === 'undefined' ? true : localStorage.getItem('chat:bookmarksOpen') !== '0',
    );
    const [sidebarTab, setSidebarTab] = useState<SidebarTab>(() => {
        if (typeof window === 'undefined') return 'analyses';
        const stored = localStorage.getItem('chat:sidebarTab');
        return stored === 'plan' ? 'plan' : 'analyses';
    });

    const toggleBookmarks = () =>
        setBookmarksOpen((v) => {
            const next = !v;
            if (typeof window !== 'undefined')
                localStorage.setItem('chat:bookmarksOpen', next ? '1' : '0');
            return next;
        });

    const selectTab = (tab: SidebarTab) => {
        setSidebarTab(tab);
        if (typeof window !== 'undefined') localStorage.setItem('chat:sidebarTab', tab);
    };

    const refresh = async () => {
        try {
            const res = await api.get('/api/chat/sessions/');
            const all: ChatSession[] = res.data?.results || res.data || [];
            // Exclude sessions created internally for notebooks
            const items = all.filter(s => !s.title.startsWith('Notebook Session:'));
            setSessions(items);
            return items;
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        refresh();
    }, []);

    // ?q= handoff: stash the prompt, ensure a session exists, drop q from the URL.
    useEffect(() => {
        const q = searchParams.get('q');
        if (!q) return;
        setPendingPrompt(q);
        if (activeId) {
            router.replace(`/chat?session=${activeId}`);
            return;
        }
        api.post('/api/chat/sessions/', { title: 'New chat' }).then(async res => {
            await refresh();
            router.replace(`/chat?session=${res.data.id}`);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
        <DashboardLayout title="Chat" subtitle="Orchestrated AI analysts for NEPSE" noPadding>
            <div className="flex h-[calc(100vh-72px)] overflow-hidden">
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
                            initialPrompt={pendingPrompt ?? undefined}
                        />
                    ) : (
                        <EmptyState onNew={handleNew} />
                    )}
                </div>

                {/* Right-side sidebar: Analyses and Plan tabs */}
                {bookmarksOpen ? (
                    <aside className="hidden w-80 shrink-0 flex-col border-l border-border bg-sidebar md:flex">
                        {/* Tab strip header */}
                        <div className="flex h-12 shrink-0 items-center border-b border-border px-1 gap-0.5">
                            <button
                                onClick={() => selectTab('analyses')}
                                className={`inline-flex items-center gap-1.5 px-3 h-full text-[13px] border-b-2 transition-colors ${
                                    sidebarTab === 'analyses'
                                        ? 'border-primary font-medium text-foreground'
                                        : 'border-transparent text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                <Bookmark size={13} className={sidebarTab === 'analyses' ? 'text-emerald-500' : ''} />
                                Analyses
                            </button>
                            <button
                                onClick={() => selectTab('plan')}
                                className={`inline-flex items-center gap-1.5 px-3 h-full text-[13px] border-b-2 transition-colors ${
                                    sidebarTab === 'plan'
                                        ? 'border-primary font-medium text-foreground'
                                        : 'border-transparent text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                <CalendarDays size={13} className={sidebarTab === 'plan' ? 'text-emerald-500' : ''} />
                                Plan
                            </button>
                            <button
                                onClick={toggleBookmarks}
                                title="Hide sidebar"
                                className="ml-auto rounded p-1 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
                            >
                                <PanelRightClose size={15} />
                            </button>
                        </div>
                        <div className="min-h-0 flex-1">
                            {sidebarTab === 'analyses' ? (
                                <BookmarkCatalog variant="sidebar" />
                            ) : (
                                <PlanSidebar />
                            )}
                        </div>
                    </aside>
                ) : (
                    <button
                        onClick={toggleBookmarks}
                        title="Show sidebar"
                        className="hidden w-10 shrink-0 flex-col items-center gap-2 border-l border-border bg-sidebar py-3 text-muted-foreground transition-colors hover:text-foreground md:flex"
                    >
                        <PanelRightOpen size={15} />
                        <Bookmark size={14} className="text-emerald-500" />
                        <span className="[writing-mode:vertical-rl] text-[11px] tracking-wide">Saved</span>
                    </button>
                )}
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
                    className="px-4 py-2 rounded-md bg-foreground text-background text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                    Start a new chat
                </button>
            </div>
        </div>
    );
}
