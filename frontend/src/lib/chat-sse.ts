/**
 * Minimal SSE client for the chat endpoint.
 *
 * The browser's built-in EventSource is GET-only and can't carry cookies for
 * cross-origin auth, so we use fetch + ReadableStream + a small parser.
 *
 * Wire format mirrors W3C SSE: blank-line-delimited frames, each frame has
 * an "event:" line and a "data:" line. The payload is parsed JSON.
 */

export interface ChatSSEFrame {
    event: string;
    data: any;
}

interface OpenStreamArgs {
    sessionId: string;
    prompt: string;
    apiUrl: string;
    signal?: AbortSignal;
}

/**
 * POST the user's prompt to the chat endpoint and yield SSE frames as they
 * arrive. Caller iterates with `for await (const frame of openChatStream(...))`.
 */
export async function* openChatStream({
    sessionId,
    prompt,
    apiUrl,
    signal,
}: OpenStreamArgs): AsyncGenerator<ChatSSEFrame, void, void> {
    const res = await fetch(`${apiUrl}/api/chat/sessions/${sessionId}/send/`, {
        method: 'POST',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
        },
        body: JSON.stringify({ prompt }),
        signal,
    });

    if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Chat stream failed: ${res.status} ${res.statusText} ${errText}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const abortHandler = () => {
        reader.cancel().catch(() => {});
    };

    if (signal) {
        if (signal.aborted) {
            reader.cancel().catch(() => {});
            throw new DOMException('The user aborted a request.', 'AbortError');
        }
        signal.addEventListener('abort', abortHandler);
    }

    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            // Frames are separated by a blank line.
            let frameEnd: number;
            while ((frameEnd = buffer.indexOf('\n\n')) !== -1) {
                const raw = buffer.slice(0, frameEnd);
                buffer = buffer.slice(frameEnd + 2);
                const frame = parseFrame(raw);
                if (frame) yield frame;
            }
        }
    } finally {
        if (signal) {
            signal.removeEventListener('abort', abortHandler);
        }
        reader.releaseLock();
    }
}

function parseFrame(raw: string): ChatSSEFrame | null {
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of raw.split('\n')) {
        if (line.startsWith('event:')) {
            event = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trim());
        }
    }
    if (!dataLines.length) return null;
    const dataStr = dataLines.join('\n');
    try {
        return { event, data: JSON.parse(dataStr) };
    } catch {
        return { event, data: dataStr };
    }
}
