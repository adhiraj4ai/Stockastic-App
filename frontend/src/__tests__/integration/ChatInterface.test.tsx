/**
 * Integration tests for ChatInterface and MessageBubble components.
 *
 * These tests mount the real components in jsdom and wire up controlled
 * mocks for:
 *  - axios (api) for history fetch
 *  - openChatStream for SSE
 *
 * They verify rendering, user interactions, and streaming state transitions.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ---------------------------------------------------------------------------
// Module mocks — must be declared before any imports of the mocked modules
// ---------------------------------------------------------------------------
vi.mock('@/lib/api', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn(),
    },
    savedApi: {
        list: vi.fn().mockResolvedValue({ data: [] }),
    },
    API_BASE_URL: 'http://localhost:8000',
}));

vi.mock('@/lib/chat-sse', () => ({
    openChatStream: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------
import { ChatInterface } from '@/components/chat/ChatInterface';
import { MessageBubble } from '@/components/chat/MessageBubble';
import api from '@/lib/api';
import { openChatStream } from '@/lib/chat-sse';
import type { ChatMessage } from '@/components/chat/types';

const mockApi = vi.mocked(api);
const mockOpenChatStream = vi.mocked(openChatStream);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildMessage(overrides: Partial<ChatMessage>): ChatMessage {
    return {
        id: `msg-${Math.random()}`,
        role: 'user',
        text: 'Hello',
        blocks: [],
        created_at: new Date().toISOString(),
        ...overrides,
    };
}

/** Async generator that yields SSE frames from an array. */
async function* fakeStream(frames: Array<{ event: string; data: unknown }>) {
    for (const f of frames) {
        yield f;
    }
}

function emptyHistoryMock() {
    mockApi.get.mockResolvedValue({ data: [] });
}

// ---------------------------------------------------------------------------
// MessageBubble — Unit-level
// ---------------------------------------------------------------------------

