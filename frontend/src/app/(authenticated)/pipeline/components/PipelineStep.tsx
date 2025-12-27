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
    logs?: LogEntry[];
    showLogs?: boolean;
    onToggleLogs?: () => void;
}

export function PipelineStep({
    title,
    description,
    status,
    icon,
    onRun,
    logs = [],
    showLogs = false,
    onToggleLogs
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
            status === 'running' ? "border-blue-500 shadow-lg shadow-blue-500/10 bg-blue-50/20" :
                status === 'completed' ? "border-emerald-200 bg-emerald-50/10" :
                    "border-gray-200 bg-white hover:border-blue-200 hover:shadow-md"
        )}>
            {/* Left accent bar */}
            <div className={cn(
                "absolute left-0 top-0 bottom-0 w-1 transition-all",
                status === 'running' ? "bg-blue-500" :
                    status === 'completed' ? "bg-emerald-500" :
                        "bg-transparent group-hover:bg-blue-200"
            )} />

            <div className="p-6">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className={cn(
                            "p-3 rounded-xl transition-colors",
                            status === 'running' ? "bg-blue-100 text-blue-600" :
                                status === 'completed' ? "bg-emerald-100 text-emerald-600" :
                                    "bg-gray-100 text-gray-500 group-hover:bg-blue-50 group-hover:text-blue-500"
                        )}>
                            {status === 'running' ? <Loader2 className="w-6 h-6 animate-spin" /> : icon}
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900 leading-tight">{title}</h3>
                            <p className="text-sm text-gray-500 mt-1 max-w-[280px]">{description}</p>
                        </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                        {status === 'idle' ? (
                            <Button
                                onClick={onRun}
                                size="sm"
                                className="bg-blue-600 hover:bg-blue-700 text-white gap-2 px-4 shadow-sm"
                            >
                                <Play className="w-3.5 h-3.5" />
                                Run Step
                            </Button>
                        ) : status === 'running' ? (
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold animate-pulse">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                PROCESSING
                            </div>
                        ) : status === 'completed' ? (
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
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
                                className="text-[10px] font-bold text-gray-400 hover:text-blue-600 flex items-center gap-1 uppercase tracking-wider transition-colors"
                            >
                                <Terminal className="w-3 h-3" />
                                {showLogs ? 'Hide Logs' : `${logs.length} Logs`}
                            </button>
                        )}
                    </div>
                </div>

                {/* Progress Logs */}
                {showLogs && logs.length > 0 && (
                    <div className="mt-6 border-t pt-4">
                        <div className="bg-gray-900 rounded-lg p-4 font-mono text-[11px] leading-relaxed max-h-[300px] overflow-y-auto custom-scrollbar">
                            {logs.map((log, i) => (
                                <div key={i} className={cn(
                                    "flex gap-3 mb-1.5 last:mb-0",
                                    log.type === 'error' ? "text-red-400" :
                                        log.type === 'status' ? "text-blue-400 font-bold" : "text-gray-300"
                                )}>
                                    <span className="text-gray-600 shrink-0">
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
