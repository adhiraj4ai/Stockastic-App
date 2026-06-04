'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, X, Send, Paperclip, Bot, Pin, PinOff, Maximize2, ChevronDown, ChevronRight, ChevronUp, Code2, Sparkles, User } from 'lucide-react';
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
    timestamp: string | Date;
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

    const thoughts: { header: string; content: string }[] = [];
    const regex = /<<<THOUGHT_START:(.*?)>>>([\s\S]*?)<<<THOUGHT_END>>>/g;
    let match;
    while ((match = regex.exec(rawContent)) !== null) {
        thoughts.push({ header: match[1], content: match[2].trim() });
    }

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
                <div className="font-sans text-[10px] font-bold tracking-tight">
                    Process & reasoning
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
                                <div className="font-bold text-slate-400 dark:text-slate-500 text-[9px] tracking-tight">{item.header}</div>
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

    const thoughtSequenceMatch = content.match(/((?:<<<THOUGHT_START:[\s\S]*?>>>[\s\S]*?<<<THOUGHT_END>>>\s*)+)/);

    if (thoughtSequenceMatch && role === 'assistant') {
        const matchIndex = thoughtSequenceMatch.index!;
        const matchLength = thoughtSequenceMatch[0].length;
        const before = content.substring(0, matchIndex);
        const rawThoughtBlock = thoughtSequenceMatch[0];
        const after = content.substring(matchIndex + matchLength);

        return (
            <div className="space-y-2">
                <MessageRenderer content={before} role={role} isFinished={isFinished} />
                <ThoughtContainer rawContent={rawThoughtBlock} role={role} isFinished={isFinished} />
                <MessageRenderer content={after} role={role} isFinished={isFinished} />
            </div>
        );
    }

    const echartMatch = content.match(/<<<ECHART_JSON:([\s\S]*?)>>>/);
    if (echartMatch && role === 'assistant') {
        const matchIndex = echartMatch.index!;
        const matchLength = echartMatch[0].length;
        const before = content.substring(0, matchIndex);
        const jsonStr = echartMatch[1];
        const after = content.substring(matchIndex + matchLength);

        let option = {};
        try { option = JSON.parse(jsonStr); } catch (e) { }

        return (
            <div className="space-y-4">
                <MessageRenderer content={before} role={role} isFinished={isFinished} />
                <div className="w-full h-96 bg-white dark:bg-card rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm my-4">
                    <ReactECharts option={option} style={{ height: '100%', width: '100%' }} notMerge={true} lazyUpdate={true} />
                </div>
                <MessageRenderer content={after} role={role} isFinished={isFinished} />
            </div>
        );
    }

    const tableMatch = content.match(/<<<DATA_TABLE:([\s\S]*?)>>>/);
    if (tableMatch && role === 'assistant') {
        const matchIndex = tableMatch.index!;
        const matchLength = tableMatch[0].length;
        const before = content.substring(0, matchIndex);
        const jsonStr = tableMatch[1];
        const after = content.substring(matchIndex + matchLength);

        let data = [];
        try { data = JSON.parse(jsonStr); } catch (e) { }

        return (
            <div className="space-y-4">
                <MessageRenderer content={before} role={role} isFinished={isFinished} />
                <DataTable data={data} />
                <MessageRenderer content={after} role={role} isFinished={isFinished} />
            </div>
        );
    }

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
        <div className="my-1 border border-indigo-100 dark:border-indigo-900/50 rounded-lg overflow-hidden bg-white dark:bg-card shadow-sm transition-all hover:border-indigo-200 dark:hover:border-indigo-800">
            <div onClick={() => setIsOpen(!isOpen)} className="px-4 py-2.5 bg-indigo-50/50 dark:bg-indigo-950/50 flex items-center justify-between cursor-pointer select-none group">
                <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400 font-bold text-sm">
                    <span className="p-1 bg-indigo-100 dark:bg-indigo-900/50 rounded text-indigo-600 dark:text-indigo-400"><Code2 size={14} /></span>
                    Database Query (PostgreSQL)
                </div>
                {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>
            {isOpen && (
                <div className="border-t border-blue-50 bg-[#1e1e1e]">
                    <SyntaxHighlighter language="sql" style={vscDarkPlus} customStyle={{ margin: 0, padding: '1rem', fontSize: '0.85rem', backgroundColor: 'transparent' }}>{sql}</SyntaxHighlighter>
                </div>
            )}
        </div>
    );
}

