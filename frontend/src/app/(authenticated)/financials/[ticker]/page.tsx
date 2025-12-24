'use client';

import { use, useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
// Tabs imports removed
import AdminFinancials from '@/components/AdminFinancials';
import AdminFundamentals from '@/components/AdminFundamentals';
import api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Building2, ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

interface CompanyDetails {
    symbol: string;
    name: string;
    sector: string;
    status: string;
}

export default function AdminTickerPage({ params }: { params: Promise<{ ticker: string }> }) {
    const { ticker } = use(params);
    const router = useRouter();
    const [company, setCompany] = useState<CompanyDetails | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDetails = async () => {
            try {
                // Fetching from existing list endpoint but filtering or detail endpoint if available
                // Ideally we have a detail endpoint. Checking existing code...
                // StockDetailPage uses /api/stocks/details/{ticker}/
                const res = await api.get(`/api/stocks/details/${ticker}/`);

                if (res.data.company) {
                    setCompany({
                        symbol: res.data.company.symbol,
                        name: res.data.company.name,
                        sector: res.data.company.sector,
                        status: res.data.company.status
                    });
                } else if (res.data && res.data.fundamental) {
                    setCompany({
                        symbol: res.data.fundamental.ticker,
                        name: res.data.fundamental.company_name,
                        sector: res.data.fundamental.sector,
                        status: 'Active'
                    });
                } else {
                    // Fallback if detail structure is different or missing
                    setCompany({
                        symbol: ticker,
                        name: 'Unknown Company',
                        sector: 'Unknown',
                        status: 'Unknown'
                    });
                }
            } catch (error) {
                console.error('Failed to fetch company details', error);
            } finally {
                setLoading(false);
            }
        };
        fetchDetails();
    }, [ticker]);

    if (loading) {
        return (
            <DashboardLayout title={`Manage ${ticker}`}>
                <div className="flex h-[50vh] items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout title={`Manage ${ticker}`}>
            <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
                {/* Header Section */}
                <div className="flex items-start justify-between pb-2">
                    <div>
                        <h1 className="text-3xl font-black text-gray-900 tracking-tight mb-2 flex items-center gap-3">
                            <Building2 className="w-8 h-8 text-blue-500" />
                            {company?.symbol}
                        </h1>
                        <p className="text-lg text-gray-600 font-medium pl-11">{company?.name}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                        <Badge variant="secondary" className="text-xs font-bold px-3 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100">
                            {company?.sector}
                        </Badge>
                    </div>
                </div>

                {/* Company Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6 py-2">
                    <div className="space-y-1">
                        <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Listed Date</p>
                        <p className="font-semibold text-gray-900">Jan 1st, 2019</p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Market Cap</p>
                        <p className="font-semibold text-gray-900">NPR 3.34B</p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Free-Float M.Cap</p>
                        <p className="font-semibold text-gray-900">NPR 1.33B</p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Shares Outstanding</p>
                        <p className="font-semibold text-gray-900">3,671,434</p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Public Shares</p>
                        <p className="font-semibold text-gray-900">1,468,574</p>
                    </div>
                </div>

                {/* Vertical Stack Layout */}
                <div className="space-y-6">
                    {/* Section 1: Fundamentals */}
                    <div id="fundamentals" className="scroll-mt-6">
                        <AdminFundamentals ticker={ticker} />
                    </div>

                    {/* Section 2: Financial Reports */}
                    <div id="financials" className="scroll-mt-6">
                        <div>
                            <AdminFinancials ticker={ticker} />
                        </div>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
