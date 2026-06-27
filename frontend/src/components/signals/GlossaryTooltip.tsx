'use client';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { GlossaryEntry } from '@/types/signals-board';

interface Props { entry?: GlossaryEntry; fallback: string; }

export function GlossaryTooltip({ entry, fallback }: Props) {
    if (!entry) return <span>{fallback}</span>;
    return (
        <TooltipProvider delayDuration={150}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <span tabIndex={0} aria-label={`${entry.label}: ${entry.description}`}
                          className="border-b border-dotted border-muted-foreground/50 cursor-help">
                        {fallback}
                    </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-[240px]">
                    <span className="block font-medium">{entry.label}</span>
                    <span className="block text-muted-foreground">{entry.description}</span>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}
