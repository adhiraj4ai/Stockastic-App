/**
 * Unit tests for notebook session resolution.
 *
 * A notebook caches its backend chat-session id in localStorage. That cache can
 * outlive the session itself (e.g. after a backend DB reseed), so resolution
 * must validate the cached id against the live session list before trusting it.
 */
import { describe, it, expect } from 'vitest';
import { notebookSessionTitle, resolveNotebookSessionId } from '@/lib/notebookSession';

const NB = 'nb-123';
const sessions = [
    { id: 'sess-existing', title: notebookSessionTitle(NB) },
    { id: 'sess-other', title: 'Some other chat' },
];

describe('notebookSessionTitle', () => {
    it('is deterministic and unique per notebook', () => {
        expect(notebookSessionTitle(NB)).toBe('Notebook Session: nb-123');
    });
});

describe('resolveNotebookSessionId', () => {
    it('uses the cached id when it still exists on the server', () => {
        expect(resolveNotebookSessionId(sessions, 'sess-existing', NB)).toBe('sess-existing');
    });

    it('ignores a stale cached id that is no longer on the server', () => {
        // Falls back to the session matched by title rather than the dead id.
        expect(resolveNotebookSessionId(sessions, 'sess-deleted', NB)).toBe('sess-existing');
    });

    it('falls back to the session matched by title when no cache is present', () => {
        expect(resolveNotebookSessionId(sessions, null, NB)).toBe('sess-existing');
    });

    it('returns null when neither a valid cache nor a titled session exists', () => {
        expect(resolveNotebookSessionId([{ id: 'x', title: 'unrelated' }], 'sess-deleted', NB)).toBeNull();
    });

    it('returns null for an empty session list', () => {
        expect(resolveNotebookSessionId([], 'sess-deleted', NB)).toBeNull();
    });
});
