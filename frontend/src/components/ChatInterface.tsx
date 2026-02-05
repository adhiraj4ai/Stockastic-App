'use client';

import { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Paperclip, Bot, Pin, PinOff, Maximize2, ChevronDown, ChevronRight, ChevronUp, Code2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import 'katex/dist/katex.min.css';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ReactECharts from 'echarts-for-react';
import { StockLoader } from './StockLoader';
import { DataTable } from './DataTable';

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
    isLoading?: boolean;
}

function ThoughtContainer({ rawContent, role, isFinished }: { rawContent: string, role: 'user' | 'assistant', isFinished?: boolean }) {
    const [isOpen, setIsOpen] = useState(true);
    const hasAutoCollapsed = useRef(false);

    useEffect(() => {
        if (isFinished && !hasAutoCollapsed.current) {
            setIsOpen(false);
            hasAutoCollapsed.current = true;
        }
    }, [isFinished]);

    // Parse all thoughts from the raw block
    const thoughts: { header: string; content: string }[] = [];
    const regex = /<<<THOUGHT_START:(.*?)>>>([\s\S]*?)<<<THOUGHT_END>>>/g;
    let match;
    while ((match = regex.exec(rawContent)) !== null) {
        thoughts.push({ header: match[1], content: match[2].trim() });
    }

    // Auto-scroll to bottom of thoughts
    const containerRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (isOpen && containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
    }, [thoughts.length, isOpen]);

    if (thoughts.length === 0) return null;

    return (
        <div className="my-3">
            <div
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 cursor-pointer text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors select-none"
            >
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <div className="font-mono text-[10px] uppercase tracking-wider font-bold">
                    Process & Reasoning
                </div>
            </div>
            {isOpen && (
                <div
                    ref={containerRef}
                    className="mt-2 pl-6 overflow-y-auto max-h-60 custom-scrollbar"
                >
                    <div className="flex flex-col gap-4 text-[13px] font-mono text-slate-600 dark:text-slate-400 [&_div.prose]:font-mono [&_div.prose]:text-[13px] [&_div.prose]:max-w-none [&_pre]:!text-[11px] [&_pre]:!bg-slate-900 [&_pre]:!p-2 [&_pre]:!rounded-md [&_pre]:!border [&_pre]:!border-slate-200 dark:[&_pre]:!border-slate-800">
                        {thoughts.map((item, idx) => (
                            <div key={idx} className="space-y-1">
                                <div className="font-black text-slate-400 dark:text-slate-500 uppercase text-[9px] tracking-widest">{item.header}</div>
                                <MessageRenderer content={item.content} role={role} isFinished={isFinished} />
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function MessageRenderer({ content, role, isFinished }: { content: string; role: 'user' | 'assistant'; isFinished?: boolean }) {
    if (!content) return null;

    // 1. Check for Thought/Narration Sequence (One or more blocks matches)
    // Regex matches the whole group of thoughts including newlines between them
    const thoughtSequenceMatch = content.match(/((?:<<<THOUGHT_START:[\s\S]*?>>>[\s\S]*?<<<THOUGHT_END>>>\s*)+)/);

    if (thoughtSequenceMatch && role === 'assistant') {
        console.log("Rendering thought block:", thoughtSequenceMatch[0].substring(0, 50) + "...");
        const matchIndex = thoughtSequenceMatch.index!;
        const matchLength = thoughtSequenceMatch[0].length;
        const before = content.substring(0, matchIndex);
        const rawThoughtBlock = thoughtSequenceMatch[0]; // Contains all thoughts
        const after = content.substring(matchIndex + matchLength);

        return (
            <div className="space-y-2">
                <MessageRenderer content={before} role={role} isFinished={isFinished} />
                <ThoughtContainer rawContent={rawThoughtBlock} role={role} isFinished={isFinished} />
                <MessageRenderer content={after} role={role} isFinished={isFinished} />
            </div>
        );
    }

    // 2. Check for ECharts JSON (Python-generated Chart)
    const echartMatch = content.match(/<<<ECHART_JSON:([\s\S]*?)>>>/);
    if (echartMatch && role === 'assistant') {
        const matchIndex = echartMatch.index!;
        const matchLength = echartMatch[0].length;
        const before = content.substring(0, matchIndex);
        const jsonStr = echartMatch[1];
        const after = content.substring(matchIndex + matchLength);

        let option = {};
        try {
            option = JSON.parse(jsonStr);
            console.log("ECharts JSON:", option);
        } catch (e) {
            console.error("Failed to parse ECharts JSON", e);
        }

        return (
            <div className="space-y-4">
                <MessageRenderer content={before} role={role} isFinished={isFinished} />
                <div className="w-full h-96 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm my-4">
                    <ReactECharts
                        option={option}
                        style={{ height: '100%', width: '100%' }}
                        notMerge={true}
                        lazyUpdate={true}
                    />
                </div>
                <MessageRenderer content={after} role={role} isFinished={isFinished} />
            </div>
        );
    }

    // 3. Check for Data Table
    const tableMatch = content.match(/<<<DATA_TABLE:([\s\S]*?)>>>/);
    if (tableMatch && role === 'assistant') {
        const matchIndex = tableMatch.index!;
        const matchLength = tableMatch[0].length;
        const before = content.substring(0, matchIndex);
        const jsonStr = tableMatch[1];
        const after = content.substring(matchIndex + matchLength);

        let data = [];
        try {
            data = JSON.parse(jsonStr);
        } catch (e) {
            console.error("Failed to parse Table JSON", e);
        }

        return (
            <div className="space-y-4">
                <MessageRenderer content={before} role={role} isFinished={isFinished} />
                <DataTable data={data} />
                <MessageRenderer content={after} role={role} isFinished={isFinished} />
            </div>
        );
    }

    // 4. Check for Collapsible Python
    const pythonMatch = content.match(/<<<COLLAPSIBLE_PYTHON_START>>>([\s\S]*?)<<<COLLAPSIBLE_PYTHON_END>>>/);
    if (pythonMatch && role === 'assistant') {
        const matchIndex = pythonMatch.index!;
        const matchLength = pythonMatch[0].length;
        const before = content.substring(0, matchIndex);
        const codeContent = pythonMatch[1].trim();
        const after = content.substring(matchIndex + matchLength);

        return (
            <div className="space-y-4">
                <MessageRenderer content={before} role={role} isFinished={isFinished} />
                <CollapsiblePython code={codeContent} />
                <MessageRenderer content={after} role={role} isFinished={isFinished} />
            </div>
        );
    }

    // 5. Check for Collapsible SQL
    const sqlMatch = content.match(/<<<COLLAPSIBLE_SQL_START>>>([\s\S]*?)<<<COLLAPSIBLE_SQL_END>>>/);
    if (sqlMatch && role === 'assistant') {
        const matchIndex = sqlMatch.index!;
        const matchLength = sqlMatch[0].length;
        const before = content.substring(0, matchIndex);
        const sqlContent = sqlMatch[1].trim();
        const after = content.substring(matchIndex + matchLength);

        return (
            <div className="space-y-4">
                <MessageRenderer content={before} role={role} isFinished={isFinished} />
                <CollapsibleSQL sql={sqlContent} />
                <MessageRenderer content={after} role={role} isFinished={isFinished} />
            </div>
        );
    }

    return <MarkdownRenderer content={content} />;
}


function CollapsibleSQL({ sql }: { sql: string }) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="my-1 border border-indigo-100 dark:border-indigo-900/50 rounded-lg overflow-hidden bg-white dark:bg-slate-900 shadow-sm transition-all hover:border-indigo-200 dark:hover:border-indigo-800">
            <div
                onClick={() => setIsOpen(!isOpen)}
                className="px-4 py-2.5 bg-indigo-50/50 dark:bg-indigo-950/50 flex items-center justify-between cursor-pointer select-none group"
            >
                <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400 font-bold text-sm">
                    <span className="p-1 bg-indigo-100 dark:bg-indigo-900/50 rounded text-indigo-600 dark:text-indigo-400">
                        <Code2 size={14} />
                    </span>
                    Database Query (PostgreSQL)
                </div>
                {isOpen ? <ChevronUp size={16} className="text-indigo-400 group-hover:text-indigo-600" /> : <ChevronDown size={16} className="text-indigo-400 group-hover:text-indigo-600" />}
            </div>
            {isOpen && (
                <div className="border-t border-blue-50 bg-[#1e1e1e]">
                    <SyntaxHighlighter
                        language="sql"
                        style={vscDarkPlus}
                        customStyle={{
                            margin: 0,
                            padding: '1rem',
                            fontSize: '0.85rem',
                            backgroundColor: 'transparent'
                        }}
                    >
                        {sql}
                    </SyntaxHighlighter>
                </div>
            )}
        </div>
    );
}

function CollapsiblePython({ code }: { code: string }) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="my-1 border border-emerald-100 dark:border-emerald-900/50 rounded-lg overflow-hidden bg-white dark:bg-slate-900 shadow-sm transition-all hover:border-emerald-200 dark:hover:border-emerald-800">
            <div
                onClick={() => setIsOpen(!isOpen)}
                className="px-4 py-2.5 bg-emerald-50/50 dark:bg-emerald-950/50 flex items-center justify-between cursor-pointer select-none group"
            >
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-bold text-sm">
                    <span className="p-1 bg-emerald-100 dark:bg-emerald-900/50 rounded text-emerald-600 dark:text-emerald-400">
                        <Code2 size={14} />
                    </span>
                    Python Visualization Code
                </div>
                {isOpen ? <ChevronUp size={16} className="text-emerald-400 group-hover:text-emerald-600" /> : <ChevronDown size={16} className="text-emerald-400 group-hover:text-emerald-600" />}
            </div>
            {isOpen && (
                <div className="border-t border-emerald-50 bg-[#1e1e1e]">
                    <SyntaxHighlighter
                        language="python"
                        style={vscDarkPlus}
                        customStyle={{
                            margin: 0,
                            padding: '1rem',
                            fontSize: '0.85rem',
                            backgroundColor: 'transparent'
                        }}
                    >
                        {code}
                    </SyntaxHighlighter>
                </div>
            )}
        </div>
    );
}

function MarkdownRenderer({ content }: { content: string }) {
    return (
        <div className="prose prose-sm max-w-none prose-p:leading-relaxed prose-pre:p-0 prose-pre:bg-transparent prose-img:rounded-xl prose-img:max-w-md prose-img:mx-auto">
            <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={{
                    code({ className, children, ...props }: any) {
                        const match = /language-(\w+)/.exec(className || '');
                        return match ? (
                            <div className="rounded-lg overflow-hidden my-1.5 border border-gray-800 max-w-full overflow-x-auto">
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
                            <code className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-sm font-mono text-pink-600 dark:text-pink-400" {...props}>
                                {children}
                            </code>
                        );
                    },
                    table({ children }) {
                        return (
                            <div className="overflow-x-auto my-1.5 border rounded-lg border-slate-200 dark:border-slate-800 max-w-xl mx-auto backdrop-blur-sm bg-white/50 dark:bg-slate-900/50">
                                <table className="w-full text-left border-collapse">{children}</table>
                            </div>
                        );
                    },
                    thead({ children }) {
                        return <thead className="bg-slate-50 dark:bg-slate-900/80 border-b border-slate-100 dark:border-slate-800">{children}</thead>;
                    },
                    th({ children }) {
                        return <th className="px-4 py-2 font-black text-slate-700 dark:text-slate-400 text-xs uppercase tracking-wider">{children}</th>;
                    },
                    td({ children }) {
                        return <td className="px-4 py-2 border-t border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-400">{children}</td>;
                    },
                    p({ children }) {
                        return <p className="mb-2 last:mb-0 text-slate-700 dark:text-slate-300 leading-relaxed font-medium">{children}</p>;
                    },
                    img({ node, ...props }: any) {
                        return (
                            <div className="my-4 flex justify-center">
                                <img className="rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm max-w-md w-full object-cover" {...props} />
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
    onSendMessage,
    isLoading = false
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
        <div className={`flex flex-col h-full bg-white/50 dark:bg-slate-950/50 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 transition-colors duration-300 ${className}`}>
            {/* Header */}
            {!hideHeader && (
                <div className="p-4 bg-slate-900 dark:bg-indigo-600 text-white flex items-center justify-between shrink-0 shadow-lg relative z-10">
                    <div className="flex items-center gap-3">
                        <div className="h-8 w-8 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-md">
                            <Bot size={20} className="text-white" />
                        </div>
                        <div>
                            <h3 className="font-bold text-base leading-tight">Stockastic AI</h3>
                            <div className="flex items-center gap-1.5 opacity-90">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                <span className="text-[10px] uppercase font-black tracking-widest">Online</span>
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
            <div className={`flex-1 flex flex-col min-h-0 bg-transparent ${isNewChat ? 'justify-center' : ''}`}>
                {/* Messages Area */}
                <div
                    className={`${isNewChat ? 'flex-none' : 'flex-1 overflow-y-auto'} p-4`}
                    ref={scrollRef}
                >
                    <div className={`${isNewChat ? 'max-w-2xl text-center' : 'max-w-full'} mx-auto w-full space-y-1 py-4 px-4 sm:px-8`}>
                        {isNewChat && (
                            <div className="space-y-4 mb-12 animate-in fade-in slide-in-from-bottom-6 duration-1000">
                                <h1 className="text-5xl font-black text-slate-800 dark:text-slate-100 tracking-tight">
                                    {getGreeting()}, <span className="text-indigo-600 dark:text-indigo-400 italic">Jugal</span>
                                </h1>
                                <p className="text-xl text-slate-500 dark:text-slate-400 font-bold max-w-lg mx-auto leading-relaxed">
                                    The markets are moving. What's on your mind?
                                </p>
                            </div>
                        )}
                        {messages.map((msg) => (
                            <div
                                key={msg.id}
                                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} ${isNewChat ? 'items-center' : ''}`}
                            >
                                <div
                                    className={`rounded-2xl px-6 py-3 text-sm shadow-sm leading-relaxed transition-all ${msg.role === 'user'
                                        ? 'bg-slate-900 dark:bg-indigo-600 text-white border-0 rounded-br-none max-w-[85%]'
                                        : isNewChat
                                            ? 'bg-transparent text-slate-800 dark:text-slate-100 border-none shadow-none w-full'
                                            : 'bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm text-slate-800 dark:text-slate-200 border border-slate-100 dark:border-slate-800 rounded-bl-none w-full max-w-[95%] lg:max-w-[90%]'
                                        }`}
                                >
                                    <div className={isNewChat ? 'text-xl font-bold text-slate-900 dark:text-slate-100 mb-8 leading-normal' : ''}>
                                        {(() => {
                                            // Extract status and finish state
                                            const statusRegex = /\[\[STATUS:(.+?)\]\]/g;
                                            const finishMarker = '[[FINISH]]';

                                            // Check if finished
                                            const isFinished = msg.content.includes(finishMarker);

                                            // Find last status
                                            let lastStatus = null;
                                            let match;
                                            // Reset regex state just in case
                                            statusRegex.lastIndex = 0;
                                            while ((match = statusRegex.exec(msg.content)) !== null) {
                                                lastStatus = match[1];
                                            }

                                            // Clean content for display: Remove tags
                                            let cleanContent = msg.content
                                                .replace(/\[\[STATUS:.*?\]\]/g, '')
                                                .replace(/\[\[FINISH\]\]/g, '')
                                                .trim();

                                            // Special case: Initial legacy "Thinking..."
                                            if (cleanContent === 'Thinking...') cleanContent = '';

                                            return (
                                                <div className="flex flex-col gap-1.5">
                                                    {cleanContent && <MessageRenderer content={cleanContent} role={msg.role} isFinished={isFinished} />}

                                                    {!isFinished && msg.role === 'assistant' && (
                                                        <div className="mt-2">
                                                            <StockLoader status={lastStatus || "Thinking..."} />
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>
                                {!isNewChat && (
                                    <div className="mt-1 px-1">
                                        <span className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">
                                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Input Area */}
                <div className={`${isNewChat ? 'shrink-0' : 'p-4 bg-white/30 dark:bg-slate-950/30 backdrop-blur-md border-t border-slate-100 dark:border-slate-800/50 shrink-0'}`}>
                    <div className={`${isNewChat ? 'max-w-2xl' : 'max-w-full'} mx-auto w-full px-4 sm:px-8`}>
                        <div className={`flex items-center gap-2 bg-white dark:bg-slate-900 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 focus-within:ring-4 focus-within:ring-indigo-100 dark:focus-within:ring-indigo-900/20 transition-all w-full shadow-sm ${isNewChat ? 'py-4 px-6 shadow-xl border-slate-300/50 scale-105' : ''}`}>
                            <button className="p-2 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                                <Paperclip size={18} />
                            </button>
                            <Input
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                                placeholder={isLoading ? "AI is thinking..." : "Ask about your portfolio..."}
                                className="border-none shadow-none focus-visible:ring-0 bg-transparent h-9 px-2 relative text-base text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                                disabled={isLoading}
                            />
                            <button
                                onClick={handleSendMessage}
                                disabled={!inputValue.trim() || isLoading}
                                className="p-2.5 bg-slate-900 dark:bg-indigo-600 text-white rounded-xl hover:bg-slate-800 dark:hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md group"
                            >
                                <Send size={18} className={`${inputValue.trim() ? 'ml-0.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5' : ''} transition-transform`} />
                            </button>
                        </div>
                    </div>
                    {isNewChat && (
                        <div className="text-center mt-6">
                            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">
                                AI can make mistakes. Check important info.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
