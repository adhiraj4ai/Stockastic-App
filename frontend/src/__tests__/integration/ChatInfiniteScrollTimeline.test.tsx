/**
 * Tests for:
 *  1. Render windowing — chat renders at most RENDER_WINDOW (20) messages at a
 *     time and loads more when the user scrolls to the top.
 *  2. ChatTimeline — always shows the last TIMELINE_WINDOW (10) user messages
 *     as a sliding dock-style strip.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/lib/api', () => ({
    default: { get: vi.fn(), post: vi.fn() },
    savedApi: {
        list: vi.fn().mockResolvedValue({ data: [] }),
    },
    API_BASE_URL: 'http://localhost:8000',
}));
vi.mock('@/lib/chat-sse', () => ({
    openChatStream: vi.fn(),
}));

import { ChatInterface } from '@/components/chat/ChatInterface';
import api from '@/lib/api';
import { openChatStream } from '@/lib/chat-sse';
import type { ChatMessage } from '@/components/chat/types';

const mockApi = vi.mocked(api);
const mockStream = vi.mocked(openChatStream);

// Must match constants in ChatInterface.tsx
const RENDER_WINDOW = 20;
const TIMELINE_WINDOW = 10;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build `count` alternating user/assistant messages.
 * Even indices (0, 2, 4, …) → user  "Msg-{i}"
 * Odd  indices (1, 3, 5, …) → assistant "Msg-{i}"
 */
function buildHistory(count: number): ChatMessage[] {
    return Array.from({ length: count }, (_, i) => {
        const role = i % 2 === 0 ? 'user' : 'assistant';
        return {
            id: `msg-${i}`,
            role: role as 'user' | 'assistant',
            text: `Msg-${i}`,
            blocks:
                role === 'assistant'
                    ? [{ kind: 'text' as const, text: `Msg-${i}`, subagent: null }]
                    : [],
            created_at: new Date().toISOString(),
        };
    });
}

async function* fakeStream(frames: Array<{ event: string; data: unknown }>) {
    for (const f of frames) yield f;
}

// ---------------------------------------------------------------------------
// Render windowing
// ---------------------------------------------------------------------------

