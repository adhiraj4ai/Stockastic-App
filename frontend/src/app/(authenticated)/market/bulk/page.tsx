'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';
import { Activity, Filter, ChevronLeft, ChevronRight, AlertTriangle, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { PageLoader } from '@/components/ui/StockLoader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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

function BulkTradesContent() {
    const searchParams = useSearchParams();
    const router = useRouter();

    // Filter State
    const [broker, setBroker] = useState(searchParams.get('broker') || '');
    const [symbol, setSymbol] = useState(searchParams.get('symbol') || '');
    const [date, setDate] = useState(searchParams.get('date') || '');

    // Sorting State
    const [sortBy, setSortBy] = useState(searchParams.get('sort') || 'transaction_quantity');
    const [sortDesc, setSortDesc] = useState(searchParams.get('desc') !== 'false');

    // URL Params for Pagination
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = 50;

    // Data State
    const [transactions, setTransactions] = useState<FloorsheetEntry[]>([]);
    const [totalPages, setTotalPages] = useState(1);
    const [totalCount, setTotalCount] = useState(0);

    const [tableLoading, setTableLoading] = useState(true);

    const updateFilters = (resetPage = true) => {
        const params = new URLSearchParams();
        if (broker) params.set('broker', broker);
        if (symbol) params.set('symbol', symbol);
        if (date) params.set('date', date);
        params.set('sort', sortBy);
        params.set('desc', sortDesc.toString());
        if (!resetPage) params.set('page', page.toString());
        else params.set('page', '1');

        router.push(`/market/bulk?${params.toString()}`);
    };

    const handlePageChange = (newPage: number) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('page', newPage.toString());
        router.push(`/market/bulk?${params.toString()}`);
    };

    const handleSort = (field: string) => {
        const isDesc = sortBy === field ? !sortDesc : true;
        setSortBy(field);
        setSortDesc(isDesc);
        
        const params = new URLSearchParams(searchParams.toString());
        params.set('sort', field);
        params.set('desc', isDesc.toString());
        params.set('page', '1');
        router.push(`/market/bulk?${params.toString()}`);
    };

    useEffect(() => {
        const fetchData = async () => {
            try {
                const ordering = `${sortDesc ? '-' : ''}${sortBy}`;
                const params: any = { is_bulk: 'true', page, page_size: pageSize, ordering };
                if (broker) params.broker = broker;
                if (symbol) params.symbol = symbol;
                if (date) params.date = date;

                setTableLoading(true);
                const listRes = await api.get('/api/stocks/floorsheet_list/', { params });

                if (listRes.data.results) {
                    setTransactions(listRes.data.results);
                    setTotalPages(listRes.data.total_pages);
                    setTotalCount(listRes.data.total_count);
                    if (!date && listRes.data.applied_date) {
                        setDate(listRes.data.applied_date);
                    }
                } else {
                    setTransactions(Array.isArray(listRes.data) ? listRes.data : []);
                }
            } catch (error) {
                console.error("Failed to fetch bulk trades", error);
            } finally {
                setTableLoading(false);
            }
        };

        fetchData();
    }, [searchParams]);

    useEffect(() => {
        setBroker(searchParams.get('broker') || '');
        setSymbol(searchParams.get('symbol') || '');
        setDate(searchParams.get('date') || '');
    }, [searchParams]);

    const formatCurrency = (val: number) => {
        if (val === undefined || val === null) return 'Rs. 0';
        return new Intl.NumberFormat('en-NP', { style: 'currency', currency: 'NPR', maximumFractionDigits: 0 }).format(val).replace('NPR', 'Rs.');
    };

    const formatNumber = (num: number) => {
        return new Intl.NumberFormat('en-US').format(num);
    };

    const SortIcon = ({ field }: { field: string }) => {
        if (sortBy !== field) return <ArrowUpDown className="w-3 h-3 ml-1 inline-block text-slate-400" />;
        return sortDesc ? <ArrowDown className="w-3 h-3 ml-1 inline-block text-slate-900 dark:text-slate-100" /> : <ArrowUp className="w-3 h-3 ml-1 inline-block text-slate-900 dark:text-slate-100" />;
    };

    return (
        <DashboardLayout title="Bulk Transactions" subtitle="Tracking massive market shifts (Qty ≥ 5,000 or Amount ≥ 50 Lakhs)">
            <div className="p-4 md:p-6 space-y-6">

                {/* Header & Controls */}
                <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                    <div className="flex flex-wrap gap-2 items-center bg-white dark:bg-card p-2 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        <Filter className="w-4 h-4 text-slate-400 ml-2" />
                        <Input
                            placeholder="Symbol"
                            value={symbol}
                            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                            onKeyDown={(e) => e.key === 'Enter' && updateFilters()}
                            className="w-24 h-9 text-sm bg-transparent border-none focus-visible:ring-0 placeholder:text-slate-400"
                        />
                        <div className="w-px h-6 bg-slate-200 dark:bg-slate-800" />
                        <Input
                            placeholder="Broker"
                            value={broker}
                            onChange={(e) => setBroker(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && updateFilters()}
                            className="w-24 h-9 text-sm bg-transparent border-none focus-visible:ring-0 placeholder:text-slate-400"
                        />
                        <div className="w-px h-6 bg-slate-200 dark:bg-slate-800" />
                        <Input
                            type="date"
                            value={date}
                            onChange={(e) => {
                                setDate(e.target.value);
                                const params = new URLSearchParams(searchParams.toString());
                                params.set('date', e.target.value);
                                if (!e.target.value) params.delete('date');
                                params.set('page', '1');
                                router.push(`/market/bulk?${params.toString()}`);
                            }}
                            className="w-auto h-9 text-sm bg-transparent border-none focus-visible:ring-0"
                        />
                        <Button size="sm" onClick={() => updateFilters(true)}>Search</Button>
                        {(broker || symbol || date) && (
                            <Button size="sm" variant="ghost" onClick={() => router.push('/market/bulk')}>Reset</Button>
                        )}
                    </div>
                </div>

                {/* Transaction List */}
                <Card className="bg-white dark:bg-card border-slate-200 dark:border-slate-800 shadow-sm border-t-4 border-t-amber-500">
                    <CardHeader className="flex flex-row items-center justify-between border-b border-border dark:border-slate-800/50">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                            Confirmed Bulk Trades
                        </CardTitle>
                        <div className="flex items-center gap-2">
                            <Badge variant="outline" className="font-mono bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800">
                                {formatNumber(totalCount)} significant trades
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        {tableLoading ? (
                            <PageLoader />
                        ) : transactions.length === 0 ? (
                            <div className="p-12 text-center text-slate-500 dark:text-slate-400">
                                No bulk transactions found matching your criteria.
                            </div>
                        ) : (
                            <>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 uppercase text-xs font-bold border-b border-slate-200 dark:border-slate-800">
                                            <tr>
                                                <th className="px-6 py-3 whitespace-nowrap">Contract</th>
                                                <th className="px-6 py-3 whitespace-nowrap cursor-pointer select-none" onClick={() => handleSort('transaction_date')}>
                                                    Date <SortIcon field="transaction_date" />
                                                </th>
                                                <th className="px-6 py-3 whitespace-nowrap">Sym</th>
                                                <th className="px-6 py-3 whitespace-nowrap">Buyer</th>
                                                <th className="px-6 py-3 whitespace-nowrap">Seller</th>
                                                <th className="px-6 py-3 text-right whitespace-nowrap cursor-pointer select-none" onClick={() => handleSort('transaction_quantity')}>
                                                    Qty <SortIcon field="transaction_quantity" />
                                                </th>
                                                <th className="px-6 py-3 text-right whitespace-nowrap cursor-pointer select-none" onClick={() => handleSort('transaction_rate')}>
                                                    Rate <SortIcon field="transaction_rate" />
                                                </th>
                                                <th className="px-6 py-3 text-right whitespace-nowrap cursor-pointer select-none" onClick={() => handleSort('transaction_amount')}>
                                                    Amount <SortIcon field="transaction_amount" />
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                            {transactions.map((tx, idx) => {
                                                const isBuyer = broker && String(tx.buyer_id) === String(broker);
                                                const isSeller = broker && String(tx.seller_id) === String(broker);

                                                return (
                                                    <tr key={tx.id || idx} className="hover:bg-accent transition-colors">
                                                        <td className="px-6 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">
                                                            {tx.contract_no}
                                                        </td>
                                                        <td className="px-6 py-3 text-slate-600 dark:text-slate-300 text-xs whitespace-nowrap">
                                                            {tx.transaction_date}
                                                        </td>
                                                        <td className="px-6 py-3 font-bold text-amber-600 dark:text-amber-500">
                                                            {tx.symbol}
                                                        </td>
                                                        <td className="px-6 py-3">
                                                            <Badge variant="outline" className={isBuyer ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800" : "bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300"}>
                                                                {tx.buyer_id}
                                                            </Badge>
                                                        </td>
                                                        <td className="px-6 py-3">
                                                            <Badge variant="outline" className={isSeller ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800" : "bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300"}>
                                                                {tx.seller_id}
                                                            </Badge>
                                                        </td>
                                                        <td className="px-6 py-3 text-right font-medium text-slate-900 dark:text-slate-200">
                                                            <span className={tx.transaction_quantity >= 5000 ? "text-amber-600 dark:text-amber-500 font-bold" : ""}>
                                                                {(tx.transaction_quantity || 0).toLocaleString()}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-3 text-right font-mono text-slate-600 dark:text-slate-400">
                                                            {(tx.transaction_rate || 0).toLocaleString()}
                                                        </td>
                                                        <td className="px-6 py-3 text-right font-bold text-slate-700 dark:text-slate-300">
                                                            <span className={tx.transaction_amount >= 5000000 ? "text-amber-600 dark:text-amber-500" : ""}>
                                                                {formatCurrency(tx.transaction_amount || 0)}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Pagination Controls */}
                                <div className="p-4 border-t border-border dark:border-slate-800 flex items-center justify-between">
                                    <div className="text-xs text-slate-500 dark:text-slate-400">
                                        Page {page} of {totalPages}
                                    </div>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handlePageChange(page - 1)}
                                            disabled={page <= 1}
                                            className="h-8 w-8 p-0"
                                        >
                                            <ChevronLeft className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handlePageChange(page + 1)}
                                            disabled={page >= totalPages}
                                            className="h-8 w-8 p-0"
                                        >
                                            <ChevronRight className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>
        </DashboardLayout>
    );
}

export default function BulkTradesPage() {
    return (
        <Suspense fallback={
            <DashboardLayout>
                <PageLoader />
            </DashboardLayout>
        }>
            <BulkTradesContent />
        </Suspense>
    );
}
