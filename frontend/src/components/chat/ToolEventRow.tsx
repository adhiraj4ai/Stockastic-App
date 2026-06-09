import { Check, Loader2, Wrench, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ToolStatus = 'running' | 'done' | 'error';

const PRETTY: Record<string, string> = {
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

function prettyName(raw: string): string {
    if (PRETTY[raw]) return PRETTY[raw];
    const stripped = raw.replace(/^mcp__[^_]+__/, '');
    return PRETTY[stripped] || stripped.replace(/_/g, ' ');
}

export function ToolEventRow({
    tool,
    status,
    text,
}: {
    tool: string;
    status: ToolStatus;
    text?: string;
}) {
    return (
        <div
            className={cn(
                'flex items-start gap-2 px-3 py-1.5 rounded-md border text-[12px]',
                status === 'error'
                    ? 'border-rose-200 dark:border-rose-900/40 bg-rose-50/50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-300'
                    : 'border-border bg-muted/40 text-foreground',
            )}
        >
            <span className="mt-0.5 shrink-0">
                {status === 'running' ? (
                    <Loader2 size={12} className="animate-spin text-muted-foreground" />
                ) : status === 'error' ? (
                    <AlertTriangle size={12} className="text-rose-500" />
                ) : (
                    <Check size={12} className="text-emerald-500" />
                )}
            </span>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <Wrench size={11} className="text-muted-foreground" />
                    <span className="font-medium">{prettyName(tool)}</span>
                </div>
                {text && status !== 'running' && (
                    <div className="text-muted-foreground mt-0.5 line-clamp-2">{text}</div>
                )}
            </div>
        </div>
    );
}
