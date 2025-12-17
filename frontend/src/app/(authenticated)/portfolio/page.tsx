'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trash2, Plus, TrendingUp, TrendingDown, DollarSign, Wallet, Users, FolderPlus } from 'lucide-react';
import TransactionModal, { PortfolioAccount } from '@/components/TransactionModal';
import { CreateAccountDialog } from '@/components/CreateAccountDialog';
import StockLink from '@/components/StockLink';

interface PortfolioItem {
    id: number;
    ticker: string;
    quantity: number;
    buy_price: number; // This is the WACC
    wacc: number;
    current_price: number;
    current_value: number;
    investment_value: number;
    gain_loss: number;
    gain_loss_percent: number;
    day_gain_loss: number;
}

export default function PortfolioPage() {
    const [items, setItems] = useState<PortfolioItem[]>([]);
    const [accounts, setAccounts] = useState<PortfolioAccount[]>([]);
    const [selectedAccount, setSelectedAccount] = useState<string>('all');
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isCreateAccountOpen, setIsCreateAccountOpen] = useState(false);
    const router = useRouter();

    const fetchAccounts = async () => {
        try {
            const token = localStorage.getItem('access_token');
            if (!token) return;
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            const response = await axios.get(`${apiUrl}/api/stocks/accounts/`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setAccounts(response.data);
        } catch (err) {
            console.error('Failed to fetch accounts', err);
        }
    };

    const fetchPortfolio = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('access_token');
            if (!token) {
                router.push('/login');
                return;
            }
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

            // Build query
            let query = '';
            if (selectedAccount !== 'all') {
                query = `?account=${selectedAccount}`;
            }

            const response = await axios.get(`${apiUrl}/api/stocks/portfolio/${query}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setItems(response.data);
        } catch (err) {
            console.error('Failed to fetch portfolio', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAccounts();
    }, []);

    useEffect(() => {
        fetchPortfolio();
    }, [router, selectedAccount]);

    // Aggregate Items for "All Accounts" view
    const displayedItems = useMemo(() => {
        if (selectedAccount !== 'all') return items;

        // Group by ticker
        const grouped: { [key: string]: PortfolioItem } = {};
        items.forEach(item => {
            if (!grouped[item.ticker]) {
                // Clone to avoid mutating state directly
                grouped[item.ticker] = { ...item };
            } else {
                const existing = grouped[item.ticker];

                // Accumulate values
                const newQty = existing.quantity + item.quantity;
                const newInvestment = Number(existing.investment_value) + Number(item.investment_value);
                const newCurrentValue = Number(existing.current_value) + Number(item.current_value);
                const newGainLoss = Number(existing.gain_loss) + Number(item.gain_loss);
                const newDayGainLoss = Number(existing.day_gain_loss) + Number(item.day_gain_loss);

                // Recalculate WACC for the combined group
                const newWacc = newQty > 0 ? newInvestment / newQty : 0;
                const newGainLossPercent = newInvestment > 0 ? (newGainLoss / newInvestment * 100) : 0;

                grouped[item.ticker] = {
                    ...existing,
                    quantity: newQty,
                    investment_value: newInvestment,
                    current_value: newCurrentValue,
                    gain_loss: newGainLoss,
                    day_gain_loss: newDayGainLoss,
                    wacc: newWacc,
                    buy_price: newWacc,
                    gain_loss_percent: newGainLossPercent
                };
            }
        });

        return Object.values(grouped);
    }, [items, selectedAccount]);

    // Calculate Summary
    const totalInvestment = displayedItems.reduce((acc, item) => acc + Number(item.investment_value), 0);
    const totalCurrentValue = displayedItems.reduce((acc, item) => acc + Number(item.current_value), 0);
    const totalGainLoss = totalCurrentValue - totalInvestment;
    const totalGainLossPercent = totalInvestment ? (totalGainLoss / totalInvestment * 100) : 0;
    const totalDayGainLoss = displayedItems.reduce((acc, item) => acc + Number(item.day_gain_loss), 0);

    return (
        <DashboardLayout>
            <div className="space-y-6">

                {/* Header & Actions */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">My Portfolio</h1>
                        <p className="text-gray-500">Track and manage your investments</p>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Account Selector */}
                        <div className="relative">
                            <select
                                value={selectedAccount}
                                onChange={(e) => setSelectedAccount(e.target.value)}
                                className="appearance-none bg-white border border-gray-300 text-gray-700 py-2.5 pl-4 pr-10 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium shadow-sm cursor-pointer"
                            >
                                <option value="all">All Accounts</option>
                                <option disabled>──────────</option>
                                {accounts.map(acc => (
                                    <option key={acc.id} value={acc.id}>{acc.name}</option>
                                ))}
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
                                <Users className="h-4 w-4" />
                            </div>
                        </div>

                        <button
                            onClick={() => setIsCreateAccountOpen(true)}
                            className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 p-2.5 rounded-lg shadow-sm transition-all"
                            title="Create New Portfolio Account"
                        >
                            <FolderPlus className="h-5 w-5" />
                        </button>

                        <button
                            onClick={() => {
                                if (accounts.length === 0) {
                                    alert("You need to create a portfolio account first!");
                                    setIsCreateAccountOpen(true);
                                } else {
                                    setIsModalOpen(true);
                                }
                            }}
                            className="flex items-center gap-2 bg-black hover:bg-gray-800 text-white px-5 py-2.5 rounded-lg font-medium transition-all shadow-lg active:scale-95"
                        >
                            <Plus className="h-5 w-5" />
                            <span className="hidden sm:inline">Add Transaction</span>
                        </button>
                    </div>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <Card className="bg-white border-blue-100 shadow-sm">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-gray-500">Total Investment</CardTitle>
                            <Wallet className="h-4 w-4 text-blue-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-gray-900">
                                Rs. {totalInvestment.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-white border-purple-100 shadow-sm">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-gray-500">Current Value</CardTitle>
                            <DollarSign className="h-4 w-4 text-purple-500" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-gray-900">
                                Rs. {totalCurrentValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </div>
                        </CardContent>
                    </Card>

                    <Card className={totalGainLoss >= 0 ? "border-green-100 shadow-sm" : "border-red-100 shadow-sm"}>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-gray-500">Total Profit/Loss</CardTitle>
                            {totalGainLoss >= 0 ? <TrendingUp className="h-4 w-4 text-green-500" /> : <TrendingDown className="h-4 w-4 text-red-500" />}
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-col">
                                <div className={`text-2xl font-bold ${totalGainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    Rs. {Math.abs(totalGainLoss).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </div>
                                <div className={`text-xs font-medium ${totalGainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {totalGainLoss >= 0 ? '+' : '-'}{Math.abs(totalGainLossPercent).toFixed(2)}%
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className={totalDayGainLoss >= 0 ? "border-green-100 shadow-sm bg-green-50/30" : "border-red-100 shadow-sm bg-red-50/30"}>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium text-gray-500">Today's Profit/Loss</CardTitle>
                            {totalDayGainLoss >= 0 ? <TrendingUp className="h-4 w-4 text-green-500" /> : <TrendingDown className="h-4 w-4 text-red-500" />}
                        </CardHeader>
                        <CardContent>
                            <div className={`text-2xl font-bold ${totalDayGainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                Rs. {Math.abs(totalDayGainLoss).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </div>
                            <div className="text-xs text-gray-400 mt-1">
                                vs Yesterday's Close
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Holdings Table */}
                <Card className="shadow-sm">
                    <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                            <span>Your Holdings {selectedAccount !== 'all' && <span className="text-gray-400 ml-2 text-sm font-normal">(Account: {accounts.find(a => a.id.toString() == selectedAccount)?.name})</span>}</span>
                            {loading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900"></div>}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {displayedItems.length === 0 && !loading ? (
                            <div className="text-center py-10 text-gray-500">
                                No stocks in portfolio. Add a transaction to get started.
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Ticker</TableHead>
                                            <TableHead className="text-right">Quantity</TableHead>
                                            <TableHead className="text-right">WACC</TableHead>
                                            <TableHead className="text-right">LTP</TableHead>
                                            <TableHead className="text-right">Total Value</TableHead>
                                            <TableHead className="text-right">Profit/Loss</TableHead>
                                            <TableHead className="text-right">Today's P/L</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {displayedItems.map((item, idx) => {
                                            const pl = Number(item.gain_loss);
                                            const isPos = pl >= 0;
                                            const dayPl = Number(item.day_gain_loss);
                                            const isDayPos = dayPl >= 0;

                                            return (
                                                <TableRow key={`${item.ticker}-${idx}`} className="hover:bg-gray-50">
                                                    <TableCell className="font-semibold">
                                                        <StockLink ticker={item.ticker} />
                                                    </TableCell>
                                                    <TableCell className="text-right">{item.quantity}</TableCell>
                                                    <TableCell className="text-right">Rs. {Number(item.wacc || item.buy_price).toFixed(2)}</TableCell>
                                                    <TableCell className="text-right">Rs. {item.current_price}</TableCell>
                                                    <TableCell className="text-right font-medium">Rs. {Number(item.current_value).toLocaleString(undefined, { maximumFractionDigits: 0 })}</TableCell>
                                                    <TableCell className={`text-right ${isPos ? 'text-green-600' : 'text-red-600'}`}>
                                                        <div className="font-medium">
                                                            {isPos ? '+' : ''}{pl.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                        </div>
                                                        <div className="text-xs">
                                                            {Number(item.gain_loss_percent).toFixed(2)}%
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className={`text-right font-medium ${isDayPos ? 'text-green-600' : 'text-red-600'}`}>
                                                        {isDayPos ? '+' : ''}{dayPl.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Account Creation Dialog */}
                <CreateAccountDialog
                    isOpen={isCreateAccountOpen}
                    onOpenChange={setIsCreateAccountOpen}
                    onSuccess={fetchAccounts}
                />

                {/* Transaction Modal */}
                <TransactionModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    onSuccess={() => {
                        fetchPortfolio();
                        fetchAccounts(); // Refresh accounts too, maybe balance changed?
                    }}
                    accounts={accounts}
                />

            </div>
        </DashboardLayout>
    );
}
