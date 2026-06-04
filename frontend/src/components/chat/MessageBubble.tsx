'use client';

import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SubagentBadge } from './SubagentBadge';
import { ToolEventRow } from './ToolEventRow';
import GenUIContainer from './gen-ui/GenUIRegistry';
import type { ChatBlock, ChatMessage, ToolUseBlock, ToolResultBlock } from './types';

export function MessageBubble({ message }: { message: ChatMessage }) {
    if (message.role === 'user') {
        return (
            <div className="flex justify-end">
                <div className="max-w-[85%] rounded-md bg-foreground text-background px-3 py-2 text-sm whitespace-pre-wrap">
                    {message.text}
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
                    <div className="rounded-md border border-border bg-card px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed text-foreground">
                        {block.text}
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
