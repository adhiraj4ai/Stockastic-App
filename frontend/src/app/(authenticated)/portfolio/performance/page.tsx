'use client';

import React, { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { PortfolioPerformance } from '@/components/PortfolioPerformance';
import api from '@/lib/api';

// Create a proper interface for the account data
interface Account {
    id: string;
    name: string;
}

export default function PerformancePage() {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [accountLoading, setAccountLoading] = useState(true);
    // Setting default to 'all' as string, consistent with the component's expected type
    const [selectedAccount, setSelectedAccount] = useState<string>('all');

    useEffect(() => {
        const fetchAccounts = async () => {
            try {
                const response = await api.get('/api/stocks/accounts/');
                setAccounts(response.data);
            } catch (err) {
                console.error('Failed to fetch accounts', err);
            } finally {
                setAccountLoading(false);
            }
        };

        fetchAccounts();
    }, []);

    return (
        <DashboardLayout
            title="Portfolio Performance"
            subtitle="Analyze your returns against benchmark indices"
        >
            <div className="space-y-6">
                {/* Account Selection for Performance Page */}
                <div className="flex justify-end">
                    <select
                        value={selectedAccount}
                        onChange={(e) => setSelectedAccount(e.target.value)}
                        className="appearance-none bg-white dark:bg-card border border-gray-300 dark:border-slate-700 text-gray-700 dark:text-slate-300 py-2 pl-4 pr-10 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium shadow-sm cursor-pointer text-sm"
                    >
                        <option value="all">All Accounts</option>
                        {accounts.map((acc: any) => (
                            <option key={acc.id} value={acc.id}>{acc.name}</option>
                        ))}
                    </select>
                </div>

                <PortfolioPerformance accounts={accounts} selectedAccount={selectedAccount} />
            </div>
        </DashboardLayout>
    );
}
