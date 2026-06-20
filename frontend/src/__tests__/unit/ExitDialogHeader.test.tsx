import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ExitDialogHeader } from '@/components/exit/ExitDialogHeader';

// DRF serialises DecimalField as a STRING. The header must not call .toFixed on it.
const item = {
    id: 1, account: 1, ticker: 'NABIL', quantity: 100,
    gain_loss: '14000.00', gain_loss_percent: '12.40',
    signals: { latest_date: '2026-06-18', summary: 'BUY' as const, details: [] },
} as never;

describe('ExitDialogHeader', () => {
    it('renders P/L when gain_loss_percent arrives as a decimal string', () => {
        render(
            <Dialog open onOpenChange={vi.fn()}>
                <DialogContent>
                    <ExitDialogHeader item={item} currentPrice={548} wacc={520} isUnderwater={false} onClose={vi.fn()} />
                </DialogContent>
            </Dialog>,
        );
        expect(screen.getByText('Exit strategy · NABIL')).toBeInTheDocument();
        expect(screen.getByText('P/L 12.40%')).toBeInTheDocument();
    });
});