describe('ChatInterface — Render Windowing', () => {
    afterEach(() => vi.clearAllMocks());

    it('renders all messages when history fits within the render window', async () => {
        mockApi.get.mockResolvedValue({ data: buildHistory(RENDER_WINDOW) });

        render(<ChatInterface sessionId="sess-1" />);

        await waitFor(() => expect(screen.getByText('Msg-0')).toBeInTheDocument());
        expect(screen.getByText(`Msg-${RENDER_WINDOW - 1}`)).toBeInTheDocument();
        expect(screen.queryByText(/older messages/i)).not.toBeInTheDocument();
    });

    it('renders only the last RENDER_WINDOW messages when history is larger', async () => {
        // 22 messages → visibleFrom = 2; Msg-0 and Msg-1 hidden
        mockApi.get.mockResolvedValue({ data: buildHistory(RENDER_WINDOW + 2) });

        render(<ChatInterface sessionId="sess-1" />);

        // Latest message is visible
        await waitFor(() =>
            expect(screen.getByText(`Msg-${RENDER_WINDOW + 1}`)).toBeInTheDocument(),
        );
        // First two messages are outside the window
        expect(screen.queryByText('Msg-0')).not.toBeInTheDocument();
        expect(screen.queryByText('Msg-1')).not.toBeInTheDocument();
    });

    it('shows the "older messages" divider when some messages are hidden', async () => {
        mockApi.get.mockResolvedValue({ data: buildHistory(RENDER_WINDOW + 4) });

        render(<ChatInterface sessionId="sess-1" />);

        await waitFor(() =>
            expect(screen.getByText(/older messages/i)).toBeInTheDocument(),
        );
    });

    it('does not show the divider when all messages fit in the window', async () => {
        mockApi.get.mockResolvedValue({ data: buildHistory(RENDER_WINDOW) });

        render(<ChatInterface sessionId="sess-1" />);

        await waitFor(() => expect(screen.getByText('Msg-0')).toBeInTheDocument());
        expect(screen.queryByText(/older messages/i)).not.toBeInTheDocument();
    });

    it('divider text shows the exact hidden message count', async () => {
        // 24 messages → visibleFrom = 4 → "4 older messages"
        mockApi.get.mockResolvedValue({ data: buildHistory(RENDER_WINDOW + 4) });

        render(<ChatInterface sessionId="sess-1" />);

        await waitFor(() =>
            expect(screen.getByText(/4 older messages/i)).toBeInTheDocument(),
        );
    });

    it('loads older messages when scrolled to near the top', async () => {
        // 24 messages → first 4 hidden; one scroll event reveals all
        mockApi.get.mockResolvedValue({ data: buildHistory(RENDER_WINDOW + 4) });

        render(<ChatInterface sessionId="sess-1" />);
        await waitFor(() =>
            expect(screen.getByText(`Msg-${RENDER_WINDOW + 3}`)).toBeInTheDocument(),
        );
        expect(screen.queryByText('Msg-0')).not.toBeInTheDocument();

        // scrollTop is 0 in jsdom (<80 threshold), firing scroll triggers load
        const scroller = screen.getByTestId('chat-scroller');
        act(() => {
            fireEvent.scroll(scroller);
        });

        await waitFor(() => expect(screen.getByText('Msg-0')).toBeInTheDocument());
    });

    it('can load all messages in two scroll events when hidden count > PAGE_SIZE', async () => {
        // 42 messages → visibleFrom = 22; first scroll loads 20 more → visibleFrom = 2
        mockApi.get.mockResolvedValue({ data: buildHistory(RENDER_WINDOW + 22) });

        render(<ChatInterface sessionId="sess-1" />);
        await waitFor(() =>
            expect(screen.getByText(`Msg-${RENDER_WINDOW + 21}`)).toBeInTheDocument(),
        );
        expect(screen.queryByText('Msg-0')).not.toBeInTheDocument();

        const scroller = screen.getByTestId('chat-scroller');

        // First scroll: loads PAGE_SIZE more
        act(() => { fireEvent.scroll(scroller); });
        await waitFor(() =>
            expect(screen.getByText('Msg-2')).toBeInTheDocument(),
        );
        // Msg-0 and Msg-1 still hidden (visibleFrom = 2 now)
        expect(screen.queryByText('Msg-0')).not.toBeInTheDocument();

        // Second scroll: loads the last 2
        act(() => { fireEvent.scroll(scroller); });
        await waitFor(() => expect(screen.getByText('Msg-0')).toBeInTheDocument());
    });

    it('new question is always visible immediately after sending', async () => {
        mockApi.get.mockResolvedValue({ data: buildHistory(RENDER_WINDOW + 2) });
        mockStream.mockReturnValue(
            fakeStream([
                { event: 'text', data: { text: 'Answer here', subagent: null } },
                { event: 'done', data: {} },
            ]),
        );

        render(<ChatInterface sessionId="sess-1" />);
        await waitFor(() =>
            expect(screen.getByText(`Msg-${RENDER_WINDOW + 1}`)).toBeInTheDocument(),
        );

        const input = screen.getByPlaceholderText(/ask/i);
        await userEvent.type(input, 'My new question');
        await userEvent.keyboard('{Enter}');

        await waitFor(() =>
            expect(screen.getByText('My new question')).toBeInTheDocument(),
        );
    });

    it('resets render window when the session changes', async () => {
        mockApi.get.mockResolvedValue({ data: buildHistory(RENDER_WINDOW + 2) });

        const { rerender } = render(<ChatInterface sessionId="sess-1" />);
        await waitFor(() =>
            expect(screen.getByText(`Msg-${RENDER_WINDOW + 1}`)).toBeInTheDocument(),
        );
        expect(screen.queryByText('Msg-0')).not.toBeInTheDocument();

        // New session with a small history — everything should be visible
        mockApi.get.mockResolvedValue({ data: buildHistory(4) });
        rerender(<ChatInterface sessionId="sess-2" />);

        await waitFor(() => expect(screen.getByText('Msg-0')).toBeInTheDocument());
        expect(screen.queryByText(/older messages/i)).not.toBeInTheDocument();
    });
});

// ---------------------------------------------------------------------------
// ChatTimeline
// ---------------------------------------------------------------------------

