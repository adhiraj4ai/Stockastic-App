'use client';

import { AnalysisTabs } from '@/components/analysis/AnalysisTabs';
import { Button } from '@/components/ui/button';
import { num } from '@/lib/numbers';
import type { SignalCardData } from '@/types/signals-board';

interface Props { symbol: string; cards: SignalCardData[]; open: boolean; onClose: () => void; }

function EngineBlock({ card }: { card: SignalCardData }) {
    return (
        <div className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-center gap-2 mb-1.5">
                <span className="font-semibold text-sm">{card.strategy_name}</span>
                <span className="ml-auto text-[11px] text-muted-foreground">{card.tier} · {card.strength ?? 0}</span>
            </div>
            <ul className="flex flex-col gap-1">
                {card.conditions.map((c, i) => (
                    <li key={i} className="text-xs text-muted-foreground pl-3 relative before:content-[''] before:absolute before:left-0 before:top-1.5 before:h-1 before:w-1 before:rounded-full before:bg-ring">{c}</li>
                ))}
            </ul>
        </div>
    );
}

export function SignalDetailDrawer({ symbol, cards, open, onClose }: Props) {
    if (!open) return null;
    const lead = cards[0];
    const tradeable = !cards.some((c) => c.validation_state === 'research');
    return (
        <>
            <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
            <aside className="fixed top-0 right-0 h-full w-[min(440px,94vw)] bg-background border-l border-border z-50 flex flex-col" aria-label={`${symbol} detail`}>
                <div className="flex items-start gap-3 p-5 border-b border-border">
                    <span className="text-xl font-bold tracking-tight">{symbol}</span>
                    <button className="ml-auto text-muted-foreground" onClick={onClose} aria-label="Close">✕</button>
                </div>
                <div className="flex flex-col gap-3 p-5 overflow-auto">
                    <h3 className="text-[11px] tracking-wide text-muted-foreground">Why this fired</h3>
                    {cards.map((c, i) => <EngineBlock key={i} card={c} />)}
                    <AnalysisTabs symbol={symbol} ladder={{
                        cmp: num(lead.entry_price), entry: num(lead.entry_price),
                        stopLoss: num(lead.stop_loss_price) || undefined,
                        tp1: num(lead.target_price) || undefined, direction: lead.direction }} />
                    <div className="flex gap-2">
                        <Button variant="outline" className="flex-1">Add to watchlist</Button>
                        <Button className="flex-1" disabled={!tradeable}>Place paper trade</Button>
                    </div>
                </div>
            </aside>
        </>
    );
}
