'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Play, Plus, Trash2, RotateCcw, AlertCircle, Loader2, StopCircle, ArrowLeft, Pencil, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import api from '@/lib/api';
import { openChatStream } from '@/lib/chat-sse';
import { cn } from '@/lib/utils';
import { SubagentBadge } from './SubagentBadge';
import { ToolEventRow } from './ToolEventRow';
import GenUIContainer from './gen-ui/GenUIRegistry';
import type { ChatBlock, ToolResultBlock, ToolUseBlock } from './types';
import { getColorConfig, getIconComponent } from './NotebookDashboard';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface NotebookCell {
    id: string;
    prompt: string;
    running: boolean;
    outputs: ChatBlock[];
    executionCount: number | null;
}

const DEFAULT_PROMPTS = [
    "What's NEPSE doing today?",
    "How is my portfolio performing?",
    "Give me technicals on NABIL",
];

const MarkdownComponents = {
    p: ({ children }: any) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
    ul: ({ children }: any) => <ul className="list-disc pl-5 mb-2 last:mb-0 space-y-1">{children}</ul>,
    ol: ({ children }: any) => <ol className="list-decimal pl-5 mb-2 last:mb-0 space-y-1">{children}</ol>,
    li: ({ children }: any) => <li className="leading-relaxed">{children}</li>,
    h1: ({ children }: any) => <h1 className="text-base font-semibold mt-3 mb-1 first:mt-0">{children}</h1>,
    h2: ({ children }: any) => <h2 className="text-sm font-semibold mt-3 mb-1 first:mt-0">{children}</h2>,
    h3: ({ children }: any) => <h3 className="text-xs font-semibold mt-2 mb-1 first:mt-0">{children}</h3>,
    a: ({ href, children }: any) => (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:text-primary/80">
            {children}
        </a>
    ),
    code: ({ className, children, ...props }: any) => {
        const isInline = !className || !className.includes('language-');
        if (isInline) {
            return (
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono border border-border" {...props}>
                    {children}
                </code>
            );
        }
        return (
            <pre className="overflow-x-auto rounded-md bg-muted/60 p-3 my-2 text-xs font-mono border border-border">
                <code className={className} {...props}>
                    {children}
                </code>
            </pre>
        );
    },
    table: ({ children }: any) => (
        <div className="overflow-x-auto my-2">
            <table className="min-w-full divide-y divide-border border border-border rounded-md text-xs">{children}</table>
        </div>
    ),
    thead: ({ children }: any) => <thead className="bg-muted/50">{children}</thead>,
    tbody: ({ children }: any) => <tbody className="divide-y divide-border">{children}</tbody>,
    tr: ({ children }: any) => <tr>{children}</tr>,
    th: ({ children }: any) => <th className="px-3 py-2 text-left font-semibold text-muted-foreground">{children}</th>,
    td: ({ children }: any) => <td className="px-3 py-2">{children}</td>,
};

