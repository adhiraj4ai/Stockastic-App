'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronRight, Brain, CheckCircle2, XCircle, Loader2, Wrench } from 'lucide-react';
import { useWorkbench } from './WorkbenchContext';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { SubagentBadge } from './SubagentBadge';
import GenUIContainer from './gen-ui/GenUIRegistry';
import type { ChatBlock, ChatMessage, ToolUseBlock, ToolResultBlock } from './types';

const TOOL_LABELS: Record<string, string> = {
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

function prettyTool(raw: string): string {
    if (TOOL_LABELS[raw]) return TOOL_LABELS[raw];
    const stripped = raw.replace(/^mcp__[^_]+__/, '');
    return TOOL_LABELS[stripped] || stripped.replace(/_/g, ' ');
}

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
                <code className={className} {...props}>{children}</code>
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

export function MessageBubble({ message }: { message: ChatMessage }) {
    if (message.role === 'user') {
        return (
            <div className="flex justify-end">
                <div className="max-w-[85%] rounded-md bg-foreground text-background px-3 py-2 text-sm whitespace-pre-wrap">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                        {message.text}
                    </ReactMarkdown>
                </div>
            </div>
        );
    }
    return <AssistantBubble blocks={message.blocks || []} />;
}

// ─── Timeline types ────────────────────────────────────────────────────────────

type ThinkingEntry = { kind: 'thinking'; text: string };
type ToolEntry = {
    kind: 'tool';
    tool: string;
    id: string;
    input: Record<string, unknown>;
    result?: { text: string; isError: boolean };
};
type TimelineEntry = ThinkingEntry | ToolEntry;

function buildTimeline(innerBlocks: ChatBlock[]): TimelineEntry[] {
    const resultById = new Map<string, ToolResultBlock>();
    for (const b of innerBlocks) {
        if (b.kind === 'tool_result') resultById.set(b.id, b);
    }

    const entries: TimelineEntry[] = [];
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
        // tool_result absorbed via resultById; others ignored
    }

    if (pendingThinking.trim()) {
        entries.push({ kind: 'thinking', text: pendingThinking });
    }

    return entries;
}

// ─── Block grouping ────────────────────────────────────────────────────────────

type RenderGroup =
    | { kind: 'reasoning'; innerBlocks: ChatBlock[]; text: string; subagent?: string }
    | { kind: 'block'; block: ChatBlock };

function groupBlocks(blocks: ChatBlock[]): RenderGroup[] {
    const groups: RenderGroup[] = [];

    const firstThinkingIdx = blocks.findIndex(b => b.kind === 'thinking');
    if (firstThinkingIdx === -1) {
        for (const block of blocks) groups.push({ kind: 'block', block });
        return groups;
    }

    // Blocks before first thinking — standalone
    for (let i = 0; i < firstThinkingIdx; i++) {
        groups.push({ kind: 'block', block: blocks[i] });
    }

    // Find the last text block — that is the final output
    let lastTextIdx = -1;
    for (let i = blocks.length - 1; i >= firstThinkingIdx; i--) {
        if (blocks[i].kind === 'text') { lastTextIdx = i; break; }
    }

    const innerBlocks = lastTextIdx > firstThinkingIdx
        ? blocks.slice(firstThinkingIdx, lastTextIdx)
        : blocks.slice(firstThinkingIdx);

    const outputBlock = lastTextIdx !== -1 ? blocks[lastTextIdx] : null;

    groups.push({
        kind: 'reasoning',
        innerBlocks,
        text: outputBlock?.kind === 'text' ? outputBlock.text : '',
        subagent: (outputBlock as any)?.subagent,
    });

    // Anything after the output (e.g. cards)
    if (lastTextIdx !== -1) {
        for (let i = lastTextIdx + 1; i < blocks.length; i++) {
            groups.push({ kind: 'block', block: blocks[i] });
        }
    }

    return groups;
}

// ─── AssistantBubble ───────────────────────────────────────────────────────────

function AssistantBubble({ blocks }: { blocks: ChatBlock[] }) {
    const groups = groupBlocks(blocks);
    return (
        <div className="max-w-[85%] space-y-2">
            {groups.map((group, idx) =>
                group.kind === 'reasoning'
                    ? <ReasoningCard key={idx} innerBlocks={group.innerBlocks} text={group.text} subagent={group.subagent} />
                    : renderBlock(group.block, idx),
            )}
        </div>
    );
}

