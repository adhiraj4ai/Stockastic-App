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

type ReasoningGroup = {
    kind: 'reasoning';
    thinking: string;
    toolBlocks: ChatBlock[];
    text: string;
    subagent?: string;
};

type RenderGroup = ReasoningGroup | { kind: 'block'; block: ChatBlock };

function groupBlocks(blocks: ChatBlock[]): RenderGroup[] {
    const groups: RenderGroup[] = [];
    let inReasoning = false;
    let thinking = '';
    let toolBlocks: ChatBlock[] = [];
    let subagent: string | undefined;

    const flush = (text = '', textSubagent?: string) => {
        groups.push({
            kind: 'reasoning',
            thinking,
            toolBlocks,
            text,
            subagent: textSubagent ?? subagent,
        });
        thinking = '';
        toolBlocks = [];
        subagent = undefined;
        inReasoning = false;
    };

    for (const block of blocks) {
        if (block.kind === 'thinking') {
            inReasoning = true;
            thinking += block.text;
            subagent = (block as any).subagent ?? subagent;
        } else if (inReasoning) {
            if (block.kind === 'text') {
                flush(block.text, (block as any).subagent);
            } else if (block.kind === 'tool_use' || block.kind === 'tool_result') {
                toolBlocks.push(block);
            } else if (block.kind === 'card') {
                // Cards are rich visual — flush reasoning so far without text, then render card standalone
                flush();
                groups.push({ kind: 'block', block });
            }
            // subagent_start / subagent_end: absorb silently into reasoning group
        } else {
            groups.push({ kind: 'block', block });
        }
    }

    // Reasoning still open (streaming, no text yet)
    if (inReasoning) flush();

    return groups;
}

function AssistantBubble({ blocks }: { blocks: ChatBlock[] }) {
    const groups = groupBlocks(blocks);

    return (
        <div className="max-w-[85%] space-y-2">
            {groups.map((group, idx) => {
                if (group.kind === 'reasoning') {
                    return (
                        <ReasoningCard
                            key={idx}
                            thinking={group.thinking}
                            toolBlocks={group.toolBlocks}
                            text={group.text}
                            subagent={group.subagent}
                        />
                    );
                }
                return renderBlock(group.block, idx);
            })}
        </div>
    );
}

function ReasoningCard({
    thinking,
    toolBlocks,
    text,
    subagent,
}: {
    thinking: string;
    toolBlocks: ChatBlock[];
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

    const resultById = new Map<string, ToolResultBlock>();
    for (const b of toolBlocks) {
        if (b.kind === 'tool_result') resultById.set(b.id, b);
    }

    const toolUseBlocks = toolBlocks.filter((b): b is ToolUseBlock => b.kind === 'tool_use');
    const hasInner = thinking.trim() || toolUseBlocks.length > 0;

    if (!hasInner && !hasOutput) return null;

    return (
        <div className="rounded-lg border border-amber-200/60 dark:border-amber-800/40 overflow-hidden">
            {/* Collapsible reasoning header */}
            {hasInner && (
                <>
                    <button
                        onClick={() => setOpen(v => !v)}
                        className="w-full flex items-center gap-2 px-3 py-2 bg-amber-50/80 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 text-[12px] font-medium hover:bg-amber-100/70 dark:hover:bg-amber-900/30 transition-colors"
                    >
                        <ChevronRight
                            size={11}
                            className={cn('transition-transform shrink-0', open && 'rotate-90')}
                        />
                        <span>Reasoning</span>
                        {subagent && (
                            <SubagentBadge name={subagent} size="sm" className="ml-1 border-amber-300/50 dark:border-amber-700/50" />
                        )}
                        <span className="ml-auto text-amber-500/60 dark:text-amber-500/50 text-[11px] font-normal">
                            {open ? 'collapse' : 'expand'}
                        </span>
                    </button>

                    {open && (
                        <div className="px-3 py-2.5 bg-amber-50/40 dark:bg-amber-950/10 border-t border-amber-200/40 dark:border-amber-800/30 space-y-2">
                            {thinking.trim() && (
                                <div className="text-[12px] text-amber-900/75 dark:text-amber-200/60 leading-relaxed">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                                        {thinking}
                                    </ReactMarkdown>
                                </div>
                            )}
                            {toolUseBlocks.map((tu, i) => {
                                const result = resultById.get(tu.id);
                                return (
                                    <ToolEventRow
                                        key={i}
                                        tool={tu.tool}
                                        status={result ? (result.is_error ? 'error' : 'done') : 'running'}
                                        text={result?.text}
                                    />
                                );
                            })}
                        </div>
                    )}
                </>
            )}

            {/* Output body */}
            {hasOutput && (
                <>
                    {hasInner && <div className="h-px bg-amber-200/50 dark:bg-amber-800/30" />}
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

function renderBlock(block: ChatBlock, idx: number): React.ReactNode {
    switch (block.kind) {
        case 'text':
            if (!block.text.trim()) return null;
            return (
                <div key={idx} className="flex items-start gap-2">
                    {block.subagent && (
                        <SubagentBadge name={block.subagent} size="sm" />
                    )}
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

        case 'tool_use': {
            const tu = block as ToolUseBlock;
            return (
                <ToolEventRow
                    key={idx}
                    tool={tu.tool}
                    status="running"
                    text={undefined}
                />
            );
        }

        case 'card':
            return (
                <div key={idx} className="my-1">
                    <GenUIContainer type={block.type} data={block.data} />
                </div>
            );

        case 'thinking':
        case 'tool_result':
        case 'subagent_end':
        default:
            return null;
    }
}
