'use client';

import { cn } from '@/lib/utils';
import type { CommandHint } from '@/lib/chat-commands';

interface CommandHintMenuProps {
    items: CommandHint[];
    selectedIndex: number;
    onSelect: (item: CommandHint) => void;
}

/**
 * Slash-command hint popup rendered above the chat composer.
 * The caller must wrap this in a `relative`-positioned container.
 */
export function CommandHintMenu({ items, selectedIndex, onSelect }: CommandHintMenuProps) {
    if (items.length === 0) return null;

    return (
        <div
            role="listbox"
            aria-label="Available commands"
            aria-activedescendant={`cmd-hint-${selectedIndex}`}
            className={cn(
                'absolute bottom-full left-0 right-0 mb-1 z-50',
                'bg-popover border border-border rounded-md shadow-md overflow-hidden',
            )}
        >
            {items.map((item, i) => (
                <div
                    key={item.command}
                    id={`cmd-hint-${i}`}
                    role="option"
                    aria-selected={i === selectedIndex}
                    onMouseDown={(e) => { e.preventDefault(); onSelect(item); }}
                    className={cn(
                        'flex items-baseline gap-2 px-3 py-2 cursor-pointer select-none',
                        'text-sm',
                        i === selectedIndex ? 'bg-accent' : 'hover:bg-accent/50',
                    )}
                >
                    <span className="font-mono font-semibold text-foreground shrink-0">
                        {item.command}
                    </span>
                    {item.args && (
                        <span className="text-muted-foreground shrink-0">
                            {item.args}
                        </span>
                    )}
                    <span className="text-muted-foreground truncate">
                        {item.description}
                    </span>
                </div>
            ))}
        </div>
    );
}
