'use client';

import React from 'react';
import { AlertTriangle, TrendingDown, TrendingUp, BarChart3, Target, Shield, Quote } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatNepaliNumber } from '@/lib/formatters';
import { computeExitRiskReward, buildExitLadder } from '@/lib/exitPlan';
import type { StrategyOption, HealthWarning } from '@/hooks/useExitStrategy';

export interface PlanTabProps {
    strategies: Record<string, StrategyOption>;
    healthWarnings: HealthWarning[];
    currentPrice: number;
    wacc: number;
    sl: string;
    tp: string;
    tp2: string;
    tp3: string;
    thesis: string;
    selectedStrategy: string;
    onApplyStrategy(key: string): void;
    onField(field: 'sl' | 'tp' | 'tp2' | 'tp3' | 'thesis', value: string): void;
}

const SEVERITY_STYLES: Record<string, string> = {
    HIGH: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-400',
    MEDIUM: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800 text-orange-800 dark:text-orange-400',
    LOW: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-400',
};

function HealthWarnings({ warnings }: { warnings: HealthWarning[] }) {
    if (!warnings.length) return null;
    return (
        <div className="space-y-2">
            {warnings.map((w, i) => (
                <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${SEVERITY_STYLES[w.severity] ?? SEVERITY_STYLES['LOW']}`}>
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <div className="text-xs">
                        <span className="font-bold mr-2 tracking-tight">Health warning:</span>
                        {w.message}
                    </div>
                </div>
            ))}
        </div>
    );
}

const CARD_ICON: Record<string, React.ReactNode> = {
    atr_conservative: <Shield className="h-3.5 w-3.5 text-blue-600" />,
    swing: <BarChart3 className="h-3.5 w-3.5 text-purple-600" />,
    fixed: <Target className="h-3.5 w-3.5 text-green-600" />,
};

function GamePlanCard({ stratKey, option, selected, onApply }: { stratKey: string; option: StrategyOption; selected: boolean; onApply: (k: string) => void }) {
    return (
        <div
            onClick={() => onApply(stratKey)}
            className={`p-4 rounded-2xl cursor-pointer transition-all duration-300 relative min-w-0 border-2 ${selected ? 'bg-primary/10 shadow-lg shadow-primary/10 border-primary' : 'bg-slate-50/50 dark:bg-slate-800/50 hover:bg-accent border-transparent'}`}
        >
            <div className="flex justify-between items-center mb-2">
                <span className={`font-medium text-xs ${selected ? 'text-primary' : 'text-slate-600 dark:text-slate-300'}`}>{option.name}</span>
                {CARD_ICON[stratKey]}
            </div>
            <div className="grid grid-cols-2 gap-2 text-[10px] font-bold mb-3">
                <div className="bg-red-50 text-red-600 px-2 py-1 rounded-lg text-center border border-red-100/50">SL {option.sl.toFixed(0)}</div>
                <div className="bg-green-50 text-green-600 px-2 py-1 rounded-lg text-center border border-green-100/50">TP {option.tp.toFixed(0)}</div>
            </div>
            <p className="text-[10px] leading-relaxed text-slate-400 dark:text-slate-500 font-medium line-clamp-2">{option.desc}</p>
        </div>
    );
}

function GamePlanCards({ strategies, selectedStrategy, onApplyStrategy }: Pick<PlanTabProps, 'strategies' | 'selectedStrategy' | 'onApplyStrategy'>) {
    return (
        <div>
            <div className="flex items-center gap-2 mb-1.5">
                <div className="h-4 w-1 bg-primary rounded-full" />
                <Label className="text-[11px] font-bold text-slate-400 dark:text-slate-500">Suggested AI game plans</Label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {Object.entries(strategies).map(([key, option]) => (
                    <GamePlanCard key={key} stratKey={key} option={option} selected={selectedStrategy === key} onApply={onApplyStrategy} />
                ))}
            </div>
        </div>
    );
}

function ExitInputs({ sl, tp, tp2, tp3, currentPrice, onField }: Pick<PlanTabProps, 'sl' | 'tp' | 'tp2' | 'tp3' | 'currentPrice' | 'onField'>) {
    const rr = computeExitRiskReward(currentPrice, Number(sl), Number(tp));
    const rrLabel = rr != null ? `1:${rr.toFixed(2)}` : 'N/A';
    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 px-1">
                <Label className="text-[11px] font-bold text-primary block">Execution parameters</Label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <TargetInput label="Target 1 (primary)" value={tp} field="tp" onField={onField} />
                <TargetInput label="Target 2" value={tp2} field="tp2" onField={onField} placeholder="Scale out" />
                <TargetInput label="Target 3" value={tp3} field="tp3" onField={onField} placeholder="Moonbag" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                    <Label className="text-[11px] text-red-500 dark:text-red-400 font-bold">Stop loss</Label>
                    <div className="relative">
                        <TrendingDown className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-red-500" />
                        <Input type="number" value={sl} onChange={e => onField('sl', e.target.value)} className="pl-9 text-sm font-bold h-10 bg-white dark:bg-card border-slate-200 dark:border-slate-700 rounded-xl shadow-sm" />
                    </div>
                </div>
                <div className="sm:col-span-2 flex items-center pt-5">
                    <div className="flex items-center gap-2">
                        <BarChart3 className="h-3.5 w-3.5 text-primary" />
                        <span className="text-xs text-slate-400 font-bold">Risk/reward</span>
                        <span className="text-base font-bold text-primary">{rrLabel}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

function TargetInput({ label, value, field, onField, placeholder }: { label: string; value: string; field: 'tp' | 'tp2' | 'tp3'; onField: PlanTabProps['onField']; placeholder?: string }) {
    return (
        <div className="space-y-1.5">
            <Label className="text-[11px] text-slate-500 dark:text-slate-400 font-bold tracking-tight">{label}</Label>
            <div className="relative">
                <TrendingUp className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-green-500" />
                <Input type="number" value={value} onChange={e => onField(field, e.target.value)} placeholder={placeholder ?? 'Price'} className="pl-9 text-sm font-bold h-10 bg-white dark:bg-card border-slate-200 dark:border-slate-700 rounded-xl shadow-sm" />
            </div>
        </div>
    );
}

const LADDER_DOT: Record<string, string> = {
    sl: 'bg-rose-500',
    entry: 'bg-slate-600 dark:bg-slate-300',
    cmp: 'bg-indigo-500 ring-2 ring-indigo-200 dark:ring-indigo-900',
    t1: 'bg-emerald-500',
    t2: 'bg-emerald-400',
    t3: 'bg-emerald-300',
};

const toNum = (s: string): number | undefined => (s === '' ? undefined : Number(s));

function ExitPriceLadder({ sl, tp, tp2, tp3, wacc, currentPrice }: Pick<PlanTabProps, 'sl' | 'tp' | 'tp2' | 'tp3' | 'wacc' | 'currentPrice'>) {
    const points = buildExitLadder({ stopLoss: toNum(sl), entry: wacc, cmp: currentPrice, t1: toNum(tp), t2: toNum(tp2), t3: toNum(tp3) });
    if (!points.length) return null;
    const min = points[points.length - 1].price;
    const span = (points[0].price - min) || 1;
    return (
        <div className="px-3 pt-2 pb-6 border border-border rounded-xl bg-slate-50/30 dark:bg-card/30">
            <Label className="text-[11px] font-bold text-slate-400 dark:text-slate-500 mb-3 block">Price ladder</Label>
            <div className="relative h-px bg-slate-200 dark:bg-slate-700 my-6">
                {points.map(p => (
                    <div key={p.key} className="absolute -translate-x-1/2 flex flex-col items-center" style={{ left: `${((p.price - min) / span) * 100}%` }}>
                        <span className={`h-2.5 w-2.5 rounded-full -mt-1.5 ${LADDER_DOT[p.key] ?? 'bg-slate-400'}`} />
                        <span className="text-[9px] text-slate-500 mt-1 whitespace-nowrap font-bold">{p.label}</span>
                        <span className="text-[9px] font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">{formatNepaliNumber(p.price)}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function ThesisField({ thesis, onField }: Pick<PlanTabProps, 'thesis' | 'onField'>) {
    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2 px-1">
                <Quote className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                <Label className="text-[11px] font-bold text-slate-400 dark:text-slate-500">Trade thesis</Label>
            </div>
            <Textarea
                placeholder="Document your rationale for this exit plan..."
                className="text-xs resize-none bg-slate-50/30 dark:bg-card/30 border-border dark:border-slate-700 italic leading-relaxed rounded-2xl p-4 focus-visible:ring-slate-200 dark:focus-visible:ring-slate-700 h-[100px]"
                value={thesis}
                onChange={e => onField('thesis', e.target.value)}
            />
        </div>
    );
}

export function PlanTab(props: PlanTabProps) {
    const { strategies, healthWarnings, currentPrice, wacc, sl, tp, tp2, tp3, thesis, selectedStrategy, onApplyStrategy, onField } = props;
    return (
        <div className="space-y-5">
            <GamePlanCards strategies={strategies} selectedStrategy={selectedStrategy} onApplyStrategy={onApplyStrategy} />
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                <div className="lg:col-span-7 space-y-4">
                    <ExitInputs sl={sl} tp={tp} tp2={tp2} tp3={tp3} currentPrice={currentPrice} onField={onField} />
                </div>
                <div className="lg:col-span-5 space-y-4">
                    <ExitPriceLadder sl={sl} tp={tp} tp2={tp2} tp3={tp3} wacc={wacc} currentPrice={currentPrice} />
                    <HealthWarnings warnings={healthWarnings} />
                </div>
            </div>
            <ThesisField thesis={thesis} onField={onField} />
        </div>
    );
}
