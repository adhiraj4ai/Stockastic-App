import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import TickerSignals from '@/components/ticker/TickerSignals';
import { TooltipProvider } from '@/components/ui/tooltip';

vi.mock('@/lib/api', () => ({
    default: { get: vi.fn().mockResolvedValue({ data: [] }) },
}));

describe('TickerSignals fundamental metrics', () => {
    // DRF serializes DecimalField as strings ("19.81"), not numbers
    it('renders P/E and dividend yield from decimal strings without crashing', async () => {
        render(
            <TooltipProvider>
                <TickerSignals
                    symbol="NABIL"
                    currentPrice={500}
                    fundamental={{ pe_ratio: '19.81', dividend_yield: '3.50' }}
                />
            </TooltipProvider>
        );
        expect(await screen.findByText('19.81')).toBeInTheDocument();
        expect(screen.getByText('3.50%')).toBeInTheDocument();
    });

    it('shows N/A when ratios are missing', async () => {
        render(
            <TooltipProvider>
                <TickerSignals
                    symbol="NABIL"
                    currentPrice={500}
                    fundamental={{ pe_ratio: null, dividend_yield: null }}
                />
            </TooltipProvider>
        );
        expect((await screen.findAllByText('N/A')).length).toBeGreaterThan(0);
    });
});
