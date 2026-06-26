'use client';

import { useState } from 'react';
import type { AxiosInstance } from 'axios';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { fixed } from '@/lib/numbers';
import type { AccumulationCandidate } from '@/types/accumulation-trading';

interface Props {
    candidate: AccumulationCandidate;
    accountId: number;
    api: AxiosInstance;
    onClose: () => void;
}

export function PlaceTradeDialog({ candidate, accountId, api, onClose }: Props) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const canTrade = candidate.suggested_qty !== null && candidate.suggested_qty !== undefined;

    const handleConfirm = async () => {
        if (!canTrade) return;
        setBusy(true);
        setError('');
        try {
            await api.post('/api/stocks/transactions/', {
                ticker: candidate.symbol,
                transaction_type: 'BUY',
                quantity: candidate.suggested_qty,
                rate: candidate.suggested_entry,
                account: accountId,
            });
            onClose();
        } catch {
            setError('Trade failed. Please try again.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>Place paper buy — {candidate.symbol}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2 text-sm">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                        <span>Entry</span>
                        <span className="text-foreground font-medium">{fixed(candidate.suggested_entry, 2)}</span>
                        <span>Stop</span>
                        <span className="text-foreground">{fixed(candidate.suggested_stop, 2)}</span>
                        <span>Target</span>
                        <span className="text-foreground">{fixed(candidate.suggested_target, 2)}</span>
                        <span>Qty</span>
                        <span className="text-foreground">{candidate.suggested_qty ?? '—'}</span>
                    </div>
                    {!canTrade && (
                        <p className="text-muted-foreground text-xs">
                            Quantity not available — select a paper account on the page to size this trade.
                        </p>
                    )}
                    {error && <p className="text-destructive text-xs">{error}</p>}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
                    <Button onClick={handleConfirm} disabled={busy || !canTrade}>
                        {busy ? 'Placing…' : 'Confirm buy'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
