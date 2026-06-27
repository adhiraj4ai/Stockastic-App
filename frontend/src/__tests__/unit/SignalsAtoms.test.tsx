import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { GlossaryTooltip } from '@/components/signals/GlossaryTooltip';
import { ConvictionMeter } from '@/components/signals/ConvictionMeter';

describe('signals atoms', () => {
    it('GlossaryTooltip shows the trigger text and carries the description', () => {
        render(<GlossaryTooltip entry={{ label: 'Smart money', description: 'Top brokers near cost.' }} fallback="smart money" />);
        expect(screen.getByText('smart money')).toBeInTheDocument();
        expect(screen.getByText('smart money')).toHaveAttribute('aria-label', expect.stringContaining('Top brokers'));
    });
    it('GlossaryTooltip renders plain text when no entry', () => {
        render(<GlossaryTooltip entry={undefined} fallback="mystery" />);
        expect(screen.getByText('mystery')).toBeInTheDocument();
    });
    it('ConvictionMeter shows the rounded value', () => {
        render(<ConvictionMeter value={82.4} />);
        expect(screen.getByText('82')).toBeInTheDocument();
    });
});
