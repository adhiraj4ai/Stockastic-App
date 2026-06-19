'use client';

import React from 'react';
import { Landmark, Repeat } from 'lucide-react';
import { formatRupees, formatNepaliNumber } from '@/lib/formatters';
import type { PortfolioItem } from '@/components/PortfolioTable';
import {
    computeRiskReward, computeDayPercent, computeHoldingDays, buildPriceLadder,
} from '@/lib/holdingSnapshot';

const SIGNAL_STYLES: Record<string, string> = {
    BUY: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
    SELL: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400',
    HOLD: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    NEUTRAL: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    MIXED: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
};

const healthBarColor = (score: number) =>
    score >= 70 ? 'bg-emerald-500' : score >= 40 ? 'bg-amber-500' : 'bg-rose-500';

const asPct = (v: number | null | undefined) => (v == null ? 'N/A' : `${v.toFixed(1)}%`);
const asRatio = (v: number | null | undefined) => (v == null ? 'N/A' : v.toFixed(2));
const signed = (v: number, suffix: string) => {
    const n = Number(v);
    return `${n >= 0 ? '+' : ''}${n.toFixed(1)}${suffix}`;
};

function SnapshotHeader({ item }: { item: PortfolioItem }) {
    const ClsIcon = item.classification === 'investment' ? Landmark : Repeat;
    const summary = item.signals?.summary;
    const buyCount = item.signals?.buy_count;
    const pill = summary && buyCount != null ? `${summary} ${buyCount}/5` : summary;
    return (
        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-1.5 min-w-0">
                <ClsIcon size={13} className="text-slate-400 shrink-0" />
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{item.ticker}</span>
                {item.sector && <span className="text-[10px] text-slate-400 truncate">· {item.sector}</span>}
            </div>
            {summary && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap ${SIGNAL_STYLES[summary]}`}>{pill}</span>
            )}
        </div>
    );
}

function SnapshotMoney({ item }: { item: PortfolioItem }) {
    const up = item.gain_loss >= 0;
    const tone = up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
    const day = computeDayPercent(item.day_gain_loss, item.current_value);
    const rr = computeRiskReward(item.wacc, item.stop_loss_price, item.target_price);
    return (
        <div className="space-y-1 p-3">
            <div className={`text-xl font-bold tabular-nums ${tone}`}>{signed(item.gain_loss_percent, '%')}</div>
            <div className={`text-xs font-semibold tabular-nums ${tone}`}>{up ? '+' : ''}{formatRupees(item.gain_loss)}</div>
            <div className="text-[11px] text-slate-500">{item.quantity}u · {formatRupees(item.current_value)}</div>
            <div className="text-[11px] text-slate-500">Day {day == null ? '—' : signed(day, '%')}</div>
            <div className="text-[11px] text-slate-500">R/R {rr == null ? '—' : rr.toFixed(1)}</div>
        </div>
    );
}

function SnapshotFundamentals({ item }: { item: PortfolioItem }) {
    const f = item.fundamental_metrics;
    const score = item.health_score;
    const tag = item.tags?.[0];
    const days = item.purchased_at ? computeHoldingDays(item.purchased_at, new Date()) : null;
    return (
        <div className="space-y-1.5 p-3 border-l border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap">Health {score != null ? `${score}/100` : 'N/A'}</span>
                {score != null && (
                    <span className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                        <span className={`block h-full ${healthBarColor(score)}`} style={{ width: `${score}%` }} />
                    </span>
                )}
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                <span>P/E {asRatio(f?.pe)}</span><span>P/B {asRatio(f?.pb)}</span>
                <span>ROE {asPct(f?.roe)}</span><span>Gr {asPct(f?.growth)}</span>
                <span>D/E {asRatio(f?.de)}</span><span>Vol {asPct(item.volatility)}</span>
            </div>
            <div className="text-[10px] text-slate-400 pt-1">{tag ? `#${tag} · ` : ''}{days != null ? `held ${days}d` : ''}</div>
        </div>
    );
}

function PriceLadder({ item }: { item: PortfolioItem }) {
    const points = buildPriceLadder(item);
    const min = points[0].price;
    const span = (points[points.length - 1].price - min) || 1;
    const dot = (key: string) =>
        key === 'cmp' ? 'bg-indigo-500 ring-2 ring-indigo-200 dark:ring-indigo-900'
            : key === 'entry' ? 'bg-slate-700 dark:bg-slate-300' : 'bg-slate-400';
    return (
        <div className="px-3 pt-2 pb-3 border-t border-slate-200 dark:border-slate-800">
            <div className="relative h-px bg-slate-200 dark:bg-slate-700 my-5">
                {points.map(p => (
                    <div key={p.key} className="absolute -translate-x-1/2 flex flex-col items-center" style={{ left: `${((p.price - min) / span) * 100}%` }}>
                        <span className={`h-2 w-2 rounded-full -mt-1 ${dot(p.key)}`} />
                        <span className="text-[8px] text-slate-400 mt-1 whitespace-nowrap">{p.label}</span>
                        <span className="text-[8px] font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">{formatNepaliNumber(p.price)}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function HoldingSnapshot({ item }: { item: PortfolioItem }) {
    return (
        <div className="w-[360px] overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card">
            <SnapshotHeader item={item} />
            <div className="grid grid-cols-2">
                <SnapshotMoney item={item} />
                <SnapshotFundamentals item={item} />
            </div>
            <PriceLadder item={item} />
        </div>
    );
}
