'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Play, Plus, Trash2, RotateCcw, AlertCircle, Loader2, StopCircle, ArrowLeft, Pencil, Check, Brain, Wrench, CheckCircle2, XCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import api from '@/lib/api';
import { openChatStream } from '@/lib/chat-sse';
import { cn } from '@/lib/utils';
import { SubagentBadge } from './SubagentBadge';
import GenUIContainer from './gen-ui/GenUIRegistry';
import { WorkbenchContext, useWorkbench, type WorkbenchTool } from './WorkbenchContext';
import { WorkbenchPanel } from './WorkbenchPanel';
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
    const [selectedTool, setSelectedTool] = useState<WorkbenchTool | null>(null);
    const abortControllersRef = useRef<Record<string, AbortController>>({});
    const cellRefsMap = useRef<Record<string, HTMLTextAreaElement | null>>({});
    const pendingFocusRef = useRef<string | null>(null);

    useEffect(() => {
        if (pendingFocusRef.current) {
            cellRefsMap.current[pendingFocusRef.current]?.focus();
            pendingFocusRef.current = null;
        }
    }, [cells]);
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

    const insertCell = (atIndex: number) => {
        const newCell: NotebookCell = {
            id: `temp-${Date.now()}`,
            prompt: '',
            running: false,
            outputs: [],
            executionCount: null,
        };
        const updated = [...cells];
        updated.splice(atIndex, 0, newCell);
        pendingFocusRef.current = newCell.id;
        setCells(updated);
        triggerSync(updated, true);
    };

    const addCell = () => insertCell(cells.length);

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
        <WorkbenchContext.Provider value={{ selectedTool, selectTool: setSelectedTool }}>
        <div className="flex h-full bg-background border-l border-border">
        <div className="flex flex-col flex-1 min-w-0">
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
            <div className="flex-1 overflow-y-auto px-6 py-6 custom-scrollbar">
                <div className="max-w-5xl mx-auto">
                    <AddCellDivider onClick={() => insertCell(0)} />
                    {cells.map((cell, idx) => (
                        <React.Fragment key={cell.id}>
                        <div
                            className="group/cell rounded-lg border border-border bg-card shadow-sm overflow-hidden transition-shadow hover:shadow-md"
                        >
                            {/* Card Header — the cell prompt */}
                            <div className="flex items-start gap-3 px-4 py-3 bg-muted/30 border-b border-border focus-within:bg-muted/50 transition-colors">
                                <span className="shrink-0 text-[11px] font-mono text-muted-foreground pt-[3px] select-none min-w-[2rem] text-right">
                                    [{cell.executionCount !== null ? cell.executionCount : ' '}]
                                </span>
                                <textarea
                                    ref={(el) => { cellRefsMap.current[cell.id] = el; }}
                                    value={cell.prompt}
                                    onChange={(e) => updatePrompt(cell.id, e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                            e.preventDefault();
                                            runCell(cell.id);
                                        } else if (e.key === 'Enter' && e.shiftKey) {
                                            e.preventDefault();
                                            runCell(cell.id);
                                            if (idx + 1 < cells.length) {
                                                cellRefsMap.current[cells[idx + 1].id]?.focus();
                                            } else {
                                                insertCell(cells.length);
                                            }
                                        }
                                    }}
                                    placeholder="Ask a question… (Ctrl+↵ run · Shift+↵ run & next)"
                                    rows={Math.max(1, cell.prompt.split('\n').length)}
                                    className="flex-1 bg-transparent border-0 outline-none p-0 text-sm resize-none focus:ring-0 placeholder:text-muted-foreground font-mono leading-relaxed"
                                />
                                <div className="flex items-center gap-1 shrink-0">
                                    {cell.running ? (
                                        <button
                                            onClick={() => stopCell(cell.id)}
                                            className="p-1.5 rounded-md text-rose-500 hover:bg-accent transition-colors"
                                            title="Stop execution"
                                        >
                                            <StopCircle size={14} />
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => runCell(cell.id)}
                                            disabled={!cell.prompt.trim()}
                                            className={cn(
                                                "p-1.5 rounded-md transition-colors",
                                                cell.prompt.trim()
                                                    ? "text-emerald-500 hover:bg-accent"
                                                    : "text-muted-foreground opacity-40 cursor-not-allowed"
                                            )}
                                            title="Run cell (⌘↵)"
                                        >
                                            <Play size={14} fill={cell.prompt.trim() ? "currentColor" : "none"} />
                                        </button>
                                    )}
                                    <button
                                        onClick={() => clearOutputs(cell.id)}
                                        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground opacity-0 group-hover/cell:opacity-100 transition-opacity hover:bg-accent"
                                        title="Clear output"
                                    >
                                        <RotateCcw size={13} />
                                    </button>
                                    <button
                                        onClick={() => deleteCell(cell.id)}
                                        className="p-1.5 rounded-md text-muted-foreground hover:text-rose-500 opacity-0 group-hover/cell:opacity-100 transition-opacity hover:bg-accent"
                                        title="Delete cell"
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            </div>

                            {/* Card Body — output */}
                            {cell.running && cell.outputs.length === 0 && (
                                <div className="flex items-center gap-2 px-5 py-4 text-xs text-muted-foreground">
                                    <Loader2 size={12} className="animate-spin" />
                                    Running…
                                </div>
                            )}
                            {cell.outputs.length > 0 && (
                                <div className="px-5 py-4 space-y-2">
                                    <CellOutput outputs={cell.outputs} />
                                </div>
                            )}
                        </div>
                        <AddCellDivider onClick={() => insertCell(idx + 1)} />
                        </React.Fragment>
                    ))}
                </div>
            </div>
        </div>
        {selectedTool && (
            <WorkbenchPanel tool={selectedTool} onClose={() => setSelectedTool(null)} />
        )}
        </div>
        </WorkbenchContext.Provider>
    );
}

