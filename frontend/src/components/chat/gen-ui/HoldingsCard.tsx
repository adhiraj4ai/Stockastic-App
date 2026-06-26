import React from 'react';
import { cn } from '@/lib/utils';
import AllocationDonut from './charts/AllocationDonut';

interface HoldingRow {
    ticker: string;
    sector?: string | null;
    quantity: number;
    wacc: number;
    current_price: number;
    current_value: number;
    gain_loss: number;
    gain_loss_pct: number;
    day_gain_loss: number;
    health_score?: number | null;
    signal?: string | null;
}

interface HoldingsCardData {
    holdings: HoldingRow[];
}

const npr = (n: number) => `Rs ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

function HoldingTableRow({ r, total }: { r: HoldingRow; total: number }) {
    const weight = total > 0 ? `${((r.current_value / total) * 100).toFixed(1)}%` : '—';
    const plClass = r.gain_loss >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
    return (
        <tr key={r.ticker} className="border-t border-border">
            <Td><div className="font-medium text-foreground">{r.ticker}</div>{r.sector && <div className="text-[10px] text-muted-foreground">{r.sector}</div>}</Td>
            <Td align="right" mono>{r.quantity}</Td>
            <Td align="right" mono>{r.wacc.toFixed(2)}</Td>
            <Td align="right" mono>{r.current_price.toFixed(2)}</Td>
            <Td align="right" mono>{npr(r.current_value)}</Td>
            <Td align="right" mono>{weight}</Td>
            <Td align="right" mono><span className={cn(plClass)}>{r.gain_loss_pct >= 0 ? '+' : ''}{r.gain_loss_pct.toFixed(2)}%</span></Td>
            <Td>{r.signal ? <SignalChip s={r.signal} /> : <span className="text-muted-foreground">—</span>}</Td>
        </tr>
    );
}

export default function HoldingsCard(data: HoldingsCardData) {
    const rows = data.holdings || [];
    const total = rows.reduce((s, r) => s + (r.current_value || 0), 0);
    return (
        <div className="surface overflow-hidden text-sm">
            <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
                <span className="font-medium text-foreground">Holdings</span>
                <span className="text-[11px] text-muted-foreground">{rows.length} positions</span>
            </div>
            {rows.length > 0 && <div className="px-4 pt-3"><AllocationDonut rows={rows} /></div>}
            <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                    <thead className="bg-muted/40 text-muted-foreground">
                        <tr>
                            <Th>Ticker</Th><Th align="right">Qty</Th><Th align="right">WACC</Th>
                            <Th align="right">LTP</Th><Th align="right">Value</Th><Th align="right">Weight</Th>
                            <Th align="right">P/L</Th><Th>Signal</Th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r) => <HoldingTableRow key={r.ticker} r={r} total={total} />)}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function Th({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
    return (
        <th
            className={cn(
                'px-3 py-2 font-medium text-[11px] uppercase tracking-wider',
                align === 'right' ? 'text-right' : 'text-left',
            )}
        >
            {children}
        </th>
    );
}

function Td({ children, align = 'left', mono = false }: { children: React.ReactNode; align?: 'left' | 'right'; mono?: boolean }) {
    return (
        <td
            className={cn(
                'px-3 py-2 text-foreground',
                align === 'right' ? 'text-right' : 'text-left',
                mono && 'tabular-nums',
            )}
        >
            {children}
        </td>
    );
}

function SignalChip({ s }: { s: string }) {
    const tone =
        s === 'BUY'
            ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20'
            : s === 'SELL'
                ? 'text-rose-600 dark:text-rose-400 bg-rose-50/50 dark:bg-rose-950/20'
                : 'text-muted-foreground bg-muted/40';
    return (
        <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', tone)}>{s}</span>
    );
}
