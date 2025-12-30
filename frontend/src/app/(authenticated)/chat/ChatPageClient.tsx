'use client';

import { useState, useCallback, useEffect, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChatInterface } from '@/components/ChatInterface';
import { ChatHistorySidebar } from '@/components/ChatHistorySidebar';
import DashboardLayout from '@/components/DashboardLayout';
import { chatApi, ChatMessage } from '@/lib/api';

interface ChatHistoryItem {
    id: string;
    title: string;
    date: Date;
    messages: ChatMessage[];
}

export default function ChatContent() {
    const searchParams = useSearchParams();
    const sessionId = searchParams.get('id');

    const [history, setHistory] = useState<ChatHistoryItem[]>([]);
    const [activeChatId, setActiveChatId] = useState<string>(sessionId || 'draft');
    const [isLoading, setIsLoading] = useState(false);

    // Track if we just created this session to avoid race condition with useEffect fetch
    const creatingSessionId = useRef<string | null>(null);

    // Initial load: fetch sessions
    useEffect(() => {
        const fetchSessions = async () => {
            try {
                const response = await chatApi.getSessions();

                if (response.data.length === 0) {
                    return;
                }

                const sessions = response.data.map(s => ({
                    id: s.id,
                    title: s.title,
                    date: new Date(s.updated_at),
                    messages: []
                }));
                setHistory(sessions);

                if (sessionId) {
                    setActiveChatId(sessionId);
                } else if (activeChatId === 'draft' && sessions.length > 0) {
                    // logic to stay on draft
                }

            } catch (error) {
                console.error('Failed to fetch chat sessions:', error);
            }
        };
        fetchSessions();
    }, [sessionId]);

    // Load messages when active chat changes
    useEffect(() => {
        if (activeChatId === 'draft') return;

        // Skip fetch if we just created this session (optimistic updates already in place)
        if (creatingSessionId.current === activeChatId) {
            creatingSessionId.current = null;
            return;
        }

        const fetchMessages = async () => {
            try {
                const response = await chatApi.getMessages(activeChatId);
                setHistory(prev => prev.map(chat =>
                    chat.id === activeChatId ? { ...chat, messages: response.data } : chat
                ));
            } catch (error) {
                console.error('Failed to fetch messages:', error);
            }
        };
        fetchMessages();
    }, [activeChatId]);

    const activeChat = history.find(c => c.id === activeChatId) || { id: 'draft', title: 'New Chat', date: new Date(), messages: [] };

    const handleSendMessage = useCallback(async (content: string) => {
        if (!content.trim()) return;

        let currentSessionId = activeChatId;

        try {
            // 1. Prepare messages optimistically
            const tempUserMsg: ChatMessage = {
                id: Date.now().toString(),
                role: 'user',
                content,
                timestamp: new Date().toISOString()
            };

            const aiMsgId = (Date.now() + 1).toString();
            const tempAiMsg: ChatMessage = {
                id: aiMsgId,
                role: 'assistant',
                content: 'Thinking...',
                timestamp: new Date().toISOString()
            };

            // 2. If it's a draft, handle session creation and initial messages together
            if (activeChatId === 'draft') {
                const title = content.slice(0, 30) + (content.length > 30 ? '...' : '');
                const sessionRes = await chatApi.createSession(title);
                const newSession = sessionRes.data;
                currentSessionId = newSession.id;

                const newChat: ChatHistoryItem = {
                    id: newSession.id,
                    title: newSession.title,
                    date: new Date(newSession.updated_at),
                    messages: [tempUserMsg, tempAiMsg]
                };

                setHistory(prev => [newChat, ...prev]);

                // Set ref before state update so useEffect sees it
                creatingSessionId.current = newSession.id;
                setActiveChatId(newSession.id);
            } else {
                // 3. Existing session: update history atomically
                setHistory(prev => prev.map(chat =>
                    chat.id === currentSessionId
                        ? { ...chat, messages: [...chat.messages, tempUserMsg, tempAiMsg] }
                        : chat
                ));
            }

            // 4. Stream message from backend
            setIsLoading(true);
            let fullAiContent = "";
            let chunkCount = 0;

            await chatApi.streamMessage(currentSessionId, 'user', content, (chunk) => {
                chunkCount++;
                if (chunkCount === 1) fullAiContent = ""; // Clear placeholder
                fullAiContent += chunk;

                setHistory(prev => prev.map(chat => {
                    if (chat.id === currentSessionId) {
                        return {
                            ...chat,
                            messages: chat.messages.map(m =>
                                m.id === aiMsgId ? { ...m, content: fullAiContent } : m
                            )
                        };
                    }
                    return chat;
                }));
            });

        } catch (error) {
            console.error('Failed to send message:', error);
        } finally {
            setIsLoading(false);
        }
    }, [activeChatId, setHistory, setActiveChatId]);

    const handleNewChat = () => {
        setActiveChatId('draft');
    };

    const handleSelectChat = (id: string) => {
        setActiveChatId(id);
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
                    // Start new draft if we deleted the active chat
                    setActiveChatId('draft');
                }
                return newHistory;
            });
        } catch (error) {
            console.error('Failed to delete chat:', error);
        }
    };

    // Convert ChatMessage (string timestamp) to Component Message (Date timestamp)
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
            <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-white">
                <ChatHistorySidebar
                    history={history}
                    activeChatId={activeChatId}
                    onSelectChat={handleSelectChat}
                    onNewChat={handleNewChat}
                    onRenameChat={handleRenameChat}
                    onDeleteChat={handleDeleteChat}
                />
                <main className="flex-1 relative flex flex-col min-w-0 bg-[#fafafa]">
                    <ChatInterface
                        hideHeader
                        className="border-0 shadow-none bg-transparent h-full"
                        messages={uiMessages}
                        onSendMessage={handleSendMessage}
                        isLoading={isLoading}
                    />
                </main>
            </div>
        </DashboardLayout>
    );
}
