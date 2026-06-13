import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SavedHintChip } from '@/components/chat/SavedHintChip';
import { savedApi } from '@/lib/api';

// savedApi.suggest resolves to an AxiosResponse — the component reads res.data,
// so the mock MUST resolve to { data: [...] }, not a bare array.
vi.mock('@/lib/api', () => ({
    savedApi: { suggest: vi.fn() },
}));

describe('SavedHintChip', () => {
    afterEach(() => vi.clearAllMocks());

    it('shows a hint when a saved analysis matches the typed text', async () => {
        (savedApi.suggest as ReturnType<typeof vi.fn>).mockResolvedValue({
            data: [
                {
                    id: '1',
                    title: 'GBIME Q2 Fundamentals',
                    one_liner: 'strong',
                    tickers: ['GBIME'],
                    series_key: '',
                    category: '',
                    tags: [],
                    verdict: '',
                    session: null,
                    created_at: '',
                },
            ],
        });
        render(<SavedHintChip text="how are GBIME fundamentals this quarter" onAttach={() => {}} />);
        await waitFor(() =>
            expect(screen.getByText(/GBIME Q2 Fundamentals/)).toBeInTheDocument(),
        );
    });

    it('renders nothing for short text', () => {
        const { container } = render(<SavedHintChip text="hi" onAttach={() => {}} />);
        expect(container).toBeEmptyDOMElement();
        expect(savedApi.suggest).not.toHaveBeenCalled();
    });
});
