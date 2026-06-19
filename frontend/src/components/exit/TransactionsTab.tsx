import { Pencil, Trash2 } from 'lucide-react';
import { formatNepaliNumber } from '@/lib/formatters';

export interface Transaction {
    id: number;
    transaction_date: string;
    transaction_type: string;
    reason?: string;
    quantity: number;
    rate: string;
    amount: string;
    commission: string;
    sebon_fee: string;
    dp_charge: string;
    cgt: string;
    receivable_amount: string;
}

interface Props {
    transactions: Transaction[];
    onEdit: (t: Transaction) => void;
    onDelete: (id: number) => void;
}

const TYPE_STYLES: Record<string, string> = {
    BUY: 'bg-green-50 text-green-600',
    SELL: 'bg-red-50 text-red-600',
};

const MONEY_CELL_CLASS = 'px-3 py-2.5 text-right tabular-nums text-gray-500 dark:text-slate-400';

function MoneyCell({ value, className = MONEY_CELL_CLASS }: { value: string; className?: string }) {
    return <td className={className}>{formatNepaliNumber(value)}</td>;
}

function TransactionRow({ t, onEdit, onDelete }: { t: Transaction; onEdit: Props['onEdit']; onDelete: Props['onDelete'] }) {
    const typeStyle = TYPE_STYLES[t.transaction_type] ?? 'bg-blue-50 text-blue-600';
    return (
        <tr className="hover:bg-accent transition-colors border-b border-slate-50 dark:border-slate-800 last:border-0">
            <td className="px-3 py-2.5 text-gray-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                {new Date(t.transaction_date).toLocaleDateString()}
            </td>
            <td className="px-3 py-2.5">
                <span className={`font-bold px-2 py-0.5 rounded text-[10px] ${typeStyle}`}>{t.transaction_type}</span>
            </td>
            <td className="px-3 py-2.5 text-gray-500 dark:text-slate-400">{t.reason ?? '—'}</td>
            <td className="px-3 py-2.5 text-right font-bold text-gray-700 dark:text-slate-300 tabular-nums">{t.quantity}</td>
            <MoneyCell value={t.rate} className="px-3 py-2.5 text-right font-medium text-gray-600 dark:text-slate-400 tabular-nums" />
            <MoneyCell value={t.amount} className="px-3 py-2.5 text-right font-bold text-gray-900 dark:text-slate-100 tabular-nums" />
            <MoneyCell value={t.commission} />
            <MoneyCell value={t.sebon_fee} />
            <MoneyCell value={t.dp_charge} />
            <MoneyCell value={t.cgt} />
            <MoneyCell value={t.receivable_amount} className="px-3 py-2.5 text-right font-bold text-gray-900 dark:text-slate-100 tabular-nums" />
            <td className="px-3 py-2.5 text-right">
                <div className="flex items-center justify-end gap-2">
                    <button
                        onClick={() => onEdit(t)}
                        className="p-1 text-slate-400 hover:text-primary hover:bg-primary/10 rounded transition-colors"
                        title="Edit transaction"
                    >
                        <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                        onClick={() => onDelete(t.id)}
                        className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Delete transaction"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </button>
                </div>
            </td>
        </tr>
    );
}

export function TransactionsTab({ transactions, onEdit, onDelete }: Props) {
    if (transactions.length === 0) {
        return (
            <div className="flex items-center justify-center py-12 text-sm text-slate-400 dark:text-slate-500">
                No transactions yet.
            </div>
        );
    }

    const sorted = [...transactions].sort(
        (a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime()
    );

    return (
        <div className="overflow-x-auto overflow-y-auto max-h-[400px] scrollbar-thin scrollbar-thumb-slate-200">
            <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 font-bold tracking-tight sticky top-0 z-10 text-[10px]">
                    <tr>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Type</th>
                        <th className="px-3 py-2">Reason</th>
                        <th className="px-3 py-2 text-right">Quantity</th>
                        <th className="px-3 py-2 text-right">Rate</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                        <th className="px-3 py-2 text-right">Commission</th>
                        <th className="px-3 py-2 text-right">SEBON</th>
                        <th className="px-3 py-2 text-right">DP</th>
                        <th className="px-3 py-2 text-right">CGT</th>
                        <th className="px-3 py-2 text-right">Receivable</th>
                        <th className="px-3 py-2"></th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                    {sorted.map((t) => (
                        <TransactionRow key={t.id} t={t} onEdit={onEdit} onDelete={onDelete} />
                    ))}
                </tbody>
            </table>
        </div>
    );
}
