'use client';

import { useState, useCallback } from 'react';
import { ChatInterface } from '@/components/ChatInterface';
import { ChatHistorySidebar } from '@/components/ChatHistorySidebar';
import DashboardLayout from '@/components/DashboardLayout';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    metadata?: any;
}

interface ChatHistoryItem {
    id: string;
    title: string;
    date: Date;
    messages: Message[];
}

const INITIAL_MESSAGE: Message = {
    id: '1',
    role: 'assistant',
    content: `Hello! I am your AI portfolio assistant. I can help you with:

1. **Portfolio Analysis**: Get insights on your risk and returns.
2. **Strategy Backtesting**: See how your strategies would have performed.

Want to see your **Portfolio Performance**? [GRAPH:performance]`,
    timestamp: new Date()
};

const MOCK_HISTORY: ChatHistoryItem[] = [];

export default function ChatPage() {
    const [history, setHistory] = useState<ChatHistoryItem[]>(MOCK_HISTORY);
    const [activeChatId, setActiveChatId] = useState<string>('draft');

    const activeChat = history.find(c => c.id === activeChatId) || { messages: [] };

    const handleSendMessage = useCallback((content: string) => {
        const newMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content,
            timestamp: new Date()
        };

        if (activeChatId === 'draft') {
            const newId = `chat-${Date.now()}`;
            const newChat: ChatHistoryItem = {
                id: newId,
                title: content.slice(0, 30) + (content.length > 30 ? '...' : ''),
                date: new Date(),
                messages: [newMessage]
            };
            setHistory(prev => [newChat, ...prev]);
            setActiveChatId(newId);

            // Simulate AI response for new chat
            setTimeout(() => {
                const aiResponse: Message = {
                    id: (Date.now() + 1).toString(),
                    role: 'assistant',
                    content: `Hello Jugal! I've started a new conversation for you. I see you're interested in: "${content}". How can I further assist you?`,
                    timestamp: new Date()
                };
                setHistory(prev => prev.map(chat =>
                    chat.id === newId ? { ...chat, messages: [...chat.messages, aiResponse] } : chat
                ));
            }, 1000);
            return;
        }

        setHistory(prev => prev.map(chat => {
            if (chat.id === activeChatId) {
                return { ...chat, messages: [...chat.messages, newMessage] };
            }
            return chat;
        }));

        // Simulate AI response
        setTimeout(() => {
            const aiResponse: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: `I've received your message: "${content}". I'm analyzing your portfolio data now.`,
                timestamp: new Date()
            };

            setHistory(prev => prev.map(chat => {
                if (chat.id === activeChatId) {
                    return { ...chat, messages: [...chat.messages, aiResponse] };
                }
                return chat;
            }));
        }, 1000);
    }, [activeChatId, history]);

    const handleNewChat = () => {
        setActiveChatId('draft');
    };

    const handleSelectChat = (id: string) => {
        setActiveChatId(id);
    };

    const handleRenameChat = (id: string, newTitle: string) => {
        setHistory(prev => prev.map(chat =>
            chat.id === id ? { ...chat, title: newTitle } : chat
        ));
    };

    const handleDeleteChat = (id: string) => {
        setHistory(prev => {
            const newHistory = prev.filter(chat => chat.id !== id);
            if (activeChatId === id) {
                setActiveChatId(newHistory.length > 0 ? newHistory[0].id : 'draft');
            }
            return newHistory;
        });
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
                        messages={activeChat.messages}
                        onSendMessage={handleSendMessage}
                    />
                </main>
            </div>
        </DashboardLayout>
    );
}
