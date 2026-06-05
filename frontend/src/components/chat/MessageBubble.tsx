'use client';

import React, { useState } from 'react';
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

function AssistantBubble({ blocks }: { blocks: ChatBlock[] }) {
    // Pair tool_use with tool_result so the row toggles state in place.
    const resultById = new Map<string, ToolResultBlock>();
    for (const b of blocks) {
        if (b.kind === 'tool_result') resultById.set(b.id, b);
    }

    return (
        <div className="max-w-[85%] space-y-2">
            {blocks.map((block, idx) => renderBlock(block, idx, resultById))}
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
            return <ThinkingBlock key={idx} text={block.text} />;

        case 'subagent_start': {
            const sb = (block as any).subagent_name || block.parent || 'subagent';
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
            // Rendered via its paired tool_use.
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

function ThinkingBlock({ text }: { text: string }) {
    const [open, setOpen] = useState(false);
    if (!text.trim()) return null;
    return (
        <div className="text-[12px] text-muted-foreground">
            <button
                onClick={() => setOpen((v) => !v)}
                className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
            >
                <ChevronRight
                    size={11}
                    className={cn('transition-transform', open && 'rotate-90')}
                />
                Reasoning
            </button>
            {open && (
                <div className="mt-1 pl-4 border-l border-border text-muted-foreground whitespace-pre-wrap leading-relaxed">
                    {text}
                </div>
            )}
        </div>
    );
}
