'use client';

import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TransactionHistory } from '@/components/TransactionHistory';
import { TaxReport } from '@/components/TaxReport';
import { Calendar, Receipt, Users } from 'lucide-react';
import api from '@/lib/api';

export const dynamic = 'force-dynamic';

export default function TransactionsPage() {
    const [selectedAccount, setSelectedAccount] = useState('all');
    const [accounts, setAccounts] = useState<any[]>([]);

    useEffect(() => {
        const fetchAccounts = async () => {
            try {
                const res = await api.get('/api/stocks/accounts/');
                setAccounts(res.data);
            } catch (err) {
                console.error(err);
            }
        };
        fetchAccounts();
    }, []);

    return (
        <DashboardLayout
            title="Transactions"
            subtitle="Transaction history and tax breakdown"
        >
            <div className="space-y-8">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                            <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 uppercase tracking-tight">Active Filter</h2>
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Viewing Data For</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <select
                            value={selectedAccount}
                            onChange={(e) => setSelectedAccount(e.target.value)}
                            className="bg-white dark:bg-card border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 text-sm font-bold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all min-w-[200px]"
                        >
                            <option value="all">All Accounts</option>
                            {accounts.map(acc => (
                                <option key={acc.id} value={acc.id}>{acc.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Tax Report Section */}
                <Card className="shadow-sm dark:bg-card dark:border-slate-800 border-amber-100 dark:border-amber-900/30">
                    <CardHeader className="pb-3 border-b border-gray-50 dark:border-slate-800">
                        <CardTitle className="text-lg flex items-center gap-2 dark:text-slate-100 italic">
                            <Receipt className="h-5 w-5 text-amber-500" />
                            Tax Report Breakdown
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <TaxReport selectedAccount={selectedAccount} />
                    </CardContent>
                </Card>

                {/* Transaction History */}
                <Card className="shadow-sm dark:bg-card dark:border-slate-800">
                    <CardHeader className="pb-3 border-b border-gray-50 dark:border-slate-800">
                        <CardTitle className="text-lg flex items-center gap-2 dark:text-slate-100 italic">
                            <Calendar className="h-5 w-5 text-blue-500" />
                            Transaction History
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <TransactionHistory selectedAccount={selectedAccount} />
                    </CardContent>
                </Card>
            </div>
        </DashboardLayout>
    );
}