export function NotebookInterface({ notebookId }: { notebookId: string }) {
    const router = useRouter();
    const [cells, setCells] = useState<NotebookCell[]>([]);
    const [globalExecutionCount, setGlobalExecutionCount] = useState(0);
    const abortControllersRef = useRef<Record<string, AbortController>>({});
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [loadingSession, setLoadingSession] = useState(true);
    const [loadingCells, setLoadingCells] = useState(true);
    const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [notebookTitle, setNotebookTitle] = useState('Notebook');
    const [notebookColor, setNotebookColor] = useState('slate');
    const [notebookIcon, setNotebookIcon] = useState('file-text');
    const [editingTitle, setEditingTitle] = useState(false);
    const [titleDraft, setTitleDraft] = useState('');

    // Fetch notebook metadata
    useEffect(() => {
        const fetchNotebook = async () => {
            try {
                const res = await api.get(`/api/chat/notebooks/${notebookId}/`);
                setNotebookTitle(res.data.title || 'Notebook');
                setTitleDraft(res.data.title || 'Notebook');
                setNotebookColor(res.data.color || 'slate');
                setNotebookIcon(res.data.icon || 'file-text');
            } catch (err) {
                console.error('Failed to fetch notebook', err);
            }
        };
        fetchNotebook();
    }, [notebookId]);

    // Ensure we have a backend session to run cells in
    useEffect(() => {
        const getOrCreateSession = async () => {
            try {
                const sessionKey = `stockastic_nb_session_${notebookId}`;
                const savedId = localStorage.getItem(sessionKey);
                if (savedId) {
                    setSessionId(savedId);
                    setLoadingSession(false);
                    return;
                }

                const listRes = await api.get('/api/chat/sessions/');
                const sessions = listRes.data?.results || listRes.data || [];
                const existing = sessions.find((s: any) => s.title === `Notebook Session: ${notebookId}`);

                if (existing) {
                    localStorage.setItem(sessionKey, existing.id);
                    setSessionId(existing.id);
                } else {
                    const createRes = await api.post('/api/chat/sessions/', { title: `Notebook Session: ${notebookId}` });
                    localStorage.setItem(sessionKey, createRes.data.id);
                    setSessionId(createRes.data.id);
                }
            } catch (err) {
                console.error('Failed to resolve notebook session', err);
            } finally {
                setLoadingSession(false);
            }
        };

        getOrCreateSession();
    }, [notebookId]);

    // Load persisted cells from Database on mount
    useEffect(() => {
        const loadCells = async () => {
            try {
                const execKey = `stockastic_nb_exec_${notebookId}`;
                const savedCount = localStorage.getItem(execKey);
                if (savedCount) {
                    setGlobalExecutionCount(parseInt(savedCount, 10));
                }

                const res = await api.get(`/api/chat/notebook-cells/?notebook=${notebookId}`);
                const dbCells: any[] = res.data?.results || res.data || [];
                if (dbCells.length > 0) {
                    setCells(
                        dbCells.map((c: any) => ({
                            id: c.id,
                            prompt: c.prompt,
                            running: false,
                            outputs: c.outputs || [],
                            executionCount: c.execution_count,
                        }))
                    );
                } else {
                    // Initialize with default cells and save to DB
                    const initial = DEFAULT_PROMPTS.map((prompt, idx) => ({
                        id: `temp-${Date.now()}-${idx}`,
                        prompt,
                        running: false,
                        outputs: [],
                        executionCount: null,
                    }));
                    setCells(initial);
                    triggerSync(initial, true); // immediate sync
                }
            } catch (err) {
                console.error('Failed to load notebook cells', err);
            } finally {
                setLoadingCells(false);
            }
        };

        loadCells();
    }, [notebookId]);

    // Helper to sync cell configurations and outputs with the backend
    const triggerSync = (cellsToSync: NotebookCell[], immediate = false) => {
        if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);

        const syncCall = async () => {
            try {
                const payload = cellsToSync.map((c) => ({
                    id: c.id.startsWith('temp-') ? undefined : c.id,
                    prompt: c.prompt,
                    execution_count: c.executionCount,
                    outputs: c.outputs,
                }));
                const res = await api.post(`/api/chat/notebook-cells/sync/?notebook=${notebookId}`, payload);
                const returned = res.data;
                setCells(prev => {
                    const hasChanges = returned.some((r: any, idx: number) => !prev[idx] || prev[idx].id !== r.id);
                    if (!hasChanges) return prev;
                    return prev.map((pc, idx) => {
                        const r = returned[idx];
                        return r ? { ...pc, id: r.id } : pc;
                    });
                });
            } catch (err) {
                console.error('Failed to sync notebook cells', err);
            }
        };

        if (immediate) {
            syncCall();
        } else {
            syncTimeoutRef.current = setTimeout(syncCall, 500);
        }
    };

    const addCell = () => {
        const newCell: NotebookCell = {
            id: `temp-${Date.now()}`,
            prompt: '',
            running: false,
            outputs: [],
            executionCount: null,
        };
        const updated = [...cells, newCell];
        setCells(updated);
        triggerSync(updated, true); // sync immediately
    };

    const deleteCell = (id: string) => {
        stopCell(id);
        const updated = cells.filter(c => c.id !== id);
        setCells(updated);
        triggerSync(updated, true); // sync immediately
    };

    const updatePrompt = (id: string, text: string) => {
        const updated = cells.map(c => (c.id === id ? { ...c, prompt: text } : c));
        setCells(updated);
        triggerSync(updated); // debounced sync
    };

    const clearOutputs = (id: string) => {
        const updated = cells.map(c => (c.id === id ? { ...c, outputs: [], executionCount: null } : c));
        setCells(updated);
        triggerSync(updated, true);
    };

    const clearAllOutputs = () => {
        const updated = cells.map(c => ({ ...c, outputs: [], executionCount: null, running: false }));
        setCells(updated);
        Object.values(abortControllersRef.current).forEach(ac => ac.abort());
        abortControllersRef.current = {};
        triggerSync(updated, true);
    };

    const resetNotebook = async () => {
        if (confirm('Are you sure you want to reset the notebook? This deletes all custom cells.')) {
            Object.values(abortControllersRef.current).forEach(ac => ac.abort());
            abortControllersRef.current = {};
            setGlobalExecutionCount(0);
            localStorage.removeItem(`stockastic_nb_exec_${notebookId}`);

            const initial = DEFAULT_PROMPTS.map((prompt, idx) => ({
                id: `temp-${Date.now()}-${idx}`,
                prompt,
                running: false,
                outputs: [],
                executionCount: null,
            }));
            setCells(initial);
            triggerSync(initial, true);
        }
    };

    const stopCell = (id: string) => {
        if (abortControllersRef.current[id]) {
            abortControllersRef.current[id].abort();
            delete abortControllersRef.current[id];
        }
        setCells(prev => prev.map(c => (c.id === id ? { ...c, running: false } : c)));
    };

    const runCell = async (id: string) => {
        const cell = cells.find(c => c.id === id);
        if (!cell || !cell.prompt.trim() || cell.running || !sessionId) return;

        stopCell(id);

        const count = globalExecutionCount + 1;
        setGlobalExecutionCount(count);
        localStorage.setItem(`stockastic_nb_exec_${notebookId}`, count.toString());

        setCells(prev =>
            prev.map(c =>
                c.id === id
                    ? {
                          ...c,
                          running: true,
                          executionCount: count,
                          outputs: [],
                      }
                    : c,
            ),
        );

        const ac = new AbortController();
        abortControllersRef.current[id] = ac;

        try {
            const stream = openChatStream({
                sessionId,
                prompt: cell.prompt,
                apiUrl: API_BASE_URL,
                signal: ac.signal,
            });

            for await (const frame of stream) {
                applyFrame(id, frame.event, frame.data);
            }
        } catch (err: any) {
            if (!ac.signal.aborted) {
                appendBlock(id, {
                    kind: 'text',
                    text: `\n\nError: ${err?.message || 'Execution failed'}`,
                });
            } else {
                appendBlock(id, {
                    kind: 'text',
                    text: '\n\n[Execution stopped]',
                });
            }
        } finally {
            delete abortControllersRef.current[id];
            setCells(prev => {
                const updated = prev.map(c => (c.id === id ? { ...c, running: false } : c));
                // Sync the outputs and state immediately to the backend
                triggerSync(updated, true);
                return updated;
            });
        }
    };

    const runAllCells = async () => {
        for (const cell of cells) {
            if (cell.prompt.trim()) {
                await runCell(cell.id);
            }
        }
    };

    const appendBlock = (cellId: string, block: ChatBlock) => {
        setCells(prev =>
            prev.map(c => (c.id === cellId ? { ...c, outputs: [...c.outputs, block] } : c)),
        );
    };

    const applyFrame = (cellId: string, event: string, data: any) => {
        setCells(prev =>
            prev.map(c => {
                if (c.id !== cellId) return c;
                const outputs = [...c.outputs];
                switch (event) {
                    case 'text': {
                        const last = outputs[outputs.length - 1];
                        if (last && last.kind === 'text' && last.subagent === data.subagent) {
                            outputs[outputs.length - 1] = {
                                ...last,
                                text: last.text + data.text,
                            };
                        } else {
                            outputs.push({
                                kind: 'text',
                                subagent: data.subagent,
                                text: data.text,
                            });
                        }
                        return { ...c, outputs };
                    }
                    case 'thinking': {
                        const last = outputs[outputs.length - 1];
                        if (last && last.kind === 'thinking' && last.subagent === data.subagent) {
                            outputs[outputs.length - 1] = {
                                ...last,
                                text: last.text + data.text,
                            };
                        } else {
                            outputs.push({
                                kind: 'thinking',
                                subagent: data.subagent,
                                text: data.text,
                            });
                        }
                        return { ...c, outputs };
                    }
                    case 'subagent_start':
                        outputs.push({
                            kind: 'subagent_start',
                            subagent: data.subagent,
                            parent: data.parent,
                            model: data.model,
                        });
                        return { ...c, outputs };
                    case 'tool_use':
                        outputs.push({
                            kind: 'tool_use',
                            subagent: data.subagent,
                            tool: data.tool,
                            input: data.input || {},
                            id: data.id,
                        });
                        return { ...c, outputs };
                    case 'tool_result':
                        outputs.push({
                            kind: 'tool_result',
                            subagent: data.subagent,
                            id: data.id,
                            is_error: !!data.is_error,
                            text: data.text || '',
                        });
                        return { ...c, outputs };
                    case 'card':
                        outputs.push({
                            kind: 'card',
                            type: data.type,
                            data: data.data,
                            tool: data.tool,
                        });
                        return { ...c, outputs };
                    case 'error':
                        outputs.push({ kind: 'text', text: `\n\nError: ${data.message}` });
                        return { ...c, outputs };
                    default:
                        return c;
                }
            }),
        );
    };

    if (loadingSession || loadingCells) {
        return (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground gap-2">
                <Loader2 size={16} className="animate-spin" /> Preparing notebook...
            </div>
        );
    }

    const saveTitle = async () => {
        if (!titleDraft.trim() || titleDraft === notebookTitle) {
            setEditingTitle(false);
            setTitleDraft(notebookTitle);
            return;
        }
        try {
            await api.patch(`/api/chat/notebooks/${notebookId}/`, { title: titleDraft.trim() });
            setNotebookTitle(titleDraft.trim());
        } catch (err) {
            console.error('Failed to update title', err);
        } finally {
            setEditingTitle(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-background border-l border-border">
            {/* Top Toolbar */}
            <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2.5">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => router.push('/notebook')}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        title="Back to Notebooks"
                    >
                        <ArrowLeft size={15} />
                    </button>
                    {/* Colored notebook icon */}
                    {(() => {
                        const col = getColorConfig(notebookColor);
                        const IconComp = getIconComponent(notebookIcon);
                        return (
                            <div className={cn("p-1.5 rounded-md border", col.iconBg, col.border)}>
                                <IconComp size={14} className={col.text} />
                            </div>
                        );
                    })()}
                    {editingTitle ? (
                        <div className="flex items-center gap-1.5">
                            <input
                                autoFocus
                                value={titleDraft}
                                onChange={e => setTitleDraft(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && saveTitle()}
                                onBlur={saveTitle}
                                className="text-[13px] font-semibold bg-transparent border-b border-border outline-none text-foreground w-48"
                            />
                            <button onClick={saveTitle} className="p-1 rounded text-emerald-500 hover:bg-accent">
                                <Check size={13} />
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => { setEditingTitle(true); setTitleDraft(notebookTitle); }}
                            className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground hover:text-muted-foreground transition-colors group"
                        >
                            {notebookTitle}
                            <Pencil size={11} className="opacity-0 group-hover:opacity-60 transition-opacity" />
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-1.5">
                    <button
                        onClick={runAllCells}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium bg-foreground text-background hover:opacity-90 transition-opacity"
                    >
                        <Play size={12} fill="currentColor" /> Run All
                    </button>
                    <button
                        onClick={addCell}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium border border-border hover:bg-accent text-foreground transition-colors"
                    >
                        <Plus size={12} /> Add Cell
                    </button>
                    <button
                        onClick={clearAllOutputs}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium border border-border hover:bg-accent text-foreground transition-colors"
                        title="Clear all outputs"
                    >
                        <Trash2 size={12} /> Clear Outputs
                    </button>
                    <button
                        onClick={resetNotebook}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium border border-border hover:bg-accent text-foreground transition-colors text-rose-500"
                        title="Reset all cells"
                    >
                        <RotateCcw size={12} /> Reset
                    </button>
                </div>
            </div>

            {/* Scrollable Cell List */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 custom-scrollbar">
                <div className="max-w-5xl mx-auto space-y-8">
                    {cells.map((cell, idx) => (
                        <div key={cell.id} className="group/cell space-y-2 border-l-2 border-transparent hover:border-border pl-4 transition-all">
                            {/* Input Area block */}
                            <div className="flex items-start gap-4">
                                <div className="w-16 shrink-0 text-right text-xs font-mono text-muted-foreground pt-3 select-none">
                                    In [{cell.executionCount !== null ? cell.executionCount : ' '}] :
                                </div>
                                <div className="flex-1 relative flex items-start gap-2 bg-card border border-border rounded-md px-3 py-2 shadow-sm focus-within:ring-2 focus-within:ring-ring transition-all">
                                    <textarea
                                        value={cell.prompt}
                                        onChange={(e) => updatePrompt(cell.id, e.target.value)}
                                        placeholder="Enter a prompt/question..."
                                        rows={Math.max(1, cell.prompt.split('\n').length)}
                                        className="flex-1 bg-transparent border-0 outline-0 p-0 text-sm resize-none focus:ring-0 placeholder:text-muted-foreground font-mono"
                                    />
                                    <div className="flex items-center gap-1 shrink-0 pt-0.5">
                                        {cell.running ? (
                                            <button
                                                onClick={() => stopCell(cell.id)}
                                                className="p-1 rounded text-rose-500 hover:bg-accent"
                                                title="Stop execution"
                                            >
                                                <StopCircle size={14} />
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => runCell(cell.id)}
                                                disabled={!cell.prompt.trim()}
                                                className={cn(
                                                    "p-1 rounded transition-colors",
                                                    cell.prompt.trim() ? "text-emerald-500 hover:bg-accent" : "text-muted-foreground opacity-40 cursor-not-allowed"
                                                )}
                                                title="Run cell"
                                            >
                                                <Play size={14} fill={cell.prompt.trim() ? "currentColor" : "none"} />
                                            </button>
                                        )}
                                        <button
                                            onClick={() => deleteCell(cell.id)}
                                            className="p-1 rounded text-muted-foreground hover:text-rose-500 opacity-0 group-hover/cell:opacity-100 transition-opacity"
                                            title="Delete cell"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Output Area block */}
                            {cell.outputs.length > 0 && (
                                <div className="flex items-start gap-4">
                                    <div className="w-16 shrink-0 text-right text-xs font-mono text-muted-foreground pt-1.5 select-none">
                                        Out [{cell.executionCount !== null ? cell.executionCount : ' '}] :
                                    </div>
                                    <div className="flex-1 space-y-2 border border-border/40 bg-muted/20 rounded-md p-4 max-w-none">
                                        <CellOutput outputs={cell.outputs} />
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function CellOutput({ outputs }: { outputs: ChatBlock[] }) {
    const resultById = new Map<string, ToolResultBlock>();
    for (const b of outputs) {
        if (b.kind === 'tool_result') resultById.set(b.id, b);
    }

    return (
        <div className="space-y-3">
            {outputs.map((block, idx) => {
                switch (block.kind) {
                    case 'text':
                        if (!block.text.trim()) return null;
                        return (
                            <div key={idx} className="text-sm leading-relaxed text-foreground">
                                <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                                    {block.text}
                                </ReactMarkdown>
                            </div>
                        );

                    case 'thinking':
                        return <ThinkingBlock key={idx} text={block.text} />;

                    case 'subagent_start':
                        return (
                            <div key={idx} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                <ChevronRight size={11} />
                                Delegating to a subagent...
                            </div>
                        );

                    case 'tool_use': {
                        const tu = block as ToolUseBlock;
                        const result = resultById.get(tu.id);
                        return (
                            <ToolEventRow
                                key={idx}
                                tool={tu.tool}
                                status={result ? (result.is_error ? 'error' : 'done') : 'running'}
                                text={result?.text}
                            />
                        );
                    }

                    case 'card':
                        return (
                            <div key={idx} className="my-1">
                                <GenUIContainer type={block.type} data={block.data} />
                            </div>
                        );

                    case 'tool_result':
                    case 'subagent_end':
                    default:
                        return null;
                }
            })}
        </div>
    );
}

function ThinkingBlock({ text }: { text: string }) {
    const [open, setOpen] = useState(false);
    if (!text.trim()) return null;
    return (
        <div className="text-[12px] text-muted-foreground">
            <button
                onClick={() => setOpen((v) => !v)}
                className="inline-flex items-center gap-1 hover:text-foreground transition-colors font-mono"
            >
                <ChevronRight
                    size={11}
                    className={cn('transition-transform', open && 'rotate-90')}
                />
                [Reasoning]
            </button>
            {open && (
                <div className="mt-1 pl-4 border-l border-border text-muted-foreground whitespace-pre-wrap leading-relaxed">
                    {text}
                </div>
            )}
        </div>
    );
}

function ChevronRight({ size, className }: { size: number; className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            <path d="m9 18 6-6-6-6" />
        </svg>
    );
}
