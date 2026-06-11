import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { BrokerTableCard } from '@/components/chat/gen-ui/BrokerTableCard';

const data = {
    title: 'Broker 58 Favorites (3M)',
    columns: [
        { key: 'symbol', label: 'Symbol' },
        { key: 'current_net', label: 'Net Qty', align: 'right' as const, format: 'number' as const },
        { key: 'wac', label: 'WAC', align: 'right' as const, format: 'decimal' as const },
        { key: 'roc', label: 'ROC %', align: 'right' as const, format: 'percent' as const },
    ],
    rows: [
        { symbol: 'NABIL', current_net: 120000, wac: 498.25, roc: -4.3 },
        { symbol: 'SHLB', current_net: 80000, wac: 312, roc: 12.1 },
    ],
    meta: {},
};

describe('BrokerTableCard', () => {
    it('renders title, headers, and formatted rows', () => {
        render(<BrokerTableCard data={data} />);
        expect(screen.getByText('Broker 58 Favorites (3M)')).toBeInTheDocument();
        expect(screen.getByText('Net Qty')).toBeInTheDocument();
        expect(screen.getByText('NABIL')).toBeInTheDocument();
        expect(screen.getByText('-4.30%')).toBeInTheDocument();
        // formatNepaliNumber(120000) → "1,20,000"
        expect(screen.getByText('1,20,000')).toBeInTheDocument();
    });

    it('renders a friendly empty state when rows are empty', () => {
        render(<BrokerTableCard data={{ ...data, rows: [] }} />);
        expect(screen.getByText(/no data/i)).toBeInTheDocument();
    });

    it('renders a dash for missing optional values', () => {
        render(<BrokerTableCard data={{ ...data, rows: [{ symbol: 'NEWCO' }] }} />);
        expect(screen.getByText('NEWCO')).toBeInTheDocument();
        expect(screen.getAllByText('–').length).toBeGreaterThanOrEqual(3);
    });
});
