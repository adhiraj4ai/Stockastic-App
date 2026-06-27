'use client';

import { fixed } from '@/lib/numbers';
import { ConvictionMeter } from './ConvictionMeter';
import { GlossaryTooltip } from './GlossaryTooltip';
import type { Glossary, SignalCardData } from '@/types/signals-board';

interface Props {
    card: SignalCardData;
    consensusCount: number;
    glossary: Glossary | null;
    onOpen: (card: SignalCardData) => void;
}

function Levels({ card }: { card: SignalCardData }) {
    if (!card.stop_loss_price || !card.target_price) {
        return (
            <div className="text-xs text-muted-foreground tabular-nums">
                entry <b className="text-foreground">{fixed(card.entry_price, 2)}</b>
                <span className="ml-3 text-muted-foreground/70">close on flip</span>
            </div>
        );
    }
    return (
        <div className="flex gap-3 text-xs text-muted-foreground tabular-nums">
            <span>entry <b className="text-foreground">{fixed(card.entry_price, 2)}</b></span>
            <span>stop <b className="text-foreground">{fixed(card.stop_loss_price, 2)}</b></span>
            <span>target <b className="text-foreground">{fixed(card.target_price, 2)}</b></span>
        </div>
    );
}

function DirectionBadge({ isBuy }: { isBuy: boolean }) {
    const classes = isBuy
        ? 'text-emerald-600 bg-emerald-500/10'
        : 'text-rose-600 bg-rose-500/10';
    return (
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${classes}`}>
            {isBuy ? 'buy' : 'sell'}
        </span>
    );
}

function ConsensusChip({ count }: { count: number }) {
    return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-ring" />
            confirmed by {count} families
        </span>
    );
}

export function SignalCard({ card, consensusCount, glossary, onOpen }: Props) {
    const isBuy = card.direction === 'BUY';
    return (
        <button
            onClick={() => onOpen(card)}
            className="w-full text-left flex flex-col gap-2 rounded-xl border border-border bg-card p-3 transition hover:-translate-y-0.5 hover:bg-accent"
        >
            <div className="flex items-center gap-2">
                <span className="font-bold tracking-tight">{card.symbol}</span>
                <DirectionBadge isBuy={isBuy} />
                <span className="ml-auto text-xs text-muted-foreground">detail ▸</span>
            </div>
            <div className="text-xs text-muted-foreground">
                <GlossaryTooltip
                    entry={glossary?.sources[card.source]}
                    fallback={card.strategy_name.toLowerCase()}
                />
            </div>
            <div className="flex items-center gap-2">
                <ConvictionMeter value={card.strength ?? 0} />
                {card.tier && (
                    <span className="text-[11px] text-muted-foreground">
                        <GlossaryTooltip
                            entry={glossary?.tiers[card.tier]}
                            fallback={card.tier.toLowerCase()}
                        />
                    </span>
                )}
            </div>
            <Levels card={card} />
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                {consensusCount >= 2 && <ConsensusChip count={consensusCount} />}
                {card.freshness_date && (
                    <span className="ml-auto tabular-nums">{card.freshness_date}</span>
                )}
            </div>
        </button>
    );
}
