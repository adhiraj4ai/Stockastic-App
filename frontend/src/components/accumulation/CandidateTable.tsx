'use client';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow }
    from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { fixed } from '@/lib/numbers';
import type { AccumulationCandidate } from '@/types/accumulation-trading';

const VALIDATED_STATE = 'validated';
const UNVALIDATED_TOOLTIP = 'Strategy not validated against buy-and-hold';

interface Props {
    candidates: AccumulationCandidate[];
    onPlaceTrade: (candidate: AccumulationCandidate) => void;
}

function CandidateRow({ candidate, onPlaceTrade }: {
    candidate: AccumulationCandidate;
    onPlaceTrade: (c: AccumulationCandidate) => void;
}) {
    const isValidated = candidate.validation_state === VALIDATED_STATE;
    return (
        <TableRow>
            <TableCell className="font-semibold">{candidate.symbol}</TableCell>
            <TableCell>{fixed(candidate.score, 1)}</TableCell>
            <TableCell>{fixed(candidate.suggested_entry, 2)}</TableCell>
            <TableCell>{fixed(candidate.suggested_stop, 2)}</TableCell>
            <TableCell>{fixed(candidate.suggested_target, 2)}</TableCell>
            <TableCell>{candidate.suggested_qty ?? '—'}</TableCell>
            <TableCell>
                <Button
                    onClick={() => onPlaceTrade(candidate)}
                    disabled={!isValidated}
                    title={isValidated ? undefined : UNVALIDATED_TOOLTIP}
                >
                    Place paper trade
                </Button>
            </TableCell>
        </TableRow>
    );
}

export function CandidateTable({ candidates, onPlaceTrade }: Props) {
    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Entry</TableHead>
                    <TableHead>Stop</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead />
                </TableRow>
            </TableHeader>
            <TableBody>
                {candidates.map((c) => (
                    <CandidateRow key={c.id} candidate={c} onPlaceTrade={onPlaceTrade} />
                ))}
            </TableBody>
        </Table>
    );
}
