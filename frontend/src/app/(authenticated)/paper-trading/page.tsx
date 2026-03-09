'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import DashboardLayout from '@/components/DashboardLayout';
import { Trophy, RefreshCw, BarChart2, TrendingUp } from 'lucide-react';
import { formatRupees } from '@/lib/formatters';

interface LeaderboardEntry {
    account_id: number;
    account_name: string;
    user: string;
    balance: number;
    positions_value: number;
    total_value: number;
    roi_percentage: number;
}

export default function PaperTradingPage() {
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
    const [myAccounts, setMyAccounts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [accountsRes, leaderboardRes] = await Promise.all([
                    api.get('/api/stocks/accounts/'),
                    api.get('/api/stocks/accounts/leaderboard/')
                ]);

                setMyAccounts(accountsRes.data.filter((a: any) => a.account_type === 'PAPER'));
                setLeaderboard(leaderboardRes.data);
            } catch (error) {
                console.error("Failed to fetch paper trading data:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const handleReset = async (accountId: number) => {
        if (!confirm("Are you sure you want to reset this paper trading account? All positions and history will be lost. This cannot be undone.")) return;

        try {
            await api.post(`/api/stocks/accounts/${accountId}/reset/`, {
                starting_balance: 1000000
            });
            alert("Account reset successfully.");
            window.location.reload();
        } catch (error) {
            console.error("Failed to reset account:", error);
            alert("Failed to reset account.");
        }
    };

    if (loading) return (
        <DashboardLayout title="Paper Trading" subtitle="Practice trading without risking real money">
            <div className="p-8 text-center text-gray-500 dark:text-slate-400">Loading Paper Trading Dashboard...</div>
        </DashboardLayout>
    );

    return (
        <DashboardLayout title="Paper Trading" subtitle="Practice trading without risking real money">
            <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* My Accounts Section */}
                    <div className="lg:col-span-1 space-y-6">
                        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800">
                            <div className="flex items-center gap-2 mb-4">
                                <BarChart2 className="w-5 h-5 text-blue-500" />
                                <h2 className="text-lg font-bold text-gray-800 dark:text-slate-200">My Virtual Accounts</h2>
                            </div>

                            {myAccounts.length === 0 ? (
                                <p className="text-sm text-gray-500 dark:text-slate-400 p-4 bg-gray-50 dark:bg-slate-800 rounded-lg text-center">
                                    You don't have any Paper Trading accounts yet. Create one from the Portfolio page.
                                </p>
                            ) : (
                                <div className="space-y-4">
                                    {myAccounts.map(account => (
                                        <div key={account.id} className="p-4 rounded-lg bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700">
                                            <div className="flex justify-between items-start mb-2">
                                                <h3 className="font-semibold text-gray-800 dark:text-slate-200">{account.name}</h3>
                                                <button
                                                    onClick={() => handleReset(account.id)}
                                                    className="text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-1.5 rounded flex items-center gap-1 transition-colors"
                                                    title="Reset account to starting balance"
                                                >
                                                    <RefreshCw size={14} /> Restart
                                                </button>
                                            </div>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-gray-500 dark:text-slate-400">Available Cash</span>
                                                <span className="font-bold text-gray-900 dark:text-slate-100">{formatRupees(account.balance)}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="bg-blue-50 dark:bg-blue-900/20 p-6 rounded-xl border border-blue-100 dark:border-blue-800">
                            <h3 className="font-bold text-blue-800 dark:text-blue-300 mb-2 flex items-center gap-2">
                                <TrendingUp size={18} /> How it works
                            </h3>
                            <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-2 list-disc pl-4">
                                <li>Start with a virtual balance (Rs. 1,000,000 by default).</li>
                                <li>Place buy, sell, and short sell orders using real-time market data.</li>
                                <li>Broker fees and commissions are automatically simulated.</li>
                                <li>Track your ROI and compete on the leaderboard!</li>
                            </ul>
                        </div>
                    </div>

                    {/* Leaderboard Section */}
                    <div className="lg:col-span-2">
                        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-gray-100 dark:border-slate-800 overflow-hidden">
                            <div className="p-6 border-b border-gray-100 dark:border-slate-800 flex items-center gap-2">
                                <Trophy className="w-5 h-5 text-yellow-500" />
                                <h2 className="text-lg font-bold text-gray-800 dark:text-slate-200">Global Leaderboard</h2>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-gray-50 dark:bg-slate-800/80 text-gray-600 dark:text-slate-400 font-medium">
                                        <tr>
                                            <th className="px-6 py-4">Rank</th>
                                            <th className="px-6 py-4">Trader</th>
                                            <th className="px-6 py-4 text-right">Total Equity</th>
                                            <th className="px-6 py-4 text-right">ROI Rank</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {leaderboard.length === 0 ? (
                                            <tr>
                                                <td colSpan={4} className="px-6 py-8 text-center text-gray-500">No paper trading accounts exist yet!</td>
                                            </tr>
                                        ) : (
                                            leaderboard.map((entry, index) => (
                                                <tr key={index} className="border-b border-gray-50 dark:border-slate-800 last:border-0 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 dark:bg-slate-800 font-bold text-gray-700 dark:text-slate-300">
                                                            {index + 1}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 font-medium text-gray-900 dark:text-slate-200">
                                                        @{entry.user}
                                                        <div className="text-xs text-gray-500 dark:text-slate-500 font-normal">{entry.account_name}</div>
                                                    </td>
                                                    <td className="px-6 py-4 text-right font-bold text-gray-900 dark:text-slate-100">
                                                        {formatRupees(entry.total_value)}
                                                    </td>
                                                    <td className={`px-6 py-4 text-right font-bold ${entry.roi_percentage >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                                        {entry.roi_percentage > 0 ? '+' : ''}{entry.roi_percentage.toFixed(2)}%
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
