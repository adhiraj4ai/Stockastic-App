import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import api from '@/lib/api';
import { ClassificationToggle } from '@/components/ClassificationToggle';

vi.mock('@/lib/api', () => ({
    default: { patch: vi.fn().mockResolvedValue({ data: {} }) },
}));

describe('ClassificationToggle', () => {
    afterEach(() => vi.clearAllMocks());

    it('shows the investment symbol with an investment label', () => {
        render(<ClassificationToggle itemId={1} classification="investment" />);
        expect(screen.getByRole('button', { name: /investment/i })).toBeInTheDocument();
    });

    it('flips trading -> investment and PATCHes update_classification', async () => {
        const onChange = vi.fn();
        render(<ClassificationToggle itemId={7} classification="trading" onChange={onChange} />);
        fireEvent.click(screen.getByRole('button'));
        await waitFor(() =>
            expect(api.patch).toHaveBeenCalledWith(
                '/api/stocks/portfolio/7/update_classification/',
                { classification: 'investment' },
            ),
        );
        expect(onChange).toHaveBeenCalledWith(7, 'investment');
    });
});
