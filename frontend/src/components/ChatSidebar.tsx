import { useState, useEffect, useCallback } from 'react';
import { MessageSquare } from 'lucide-react';
import { ChatInterface } from './ChatInterface';
import { useRouter } from 'next/navigation';
import { chatApi, ChatMessage } from '@/lib/api';

interface ChatSidebarProps {
    isPinned?: boolean;
    onPinToggle?: () => void;
}

export function ChatSidebar({ isPinned = false, onPinToggle }: ChatSidebarProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    // Keep open if pinned
    const showSidebar = isOpen || isPinned;

    // Load latest session on mount
    useEffect(() => {
        const loadLatestSession = async () => {
            try {
                const sessionRes = await chatApi.getSessions();
                if (sessionRes.data.length > 0) {
                    const latest = sessionRes.data[0];
                    setActiveSessionId(latest.id);
                    const msgRes = await chatApi.getMessages(latest.id);
                    setMessages(msgRes.data);
                } else {
                    setActiveSessionId('draft');
                }
            } catch (error) {
                console.error('Failed to load chat session:', error);
                setActiveSessionId('draft');
            }
        };
        loadLatestSession();
    }, []);

    const handleSendMessage = useCallback(async (content: string) => {
        if (!content.trim()) return;

        let sessionId = activeSessionId;

        try {
            // 1. Create session if draft
            if (activeSessionId === 'draft' || !activeSessionId) {
                const title = content.slice(0, 30) + (content.length > 30 ? '...' : '');
                const res = await chatApi.createSession(title);
                sessionId = res.data.id;
                setActiveSessionId(sessionId);
            }

            if (!sessionId) return;

            // 2. Add user message
            const userRes = await chatApi.addMessage(sessionId, 'user', content);
            setMessages(prev => [...prev, userRes.data]);

            // 3. AI Simulation (mirroring logic from ChatPage for consistency)
            setIsLoading(true);
            setTimeout(async () => {
                try {
                    const aiContent = `I am your floating assistant. I see you're on ${window.location.pathname}. How can I help with your portfolio?`;
                    const aiRes = await chatApi.addMessage(sessionId!, 'assistant', aiContent);
                    setMessages(prev => [...prev, aiRes.data]);
                } catch (err) {
                    console.error('Failed to save AI response:', err);
                } finally {
                    setIsLoading(false);
                }
            }, 1000);

        } catch (error) {
            console.error('Failed to send message:', error);
        }
    }, [activeSessionId]);

    return (
        <>
            {/* Toggle Button (Floating) - Hide if open or pinned */}
            {!showSidebar && (
                <button
                    onClick={() => setIsOpen(true)}
                    className="fixed right-6 bottom-6 h-14 w-14 bg-black rounded-full shadow-lg flex items-center justify-center text-white hover:scale-105 transition-all z-40 hover:shadow-xl"
                    title="Open Chat Assistant"
                >
                    <MessageSquare size={28} />
                    <span className="absolute -top-1 -right-1 flex h-4 w-4">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500"></span>
                    </span>
                </button>
            )}

            {/* Sidebar Container */}
            <div
                className={`fixed top-0 right-0 h-full w-96 bg-white shadow-2xl transform transition-transform duration-300 ease-in-out z-50 flex flex-col border-l border-gray-100 ${showSidebar ? 'translate-x-0' : 'translate-x-full'
                    }`}
            >
                <ChatInterface
                    isPinned={isPinned}
                    onPinToggle={onPinToggle}
                    onClose={() => {
                        setIsOpen(false);
                        if (isPinned && onPinToggle) onPinToggle();
                    }}
                    onMaximize={() => router.push('/chat')}
                    messages={messages.map(m => ({
                        ...m,
                        timestamp: new Date(m.timestamp)
                    }))}
                    onSendMessage={handleSendMessage}
                />
            </div>

            {/* Overlay (Optional - click to close) */}
            {isOpen && !isPinned && (
                <div
                    className="fixed inset-0 bg-black/5 z-40 backdrop-blur-[1px]"
                    onClick={() => setIsOpen(false)}
                />
            )}
        </>
    );
}