// ─── ReasoningCard ─────────────────────────────────────────────────────────────

function ReasoningCard({ innerBlocks, text, subagent }: {
    innerBlocks: ChatBlock[];
    text: string;
    subagent?: string;
}) {
    const hasOutput = !!text.trim();
    const [open, setOpen] = useState(!hasOutput);
    const prevHasOutput = useRef(hasOutput);

    useEffect(() => {
        if (!prevHasOutput.current && hasOutput) setOpen(false);
        prevHasOutput.current = hasOutput;
    }, [hasOutput]);

    const entries = buildTimeline(innerBlocks);

    if (entries.length === 0 && !hasOutput) return null;

    const stepCount = entries.length;

    return (
        <div className="rounded-lg border border-amber-200/60 dark:border-amber-800/40 overflow-hidden">
            {/* Header */}
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
                        {subagent && (
                            <SubagentBadge name={subagent} size="sm" className="ml-1 border-amber-300/50 dark:border-amber-700/50" />
                        )}
                        <span className="ml-auto text-amber-500/60 dark:text-amber-500/50 text-[11px] font-normal">
                            {open ? 'collapse' : 'expand'}
                        </span>
                    </button>

                    {open && (
                        <div className="bg-amber-50/40 dark:bg-amber-950/10 border-t border-amber-200/40 dark:border-amber-800/30">
                            <div className="px-4 py-3">
                                <TimelineView entries={entries} />
                            </div>
                            <button
                                onClick={() => setOpen(false)}
                                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] text-amber-600/70 dark:text-amber-500/60 hover:text-amber-700 dark:hover:text-amber-400 hover:bg-amber-100/50 dark:hover:bg-amber-900/20 border-t border-amber-200/40 dark:border-amber-800/30 transition-colors"
                            >
                                <ChevronRight size={10} className="rotate-[-90deg]" />
                                collapse
                            </button>
                        </div>
                    )}
                </>
            )}

            {/* Output body */}
            {hasOutput && (
                <>
                    {entries.length > 0 && <div className="h-px bg-amber-200/50 dark:bg-amber-800/30" />}
                    <div className="px-3 py-2.5 bg-card text-sm text-foreground leading-relaxed">
                        {subagent && (
                            <div className="mb-1.5"><SubagentBadge name={subagent} size="sm" /></div>
                        )}
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                            {text}
                        </ReactMarkdown>
                    </div>
                </>
            )}
        </div>
    );
}

// ─── Timeline ──────────────────────────────────────────────────────────────────

function TimelineView({ entries }: { entries: TimelineEntry[] }) {
    return (
        <div className="relative pl-5">
            {/* Vertical connecting line */}
            <div className="absolute left-[7px] top-[10px] bottom-[10px] w-px bg-amber-200 dark:bg-amber-800/60" />
            <div className="space-y-4">
                {entries.map((entry, i) => (
                    <TimelineItem key={i} entry={entry} />
                ))}
            </div>
        </div>
    );
}

function TimelineItem({ entry }: { entry: TimelineEntry }) {
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
                    <span className="text-[11px] font-medium text-foreground/80">
                        {prettyTool(entry.tool)}
                    </span>
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

// ─── Standalone block renderer (no thinking context) ──────────────────────────

function renderBlock(block: ChatBlock, idx: number): React.ReactNode {
    switch (block.kind) {
        case 'text':
            if (!block.text.trim()) return null;
            return (
                <div key={idx} className="flex items-start gap-2">
                    {block.subagent && <SubagentBadge name={block.subagent} size="sm" />}
                    <div className="rounded-md border border-border bg-card px-3 py-2 text-sm leading-relaxed text-foreground">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                            {block.text}
                        </ReactMarkdown>
                    </div>
                </div>
            );

        case 'subagent_start':
            return (
                <div key={idx} className="flex items-center gap-1.5 text-[11px] text-muted-foreground pl-1">
                    <ChevronRight size={11} />
                    Delegating to a subagent…
                </div>
            );

        case 'card':
            return (
                <div key={idx} className="my-1">
                    <GenUIContainer type={block.type} data={block.data} />
                </div>
            );

        case 'thinking':
        case 'tool_use':
        case 'tool_result':
        case 'subagent_end':
        default:
            return null;
    }
}
