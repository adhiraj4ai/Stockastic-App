'use client';

import React from 'react';
import { Target, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { DialogTitle } from '@/components/ui/dialog';
import { formatRupees } from '@/lib/formatters';
import type { PortfolioItem } from '@/components/PortfolioTable';

interface ExitDialogHeaderProps {
    item: PortfolioItem;
    currentPrice: number;
    wacc: number;
    isUnderwater: boolean;
    onClose: () => void;
    children?: React.ReactNode;
}

const SIGNAL_STYLES: Record<string, string> = {
    BUY: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
    SELL: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400',
    HOLD: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    NEUTRAL: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    MIXED: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
};

function SignalPill({ summary }: { summary: string }) {
    const style = SIGNAL_STYLES[summary] ?? SIGNAL_STYLES['NEUTRAL'];
    return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${style}`}>{summary}</span>;
}

function MetricStrip({ currentPrice, wacc, item }: Pick<ExitDialogHeaderProps, 'currentPrice' | 'wacc' | 'item'>) {
    const glPct = item.gain_loss_percent != null ? Number(item.gain_loss_percent) : null;
    const tone = (glPct ?? 0) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
    return (
        <div className="hidden md:flex items-center gap-6 text-xs tabular-nums">
            <span className="text-slate-500">LTP <strong className="text-slate-800 dark:text-slate-200">{formatRupees(currentPrice)}</strong></span>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <span className="text-slate-500">Avg cost <strong className="text-slate-800 dark:text-slate-200">{formatRupees(wacc)}</strong></span>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <span className="text-slate-500">Qty <strong className="text-slate-800 dark:text-slate-200">{item.quantity}</strong></span>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <span className={`font-bold ${tone}`}>P/L {glPct != null ? `${glPct.toFixed(2)}%` : '—'}</span>
        </div>
    );
}

export function ExitDialogHeader({ item, currentPrice, wacc, isUnderwater, onClose, children }: ExitDialogHeaderProps) {
    const summary = item.signals?.summary;
    return (
        <div className="bg-slate-50/50 dark:bg-slate-800/50 p-5 px-6 border-b border-gray-100/80 dark:border-slate-700/80">
            <div className="flex items-center justify-between w-full gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary rounded-xl text-primary-foreground shadow-lg shadow-primary/20">
                        <Target className="h-5 w-5" />
                    </div>
                    <div className="flex flex-col items-start gap-1">
                        <DialogTitle className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                            Exit strategy · {item.ticker}
                        </DialogTitle>
                        <div className="flex items-center gap-2">
                            {isUnderwater
                                ? <Badge className="bg-rose-600 text-white border-none text-[10px] px-2 py-0.5 font-bold">Underwater</Badge>
                                : <Badge variant="outline" className="border-primary/30 text-primary bg-primary/10 text-[10px]">Strategic view</Badge>}
                            {summary && <SignalPill summary={summary} />}
                        </div>
                    </div>
                </div>
                <MetricStrip currentPrice={currentPrice} wacc={wacc} item={item} />
                <button
                    onClick={onClose}
                    className="p-2 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 rounded-full transition-colors text-slate-400 dark:text-slate-500"
                    aria-label="Close"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>
            {children}
        </div>
    );
}
