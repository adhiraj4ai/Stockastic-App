import React, { useState, useEffect, useRef } from 'react';
import { Send, Bot, RefreshCw, Sparkles } from 'lucide-react';
import { MessageBubble } from './MessageBubble';
import { SuggestionGrid } from './SuggestionGrid';

interface Message {
    role: 'user' | 'assistant' | 'system';
    content: string;
    tool_calls?: any[];
    tool_results?: any[];
}

interface ChatInterfaceProps {
    messages: Message[];
    onSendMessage: (message: string) => void;
    isLoading: boolean;
    className?: string;
    hideHeader?: boolean;
    onClearMessages?: () => void;
}

export default function ChatInterface({
    messages,
    onSendMessage,
    isLoading,
    className = '',
    hideHeader = false,
    onClearMessages
}: ChatInterfaceProps) {
    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);

    // Focus input on mount
    useEffect(() => {
        if (!isLoading) {
            inputRef.current?.focus();
        }
    }, [isLoading]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        onSendMessage(input.trim());
        setInput('');
    };

    return (
        <div className={`flex flex-col h-full bg-white/20 dark:bg-black/20 rounded-xl border border-white/20 dark:border-border overflow-hidden ${className}`}>
            {/* Header */}
            {!hideHeader && (
                <header className="flex items-center justify-between p-4 border-b border-white/20 dark:border-border bg-white/40 dark:bg-black/40 z-20">
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <div className="absolute inset-0 bg-emerald-500/20 blur-lg rounded-full animate-pulse" />
                            <Bot className="text-emerald-600 dark:text-emerald-400 relative z-10" size={24} />
                        </div>
                        <div>
                            <h1 className="font-bold text-lg text-gray-900 dark:text-white tracking-tight flex items-center gap-2">
                                Stockastic
                                <span className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded font-mono tracking-tight opacity-70">
                                    Beta
                                </span>
                            </h1>
                            <p className="text-xs text-gray-500 font-medium tracking-tight">Powered by phi-3.5 & langGraph</p>
                        </div>
                    </div>
                    <button
                        onClick={() => onClearMessages?.()}
                        className="p-2 text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-all"
                        title="New Chat"
                    >
                        <RefreshCw size={18} />
                    </button>
                </header>
            )}

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto px-4 py-6 scroll-smooth custom-scrollbar">
                <div className="max-w-7xl mx-auto space-y-6">
                    {messages.length === 0 ? (
                        <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-8 animate-in fade-in duration-700">
                            <div className="text-center space-y-4 max-w-md mx-auto px-4">
                                <div className="w-16 h-16 bg-gradient-to-tr from-emerald-500/20 to-blue-500/20 rounded-2xl flex items-center justify-center mx-auto border border-white/20 dark:border-border shadow-sm shadow-emerald-500/10 ring-1 ring-white/10">
                                    <Sparkles size={32} className="text-emerald-500 dark:text-emerald-400" />
                                </div>
                                <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-b from-gray-900 to-gray-500 dark:from-white dark:to-gray-500 tracking-tight">
                                    How can I help you?
                                </h2>
                                <p className="text-gray-500 text-sm leading-relaxed">
                                    I can analyze stocks, track your portfolio, and provide market insights using real-time data.
                                </p>
                            </div>

                            <SuggestionGrid onSelect={onSendMessage} />
                        </div>
                    ) : (
                        <>
                            {messages.map((msg, idx) => (
                                <MessageBubble
                                    key={idx}
                                    role={msg.role}
                                    content={msg.content}
                                    isStreaming={isLoading && idx === messages.length - 1}
                                />
                            ))}
                        </>
                    )}

                    <div ref={messagesEndRef} className="h-4" />
                </div>
            </div>

            {/* Input Area */}
            <div className="px-4 pb-4 pt-2 bg-gradient-to-t from-white/50 dark:from-black/50 to-transparent">
                <div className="max-w-7xl mx-auto">
                    <form
                        onSubmit={handleSubmit}
                        className={`
                            relative transition-all duration-300 rounded-2xl
                            bg-white/80 dark:bg-gray-900/80 border ring-1 ring-black/5 dark:ring-white/5 shadow-sm shadow-black/5 dark:shadow-black/20
                            ${isLoading ? 'border-gray-200 dark:border-gray-800 opacity-80' : 'border-gray-300 dark:border-gray-700 hover:border-emerald-500/50 dark:hover:border-gray-600 focus-within:border-emerald-500/50 focus-within:ring-emerald-500/20'}
                        `}
                    >
                        <input
                            ref={inputRef}
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder={isLoading ? "AI is thinking..." : "Ask a question..."}
                            className="w-full bg-transparent text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 text-sm px-5 py-4 pr-14 focus:outline-none disabled:cursor-not-allowed"
                            disabled={isLoading}
                        />
                        <button
                            type="submit"
                            disabled={!input.trim() || isLoading}
                            className={`
                                absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-xl transition-all duration-200
                                ${!input.trim() || isLoading
                                    ? 'text-gray-400 bg-gray-100 dark:text-gray-600 dark:bg-gray-800'
                                    : 'text-white bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-900/20'}
                            `}
                        >
                            <Send size={18} />
                        </button>
                    </form>
                    <div className="text-center mt-3">
                        <p className="text-[10px] text-gray-500 dark:text-gray-600 font-medium tracking-tight">
                            Stockastic ai (beta) • Market data may be delayed
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
