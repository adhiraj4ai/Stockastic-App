'use client';

import { useEffect, useState } from 'react';
import api, { accumulationApi } from '@/lib/api';
import { CandidateTable } from '@/components/accumulation/CandidateTable';
import { PageLoader } from '@/components/ui/StockLoader';
import { PlaceTradeDialog } from './PlaceTradeDialog';
import type { AccumulationCandidate } from '@/types/accumulation-trading';

export default function AccumulationTradingPage() {
    const [candidates, setCandidates] = useState<AccumulationCandidate[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<AccumulationCandidate | null>(null);

    useEffect(() => {
        accumulationApi.listCandidates()
            .then((r) => setCandidates(r.data))
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <PageLoader />;

    return (
        <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
                Stocks where a few large brokers are accumulating. Validated setups can be
                traded into your paper account; research-only setups are for review.
            </p>
            <CandidateTable
                candidates={candidates}
                onPlaceTrade={(c) => setSelected(c)}
            />
            {selected && (
                <PlaceTradeDialog
                    candidate={selected}
                    api={api}
                    onClose={() => setSelected(null)}
                />
            )}
        </div>
    );
}
