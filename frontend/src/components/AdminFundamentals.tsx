'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    PieChart,
    Loader2,
    TrendingUp,
    RefreshCw
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

    // ... existing useEffect ...
    useEffect(() => {
        if (data) {
            setFundamental(data);
            setLoading(false);
        } else if (ticker) {
            fetchFundamental();
        }
    }, [ticker, data]);

    // ... existing loading check ...
    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-10 gap-4">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
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
        <div className="bg-white border rounded-2xl shadow-sm overflow-hidden mb-8">
            {/* Market Summary - Full Width Row */}
            <div className="bg-gray-50/50 border-b px-8 py-6">
                <div className="flex flex-wrap items-center justify-between gap-y-6">
                    <div className="flex flex-col gap-1 min-w-[140px]">
                        <Label className="text-xs font-black uppercase tracking-wider text-gray-400">Listed Date</Label>
                        <span className="text-sm font-bold text-gray-900">{fundamental?.listed_date || '2019-01-01'}</span>
                    </div>
                    <div className="flex flex-col gap-1 min-w-[160px]">
                        <Label className="text-xs font-black uppercase tracking-wider text-gray-400">Market Capitalization</Label>
                        <span className="text-sm font-bold text-gray-900">{formatCurrencyShort(fundamental?.market_cap)}</span>
                    </div>
                    <div className="flex flex-col gap-1 min-w-[160px]">
                        <Label className="text-xs font-black uppercase tracking-wider text-gray-400">Free Float Market Capitalization</Label>
                        <span className="text-sm font-bold text-gray-900">{formatCurrencyShort(fundamental?.free_float_market_cap)}</span>
                    </div>
                    <div className="flex flex-col gap-1 min-w-[160px]">
                        <Label className="text-xs font-black uppercase tracking-wider text-gray-400">Shares Outstanding</Label>
                        <span className="text-sm font-bold text-gray-900">{formatQuantity(fundamental?.shares_outstanding)}</span>
                    </div>
                    <div className="flex flex-col gap-1 min-w-[160px]">
                        <Label className="text-xs font-black uppercase tracking-wider text-gray-400">Public Shares</Label>
                        <span className="text-sm font-bold text-gray-900">{formatQuantity(fundamental?.public_shares)}</span>
                    </div>
                </div>
            </div>

            <div className="p-8">
                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-12 gap-y-10">
                    {/* Valuation Metrics */}
                    <div className="space-y-6">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-1 h-5 bg-blue-500 rounded-full" />
                            <h3 className="text-xs font-black uppercase text-gray-900 tracking-wider">Valuation</h3>
                        </div>
                        <div className="space-y-4">
                            {[
                                { label: 'P/E Ratio (TTM)', value: fundamental?.pe_ratio },
                                { label: 'P/B Ratio', value: fundamental?.price_to_book },
                                { label: 'PEG Ratio', value: fundamental?.peg_ratio },
                                { label: 'Price to Sales', value: fundamental?.price_to_sales },
                                { label: 'Graham Diff', value: fundamental?.graham_number_diff, suffix: '%' },
                            ].map((item, idx) => (
                                <div key={idx} className="flex justify-between items-center group py-0.5">
                                    <Label className="text-xs font-semibold text-gray-400 group-hover:text-gray-600 transition-colors uppercase tracking-tight">{item.label}</Label>
                                    <span className="text-sm font-bold text-gray-900 tabular-nums">
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
                            <h3 className="text-xs font-black uppercase text-gray-900 tracking-wider">Return</h3>
                        </div>
                        <div className="space-y-4">
                            {[
                                { label: 'ROE (TTM)', value: fundamental?.ro_equity, color: 'text-green-600' },
                                { label: 'ROA (TTM)', value: fundamental?.ro_assets, color: 'text-green-600' },
                                { label: 'Dividend Yield', value: fundamental?.dividend_yield, color: 'text-green-600' },
                                { label: 'Payout Ratio', value: fundamental?.dividend_payout_ratio },
                            ].map((item, idx) => (
                                <div key={idx} className="flex justify-between items-center group py-0.5">
                                    <Label className="text-xs font-semibold text-gray-400 group-hover:text-gray-600 transition-colors uppercase tracking-tight">{item.label}</Label>
                                    <span className={`text-sm font-bold tabular-nums ${item.color || 'text-gray-900'}`}>
                                        {item.value ? `${item.value}%` : '-'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Growth & Performance */}
                    <div className="space-y-6">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-1 h-5 bg-purple-500 rounded-full" />
                            <h3 className="text-xs font-black uppercase text-gray-900 tracking-wider">Growth & Performance</h3>
                        </div>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center group py-0.5">
                                <Label className="text-xs font-semibold text-gray-400 uppercase tracking-tight">EPS (TTM)</Label>
                                <span className="text-sm font-bold text-gray-900 tabular-nums">{fundamental?.eps || '-'}</span>
                            </div>
                            <div className="flex justify-between items-center group py-0.5">
                                <Label className="text-xs font-semibold text-gray-400 uppercase tracking-tight">Book Value</Label>
                                <span className="text-sm font-bold text-gray-900 tabular-nums">{fundamental?.book_value || '-'}</span>
                            </div>
                            <div className="flex justify-between items-center group py-0.5">
                                <Label className="text-xs font-semibold text-gray-400 uppercase tracking-tight">EPS Growth (QoQ)</Label>
                                <span className={`text-sm font-bold tabular-nums ${fundamental?.qoq_earnings_growth >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                    {fundamental?.qoq_earnings_growth ? `${fundamental.qoq_earnings_growth}%` : '-'}
                                </span>
                            </div>
                            <div className="flex justify-between items-center group py-0.5">
                                <Label className="text-xs font-semibold text-gray-400 uppercase tracking-tight">EPS Growth (YoY)</Label>
                                <span className={`text-sm font-bold tabular-nums ${fundamental?.yoy_earnings_growth >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                    {fundamental?.yoy_earnings_growth ? `${fundamental.yoy_earnings_growth}%` : '-'}
                                </span>
                            </div>
                            <div className="flex justify-between items-center group py-0.5">
                                <Label className="text-xs font-semibold text-gray-400 uppercase tracking-tight">Debt to Equity</Label>
                                <span className="text-sm font-bold text-gray-900 tabular-nums">{fundamental?.debt_to_equity || '-'}</span>
                            </div>
                        </div>
                    </div>

                    {/* Status & Info */}
                    <div className="space-y-6">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-1 h-5 bg-gray-400 rounded-full" />
                            <h3 className="text-xs font-black uppercase text-gray-900 tracking-wider">Insights</h3>
                        </div>
                        <div className="bg-gray-50/50 rounded-xl p-5 border border-dashed border-gray-200">
                            <p className="text-xs text-gray-500 leading-relaxed font-medium mb-4">
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
                                className="w-full text-xs font-bold gap-2"
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
