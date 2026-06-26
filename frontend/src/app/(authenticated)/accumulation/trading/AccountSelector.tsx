'use client';

import { Label } from '@/components/ui/label';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { PortfolioAccount } from '@/components/TransactionModal';

interface Props {
    accounts: PortfolioAccount[];
    selectedId: number | null;
    onChange: (id: number) => void;
}

export function AccountSelector({ accounts, selectedId, onChange }: Props) {
    if (accounts.length === 0) return null;

    return (
        <div className="flex items-center gap-3">
            <Label htmlFor="page-account-select" className="shrink-0 text-sm">
                Paper account
            </Label>
            <Select
                value={selectedId !== null ? String(selectedId) : ''}
                onValueChange={(v) => onChange(Number(v))}
            >
                <SelectTrigger id="page-account-select" className="w-56">
                    <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                    {accounts.map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}
