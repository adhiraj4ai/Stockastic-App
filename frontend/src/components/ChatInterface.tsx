'use client';

import { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Paperclip, Bot, Pin, PinOff, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    AreaChart,
    Area
} from 'recharts';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    metadata?: any;
}

interface ChatInterfaceProps {
    isPinned?: boolean;
    onPinToggle?: () => void;
    onClose?: () => void;
    onMaximize?: () => void;
    className?: string;
    hideHeader?: boolean;
    messages: Message[];
    onSendMessage: (content: string) => void;
}

// Mock data for graphs
const MOCK_PORTFOLIO_DATA = [
    { name: 'Jan', value: 4000 },
    { name: 'Feb', value: 3000 },
    { name: 'Mar', value: 5000 },
    { name: 'Apr', value: 4500 },
    { name: 'May', value: 6000 },
    { name: 'Jun', value: 5500 },
    { name: 'Jul', value: 7000 },
];

function MessageRenderer({ content, role }: { content: string; role: 'user' | 'assistant' }) {
    // Check for graph placeholder
    const graphMatch = content.match(/\[GRAPH:(.*?)\]/);

    if (graphMatch && role === 'assistant') {
        const graphType = graphMatch[1].trim();
        const textBefore = content.split(`[GRAPH:${graphType}]`)[0];
        const textAfter = content.split(`[GRAPH:${graphType}]`)[1];

        return (
            <div className="space-y-4">
                {textBefore && <MarkdownRenderer content={textBefore} />}
                <div className="h-96 w-full max-w-4xl bg-white rounded-xl border border-gray-100 p-4 shadow-sm my-2 overflow-hidden mx-auto">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={MOCK_PORTFOLIO_DATA}>
                            <defs>
                                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#000000" stopOpacity={0.1} />
                                    <stop offset="95%" stopColor="#000000" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                            <XAxis
                                dataKey="name"
                                stroke="#94a3b8"
                                fontSize={10}
                                tickLine={false}
                                axisLine={false}
                                dy={10}
                            />
                            <YAxis
                                stroke="#94a3b8"
                                fontSize={10}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(value) => `$${value}`}
                            />
                            <Tooltip
                                contentStyle={{
                                    borderRadius: '8px',
                                    border: 'none',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                    fontSize: '12px'
                                }}
                            />
                            <Area type="monotone" dataKey="value" stroke="#000000" strokeWidth={2} fillOpacity={1} fill="url(#colorValue)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
                {textAfter && <MarkdownRenderer content={textAfter} />}
            </div>
        );
    }

    return <MarkdownRenderer content={content} />;
}

