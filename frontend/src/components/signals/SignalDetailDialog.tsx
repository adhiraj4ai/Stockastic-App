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

function CardHeader({ symbol, direction, sources, tradeable }: {
    symbol: string; direction?: 'BUY' | 'SELL'; sources: number; tradeable: boolean;
}) {
    return (
        <DialogHeader className="flex-row items-center gap-3 border-b border-border px-5 py-4 pr-12">
            <div className="flex flex-col gap-0.5">
                <DialogTitle className="text-xl leading-none">{symbol}</DialogTitle>
                <p className="text-xs text-muted-foreground">
                    {direction === 'SELL' ? 'Sell' : 'Buy'} signal · {sources} {sources === 1 ? 'source' : 'sources'}
                </p>
            </div>
            <div className="ml-auto flex items-center gap-2">
                <Button variant="outline" size="sm">Add to watchlist</Button>
                <Button size="sm" disabled={!tradeable}
                    title={tradeable ? undefined : 'Strategy not validated against buy-and-hold — review only'}>
                    Place paper trade
                </Button>
            </div>
        </DialogHeader>
    );
}

export function SignalDetailDialog({ symbol, cards, open, onClose }: Props) {
    const lead = cards[0];
    const blocks = cards.flatMap((c) => c.contributors ?? []);
    const tradeable = !cards.some((c) => c.validation_state === 'research');
    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
            <DialogContent className="flex flex-col gap-0 w-[88vw] max-w-[88vw] sm:max-w-[88vw] h-[90vh] max-h-[90vh] overflow-hidden p-0">
                <CardHeader symbol={symbol} direction={lead?.direction} sources={blocks.length} tradeable={tradeable} />
                <div className="grid flex-1 overflow-hidden md:grid-cols-[360px_1fr]">
                    <aside className="flex flex-col gap-2 border-b border-border p-5 overflow-y-auto max-h-[34vh] md:max-h-none md:h-full md:border-b-0 md:border-r">
                        <h3 className="text-[11px] tracking-wide text-muted-foreground">Why this fired</h3>
                        {blocks.map((b) => <EngineBlock key={b.source} block={b} />)}
                    </aside>
                    <div className="p-5 overflow-y-auto max-h-[52vh] md:max-h-none md:h-full">
                        {lead && (
                            <AnalysisTabs symbol={symbol} ladder={{
                                cmp: num(lead.entry_price), entry: num(lead.entry_price),
                                stopLoss: num(lead.stop_loss_price) || undefined,
                                tp1: num(lead.target_price) || undefined, direction: lead.direction,
                            }} />
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
