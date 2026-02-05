'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';
import { Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface FloorsheetEntry {
    id: number;
    transaction_date: string;
    contract_no: string;
    symbol: string;
    buyer_id: string;
    seller_id: string;
    transaction_quantity: number;
    transaction_rate: number;
    transaction_amount: number;
}

function FloorsheetContent() {
    const searchParams = useSearchParams();
    const broker = searchParams.get('broker');
    const symbol = searchParams.get('symbol');
    const date = searchParams.get('date');

    const [transactions, setTransactions] = useState<FloorsheetEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchFloorsheet = async () => {
            setLoading(true);
            try {
                const params: any = { limit: 200 };
                if (broker) params.broker = broker;
                if (symbol) params.symbol = symbol;
                if (date) params.date = date;

                const response = await api.get('/api/stocks/floorsheet_list/', { params });
                setTransactions(response.data);
            } catch (error) {
                console.error("Failed to fetch floorsheet", error);
            } finally {
                setLoading(false);
            }
        };

        if (broker || symbol) {
            fetchFloorsheet();
        } else {
            setLoading(false);
        }
    }, [broker, symbol]);

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('en-NP', { style: 'currency', currency: 'NPR' }).format(val).replace('NPR', 'Rs.');
    };

    return (
        <DashboardLayout>
            <div className="p-6 max-w-7xl mx-auto space-y-6">
                <div className="flex items-center gap-4">
                    <Link href="/accumulation">
                        <Button variant="outline" size="icon">
                            <ArrowLeft className="w-4 h-4" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Floorsheet Analysis</h1>
                        <p className="text-sm text-slate-500">
                            {broker && symbol ? `Broker ${broker} transactions in ${symbol}${date ? ` on ${date}` : ''}` :
                                broker ? `All transactions by Broker ${broker}${date ? ` on ${date}` : ''}` :
                                    symbol ? `Floorsheet for ${symbol}${date ? ` on ${date}` : ''}` : 'Recent Market Transactions'}
                        </p>
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex justify-between items-center">
                            <span>Transaction Log</span>
                            <Badge variant="outline" className="text-xs font-normal">
                                Displaying last {transactions.length} records
                            </Badge>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {loading ? (
                            <div className="p-12 flex justify-center">
                                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                            </div>
                        ) : transactions.length === 0 ? (
                            <div className="p-12 text-center text-slate-500">
                                No transactions found matching criteria.
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 text-slate-600 uppercase text-xs font-bold border-b">
                                        <tr>
                                            <th className="px-6 py-3">Contract</th>
                                            <th className="px-6 py-3">Date</th>
                                            <th className="px-6 py-3">Buyer</th>
                                            <th className="px-6 py-3">Seller</th>
                                            <th className="px-6 py-3 text-right">Qty</th>
                                            <th className="px-6 py-3 text-right">Rate</th>
                                            <th className="px-6 py-3 text-right">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {transactions.map((tx, idx) => {
                                            const isBuyer = broker && String(tx.buyer_id) === String(broker);
                                            const isSeller = broker && String(tx.seller_id) === String(broker);

                                            return (
                                                <tr key={tx.id || idx} className="hover:bg-slate-50/50 transition-colors">
                                                    <td className="px-6 py-3 font-mono text-xs text-slate-500">
                                                        {tx.contract_no}
                                                    </td>
                                                    <td className="px-6 py-3 text-slate-600">
                                                        {tx.transaction_date}
                                                    </td>
                                                    <td className="px-6 py-3">
                                                        <Badge variant="outline" className={isBuyer ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-50 border-slate-200"}>
                                                            {tx.buyer_id}
                                                        </Badge>
                                                    </td>
                                                    <td className="px-6 py-3">
                                                        <Badge variant="outline" className={isSeller ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-slate-50 border-slate-200"}>
                                                            {tx.seller_id}
                                                        </Badge>
                                                    </td>
                                                    <td className="px-6 py-3 text-right font-medium">
                                                        {(tx.transaction_quantity || 0).toLocaleString()}
                                                    </td>
                                                    <td className="px-6 py-3 text-right font-mono text-slate-600">
                                                        {(tx.transaction_rate || 0).toLocaleString()}
                                                    </td>
                                                    <td className="px-6 py-3 text-right font-bold text-slate-700">
                                                        {formatCurrency(tx.transaction_amount || 0)}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </DashboardLayout>
    );
}

export default function FloorsheetPage() {
    return (
        <Suspense fallback={
            <DashboardLayout>
                <div className="flex h-[80vh] items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                </div>
            </DashboardLayout>
        }>
            <FloorsheetContent />
        </Suspense>
    );
}