function AddCellDivider({ onClick }: { onClick: () => void }) {
    return (
        <div className="group/divider flex items-center gap-2 h-8 px-1">
            <div className="flex-1 h-px bg-border/40 group-hover/divider:bg-border transition-colors" />
            <button
                onClick={onClick}
                className="flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground rounded-full border border-dashed border-border/50 opacity-0 group-hover/divider:opacity-100 hover:border-border hover:text-foreground hover:bg-accent transition-all"
            >
                <Plus size={10} />
                Add Cell
            </button>
            <div className="flex-1 h-px bg-border/40 group-hover/divider:bg-border transition-colors" />
        </div>
    );
}

// ─── Timeline types ────────────────────────────────────────────────────────────

type NbThinkingEntry = { kind: 'thinking'; text: string };
type NbToolEntry = {
    kind: 'tool';
    tool: string;
    id: string;
    input: Record<string, unknown>;
    result?: { text: string; isError: boolean };
};
type NbTimelineEntry = NbThinkingEntry | NbToolEntry;

const NB_TOOL_LABELS: Record<string, string> = {
    get_market_summary: 'Fetching market summary',
    get_top_movers: 'Fetching top movers',
    get_index_history: 'Pulling index history',
    get_floorsheet_whales: 'Identifying whale brokers',
    get_stock_quote: 'Fetching latest quote',
    get_price_history: 'Loading price history',
    get_technicals: 'Computing technical indicators',
    get_fundamentals: 'Reading fundamentals',
    get_dividend_history: 'Reading dividend history',
    get_accumulation: 'Reading broker accumulation',
    get_signals_for_ticker: 'Aggregating signals',
    get_signal_track_record: 'Reading signal track record',
    calc_position_size: 'Sizing the position',
    get_portfolio_overview: 'Reading portfolio',
    get_holdings: 'Listing holdings',
    get_watchlist: 'Reading watchlist',
    get_risk_profile: 'Analyzing portfolio risk',
    get_realized_pnl: 'Reading realized P/L',
    Task: 'Delegating to subagent',
};

function nbPrettyTool(raw: string): string {
    if (NB_TOOL_LABELS[raw]) return NB_TOOL_LABELS[raw];
    const stripped = raw.replace(/^mcp__[^_]+__/, '');
    return NB_TOOL_LABELS[stripped] || stripped.replace(/_/g, ' ');
}

function buildNbTimeline(innerBlocks: ChatBlock[]): NbTimelineEntry[] {
    const resultById = new Map<string, ToolResultBlock>();
    for (const b of innerBlocks) {
        if (b.kind === 'tool_result') resultById.set(b.id, b);
    }

    const entries: NbTimelineEntry[] = [];
    let pendingThinking = '';

    for (const b of innerBlocks) {
        if (b.kind === 'thinking') {
            pendingThinking += b.text;
        } else if (b.kind === 'tool_use') {
            if (pendingThinking.trim()) {
                entries.push({ kind: 'thinking', text: pendingThinking });
                pendingThinking = '';
            }
            const tu = b as ToolUseBlock;
            const result = resultById.get(tu.id);
            entries.push({
                kind: 'tool',
                tool: tu.tool,
                id: tu.id,
                input: tu.input,
                result: result ? { text: result.text, isError: result.is_error } : undefined,
            });
        }
    }

    if (pendingThinking.trim()) {
        entries.push({ kind: 'thinking', text: pendingThinking });
    }

    return entries;
}

