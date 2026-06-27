'use client';

import { SignalCard } from './SignalCard';
import type { BoardResponse, Glossary, SignalCardData } from '@/types/signals-board';

interface Props {
    title: string;
    cards: SignalCardData[];
    consensus: BoardResponse['consensus'];
    glossary: Glossary | null;
    onOpen: (card: SignalCardData) => void;
}

export function SignalLane({ title, cards, consensus, glossary, onOpen }: Props) {
    const buys = cards.filter((c) => c.direction === 'BUY').length;
    const skew = cards.length ? Math.round((buys / cards.length) * 100) : 0;
    return (
        <section className="flex flex-col rounded-xl border border-border bg-card/40 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3">
                <span className="font-semibold tracking-tight">{title}</span>
                <span className="text-xs text-muted-foreground rounded-full border border-border px-2 tabular-nums">{cards.length}</span>
                <span className="ml-auto h-1.5 w-16 rounded-full bg-rose-500/30 overflow-hidden" title={`${buys} buy`}>
                    <span className="block h-full bg-emerald-500" style={{ width: `${skew}%` }} /></span>
            </div>
            <div className="flex flex-col gap-2.5 px-3 pb-4">
                {cards.length === 0
                    ? <p className="text-xs text-muted-foreground text-center py-6">No {title.toLowerCase()} signals today.</p>
                    : cards.map((c, i) => (
                        <SignalCard key={`${c.source}-${c.symbol}-${i}`} card={c} glossary={glossary}
                            consensusCount={consensus[c.symbol]?.count ?? 1} onOpen={onOpen} />))}
            </div>
        </section>
    );
}
