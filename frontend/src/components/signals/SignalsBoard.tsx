'use client';

import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { PageLoader } from '@/components/ui/StockLoader';
import { SignalLane } from './SignalLane';
import { SignalDetailDrawer } from './SignalDetailDrawer';
import { signalsApi } from '@/lib/api';
import type { BoardResponse, Glossary, SignalCardData } from '@/types/signals-board';

const LANES: { key: SignalCardData['family']; title: string }[] = [
    { key: 'accumulation', title: 'Accumulation' },
    { key: 'technical', title: 'Technical' },
    { key: 'your_strategies', title: 'Your strategies' },
];

const DIRECTION_OPTIONS: [string, string][] = [['', 'All'], ['BUY', 'Buy'], ['SELL', 'Sell']];
const MIN_FAMILY_OPTIONS: [string | undefined, string][] = [[undefined, '1+'], ['2', '2+'], ['3', '3']];

type Filters = { direction?: string; min_families?: string };

function buildBoardParams(filters: Filters): Record<string, string> {
    const params: Record<string, string> = {};
    if (filters.direction) params.direction = filters.direction;
    if (filters.min_families) params.min_families = filters.min_families;
    return params;
}

export default function SignalsBoard() {
    const [board, setBoard] = useState<BoardResponse | null>(null);
    const [glossary, setGlossary] = useState<Glossary | null>(null);
    const [open, setOpen] = useState<SignalCardData | null>(null);
    const [filters, setFilters] = useState<Filters>({});

    useEffect(() => {
        const params = buildBoardParams(filters);
        signalsApi.board(params).then((r) => setBoard(r.data)).catch(() => setBoard({ cards: [], consensus: {} }));
    }, [filters]);

    useEffect(() => {
        signalsApi.glossary().then((r) => setGlossary(r.data)).catch(() => setGlossary(null));
    }, []);

    const drawerCards = useMemo(
        () => board && open ? board.cards.filter((c) => c.symbol === open.symbol && c.direction === open.direction) : [],
        [board, open]);

    const buys = board?.cards.filter((c) => c.direction === 'BUY').length ?? 0;
    const sells = board?.cards.filter((c) => c.direction === 'SELL').length ?? 0;

    if (!board) return <DashboardLayout title="Signals"><PageLoader /></DashboardLayout>;

    return (
        <DashboardLayout title="Signals">
            <div className="flex items-center gap-4 flex-wrap pt-2 pb-3">
                <p className="text-sm text-muted-foreground tabular-nums">{buys} bullish · {sells} bearish</p>
                <div className="ml-auto flex items-center gap-2">
                    <div className="inline-flex rounded-lg border border-border overflow-hidden" role="group" aria-label="Min families">
                        {MIN_FAMILY_OPTIONS.map(([val, label]) => (
                            <button
                                key={label}
                                onClick={() => setFilters((f) => ({ ...f, min_families: val }))}
                                aria-pressed={(filters.min_families) === val}
                                className={`px-3 py-1.5 text-xs ${(filters.min_families) === val ? 'bg-accent text-foreground' : 'text-muted-foreground'}`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <div className="inline-flex rounded-lg border border-border overflow-hidden" role="group" aria-label="Direction">
                        {DIRECTION_OPTIONS.map(([val, label]) => (
                            <button
                                key={label}
                                onClick={() => setFilters((f) => ({ ...f, direction: val || undefined }))}
                                aria-pressed={(filters.direction ?? '') === val}
                                className={`px-3 py-1.5 text-xs ${(filters.direction ?? '') === val ? 'bg-accent text-foreground' : 'text-muted-foreground'}`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {LANES.map((lane) => (
                    <SignalLane key={lane.key} title={lane.title} glossary={glossary} consensus={board.consensus}
                        cards={board.cards.filter((c) => c.family === lane.key)} onOpen={setOpen} />))}
            </div>
            <SignalDetailDrawer symbol={open?.symbol ?? ''} cards={drawerCards} open={!!open} onClose={() => setOpen(null)} />
        </DashboardLayout>
    );
}
