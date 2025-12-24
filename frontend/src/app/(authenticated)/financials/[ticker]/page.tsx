'use client';

import { use, useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
// Tabs imports removed
import AdminFinancials from '@/components/AdminFinancials';
import AdminFundamentals from '@/components/AdminFundamentals';
import api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

interface CompanyDetails {
    symbol: string;
    name: string;
    sector: string;
    status: string;
}

export default function AdminTickerPage({ params }: { params: Promise<{ ticker: string }> }) {
    const { ticker } = use(params);
    const [company, setCompany] = useState<CompanyDetails | null>(null);
    const [fundamental, setFundamental] = useState<any>(null);
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
                }

                if (res.data.fundamental) {
                    setFundamental(res.data.fundamental);
                    // Fallback to fundamental if company missing (legacy support)
                    if (!res.data.company) {
                        setCompany({
                            symbol: res.data.fundamental.ticker,
                            name: res.data.fundamental.company_name,
                            sector: res.data.fundamental.sector,
                            status: 'Active'
                        });
                    }
                } else if (!res.data.company) {
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
        <DashboardLayout
            title={
                <div className="flex items-center gap-3">
                    {company?.symbol}
                    <Badge variant="secondary" className="text-xs font-bold px-2 py-0.5 bg-blue-50 text-blue-700 border-none">
                        {company?.sector}
                    </Badge>
                </div>
            }
            subtitle={company?.name}
        >
            <div className="max-w-[1600px] mx-auto space-y-6">

                {/* Vertical Stack Layout */}
                <div className="space-y-6">
                    {/* Section 1: Fundamentals */}
                    <div id="fundamentals" className="scroll-mt-6">
                        <AdminFundamentals ticker={ticker} data={fundamental} />
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