// ─── Block grouping ────────────────────────────────────────────────────────────

type NbRenderGroup =
    | { kind: 'reasoning'; innerBlocks: ChatBlock[]; text: string }
    | { kind: 'block'; block: ChatBlock };

function groupOutputs(outputs: ChatBlock[]): NbRenderGroup[] {
    const groups: NbRenderGroup[] = [];

    const firstThinkingIdx = outputs.findIndex(b => b.kind === 'thinking');
    if (firstThinkingIdx === -1) {
        for (const block of outputs) groups.push({ kind: 'block', block });
        return groups;
    }

    for (let i = 0; i < firstThinkingIdx; i++) {
        groups.push({ kind: 'block', block: outputs[i] });
    }

    let lastTextIdx = -1;
    for (let i = outputs.length - 1; i >= firstThinkingIdx; i--) {
        if (outputs[i].kind === 'text') { lastTextIdx = i; break; }
    }

    const innerBlocks = lastTextIdx > firstThinkingIdx
        ? outputs.slice(firstThinkingIdx, lastTextIdx)
        : outputs.slice(firstThinkingIdx);

    const outputBlock = lastTextIdx !== -1 ? outputs[lastTextIdx] : null;
    groups.push({
        kind: 'reasoning',
        innerBlocks,
        text: outputBlock?.kind === 'text' ? outputBlock.text : '',
    });

    if (lastTextIdx !== -1) {
        for (let i = lastTextIdx + 1; i < outputs.length; i++) {
            groups.push({ kind: 'block', block: outputs[i] });
        }
    }

    return groups;
}

// ─── CellOutput ───────────────────────────────────────────────────────────────

function CellOutput({ outputs }: { outputs: ChatBlock[] }) {
    const groups = groupOutputs(outputs);

    return (
        <div className="space-y-3">
            {groups.map((group, idx) => {
                if (group.kind === 'reasoning') {
                    return <NbReasoningCard key={idx} innerBlocks={group.innerBlocks} text={group.text} />;
                }
                const block = group.block;
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
                    case 'card':
                        return (
                            <div key={idx} className="my-1">
                                <GenUIContainer type={block.type} data={block.data} />
                            </div>
                        );
                    case 'tool_result':
                    case 'subagent_start':
                    case 'subagent_end':
                    default:
                        return null;
                }
            })}
        </div>
    );
}

// ─── NbReasoningCard ──────────────────────────────────────────────────────────

function NbReasoningCard({ innerBlocks, text }: { innerBlocks: ChatBlock[]; text: string }) {
    const hasOutput = !!text.trim();
    const [open, setOpen] = useState(!hasOutput);
    const prevHasOutput = useRef(hasOutput);

    useEffect(() => {
        if (!prevHasOutput.current && hasOutput) setOpen(false);
        prevHasOutput.current = hasOutput;
    }, [hasOutput]);

    const entries = buildNbTimeline(innerBlocks);

    if (entries.length === 0 && !hasOutput) return null;

    const stepCount = entries.length;

    return (
        <div className="rounded-lg border border-amber-200/60 dark:border-amber-800/40 overflow-hidden">
            {entries.length > 0 && (
                <>
                    <button
                        onClick={() => setOpen(v => !v)}
                        className="w-full flex items-center gap-2 px-3 py-2.5 bg-amber-50/80 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 text-[12px] font-medium hover:bg-amber-100/70 dark:hover:bg-amber-900/30 transition-colors"
                    >
                        <ChevronRight size={11} className={cn('transition-transform shrink-0', open && 'rotate-90')} />
                        <Brain size={12} className="shrink-0 opacity-70" />
                        <span>Reasoning</span>
                        <span className="text-amber-500/70 dark:text-amber-500/50 font-normal">
                            · {stepCount} step{stepCount !== 1 ? 's' : ''}
                        </span>
                        <span className="ml-auto text-amber-500/60 dark:text-amber-500/50 text-[11px] font-normal">
                            {open ? 'collapse' : 'expand'}
                        </span>
                    </button>

                    {open && (
                        <div className="bg-amber-50/40 dark:bg-amber-950/10 border-t border-amber-200/40 dark:border-amber-800/30">
                            <div className="px-4 py-3">
                                <NbTimelineView entries={entries} />
                            </div>
                            <button
                                onClick={() => setOpen(false)}
                                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] text-amber-600/70 dark:text-amber-500/60 hover:text-amber-700 dark:hover:text-amber-400 hover:bg-amber-100/50 dark:hover:bg-amber-900/20 border-t border-amber-200/40 dark:border-amber-800/30 transition-colors"
                            >
                                <ChevronRight size={11} className="rotate-[-90deg]" />
                                collapse
                            </button>
                        </div>
                    )}
                </>
            )}

            {hasOutput && (
                <>
                    {entries.length > 0 && <div className="h-px bg-amber-200/50 dark:bg-amber-800/30" />}
                    <div className="px-3 py-2.5 bg-card text-sm text-foreground leading-relaxed">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                            {text}
                        </ReactMarkdown>
                    </div>
                </>
            )}
        </div>
    );
}

