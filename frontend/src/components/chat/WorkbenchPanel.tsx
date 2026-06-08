'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { X, Wrench, CheckCircle2, XCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import type { WorkbenchTool } from './WorkbenchContext';

const TOOL_LABELS: Record<string, string> = {
    get_market_summary: 'Fetching market summary',
    get_top_movers: 'Fetching top movers',
    get_index_history: 'Pulling index history',
    get_floorsheet_whales: 'Identifying whale brokers',
    get_stock_quote: 'Fetching latest quote',
    get_price_history: 'Loading price history',
    get_technicals: 'Computing technical indicators',
    get_fundamentals: 'Reading fundamentals',
    get_dividend_history: 'Reading dividend history',
    get_accumulation: 'Reading broker accumulation',
    get_signals_for_ticker: 'Aggregating signals',
    get_signal_track_record: 'Reading signal track record',
    calc_position_size: 'Sizing the position',
    get_portfolio_overview: 'Reading portfolio',
    get_holdings: 'Listing holdings',
    get_watchlist: 'Reading watchlist',
    get_risk_profile: 'Analyzing portfolio risk',
    get_realized_pnl: 'Reading realized P/L',
    Task: 'Delegating to subagent',
};

function prettyTool(raw: string): string {
    if (TOOL_LABELS[raw]) return TOOL_LABELS[raw];
    const stripped = raw.replace(/^mcp__[^_]+__/, '');
    return TOOL_LABELS[stripped] || stripped.replace(/_/g, ' ');
}

function tryParseJson(text: string): { isJson: true; formatted: string } | { isJson: false } {
    try {
        return { isJson: true, formatted: JSON.stringify(JSON.parse(text), null, 2) };
    } catch {
        return { isJson: false };
    }
}

const MarkdownComponents = {
    p: ({ children }: any) => <p className="mb-2 last:mb-0 leading-relaxed text-[13px]">{children}</p>,
    ul: ({ children }: any) => <ul className="list-disc pl-4 mb-2 last:mb-0 space-y-0.5 text-[13px]">{children}</ul>,
    ol: ({ children }: any) => <ol className="list-decimal pl-4 mb-2 last:mb-0 space-y-0.5 text-[13px]">{children}</ol>,
    li: ({ children }: any) => <li className="leading-relaxed">{children}</li>,
    h1: ({ children }: any) => <h1 className="text-sm font-semibold mt-3 mb-1 first:mt-0">{children}</h1>,
    h2: ({ children }: any) => <h2 className="text-[13px] font-semibold mt-3 mb-1 first:mt-0">{children}</h2>,
    h3: ({ children }: any) => <h3 className="text-[12px] font-semibold mt-2 mb-1 first:mt-0">{children}</h3>,
    strong: ({ children }: any) => <strong className="font-semibold">{children}</strong>,
    a: ({ href, children }: any) => (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:text-primary/80">
            {children}
        </a>
    ),
    code: ({ className, children, ...props }: any) => {
        const isBlock = className?.includes('language-');
        if (isBlock) {
            return (
                <pre className="overflow-x-auto rounded bg-muted/60 p-2.5 my-2 text-[11px] font-mono border border-border">
                    <code className={className} {...props}>{children}</code>
                </pre>
            );
        }
        return (
            <code className="rounded bg-muted px-1 py-0.5 text-[11px] font-mono border border-border" {...props}>
                {children}
            </code>
        );
    },
    table: ({ children }: any) => (
        <div className="overflow-x-auto my-2">
            <table className="min-w-full divide-y divide-border border border-border rounded text-[12px]">{children}</table>
        </div>
    ),
    thead: ({ children }: any) => <thead className="bg-muted/50">{children}</thead>,
    tbody: ({ children }: any) => <tbody className="divide-y divide-border">{children}</tbody>,
    tr: ({ children }: any) => <tr>{children}</tr>,
    th: ({ children }: any) => <th className="px-2.5 py-1.5 text-left font-semibold text-muted-foreground">{children}</th>,
    td: ({ children }: any) => <td className="px-2.5 py-1.5">{children}</td>,
};

// ─── Syntax-highlighted JSON tree ─────────────────────────────────────────────

function JsonNode({ value, depth = 0 }: { value: unknown; depth?: number }) {
    if (value === null) {
        return <span className="text-rose-400 dark:text-rose-500">null</span>;
    }
    if (typeof value === 'boolean') {
        return <span className="text-violet-500 dark:text-violet-400">{String(value)}</span>;
    }
    if (typeof value === 'number') {
        return <span className="text-amber-600 dark:text-amber-400">{value}</span>;
    }
    if (typeof value === 'string') {
        return <span className="text-emerald-600 dark:text-emerald-400">"{value}"</span>;
    }
    if (Array.isArray(value)) {
        if (value.length === 0) return <span className="text-muted-foreground">[]</span>;
        return (
            <>
                <span className="text-muted-foreground">{'['}</span>
                <div className="pl-4">
                    {value.map((item, i) => (
                        <div key={i}>
                            <JsonNode value={item} depth={depth + 1} />
                            {i < value.length - 1 && <span className="text-muted-foreground">,</span>}
                        </div>
                    ))}
                </div>
                <span className="text-muted-foreground">{']'}</span>
            </>
        );
    }
    if (typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>);
        if (entries.length === 0) return <span className="text-muted-foreground">{'{}'}</span>;
        return (
            <>
                <span className="text-muted-foreground">{'{'}</span>
                <div className="pl-4">
                    {entries.map(([k, v], i) => (
                        <div key={k}>
                            <span className="text-sky-600 dark:text-sky-400">"{k}"</span>
                            <span className="text-muted-foreground">: </span>
                            <JsonNode value={v} depth={depth + 1} />
                            {i < entries.length - 1 && <span className="text-muted-foreground">,</span>}
                        </div>
                    ))}
                </div>
                <span className="text-muted-foreground">{'}'}</span>
            </>
        );
    }
    return <span>{String(value)}</span>;
}

