'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, StopCircle, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { openChatStream } from '@/lib/chat-sse';
import { cn } from '@/lib/utils';
import { MessageBubble } from './MessageBubble';
import type { ChatBlock, ChatMessage } from './types';

interface ChatInterfaceProps {
    sessionId: string;
    onTitleChange?: () => void;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export function ChatInterface({ sessionId, onTitleChange }: ChatInterfaceProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [prompt, setPrompt] = useState('');
    const [streaming, setStreaming] = useState(false);
    const [loadingHistory, setLoadingHistory] = useState(true);
    const abortRef = useRef<AbortController | null>(null);
    const scrollerRef = useRef<HTMLDivElement | null>(null);

    // Load persisted history when the session changes.
    useEffect(() => {
        let cancelled = false;
        setLoadingHistory(true);
        api.get(`/api/chat/sessions/${sessionId}/messages/`)
            .then((res) => {
                if (cancelled) return;
                setMessages(res.data || []);
            })
            .catch(() => {
                if (!cancelled) setMessages([]);
            })
            .finally(() => {
                if (!cancelled) setLoadingHistory(false);
            });
        return () => {
            cancelled = true;
            abortRef.current?.abort();
        };
    }, [sessionId]);

    // Auto-scroll on new content.
    useEffect(() => {
        scrollerRef.current?.scrollTo({
            top: scrollerRef.current.scrollHeight,
            behavior: 'smooth',
        });
    }, [messages]);

    const handleStop = () => {
        abortRef.current?.abort();
        abortRef.current = null;
        setStreaming(false);
    };

    const handleSend = async () => {
        const text = prompt.trim();
        if (!text || streaming) return;

        const userMsg: ChatMessage = {
            id: `temp-user-${Date.now()}`,
            role: 'user',
            text,
            blocks: [],
            created_at: new Date().toISOString(),
        };
        const assistantMsg: ChatMessage = {
            id: `temp-asst-${Date.now()}`,
            role: 'assistant',
            text: '',
            blocks: [],
            created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, userMsg, assistantMsg]);
        setPrompt('');
        setStreaming(true);

        const ac = new AbortController();
        abortRef.current = ac;

        try {
            for await (const frame of openChatStream({
                sessionId,
                prompt: text,
                apiUrl: API_BASE_URL,
                signal: ac.signal,
            })) {
                applyFrame(assistantMsg.id, frame.event, frame.data);
            }
        } catch (err: any) {
            if (ac.signal.aborted) {
                appendBlock(assistantMsg.id, {
                    kind: 'text',
                    text: '\n\n[stopped]',
                });
            } else {
                appendBlock(assistantMsg.id, {
                    kind: 'text',
                    text: `\n\nError: ${err?.message || 'stream failed'}`,
                });
            }
        } finally {
            abortRef.current = null;
            setStreaming(false);
            onTitleChange?.();
        }
    };

    const appendBlock = (msgId: string, block: ChatBlock) => {
        setMessages((prev) =>
            prev.map((m) => (m.id === msgId ? { ...m, blocks: [...m.blocks, block] } : m)),
        );
    };

    const applyFrame = (assistantId: string, event: string, data: any) => {
        setMessages((prev) =>
            prev.map((m) => {
                if (m.id !== assistantId) return m;
                const blocks = [...m.blocks];
                switch (event) {
                    case 'assistant_start':
                        return m;
                    case 'text': {
                        const last = blocks[blocks.length - 1];
                        if (
                            last &&
                            last.kind === 'text' &&
                            last.subagent === data.subagent
                        ) {
                            blocks[blocks.length - 1] = {
                                ...last,
                                text: last.text + data.text,
                            };
                        } else {
                            blocks.push({
                                kind: 'text',
                                subagent: data.subagent,
                                text: data.text,
                            });
                        }
                        return { ...m, blocks, text: m.text + data.text };
                    }
                    case 'thinking': {
                        const last = blocks[blocks.length - 1];
                        if (
                            last &&
                            last.kind === 'thinking' &&
                            last.subagent === data.subagent
                        ) {
                            blocks[blocks.length - 1] = {
                                ...last,
                                text: last.text + data.text,
                            };
                        } else {
                            blocks.push({
                                kind: 'thinking',
                                subagent: data.subagent,
                                text: data.text,
                            });
                        }
                        return { ...m, blocks };
                    }
                    case 'subagent_start':
                        blocks.push({
                            kind: 'subagent_start',
                            subagent: data.subagent,
                            parent: data.parent,
                            model: data.model,
                        });
                        return { ...m, blocks };
                    case 'tool_use':
                        blocks.push({
                            kind: 'tool_use',
                            subagent: data.subagent,
                            tool: data.tool,
                            input: data.input || {},
                            id: data.id,
                        });
                        return { ...m, blocks };
                    case 'tool_result':
                        blocks.push({
                            kind: 'tool_result',
                            subagent: data.subagent,
                            id: data.id,
                            is_error: !!data.is_error,
                            text: data.text || '',
                        });
                        return { ...m, blocks };
                    case 'card':
                        blocks.push({
                            kind: 'card',
                            type: data.type,
                            data: data.data,
                            tool: data.tool,
                        });
                        return { ...m, blocks };
                    case 'usage':
                        return {
                            ...m,
                            input_tokens: data.input_tokens,
                            output_tokens: data.output_tokens,
                            cache_read_tokens: data.cache_read_input_tokens,
                            cache_creation_tokens: data.cache_creation_input_tokens,
                        };
                    case 'error':
                        blocks.push({ kind: 'text', text: `\n\nError: ${data.message}` });
                        return { ...m, blocks };
                    case 'done':
                    case 'assistant_end':
                    default:
                        return m;
                }
            }),
        );
    };

