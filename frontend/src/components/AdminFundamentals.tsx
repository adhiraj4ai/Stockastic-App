import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    PieChart,
    Loader2,
    TrendingUp,
    RefreshCw,
    Pencil,
    Check,
    X
} from 'lucide-react';
import { toast } from 'sonner';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AdminFundamentalsProps {
    ticker: string;
    data?: any;
    hasFinancials?: boolean;
}

export default function AdminFundamentals({ ticker, data, hasFinancials = true }: AdminFundamentalsProps) {
    // ... existing state ...
    const [fundamental, setFundamental] = useState<any>(data || null);
    const [loading, setLoading] = useState(!data);
    const [calculating, setCalculating] = useState(false);
    const [editingMetadata, setEditingMetadata] = useState(false);
    const [savingMetadata, setSavingMetadata] = useState(false);
    const [metadataForm, setMetadataForm] = useState({
        listed_date: '',
        market_cap: '',
        free_float_market_cap: '',
        shares_outstanding: '',
        public_shares: ''
    });

    // ... existing fetchFundamental ...
    const fetchFundamental = async () => {
        setLoading(true);
        try {
            // Fallback to stock details endpoint which contains fundamental data
            const res = await api.get(`/api/stocks/details/${ticker}/`);
            if (res.data.fundamental) {
                setFundamental(res.data.fundamental);
            }
        } catch (err: any) {
            console.error('Failed to fetch fundamentals', err);
        } finally {
            setLoading(false);
        }
    };

    // ... existing handleRefresh ...
    const handleRefresh = async () => {
        setCalculating(true);
        try {
            const res = await api.post(`/api/stocks/companies/${ticker}/refresh_fundamentals/`);
            setFundamental(res.data);
            toast.success("Fundamentals recalculated from latest reports");
        } catch (err: any) {
            console.error('Failed to refresh fundamentals', err);
            toast.error("Failed to recalculate metrics");
        } finally {
            setCalculating(false);
        }
    };

    const handleSaveMetadata = async () => {
        setSavingMetadata(true);
        try {
            const res = await api.patch(`/api/stocks/fundamentals/${ticker}/`, metadataForm);
            setFundamental(res.data);
            setEditingMetadata(false);
            toast.success("Company metadata updated successfully");
        } catch (err: any) {
            console.error('Failed to save metadata', err);
            toast.error("Failed to save company metadata");
        } finally {
            setSavingMetadata(false);
        }
    };

    // ... existing useEffect ...
    useEffect(() => {
        if (data) {
            setFundamental(data);
            setLoading(false);
        } else if (ticker) {
            fetchFundamental();
        }
    }, [ticker, data]);

    // Initialize metadata form when fundamental data loads
    useEffect(() => {
        if (fundamental) {
            setMetadataForm({
                listed_date: fundamental.listed_date || '',
                market_cap: fundamental.market_cap || '',
                free_float_market_cap: fundamental.free_float_market_cap || '',
                shares_outstanding: fundamental.shares_outstanding || '',
                public_shares: fundamental.public_shares || ''
            });
        }
    }, [fundamental]);

    // ... existing loading check ...
    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-10 gap-4">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                <p className="text-gray-500 font-medium">Loading metrics...</p>
            </div>
        );
    }

    // ... existing formatters ...
    const formatQuantity = (val: any) => {
        if (val === null || val === undefined) return '-';
        const num = typeof val === 'string' ? parseFloat(val) : val;
        if (isNaN(num)) return '-';
        return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const formatCurrencyShort = (val: any) => {
        if (val === null || val === undefined) return '-';
        const num = typeof val === 'string' ? parseFloat(val) : val;
        if (isNaN(num)) return '-';

        if (num >= 10000000) return `NPR ${(num / 10000000).toFixed(2)} Cr`;
        if (num >= 100000) return `NPR ${(num / 100000).toFixed(2)} Lakh`;
        return `NPR ${num.toLocaleString()}`;
    };

    return (
        <div className="bg-white dark:bg-card border dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden mb-8 transition-colors duration-500">
            {/* Market Summary - Full Width Row */}
            <div className="bg-gray-50/50 dark:bg-slate-800/30 border-b dark:border-slate-800 px-8 py-6">
                <div className="flex items-center mb-6">
                    <div className="flex items-center gap-3">
                        <h3 className="text-xs font-bold text-gray-700 dark:text-slate-300 tracking-tight">Company information</h3>
                        {editingMetadata ? (
                            <div className="flex items-center gap-1">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleSaveMetadata}
                                    disabled={savingMetadata}
                                    className="h-7 w-7 p-0 text-green-600 hover:text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:text-green-300 dark:hover:bg-green-950/30"
                                >
                                    <Check className="w-4 h-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setEditingMetadata(false)}
                                    className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-950/30"
                                >
                                    <X className="w-4 h-4" />
                                </Button>
                            </div>
                        ) : (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setEditingMetadata(true)}
                                className="h-7 w-7 p-0 text-gray-400 hover:bg-accent hover:text-accent-foreground dark:text-slate-500"
                            >
                                <Pencil className="w-3.5 h-3.5" />
                            </Button>
                        )}
                    </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-y-6">
                    <div className="flex flex-col gap-1 min-w-[140px]">
                        <Label className="text-xs font-bold text-gray-400 dark:text-slate-500 tracking-tight">Listed date</Label>
                        {editingMetadata ? (
                            <Input
                                type="date"
                                value={metadataForm.listed_date}
                                onChange={(e) => setMetadataForm(prev => ({ ...prev, listed_date: e.target.value }))}
                                className="h-8 text-sm font-bold dark:bg-slate-800 dark:border-slate-700"
                            />
                        ) : (
                            <span className="text-sm font-bold text-gray-900 dark:text-slate-100">{fundamental?.listed_date || '-'}</span>
                        )}
                    </div>
                    <div className="flex flex-col gap-1 min-w-[160px]">
                        <Label className="text-xs font-bold text-gray-400 dark:text-slate-500 tracking-tight">Market capitalization</Label>
                        {editingMetadata ? (
                            <Input
                                type="number"
                                value={metadataForm.market_cap}
                                onChange={(e) => setMetadataForm(prev => ({ ...prev, market_cap: e.target.value }))}
                                placeholder="NPR"
                                className="h-8 text-sm font-bold dark:bg-slate-800 dark:border-slate-700"
                            />
                        ) : (
                            <span className="text-sm font-bold text-gray-900 dark:text-slate-100">{formatCurrencyShort(fundamental?.market_cap)}</span>
                        )}
                    </div>
                    <div className="flex flex-col gap-1 min-w-[160px]">
                        <Label className="text-xs font-bold text-gray-400 dark:text-slate-500 tracking-tight">Free float market capitalization</Label>
                        {editingMetadata ? (
                            <Input
                                type="number"
                                value={metadataForm.free_float_market_cap}
                                onChange={(e) => setMetadataForm(prev => ({ ...prev, free_float_market_cap: e.target.value }))}
                                placeholder="NPR"
                                className="h-8 text-sm font-bold dark:bg-slate-800 dark:border-slate-700"
                            />
                        ) : (
                            <span className="text-sm font-bold text-gray-900 dark:text-slate-100">{formatCurrencyShort(fundamental?.free_float_market_cap)}</span>
                        )}
                    </div>
                    <div className="flex flex-col gap-1 min-w-[160px]">
                        <Label className="text-xs font-bold text-gray-400 dark:text-slate-500 tracking-tight">Shares outstanding</Label>
                        {editingMetadata ? (
                            <Input
                                type="number"
                                value={metadataForm.shares_outstanding}
                                onChange={(e) => setMetadataForm(prev => ({ ...prev, shares_outstanding: e.target.value }))}
                                placeholder="Number of shares"
                                className="h-8 text-sm font-bold dark:bg-slate-800 dark:border-slate-700"
                            />
                        ) : (
                            <span className="text-sm font-bold text-gray-900 dark:text-slate-100">{formatQuantity(fundamental?.shares_outstanding)}</span>
                        )}
                    </div>
                    <div className="flex flex-col gap-1 min-w-[160px]">
                        <Label className="text-xs font-bold text-gray-400 dark:text-slate-500 tracking-tight">Public shares</Label>
                        {editingMetadata ? (
                            <Input
                                type="number"
                                value={metadataForm.public_shares}
                                onChange={(e) => setMetadataForm(prev => ({ ...prev, public_shares: e.target.value }))}
                                placeholder="Number of shares"
                                className="h-8 text-sm font-bold dark:bg-slate-800 dark:border-slate-700"
                            />
                        ) : (
                            <span className="text-sm font-bold text-gray-900 dark:text-slate-100">{formatQuantity(fundamental?.public_shares)}</span>
                        )}
                    </div>
                </div>
            </div>

            <div className="p-8">
                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-12 gap-y-10">
                    {/* Valuation Metrics */}
                    <div className="space-y-6">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-1 h-5 bg-primary rounded-full" />
                            <h3 className="text-xs font-bold text-gray-900 dark:text-slate-100 tracking-tight">Valuation</h3>
                        </div>
                        <div className="space-y-4">
                            {[
                                { label: 'P/E Ratio (Audited)', value: fundamental?.pe_ratio },
                                { label: 'P/E Ratio (Unaudited)', value: fundamental?.pe_ratio_unaudited },
                                { label: 'P/B Ratio', value: fundamental?.price_to_book },
                                { label: 'PEG Ratio', value: fundamental?.peg_ratio },
                                { label: 'Price to Sales', value: fundamental?.price_to_sales },
                                { label: 'Graham Diff', value: fundamental?.graham_number_diff, suffix: '%' },
                            ].map((item, idx) => (
                                <div key={idx} className="flex justify-between items-center group py-0.5">
                                    <Label className="text-[10px] font-bold text-gray-400 dark:text-slate-500 group-hover:text-gray-600 dark:group-hover:text-slate-400 transition-colors uppercase tracking-tight">{item.label}</Label>
                                    <span className="text-sm font-bold text-gray-900 dark:text-slate-100 tabular-nums">
                                        {item.value || '-'}{item.value && item.suffix}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Return & Efficiency */}
                    <div className="space-y-6">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-1 h-5 bg-green-500 rounded-full" />
                            <h3 className="text-xs font-bold text-gray-900 dark:text-slate-100 tracking-tight">Return</h3>
                        </div>
                        <div className="space-y-4">
                            {[
                                { label: 'ROE (TTM)', value: fundamental?.ro_equity, color: 'text-green-600 dark:text-emerald-400' },
                                { label: 'ROA (TTM)', value: fundamental?.ro_assets, color: 'text-green-600 dark:text-emerald-400' },
                                { label: 'Dividend Yield', value: fundamental?.dividend_yield, color: 'text-green-600 dark:text-emerald-400' },
                                { label: 'Payout Ratio', value: fundamental?.dividend_payout_ratio },
                            ].map((item, idx) => (
                                <div key={idx} className="flex justify-between items-center group py-0.5">
                                    <Label className="text-xs font-semibold text-gray-400 dark:text-slate-500 group-hover:text-gray-600 dark:group-hover:text-slate-400 transition-colors uppercase tracking-tight">{item.label}</Label>
                                    <span className={`text-sm font-bold tabular-nums ${item.color || 'text-gray-900 dark:text-slate-100'}`}>
                                        {item.value ? `${item.value}%` : '-'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Growth & Performance */}
                    <div className="space-y-6">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-1 h-5 bg-primary rounded-full" />
                            <h3 className="text-xs font-bold text-gray-900 dark:text-slate-100 tracking-tight">Growth & performance</h3>
                        </div>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center group py-0.5">
                                <Label className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-tight">EPS (Audited)</Label>
                                <span className="text-sm font-bold text-gray-900 dark:text-slate-100 tabular-nums">{fundamental?.eps || '-'}</span>
                            </div>
                            <div className="flex justify-between items-center group py-0.5">
                                <Label className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-tight">EPS (Unaudited)</Label>
                                <span className="text-sm font-bold text-gray-900 dark:text-slate-100 tabular-nums">{fundamental?.eps_unaudited || '-'}</span>
                            </div>
                            <div className="flex justify-between items-center group py-0.5">
                                <Label className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-tight">Book Value (Audited)</Label>
                                <span className="text-sm font-bold text-gray-900 dark:text-slate-100 tabular-nums">{fundamental?.book_value || '-'}</span>
                            </div>
                            <div className="flex justify-between items-center group py-0.5">
                                <Label className="text-[10px] font-bold text-gray-400 dark:text-slate-500 uppercase tracking-tight">Book Value (Unaudited)</Label>
                                <span className="text-sm font-bold text-gray-900 dark:text-slate-100 tabular-nums">{fundamental?.book_value_unaudited || '-'}</span>
                            </div>
                            <div className="flex justify-between items-center group py-0.5">
                                <Label className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-tight">EPS Growth (QoQ)</Label>
                                <span className={`text-sm font-bold tabular-nums ${fundamental?.qoq_earnings_growth >= 0 ? 'text-green-600 dark:text-emerald-400' : 'text-red-500 dark:text-rose-400'}`}>
                                    {fundamental?.qoq_earnings_growth ? `${fundamental.qoq_earnings_growth}%` : '-'}
                                </span>
                            </div>
                            <div className="flex justify-between items-center group py-0.5">
                                <Label className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-tight">EPS Growth (YoY)</Label>
                                <span className={`text-sm font-bold tabular-nums ${fundamental?.yoy_earnings_growth >= 0 ? 'text-green-600 dark:text-emerald-400' : 'text-red-500 dark:text-rose-400'}`}>
                                    {fundamental?.yoy_earnings_growth ? `${fundamental.yoy_earnings_growth}%` : '-'}
                                </span>
                            </div>
                            <div className="flex justify-between items-center group py-0.5">
                                <Label className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-tight">Debt to Equity</Label>
                                <span className="text-sm font-bold text-gray-900 dark:text-slate-100 tabular-nums">{fundamental?.debt_to_equity || '-'}</span>
                            </div>
                        </div>
                    </div>

                    {/* Status & Info */}
                    <div className="space-y-6">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-1 h-5 bg-gray-400 dark:bg-slate-600 rounded-full" />
                            <h3 className="text-xs font-bold text-gray-900 dark:text-slate-100 tracking-tight">Insights</h3>
                        </div>
                        <div className="bg-gray-50/50 dark:bg-slate-800/30 rounded-xl p-5 border border-dashed border-gray-200 dark:border-slate-700">
                            <p className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed font-medium mb-4">
                                {hasFinancials
                                    ? "Fundamentals are automatically derived from the latest verified financial reports and market prices."
                                    : "No financial reports found. Add reports below to enable automatic metric calculation."
                                }
                            </p>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleRefresh}
                                disabled={calculating || !hasFinancials}
                                className="w-full text-xs font-bold gap-2 dark:border-slate-700 dark:text-slate-300"
                            >
                                <RefreshCw className={`w-3.5 h-3.5 ${calculating ? 'animate-spin' : ''}`} />
                                {calculating ? 'Recalculating...' : hasFinancials ? 'Refresh Metrics' : 'Add Reports to Enable'}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