function CollapsiblePython({ code }: { code: string }) {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div className="my-1 border border-emerald-100 dark:border-emerald-900/50 rounded-lg overflow-hidden bg-white dark:bg-card shadow-sm transition-all hover:border-emerald-200 dark:hover:border-emerald-800">
            <div onClick={() => setIsOpen(!isOpen)} className="px-4 py-2.5 bg-emerald-50/50 dark:bg-emerald-950/50 flex items-center justify-between cursor-pointer select-none group">
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-bold text-sm">
                    <span className="p-1 bg-emerald-100 dark:bg-emerald-900/50 rounded text-emerald-600 dark:text-emerald-400"><Code2 size={14} /></span>
                    Python Visualization Code
                </div>
                {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </div>
            {isOpen && (
                <div className="border-t border-emerald-50 bg-[#1e1e1e]">
                    <SyntaxHighlighter language="python" style={vscDarkPlus} customStyle={{ margin: 0, padding: '1rem', fontSize: '0.85rem', backgroundColor: 'transparent' }}>{code}</SyntaxHighlighter>
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
                                <div className="bg-gray-800 px-4 py-1 text-[10px] text-gray-400 font-mono flex justify-between items-center"><span>{match[1].toUpperCase()}</span></div>
                                <SyntaxHighlighter language={match[1]} style={vscDarkPlus} PreTag="div" customStyle={{ margin: 0, padding: '1rem', fontSize: '12px' }} {...props}>{String(children).replace(/\n$/, '')}</SyntaxHighlighter>
                            </div>
                        ) : (
                            <code className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-sm font-mono text-pink-600 dark:text-pink-400" {...props}>{children}</code>
                        );
                    },
                    table({ children }) { return <div className="overflow-x-auto my-1.5 border rounded-lg border-slate-200 dark:border-slate-800 max-w-xl mx-auto bg-white/50 dark:bg-card"><table className="w-full text-left border-collapse">{children}</table></div>; },
                    thead({ children }) { return <thead className="bg-slate-50 dark:bg-card/80 border-b border-border dark:border-slate-800">{children}</thead>; },
                    th({ children }) { return <th className="px-4 py-2 font-semibold text-slate-700 dark:text-slate-400 text-xs tracking-tight">{children}</th>; },
                    td({ children }) { return <td className="px-4 py-2 border-t border-border dark:border-slate-800 text-slate-600 dark:text-slate-400">{children}</td>; },
                    p({ children }) { return <p className="mb-2 last:mb-0 text-slate-700 dark:text-slate-300 leading-relaxed font-medium">{children}</p>; },
                    img({ node, ...props }: any) { return <div className="my-4 flex justify-center"><img className="rounded-xl border border-border dark:border-slate-800 shadow-sm max-w-md w-full object-cover" {...props} /></div>; }
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
}

export function ChatInterface({ hideHeader = false, messages = [], onSendMessage, isLoading = false, className = '' }: ChatInterfaceProps) {
    const [mounted, setMounted] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => { setMounted(true); }, []);

    // Keep track of previous message count to detect new messages
    const prevMsgCountRef = useRef(messages.length);

    // Auto-scroll logic
    useEffect(() => {
        if (scrollRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
            const isAtBottom = scrollHeight - scrollTop - clientHeight < 150; // 150px tolerance
            const isNewMessage = messages.length > prevMsgCountRef.current;

            // Scroll if we are already at the bottom OR if a new message arrived
            if (isAtBottom || isNewMessage) {
                // Use immediate scroll for responsiveness
                scrollRef.current.scrollTop = scrollRef.current.scrollHeight;

                // Double check for layout shifts
                setTimeout(() => {
                    if (scrollRef.current) {
                        scrollRef.current.scrollTo({
                            top: scrollRef.current.scrollHeight,
                            behavior: 'smooth'
                        });
                    }
                }, 100);
            }
            prevMsgCountRef.current = messages.length;
        }
    }, [messages, isLoading]);

    // Navigation Rail Logic
    const [activeMessageId, setActiveMessageId] = useState<string>('');
    const userMessages = messages.filter(m => m.role === 'user');

    const scrollToMessage = (msgId: string) => {
        const element = document.getElementById(`msg-${msgId}`);
        if (element && scrollRef.current) {
            // Calculate position relative to container
            const containerTop = scrollRef.current.getBoundingClientRect().top;
            const elementTop = element.getBoundingClientRect().top;
            const offset = elementTop - containerTop + scrollRef.current.scrollTop - 20; // 20px padding

            scrollRef.current.scrollTo({ top: offset, behavior: 'smooth' });
            setActiveMessageId(msgId);
        }
    };

    // Scroll Spy
    useEffect(() => {
        const container = scrollRef.current;
        if (!container) return;

        const handleScroll = () => {
            const containerTop = container.getBoundingClientRect().top;
            let currentActiveId = '';

            // Find the user message closest to the top (but not too far below)
            for (const msg of userMessages) {
                const element = document.getElementById(`msg-${msg.id}`);
                if (element) {
                    const rect = element.getBoundingClientRect();
                    const distance = rect.top - containerTop;

                    if (distance < 300 && distance > -rect.height) {
                        currentActiveId = msg.id;
                    }
                }
            }
            if (currentActiveId && currentActiveId !== activeMessageId) {
                setActiveMessageId(currentActiveId);
            }
        };

        container.addEventListener('scroll', handleScroll, { passive: true });
        return () => container.removeEventListener('scroll', handleScroll);
    }, [userMessages, activeMessageId]);

    const handleSendMessage = () => {
        if (!inputValue.trim()) return;
        onSendMessage(inputValue);
        setInputValue('');
    };

    if (!mounted) return null;

    const isNewChat = (messages?.length || 0) === 0;
    const lastUserIndex = messages.findLastIndex(m => m.role === 'user');

    return (
        <div className={`flex h-full bg-transparent relative overflow-hidden font-sans ${className}`}>
            {/* Ambient Ambient Background Glimmer (Pseudo-layer) */}
            <div className="absolute inset-0 pointer-events-none opacity-40 dark:opacity-20 transition-opacity duration-1000">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 rounded-full blur-[120px] animate-float" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-500/10 rounded-full blur-[120px] animate-float" style={{ animationDelay: '-3s' }} />
            </div>

            {/* Right Floating Navigation Rail (The Glowing Line) */}
            {!isNewChat && (
                <div className="absolute right-6 top-1/2 -translate-y-1/2 z-50 flex flex-col items-end gap-3 pointer-events-none">
                    {userMessages.map((msg) => {
                        const isActive = msg.id === activeMessageId;
                        return (
                            <div key={msg.id} className="group flex items-center gap-4 pointer-events-auto">
                                <div className="opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-4 group-hover:translate-x-0 bg-background/80 text-[10px] py-1.5 px-3 rounded-full border border-border/50 text-foreground/70 font-medium tracking-tight shadow-sm pointer-events-none truncate max-w-[180px]">
                                    {msg.content}
                                </div>
                                <button
                                    onClick={() => scrollToMessage(msg.id)}
                                    className={`h-4 rounded-full transition-all duration-500 pointer-events-auto relative ${isActive
                                        ? 'w-1 bg-primary horizon-glow'
                                        : 'w-0.5 bg-border/40 hover:w-0.5 hover:bg-primary/50'
                                        }`}
                                />
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="flex-1 flex flex-col min-h-0 relative z-10 overflow-hidden">
                {/* Minimal Header */}
                {!hideHeader && !isNewChat && (
                    <header className="px-8 py-5 flex items-center justify-between shrink-0 bg-background/5 border-b border-border/10">
                        <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-primary horizon-glow" />
                            <span className="text-xs font-semibold tracking-tight text-foreground/40">
                                Stockastic horizon • <span className="text-primary italic">Gemini 2.0</span>
                            </span>
                        </div>
                    </header>
                )}

                <div className="flex-1 flex flex-col min-h-0 bg-transparent relative">
                    {isNewChat ? (
                        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="space-y-12 max-w-xl"
                            >
                                <div className="space-y-4">
                                    <h1 className="text-5xl lg:text-7xl font-bold text-foreground tracking-tighter leading-none">
                                        Horizon
                                    </h1>
                                    <p className="text-muted-foreground/60 text-lg font-medium tracking-tight">
                                        Your predictive vantage point for global markets.
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    {['Market Breadth', 'TSLA Sentiment', 'NVDA Technicals', 'Portfolio Yield'].map((action) => (
                                        <button
                                            key={action}
                                            onClick={() => onSendMessage(action)}
                                            className="px-6 py-4 rounded-2xl bg-foreground/5 hover:bg-foreground/10 border border-border/10 text-sm font-bold text-foreground/60 transition-all hover:scale-[1.02] active:scale-[0.98] text-left group"
                                        >
                                            <span className="block text-[10px] text-primary tracking-tight mb-1 opacity-50 group-hover:opacity-100 transition-opacity">Insight</span>
                                            {action}
                                        </button>
                                    ))}
                                </div>
                            </motion.div>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col min-h-0">
                            <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar pt-12 pb-32 scroll-smooth">
                                <div className="max-w-4xl mx-auto space-y-24 px-8">
                                    <AnimatePresence initial={false}>
                                        {messages.map((msg, index) => {
                                            const isUser = msg.role === 'user';
                                            const isLastUser = index === lastUserIndex;

                                            return (
                                                <motion.div
                                                    id={`msg-${msg.id}`}
                                                    key={msg.id}
                                                    initial={{ opacity: 0, y: 20 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    className={`group relative ${isUser ? 'flex items-center justify-end' : 'w-full'}`}
                                                >
                                                    {isUser ? (
                                                        <div className={`px-6 py-3 rounded-full border bg-foreground/5 dark:bg-muted border-border/40 transition-all ${isLastUser ? 'border-primary/30 horizon-glow' : 'opacity-60'}`}>
                                                            <span className="text-sm font-bold tracking-tight text-foreground/80">{msg.content}</span>
                                                        </div>
                                                    ) : (
                                                        <div className="space-y-6 w-full">
                                                            <div className="prose dark:prose-invert max-w-none">
                                                                {(() => {
                                                                    const isFinished = msg.content.includes('[[FINISH]]');
                                                                    const cleanContent = msg.content.replace(/\[\[STATUS:.*?\]\]/g, '').replace(/\[\[FINISH\]\]/g, '').trim();
                                                                    const isThinking = cleanContent === 'Thinking...' || !cleanContent;

                                                                    if (isThinking && !isFinished) return null;

                                                                    return (
                                                                        <div className="space-y-4">
                                                                            <MessageRenderer content={cleanContent} role={msg.role} isFinished={isFinished} />
                                                                            {!isFinished && (
                                                                                <div className="flex items-center gap-3 text-xs font-medium tracking-tight text-primary/60">
                                                                                    <div className="w-1.5 h-1.5 rounded-full bg-primary horizon-glow" />
                                                                                    Synthesizing data...
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })()}
                                                            </div>
                                                        </div>
                                                    )}
                                                </motion.div>
                                            );
                                        })}

                                        {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
                                            <div className="flex items-center gap-3 text-xs font-medium tracking-tight text-primary/60">
                                                <div className="w-1.5 h-1.5 rounded-full bg-primary horizon-glow" />
                                                Aligning horizon...
                                            </div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* The Floating Pill Input */}
                    <div className="absolute bottom-10 left-0 right-0 z-40 px-6 pointer-events-none">
                        <div className="max-w-3xl mx-auto pointer-events-auto">
                            <div className="horizon-glass rounded-[2rem] p-2 pr-4 flex items-center transition-all focus-within:horizon-glow group border-border/20 shadow-sm">
                                <div className="p-3 text-muted-foreground/40 group-focus-within:text-primary/60 transition-colors">
                                    <Sparkles size={20} />
                                </div>
                                <Input
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
                                    placeholder="Consult the Horizon..."
                                    className="border-none shadow-none focus-visible:ring-0 bg-transparent px-2 text-lg font-medium placeholder:text-muted-foreground/30 placeholder:italic placeholder:font-normal h-14"
                                    disabled={isLoading}
                                    autoFocus
                                />
                                <button
                                    onClick={handleSendMessage}
                                    disabled={!inputValue.trim() || isLoading}
                                    className={`ml-2 p-3.5 rounded-2xl transition-all ${inputValue.trim()
                                        ? 'bg-primary text-white scale-100 opacity-100 shadow-xl'
                                        : 'bg-foreground/5 text-foreground/20 scale-90 opacity-50'
                                        }`}
                                >
                                    <Send size={18} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
