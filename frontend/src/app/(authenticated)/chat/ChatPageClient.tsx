'use client';

import { useState, useCallback, useEffect, Suspense, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import ChatInterface from '@/components/chat/ChatInterface';
import { ChatHistorySidebar } from '@/components/ChatHistorySidebar';
import DashboardLayout from '@/components/DashboardLayout';
import { chatApi, ChatMessage } from '@/lib/api';

interface ChatHistoryItem {
    id: string;
    title: string;
    date: Date;
    messages: ChatMessage[];
}

export default function ChatPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <ChatContent />
        </Suspense>
    );
}

function ChatContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const sessionId = searchParams.get('id');

    const [history, setHistory] = useState<ChatHistoryItem[]>([]);
    const [activeChatId, setActiveChatId] = useState<string>(sessionId || 'draft');
    const [isLoading, setIsLoading] = useState(false);

    // Track if we just created this session to avoid race condition with useEffect fetch
    const creatingSessionId = useRef<string | null>(null);

    // Initial load: fetch sessions
    const fetchSessions = useCallback(async () => {
        try {
            const response = await chatApi.getSessions();
            const sessions = response.data;
            setHistory(sessions.map((s: any) => ({
                id: s.id,
                title: s.title,
                date: new Date(s.updated_at),
                messages: [] // Messages will be loaded per active session
            })));
        } catch (error) {
            console.error('Failed to fetch chat sessions:', error);
        }
    }, []);

    useEffect(() => {
        fetchSessions();
    }, [fetchSessions]);

    // Handle URL param changes
    useEffect(() => {
        if (sessionId && sessionId !== activeChatId) {
            setActiveChatId(sessionId);
        }
    }, [sessionId, activeChatId]);

    // Load messages when active chat changes
    useEffect(() => {
        const loadMessages = async () => {
            if (!activeChatId || activeChatId === 'draft') return;

            // Prevent fetching if we're currently loading/streaming a response (avoids race condition)
            if (isLoading) return;

            // If we already have messages for this chat, don't refetch unless it's a new session we just created
            const chat = history.find(c => c.id === activeChatId);
            if (chat && chat.messages.length > 0 && creatingSessionId.current !== activeChatId) return;

            try {
                const response = await chatApi.getMessages(activeChatId);
                const messages = response.data;
                setHistory(prev => prev.map(c =>
                    c.id === activeChatId ? { ...c, messages } : c
                ));
                creatingSessionId.current = null;
            } catch (error) {
                console.error('Failed to load messages:', error);
            }
        };

        loadMessages();
    }, [activeChatId, history.length]); // Re-run if history length changes (new item added)

    const activeChat = history.find(c => c.id === activeChatId) || { id: 'draft', title: 'New Chat', date: new Date(), messages: [] };

    const handleSendMessage = useCallback(async (content: string) => {
        setIsLoading(true);
        try {
            let currentSessionId = activeChatId;

            // If it's a new chat, create a session first
            if (currentSessionId === 'draft') {
                const sessionRes = await chatApi.createSession(content.slice(0, 30) + '...');
                const newSession = sessionRes.data;
                currentSessionId = newSession.id;
                creatingSessionId.current = currentSessionId;

                const newHistoryItem = {
                    id: currentSessionId,
                    title: newSession.title,
                    date: new Date(),
                    messages: []
                };

                setHistory(prev => [newHistoryItem, ...prev]);
                setActiveChatId(currentSessionId);
                router.push(`/chat?id=${currentSessionId}`, { scroll: false });
            }

            // Optimistically add user message and empty assistant message
            const tempUserMsgLike: ChatMessage = {
                id: Date.now().toString(),
                role: 'user',
                content: content,
                timestamp: new Date().toISOString()
            };
            const tempAssistantMsgId = (Date.now() + 1).toString();
            const tempAssistantMsgLike: ChatMessage = {
                id: tempAssistantMsgId,
                role: 'assistant',
                content: '',
                timestamp: new Date().toISOString()
            };

            setHistory(prev => prev.map(chat =>
                chat.id === currentSessionId
                    ? { ...chat, messages: [...chat.messages, tempUserMsgLike, tempAssistantMsgLike] }
                    : chat
            ));

            // Stream response
            await chatApi.streamMessage(currentSessionId, 'user', content, (chunk) => {
                setHistory(prev => prev.map(chat => {
                    if (chat.id !== currentSessionId) return chat;

                    const updatedMessages = chat.messages.map(msg =>
                        msg.id === tempAssistantMsgId
                            ? { ...msg, content: msg.content + chunk }
                            : msg
                    );
                    return { ...chat, messages: updatedMessages };
                }));
            });

        } catch (error) {
            console.error('Failed to send message:', error);
        } finally {
            setIsLoading(false);
        }
    }, [activeChatId, router]);

    const handleNewChat = () => {
        setActiveChatId('draft');
        router.push('/chat', { scroll: false });
    };

    const handleSelectChat = (id: string) => {
        setActiveChatId(id);
        router.push(`/chat?id=${id}`, { scroll: false });
    };

    const handleRenameChat = async (id: string, newTitle: string) => {
        try {
            await chatApi.renameSession(id, newTitle);
            setHistory(prev => prev.map(chat =>
                chat.id === id ? { ...chat, title: newTitle } : chat
            ));
        } catch (error) {
            console.error('Failed to rename chat:', error);
        }
    };

    const handleDeleteChat = async (id: string) => {
        try {
            await chatApi.deleteSession(id);
            setHistory(prev => {
                const newHistory = prev.filter(chat => chat.id !== id);
                if (activeChatId === id) {
                    setActiveChatId('draft');
                    router.push('/chat', { scroll: false });
                }
                return newHistory;
            });
        } catch (error) {
            console.error('Failed to delete chat:', error);
        }
    };

    const uiMessages = activeChat.messages.map(m => ({
        ...m,
        timestamp: new Date(m.timestamp)
    }));

    return (
        <DashboardLayout
            title="Stockastic AI"
            subtitle="Get insights and help with your portfolio"
            noPadding
        >
            <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-slate-50 dark:bg-slate-950 relative">
                {/* Dynamic Background Elements */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/5 blur-[120px] rounded-full" />
                    <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-500/5 blur-[120px] rounded-full" />
                </div>

                <motion.div
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                    className="relative z-10"
                >
                    <ChatHistorySidebar
                        history={history}
                        activeChatId={activeChatId}
                        onSelectChat={handleSelectChat}
                        onNewChat={handleNewChat}
                        onRenameChat={handleRenameChat}
                        onDeleteChat={handleDeleteChat}
                    />
                </motion.div>

                <main className="flex-1 relative flex flex-col min-w-0 bg-transparent z-10">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeChatId}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.3 }}
                            className="h-full"
                        >
                            <ChatInterface
                                hideHeader
                                className="border-0 shadow-none bg-transparent h-full"
                                messages={uiMessages}
                                onSendMessage={handleSendMessage}
                                isLoading={isLoading}
                                onClearMessages={() => { }}
                            />
                        </motion.div>
                    </AnimatePresence>
                </main>
            </div>
        </DashboardLayout>
    );
}
