import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SectionCard, KpiCard, SentimentBadge, KpiSkeleton, CardSkeleton } from '@/components/portfolio/ui';
import { Wallet } from 'lucide-react';

describe('portfolio ui primitives', () => {
    it('SectionCard renders title, badges, actions and children', () => {
        render(
            <SectionCard
                accent="emerald"
                icon={Wallet}
                title="Strategic Holdings"
                badges={<span>14 positions</span>}
                actions={<button>Add</button>}
            >
                <p>body content</p>
            </SectionCard>,
        );
        expect(screen.getByText('Strategic Holdings')).toBeInTheDocument();
        expect(screen.getByText('14 positions')).toBeInTheDocument();
        expect(screen.getByText('Add')).toBeInTheDocument();
        expect(screen.getByText('body content')).toBeInTheDocument();
    });

    it('KpiCard renders label, value and sub', () => {
        render(
            <KpiCard
                accent="blue"
                icon={Wallet}
                label="Capital Deployed"
                value="रू 21,40,000"
                sub={<SentimentBadge tone="neutral">3 accounts</SentimentBadge>}
            />,
        );
        expect(screen.getByText('Capital Deployed')).toBeInTheDocument();
        expect(screen.getByText('रू 21,40,000')).toBeInTheDocument();
        expect(screen.getByText('3 accounts')).toBeInTheDocument();
    });

    it('SentimentBadge applies tone classes', () => {
        render(<SentimentBadge tone="up">+12.4%</SentimentBadge>);
        const badge = screen.getByText('+12.4%');
        expect(badge.className).toContain('emerald');
        expect(badge.className).toContain('rounded-full');
    });

    it('skeletons render pulse placeholders', () => {
        const { container } = render(
            <>
                <KpiSkeleton />
                <CardSkeleton rows={3} />
            </>,
        );
        expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThanOrEqual(2);
    });
});