function MarkdownRenderer({ content }: { content: string }) {
    return (
        <div className="prose prose-sm max-w-none prose-p:leading-relaxed prose-pre:p-0 prose-pre:bg-transparent prose-img:rounded-xl prose-img:max-w-md prose-img:mx-auto">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    code({ className, children, ...props }: any) {
                        const match = /language-(\w+)/.exec(className || '');
                        return match ? (
                            <div className="rounded-lg overflow-hidden my-3 border border-gray-800 max-w-full overflow-x-auto">
                                <div className="bg-gray-800 px-4 py-1 text-[10px] text-gray-400 font-mono flex justify-between items-center">
                                    <span>{match[1].toUpperCase()}</span>
                                </div>
                                <SyntaxHighlighter
                                    language={match[1]}
                                    style={vscDarkPlus}
                                    PreTag="div"
                                    customStyle={{ margin: 0, padding: '1rem', fontSize: '12px' }}
                                    {...props}
                                >
                                    {String(children).replace(/\n$/, '')}
                                </SyntaxHighlighter>
                            </div>
                        ) : (
                            <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono text-pink-600" {...props}>
                                {children}
                            </code>
                        );
                    },
                    table({ children }) {
                        return (
                            <div className="overflow-x-auto my-4 border rounded-lg border-gray-200 max-w-xl mx-auto backdrop-blur-sm bg-white/50">
                                <table className="w-full text-left border-collapse">{children}</table>
                            </div>
                        );
                    },
                    thead({ children }) {
                        return <thead className="bg-gray-50 border-b border-gray-200">{children}</thead>;
                    },
                    th({ children }) {
                        return <th className="px-4 py-2 font-semibold text-gray-700 text-xs uppercase tracking-wider">{children}</th>;
                    },
                    td({ children }) {
                        return <td className="px-4 py-2 border-t border-gray-100 text-gray-600">{children}</td>;
                    },
                    p({ children }) {
                        return <p className="mb-2 last:mb-0">{children}</p>;
                    },
                    img({ node, ...props }: any) {
                        return (
                            <div className="my-4 flex justify-center">
                                <img className="rounded-xl border border-gray-100 shadow-sm max-w-md w-full object-cover" {...props} />
                            </div>
                        );
                    }
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
}

export function ChatInterface({
    isPinned = false,
    onPinToggle,
    onClose,
    onMaximize,
    className = '',
    hideHeader = false,
    messages = [],
    onSendMessage
}: ChatInterfaceProps) {
    const [mounted, setMounted] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const handleSendMessage = () => {
        if (!inputValue.trim()) return;
        onSendMessage(inputValue);
        setInputValue('');
    };

    if (!mounted) return null;

    const isNewChat = (messages?.length || 0) === 0;

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good morning';
        if (hour < 17) return 'Good afternoon';
        return 'Good evening';
    };

    return (
        <div className={`flex flex-col h-full bg-[#fafafa] shadow-sm border border-gray-100 ${className}`}>
            {/* Header */}
            {!hideHeader && (
                <div className="p-4 bg-black text-white flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="h-8 w-8 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                            <Bot size={20} className="text-white" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-base leading-tight">Stockastic AI</h3>
                            <div className="flex items-center gap-1.5 opacity-90">
                                <span className="h-1.5 w-1.5 rounded-full bg-green-400"></span>
                                <span className="text-xs">Online</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        {/* Maximize Button */}
                        {onMaximize && (
                            <button
                                onClick={onMaximize}
                                className="p-1.5 hover:bg-white/20 rounded-full transition-colors"
                                title="Full Screen Chat"
                            >
                                <Maximize2 size={18} />
                            </button>
                        )}

                        {/* Pin Button */}
                        {onPinToggle && (
                            <button
                                onClick={onPinToggle}
                                className={`p-1.5 rounded-full transition-colors ${isPinned ? 'bg-white/20 text-white' : 'hover:bg-white/10 text-white/80'}`}
                                title={isPinned ? "Unpin Sidebar" : "Pin Sidebar"}
                            >
                                {isPinned ? <PinOff size={18} /> : <Pin size={18} />}
                            </button>
                        )}

                        {/* Close Button */}
                        {onClose && (
                            <button
                                onClick={onClose}
                                className="p-1.5 hover:bg-white/20 rounded-full transition-colors"
                            >
                                <X size={20} />
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Content Area */}
            <div className={`flex-1 flex flex-col min-h-0 bg-[#f5f5f5] ${isNewChat ? 'justify-center' : ''}`}>
                {/* Messages Area */}
                <div
                    className={`${isNewChat ? 'flex-none' : 'flex-1 overflow-y-auto'} p-4`}
                    ref={scrollRef}
                >
                    <div className={`${isNewChat ? 'max-w-2xl text-center' : 'max-w-full'} mx-auto w-full space-y-6 py-4 px-4 sm:px-8`}>
                        {isNewChat && (
                            <div className="space-y-2 mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                                <h1 className="text-4xl font-bold text-gray-900 tracking-tight">
                                    {getGreeting()}, Jugal
                                </h1>
                                <p className="text-xl text-gray-500 font-medium">
                                    How can I help you with your portfolio today?
                                </p>
                            </div>
                        )}
                        {messages.map((msg) => (
                            <div
                                key={msg.id}
                                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} ${isNewChat ? 'justify-center' : ''}`}
                            >
                                <div
                                    className={`rounded-2xl px-6 py-4 text-sm shadow-sm leading-relaxed ${msg.role === 'user'
                                        ? 'bg-black text-white rounded-br-none max-w-[85%]'
                                        : isNewChat
                                            ? 'bg-transparent text-gray-800 border-none shadow-none w-full'
                                            : 'bg-[#fcfafd] text-gray-800 border border-gray-100 rounded-bl-none w-full max-w-[95%] lg:max-w-[90%]'
                                        }`}
                                >
                                    <div className={isNewChat ? 'text-lg font-medium text-gray-900 mb-8' : ''}>
                                        <MessageRenderer content={msg.content} role={msg.role} />
                                    </div>
                                    {!isNewChat && (
                                        <div className="mt-1.5 flex justify-end">
                                            <span className={`text-[10px] font-medium leading-none ${msg.role === 'user' ? 'text-white/60' : 'text-gray-400/80'}`}>
                                                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Input Area */}
                <div className={`${isNewChat ? 'shrink-0' : 'p-4 bg-[#fafafa] border-t border-gray-100 shrink-0'}`}>
                    <div className={`${isNewChat ? 'max-w-2xl' : 'max-w-full'} mx-auto w-full px-4 sm:px-8`}>
                        <div className={`flex items-center gap-2 bg-white p-1.5 rounded-2xl border border-gray-200 focus-within:ring-4 focus-within:ring-gray-100 transition-all w-full shadow-sm ${isNewChat ? 'py-3 px-4' : ''}`}>
                            <button className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors">
                                <Paperclip size={18} />
                            </button>
                            <Input
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                                placeholder="Ask about your portfolio..."
                                className="border-none shadow-none focus-visible:ring-0 bg-transparent h-9 px-2 relative text-base"
                            />
                            <button
                                onClick={handleSendMessage}
                                disabled={!inputValue.trim()}
                                className="p-2.5 bg-black text-white rounded-xl hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
                            >
                                <Send size={18} className={inputValue.trim() ? 'ml-0.5' : ''} />
                            </button>
                        </div>
                    </div>
                    {isNewChat && (
                        <div className="text-center mt-4">
                            <p className="text-[10px] text-gray-400">
                                AI can make mistakes. Check important info.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
