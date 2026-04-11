'use client';

import { use, useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
// Tabs imports removed
import AdminFinancials from '@/components/AdminFinancials';
import AdminFundamentals from '@/components/AdminFundamentals';
import api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface CompanyDetails {
    symbol: string;
    name: string;
    sector: string;
    status: string;
}

export default function AdminTickerPage({ params }: { params: Promise<{ ticker: string }> }) {
    const router = useRouter();
    const { ticker } = use(params);
    const [company, setCompany] = useState<CompanyDetails | null>(null);
    const [fundamental, setFundamental] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [hasFinancials, setHasFinancials] = useState<boolean>(false);

    useEffect(() => {
        const fetchDetails = async () => {
            try {
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
                <div className="flex items-center gap-6 py-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push('/admin/financials')}
                        className="rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 h-10 w-10 p-0 text-gray-400 dark:text-slate-500"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div className="flex flex-col">
                        <div className="flex items-center gap-3">
                            <span className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight select-none">
                                {ticker}
                            </span>
                            <Badge variant="secondary" className="bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-900/30 font-bold px-2 py-0.5 text-[10px] uppercase">
                                {company?.sector || 'Unknown Sector'}
                            </Badge>
                        </div>
                        <p className="text-slate-400 dark:text-slate-500 font-medium text-xs">
                            {company?.name || 'Company Details'}
                        </p>
                    </div>
                </div>
            }
            subtitle={null}
        >
            <div className="max-w-[1600px] mx-auto space-y-6">

                {/* Vertical Stack Layout */}
                <div className="space-y-6">
                    {/* Section 1: Fundamentals */}
                    <div id="fundamentals" className="scroll-mt-6">
                        <AdminFundamentals
                            ticker={ticker}
                            data={fundamental}
                            hasFinancials={hasFinancials}
                        />
                    </div>

                    {/* Section 2: Financial Reports */}
                    <div id="financials" className="scroll-mt-6">
                        <div>
                            <AdminFinancials
                                ticker={ticker}
                                onHasReports={setHasFinancials}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
