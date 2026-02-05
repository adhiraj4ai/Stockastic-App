'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, DollarSign, PieChart, TrendingUp, BarChart, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FundamentalCoreProps {
    metrics: {
        label: string;
        value: string | number;
        icon: any;
        color: string;
        description?: string;
    }[];
}

export function FundamentalCore({ metrics }: FundamentalCoreProps) {
    return (
        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/30 dark:bg-slate-800/20">
                <CardTitle className="text-[10px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-2 uppercase">
                    <Activity size={14} className="text-blue-500" />
                    Fundamental DNA & Ratios
                </CardTitle>
                <div className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">Q4 2025</div>
            </div>
            <CardContent className="p-0">
                <div className="grid grid-cols-2 md:grid-cols-3 divide-x divide-y divide-slate-100 dark:divide-slate-800">
                    {metrics.map((m, idx) => (
                        <div key={idx} className="p-6 space-y-3 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors group">
                            <div className="flex items-center justify-between">
                                <div className={cn("p-2 rounded-lg bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700 group-hover:scale-110 transition-transform", m.color)}>
                                    <m.icon size={16} />
                                </div>
                                <div className="text-[9px] font-bold text-slate-300 uppercase">REF: 2025.Q4</div>
                            </div>
                            <div className="space-y-0.5">
                                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">{m.label}</p>
                                <p className="text-xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">{m.value}</p>
                            </div>
                            {m.description && (
                                <p className="text-[9px] font-medium text-slate-400 leading-tight italic">
                                    {m.description}
                                </p>
                            )}
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
