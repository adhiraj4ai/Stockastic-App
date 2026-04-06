'use client';

import { Info } from 'lucide-react';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";

export function InfoTooltip({ content }: { content: string }) {
    return (
        <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
                <div className="ml-2 inline-flex items-center cursor-help">
                    <Info size={14} className="text-slate-400 hover:text-blue-500 transition-colors" />
                </div>
            </TooltipTrigger>
            <TooltipContent 
                side="top" 
                className="max-w-64 p-3 bg-slate-900 border border-slate-700 rounded-xl shadow-xl text-white text-xs font-medium leading-relaxed z-[100]"
            >
                {content}
            </TooltipContent>
        </Tooltip>
    );
}
