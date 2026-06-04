import React from 'react';
import { TrendingUp, TrendingDown, Minus, Target } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SignalCardData {
    symbol?: string;
    verdict?: 'BUY' | 'SELL' | 'HOLD';
    buy_count?: number;
    sell_count?: number;
    strategy_signals?: Array<{ strategy: string; signal: string; date: string }>;
    generated_signals?: Array<{
        source: string;
        signal: string;
        tier?: string;
        strength: number;
        status: string;
        target?: number | null;
        stop?: number | null;
    }>;
    track_record?: {
        source: string;
        total: number;
        won: number;
        lost: number;
        active: number;
        win_rate: number;
    };
}

export default function SignalCard(data: SignalCardData) {
    const { symbol, verdict = 'HOLD', buy_count = 0, sell_count = 0, strategy_signals = [], generated_signals = [], track_record } = data;

    const verdictTone =
        verdict === 'BUY'
            ? 'text-emerald-600 dark:text-emerald-400 border-emerald-500/40 bg-emerald-50/50 dark:bg-emerald-950/20'
            : verdict === 'SELL'
                ? 'text-rose-600 dark:text-rose-400 border-rose-500/40 bg-rose-50/50 dark:bg-rose-950/20'
                : 'text-foreground border-border bg-muted/40';

    const VerdictIcon = verdict === 'BUY' ? TrendingUp : verdict === 'SELL' ? TrendingDown : Minus;

    if (track_record) {
        return (
            <div className="surface p-4 text-sm">
                <div className="flex items-center gap-2 mb-3">
                    <Target size={14} className="text-muted-foreground" />
                    <span className="font-medium text-foreground">Signal track record</span>
                    <span className="text-[11px] text-muted-foreground">· {track_record.source}</span>
                </div>
                <div className="grid grid-cols-4 gap-3 tabular-nums">
                    <Stat label="Total" value={track_record.total} />
                    <Stat label="Won" value={track_record.won} tone="emerald" />
                    <Stat label="Lost" value={track_record.lost} tone="rose" />
                    <Stat label="Win rate" value={`${track_record.win_rate}%`} />
                </div>
            </div>
        );
    }

    return (
        <div className="surface p-4 text-sm">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground tracking-tight">{symbol}</span>
                    <span className="text-[11px] text-muted-foreground">signal verdict</span>
                </div>
                <span className={cn('inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[12px] font-semibold', verdictTone)}>
                    <VerdictIcon size={12} /> {verdict}
                </span>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3 tabular-nums">
                <Stat label="Buy signals" value={buy_count} tone="emerald" />
                <Stat label="Sell signals" value={sell_count} tone="rose" />
            </div>
            {generated_signals.length > 0 && (
                <div className="border-t border-border pt-2.5">
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">Sources</div>
                    <div className="space-y-1">
                        {generated_signals.slice(0, 5).map((g, i) => (
                            <div key={i} className="flex items-center justify-between text-[12px]">
                                <span className="text-foreground">
                                    {g.source} <span className="text-muted-foreground">{g.tier && `· ${g.tier}`}</span>
                                </span>
                                <span className="tabular-nums text-muted-foreground">
                                    {g.signal} · strength {g.strength.toFixed(1)}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'emerald' | 'rose' }) {
    const toneClass =
        tone === 'emerald'
            ? 'text-emerald-600 dark:text-emerald-400'
            : tone === 'rose'
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-foreground';
    return (
        <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className={cn('text-lg font-semibold tabular-nums', toneClass)}>{value}</div>
        </div>
    );
}
