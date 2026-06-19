import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TransactionsTab } from '@/components/exit/TransactionsTab';

const tx = {
    id: 9, transaction_date: '2026-06-10T00:00:00Z', transaction_type: 'BUY', reason: 'BETTER_OPPORTUNITY',
    quantity: 100, rate: '520.00', amount: '52000.00', commission: '1500.00', sebon_fee: '10.00',
    dp_charge: '25.00', cgt: '0.00', receivable_amount: '51765.00',
};

describe('TransactionsTab', () => {
    it('shows an empty state when there are no transactions', () => {
        render(<TransactionsTab transactions={[]} onEdit={vi.fn()} onDelete={vi.fn()} />);
        expect(screen.getByText(/no transactions/i)).toBeInTheDocument();
    });

    it('formats money columns through formatNepaliNumber and fires edit/delete', () => {
        const onEdit = vi.fn(); const onDelete = vi.fn();
        render(<TransactionsTab transactions={[tx]} onEdit={onEdit} onDelete={onDelete} />);
        expect(screen.getByText(/BETTER_OPPORTUNITY|Better opportunity/i)).toBeInTheDocument();

        // commission 1500.00 → formatNepaliNumber produces '1,500.00' (differs from raw)
        expect(screen.getByText('1,500.00')).toBeInTheDocument();
        expect(screen.queryByText('1500.00')).not.toBeInTheDocument();

        // amount 52000.00 → '52,000.00'
        expect(screen.getByText('52,000.00')).toBeInTheDocument();

        // receivable_amount 51765.00 → '51,765.00'
        expect(screen.getByText('51,765.00')).toBeInTheDocument();

        fireEvent.click(screen.getByTitle(/edit/i));
        expect(onEdit).toHaveBeenCalled();
        fireEvent.click(screen.getByTitle(/delete/i));
        expect(onDelete).toHaveBeenCalledWith(9);
    });
});
