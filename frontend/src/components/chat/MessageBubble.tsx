'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { SubagentBadge } from './SubagentBadge';
import { ToolEventRow } from './ToolEventRow';
import GenUIContainer from './gen-ui/GenUIRegistry';
import type { ChatBlock, ChatMessage, ToolUseBlock, ToolResultBlock } from './types';

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

type RenderGroup =
    | { kind: 'reasoning'; thinking: string; text: string; subagent?: string }
    | { kind: 'block'; block: ChatBlock };

function groupBlocks(blocks: ChatBlock[]): RenderGroup[] {
    const groups: RenderGroup[] = [];
    let pendingThinking = '';
    let pendingSubagent: string | undefined;

    for (const block of blocks) {
        if (block.kind === 'thinking') {
            pendingThinking += block.text;
            pendingSubagent = (block as any).subagent ?? pendingSubagent;
        } else if (block.kind === 'text' && pendingThinking) {
            groups.push({
                kind: 'reasoning',
                thinking: pendingThinking,
                text: block.text,
                subagent: (block as any).subagent ?? pendingSubagent,
            });
            pendingThinking = '';
            pendingSubagent = undefined;
        } else {
            if (pendingThinking) {
                groups.push({ kind: 'reasoning', thinking: pendingThinking, text: '', subagent: pendingSubagent });
                pendingThinking = '';
                pendingSubagent = undefined;
            }
            groups.push({ kind: 'block', block });
        }
    }

    if (pendingThinking) {
        groups.push({ kind: 'reasoning', thinking: pendingThinking, text: '', subagent: pendingSubagent });
    }

    return groups;
}

function AssistantBubble({ blocks }: { blocks: ChatBlock[] }) {
    const resultById = new Map<string, ToolResultBlock>();
    for (const b of blocks) {
        if (b.kind === 'tool_result') resultById.set(b.id, b);
    }

    const groups = groupBlocks(blocks);

    return (
        <div className="max-w-[85%] space-y-2">
            {groups.map((group, idx) => {
                if (group.kind === 'reasoning') {
                    return (
                        <ReasoningCard
                            key={idx}
                            thinking={group.thinking}
                            text={group.text}
                            subagent={group.subagent}
                        />
                    );
                }
                return renderBlock(group.block, idx, resultById);
            })}
        </div>
    );
}

function ReasoningCard({ thinking, text, subagent }: { thinking: string; text: string; subagent?: string }) {
    const hasOutput = !!text.trim();
    const [open, setOpen] = useState(!hasOutput);
    const prevHasOutput = useRef(hasOutput);

    useEffect(() => {
        if (!prevHasOutput.current && hasOutput) {
            setOpen(false);
        }
        prevHasOutput.current = hasOutput;
    }, [hasOutput]);

    if (!thinking.trim() && !text.trim()) return null;

    return (
        <div className="rounded-lg border border-amber-200/60 dark:border-amber-800/40 overflow-hidden">
            {/* Reasoning header */}
            <button
                onClick={() => setOpen(v => !v)}
                className="w-full flex items-center gap-2 px-3 py-2 bg-amber-50/80 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 text-[12px] font-medium hover:bg-amber-100/70 dark:hover:bg-amber-900/30 transition-colors"
            >
                <ChevronRight
                    size={11}
                    className={cn('transition-transform shrink-0', open && 'rotate-90')}
                />
                <span>Reasoning</span>
                {subagent && <SubagentBadge name={subagent} size="sm" className="ml-1 border-amber-300/50 dark:border-amber-700/50" />}
                <span className="ml-auto text-amber-500/60 dark:text-amber-500/50 text-[11px] font-normal">
                    {open ? 'collapse' : 'expand'}
                </span>
            </button>

            {/* Reasoning content */}
            {open && (
                <div className="px-3 py-2.5 bg-amber-50/40 dark:bg-amber-950/10 border-t border-amber-200/40 dark:border-amber-800/30 text-[12px] text-amber-900/75 dark:text-amber-200/60 leading-relaxed">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                        {thinking}
                    </ReactMarkdown>
                </div>
            )}

            {/* Output body */}
            {text.trim() && (
                <>
                    <div className="h-px bg-amber-200/50 dark:bg-amber-800/30" />
                    <div className="px-3 py-2.5 bg-card text-sm text-foreground leading-relaxed">
                        {subagent && (
                            <div className="mb-1.5">
                                <SubagentBadge name={subagent} size="sm" />
                            </div>
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

function renderBlock(
    block: ChatBlock,
    idx: number,
    resultById: Map<string, ToolResultBlock>,
): React.ReactNode {
    switch (block.kind) {
        case 'text':
            if (!block.text.trim()) return null;
            return (
                <div key={idx} className="flex items-start gap-2">
                    {block.subagent && (
                        <SubagentBadge name={block.subagent === 'subagent' ? 'subagent' : block.subagent} size="sm" />
                    )}
                    <div className="rounded-md border border-border bg-card px-3 py-2 text-sm leading-relaxed text-foreground">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                            {block.text}
                        </ReactMarkdown>
                    </div>
                </div>
            );

        case 'thinking':
            // Orphaned thinking block (not paired with text) — shouldn't normally occur after grouping
            return null;

        case 'subagent_start': {
            return (
                <div key={idx} className="flex items-center gap-1.5 text-[11px] text-muted-foreground pl-1">
                    <ChevronRight size={11} />
                    Delegating to a subagent…
                </div>
            );
        }

        case 'subagent_end':
            return null;

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

        case 'tool_result':
            return null;

        case 'card':
            return (
                <div key={idx} className="my-1">
                    <GenUIContainer type={block.type} data={block.data} />
                </div>
            );

        default:
            return null;
    }
}
