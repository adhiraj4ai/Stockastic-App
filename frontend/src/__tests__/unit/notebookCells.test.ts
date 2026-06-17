/**
 * Unit tests for notebook cell helpers: reordering, run-duration formatting,
 * and extracting the final answer text for "copy answer".
 */
import { describe, it, expect } from 'vitest';
import { moveItem, formatRunDuration, extractAnswerText } from '@/lib/notebookCells';

describe('moveItem', () => {
    it('moves an item up (towards the start)', () => {
        expect(moveItem(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
    });

    it('moves an item down (towards the end)', () => {
        expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    });

    it('is a no-op moving the first item up', () => {
        expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
    });

    it('is a no-op moving the last item down', () => {
        expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
    });

    it('does not mutate the input array', () => {
        const input = ['a', 'b', 'c'];
        moveItem(input, 0, 1);
        expect(input).toEqual(['a', 'b', 'c']);
    });
});

describe('formatRunDuration', () => {
    it('formats sub-minute durations as seconds', () => {
        expect(formatRunDuration(12_300)).toBe('12s');
    });

    it('formats minute-plus durations as "Nm SSs"', () => {
        expect(formatRunDuration(125_000)).toBe('2m 05s');
    });

    it('clamps negative input to 0s', () => {
        expect(formatRunDuration(-5)).toBe('0s');
    });
});

describe('extractAnswerText', () => {
    it('returns the last non-empty text block', () => {
        const outputs = [
            { kind: 'thinking', text: 'hmm' },
            { kind: 'text', text: 'first' },
            { kind: 'tool_result', text: 'data' },
            { kind: 'text', text: 'final answer' },
        ];
        expect(extractAnswerText(outputs)).toBe('final answer');
    });

    it('returns empty string when there is no text block', () => {
        expect(extractAnswerText([{ kind: 'thinking', text: 'x' }])).toBe('');
    });
});
