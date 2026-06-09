/**
 * Unit tests for chat-sse.ts — SSE frame parsing and streaming logic.
 *
 * parseFrame is not exported so we test it indirectly by feeding controlled
 * ReadableStream bytes to openChatStream via a mocked fetch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openChatStream } from '@/lib/chat-sse';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Encode an SSE frame as bytes. */
function sseFrame(event: string, data: unknown): string {
    return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** Build a ReadableStream from a sequence of SSE-formatted strings. */
function makeStream(...frames: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    const chunks = frames.map((f) => encoder.encode(f));
    return new ReadableStream({
        start(controller) {
            for (const chunk of chunks) controller.enqueue(chunk);
            controller.close();
        },
    });
}

/** Mock fetch to return the given SSE frames. */
function mockFetch(...frames: string[]) {
    vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
            ok: true,
            body: makeStream(...frames),
        }),
    );
}

const BASE_ARGS = {
    sessionId: 'sess-123',
    prompt: 'What is NABIL RSI?',
    apiUrl: 'http://localhost:8000',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('openChatStream — frame parsing', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('yields one frame per SSE block', async () => {
        mockFetch(
            sseFrame('assistant_start', { session_id: 'sess-123' }),
            sseFrame('text', { kind: 'text', text: 'RSI is 42' }),
            sseFrame('done', { session_id: 'sess-123', sdk_session_id: null }),
        );

        const frames = [];
        for await (const frame of openChatStream(BASE_ARGS)) {
            frames.push(frame);
        }
        expect(frames).toHaveLength(3);
    });

    it('parses event name correctly', async () => {
        mockFetch(sseFrame('assistant_start', { session_id: 'sess-123' }));
        const frames = [];
        for await (const f of openChatStream(BASE_ARGS)) frames.push(f);
        expect(frames[0].event).toBe('assistant_start');
    });

    it('parses data payload as JSON', async () => {
        const payload = { kind: 'text', text: 'NABIL closed at 1250', subagent: null };
        mockFetch(sseFrame('text', payload));
        const frames = [];
        for await (const f of openChatStream(BASE_ARGS)) frames.push(f);
        expect(frames[0].data).toEqual(payload);
    });

    it('handles multiple frames in a single chunk', async () => {
        const combined =
            sseFrame('assistant_start', {}) +
            sseFrame('text', { text: 'chunk 1' }) +
            sseFrame('done', {});
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                body: new ReadableStream({
                    start(c) {
                        c.enqueue(new TextEncoder().encode(combined));
                        c.close();
                    },
                }),
            }),
        );
        const frames = [];
        for await (const f of openChatStream(BASE_ARGS)) frames.push(f);
        expect(frames).toHaveLength(3);
    });

    it('handles frames split across multiple chunks', async () => {
        const frame = sseFrame('text', { text: 'split' });
        const half = Math.floor(frame.length / 2);
        const enc = new TextEncoder();
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                body: new ReadableStream({
                    start(c) {
                        c.enqueue(enc.encode(frame.slice(0, half)));
                        c.enqueue(enc.encode(frame.slice(half)));
                        c.close();
                    },
                }),
            }),
        );
        const frames = [];
        for await (const f of openChatStream(BASE_ARGS)) frames.push(f);
        expect(frames).toHaveLength(1);
        expect(frames[0].data.text).toBe('split');
    });

    it('skips blocks with no data line', async () => {
        // A frame with only an event line and no data: line
        const noData = `event: heartbeat\n\n`;
        mockFetch(noData, sseFrame('done', {}));
        const frames = [];
        for await (const f of openChatStream(BASE_ARGS)) frames.push(f);
        // heartbeat frame has no data, so it should be dropped
        expect(frames.map((f) => f.event)).not.toContain('heartbeat');
        expect(frames.map((f) => f.event)).toContain('done');
    });

    it('falls back to raw string for non-JSON data', async () => {
        const rawFrame = `event: debug\ndata: not-valid-json\n\n`;
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                body: makeStream(rawFrame),
            }),
        );
        const frames = [];
        for await (const f of openChatStream(BASE_ARGS)) frames.push(f);
        expect(frames[0].data).toBe('not-valid-json');
    });

    it('uses the correct endpoint URL', async () => {
        mockFetch(sseFrame('done', {}));
        const fetchSpy = vi.mocked(fetch);
        for await (const _ of openChatStream({ ...BASE_ARGS, sessionId: 'abc-123' })) {
            // just consume
        }
        expect(fetchSpy).toHaveBeenCalledWith(
            'http://localhost:8000/api/chat/sessions/abc-123/send/',
            expect.objectContaining({ method: 'POST' }),
        );
    });

    it('sends prompt as JSON body', async () => {
        mockFetch(sseFrame('done', {}));
        const fetchSpy = vi.mocked(fetch);
        for await (const _ of openChatStream({ ...BASE_ARGS, prompt: 'Analyze NABIL' })) {
            // just consume
        }
        const [, init] = fetchSpy.mock.calls[0];
        expect(JSON.parse(init!.body as string)).toEqual({ prompt: 'Analyze NABIL' });
    });

    it('sets Accept: text/event-stream header', async () => {
        mockFetch(sseFrame('done', {}));
        const fetchSpy = vi.mocked(fetch);
        for await (const _ of openChatStream(BASE_ARGS)) {
            // just consume
        }
        const headers = (fetchSpy.mock.calls[0][1]!.headers as Record<string, string>);
        expect(headers['Accept']).toBe('text/event-stream');
    });
});

describe('openChatStream — error handling', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('throws when server returns non-ok status', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: false,
                status: 401,
                statusText: 'Unauthorized',
                body: null,
                text: async () => 'Unauthorized',
            }),
        );
        await expect(async () => {
            for await (const _ of openChatStream(BASE_ARGS)) {
                // should throw before yielding
            }
        }).rejects.toThrow('401');
    });

    it('aborts stream when AbortSignal fires', async () => {
        const controller = new AbortController();
        // Stream that never closes on its own
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                body: new ReadableStream({
                    start(c) {
                        // push one frame then stall
                        c.enqueue(new TextEncoder().encode(sseFrame('text', { text: 'partial' })));
                    },
                }),
            }),
        );

        const frames: unknown[] = [];
        controller.abort();
        try {
            for await (const f of openChatStream({ ...BASE_ARGS, signal: controller.signal })) {
                frames.push(f);
            }
        } catch {
            // AbortError is expected
        }
        // No assertion about frames count — just verify it doesn't hang
    });
});
