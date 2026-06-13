import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { formatPercent } from '@/lib/formatters';
import { formatMetricValue } from '@/lib/metricFormat';
import { BentoMetrics } from '@/components/ticker/BentoMetrics';
import { TooltipProvider } from '@/components/ui/tooltip';

describe('formatPercent', () => {
    // DRF serializes DecimalField as strings ("16.66"), not numbers
    it('formats decimal strings with a % suffix', () => {
        expect(formatPercent('16.66')).toBe('16.66%');
        expect(formatPercent(2.5)).toBe('2.50%');
    });

    it('returns empty string for missing values', () => {
        expect(formatPercent(null)).toBe('');
        expect(formatPercent(undefined)).toBe('');
        expect(formatPercent('')).toBe('');
    });
});

describe('formatMetricValue', () => {
    it('formats percent metrics with % and ratio metrics as plain numbers', () => {
        expect(formatMetricValue('ro_equity', '16.66')).toBe('16.66%');
        expect(formatMetricValue('dividend_yield', '2.50')).toBe('2.50%');
        expect(formatMetricValue('pe_ratio', '19.81')).toBe('19.81');
        expect(formatMetricValue('price_to_book', '1.33')).toBe('1.33');
    });

    it('formats currency metrics in rupees and market cap in crores', () => {
        expect(formatMetricValue('eps', '45.5')).toBe('रू 45.50');
        expect(formatMetricValue('book_value', '240')).toBe('रू 240.00');
        expect(formatMetricValue('market_cap', '135257928827.83')).toBe('रू 13,525.79 Cr');
    });

    it('returns a dash for missing values', () => {
        expect(formatMetricValue('pe_ratio', null)).toBe('-');
        expect(formatMetricValue('eps', undefined)).toBe('-');
    });

    it('formats extended metrics by type', () => {
        expect(formatMetricValue('earning_yield', '9.56')).toBe('9.56%');
        expect(formatMetricValue('operating_margin', '19.24')).toBe('19.24%');
        expect(formatMetricValue('net_margin_quarterly', '16.90')).toBe('16.90%');
        expect(formatMetricValue('asset_turnover', '5.46')).toBe('5.46%');
        expect(formatMetricValue('pe_ratio_5yr', '12.05')).toBe('12.05');
        expect(formatMetricValue('beta_1y', '1.21')).toBe('1.21');
    });

    it('passes trend strings through unchanged', () => {
        expect(formatMetricValue('eps_trend', 'Positive')).toBe('Positive');
        expect(formatMetricValue('roe_trend', 'Negative')).toBe('Negative');
        expect(formatMetricValue('eps_trend', null)).toBe('-');
    });
});

describe('BentoMetrics', () => {
    it('renders ROE from fundamental data, not a hardcoded value', () => {
        render(
            <TooltipProvider>
                <BentoMetrics fundamental={{ ro_equity: '16.66' }} />
            </TooltipProvider>
        );
        expect(screen.getByText('16.66%')).toBeInTheDocument();
        expect(screen.queryByText('18.4%')).not.toBeInTheDocument();
    });

    it('shows N/A for ROE and dividend yield when data is missing', () => {
        render(
            <TooltipProvider>
                <BentoMetrics fundamental={{ ro_equity: null, dividend_yield: null }} />
            </TooltipProvider>
        );
        // ROE, dividend yield (and other empty tiles) fall back to N/A, never "0%"
        expect(screen.getAllByText('N/A').length).toBeGreaterThanOrEqual(2);
        expect(screen.queryByText('0%')).not.toBeInTheDocument();
    });

    it('renders dividend yield as a percent when present', () => {
        render(
            <TooltipProvider>
                <BentoMetrics fundamental={{ dividend_yield: '2.50' }} />
            </TooltipProvider>
        );
        expect(screen.getByText('2.50%')).toBeInTheDocument();
    });
});