function JsonView({ data }: { data: unknown }) {
    return (
        <div className="text-[11px] font-mono bg-muted/50 rounded-md p-3 overflow-x-auto border border-border leading-relaxed">
            <JsonNode value={data} />
        </div>
    );
}

const MIN_WIDTH = 280;
const MAX_WIDTH = 720;
const DEFAULT_WIDTH = 360;

export function WorkbenchPanel({
    tool,
    onClose,
}: {
    tool: WorkbenchTool;
    onClose: () => void;
}) {
    const [width, setWidth] = useState(DEFAULT_WIDTH);
    const dragging = useRef(false);
    const startX = useRef(0);
    const startWidth = useRef(0);

    const onMouseMove = useCallback((e: MouseEvent) => {
        if (!dragging.current) return;
        const delta = startX.current - e.clientX;
        setWidth(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth.current + delta)));
    }, []);

    const onMouseUp = useCallback(() => {
        dragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
    }, [onMouseMove]);

    const onHandleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        dragging.current = true;
        startX.current = e.clientX;
        startWidth.current = width;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };

    useEffect(() => () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
    }, [onMouseMove, onMouseUp]);

    const inputJson = JSON.stringify(tool.input, null, 2);
    const resultParsed = tool.result ? tryParseJson(tool.result.text) : null;

    return (
        <div
            style={{ width }}
            className="relative shrink-0 border-l border-border flex flex-col bg-card overflow-hidden"
        >
            {/* Drag handle */}
            <div
                onMouseDown={onHandleMouseDown}
                className="absolute left-0 top-0 bottom-0 w-1 z-20 cursor-col-resize group"
            >
                <div className="absolute inset-y-0 left-0 w-1 bg-transparent group-hover:bg-amber-300/50 dark:group-hover:bg-amber-700/40 transition-colors" />
                <div className="absolute left-[-1px] top-1/2 -translate-y-1/2 flex flex-col gap-[3px] opacity-0 group-hover:opacity-100 transition-opacity">
                    {[0, 1, 2].map(i => (
                        <div key={i} className="w-[3px] h-[3px] rounded-full bg-amber-400 dark:bg-amber-600" />
                    ))}
                </div>
            </div>

            {/* Header */}
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border bg-muted/40 shrink-0">
                <div className="p-1.5 rounded-md bg-amber-100/70 dark:bg-amber-900/30 border border-amber-200/60 dark:border-amber-800/40">
                    <Wrench size={12} className="text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-foreground truncate leading-tight">
                        {prettyTool(tool.tool)}
                    </div>
                    <div className="text-[11px] text-muted-foreground font-mono truncate">{tool.tool}</div>
                </div>
                <button
                    onClick={onClose}
                    className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    title="Close workbench"
                >
                    <X size={14} />
                </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-border">
                {/* Input */}
                <section className="px-4 py-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                        Input
                    </div>
                    {inputJson === '{}' ? (
                        <div className="text-[12px] text-muted-foreground italic py-1">(no parameters)</div>
                    ) : (
                        <JsonView data={tool.input} />
                    )}
                </section>

                {/* Output */}
                <section className="px-4 py-3">
                    <div className="flex items-center gap-2 mb-2.5">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Output
                        </div>
                        {tool.result && (
                            tool.result.isError ? (
                                <span className="inline-flex items-center gap-1 text-[10px] text-red-500">
                                    <XCircle size={10} /> Error
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-500">
                                    <CheckCircle2 size={10} /> Success
                                </span>
                            )
                        )}
                        {resultParsed?.isJson && (
                            <span className="ml-auto text-[10px] text-muted-foreground/60 font-mono">JSON</span>
                        )}
                    </div>

                    {tool.result ? (
                        tool.result.isError ? (
                            <pre className="text-[11px] font-mono rounded-md p-3 overflow-x-auto border bg-red-50/60 dark:bg-red-950/20 border-red-200/50 dark:border-red-900/40 text-red-800 dark:text-red-300 whitespace-pre-wrap break-all leading-relaxed">
                                {tool.result.text}
                            </pre>
                        ) : resultParsed?.isJson ? (
                            <JsonView data={JSON.parse(tool.result!.text)} />
                        ) : (
                            <div className="text-foreground leading-relaxed">
                                <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                                    {tool.result.text}
                                </ReactMarkdown>
                            </div>
                        )
                    ) : (
                        <div className="text-[12px] text-muted-foreground italic py-2">
                            Waiting for result…
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
