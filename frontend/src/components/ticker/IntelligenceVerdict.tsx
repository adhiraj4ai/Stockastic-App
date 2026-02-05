'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BrainCircuit, Info, ShieldCheck, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface IntelligenceVerdictProps {
    fundamentalScore: number; // 0-100
    technicalScore: number; // 0-100
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

export function IntelligenceVerdict({
    fundamentalScore,
    technicalScore,
    riskLevel
}: IntelligenceVerdictProps) {
    const combinedScore = (fundamentalScore + technicalScore) / 2;

    const getVerdict = () => {
        if (combinedScore > 75) return { label: 'Strong Buy / Accumulate', color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-200 dark:border-emerald-800', icon: ShieldCheck };
        if (combinedScore > 60) return { label: 'Bullish Bias', color: 'text-blue-700 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-200 dark:border-blue-800', icon: BrainCircuit };
        if (combinedScore > 40) return { label: 'Neutral / Consolidation', color: 'text-slate-700 dark:text-slate-400', bg: 'bg-slate-50 dark:bg-slate-800/40', border: 'border-slate-200 dark:border-slate-700', icon: Info };
        return { label: 'Caution Required', color: 'text-rose-700 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-900/20', border: 'border-rose-200 dark:border-rose-800', icon: AlertTriangle };
    };

    const verdict = getVerdict();

    return (
        <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <CardContent className="p-0">
                <div className={cn("px-6 py-4 border-b dark:border-slate-800 flex items-center justify-between", verdict.bg, verdict.border)}>
                    <div className="flex items-center gap-3">
                        <div className={cn("p-2 rounded-lg bg-white dark:bg-slate-900 shadow-sm", verdict.color)}>
                            <verdict.icon size={18} />
                        </div>
                        <div className="space-y-0.5">
                            <p className="text-[10px] font-bold opacity-60 uppercase">System Intelligence Verdict</p>
                            <p className={cn("text-base font-bold uppercase", verdict.color)}>{verdict.label}</p>
                        </div>
                    </div>
                    <Badge variant="outline" className={cn(
                        "font-bold text-[10px] px-3 py-1 rounded-md border-2",
                        riskLevel === 'LOW' ? "border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400" :
                            riskLevel === 'MEDIUM' ? "border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400" : "border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400"
                    )}>
                        {riskLevel} RISK
                    </Badge>
                </div>

                <div className="grid grid-cols-2 divide-x divide-slate-100 dark:divide-slate-800">
                    <div className="p-6 space-y-4">
                        <div className="flex justify-between items-end">
                            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Fundamental Strength</p>
                            <p className="text-xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">{fundamentalScore}%</p>
                        </div>
                        <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-slate-900 dark:bg-slate-100 transition-all duration-1000" style={{ width: `${fundamentalScore}%` }} />
                        </div>
                    </div>
                    <div className="p-6 space-y-4">
                        <div className="flex justify-between items-end">
                            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Technical Momentum</p>
                            <p className="text-xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">{technicalScore}%</p>
                        </div>
                        <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-slate-900 dark:bg-slate-100 transition-all duration-1000" style={{ width: `${technicalScore}%` }} />
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
