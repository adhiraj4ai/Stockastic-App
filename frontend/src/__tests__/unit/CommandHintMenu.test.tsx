import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CommandHintMenu } from '@/components/chat/CommandHintMenu';
import type { CommandHint } from '@/lib/chat-commands';

const items: CommandHint[] = [
    { command: '/help', description: 'List commands' },
    { command: '/memory', description: 'List everything remembered about you' },
    { command: '/memory add', args: '<fact>', description: 'Remember a new fact' },
];

describe('CommandHintMenu', () => {
    it('renders all items', () => {
        render(
            <CommandHintMenu items={items} selectedIndex={0} onSelect={vi.fn()} />,
        );
        expect(screen.getByText('/help')).toBeInTheDocument();
        expect(screen.getByText('/memory')).toBeInTheDocument();
        expect(screen.getByText('/memory add')).toBeInTheDocument();
    });

    it('shows description text for each item', () => {
        render(
            <CommandHintMenu items={items} selectedIndex={0} onSelect={vi.fn()} />,
        );
        expect(screen.getByText('List commands')).toBeInTheDocument();
        expect(screen.getByText('List everything remembered about you')).toBeInTheDocument();
    });

    it('shows args placeholder when present', () => {
        render(
            <CommandHintMenu items={items} selectedIndex={0} onSelect={vi.fn()} />,
        );
        expect(screen.getByText('<fact>')).toBeInTheDocument();
    });

    it('highlights the row at selectedIndex with bg-accent class', () => {
        const { container } = render(
            <CommandHintMenu items={items} selectedIndex={1} onSelect={vi.fn()} />,
        );
        // The second row (index 1) should have bg-accent (not just bg-accent/50)
        const rows = container.querySelectorAll('[role="option"]');
        // Non-selected rows should NOT have bg-accent as a standalone class (may have bg-accent/50)
        expect(rows[0].className).not.toMatch(/\bbg-accent\b(?!\/)/)
        expect(rows[1].className).toMatch(/\bbg-accent\b(?!\/)/);
        expect(rows[2].className).not.toMatch(/\bbg-accent\b(?!\/)/);
    });

    it('calls onSelect with correct item when row is clicked', () => {
        const onSelect = vi.fn();
        render(
            <CommandHintMenu items={items} selectedIndex={0} onSelect={onSelect} />,
        );
        fireEvent.click(screen.getByText('/memory add').closest('[role="option"]')!);
        expect(onSelect).toHaveBeenCalledWith(items[2]);
    });

    it('has listbox role on container', () => {
        render(
            <CommandHintMenu items={items} selectedIndex={0} onSelect={vi.fn()} />,
        );
        expect(screen.getByRole('listbox')).toBeInTheDocument();
    });

    it('renders nothing when items is empty', () => {
        const { container } = render(
            <CommandHintMenu items={[]} selectedIndex={0} onSelect={vi.fn()} />,
        );
        expect(container.firstChild).toBeNull();
    });
});
