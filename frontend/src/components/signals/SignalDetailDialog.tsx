'use client';

import { AnalysisTabs } from '@/components/analysis/AnalysisTabs';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { num } from '@/lib/numbers';
import type { SignalCardData, SignalContributor } from '@/types/signals-board';

interface Props { symbol: string; cards: SignalCardData[]; open: boolean; onClose: () => void; }

function EngineBlock({ block }: { block: SignalContributor }) {
    return (
        <div className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-center gap-2 mb-1.5">
                <span className="font-semibold text-sm">{block.strategy_name}</span>
                <span className="ml-auto text-[11px] text-muted-foreground">{block.tier} · {block.strength ?? 0}</span>
            </div>
            <ul className="flex flex-col gap-1">
                {block.conditions.map((c, i) => (
                    <li key={i} className="text-xs text-muted-foreground pl-3 relative before:content-[''] before:absolute before:left-0 before:top-1.5 before:h-1 before:w-1 before:rounded-full before:bg-ring">{c}</li>
                ))}
            </ul>
        </div>
    );
}

export function SignalDetailDialog({ symbol, cards, open, onClose }: Props) {
    const lead = cards[0];
    const blocks = cards.flatMap((c) => c.contributors ?? []);
    const tradeable = !cards.some((c) => c.validation_state === 'research');
    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{symbol}</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-3">
                    <h3 className="text-[11px] tracking-wide text-muted-foreground">Why this fired</h3>
                    {blocks.map((b) => <EngineBlock key={b.source} block={b} />)}
                    {lead && (
                        <AnalysisTabs symbol={symbol} ladder={{
                            cmp: num(lead.entry_price), entry: num(lead.entry_price),
                            stopLoss: num(lead.stop_loss_price) || undefined,
                            tp1: num(lead.target_price) || undefined, direction: lead.direction,
                        }} />
                    )}
                    <div className="flex gap-2">
                        <Button variant="outline" className="flex-1">Add to watchlist</Button>
                        <Button className="flex-1" disabled={!tradeable}>Place paper trade</Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
