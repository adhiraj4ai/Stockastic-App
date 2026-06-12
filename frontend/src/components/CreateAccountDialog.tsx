'use client';

import { useState } from 'react';
import api from '@/lib/api';
import { X } from 'lucide-react';

interface CreateAccountDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
}

export function CreateAccountDialog({ isOpen, onOpenChange, onSuccess }: CreateAccountDialogProps) {
    const [name, setName] = useState('');
    const [accountType, setAccountType] = useState('LIVE');
    const [balance, setBalance] = useState('1000000');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        setLoading(true);
        try {
            const payload = {
                name,
                account_type: accountType,
                ...(accountType === 'PAPER' ? { balance: parseFloat(balance) } : {})
            };
            await api.post('/api/stocks/accounts/', payload);
            setName('');
            setAccountType('LIVE');
            setBalance('1000000');
            onSuccess();
            onOpenChange(false);
        } catch (err) {
            console.error('Failed to create account', err);
            // Optional: Add toast error here
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
            <div className="bg-white dark:bg-card rounded-xl shadow-sm w-full max-w-md overflow-hidden transform transition-all scale-100">

                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b border-gray-100 dark:border-slate-800">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800 dark:text-slate-100">Create Portfolio</h2>
                        <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">Organize your investments</p>
                    </div>
                    <button onClick={() => onOpenChange(false)} className="p-1 rounded-full hover:bg-accent hover:text-accent-foreground transition-colors">
                        <X className="h-5 w-5 text-gray-500 dark:text-slate-400" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label htmlFor="name" className="text-sm font-medium text-gray-700 dark:text-slate-300">Account Name</label>
                            <input
                                id="name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g. Retirement Fund"
                                className="w-full px-4 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring outline-none transition-all dark:text-slate-100"
                                autoFocus
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700 dark:text-slate-300">Account Type</label>
                            <div className="flex gap-4">
                                <label className="flex items-center gap-2 dark:text-slate-300">
                                    <input
                                        type="radio"
                                        name="accountType"
                                        value="LIVE"
                                        checked={accountType === 'LIVE'}
                                        onChange={(e) => setAccountType(e.target.value)}
                                    />
                                    Live (Real Portfolio)
                                </label>
                                <label className="flex items-center gap-2 dark:text-slate-300">
                                    <input
                                        type="radio"
                                        name="accountType"
                                        value="PAPER"
                                        checked={accountType === 'PAPER'}
                                        onChange={(e) => setAccountType(e.target.value)}
                                    />
                                    Paper Trading (Virtual)
                                </label>
                            </div>
                        </div>
                        {accountType === 'PAPER' && (
                            <div className="space-y-2">
                                <label htmlFor="balance" className="text-sm font-medium text-gray-700 dark:text-slate-300">Starting Balance (Rs)</label>
                                <input
                                    id="balance"
                                    type="number"
                                    value={balance}
                                    onChange={(e) => setBalance(e.target.value)}
                                    placeholder="e.g. 1000000"
                                    className="w-full px-4 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring outline-none transition-all dark:text-slate-100"
                                />
                            </div>
                        )}
                    </div>

                    <div className="mt-6 flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={() => onOpenChange(false)}
                            disabled={loading}
                            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-accent hover:text-accent-foreground rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading || !name.trim()}
                            className="px-4 py-2 text-sm font-bold text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Creating...' : 'Create Account'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
