import React from 'react';
import { Wallet, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PortfolioCardData {
    invested: number;
    current: number;
    total_pl: number;
    total_pl_pct: number;
    day_pl: number;
    holdings_count: number;
    best?: { ticker: string; pct: number };
    worst?: { ticker: string; pct: number };
}

const npr = (n: number) =>
    `Rs ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export default function PortfolioCard(data: PortfolioCardData) {
    const positive = data.total_pl >= 0;
    return (
        <div className="surface p-4 text-sm">
            <div className="flex items-center gap-2 mb-3">
                <Wallet size={14} className="text-muted-foreground" />
                <span className="font-medium text-foreground">Portfolio overview</span>
                <span className="text-[11px] text-muted-foreground">· {data.holdings_count} holdings</span>
            </div>
            <div className="flex items-baseline gap-3 mb-3 tabular-nums">
                <span className="text-2xl font-semibold text-foreground">{npr(data.current)}</span>
                <span
                    className={cn(
                        'inline-flex items-center gap-1 text-[12px] font-medium',
                        positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
                    )}
                >
                    {positive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {npr(Math.abs(data.total_pl))} ({data.total_pl_pct.toFixed(2)}%)
                </span>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-3 tabular-nums">
                <Stat label="Invested" value={npr(data.invested)} />
                <Stat label="Day P/L" value={npr(Math.abs(data.day_pl))} tone={data.day_pl >= 0 ? 'emerald' : 'rose'} />
                <Stat label="Total P/L" value={`${data.total_pl_pct.toFixed(2)}%`} tone={positive ? 'emerald' : 'rose'} />
            </div>
            {(data.best || data.worst) && (
                <div className="border-t border-border pt-2.5 grid grid-cols-2 gap-3 text-[12px]">
                    {data.best && (
                        <div>
                            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Best</div>
                            <div className="text-foreground tabular-nums">
                                <span className="font-medium">{data.best.ticker}</span>{' '}
                                <span className="text-emerald-600 dark:text-emerald-400">+{data.best.pct.toFixed(2)}%</span>
                            </div>
                        </div>
                    )}
                    {data.worst && (
                        <div>
                            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Worst</div>
                            <div className="text-foreground tabular-nums">
                                <span className="font-medium">{data.worst.ticker}</span>{' '}
                                <span className="text-rose-600 dark:text-rose-400">{data.worst.pct.toFixed(2)}%</span>
                            </div>
                        </div>
                    )}
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
            <div className={cn('text-sm font-medium', toneClass)}>{value}</div>
        </div>
    );
}
