'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import {
    X, Save, Trash2, AlertTriangle, Wallet,
    ShieldAlert, Calculator
} from 'lucide-react';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
    DialogDescription, DialogFooter
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { formatRupees } from '@/lib/formatters';
import { PortfolioAccount } from './TransactionModal';

interface AccountSettingsDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    account: PortfolioAccount | null;
    onUpdate: () => void;
    onDelete: () => void;
    portfolioValue: number; // Current value of holdings in this account
}

export function AccountSettingsDialog({
    isOpen,
    onOpenChange,
    account,
    onUpdate,
    onDelete,
    portfolioValue
}: AccountSettingsDialogProps) {
    const [name, setName] = useState('');
    const [balance, setBalance] = useState('');
    const [riskPercentage, setRiskPercentage] = useState('');
    const [loading, setLoading] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState('');
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    useEffect(() => {
        if (account) {
            setName(account.name);
            setBalance(account.balance.toString());
            setRiskPercentage(account.default_risk_percentage.toString());
            setShowDeleteConfirm(false);
            setDeleteConfirm('');
        }
    }, [account, isOpen]);

    const handleSave = async () => {
        if (!account) return;
        setLoading(true);
        try {
            const token = localStorage.getItem('access_token');
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

            await axios.patch(
                `${apiUrl}/api/stocks/accounts/${account.id}/`,
                {
                    name,
                    balance: parseFloat(balance),
                    default_risk_percentage: parseFloat(riskPercentage)
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            onUpdate();
            onOpenChange(false);
        } catch (err) {
            console.error('Failed to update account', err);
            alert('Failed to update account settings');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!account) return;
        if (deleteConfirm !== account.name) return;

        setLoading(true);
        try {
            const token = localStorage.getItem('access_token');
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

            await axios.delete(
                `${apiUrl}/api/stocks/accounts/${account.id}/`,
                { headers: { Authorization: `Bearer ${token}` } }
            );

            onDelete();
            onOpenChange(false);
        } catch (err) {
            console.error('Failed to delete account', err);
            alert('Failed to delete account. It might contain transactions.');
        } finally {
            setLoading(false);
        }
    };

    if (!account) return null;

    const totalValue = portfolioValue + (parseFloat(balance) || 0);

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px] bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold flex items-center gap-2">
                        Setting: {account.name}
                    </DialogTitle>
                    <DialogDescription>
                        Manage your portfolio account details and settings.
                    </DialogDescription>
                </DialogHeader>

                {!showDeleteConfirm ? (
                    <div className="space-y-6 py-4">
                        {/* Account Summary Card */}
                        <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-100 dark:border-slate-700 space-y-3">
                            <h4 className="text-sm font-bold text-slate-500 dark:text-slate-400 tracking-tight">Account summary</h4>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <span className="text-xs text-slate-500 block">Cash Balance</span>
                                    <span className="text-lg font-bold font-mono">{formatRupees(parseFloat(balance) || 0)}</span>
                                </div>
                                <div>
                                    <span className="text-xs text-slate-500 block">Holdings Value</span>
                                    <span className="text-lg font-bold font-mono text-blue-600 dark:text-blue-400">
                                        {formatRupees(portfolioValue)}
                                    </span>
                                </div>
                                <div className="col-span-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                                    <div className="flex justify-between items-end">
                                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Total account value</span>
                                        <span className="text-xl font-bold text-slate-900 dark:text-slate-100">
                                            {formatRupees(totalValue)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Account Name</Label>
                                <Input
                                    id="name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="dark:bg-slate-800"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="balance" className="flex items-center gap-1">
                                        <Wallet className="w-3 h-3" /> Cash Balance
                                    </Label>
                                    <Input
                                        id="balance"
                                        type="number"
                                        value={balance}
                                        onChange={(e) => setBalance(e.target.value)}
                                        className="dark:bg-slate-800"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="risk" className="flex items-center gap-1">
                                        <ShieldAlert className="w-3 h-3" /> Risk % (Default)
                                    </Label>
                                    <div className="relative">
                                        <Input
                                            id="risk"
                                            type="number"
                                            step="0.1"
                                            value={riskPercentage}
                                            onChange={(e) => setRiskPercentage(e.target.value)}
                                            className="dark:bg-slate-800 pr-8"
                                        />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">%</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="pt-2">
                            <Button
                                variant="destructive"
                                size="sm"
                                className="w-full bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-900/20 dark:hover:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800"
                                onClick={() => setShowDeleteConfirm(true)}
                            >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete Information
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="py-6 space-y-4">
                        <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border border-red-200 dark:border-red-800 flex gap-3 text-red-800 dark:text-red-200">
                            <AlertTriangle className="w-5 h-5 shrink-0" />
                            <div className="text-sm">
                                <p className="font-bold">Danger Zone</p>
                                <p className="mt-1">
                                    This will permanently delete the account <strong>{account.name}</strong> and all its associated transactions. This action cannot be undone.
                                </p>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Type <span className="font-mono font-bold select-all">{account.name}</span> to confirm</Label>
                            <Input
                                value={deleteConfirm}
                                onChange={(e) => setDeleteConfirm(e.target.value)}
                                placeholder={account.name}
                                className="dark:bg-slate-800 border-red-300 focus:ring-red-500"
                            />
                        </div>

                        <div className="flex gap-2 pt-2">
                            <Button
                                variant="outline"
                                className="w-full"
                                onClick={() => {
                                    setShowDeleteConfirm(false);
                                    setDeleteConfirm('');
                                }}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="destructive"
                                className="w-full"
                                disabled={deleteConfirm !== account.name || loading}
                                onClick={handleDelete}
                            >
                                {loading ? 'Deleting...' : 'Confirm Delete'}
                            </Button>
                        </div>
                    </div>
                )}

                {!showDeleteConfirm && (
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleSave} disabled={loading} className="bg-blue-600 hover:bg-blue-700 text-white">
                            {loading ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </DialogFooter>
                )}
            </DialogContent>
        </Dialog>
    );
}