function NbTimelineView({ entries }: { entries: NbTimelineEntry[] }) {
    return (
        <div className="relative pl-5">
            <div className="absolute left-[7px] top-[10px] bottom-[10px] w-px bg-amber-200 dark:bg-amber-800/60" />
            <div className="space-y-4">
                {entries.map((entry, i) => (
                    <NbTimelineItem key={i} entry={entry} />
                ))}
            </div>
        </div>
    );
}

function NbTimelineItem({ entry }: { entry: NbTimelineEntry }) {
    const { selectTool, selectedTool } = useWorkbench();

    if (entry.kind === 'thinking') {
        return (
            <div className="relative">
                <div className="absolute -left-[14px] top-[5px] w-2.5 h-2.5 rounded-full bg-amber-50 dark:bg-amber-950 border-2 border-amber-400 dark:border-amber-600 z-10" />
                <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-600/80 dark:text-amber-500/70 mb-1.5">
                    Thinking
                </div>
                <div className="text-[12px] text-amber-900/70 dark:text-amber-200/60 leading-relaxed">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                        {entry.text}
                    </ReactMarkdown>
                </div>
            </div>
        );
    }

    const status = !entry.result ? 'running' : entry.result.isError ? 'error' : 'done';
    const isSelected = selectedTool?.tool === entry.tool && selectedTool?.input === entry.input;

    return (
        <div className="relative">
            <div className={cn(
                'absolute -left-[14px] top-[5px] w-2.5 h-2.5 rounded-full border-2 z-10',
                status === 'done'    && 'bg-emerald-50 dark:bg-emerald-950 border-emerald-400 dark:border-emerald-600',
                status === 'error'   && 'bg-red-50 dark:bg-red-950 border-red-400 dark:border-red-600',
                status === 'running' && 'bg-amber-50 dark:bg-amber-950 border-amber-400 dark:border-amber-600',
            )} />
            <button
                onClick={() => selectTool(isSelected ? null : {
                    tool: entry.tool,
                    input: entry.input,
                    result: entry.result,
                })}
                className={cn(
                    'w-full text-left rounded-md px-2 py-1.5 -mx-2 transition-colors group',
                    isSelected
                        ? 'bg-amber-100/60 dark:bg-amber-900/30 ring-1 ring-amber-300/50 dark:ring-amber-700/50'
                        : 'hover:bg-amber-100/40 dark:hover:bg-amber-900/20',
                )}
            >
                <div className="flex items-center gap-1.5 mb-0.5">
                    <Wrench size={10} className="text-amber-600/70 dark:text-amber-500/60 shrink-0" />
                    <span className="text-[11px] font-medium text-foreground/80">{nbPrettyTool(entry.tool)}</span>
                    {status === 'running' && <Loader2 size={10} className="animate-spin text-amber-500" />}
                    {status === 'done'    && <CheckCircle2 size={10} className="text-emerald-500" />}
                    {status === 'error'   && <XCircle size={10} className="text-red-500" />}
                    <span className="ml-auto text-[10px] text-amber-500/50 opacity-0 group-hover:opacity-100 transition-opacity">
                        inspect →
                    </span>
                </div>
                {entry.result && (
                    <div className="text-[11px] text-muted-foreground/60 font-mono leading-snug line-clamp-2 pl-[14px]">
                        {entry.result.text.slice(0, 180)}{entry.result.text.length > 180 ? '…' : ''}
                    </div>
                )}
            </button>
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