describe('ChatTimeline', () => {
    afterEach(() => vi.clearAllMocks());

    it('is not rendered when there are no messages', async () => {
        mockApi.get.mockResolvedValue({ data: [] });

        render(<ChatInterface sessionId="sess-1" />);
        await waitFor(() => expect(mockApi.get).toHaveBeenCalled());

        expect(screen.queryByTestId('chat-timeline')).not.toBeInTheDocument();
    });

    it('shows one bar per user message when count is below TIMELINE_WINDOW', async () => {
        // 12 messages = 6 user + 6 assistant → 6 bars
        mockApi.get.mockResolvedValue({ data: buildHistory(12) });

        render(<ChatInterface sessionId="sess-1" />);
        await waitFor(() =>
            expect(screen.getByTestId('chat-timeline')).toBeInTheDocument(),
        );

        expect(screen.getAllByTestId('timeline-bar-row')).toHaveLength(6);
    });

    it('caps at TIMELINE_WINDOW bars when there are more user messages', async () => {
        // 30 messages = 15 user messages → only 10 bars shown
        mockApi.get.mockResolvedValue({ data: buildHistory(30) });

        render(<ChatInterface sessionId="sess-1" />);
        await waitFor(() =>
            expect(screen.getByTestId('chat-timeline')).toBeInTheDocument(),
        );

        expect(screen.getAllByTestId('timeline-bar-row')).toHaveLength(TIMELINE_WINDOW);
    });

    it('always shows the last TIMELINE_WINDOW messages, not the first', async () => {
        // 30 messages = 15 user messages; last bar = Msg-28 (last user msg)
        const history = buildHistory(30);
        mockApi.get.mockResolvedValue({ data: history });

        render(<ChatInterface sessionId="sess-1" />);
        await waitFor(() =>
            expect(screen.getByTestId('chat-timeline')).toBeInTheDocument(),
        );

        const rows = screen.getAllByTestId('timeline-bar-row');

        // Hover last bar — its tooltip preview should be the last user message text.
        // Scope to the timeline to avoid matching the same text in the chat body.
        fireEvent.mouseEnter(rows[rows.length - 1]);
        const timeline = screen.getByTestId('chat-timeline');
        await waitFor(() =>
            expect(within(timeline).getByText('Msg-28')).toBeInTheDocument(),
        );
    });

    it('tooltip shows absolute question number (not relative index)', async () => {
        // 30 messages = 15 user messages; start = 5; first visible bar = Q6
        mockApi.get.mockResolvedValue({ data: buildHistory(30) });

        render(<ChatInterface sessionId="sess-1" />);
        await waitFor(() =>
            expect(screen.getByTestId('chat-timeline')).toBeInTheDocument(),
        );

        const rows = screen.getAllByTestId('timeline-bar-row');
        fireEvent.mouseEnter(rows[0]);

        await waitFor(() => expect(screen.getByText('Q6')).toBeInTheDocument());
    });

    it('tooltip on last bar shows the highest question number', async () => {
        // 15 user messages → last bar = Q15
        mockApi.get.mockResolvedValue({ data: buildHistory(30) });

        render(<ChatInterface sessionId="sess-1" />);
        await waitFor(() =>
            expect(screen.getByTestId('chat-timeline')).toBeInTheDocument(),
        );

        const rows = screen.getAllByTestId('timeline-bar-row');
        fireEvent.mouseEnter(rows[rows.length - 1]);

        await waitFor(() => expect(screen.getByText('Q15')).toBeInTheDocument());
    });

    it('clicking a bar scrolls the corresponding message into view', async () => {
        const scrollIntoViewSpy = vi.spyOn(HTMLElement.prototype, 'scrollIntoView');

        mockApi.get.mockResolvedValue({ data: buildHistory(4) }); // 2 user messages

        render(<ChatInterface sessionId="sess-1" />);
        await waitFor(() =>
            expect(screen.getByTestId('chat-timeline')).toBeInTheDocument(),
        );

        const rows = screen.getAllByTestId('timeline-bar-row');
        const bar = within(rows[0]).getByRole('button');
        fireEvent.click(bar);

        expect(scrollIntoViewSpy).toHaveBeenCalled();
        scrollIntoViewSpy.mockRestore();
    });

    it('grows as new questions are sent', async () => {
        mockApi.get.mockResolvedValue({ data: [] });
        mockStream.mockReturnValue(
            fakeStream([
                { event: 'text', data: { text: 'Answer', subagent: null } },
                { event: 'done', data: {} },
            ]),
        );

        render(<ChatInterface sessionId="sess-1" />);
        await waitFor(() => expect(mockApi.get).toHaveBeenCalled());
        expect(screen.queryByTestId('chat-timeline')).not.toBeInTheDocument();

        const input = screen.getByPlaceholderText(/ask/i);
        await userEvent.type(input, 'First question');
        await userEvent.keyboard('{Enter}');

        await waitFor(() =>
            expect(screen.getByTestId('chat-timeline')).toBeInTheDocument(),
        );
        expect(screen.getAllByTestId('timeline-bar-row')).toHaveLength(1);
    });

    it('stays at TIMELINE_WINDOW bars even after many questions are sent', async () => {
        // Start with 18 user messages (36 total) → 10 bars
        mockApi.get.mockResolvedValue({ data: buildHistory(36) });
        mockStream.mockReturnValue(
            fakeStream([
                { event: 'text', data: { text: 'New answer', subagent: null } },
                { event: 'done', data: {} },
            ]),
        );

        render(<ChatInterface sessionId="sess-1" />);
        await waitFor(() =>
            expect(screen.getAllByTestId('timeline-bar-row')).toHaveLength(TIMELINE_WINDOW),
        );

        // Send one more question — still 10 bars (window slides, doesn't grow)
        const input = screen.getByPlaceholderText(/ask/i);
        await userEvent.type(input, 'Extra question');
        await userEvent.keyboard('{Enter}');

        await waitFor(() => expect(screen.getByText('Extra question')).toBeInTheDocument());
        expect(screen.getAllByTestId('timeline-bar-row')).toHaveLength(TIMELINE_WINDOW);
    });
});
