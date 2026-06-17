/**
 * Resolution of a notebook's backend chat session.
 *
 * Each notebook runs its cells inside a dedicated, deterministically-titled chat
 * session. The id is cached in localStorage for speed, but that cache can point
 * at a session that no longer exists (e.g. after a backend DB reseed). Trusting
 * a dead id silently breaks every cell, so resolution always validates against
 * the live session list before falling back to title match / creation.
 */

interface SessionSummary {
    id: string;
    title: string;
}

/** The unique session title for a notebook. */
export function notebookSessionTitle(notebookId: string): string {
    return `Notebook Session: ${notebookId}`;
}

/**
 * Resolve the session id to run a notebook's cells in, or null if one must be
 * created. A cached id is only honoured when it still exists on the server.
 */
export function resolveNotebookSessionId(
    sessions: SessionSummary[],
    savedId: string | null,
    notebookId: string,
): string | null {
    if (savedId && sessions.some(s => s.id === savedId)) return savedId;
    const titled = sessions.find(s => s.title === notebookSessionTitle(notebookId));
    return titled ? titled.id : null;
}
