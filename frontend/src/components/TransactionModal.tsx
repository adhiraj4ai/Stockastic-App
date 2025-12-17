'use client';

import { useState, useEffect } from 'react';
import { X, Calculator } from 'lucide-react';
import axios from 'axios';

export interface PortfolioAccount {
    id: number;
    name: string;
    balance: string;
}

interface TransactionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    defaultTicker?: string;
    defaultType?: string;
    accounts?: PortfolioAccount[];
}

type TransactionType = 'BUY' | 'SELL' | 'BONUS' | 'DIVIDEND';

export default function TransactionModal({
    isOpen,
    onClose,
    onSuccess,
    defaultTicker = '',
    defaultType = 'BUY',
    accounts = []
}: TransactionModalProps) {
    const [activeTab, setActiveTab] = useState<TransactionType>(defaultType as TransactionType);
    const [formData, setFormData] = useState({
        ticker: '',
        transaction_date: new Date().toISOString().split('T')[0],
        quantity: '',
        rate: '',
        account: '', // Account ID
    });
    const [loading, setLoading] = useState(false);
    const [estimates, setEstimates] = useState<{ commission: number; sebon: number; dp: number; cgt: number; total: number } | null>(null);

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
            setFormData(prev => ({
                ...prev,
                ticker: defaultTicker,
                // Default to first account if exists and none selected, or keep empty if multiple
                account: prev.account || (accounts.length > 0 ? accounts[0].id.toString() : '')
            }));
            if (defaultType) setActiveTab(defaultType as TransactionType);
        }
    }, [isOpen, defaultTicker, defaultType, accounts]);

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
            // But if we have accounts, we should enforce one? Or let it be optional?
            // If user selects "Select Account", value is empty string.
            if (formData.account) {
                payload.account = formData.account;
            }

            await axios.post(`${apiUrl}/api/stocks/transactions/`, payload, {
                headers: { Authorization: `Bearer ${token}` }
            });

            onSuccess();
            onClose();
            // Reset form (keep account?)
            setFormData(prev => ({
                ...prev,
                ticker: '',
                transaction_date: new Date().toISOString().split('T')[0],
                quantity: '',
                rate: '',
            }));
        } catch (err) {
            console.error(err);
            alert("Failed to submit transaction");
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden transform transition-all scale-100">

                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b border-gray-100">
                    <h2 className="text-xl font-bold text-gray-800">New Transaction</h2>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100 transition-colors">
                        <X className="h-5 w-5 text-gray-500" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-100 bg-gray-50/50">
                    {(['BUY', 'SELL', 'BONUS', 'DIVIDEND'] as TransactionType[]).map((type) => (
                        <button
                            key={type}
                            onClick={() => setActiveTab(type)}
                            className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === type
                                ? type === 'BUY' ? 'border-green-500 text-green-600 bg-green-50/50'
                                    : type === 'SELL' ? 'border-red-500 text-red-600 bg-red-50/50'
                                        : 'border-blue-500 text-blue-600 bg-blue-50/50'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                                }`}
                        >
                            {type === 'BONUS' ? 'BONUS SHARE' : type === 'DIVIDEND' ? 'CASH DIVIDEND' : type}
                        </button>
                    ))}
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {/* Account Selector */}
                    {accounts.length > 0 ? (
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Portfolio Account</label>
                            <select
                                className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                value={formData.account}
                                onChange={(e) => setFormData({ ...formData, account: e.target.value })}
                            >
                                <option value="">Select Account (Default)</option>
                                {accounts.map(acc => (
                                    <option key={acc.id} value={acc.id}>{acc.name}</option>
                                ))}
                            </select>
                        </div>
                    ) : (
                        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">
                            <strong>No Account Found!</strong>
                            <p>You must create a portfolio account before adding transactions.</p>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Ticker</label>
                            <input
                                type="text"
                                required
                                placeholder="e.g. NABIL"
                                className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all uppercase"
                                value={formData.ticker}
                                onChange={(e) => setFormData({ ...formData, ticker: e.target.value.toUpperCase() })}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</label>
                            <input
                                type="date"
                                required
                                className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
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
                                className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
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
                                className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                value={formData.rate}
                                onChange={(e) => setFormData({ ...formData, rate: e.target.value })}
                            />
                        </div>
                    </div>

                    {/* Estimates Panel */}
                    {(activeTab === 'BUY' || activeTab === 'SELL') && estimates && (
                        <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-100">
                            <div className="flex items-center gap-2 mb-3 text-gray-700 font-medium text-sm">
                                <Calculator className="h-4 w-4" />
                                <span>Estimated Breakdown</span>
                            </div>
                            <div className="space-y-1 text-sm">
                                <div className="flex justify-between text-gray-500">
                                    <span>Broker Commission</span>
                                    <span>Rs. {estimates.commission.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-gray-500">
                                    <span>SEBON Fee</span>
                                    <span>Rs. {estimates.sebon.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-gray-500">
                                    <span>DP Charge</span>
                                    <span>Rs. {estimates.dp.toFixed(2)}</span>
                                </div>
                                <div className="h-px bg-gray-200 my-2"></div>
                                <div className="flex justify-between font-bold text-gray-900">
                                    <span>Net {activeTab === 'BUY' ? 'Payable' : 'Receivable'}</span>
                                    <span>Rs. {estimates.total.toFixed(2)}</span>
                                </div>
                            </div>
                            <p className="text-xs text-gray-400 mt-2 italic">* Actual calculation may vary slightly on server.</p>
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
