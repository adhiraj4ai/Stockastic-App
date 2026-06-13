/**
 * Slash-command registry for the chat composer.
 *
 * SYNC NOTE: These commands mirror the deterministic commands handled by the
 * backend in backend/chat/commands.py. When adding or removing commands there,
 * update this list to match.
 */

export interface CommandHint {
    command: string;    // The full insertable prefix, e.g. "/memory add"
    args?: string;      // Placeholder text for arguments, e.g. "<fact>"
    description: string;
}

export const CHAT_COMMANDS: CommandHint[] = [
    {
        command: '/memory',
        description: 'List everything the assistant remembers about you',
    },
    {
        command: '/memory add',
        args: '<fact>',
        description: 'Remember a new fact',
    },
    {
        command: '/memory edit',
        args: '<n> <new text>',
        description: 'Replace fact n with new text',
    },
    {
        command: '/memory forget',
        args: '<n or text>',
        description: 'Forget by number or matching text',
    },
    {
        command: '/memory clear confirm',
        description: 'Forget everything',
    },
    {
        command: '/help',
        description: 'List available commands',
    },
];

/**
 * Filter commands based on the current input string.
 *
 * Rules:
 * - Returns [] when input doesn't start with "/" or starts with "//"
 * - Bare "/" returns all commands
 * - Otherwise: case-insensitive prefix match on the command text
 */
export function filterCommands(input: string): CommandHint[] {
    if (!input || !input.startsWith('/')) return [];
    if (input.startsWith('//')) return [];
    if (input === '/') return CHAT_COMMANDS;

    const needle = input.toLowerCase();
    return CHAT_COMMANDS.filter((c) => c.command.toLowerCase().startsWith(needle));
}
