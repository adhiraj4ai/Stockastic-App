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

export default function SignalsBoard() {
    const [board, setBoard] = useState<BoardResponse | null>(null);
    const [glossary, setGlossary] = useState<Glossary | null>(null);
    const [open, setOpen] = useState<SignalCardData | null>(null);

    useEffect(() => {
        signalsApi.board().then((r) => setBoard(r.data)).catch(() => setBoard({ cards: [], consensus: {} }));
        signalsApi.glossary().then((r) => setGlossary(r.data)).catch(() => setGlossary(null));
    }, []);

    const drawerCards = useMemo(
        () => board && open ? board.cards.filter((c) => c.symbol === open.symbol && c.direction === open.direction) : [],
        [board, open]);

    if (!board) return <DashboardLayout title="Signals"><PageLoader /></DashboardLayout>;

    return (
        <DashboardLayout title="Signals">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
                {LANES.map((lane) => (
                    <SignalLane key={lane.key} title={lane.title} glossary={glossary} consensus={board.consensus}
                        cards={board.cards.filter((c) => c.family === lane.key)} onOpen={setOpen} />))}
            </div>
            <SignalDetailDrawer symbol={open?.symbol ?? ''} cards={drawerCards} open={!!open} onClose={() => setOpen(null)} />
        </DashboardLayout>
    );
}