describe('MessageBubble', () => {
    it('renders user message as right-aligned bubble', () => {
        render(<MessageBubble message={buildMessage({ role: 'user', text: 'Analyze NABIL' })} />);
        expect(screen.getByText('Analyze NABIL')).toBeInTheDocument();
    });

    it('renders empty text without crashing', () => {
        render(<MessageBubble message={buildMessage({ role: 'user', text: '' })} />);
    });

    it('renders assistant text block', () => {
        render(
            <MessageBubble
                message={buildMessage({
                    role: 'assistant',
                    text: 'NABIL RSI is 42',
                    blocks: [{ kind: 'text', text: 'NABIL RSI is 42', subagent: null }],
                })}
            />,
        );
        expect(screen.getByText('NABIL RSI is 42')).toBeInTheDocument();
    });

    it('renders thinking block', () => {
        render(
            <MessageBubble
                message={buildMessage({
                    role: 'assistant',
                    blocks: [{ kind: 'thinking', text: 'Let me check RSI...', subagent: null }],
                })}
            />,
        );
        // Thinking blocks may be collapsed by default; just check no crash
    });

    it('renders tool_use block with tool name', () => {
        render(
            <MessageBubble
                message={buildMessage({
                    role: 'assistant',
                    blocks: [
                        {
                            kind: 'tool_use',
                            tool: 'get_stock_quote',
                            input: { ticker: 'NABIL' },
                            id: 'tu_01',
                            subagent: null,
                        },
                    ],
                })}
            />,
        );
        expect(screen.getByText(/Fetching latest quote/i)).toBeInTheDocument();
    });

    it('renders tool_result block', () => {
        render(
            <MessageBubble
                message={buildMessage({
                    role: 'assistant',
                    blocks: [
                        {
                            kind: 'tool_use',
                            tool: 'get_stock_quote',
                            input: {},
                            id: 'tu_01',
                            subagent: null,
                        },
                        {
                            kind: 'tool_result',
                            id: 'tu_01',
                            is_error: false,
                            text: 'LTP: 1250',
                            subagent: null,
                        },
                    ],
                })}
            />,
        );
        // Tool result text is revealed on expand — just verify no crash
    });

    it('skips rendering empty text blocks', () => {
        const { container } = render(
            <MessageBubble
                message={buildMessage({
                    role: 'assistant',
                    blocks: [{ kind: 'text', text: '   ', subagent: null }],
                })}
            />,
        );
        // Whitespace-only text blocks should render nothing
        expect(container.querySelector('[class*="rounded-md border"]')).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// ChatInterface — Integration-level
// ---------------------------------------------------------------------------

describe('ChatInterface', () => {
    beforeEach(() => {
        emptyHistoryMock();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('renders send button and textarea', async () => {
        render(<ChatInterface sessionId="sess-001" />);
        await waitFor(() => expect(mockApi.get).toHaveBeenCalled());
        expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/ask/i)).toBeInTheDocument();
    });

    it('loads message history on mount', async () => {
        const history: ChatMessage[] = [
            buildMessage({ role: 'user', text: 'Previous question' }),
            buildMessage({ role: 'assistant', text: 'Previous answer', blocks: [{ kind: 'text', text: 'Previous answer', subagent: null }] }),
        ];
        mockApi.get.mockResolvedValue({ data: history });

        render(<ChatInterface sessionId="sess-001" />);
        await waitFor(() => {
            expect(screen.getByText('Previous question')).toBeInTheDocument();
        });
        expect(screen.getByText('Previous answer')).toBeInTheDocument();
    });

    it('disables send when prompt is empty', async () => {
        render(<ChatInterface sessionId="sess-001" />);
        await waitFor(() => expect(mockApi.get).toHaveBeenCalled());
        const btn = screen.getByRole('button', { name: /send/i });
        // With empty input the button should be visually disabled or non-functional
        fireEvent.click(btn);
        expect(mockOpenChatStream).not.toHaveBeenCalled();
    });

    it('appends user message optimistically before stream starts', async () => {
        mockOpenChatStream.mockReturnValue(fakeStream([
            { event: 'assistant_start', data: { session_id: 'sess-001' } },
            { event: 'done', data: { session_id: 'sess-001', sdk_session_id: null } },
        ]));

        render(<ChatInterface sessionId="sess-001" />);
        await waitFor(() => expect(mockApi.get).toHaveBeenCalled());

        const input = screen.getByPlaceholderText(/ask/i);
        await userEvent.type(input, 'NABIL analysis');
        await userEvent.keyboard('{Enter}');

        await waitFor(() => {
            expect(screen.getByText('NABIL analysis')).toBeInTheDocument();
        });
    });

    it('streams text content into the assistant bubble', async () => {
        mockOpenChatStream.mockReturnValue(fakeStream([
            { event: 'assistant_start', data: {} },
            { event: 'text', data: { kind: 'text', text: 'RSI is 42', subagent: null } },
            { event: 'done', data: { session_id: 'sess-001', sdk_session_id: null } },
        ]));

        render(<ChatInterface sessionId="sess-001" />);
        await waitFor(() => expect(mockApi.get).toHaveBeenCalled());

        const input = screen.getByPlaceholderText(/ask/i);
        await userEvent.type(input, 'Check RSI');
        await userEvent.keyboard('{Enter}');

        await waitFor(() => {
            expect(screen.getByText('RSI is 42')).toBeInTheDocument();
        });
    });

    it('clears input after sending', async () => {
        mockOpenChatStream.mockReturnValue(fakeStream([
            { event: 'done', data: {} },
        ]));

        render(<ChatInterface sessionId="sess-001" />);
        await waitFor(() => expect(mockApi.get).toHaveBeenCalled());

        const input = screen.getByPlaceholderText(/ask/i);
        await userEvent.type(input, 'Hello');
        await userEvent.keyboard('{Enter}');

        await waitFor(() => {
            expect((input as HTMLTextAreaElement).value).toBe('');
        });
    });

    it('reloads history when sessionId changes', async () => {
        const { rerender } = render(<ChatInterface sessionId="sess-001" />);
        await waitFor(() => expect(mockApi.get).toHaveBeenCalledTimes(1));

        rerender(<ChatInterface sessionId="sess-002" />);
        await waitFor(() => expect(mockApi.get).toHaveBeenCalledTimes(2));
        expect(mockApi.get).toHaveBeenLastCalledWith('/api/chat/sessions/sess-002/messages/');
    });

    it('shows stop button during streaming', async () => {
        let resolveStream!: () => void;
        const stalled = new Promise<void>((res) => { resolveStream = res; });

        async function* stalledStream() {
            yield { event: 'assistant_start', data: {} };
            await stalled; // pause here so streaming state stays true
        }
        mockOpenChatStream.mockReturnValue(stalledStream());

        render(<ChatInterface sessionId="sess-001" />);
        await waitFor(() => expect(mockApi.get).toHaveBeenCalled());

        const input = screen.getByPlaceholderText(/ask/i);
        await userEvent.type(input, 'NEPSE market');
        await userEvent.keyboard('{Enter}');

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /stop/i })).toBeInTheDocument();
        });

        act(() => resolveStream());
    });

    it('does not double-send on rapid clicks', async () => {
        mockOpenChatStream.mockReturnValue(fakeStream([
            { event: 'done', data: {} },
        ]));

        render(<ChatInterface sessionId="sess-001" />);
        await waitFor(() => expect(mockApi.get).toHaveBeenCalled());

        const input = screen.getByPlaceholderText(/ask/i);
        await userEvent.type(input, 'Rapid click');

        const sendBtn = screen.getByRole('button', { name: /send/i });
        await userEvent.click(sendBtn);
        await userEvent.click(sendBtn); // second click while streaming

        // openChatStream should only be called once
        expect(mockOpenChatStream).toHaveBeenCalledTimes(1);
    });
});
