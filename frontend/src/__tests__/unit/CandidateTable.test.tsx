import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CandidateTable } from '@/components/accumulation/CandidateTable';
import type { AccumulationCandidate } from '@/types/accumulation-trading';

const base: AccumulationCandidate = {
    id: 1, symbol: 'NABIL', scan_date: '2026-06-26', score: '82.00',
    factors: { concentration: 0.9, coiling: 0.7, breakout: 1, score: 82 },
    suggested_entry: '520.00', suggested_stop: '500.00', suggested_target: '560.00',
    validation_state: 'validated', status: 'ACTIVE', suggested_qty: 100,
};

describe('CandidateTable', () => {
    it('enables the trade button for validated candidates', () => {
        render(<CandidateTable candidates={[base]} onPlaceTrade={vi.fn()} />);
        expect(screen.getByRole('button', { name: /place paper trade/i })).toBeEnabled();
    });

    it('disables the trade button for research-only candidates', () => {
        render(<CandidateTable candidates={[{ ...base, validation_state: 'research' }]}
                               onPlaceTrade={vi.fn()} />);
        expect(screen.getByRole('button', { name: /place paper trade/i })).toBeDisabled();
    });
});
