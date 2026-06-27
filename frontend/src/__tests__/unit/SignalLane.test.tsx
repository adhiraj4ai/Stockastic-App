import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SignalLane } from '@/components/signals/SignalLane';

describe('SignalLane', () => {
    it('shows the count and an empty state', () => {
        render(<SignalLane title="Accumulation" cards={[]} consensus={{}} glossary={null} onOpen={vi.fn()} />);
        expect(screen.getByText('Accumulation')).toBeInTheDocument();
        expect(screen.getByText('0')).toBeInTheDocument();
        expect(screen.getByText(/no .* signals/i)).toBeInTheDocument();
    });
});
