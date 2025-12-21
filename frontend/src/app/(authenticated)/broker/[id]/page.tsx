'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import api from '@/lib/api';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Loader2, ArrowLeft, PieChart as PieChartIcon, Briefcase, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';

interface BrokerHolding {
    symbol: string;
    name: string;
    sector: string;
    quantity: number;
    current_price: number;
    value: number;
    latest_price_date: string;
}

interface BrokerProfile {
    broker_id: string;
    total_value: number;
    holdings: BrokerHolding[];
}

export default function BrokerPage() {
    const params = useParams();
    const id = params.id as string;

    const [profile, setProfile] = useState<BrokerProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const res = await api.get('/api/stocks/broker_portfolio/', {
                    params: { broker_id: id }
                });
                setProfile(res.data);
            } catch (err) {
                console.error(err);
                setError('Failed to load broker profile');
            } finally {
                setLoading(false);
            }
        };
        if (id) fetchProfile();
    }, [id]);

    if (loading) {
        return (
            <DashboardLayout title={`Broker ${id}`}>
                <div className="flex flex-col items-center justify-center p-20 space-y-4">
                    <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                    <p className="text-gray-500 font-medium">Loading broker portfolio...</p>
                </div>
            </DashboardLayout>
        );
    }

    if (error || !profile) {
        return (
            <DashboardLayout title="Error">
                <div className="p-10 text-center">
                    <h2 className="text-xl font-bold text-red-600">{error || 'Broker not found'}</h2>
                    <Link href="/accumulation">
                        <Button className="mt-4" variant="outline">
                            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Accumulation
                        </Button>
                    </Link>
                </div>
            </DashboardLayout>
        );
    }

    // Prepare Chart Data (Sector Allocation)
    const sectorMap: Record<string, number> = {};
    profile.holdings.forEach(h => {
        sectorMap[h.sector] = (sectorMap[h.sector] || 0) + h.value;
    });

    const chartData = Object.entries(sectorMap).map(([name, value]) => ({ name, value }));
    const COLORS = [
        '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
        '#ec4899', '#6366f1', '#14b8a6', '#f97316', '#84cc16'
    ];

    return (
        <DashboardLayout title={`Broker #${id} Profile`}>
            <div className="space-y-6 animate-in fade-in duration-500">
                <div className="flex items-center gap-4">
                    <Link href="/accumulation">
                        <Button variant="ghost" size="sm" className="text-gray-500 hover:text-gray-900">
                            <ArrowLeft className="w-4 h-4 mr-1" /> Back
                        </Button>
                    </Link>
                    <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                        <Briefcase className="w-6 h-6 text-blue-600" />
                        Broker <span className="text-blue-600">#{id}</span>
                    </h1>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Stats Card */}
                    <Card className="md:col-span-2 bg-gradient-to-br from-blue-600 to-blue-800 text-white border-none shadow-xl">
                        <CardHeader>
                            <CardTitle className="text-blue-100 font-medium text-sm uppercase tracking-wider">Estimated Portfolio Value</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-4xl font-black font-mono">
                                Rs. {(profile.total_value / 10000000).toFixed(2)} Cr
                            </div>
                            <p className="text-blue-200 text-sm mt-2 font-medium">
                                Across {profile.holdings.length} companies
                            </p>
                        </CardContent>
                    </Card>

                    {/* Sector Chart */}
                    <Card className="bg-white border-none shadow-lg">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-bold text-gray-500 uppercase flex items-center gap-2">
                                <PieChartIcon className="w-4 h-4" /> Sector Allocation
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="h-[200px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={chartData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {chartData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip formatter={(value: number) => `Rs. ${(value / 100000).toFixed(2)} L`} />
                                </PieChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>
                </div>

                {/* Holdings Table */}
                <Card className="border-none shadow-xl bg-white/80 backdrop-blur-sm">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-green-600" />
                            Current Holdings
                        </CardTitle>
                        <CardDescription>
                            Stocks where this broker has a positive net cumulative position.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-gray-50/80">
                                    <TableRow>
                                        <TableHead>Symbol</TableHead>
                                        <TableHead>Sector</TableHead>
                                        <TableHead className="text-right">Quantity</TableHead>
                                        <TableHead className="text-right">Current Price</TableHead>
                                        <TableHead className="text-right">Est. Value (Rs)</TableHead>
                                        <TableHead className="text-right">% Portfolio</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {profile.holdings.map((h) => (
                                        <TableRow key={h.symbol} className="hover:bg-blue-50/50 transition-colors">
                                            <TableCell className="font-bold text-blue-700">
                                                <Link href={`/stock/${h.symbol}`} className="hover:underline">
                                                    {h.symbol}
                                                </Link>
                                                <div className="text-[10px] text-gray-400 font-normal truncate max-w-[150px]">{h.name}</div>
                                            </TableCell>
                                            <TableCell className="text-xs font-semibold text-gray-500">{h.sector}</TableCell>
                                            <TableCell className="text-right font-mono font-medium">{h.quantity.toLocaleString()}</TableCell>
                                            <TableCell className="text-right font-mono text-gray-600">{h.current_price?.toLocaleString() || '-'}</TableCell>
                                            <TableCell className="text-right font-mono font-bold text-gray-900">
                                                {(h.value / 100000).toFixed(2)} L
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <span className="text-xs font-bold text-gray-500">
                                                        {((h.value / profile.total_value) * 100).toFixed(1)}%
                                                    </span>
                                                    <div className="w-16 h-1 bg-gray-100 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-blue-500"
                                                            style={{ width: `${(h.value / profile.total_value) * 100}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </DashboardLayout>
    );
}
