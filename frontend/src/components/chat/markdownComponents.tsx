/**
 * Shared react-markdown component map. Mirrors the renderer used by chat
 * MessageBubble so saved-analysis summaries render with identical styling.
 */
import React from 'react';
import type { Components } from 'react-markdown';

export const MarkdownComponents: Components = {
    p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
    ul: ({ children }) => <ul className="list-disc pl-5 mb-2 last:mb-0 space-y-1">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 last:mb-0 space-y-1">{children}</ol>,
    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
    h1: ({ children }) => <h1 className="text-base font-semibold mt-3 mb-1 first:mt-0">{children}</h1>,
    h2: ({ children }) => <h2 className="text-sm font-semibold mt-3 mb-1 first:mt-0">{children}</h2>,
    h3: ({ children }) => <h3 className="text-xs font-semibold mt-2 mb-1 first:mt-0">{children}</h3>,
    a: ({ href, children }) => (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:text-primary/80">
            {children}
        </a>
    ),
    code: ({ className, children }) => {
        const isInline = !className || !className.includes('language-');
        if (isInline) {
            return (
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono border border-border">
                    {children}
                </code>
            );
        }
        return (
            <pre className="overflow-x-auto rounded-md bg-muted/60 p-3 my-2 text-xs font-mono border border-border">
                <code className={className}>{children}</code>
            </pre>
        );
    },
    table: ({ children }) => (
        <div className="overflow-x-auto my-2">
            <table className="min-w-full divide-y divide-border border border-border rounded-md text-xs">{children}</table>
        </div>
    ),
    thead: ({ children }) => <thead className="bg-muted/50">{children}</thead>,
    tbody: ({ children }) => <tbody className="divide-y divide-border">{children}</tbody>,
    tr: ({ children }) => <tr>{children}</tr>,
    th: ({ children }) => <th className="px-3 py-2 text-left font-semibold text-muted-foreground">{children}</th>,
    td: ({ children }) => <td className="px-3 py-2">{children}</td>,
};
