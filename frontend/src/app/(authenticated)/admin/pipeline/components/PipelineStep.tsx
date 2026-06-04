'use client';

import React from 'react';
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, Loader2, Play, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LogEntry {
    type: 'log' | 'status' | 'error';
    message: string;
    timestamp: Date;
}

interface PipelineStepProps {
    title: string;
    description: string;
    status: 'idle' | 'running' | 'completed' | 'error';
    icon: React.ReactNode;
    onRun: () => void;
    onStop?: () => void;
    logs?: LogEntry[];
    showLogs?: boolean;
    onToggleLogs?: () => void;
    extraControls?: React.ReactNode;
}

export function PipelineStep({
    title,
    description,
    status,
    icon,
    onRun,
    onStop,
    logs = [],
    showLogs = false,
    onToggleLogs,
    extraControls
}: PipelineStepProps) {
    const logsEndRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (showLogs && logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [logs, showLogs]);

    return (
        <div className={cn(
            "group relative overflow-hidden rounded-2xl border transition-all duration-300",
            status === 'running' ? "border-blue-500 shadow-lg shadow-blue-500/10 bg-blue-50/20 dark:border-indigo-500 dark:shadow-indigo-500/10 dark:bg-indigo-900/10" :
                status === 'completed' ? "border-emerald-200 bg-emerald-50/10 dark:border-emerald-800 dark:bg-emerald-900/10" :
                    "border-gray-200 dark:border-slate-800 bg-white dark:bg-card hover:border-blue-200 dark:hover:border-indigo-700 hover:shadow-md"
        )}>
            {/* Left accent bar */}
            <div className={cn(
                "absolute left-0 top-0 bottom-0 w-1 transition-all",
                status === 'running' ? "bg-blue-500 dark:bg-indigo-500" :
                    status === 'completed' ? "bg-emerald-500" :
                        "bg-transparent group-hover:bg-blue-200 dark:group-hover:bg-indigo-700"
            )} />

            <div className="p-3">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className={cn(
                            "p-2 rounded-xl transition-colors",
                            status === 'running' ? "bg-blue-100 text-blue-600 dark:bg-indigo-900/50 dark:text-indigo-400" :
                                status === 'completed' ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-400" :
                                    "bg-gray-50 dark:bg-slate-800 text-gray-400 dark:text-slate-500 group-hover:bg-blue-50 dark:group-hover:bg-indigo-900/30 group-hover:text-blue-500 dark:group-hover:text-indigo-400"
                        )}>
                            {status === 'running' ? <Loader2 className="w-5 h-5 animate-spin" /> : icon}
                        </div>
                        <div className="flex-1">
                            <h3 className="font-bold text-gray-900 dark:text-slate-100 leading-tight text-sm">{title}</h3>
                            <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">{description}</p>
                        </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                        {extraControls && (
                            <div className="mb-2">
                                {extraControls}
                            </div>
                        )}

                        {status === 'idle' ? (
                            <Button
                                onClick={onRun}
                                size="sm"
                                className="bg-blue-600 hover:bg-blue-700 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white gap-2 px-4 shadow-sm"
                            >
                                <Play className="w-3.5 h-3.5" />
                                Run Step
                            </Button>
                        ) : status === 'running' ? (
                            <Button
                                onClick={onStop}
                                size="sm"
                                variant="destructive"
                                className="gap-2 px-4"
                                disabled={!onStop}
                            >
                                <Circle className="w-3 h-3 fill-current" />
                                Stop
                            </Button>
                        ) : status === 'completed' ? (
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400 text-xs font-bold">
                                <CheckCircle2 className="w-3 h-3" />
                                COMPLETED
                            </div>
                        ) : (
                            <Button
                                onClick={onRun}
                                variant="destructive"
                                size="sm"
                                className="gap-2"
                            >
                                <Play className="w-3.5 h-3.5" />
                                Retry
                            </Button>
                        )}

                        {logs.length > 0 && (
                            <button
                                onClick={onToggleLogs}
                                className="text-[10px] font-bold text-gray-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-indigo-400 flex items-center gap-1 uppercase tracking-wider transition-colors"
                            >
                                <Terminal className="w-3 h-3" />
                                {showLogs ? 'Hide Logs' : `${logs.length} Logs`}
                            </button>
                        )}
                    </div>
                </div>

                {/* Progress Logs */}
                {showLogs && logs.length > 0 && (
                    <div className="mt-6 border-t dark:border-slate-800 pt-4">
                        <div className="bg-gray-900 rounded-lg p-4 font-mono text-[11px] leading-relaxed max-h-[300px] overflow-y-auto custom-scrollbar">
                            {logs.map((log, i) => (
                                <div key={i} className={cn(
                                    "flex gap-3 mb-1.5 last:mb-0",
                                    log.type === 'error' ? "text-red-400 dark:text-rose-400" :
                                        log.type === 'status' ? "text-blue-400 dark:text-indigo-400 font-bold" : "text-gray-300 dark:text-slate-300"
                                )}>
                                    <span className="text-gray-600 dark:text-slate-600 shrink-0">
                                        [{log.timestamp.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}]
                                    </span>
                                    <span>{log.message}</span>
                                </div>
                            ))}
                            <div ref={logsEndRef} />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
