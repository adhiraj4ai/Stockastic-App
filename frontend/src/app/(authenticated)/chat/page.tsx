'use client';

import { useState, useCallback, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChatInterface } from '@/components/ChatInterface';
import { ChatHistorySidebar } from '@/components/ChatHistorySidebar';
import DashboardLayout from '@/components/DashboardLayout';
import { chatApi, ChatMessage, ChatSession } from '@/lib/api';

// Map API ChatHistoryItem to UI's ChatHistoryItem interface if needed, 
// but we'll adapt ChatPage to use API types directly for consistency.
interface ChatHistoryItem {
    id: string;
    title: string;
    date: Date;
    messages: ChatMessage[];
}

const INITIAL_MESSAGE: ChatMessage = {
    id: '1',
    role: 'assistant',
    content: `Hello! I am your AI portfolio assistant. I can help you with:

1. **Portfolio Analysis**: Get insights on your risk and returns.
2. **Strategy Backtesting**: See how your strategies would have performed.

Want to see your **Portfolio Performance**? [GRAPH:performance]`,
    timestamp: new Date().toISOString()
};

const MOCK_HISTORY: ChatHistoryItem[] = [];

function ChatContent() {
    const searchParams = useSearchParams();
    const sessionId = searchParams.get('id');

    const [history, setHistory] = useState<ChatHistoryItem[]>([]);
    const [activeChatId, setActiveChatId] = useState<string>(sessionId || 'draft');
    const [isLoading, setIsLoading] = useState(false);

    // Initial load: fetch sessions
    useEffect(() => {
        const fetchSessions = async () => {
            try {
                const response = await chatApi.getSessions();
                const sessions = response.data.map(s => ({
                    id: s.id,
                    title: s.title,
                    date: new Date(s.updated_at),
                    messages: [] // Messages will be fetched on demand
                }));
                setHistory(sessions);
            } catch (error) {
                console.error('Failed to fetch chat sessions:', error);
            }
        };
        fetchSessions();
    }, []);

    // Load messages when active chat changes
    useEffect(() => {
        if (activeChatId === 'draft') return;

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

    const activeChat = history.find(c => c.id === activeChatId) || { messages: [] };

    const handleSendMessage = useCallback(async (content: string) => {
        if (!content.trim()) return;

        let currentSessionId = activeChatId;

        try {
            // 1. If it's a draft, create a new session in the backend
            if (activeChatId === 'draft') {
                const title = content.slice(0, 30) + (content.length > 30 ? '...' : '');
                const sessionRes = await chatApi.createSession(title);
                const newSession = sessionRes.data;
                currentSessionId = newSession.id;

                const newChat: ChatHistoryItem = {
                    id: newSession.id,
                    title: newSession.title,
                    date: new Date(newSession.updated_at),
                    messages: []
                };

                // Add to history and set as active
                setHistory(prev => [newChat, ...prev]);
                setActiveChatId(newSession.id);
            }

            // 2. Add user message to backend
            const userMsgRes = await chatApi.addMessage(currentSessionId, 'user', content);
            const userMsg = userMsgRes.data;

            // Update local state with user message
            setHistory(prev => prev.map(chat =>
                chat.id === currentSessionId ? { ...chat, messages: [...chat.messages, userMsg] } : chat
            ));

            // 3. Simulate AI response (or replace with real AI call if available)
            // For now, continue simulating but save it to the backend too
            setIsLoading(true);
            setTimeout(async () => {
                try {
                    const aiContent = activeChatId === 'draft'
                        ? `Hello Jugal! I've started a new conversation for you. I see you're interested in: "${content}". How can I further assist you?`
                        : `I've received your message: "${content}". I'm analyzing your portfolio data now.`;

                    const aiMsgRes = await chatApi.addMessage(currentSessionId, 'assistant', aiContent);
                    const aiMsg = aiMsgRes.data;

                    setHistory(prev => prev.map(chat =>
                        chat.id === currentSessionId ? { ...chat, messages: [...chat.messages, aiMsg] } : chat
                    ));
                } catch (error) {
                    console.error('Failed to save AI response:', error);
                } finally {
                    setIsLoading(false);
                }
            }, 1000);

        } catch (error) {
            console.error('Failed to send message:', error);
        }
    }, [activeChatId, history]);

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
                    setActiveChatId(newHistory.length > 0 ? newHistory[0].id : 'draft');
                }
                return newHistory;
            });
        } catch (error) {
            console.error('Failed to delete chat:', error);
        }
    };

    return (
        <DashboardLayout
            title="Stockastic AI"
            subtitle="Get insights and help with your portfolio"
            noPadding
        >
            <div className="h-[calc(100vh-5rem)] flex overflow-hidden bg-white">
                <ChatHistorySidebar
                    history={history}
                    activeChatId={activeChatId}
                    onSelectChat={handleSelectChat}
                    onNewChat={handleNewChat}
                    onRenameChat={handleRenameChat}
                    onDeleteChat={handleDeleteChat}
                />
                <main className="flex-1 flex flex-col min-w-0 bg-[#fafafa]">
                    <ChatInterface
                        hideHeader
                        className="border-0 shadow-none bg-transparent h-full"
                        messages={activeChat.messages.map(m => ({
                            ...m,
                            timestamp: new Date(m.timestamp)
                        }))}
                        onSendMessage={handleSendMessage}
                    />
                </main>
            </div>
        </DashboardLayout>
    );
}

export default function ChatPage() {
    return (
        <Suspense fallback={
            <DashboardLayout title="Chat" noPadding>
                <div className="flex h-full items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
                </div>
            </DashboardLayout>
        }>
            <ChatContent />
        </Suspense>
    );
}
