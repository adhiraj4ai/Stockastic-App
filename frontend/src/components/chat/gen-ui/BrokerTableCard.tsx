'use client';

import { formatNepaliNumber } from '@/lib/formatters';

type Column = {
    key: string;
    label: string;
    align?: 'left' | 'right' | 'center';
    format?: 'number' | 'decimal' | 'percent';
};

type BrokerTableData = {
    title: string;
    columns: Column[];
    rows: Record<string, unknown>[];
    meta?: Record<string, unknown>;
};

function formatCell(value: unknown, format?: Column['format']): string {
    if (value === null || value === undefined || value === '') return '–';
    if (format === 'number') return formatNepaliNumber(Number(value));
    if (format === 'decimal') return formatNepaliNumber(Number(value).toFixed(2));
    if (format === 'percent') return `${Number(value).toFixed(2)}%`;
    return String(value);
}

const ALIGN = {
    left: 'text-left',
    right: 'text-right',
    center: 'text-center',
} as const;

export function BrokerTableCard({ data }: { data: BrokerTableData }) {
    const { title, columns, rows } = data;
    return (
        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 bg-gradient-to-r from-indigo-500/15 to-transparent px-4 py-2.5">
                <span className="text-xs font-semibold text-foreground">{title}</span>
                <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
                    {rows.length} rows
                </span>
            </div>
            {rows.length === 0 ? (
                <p className="p-4 text-xs text-muted-foreground">No data for this query.</p>
            ) : (
                <div className="max-h-80 overflow-auto">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="bg-muted/40 sticky top-0">
                                {columns.map((c) => (
                                    <th
                                        key={c.key}
                                        className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground ${ALIGN[c.align ?? 'left']}`}
                                    >
                                        {c.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, i) => (
                                <tr key={i} className="border-t border-border/50 even:bg-muted/20">
                                    {columns.map((c) => {
                                        const raw = row[c.key];
                                        const negative =
                                            c.format !== undefined &&
                                            raw !== null &&
                                            raw !== undefined &&
                                            Number(raw) < 0;
                                        return (
                                            <td
                                                key={c.key}
                                                className={`px-3 py-1.5 tabular-nums ${ALIGN[c.align ?? 'left']} ${negative ? 'text-rose-600 dark:text-rose-400' : 'text-foreground'}`}
                                            >
                                                {formatCell(raw, c.format)}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

export default BrokerTableCard;
