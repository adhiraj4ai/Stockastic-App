/**
 * Lightweight cards for tools that just need a key-value layout.
 *
 *  - WatchlistCard         (type="watchlist")
 *  - DividendsCard         (type="dividends")
 *  - AccumulationCard      (type="accumulation")
 *  - PriceHistoryCard      (type="price_history")
 *  - PositionSizingCard    (type="position_sizing")
 *  - RealizedPnLCard       (type="realized_pnl")
 */

import React from 'react';
import { cn } from '@/lib/utils';
import CandlestickChart from './charts/CandlestickChart';
import AccumulationTrendChart, { NetPoint } from './charts/AccumulationTrendChart';

const npr = (n: number) => `Rs ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

// ─── Watchlist ────────────────────────────────────────────────────────────

interface WatchRow {
    ticker: string;
    name?: string;
    sector?: string | null;
    current_price?: number | null;
    day_change_pct?: number | null;
    rsi?: number | null;
    target?: number | null;
    upside_pct?: number | null;
    is_accumulating?: boolean;
    buy_signal_count?: number;
    health_score?: number | null;
}

export function WatchlistCard({ rows }: { rows: WatchRow[] }) {
    return (
        <div className="surface overflow-hidden text-sm">
            <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
                <span className="font-medium text-foreground">Watchlist</span>
                <span className="text-[11px] text-muted-foreground">{rows.length} items</span>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                    <thead className="bg-muted/40 text-muted-foreground">
                        <tr>
                            <Th>Ticker</Th>
                            <Th align="right">Price</Th>
                            <Th align="right">Day %</Th>
                            <Th align="right">RSI</Th>
                            <Th align="right">Upside</Th>
                            <Th>Buy sig.</Th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r) => (
                            <tr key={r.ticker} className="border-t border-border">
                                <Td>
                                    <div className="font-medium text-foreground">{r.ticker}</div>
                                    {r.sector && <div className="text-[10px] text-muted-foreground">{r.sector}</div>}
                                </Td>
                                <Td align="right" mono>{r.current_price?.toFixed(2) ?? '—'}</Td>
                                <Td align="right" mono>
                                    <span className={cn(toneFor(r.day_change_pct))}>{fmtPct(r.day_change_pct)}</span>
                                </Td>
                                <Td align="right" mono>{r.rsi?.toFixed(1) ?? '—'}</Td>
                                <Td align="right" mono>
                                    <span className={cn(toneFor(r.upside_pct))}>{fmtPct(r.upside_pct)}</span>
                                </Td>
                                <Td mono>{r.buy_signal_count ?? 0}</Td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ─── Dividends ────────────────────────────────────────────────────────────

interface DividendRow {
    fiscal_year: string;
    bonus_percent: number | string;
    cash_percent: number | string;
    book_close_date: string | null;
}

export function DividendsCard({ symbol, rows }: { symbol: string; rows: DividendRow[] }) {
    return (
        <div className="surface overflow-hidden text-sm">
            <div className="px-4 py-2.5 border-b border-border">
                <span className="font-medium text-foreground">{symbol} · Dividend history</span>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                    <thead className="bg-muted/40 text-muted-foreground">
                        <tr>
                            <Th>Fiscal year</Th>
                            <Th align="right">Cash %</Th>
                            <Th align="right">Bonus %</Th>
                            <Th>Book close</Th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r) => (
                            <tr key={r.fiscal_year} className="border-t border-border">
                                <Td>{r.fiscal_year}</Td>
                                <Td align="right" mono>{Number(r.cash_percent || 0).toFixed(1)}%</Td>
                                <Td align="right" mono>{Number(r.bonus_percent || 0).toFixed(1)}%</Td>
                                <Td mono>{r.book_close_date || '—'}</Td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ─── Accumulation (broker-level) ─────────────────────────────────────────

interface AccumulationRow {
    entity_id: string;
    transaction_date: string;
    cumulative_buy: number;
    cumulative_sell: number;
    cumulative_net: number;
}

export function AccumulationCard({ symbol, rows, series }: { symbol: string; rows: AccumulationRow[]; series?: NetPoint[] }) {
    const sorted = [...rows].sort((a, b) => Math.abs(b.cumulative_net) - Math.abs(a.cumulative_net)).slice(0, 10);
    return (
        <div className="surface overflow-hidden text-sm">
            <div className="px-4 py-2.5 border-b border-border">
                <span className="font-medium text-foreground">{symbol} · Broker accumulation</span>
            </div>
            {series && series.length > 1 && <div className="px-4 pt-3"><AccumulationTrendChart series={series} /></div>}
            <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                    <thead className="bg-muted/40 text-muted-foreground">
                        <tr>
                            <Th>Broker</Th>
                            <Th align="right">Buy</Th>
                            <Th align="right">Sell</Th>
                            <Th align="right">Net</Th>
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.map((r) => (
                            <tr key={`${r.entity_id}-${r.transaction_date}`} className="border-t border-border">
                                <Td mono>#{r.entity_id}</Td>
                                <Td align="right" mono>{Math.round(r.cumulative_buy).toLocaleString()}</Td>
                                <Td align="right" mono>{Math.round(r.cumulative_sell).toLocaleString()}</Td>
                                <Td align="right" mono>
                                    <span className={cn(r.cumulative_net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
                                        {r.cumulative_net >= 0 ? '+' : ''}
                                        {Math.round(r.cumulative_net).toLocaleString()}
                                    </span>
                                </Td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ─── Price history (compact summary) ─────────────────────────────────────

interface PriceHistoryRow {
    date: string;
    open?: number | string;
    high?: number | string;
    low?: number | string;
    close?: number | string;
    volume?: number | string;
    diff_percent?: number | string;
}

function OhlcvTable({ rows }: { rows: PriceHistoryRow[] }) {
    const recent = [...rows].slice(-8).reverse();
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
                <thead className="bg-muted/40 text-muted-foreground">
                    <tr><Th>Date</Th><Th align="right">Open</Th><Th align="right">High</Th><Th align="right">Low</Th><Th align="right">Close</Th><Th align="right">Volume</Th></tr>
                </thead>
                <tbody>
                    {recent.map((r) => (
                        <tr key={r.date} className="border-t border-border">
                            <Td>{r.date}</Td>
                            <Td align="right" mono>{Number(r.open || 0).toFixed(2)}</Td>
                            <Td align="right" mono>{Number(r.high || 0).toFixed(2)}</Td>
                            <Td align="right" mono>{Number(r.low || 0).toFixed(2)}</Td>
                            <Td align="right" mono>{Number(r.close || 0).toFixed(2)}</Td>
                            <Td align="right" mono>{Math.round(Number(r.volume || 0)).toLocaleString()}</Td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export function PriceHistoryCard({ symbol, rows }: { symbol: string; rows: PriceHistoryRow[] }) {
    if (!rows.length) return null;
    const closes = rows.map((r) => Number(r.close || 0));
    const first = closes[0];
    const last = closes[closes.length - 1];
    const changePct = first ? ((last - first) / first) * 100 : 0;
    return (
        <div className="surface p-4 text-sm space-y-3">
            <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">{symbol} · {rows.length}-day history</span>
                <span className={cn('text-[12px] font-medium tabular-nums', toneFor(changePct))}>
                    {changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%
                </span>
            </div>
            <CandlestickChart rows={rows} />
            <OhlcvTable rows={rows} />
        </div>
    );
}

// ─── Position sizing ─────────────────────────────────────────────────────

interface PositionSizingData {
    symbol?: string | null;
    max_shares: number;
    total_investment: number;
    risk_amount: number;
    risk_per_share: number;
    risk_reward_ratio?: number;
    target_price?: number;
    entry_price: number;
    stop_loss_price: number;
    position_size_percentage: number;
    risk_percentage: number;
    warnings?: Array<{ type: string; message: string; severity: string }>;
}

export function PositionSizingCard(data: PositionSizingData) {
    return (
        <div className="surface p-4 text-sm">
            <div className="flex items-center justify-between mb-3">
                <span className="font-medium text-foreground">
                    {data.symbol ? `${data.symbol} · ` : ''}Position sizing
                </span>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                    Risk {data.risk_percentage}% · {data.position_size_percentage.toFixed(1)}% of account
                </span>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-3 tabular-nums">
                <Stat label="Max shares" value={data.max_shares.toLocaleString()} />
                <Stat label="Capital" value={npr(data.total_investment)} />
                <Stat label="At risk" value={npr(data.risk_amount)} />
                <Stat label="Entry" value={data.entry_price.toFixed(2)} />
                <Stat label="Stop" value={data.stop_loss_price.toFixed(2)} />
                {data.risk_reward_ratio !== undefined && (
                    <Stat label="R/R" value={`1 : ${data.risk_reward_ratio.toFixed(2)}`} />
                )}
            </div>
            {data.warnings && data.warnings.length > 0 && (
                <div className="border-t border-border pt-2 space-y-1">
                    {data.warnings.map((w, i) => (
                        <div key={i} className="text-[12px] text-amber-700 dark:text-amber-400">
                            {w.message}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Realized P/L ────────────────────────────────────────────────────────

interface RealizedPnLData {
    gross: number;
    net_receivable: number;
    fees: number;
    cgt: number;
}

export function RealizedPnLCard(data: RealizedPnLData) {
    return (
        <div className="surface p-4 text-sm">
            <div className="font-medium text-foreground mb-3">Sell transactions</div>
            <div className="grid grid-cols-4 gap-3 tabular-nums">
                <Stat label="Gross" value={npr(data.gross)} />
                <Stat label="Net received" value={npr(data.net_receivable)} />
                <Stat label="Fees" value={npr(data.fees)} />
                <Stat label="CGT" value={npr(data.cgt)} />
            </div>
        </div>
    );
}

// ─── Shared helpers ──────────────────────────────────────────────────────

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
    return (
        <th className={cn('px-3 py-2 font-medium text-[11px] uppercase tracking-wider', align === 'right' ? 'text-right' : 'text-left')}>
            {children}
        </th>
    );
}

function Td({ children, align = 'left', mono = false }: { children: React.ReactNode; align?: 'left' | 'right'; mono?: boolean }) {
    return (
        <td className={cn('px-3 py-2 text-foreground', align === 'right' ? 'text-right' : 'text-left', mono && 'tabular-nums')}>
            {children}
        </td>
    );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className="text-sm font-medium text-foreground">{value}</div>
        </div>
    );
}

function fmtPct(v?: number | null): string {
    if (v == null) return '—';
    return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}

function toneFor(v?: number | null): string {
    if (v == null) return '';
    if (v > 0) return 'text-emerald-600 dark:text-emerald-400';
    if (v < 0) return 'text-rose-600 dark:text-rose-400';
    return '';
}
