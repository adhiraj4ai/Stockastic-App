/**
 * Pure helpers for notebook cell manipulation and run-output formatting.
 * Kept free of React/DOM so they can be unit-tested in isolation.
 */

/** Swap the item at `index` with its neighbour in `direction` (-1 up, +1 down). */
export function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
    const target = index + direction;
    if (index < 0 || index >= items.length || target < 0 || target >= items.length) {
        return items;
    }
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
}

/** Format an elapsed run time as "12s" or "2m 05s". */
export function formatRunDuration(ms: number): string {
    const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
    if (totalSeconds < 60) return `${totalSeconds}s`;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

/** The final assistant answer is the last non-empty text block in the outputs. */
export function extractAnswerText(outputs: { kind: string; text?: string }[]): string {
    for (let i = outputs.length - 1; i >= 0; i--) {
        const block = outputs[i];
        if (block.kind === 'text' && block.text?.trim()) return block.text.trim();
    }
    return '';
}
