'use client';

import { BrainCircuit, Info, ShieldCheck, AlertTriangle, Zap, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface IntelligenceGlassProps {
    fundamentalScore: number;
    technicalScore: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    macd: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

export function IntelligenceGlass({
    fundamentalScore,
    technicalScore,
    riskLevel,
    macd
}: IntelligenceGlassProps) {
    const combinedScore = (fundamentalScore + technicalScore) / 2;

    const getVerdict = () => {
        if (combinedScore > 75) return { label: 'Strong Outperform', color: 'text-emerald-600', glow: 'soft-glow-emerald', icon: ShieldCheck, status: 'OPTIMAL' };
        if (combinedScore > 60) return { label: 'Bullish Momentum', color: 'text-blue-600', glow: 'soft-glow-blue', icon: BrainCircuit, status: 'FAVORABLE' };
        if (combinedScore > 40) return { label: 'Market Consensus', color: 'text-slate-600', glow: '', icon: Info, status: 'NEUTRAL' };
        return { label: 'High Fragility', color: 'text-rose-600', glow: 'soft-glow-rose', icon: AlertTriangle, status: 'BEARISH' };
    };

    const verdict = getVerdict();

    return (
        <div className="glass-card-light rounded-3xl overflow-hidden p-8 space-y-8 h-full relative group">
            <div className="absolute top-0 right-0 p-4">
                <Zap size={24} className="text-slate-100 group-hover:text-amber-500/20 transition-colors" />
            </div>

            {/* Header: Dynamic Status */}
            <div className="space-y-4">
                <div className="flex items-center gap-3">
                    <div className={cn("p-2.5 rounded-2xl bg-white border border-slate-200 shadow-sm", verdict.color)}>
                        <verdict.icon size={22} />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cognitive Intelligence</p>
                        <h2 className={cn("text-2xl font-bold tracking-tight uppercase", verdict.color)}>{verdict.label}</h2>
                    </div>
                </div>
            </div>

            {/* Data Layer */}
            <div className="grid grid-cols-1 gap-6">
                <div className="space-y-2">
                    <div className="flex justify-between items-end">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Fundamental Alpha</span>
                        <span className="text-lg font-bold text-slate-900 tabular-nums">{fundamentalScore}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full transition-all duration-1500" style={{ width: `${fundamentalScore}%` }} />
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="flex justify-between items-end">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Technical Strength</span>
                        <span className="text-lg font-bold text-slate-900 tabular-nums">{technicalScore}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full transition-all duration-1500" style={{ width: `${technicalScore}%` }} />
                    </div>
                </div>
            </div>

            {/* Signals Grid */}
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                <div className="p-4 rounded-2xl bg-slate-50/50 border border-slate-100 space-y-1">
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Trend Signal</p>
                    <div className="flex items-center gap-2">
                        {macd === 'BULLISH' ? <ArrowUpRight size={14} className="text-emerald-500" /> : <ArrowDownRight size={14} className="text-rose-500" />}
                        <span className="font-bold text-sm text-slate-800">{macd}</span>
                    </div>
                </div>
                <div className="p-4 rounded-2xl bg-slate-50/50 border border-slate-100 space-y-1">
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Risk Latency</p>
                    <div className="flex items-center gap-2">
                        <div className={cn(
                            "w-1.5 h-1.5 rounded-full",
                            riskLevel === 'LOW' ? "bg-emerald-500" : riskLevel === 'MEDIUM' ? "bg-amber-500" : "bg-rose-500"
                        )} />
                        <span className="font-bold text-sm text-slate-800 uppercase">{riskLevel}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
