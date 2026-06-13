'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Lightbulb, MoreVertical, Trash2, Play, Edit, Activity } from 'lucide-react';

interface StrategyCardProps {
    id: number;
    name: string;
    description: string;
    publishedCount?: number;
    onClick?: () => void;
    onRun?: () => void;
    onEdit?: () => void;
    onDelete?: () => void;
}

export function StrategyCard({
    id,
    name,
    description,
    publishedCount = 0,
    onClick,
    onRun,
    onEdit,
    onDelete,
}: StrategyCardProps) {
    return (
        <Card
            className="group relative overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1.5 border-border flex flex-col cursor-pointer bg-white"
            onClick={onClick}
        >
            {/* Header Accent */}
            <div className="hidden" />

            <div className="px-4 py-3 border-b border-border bg-muted/40">
                <div className="flex items-start gap-4">
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary flex-shrink-0 shadow-sm border border-primary/20 group-hover:scale-110 transition-transform duration-300">
                        <Lightbulb size={20} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2 mb-1">
                            <div className="flex flex-col gap-1.5 min-w-0">
                                <h3 className="text-base font-bold text-slate-900 leading-tight truncate group-hover:text-primary transition-colors">
                                    {name}
                                </h3>
                                {publishedCount > 0 && (
                                    <div className="flex">
                                        <Badge className="bg-emerald-50 hover:bg-emerald-50 text-emerald-700 text-[10px] px-2 py-0.5 rounded-full font-bold border-emerald-100/50 shadow-none">
                                            <Activity size={10} className="mr-1" />
                                            Published ({publishedCount})
                                        </Badge>
                                    </div>
                                )}
                            </div>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <button
                                        className="h-8 w-8 rounded-lg hover:bg-accent hover:text-accent-foreground hover:shadow-sm flex items-center justify-center text-slate-400 transition-all flex-shrink-0"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <MoreVertical size={16} />
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="rounded-xl border-slate-200 shadow-lg">
                                    <DropdownMenuItem
                                        onSelect={onDelete}
                                        className="text-rose-600 focus:text-rose-600 focus:bg-rose-50 cursor-pointer rounded-lg m-1"
                                    >
                                        <Trash2 size={14} className="mr-2" />
                                        Delete Strategy
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                </div>
            </div>

            <div className="px-4 py-3 flex-1 bg-white">
                <p className="text-[12px] text-slate-500 leading-relaxed font-medium">
                    {description}
                </p>
            </div>

            <div className="flex bg-slate-50/80 border-t border-border">
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onRun?.();
                    }}
                    className="flex-1 py-3.5 flex items-center justify-center gap-2 text-xs font-bold text-slate-600 hover:text-primary hover:bg-accent transition-all active:scale-95 border-r border-border"
                >
                    <Play size={14} fill="currentColor" className="text-primary" /> Run
                </button>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onEdit?.();
                    }}
                    className="flex-1 py-3.5 flex items-center justify-center gap-2 text-xs font-bold text-slate-600 hover:text-emerald-600 hover:bg-accent transition-all active:scale-95"
                >
                    <Edit size={14} className="text-emerald-500" /> Edit
                </button>
            </div>
        </Card>
    );
}
