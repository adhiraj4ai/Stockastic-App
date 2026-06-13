import { describe, it, expect } from 'vitest';
import { filterCommands, CHAT_COMMANDS } from '@/lib/chat-commands';

describe('CHAT_COMMANDS registry', () => {
    it('contains exactly 6 commands', () => {
        expect(CHAT_COMMANDS).toHaveLength(6);
    });

    it('includes all expected command prefixes', () => {
        const commands = CHAT_COMMANDS.map((c) => c.command);
        expect(commands).toContain('/memory');
        expect(commands).toContain('/memory add');
        expect(commands).toContain('/memory edit');
        expect(commands).toContain('/memory forget');
        expect(commands).toContain('/memory clear confirm');
        expect(commands).toContain('/help');
    });

    it('every command has a non-empty description', () => {
        for (const c of CHAT_COMMANDS) {
            expect(c.description.length).toBeGreaterThan(0);
        }
    });
});

describe('filterCommands', () => {
    it('bare "/" returns all 6 commands', () => {
        expect(filterCommands('/')).toHaveLength(6);
    });

    it('"" (empty string) returns empty array', () => {
        expect(filterCommands('')).toEqual([]);
    });

    it('non-slash input returns empty array', () => {
        expect(filterCommands('hello')).toEqual([]);
        expect(filterCommands('memory')).toEqual([]);
    });

    it('"//x" returns empty array (double-slash is not a command)', () => {
        expect(filterCommands('//x')).toEqual([]);
        expect(filterCommands('//')).toEqual([]);
    });

    it('"/me" matches all 5 /memory-prefixed commands', () => {
        // /me is a prefix of /memory — /memory, /memory add, /memory edit, /memory forget, /memory clear confirm
        const results = filterCommands('/me');
        expect(results).toHaveLength(5);
        const commands = results.map((r) => r.command);
        expect(commands).toContain('/memory');
        expect(commands).toContain('/memory add');
        expect(commands).toContain('/memory edit');
        expect(commands).toContain('/memory forget');
        expect(commands).toContain('/memory clear confirm');
    });

    it('"/memory cl" matches only /memory clear confirm', () => {
        const results = filterCommands('/memory cl');
        expect(results).toHaveLength(1);
        expect(results[0].command).toBe('/memory clear confirm');
    });

    it('"/memory f" matches /memory forget', () => {
        const results = filterCommands('/memory f');
        expect(results).toHaveLength(1);
        expect(results[0].command).toBe('/memory forget');
    });

    it('"/h" matches /help', () => {
        const results = filterCommands('/h');
        expect(results).toHaveLength(1);
        expect(results[0].command).toBe('/help');
    });

    it('matching is case-insensitive', () => {
        expect(filterCommands('/ME')).toHaveLength(5);
        expect(filterCommands('/MEMORY CL')).toHaveLength(1);
        expect(filterCommands('/H')).toHaveLength(1);
        expect(filterCommands('/Help')).toHaveLength(1);
    });

    it('exact command match still returns that command', () => {
        const results = filterCommands('/help');
        expect(results).toHaveLength(1);
        expect(results[0].command).toBe('/help');
    });

    it('"/memory" alone matches all 5 memory commands', () => {
        const results = filterCommands('/memory');
        expect(results).toHaveLength(5);
    });

    it('"/memory add" matches exactly /memory add', () => {
        const results = filterCommands('/memory add');
        expect(results).toHaveLength(1);
        expect(results[0].command).toBe('/memory add');
    });
});
