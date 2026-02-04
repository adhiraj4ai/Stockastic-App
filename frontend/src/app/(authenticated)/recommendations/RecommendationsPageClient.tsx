'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { Target, Filter, TrendingUp, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import DashboardLayout from '@/components/DashboardLayout';
import { Card } from '@/components/ui/card';

import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

interface Recommendation {
    symbol: string;
    signal: 'BUY' | 'SELL';
    strength: number;
    reason: string;
    close: number;
    price?: number; // History endpoint returns 'price'
    date: string;
}

const SECTORS = [
    "All", "Commercial Banks", "Corporate Debentures", "Development Banks", "Finance",
    "Hydro Power", "Investment", "Life Insurance", "Manufacturing And Processing",
    "Microfinance", "Mutual Fund", "Non Life Insurance", "Others", "Preferential Shares",
    "Promoter Share", "Tradings"
];

const STRATEGIES = [
    { id: 'broker_accumulation', name: 'Broker Accumulation (Institutional)' },
    { id: 'smart_accumulated_crossover', name: 'Smart Accumulated Crossover' },
];

export default function RecommendationsPage() {
    const router = useRouter();

    // Current Signals State
    const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
    const [loadingRecs, setLoadingRecs] = useState(false);
    const [recStrategy, setRecStrategy] = useState('broker_accumulation');
    const [recSector, setRecSector] = useState('All');

    const fetchRecommendations = async () => {
        setLoadingRecs(true);
        setRecommendations([]);
        try {
            let endpoint = '/api/stocks/companies/recommendations/';

            if (recStrategy === 'broker_accumulation') {
                endpoint = '/api/stocks/broker-accumulation-recommendations/';
            } else if (recStrategy === 'smart_accumulated_crossover') {
                endpoint = '/api/stocks/smart-accumulated-crossover-recommendations/';
            }

            const response = await api.get(endpoint, {
                params: { strategy: recStrategy, sector: recSector }
            });
            const data = response.data.results || response.data;
            setRecommendations(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error("Failed to fetch recommendations", error);
        } finally {
            setLoadingRecs(false);
        }
    };

    useEffect(() => {
        fetchRecommendations();
    }, []);

    useEffect(() => {
        fetchRecommendations();
    }, [recStrategy, recSector]);

    // History Modal State
    const [historyModalOpen, setHistoryModalOpen] = useState(false);
    const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
    const [historyData, setHistoryData] = useState<Recommendation[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);

    const handleViewAction = async (symbol: string) => {
        if (recStrategy === 'broker_accumulation' || recStrategy === 'smart_accumulated_crossover') {
            setSelectedSymbol(symbol);
            setHistoryModalOpen(true);
            setLoadingHistory(true);
            try {
                let url = '';
                if (recStrategy === 'broker_accumulation') {
                    url = `/api/stocks/broker-accumulation-history/?symbol=${symbol}`;
                } else {
                    url = `/api/stocks/smart-accumulated-crossover-history/?symbol=${symbol}`;
                }

                const response = await api.get(url, {
                    params: { symbol }
                });
                setHistoryData(response.data);
            } catch (error) {
                console.error("Failed to fetch history", error);
                setHistoryData([]);
            } finally {
                setLoadingHistory(false);
            }
        } else {
            router.push(`/stock/${symbol}`);
        }
    };

    return (
        <DashboardLayout
            title="Whale Watch"
            subtitle="Track institutional accumulation and smart money signals"
        >
            {/* History Modal */}
            {historyModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <Card className="w-full max-w-4xl max-h-[80vh] overflow-hidden flex flex-col bg-white shadow-xl border-none animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-4 border-b flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                                    Signal History: {selectedSymbol}
                                    <Badge variant="outline" className="text-blue-600 bg-blue-50 border-blue-200">
                                        Broker Accumulation
                                    </Badge>
                                </h3>
                                <p className="text-sm text-gray-500">Historical buy/sell signals generated by this strategy</p>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => setHistoryModalOpen(false)}>
                                × Close
                            </Button>
                        </div>

                        <div className="flex-1 overflow-auto p-0">
                            {loadingHistory ? (
                                <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                                    <Target size={32} className="animate-spin mb-2 opacity-50" />
                                    Loading history...
                                </div>
                            ) : historyData.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                                    <p>No history found for {selectedSymbol}</p>
                                </div>
                            ) : (
                                <Table>
                                    <TableHeader className="bg-gray-50 sticky top-0 z-10">
                                        <TableRow>
                                            <TableHead>Date</TableHead>
                                            <TableHead>Signal</TableHead>
                                            <TableHead>Strength</TableHead>
                                            <TableHead>Price</TableHead>
                                            <TableHead>Reason</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {historyData.map((row, i) => (
                                            <TableRow key={i} className="hover:bg-gray-50/50">
                                                <TableCell className="font-mono text-gray-600">{row.date}</TableCell>
                                                <TableCell>
                                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${row.signal === 'BUY'
                                                        ? 'bg-green-50 text-green-700 border-green-200'
                                                        : 'bg-red-50 text-red-700 border-red-200'
                                                        }`}>
                                                        {row.signal === 'BUY' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                                        {row.signal}
                                                    </span>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <div className="h-1.5 w-16 bg-gray-100 rounded-full overflow-hidden">
                                                            <div
                                                                className={`h-full rounded-full ${row.signal === 'BUY' ? 'bg-green-500' : 'bg-red-500'}`}
                                                                style={{ width: `${row.strength}%` }}
                                                            />
                                                        </div>
                                                        <span className="text-xs font-medium text-gray-600">{row.strength}%</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>Rs. {row.close?.toLocaleString() || row.price?.toLocaleString() || '-'}</TableCell>
                                                <TableCell className="text-sm text-gray-500 max-w-xs truncate" title={row.reason}>
                                                    {row.reason}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </div>

                        <div className="p-4 border-t bg-gray-50 text-right">
                            <Button onClick={() => setHistoryModalOpen(false)}>Done</Button>
                        </div>
                    </Card>
                </div>
            )}

            <div className="space-y-6">
                <Card className="border-none shadow-sm bg-white/50 backdrop-blur-sm">
                    <div className="p-4 flex flex-col md:flex-row gap-4 items-end md:items-center justify-between border-b border-gray-100">
                        <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
                            <div className="space-y-1.5 min-w-[200px]">
                                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                                    <Target size={12} /> Strategy Model
                                </label>
                                <select
                                    value={recStrategy}
                                    onChange={(e) => setRecStrategy(e.target.value)}
                                    className="w-full h-9 rounded-md border border-gray-200 bg-white px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus:border-blue-500"
                                >
                                    {STRATEGIES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1.5 min-w-[200px]">
                                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                                    <Filter size={12} /> Sector
                                </label>
                                <select
                                    value={recSector}
                                    onChange={(e) => setRecSector(e.target.value)}
                                    className="w-full h-9 rounded-md border border-gray-200 bg-white px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus:border-blue-500"
                                >
                                    {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                        </div>
                        <Button variant="outline" size="sm" onClick={fetchRecommendations} disabled={loadingRecs}>
                            {loadingRecs ? 'Scanning...' : 'Refresh Scan'}
                        </Button>
                    </div>

                    <div className="p-0">
                        {loadingRecs ? (
                            <div className="flex flex-col items-center justify-center py-20 text-gray-500 animate-pulse">
                                <Target size={48} className="text-gray-200 mb-4" />
                                <p>Scanning market data for valid signals...</p>
                            </div>
                        ) : recommendations.length === 0 ? (
                            <div className="text-center py-20 text-gray-500">
                                <p>No signals found matching criteria.</p>
                                <p className="text-xs mt-1">Try changing the strategy or checking back later.</p>
                            </div>
                        ) : (
                            <Table>
                                <TableHeader className="bg-gray-50/50">
                                    <TableRow>
                                        <TableHead>Symbol</TableHead>
                                        <TableHead>Signal</TableHead>
                                        <TableHead>Strength</TableHead>
                                        <TableHead>Price</TableHead>
                                        <TableHead className="w-[40%]">Reason</TableHead>
                                        <TableHead className="text-right">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {recommendations.map((rec) => (
                                        <TableRow key={rec.symbol} className="hover:bg-gray-50/50">
                                            <TableCell className="font-medium text-gray-900">{rec.symbol}</TableCell>
                                            <TableCell>
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${rec.signal === 'BUY'
                                                    ? 'bg-green-50 text-green-700 border-green-200'
                                                    : 'bg-red-50 text-red-700 border-red-200'
                                                    }`}>
                                                    {rec.signal === 'BUY' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                                    {rec.signal}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <div className="h-1.5 w-16 bg-gray-100 rounded-full overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full ${rec.signal === 'BUY' ? 'bg-green-500' : 'bg-red-500'}`}
                                                            style={{ width: `${rec.strength}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-xs font-medium text-gray-600">{rec.strength}%</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="font-mono text-gray-700">Rs. {rec.close.toLocaleString()}</TableCell>
                                            <TableCell className="text-sm text-gray-500">{rec.reason}</TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-blue-600 hover:text-blue-700"
                                                    onClick={() => handleViewAction(rec.symbol)}
                                                >
                                                    {recStrategy === 'broker_accumulation' ? 'View History' : 'View Chart'}
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </div>
                </Card>
            </div>
        </DashboardLayout>
    );
}
