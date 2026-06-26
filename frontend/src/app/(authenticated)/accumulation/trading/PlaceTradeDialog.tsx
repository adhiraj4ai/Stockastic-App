'use client';

import { useEffect, useState } from 'react';
import type { AxiosInstance } from 'axios';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { fixed } from '@/lib/numbers';
import type { AccumulationCandidate } from '@/types/accumulation-trading';
import type { PortfolioAccount } from '@/components/TransactionModal';

const PAPER_TYPE = 'PAPER';

interface Props {
    candidate: AccumulationCandidate;
    api: AxiosInstance;
    onClose: () => void;
}

export function PlaceTradeDialog({ candidate, api, onClose }: Props) {
    const [accounts, setAccounts] = useState<PortfolioAccount[]>([]);
    const [accountId, setAccountId] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        api.get<PortfolioAccount[]>('/api/stocks/accounts/')
            .then((r) => {
                const paper = r.data.filter((a) => a.account_type === PAPER_TYPE);
                setAccounts(paper);
                if (paper.length > 0) setAccountId(String(paper[0].id));
            })
            .catch(() => setError('Could not load accounts.'));
    }, [api]);

    const handleConfirm = async () => {
        if (!accountId) return;
        setBusy(true);
        setError('');
        try {
            await api.post('/api/stocks/transactions/', {
                ticker: candidate.symbol,
                transaction_type: 'BUY',
                quantity: candidate.suggested_qty,
                rate: candidate.suggested_entry,
                account: Number(accountId),
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
                        <span>Entry</span><span className="text-foreground font-medium">{fixed(candidate.suggested_entry, 2)}</span>
                        <span>Stop</span><span className="text-foreground">{fixed(candidate.suggested_stop, 2)}</span>
                        <span>Target</span><span className="text-foreground">{fixed(candidate.suggested_target, 2)}</span>
                        <span>Qty</span><span className="text-foreground">{candidate.suggested_qty ?? '—'}</span>
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="account-select">Paper account</Label>
                        <Select value={accountId} onValueChange={setAccountId}>
                            <SelectTrigger id="account-select">
                                <SelectValue placeholder="Select account" />
                            </SelectTrigger>
                            <SelectContent>
                                {accounts.map((a) => (
                                    <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    {error && <p className="text-destructive text-xs">{error}</p>}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
                    <Button onClick={handleConfirm} disabled={busy || !accountId}>
                        {busy ? 'Placing…' : 'Confirm buy'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
