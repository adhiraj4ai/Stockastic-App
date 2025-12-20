'use client';

import { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Paperclip, Bot, Pin, PinOff, Maximize2, ChevronDown, ChevronRight, ChevronUp, Code2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
                className="flex items-center gap-2 cursor-pointer text-gray-400 hover:text-gray-600 transition-colors select-none"
            >
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <div className="font-mono text-[10px] uppercase tracking-wider">
                    Process & Reasoning
                </div>
            </div>
            {isOpen && (
                <div
                    ref={containerRef}
                    className="mt-2 pl-6 overflow-y-auto max-h-60 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent"
                >
                    <div className="flex flex-col gap-4 text-[13px] font-mono text-gray-600 [&_div.prose]:font-mono [&_div.prose]:text-[13px] [&_div.prose]:max-w-none [&_pre]:!text-[11px] [&_pre]:!bg-white [&_pre]:!p-2 [&_pre]:!rounded-md [&_pre]:!border [&_pre]:!border-gray-200">
                        {thoughts.map((item, idx) => (
                            <div key={idx}>
                                <div className="font-bold text-gray-500 mb-0.5 uppercase text-[9px] tracking-widest">{item.header}</div>
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
                <div className="w-full h-96 bg-white rounded-xl border border-gray-200 p-4 shadow-sm my-4">
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
        <div className="my-1 border border-blue-100 rounded-lg overflow-hidden bg-white shadow-sm transition-all hover:border-blue-200">
            <div
                onClick={() => setIsOpen(!isOpen)}
                className="px-4 py-2.5 bg-blue-50/50 flex items-center justify-between cursor-pointer select-none group"
            >
                <div className="flex items-center gap-2 text-blue-700 font-medium text-sm">
                    <span className="p-1 bg-blue-100 rounded">
                        <Code2 size={14} className="text-blue-600" />
                    </span>
                    Database Query (PostgreSQL)
                </div>
                {isOpen ? <ChevronUp size={16} className="text-blue-400 group-hover:text-blue-600" /> : <ChevronDown size={16} className="text-blue-400 group-hover:text-blue-600" />}
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
        <div className="my-1 border border-emerald-100 rounded-lg overflow-hidden bg-white shadow-sm transition-all hover:border-emerald-200">
            <div
                onClick={() => setIsOpen(!isOpen)}
                className="px-4 py-2.5 bg-emerald-50/50 flex items-center justify-between cursor-pointer select-none group"
            >
                <div className="flex items-center gap-2 text-emerald-700 font-medium text-sm">
                    <span className="p-1 bg-emerald-100 rounded">
                        <Code2 size={14} className="text-emerald-600" />
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
                remarkPlugins={[remarkGfm]}
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
                            <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono text-pink-600" {...props}>
                                {children}
                            </code>
                        );
                    },
                    table({ children }) {
                        return (
                            <div className="overflow-x-auto my-1.5 border rounded-lg border-gray-200 max-w-xl mx-auto backdrop-blur-sm bg-white/50">
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
                    <div className={`${isNewChat ? 'max-w-2xl text-center' : 'max-w-full'} mx-auto w-full space-y-1 py-4 px-4 sm:px-8`}>
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
                                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} ${isNewChat ? 'items-center' : ''}`}
                            >
                                <div
                                    className={`rounded-2xl px-6 py-2.5 text-sm shadow-sm leading-relaxed ${msg.role === 'user'
                                        ? 'bg-white text-gray-900 border border-gray-100 rounded-br-none max-w-[85%]'
                                        : isNewChat
                                            ? 'bg-transparent text-gray-800 border-none shadow-none w-full'
                                            : 'bg-[#fcfafd] text-gray-800 border border-gray-100 rounded-bl-none w-full max-w-[95%] lg:max-w-[90%]'
                                        }`}
                                >
                                    <div className={isNewChat ? 'text-lg font-medium text-gray-900 mb-8' : ''}>
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
                                        <span className="text-[10px] font-medium text-gray-400">
                                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                )}
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
