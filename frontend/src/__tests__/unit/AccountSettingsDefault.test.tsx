import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import api from '@/lib/api';
import { AccountSettingsDialog } from '@/components/AccountSettingsDialog';

vi.mock('@/lib/api', () => ({ default: { patch: vi.fn(), post: vi.fn().mockResolvedValue({ data: {} }), delete: vi.fn() } }));

const baseAccount = { id: 7, name: 'Main', account_type: 'LIVE', balance: 1000, default_risk_percentage: 2, is_default: false } as never;

describe('AccountSettingsDialog default control', () => {
    afterEach(() => vi.clearAllMocks());

    it('sets the account as default and refreshes', async () => {
        const onUpdate = vi.fn();
        render(<AccountSettingsDialog isOpen onOpenChange={vi.fn()} account={baseAccount} onUpdate={onUpdate} onDelete={vi.fn()} portfolioValue={0} />);
        fireEvent.click(screen.getByRole('button', { name: /set as default/i }));
        await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/stocks/accounts/7/set_default/'));
        await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    });

    it('shows a default indicator when the account is already default', () => {
        render(<AccountSettingsDialog isOpen onOpenChange={vi.fn()} account={{ ...baseAccount, is_default: true }} onUpdate={vi.fn()} onDelete={vi.fn()} portfolioValue={0} />);
        expect(screen.getByText(/default account/i)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /set as default/i })).not.toBeInTheDocument();
    });
});
