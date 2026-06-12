'use client';

import React from 'react';
import { ShieldCheck, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export const InstitutionalInterest = () => {
    // Simulated data
    const metrics = [
        { label: 'Smart Money Buy', value: 68 },
        { label: 'Accumulation Score', value: 74 },
        { label: 'Bulk Deal Activity', value: 42 }
    ];

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-primary/10 rounded-md">
                        <ShieldCheck size={14} className="text-primary" />
                    </div>
                    <span className="text-sm font-bold text-slate-900 dark:text-slate-100 tracking-tight">Institutional Participation</span>
                </div>
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger>
                            <Info size={12} className="text-slate-400 hover:text-slate-600 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent className="bg-slate-900 border-none text-white text-[10px] p-2 max-w-[200px]">
                            Simulated metrics based on volume pattern analysis and block trade estimation.
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </div>

            <div className="grid grid-cols-1 gap-3">
                {metrics.map((m, i) => (
                    <div key={i} className="space-y-1.5">
                        <div className="flex justify-between text-[10px] font-bold">
                            <span className="text-slate-900 dark:text-slate-300 tracking-tight">{m.label}</span>
                            <span className="text-primary font-bold">{m.value}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-primary rounded-full transition-all duration-1000"
                                style={{ width: `${m.value}%` }}
                            ></div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="mt-4 p-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                <p className="text-[9px] text-slate-600 dark:text-slate-400 leading-relaxed">
                    <span className="font-bold text-slate-900 dark:text-slate-200">Analyst Note:</span> "Major accumulation visible in <span className="font-bold text-primary">Commercial Banks</span> sector. Turnover suggests institutional support levels forming."
                </p>
            </div>
        </div>
    );
};
