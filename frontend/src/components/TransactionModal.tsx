'use client';

import { useState, useEffect } from 'react';
import { X, Calculator, ShieldAlert, Calendar } from 'lucide-react';
import api from '@/lib/api';
import { CompanySelect } from './CompanySelect';
import { formatRupees } from '@/lib/formatters';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { DatePicker } from './ui/DatePicker';
import { format } from 'date-fns';

export interface PortfolioAccount {
    id: number;
    name: string;
    balance: string;
    default_risk_percentage: number;
    account_type: string;
    is_default?: boolean;
}

interface TransactionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    defaultTicker?: string;
    defaultType?: string;
    defaultAccount?: string;
    accounts?: PortfolioAccount[];
    // If editing, receive the transaction object
    transactionToEdit?: any;
}

type TransactionType = 'BUY' | 'SELL' | 'SHORT_SELL' | 'BUY_TO_COVER' | 'BONUS' | 'DIVIDEND';

export default function TransactionModal({
    isOpen,
    onClose,
    onSuccess,
    defaultTicker = '',
    defaultType = 'BUY',
    defaultAccount = '',
    accounts = [],
    transactionToEdit = null
}: TransactionModalProps) {
    const [activeTab, setActiveTab] = useState<TransactionType>(defaultType as TransactionType);
    const [formData, setFormData] = useState({
        ticker: '',
        transaction_date: new Date(),
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
                const res = await api.get('/api/users/me/');
                if (res.data.username === 'ashmi') {
                    setIsAshmi(true);
                    // Auto-select first account ONLY if not explicitly provided by props
                    if (accounts.length > 0 && !formData.account && !defaultAccount) {
                        setFormData(prev => ({ ...prev, account: accounts[0].id.toString() }));
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

        if (activeTab === 'BUY' || activeTab === 'BUY_TO_COVER') {
            total = amount + commission + sebon + dp;
        } else if (activeTab === 'SELL' || activeTab === 'SHORT_SELL') {
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
                    transaction_date: new Date(transactionToEdit.transaction_date),
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
                    transaction_date: new Date(),
                    quantity: '',
                    rate: '',
                    reason: '',
                    account: defaultAccount || (accounts.length > 0 ? accounts[0].id.toString() : '')
                }));
                if (defaultType) setActiveTab(defaultType as TransactionType);
            }
        }
    }, [isOpen, defaultTicker, defaultType, defaultAccount, accounts, transactionToEdit]);

    useEffect(() => {
        if (activeTab === 'BUY' || activeTab === 'SELL' || activeTab === 'SHORT_SELL' || activeTab === 'BUY_TO_COVER') {
            calculateEstimates();
        } else {
            setEstimates(null);
        }
    }, [formData.quantity, formData.rate, activeTab]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const payload: any = {
                ...formData,
                transaction_type: activeTab,
                transaction_date: formData.transaction_date.toISOString() // Send full ISO
            };

            // Only send account if selected (API handles null as default/no account)
            if (formData.account) {
                payload.account = formData.account;
            }

            if (transactionToEdit) {
                await api.put(`/api/stocks/transactions/${transactionToEdit.id}/`, payload);
            } else {
                await api.post('/api/stocks/transactions/', payload);
            }

            onSuccess();
            onClose();
            // Reset form (keep account?)
            if (!transactionToEdit) {
                setFormData(prev => ({
                    ...prev,
                    ticker: '',
                    transaction_date: new Date(),
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
            <div className="bg-white dark:bg-card rounded-xl shadow-sm w-full max-w-lg overflow-hidden transform transition-all scale-100">

                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b border-gray-100 dark:border-slate-800">
                    <h2 className="text-xl font-bold text-gray-800 dark:text-slate-100">New Transaction</h2>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-accent hover:text-accent-foreground transition-colors">
                        <X className="h-5 w-5 text-gray-500 dark:text-slate-400" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-card overflow-x-auto custom-scrollbar">
                    {(() => {
                        let types: TransactionType[] = ['BUY', 'SELL', 'BONUS', 'DIVIDEND'];

                        // Check if selected account is PAPER
                        const selectedAcc = accounts.find(a => a.id.toString() === formData.account);
                        if (selectedAcc && selectedAcc.account_type === 'PAPER') {
                            types = ['BUY', 'SELL', 'SHORT_SELL', 'BUY_TO_COVER', 'BONUS', 'DIVIDEND'];
                        }

                        return types.map((type) => (
                            <button
                                key={type}
                                onClick={() => setActiveTab(type)}
                                className={`flex-1 py-3 px-4 min-w-[100px] text-sm font-medium transition-colors border-b-2 whitespace-nowrap tracking-tight ${activeTab === type
                                    ? type === 'BUY' || type === 'BUY_TO_COVER' ? 'border-green-500 text-green-600 dark:text-green-400 bg-green-50/50 dark:bg-green-900/20'
                                        : type === 'SELL' || type === 'SHORT_SELL' ? 'border-red-500 text-red-600 dark:text-red-400 bg-red-50/50 dark:bg-red-900/20'
                                            : 'border-primary text-primary bg-primary/10'
                                    : 'border-transparent text-gray-500 dark:text-slate-400 hover:bg-accent hover:text-accent-foreground'
                                    }`}
                            >
                                {type === 'BONUS' ? 'Bonus share' : type === 'DIVIDEND' ? 'Cash dividend' : type === 'SHORT_SELL' ? 'Short sell' : type === 'BUY_TO_COVER' ? 'Buy to cover' : type.charAt(0) + type.slice(1).toLowerCase()}
                            </button>
                        ))
                    })()}
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {/* Layout: Account (Full Width) */}
                    <div className="space-y-4">
                        {accounts.length > 0 ? (
                            <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-border dark:border-slate-800">
                                <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 tracking-tight mb-1.5 block">Portfolio account</label>
                                <Select
                                    value={formData.account ? formData.account.toString() : ""}
                                    onValueChange={(value) => setFormData({ ...formData, account: value })}
                                >
                                    <SelectTrigger className="w-full bg-white dark:bg-card border-gray-200 dark:border-slate-700 h-10">
                                        <SelectValue placeholder="Select Portfolio Account" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {accounts.map(acc => (
                                            <SelectItem key={acc.id} value={acc.id.toString()}>
                                                {acc.name} {acc.account_type === 'PAPER' ? '(Paper Trading)' : '(Live)'} <span className="text-xs text-gray-400">({formatRupees(acc.balance)})</span>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        ) : (
                            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm flex items-center gap-2">
                                <ShieldAlert size={16} />
                                <div>
                                    <strong>No Account Found!</strong>
                                    <p className="text-xs mt-0.5">Please create a portfolio account first.</p>
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 tracking-tight">Ticker symbol</label>
                                <CompanySelect
                                    value={formData.ticker}
                                    onChange={(val) => setFormData({ ...formData, ticker: val })}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 tracking-tight">Transaction date</label>
                                <DatePicker
                                    date={formData.transaction_date}
                                    setDate={(date) => date && setFormData({ ...formData, transaction_date: date })}
                                    className="h-10"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 tracking-tight">Quantity (Units)</label>
                                <input
                                    type="number"
                                    required
                                    min="1"
                                    placeholder="e.g. 100"
                                    className="w-full px-4 py-2 bg-white dark:bg-card border border-gray-200 dark:border-slate-700 rounded-lg focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring outline-none transition-all dark:text-slate-100 font-bold h-10"
                                    value={formData.quantity}
                                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 tracking-tight">
                                    {activeTab === 'BONUS' ? 'Paid Up Value' : activeTab === 'DIVIDEND' ? 'Amount (Rs)' : 'Rate (Rs/Share)'}
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-xs">Rs.</span>
                                    <input
                                        type="number"
                                        required
                                        step="0.01"
                                        placeholder="0.00"
                                        className="w-full pl-10 pr-4 py-2 bg-white dark:bg-card border border-gray-200 dark:border-slate-700 rounded-lg focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring outline-none transition-all dark:text-slate-100 font-bold h-10"
                                        value={formData.rate}
                                        onChange={(e) => setFormData({ ...formData, rate: e.target.value })}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Reason Dropdown (Only for SELL) */}
                    {activeTab === 'SELL' && (
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-gray-500 tracking-tight">Reason for selling</label>
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
                    {(activeTab === 'BUY' || activeTab === 'SELL' || activeTab === 'SHORT_SELL' || activeTab === 'BUY_TO_COVER') && estimates && (
                        <div className="mt-4 p-4 bg-gray-50 dark:bg-slate-800/50 rounded-lg border border-gray-100 dark:border-slate-700">
                            <div className="flex items-center gap-2 mb-3 text-gray-700 dark:text-slate-200 font-medium text-sm">
                                <Calculator className="h-4 w-4" />
                                <span className="text-xs tracking-tight font-bold">Estimated breakdown</span>
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
                                    <span>Net {activeTab === 'BUY' || activeTab === 'BUY_TO_COVER' ? 'Payable' : 'Receivable'}</span>
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
                        className={`w-full py-3 rounded-lg font-bold text-white transition-transform active:scale-95 ${activeTab === 'BUY' || activeTab === 'BUY_TO_COVER' ? 'bg-green-600 hover:bg-green-700'
                            : activeTab === 'SELL' || activeTab === 'SHORT_SELL' ? 'bg-red-600 hover:bg-red-700'
                                : 'bg-primary hover:bg-primary/90'
                            } ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
                    >
                        {loading ? 'Processing...' : `Confirm ${activeTab.replace(/_/g, ' ')}`}
                    </button>
                </form>
            </div>
        </div>
    );
}
