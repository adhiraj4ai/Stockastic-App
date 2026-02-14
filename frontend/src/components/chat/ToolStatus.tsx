import React, { useState } from 'react';
import { Terminal, CheckCircle2, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ToolStatusProps {
    toolName: string;
    args: string;
    result?: string;
    isFinished?: boolean;
}

export const ToolStatus: React.FC<ToolStatusProps> = ({ toolName, args, result, isFinished = true }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <div className="my-3 max-w-[90%] font-sans">
            <div
                className={`
                    flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer
                    ${isFinished
                        ? 'bg-emerald-50/50 border-emerald-200/50 hover:bg-emerald-100/50 dark:bg-emerald-950/20 dark:border-emerald-900/30 dark:hover:bg-emerald-950/30'
                        : 'bg-blue-50/50 border-blue-200/50 dark:bg-blue-950/20 dark:border-blue-900/30'}
                `}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className={`
                    p-1.5 rounded-lg shrink-0
                    ${isFinished ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' : 'bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'}
                `}>
                    {isFinished ? <CheckCircle2 size={16} /> : <Loader2 size={16} className="animate-spin" />}
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                            {isFinished ? 'Used tool' : 'Using tool'}
                        </span>
                        <code className="px-1.5 py-0.5 rounded bg-white/50 border border-gray-200 text-xs font-mono text-gray-600 dark:bg-gray-900/50 dark:border-gray-800 dark:text-gray-300">
                            {toolName}
                        </code>
                    </div>
                </div>

                <div className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors">
                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </div>
            </div>

            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="mt-2 ml-2 pl-4 border-l-2 border-gray-200 dark:border-gray-800 space-y-2">
                            <div className="space-y-1">
                                <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Input</span>
                                <div className="p-2 rounded-lg bg-gray-50 border border-gray-200 font-mono text-xs text-gray-600 overflow-x-auto dark:bg-gray-950/50 dark:border-gray-800 dark:text-gray-300">
                                    {args}
                                </div>
                            </div>

                            {result && (
                                <div className="space-y-1">
                                    <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Result</span>
                                    <div className="p-2 rounded-lg bg-gray-50 border border-gray-200 font-mono text-xs text-gray-600 overflow-x-auto max-h-40 overflow-y-auto custom-scrollbar dark:bg-gray-950/50 dark:border-gray-800 dark:text-gray-400">
                                        {result}
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
