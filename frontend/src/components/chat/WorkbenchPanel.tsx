'use client';

import { X, Wrench, CheckCircle2, XCircle } from 'lucide-react';
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

function tryFormatJson(text: string): string {
    try {
        return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
        return text;
    }
}

export function WorkbenchPanel({
    tool,
    onClose,
}: {
    tool: WorkbenchTool;
    onClose: () => void;
}) {
    const inputJson = JSON.stringify(tool.input, null, 2);
    const resultFormatted = tool.result ? tryFormatJson(tool.result.text) : '';

    return (
        <div className="w-[360px] shrink-0 border-l border-border flex flex-col bg-card overflow-hidden">
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
                    <pre className="text-[11px] font-mono text-foreground/80 bg-muted/50 rounded-md p-3 overflow-x-auto border border-border whitespace-pre-wrap break-all leading-relaxed">
                        {inputJson === '{}' ? '(no parameters)' : inputJson}
                    </pre>
                </section>

                {/* Output */}
                <section className="px-4 py-3">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Output
                        </div>
                        {tool.result ? (
                            tool.result.isError ? (
                                <span className="inline-flex items-center gap-1 text-[10px] text-red-500">
                                    <XCircle size={10} /> Error
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-500">
                                    <CheckCircle2 size={10} /> Success
                                </span>
                            )
                        ) : null}
                    </div>

                    {tool.result ? (
                        <pre
                            className={cn(
                                'text-[11px] font-mono rounded-md p-3 overflow-x-auto border whitespace-pre-wrap break-all leading-relaxed',
                                tool.result.isError
                                    ? 'bg-red-50/60 dark:bg-red-950/20 border-red-200/50 dark:border-red-900/40 text-red-800 dark:text-red-300'
                                    : 'bg-muted/50 border-border text-foreground/80',
                            )}
                        >
                            {resultFormatted}
                        </pre>
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
