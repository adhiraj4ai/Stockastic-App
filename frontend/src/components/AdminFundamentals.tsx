'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Save,
    RefreshCcw,
    PieChart,
    Loader2,
    TrendingUp,
    Hash,
    DollarSign,
    Zap
} from 'lucide-react';
import { toast } from 'sonner';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AdminFundamentalsProps {
    ticker: string;
}

export default function AdminFundamentals({ ticker }: AdminFundamentalsProps) {
    const [fundamental, setFundamental] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const fetchFundamental = async () => {
        setLoading(true);
        try {
            const res = await api.get(`/api/stocks/stock-fundamentals/${ticker}/`);
            setFundamental(res.data);
        } catch (err: any) {
            if (err.response?.status !== 404) {
                console.error('Failed to fetch fundamentals', err);
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (ticker) fetchFundamental();
    }, [ticker]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-10 gap-4">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                <p className="text-gray-500 font-medium">Loading metrics...</p>
            </div>
        );
    }

    // Helper to format currency/numbers
    const formatCurrency = (val: number | null | undefined) => {
        if (val === null || val === undefined) return '-';
        return val.toLocaleString('en-NP', { style: 'currency', currency: 'NPR' });
    };

    const formatNumber = (val: number | null | undefined) => {
        if (val === null || val === undefined) return '-';
        return val.toLocaleString('en-US');
    };

    return (
        <div className="bg-white border rounded-xl shadow-sm overflow-hidden mb-6">
            <div className="border-b bg-gray-50/50 p-6 flex justify-between items-center">
                <h3 className="text-xl font-bold flex items-center gap-2 text-gray-800">
                    <TrendingUp className="w-5 h-5 text-blue-600" />
                    Key Fundamentals
                </h3>
                <div className="text-xs text-gray-500 font-medium bg-gray-100 px-3 py-1 rounded-full">
                    Latest Snapshot
                </div>
            </div>

            <div className="p-8">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
                    {/* Valuation Metrics */}
                    <div className="space-y-1">
                        <Label className="text-xs font-bold uppercase text-gray-400 tracking-wider">P/E Ratio</Label>
                        <div className="text-2xl font-black text-gray-900 flex items-baseline gap-1">
                            {fundamental?.pe_ratio || '-'}
                            <span className="text-xs font-medium text-gray-400">x</span>
                        </div>
                    </div>

                    <div className="space-y-1">
                        <Label className="text-xs font-bold uppercase text-gray-400 tracking-wider">Earnings Per Share</Label>
                        <div className="text-2xl font-black text-gray-900">
                            {fundamental?.eps ? `Rs. ${fundamental.eps}` : '-'}
                        </div>
                    </div>

                    <div className="space-y-1">
                        <Label className="text-xs font-bold uppercase text-gray-400 tracking-wider">Book Value</Label>
                        <div className="text-2xl font-black text-gray-900">
                            {fundamental?.book_value ? `Rs. ${fundamental.book_value}` : '-'}
                        </div>
                    </div>

                    <div className="space-y-1">
                        <Label className="text-xs font-bold uppercase text-gray-400 tracking-wider">Dividend Yield</Label>
                        <div className="text-2xl font-black text-green-600">
                            {fundamental?.dividend_yield ? `${fundamental.dividend_yield}%` : '-'}
                        </div>
                    </div>
                </div>

                <div className="my-8 border-t border-dashed" />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="space-y-1">
                        <Label className="text-xs font-bold uppercase text-gray-400 tracking-wider flex items-center gap-1">
                            <DollarSign className="w-3 h-3" /> Market Cap
                        </Label>
                        <div className="text-xl font-bold text-gray-900">
                            {formatCurrency(fundamental?.market_cap)}
                        </div>
                    </div>

                    <div className="space-y-1">
                        <Label className="text-xs font-bold uppercase text-gray-400 tracking-wider flex items-center gap-1">
                            <Hash className="w-3 h-3" /> Shares Outstanding
                        </Label>
                        <div className="text-xl font-bold text-gray-900">
                            {formatNumber(fundamental?.shares_outstanding)}
                        </div>
                    </div>

                    {!fundamental && (
                        <div className="md:col-span-3 bg-blue-50 border border-blue-100 rounded-lg p-4 flex items-center gap-3">
                            <Zap className="w-5 h-5 text-blue-500" />
                            <p className="text-sm text-blue-700">
                                Global fundamental data has not been calculated for this company yet.
                                It will be derived automatically when financial reports are added.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
