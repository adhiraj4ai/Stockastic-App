'use client';

import { useState, useEffect } from 'react';
import { X, Calculator } from 'lucide-react';
import axios from 'axios';
import { CompanySelect } from './CompanySelect';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

export interface PortfolioAccount {
    id: number;
    name: string;
    balance: string;
    default_risk_percentage: number;
}

interface TransactionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    defaultTicker?: string;
    defaultType?: string;
    accounts?: PortfolioAccount[];
    // If editing, receive the transaction object
    transactionToEdit?: any;
}

type TransactionType = 'BUY' | 'SELL' | 'BONUS' | 'DIVIDEND';

export default function TransactionModal({
    isOpen,
    onClose,
    onSuccess,
    defaultTicker = '',
    defaultType = 'BUY',
    accounts = [],
    transactionToEdit = null
}: TransactionModalProps) {
    const [activeTab, setActiveTab] = useState<TransactionType>(defaultType as TransactionType);
    const [formData, setFormData] = useState({
        ticker: '',
        transaction_date: new Date().toISOString().split('T')[0],
        quantity: '',
        rate: '',
        account: '', // Account ID
        reason: '',
    });
    const [loading, setLoading] = useState(false);
    const [estimates, setEstimates] = useState<{ commission: number; sebon: number; dp: number; cgt: number; total: number } | null>(null);
    const [isAshmi, setIsAshmi] = useState(false);

    useEffect(() => {
        const checkUser = async () => {
            try {
                const token = localStorage.getItem('access_token');
                if (token) {
                    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
                    const res = await axios.get(`${apiUrl}/api/users/me/`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (res.data.username === 'ashmi') {
                        setIsAshmi(true);
                        // Auto-select first account if not already selected
                        if (accounts.length > 0 && !formData.account) {
                            setFormData(prev => ({ ...prev, account: accounts[0].id.toString() }));
                        }
                    }
                }
            } catch (error) {
                console.error("Failed to check user:", error);
            }
        };
        checkUser();
    }, [accounts]);


    // NEPSE Fee Logic Reuse (Client-side usage for estimation)
    const calculateEstimates = () => {
        const qty = Number(formData.quantity);
        const rate = Number(formData.rate);

        if (!qty || !rate) {
            setEstimates(null);
            return;
        }

        const amount = qty * rate;
        let commissionRate = 0.36; // Default max
        if (amount > 10000000) commissionRate = 0.24;
        else if (amount > 2000000) commissionRate = 0.27;
        else if (amount > 500000) commissionRate = 0.31;
        else if (amount > 50000) commissionRate = 0.33;

        let commission = amount * (commissionRate / 100);
        // Note: Client side estimate, actual is backend.

        const sebon = amount * 0.00015;
        const dp = 25;

        let total = 0;
        let cgt = 0; // CGT is hard to estimate without WACC on client easily

        if (activeTab === 'BUY') {
            total = amount + commission + sebon + dp;
        } else if (activeTab === 'SELL') {
            // Ignoring CGT in estimate for now as we don't have WACC handy here without fetch
            total = amount - commission - sebon - dp;
        } else {
            // Bonus/Div logic diff
            total = 0;
        }

        setEstimates({
            commission,
            sebon,
            dp,
            cgt: 0,
            total
        });
    };

    useEffect(() => {
        if (isOpen) {
            if (transactionToEdit) {
                // Populate form for editing
                setFormData({
                    ticker: transactionToEdit.ticker,
                    transaction_date: new Date(transactionToEdit.transaction_date).toISOString().split('T')[0],
                    quantity: transactionToEdit.quantity.toString(),
                    rate: transactionToEdit.rate.toString(),
                    account: transactionToEdit.account ? transactionToEdit.account.toString() : (accounts.length > 0 ? accounts[0].id.toString() : ''),
                    reason: transactionToEdit.reason || '',
                });
                setActiveTab(transactionToEdit.transaction_type as TransactionType);
            } else {
                // Reset for new transaction
                setFormData(prev => ({
                    ...prev,
                    ticker: defaultTicker,
                    // Default to first account if exists and none selected, or keep empty if multiple
                    transaction_date: new Date().toISOString().split('T')[0],
                    quantity: '',
                    rate: '',
                    reason: '',
                    account: prev.account || (accounts.length > 0 ? accounts[0].id.toString() : '')
                }));
                if (defaultType) setActiveTab(defaultType as TransactionType);
            }
        }
    }, [isOpen, defaultTicker, defaultType, accounts, transactionToEdit]);

    useEffect(() => {
        if (activeTab === 'BUY' || activeTab === 'SELL') {
            calculateEstimates();
        } else {
            setEstimates(null);
        }
    }, [formData.quantity, formData.rate, activeTab]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const token = localStorage.getItem('access_token');
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

            const payload: any = {
                ...formData,
                transaction_type: activeTab,
                transaction_date: new Date(formData.transaction_date).toISOString() // Send full ISO
            };

            // Only send account if selected (API handles null as default/no account)
            if (formData.account) {
                payload.account = formData.account;
            }

            if (transactionToEdit) {
                await axios.put(`${apiUrl}/api/stocks/transactions/${transactionToEdit.id}/`, payload, {
                    headers: { Authorization: `Bearer ${token}` }
                });
            } else {
                await axios.post(`${apiUrl}/api/stocks/transactions/`, payload, {
                    headers: { Authorization: `Bearer ${token}` }
                });
            }

            onSuccess();
            onClose();
            // Reset form (keep account?)
            if (!transactionToEdit) {
                setFormData(prev => ({
                    ...prev,
                    ticker: '',
                    transaction_date: new Date().toISOString().split('T')[0],
                    quantity: '',
                    rate: '',
                    reason: '',
                }));
            }
        } catch (err: any) {
            console.error('Transaction failed:', err);
            const errorMsg = err.response?.data ? JSON.stringify(err.response.data) : "Failed to submit transaction";
            alert(`Error: ${errorMsg}`);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden transform transition-all scale-100">

                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b border-gray-100 dark:border-slate-800">
                    <h2 className="text-xl font-bold text-gray-800 dark:text-slate-100">New Transaction</h2>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
                        <X className="h-5 w-5 text-gray-500 dark:text-slate-400" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-900/50">
                    {(['BUY', 'SELL', 'BONUS', 'DIVIDEND'] as TransactionType[]).map((type) => (
                        <button
                            key={type}
                            onClick={() => setActiveTab(type)}
                            className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === type
                                ? type === 'BUY' ? 'border-green-500 text-green-600 dark:text-green-400 bg-green-50/50 dark:bg-green-900/20'
                                    : type === 'SELL' ? 'border-red-500 text-red-600 dark:text-red-400 bg-red-50/50 dark:bg-red-900/20'
                                        : 'border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/20'
                                : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800'
                                }`}
                        >
                            {type === 'BONUS' ? 'BONUS SHARE' : type === 'DIVIDEND' ? 'CASH DIVIDEND' : type}
                        </button>
                    ))}
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {/* Account Selector */}
                    {/* Account Selector */}
                    {accounts.length > 0 ? (
                        !isAshmi && (
                            <div>
                                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Portfolio Account</label>
                                <Select
                                    value={formData.account ? formData.account.toString() : ""}
                                    onValueChange={(value) => setFormData({ ...formData, account: value })}
                                >
                                    <SelectTrigger className="w-full bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700">
                                        <SelectValue placeholder="Select Account" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {accounts.map(acc => (
                                            <SelectItem key={acc.id} value={acc.id.toString()}>
                                                {acc.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )
                    ) : (
                        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">
                            <strong>No Account Found!</strong>
                            <p>You must create a portfolio account before adding transactions.</p>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Ticker</label>
                            <CompanySelect
                                value={formData.ticker}
                                onChange={(val) => setFormData({ ...formData, ticker: val })}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</label>
                            <input
                                type="date"
                                required
                                className="w-full px-4 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all dark:text-slate-100"
                                value={formData.transaction_date}
                                onChange={(e) => setFormData({ ...formData, transaction_date: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Quantity</label>
                            <input
                                type="number"
                                required
                                min="1"
                                placeholder="0"
                                className="w-full px-4 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all dark:text-slate-100"
                                value={formData.quantity}
                                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                {activeTab === 'BONUS' ? 'Paid Up Value' : activeTab === 'DIVIDEND' ? 'Amount' : 'Rate (Price/Share)'}
                            </label>
                            <input
                                type="number"
                                required
                                step="0.01"
                                placeholder="0.00"
                                className="w-full px-4 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all dark:text-slate-100"
                                value={formData.rate}
                                onChange={(e) => setFormData({ ...formData, rate: e.target.value })}
                            />
                        </div>
                    </div>

                    {/* Reason Dropdown (Only for SELL) */}
                    {activeTab === 'SELL' && (
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Reason for Selling</label>
                            <Select
                                value={formData.reason}
                                onValueChange={(value) => setFormData({ ...formData, reason: value })}
                            >
                                <SelectTrigger className="w-full bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700">
                                    <SelectValue placeholder="Select Reason (Optional)" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="STOP_LOSS">Stop Loss</SelectItem>
                                    <SelectItem value="TAKE_PROFIT">Take Profit</SelectItem>
                                    <SelectItem value="NO_PRICE_CHANGE">No Price Change</SelectItem>
                                    <SelectItem value="FUND_NEED">Fund Need</SelectItem>
                                    <SelectItem value="BETTER_OPPORTUNITY">Better Opportunity</SelectItem>
                                    <SelectItem value="MARKET_SENTIMENT">Market Sentiment</SelectItem>
                                    <SelectItem value="OTHER">Other</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {/* Estimates Panel */}
                    {(activeTab === 'BUY' || activeTab === 'SELL') && estimates && (
                        <div className="mt-4 p-4 bg-gray-50 dark:bg-slate-800/50 rounded-lg border border-gray-100 dark:border-slate-700">
                            <div className="flex items-center gap-2 mb-3 text-gray-700 dark:text-slate-200 font-medium text-sm">
                                <Calculator className="h-4 w-4" />
                                <span className="text-xs uppercase tracking-wider font-semibold">Estimated Breakdown</span>
                            </div>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between text-gray-500 dark:text-slate-400">
                                    <span>Broker Commission</span>
                                    <span>Rs. {estimates.commission.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-gray-500 dark:text-slate-400">
                                    <span>SEBON Fee</span>
                                    <span>Rs. {estimates.sebon.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-gray-500 dark:text-slate-400">
                                    <span>DP Charge</span>
                                    <span>Rs. {estimates.dp.toFixed(2)}</span>
                                </div>
                                <div className="h-px bg-gray-200 dark:bg-slate-700 my-2"></div>
                                <div className="flex justify-between font-bold text-gray-900 dark:text-slate-100">
                                    <span>Net {activeTab === 'BUY' ? 'Payable' : 'Receivable'}</span>
                                    <span>Rs. {estimates.total.toFixed(2)}</span>
                                </div>
                            </div>
                            <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-2 italic">* Actual calculation may vary slightly on server.</p>
                        </div>
                    )}

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={loading || accounts.length === 0}
                        className={`w-full py-3 rounded-lg font-bold text-white shadow-lg transition-transform active:scale-95 ${activeTab === 'BUY' ? 'bg-green-600 hover:bg-green-700 shadow-green-200'
                            : activeTab === 'SELL' ? 'bg-red-600 hover:bg-red-700 shadow-red-200'
                                : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200'
                            } ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
                    >
                        {loading ? 'Processing...' : `Confirm ${activeTab}`}
                    </button>
                </form>
            </div>
        </div>
    );
}
