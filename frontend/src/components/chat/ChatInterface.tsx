'use client';

import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { Send, StopCircle, Loader2 } from 'lucide-react';
import api, { savedApi, API_BASE_URL } from '@/lib/api';
import { openChatStream } from '@/lib/chat-sse';
import { cn } from '@/lib/utils';
import { MessageBubble } from './MessageBubble';
import { WorkbenchContext, type WorkbenchTool } from './WorkbenchContext';
import { WorkbenchPanel } from './WorkbenchPanel';
import type { ChatBlock, ChatMessage, SavedAnalysis } from './types';
import { filterCommands } from '@/lib/chat-commands';
import { CommandHintMenu } from './CommandHintMenu';
import { SaveAnalysisModal } from './SaveAnalysisModal';
import { SavedHintChip } from './SavedHintChip';

interface ChatInterfaceProps {
    sessionId: string;
    onTitleChange?: () => void;
    /** Sent automatically once after history loads (home-page omnibox handoff). */
    initialPrompt?: string;
}

const TIMELINE_WINDOW = 10;
const RENDER_WINDOW = 20; // ~10 Q&A pairs rendered at a time
const PAGE_SIZE = 20;     // messages to prepend per scroll-to-top

export function ChatInterface({ sessionId, onTitleChange, initialPrompt }: ChatInterfaceProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [prompt, setPrompt] = useState('');
    const [streaming, setStreaming] = useState(false);
    const [loadingHistory, setLoadingHistory] = useState(true);
    const [selectedTool, setSelectedTool] = useState<WorkbenchTool | null>(null);
    const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
    const [visibleFrom, setVisibleFrom] = useState(0);
    const [bookmarkMessageId, setBookmarkMessageId] = useState<string | null>(null);
    // Server message ids already saved as bookmarks (drives the filled icon + blocks duplicates).
    const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
    const abortRef = useRef<AbortController | null>(null);
    const scrollerRef = useRef<HTMLDivElement | null>(null);
    const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    const messagesRef = useRef(messages);
    messagesRef.current = messages;
    const visibleFromRef = useRef(0);
    visibleFromRef.current = visibleFrom;
    // Saved scroll position before prepending older messages, to restore after render
    const prevScrollRef = useRef<{ height: number; top: number } | null>(null);
    // ID to scroll into view after expanding the render window via timeline navigation
    const pendingScrollIdRef = useRef<string | null>(null);

    // Load persisted history when the session changes.
    useEffect(() => {
        let cancelled = false;
        setLoadingHistory(true);
        setVisibleFrom(0);
        api.get(`/api/chat/sessions/${sessionId}/messages/`)
            .then((res) => {
                if (cancelled) return;
                const loaded: ChatMessage[] = res.data || [];
                setMessages(loaded);
                setVisibleFrom(Math.max(0, loaded.length - RENDER_WINDOW));
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

    // Load which messages in this session are already bookmarked (for the filled icon).
    useEffect(() => {
        let cancelled = false;
        savedApi
            .list({ session: sessionId })
            .then((res) => {
                if (cancelled) return;
                const data = res.data as SavedAnalysis[] | { results?: SavedAnalysis[] };
                const arr = Array.isArray(data) ? data : data?.results || [];
                setBookmarkedIds(
                    new Set(arr.map((s) => s.source_message).filter(Boolean) as string[]),
                );
            })
            .catch(() => {
                /* non-fatal: icons just won't pre-fill */
            });
        return () => {
            cancelled = true;
        };
    }, [sessionId]);

    // Auto-scroll on new content (only when not in the middle of scroll-restoration).
    useEffect(() => {
        if (prevScrollRef.current) return; // useLayoutEffect will handle scroll instead
        scrollerRef.current?.scrollTo({
            top: scrollerRef.current.scrollHeight,
            behavior: 'smooth',
        });
    }, [messages]);

    // Restore scroll position after prepending older messages so the viewport doesn't jump.
    // Also handles pending timeline navigations to messages outside the current window.
    useLayoutEffect(() => {
        const saved = prevScrollRef.current;
        if (saved && scrollerRef.current) {
            const scroller = scrollerRef.current;
            scroller.scrollTop = scroller.scrollHeight - saved.height + saved.top;
            prevScrollRef.current = null;
            return;
        }
        const pendingId = pendingScrollIdRef.current;
        if (pendingId) {
            const el = messageRefs.current.get(pendingId);
            if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
            pendingScrollIdRef.current = null;
        }
    }, [visibleFrom]);

    // Derived: only user messages, for the timeline
    const userMessages = messages.filter(m => m.role === 'user');

    // Track active user message on scroll + trigger infinite scroll upward
    const handleScroll = useCallback(() => {
        const scroller = scrollerRef.current;
        if (!scroller) return;

        // Infinite scroll: load previous PAGE_SIZE messages when near top
        if (scroller.scrollTop < 80 && visibleFromRef.current > 0 && !prevScrollRef.current) {
            prevScrollRef.current = { height: scroller.scrollHeight, top: scroller.scrollTop };
            setVisibleFrom(prev => Math.max(0, prev - PAGE_SIZE));
        }

        // Active message tracking for timeline
        const top = scroller.getBoundingClientRect().top;
        let closestId: string | null = null;
        let closestDist = Infinity;
        for (const msg of messagesRef.current) {
            if (msg.role !== 'user') continue;
            const el = messageRefs.current.get(msg.id);
            if (!el) continue;
            const dist = Math.abs(el.getBoundingClientRect().top - top);
            if (dist < closestDist) { closestDist = dist; closestId = msg.id; }
        }
        if (closestId) setActiveMessageId(closestId);
    }, []);

    useEffect(() => {
        const scroller = scrollerRef.current;
        if (!scroller) return;
        scroller.addEventListener('scroll', handleScroll, { passive: true });
        return () => scroller.removeEventListener('scroll', handleScroll);
    }, [handleScroll, loadingHistory]);


    const scrollToMessage = useCallback((id: string) => {
        setActiveMessageId(id);
        const msgIdx = messagesRef.current.findIndex(m => m.id === id);
        if (msgIdx === -1) return;
        if (msgIdx < visibleFromRef.current) {
            // Expand the window to include this message, then scroll once rendered
            pendingScrollIdRef.current = id;
            prevScrollRef.current = null;
            setVisibleFrom(Math.max(0, msgIdx));
        } else {
            const el = messageRefs.current.get(id);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, []);

    const handleStop = () => {
        abortRef.current?.abort();
        abortRef.current = null;
        setStreaming(false);
    };

    const sendPrompt = async (raw: string) => {
        const text = raw.trim();
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
        // Snap window to latest so new messages are always visible
        setVisibleFrom(Math.max(0, messages.length + 2 - RENDER_WINDOW));
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
                // Record the persisted server id (from the `done` frame) so the
                // just-streamed answer becomes bookmarkable. We keep the React key on
                // the temp id to avoid remounting the bubble; bookmarking uses serverId.
                if (frame.event === 'done' && frame.data?.message_id) {
                    const serverId = frame.data.message_id;
                    setMessages((prev) =>
                        prev.map((mm) =>
                            mm.id === assistantMsg.id ? { ...mm, serverId } : mm,
                        ),
                    );
                }
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

    const handleSend = () => sendPrompt(prompt);

    // Auto-send a handed-off prompt (e.g. /chat?q=… from the home omnibox)
    // exactly once, after history has loaded.
    const initialSentRef = useRef(false);
    useEffect(() => {
        if (!initialPrompt || initialSentRef.current || loadingHistory) return;
        initialSentRef.current = true;
        sendPrompt(initialPrompt);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialPrompt, loadingHistory]);

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
        <WorkbenchContext.Provider value={{ selectedTool, selectTool: setSelectedTool }}>
            <div className="flex h-full">
                {/* Timeline strip */}
                {!loadingHistory && userMessages.length > 0 && (
                    <ChatTimeline
                        messages={userMessages}
                        activeId={activeMessageId}
                        onNavigate={scrollToMessage}
                    />
                )}

                {/* Main chat column */}
                <div className="flex flex-col flex-1 min-w-0">
                    <div ref={scrollerRef} data-testid="chat-scroller" className="flex-1 overflow-y-auto px-4 py-6 custom-scrollbar">
                        <div className="max-w-5xl mx-auto space-y-4">
                            {loadingHistory ? (
                                <div className="text-sm text-muted-foreground flex items-center gap-2">
                                    <Loader2 size={14} className="animate-spin" /> Loading history…
                                </div>
                            ) : messages.length === 0 ? (
                                <Suggestions onPick={(s) => setPrompt(s)} />
                            ) : (
                                <>
                                    {visibleFrom > 0 && (
                                        <div className="flex items-center gap-2 py-1 select-none">
                                            <div className="h-px flex-1 bg-border/40" />
                                            <span className="text-[11px] text-muted-foreground/60 font-medium">
                                                {visibleFrom} older {visibleFrom === 1 ? 'message' : 'messages'} — scroll up to load
                                            </span>
                                            <div className="h-px flex-1 bg-border/40" />
                                        </div>
                                    )}
                                    {messages.slice(visibleFrom).map((m) => (
                                        <div
                                            key={m.id}
                                            ref={(el) => {
                                                if (el) messageRefs.current.set(m.id, el);
                                                else messageRefs.current.delete(m.id);
                                            }}
                                        >
                                            <MessageBubble
                                                message={m}
                                                onBookmark={(id) => setBookmarkMessageId(id)}
                                                bookmarked={bookmarkedIds.has(m.serverId ?? m.id)}
                                            />
                                        </div>
                                    ))}
                                </>
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

                {/* Workbench panel */}
                {selectedTool && (
                    <WorkbenchPanel tool={selectedTool} onClose={() => setSelectedTool(null)} />
                )}
            </div>

            {bookmarkMessageId && sessionId && (
                <SaveAnalysisModal
                    key={bookmarkMessageId}
                    sessionId={sessionId}
                    messageId={bookmarkMessageId}
                    onClose={() => setBookmarkMessageId(null)}
                    onSaved={() => {
                        const savedId = bookmarkMessageId;
                        setBookmarkedIds((prev) => {
                            const next = new Set(prev);
                            if (savedId) next.add(savedId);
                            return next;
                        });
                        setBookmarkMessageId(null);
                    }}
                />
            )}
        </WorkbenchContext.Provider>
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
    const [selectedIndex, setSelectedIndex] = useState(0);

    /**
     * Dismissal tracking (two-mechanism approach):
     *
     * 1. `dismissed` state: set true by Escape; reset to false whenever the
     *    user types a new character (onChange with a changed value). State
     *    ensures a re-render happens immediately when Escape is pressed.
     *
     * 2. `lastAppliedRef` ref: records the prompt string that was set when
     *    the user applied a command (Enter/Tab on a hint). When the current
     *    prompt equals this value the menu stays closed even though `dismissed`
     *    is false (applying already called onChange which reset dismissed).
     *    This is the key guard for the "type /help → Enter applies → Enter
     *    sends" flow: after applying, prompt === '/help ' === lastApplied, so
     *    menuOpen is false, and the next Enter hits the normal send branch.
     *
     * Typing any character resets both: dismissed → false (via onChange),
     * lastAppliedRef → null (via onChange).
     */
    const [dismissed, setDismissed] = useState(false);
    const lastAppliedRef = useRef<string | null>(null);

    const hints = filterCommands(prompt);
    const menuOpen =
        hints.length > 0 &&
        !streaming &&
        !dismissed &&
        prompt !== lastAppliedRef.current;

    // Reset selectedIndex to 0 whenever the prompt changes (typing narrows the list).
    useEffect(() => {
        setSelectedIndex(0);
    }, [prompt]);

    // Auto-grow textarea.
    useEffect(() => {
        const ta = taRef.current;
        if (!ta) return;
        ta.style.height = 'auto';
        ta.style.height = Math.min(200, ta.scrollHeight) + 'px';
    }, [prompt]);

    const applyCommand = useCallback((item: { command: string }) => {
        const newVal = item.command + ' ';
        // Track what was applied; menu won't reopen for this exact string.
        lastAppliedRef.current = newVal;
        onChange(newVal);
        taRef.current?.focus();
    }, [onChange]);

    return (
        <div className="border-t border-border bg-background p-4">
            <div className="max-w-5xl mx-auto flex items-end gap-2">
                {/* Relative wrapper so CommandHintMenu can position above the textarea */}
                <div className="flex-1 relative">
                    <SavedHintChip
                        text={prompt}
                        onAttach={(sa: SavedAnalysis) =>
                            onChange(`[Reference saved analysis ${sa.id}: ${sa.title}]\n${prompt}`)
                        }
                    />
                    {menuOpen && (
                        <CommandHintMenu
                            items={hints}
                            selectedIndex={selectedIndex}
                            onSelect={applyCommand}
                        />
                    )}
                    <textarea
                        ref={taRef}
                        value={prompt}
                        onChange={(e) => {
                            // Typing resets both dismissal mechanisms.
                            lastAppliedRef.current = null;
                            setDismissed(false);
                            onChange(e.target.value);
                        }}
                        onKeyDown={(e) => {
                            if (menuOpen) {
                                if (e.key === 'ArrowDown') {
                                    e.preventDefault();
                                    setSelectedIndex((i) => (i + 1) % hints.length);
                                    return;
                                }
                                if (e.key === 'ArrowUp') {
                                    e.preventDefault();
                                    setSelectedIndex((i) => (i - 1 + hints.length) % hints.length);
                                    return;
                                }
                                if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
                                    e.preventDefault();
                                    applyCommand(hints[selectedIndex]);
                                    return;
                                }
                                if (e.key === 'Escape') {
                                    e.preventDefault();
                                    // Close menu without changing prompt; `dismissed` state
                                    // triggers the re-render needed to hide the menu.
                                    setDismissed(true);
                                    return;
                                }
                            }
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                onSend();
                            }
                        }}
                        placeholder="Ask about a ticker, the market, or your portfolio. Shift+Enter for newline."
                        rows={1}
                        disabled={streaming}
                        className={cn(
                            'w-full resize-none rounded-md border border-border bg-card px-3 py-2 text-sm',
                            'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring',
                            'disabled:opacity-60',
                        )}
                    />
                </div>
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

// ─── Chat Timeline ─────────────────────────────────────────────────────────────

const DOCK_MAG = [2, 1.5, 1.2];  // scale at distance 0, 1, 2
const BAR_BASE_W = 12;            // px, inactive base width
const BAR_BASE_H = 3;             // px, inactive base height

function getDockMag(dist: number): number {
    return DOCK_MAG[dist] ?? 1;
}

function ChatTimeline({
    messages,
    activeId,
    onNavigate,
}: {
    messages: ChatMessage[];
    activeId: string | null;
    onNavigate: (id: string) => void;
}) {
    const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
    // Always show the last TIMELINE_WINDOW messages, sliding as new ones arrive
    const start = Math.max(0, messages.length - TIMELINE_WINDOW);
    const visible = messages.slice(start);

    return (
        <div data-testid="chat-timeline" className="w-7 shrink-0 flex flex-col items-center justify-center border-r border-border/50 bg-background select-none">
            <div className="h-[100px] flex flex-col items-center w-full">
                {/* Horizontal bars with dock magnification */}
                <div className="flex-1 flex flex-col justify-evenly items-center w-full py-1">
                    {visible.map((msg, i) => {
                        const globalIdx = start + i;
                        const isActive = msg.id === activeId;
                        const preview = msg.text.slice(0, 80) + (msg.text.length > 80 ? '…' : '');
                        const dist = hoveredIdx !== null ? Math.abs(i - hoveredIdx) : Infinity;
                        const mag = hoveredIdx !== null ? getDockMag(Math.min(dist, 3)) : 1;
                        const barW = Math.round(BAR_BASE_W * mag);
                        const barH = Math.round(BAR_BASE_H * mag);
                        const isHovered = hoveredIdx === i;
                        return (
                            <div
                                key={msg.id}
                                data-testid="timeline-bar-row"
                                className="relative flex items-center justify-center w-full"
                                onMouseEnter={() => setHoveredIdx(i)}
                                onMouseLeave={() => setHoveredIdx(null)}
                            >
                                <button
                                    onClick={() => onNavigate(msg.id)}
                                    style={{
                                        width: barW,
                                        height: barH,
                                        transition: 'width 150ms ease-out, height 150ms ease-out, background-color 150ms ease-out',
                                    }}
                                    className={cn(
                                        'rounded-full',
                                        isActive || isHovered
                                            ? 'bg-amber-400 dark:bg-amber-500'
                                            : dist === 1
                                                ? 'bg-amber-300/70 dark:bg-amber-600/60'
                                                : dist === 2
                                                    ? 'bg-amber-200/50 dark:bg-amber-700/40'
                                                    : 'bg-border/70',
                                    )}
                                />
                                {isHovered && (
                                    <div className="pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 z-50">
                                        <div className="bg-popover border border-border rounded-md px-2.5 py-1.5 shadow-md w-max max-w-[220px]">
                                            <div className="text-[10px] text-muted-foreground mb-0.5 font-medium">Q{globalIdx + 1}</div>
                                            <div className="text-[11px] text-foreground leading-snug whitespace-normal">{preview}</div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
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
