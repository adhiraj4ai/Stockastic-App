'use client';

import React, { useState } from 'react';
import type { AxiosError } from 'axios';
import api from '@/lib/api';

interface ProposalLine {
    ticker?: string;
    action?: string;
    quantity?: number;
    rate?: number;
    net?: number;
    fees?: { commission: number; sebon_fee: number; dp_charge: number; cgt: number };
    label?: string;
}

interface ProposalPreview {
    title: string;
    lines: ProposalLine[];
    warnings?: string[];
}

interface ProposalCardProps {
    draft_id: number;
    kind: string;
    title: string;
    status: string;
    preview: ProposalPreview;
}

const KIND_LABEL: Record<string, string> = {
    TRADE: 'Trade', EXITS: 'Stops & Targets', REBALANCE: 'Rebalance', TRADE_PLAN: 'Trade Plan',
};

const ProposalCard: React.FC<ProposalCardProps> = ({ draft_id, kind, title, status: initialStatus, preview }) => {
    const [status, setStatus] = useState(initialStatus ?? 'PENDING');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const act = async (verb: 'confirm' | 'cancel') => {
        setBusy(true);
        setError(null);
        try {
            const res = await api.post(`/api/stocks/portfolio-action-drafts/${draft_id}/${verb}/`);
            setStatus(res.data.status);
            if (res.data.result?.message) setMessage(res.data.result.message);
        } catch (e) {
            const err = e as AxiosError<{ error?: string }>;
            setError(err?.response?.data?.error || 'Action failed.');
        } finally {
            setBusy(false);
        }
    };

    const terminal = status === 'CONFIRMED' || status === 'CANCELLED' || status === 'EXPIRED';

    const lines = preview.lines || [];
    const totalFees = lines.reduce(
        (sum, l) => (l.fees ? sum + l.fees.commission + l.fees.sebon_fee + l.fees.dp_charge : sum),
        0,
    );
    const totalCgt = lines.reduce((sum, l) => sum + (l.fees?.cgt ?? 0), 0);
    const hasFees = lines.some((l) => l.fees);

    return (
        <div className="rounded-lg border border-border bg-card p-4 text-sm">
            <div className="flex items-center justify-between mb-2">
                <span className="font-medium">{title}</span>
                <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                    {KIND_LABEL[kind] || kind}
                </span>
            </div>

            <div className="space-y-1">
                {lines.map((l, i) => (
                    <div key={i} className="flex justify-between text-xs">
                        <span>
                            {l.label ?? `${l.action ?? ''} ${l.quantity ?? ''} ${l.ticker ?? ''}`.trim()}
                            {l.rate != null && ` @ Rs ${l.rate.toLocaleString()}`}
                        </span>
                        {l.net != null && <span className="tabular-nums">Net Rs {Math.round(l.net).toLocaleString()}</span>}
                    </div>
                ))}
            </div>

            {hasFees && (
                <div className="mt-2 text-[11px] text-muted-foreground">
                    Fees Rs {Math.round(totalFees).toLocaleString()} · CGT Rs {Math.round(totalCgt).toLocaleString()}
                </div>
            )}

            {preview.warnings?.length ? (
                <div className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">⚠️ {preview.warnings.join('; ')}</div>
            ) : null}

            {error && <div className="mt-2 text-[11px] text-red-600 dark:text-rose-400">{error}</div>}

            <div className="mt-3 flex gap-2">
                {!terminal ? (
                    <>
                        <button
                            disabled={busy}
                            onClick={() => act('confirm')}
                            className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50"
                        >
                            {busy ? 'Working…' : 'Confirm'}
                        </button>
                        <button
                            disabled={busy}
                            onClick={() => act('cancel')}
                            className="px-3 py-1.5 rounded-md border border-border text-xs disabled:opacity-50"
                        >
                            Cancel
                        </button>
                    </>
                ) : (
                    <span className={`text-xs font-medium ${status === 'CONFIRMED' ? 'text-green-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                        {status === 'CONFIRMED' ? `✓ ${message || 'Confirmed'}` : status === 'CANCELLED' ? 'Cancelled' : 'Expired'}
                    </span>
                )}
            </div>
        </div>
    );
};

export default ProposalCard;
