'use client';

import { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { ChatInterface } from './ChatInterface';
import { useRouter } from 'next/navigation';

interface ChatSidebarProps {
    isPinned?: boolean;
    onPinToggle?: () => void;
}

export function ChatSidebar({ isPinned = false, onPinToggle }: ChatSidebarProps) {
    const [isOpen, setIsOpen] = useState(false);
    const router = useRouter();

    // Keep open if pinned
    const showSidebar = isOpen || isPinned;

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