    return (
        <div className="flex flex-col h-full">
            <div ref={scrollerRef} className="flex-1 overflow-y-auto px-4 py-6 custom-scrollbar">
                <div className="max-w-5xl mx-auto space-y-4">
                    {loadingHistory ? (
                        <div className="text-sm text-muted-foreground flex items-center gap-2">
                            <Loader2 size={14} className="animate-spin" /> Loading history…
                        </div>
                    ) : messages.length === 0 ? (
                        <Suggestions onPick={(s) => setPrompt(s)} />
                    ) : (
                        messages.map((m) => <MessageBubble key={m.id} message={m} />)
                    )}
                </div>
            </div>
            <Composer
                prompt={prompt}
                onChange={setPrompt}
                onSend={handleSend}
                onStop={handleStop}
                streaming={streaming}
            />
        </div>
    );
}

function Composer({
    prompt,
    onChange,
    onSend,
    onStop,
    streaming,
}: {
    prompt: string;
    onChange: (v: string) => void;
    onSend: () => void;
    onStop: () => void;
    streaming: boolean;
}) {
    const taRef = useRef<HTMLTextAreaElement | null>(null);
    // Auto-grow.
    useEffect(() => {
        const ta = taRef.current;
        if (!ta) return;
        ta.style.height = 'auto';
        ta.style.height = Math.min(200, ta.scrollHeight) + 'px';
    }, [prompt]);

    return (
        <div className="border-t border-border bg-background p-4">
            <div className="max-w-5xl mx-auto flex items-end gap-2">
                <textarea
                    ref={taRef}
                    value={prompt}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            onSend();
                        }
                    }}
                    placeholder="Ask about a ticker, the market, or your portfolio. Shift+Enter for newline."
                    rows={1}
                    disabled={streaming}
                    className={cn(
                        'flex-1 resize-none rounded-md border border-border bg-card px-3 py-2 text-sm',
                        'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring',
                        'disabled:opacity-60',
                    )}
                />
                {streaming ? (
                    <button
                        onClick={onStop}
                        className="px-3 py-2 rounded-md border border-border text-sm font-medium text-foreground hover:bg-accent transition-colors flex items-center gap-1.5"
                    >
                        <StopCircle size={14} />
                        Stop
                    </button>
                ) : (
                    <button
                        onClick={onSend}
                        disabled={!prompt.trim()}
                        className={cn(
                            'px-3 py-2 rounded-md text-sm font-medium flex items-center gap-1.5 transition-opacity',
                            prompt.trim()
                                ? 'bg-foreground text-background hover:opacity-90'
                                : 'bg-muted text-muted-foreground cursor-not-allowed',
                        )}
                    >
                        <Send size={14} />
                        Send
                    </button>
                )}
            </div>
        </div>
    );
}

function Suggestions({ onPick }: { onPick: (s: string) => void }) {
    const items = [
        "What's NEPSE doing today?",
        'Give me technicals on NABIL',
        'How is my portfolio performing?',
        'Should I add NICA at current levels?',
    ];
    return (
        <div className="flex flex-col items-center text-center py-12 gap-4">
            <div>
                <div className="text-lg font-semibold text-foreground tracking-tight">Where would you like to start?</div>
                <div className="text-sm text-muted-foreground mt-1">
                    Pick a starter or ask anything about Nepal&apos;s equity market.
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 w-full max-w-xl">
                {items.map((q) => (
                    <button
                        key={q}
                        onClick={() => onPick(q)}
                        className="text-left text-sm px-3 py-2 rounded-md border border-border bg-card hover:bg-accent transition-colors text-foreground"
                    >
                        {q}
                    </button>
                ))}
            </div>
        </div>
    );
}
