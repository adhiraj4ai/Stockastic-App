'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { TrendingUp, TrendingDown, Minus, Search, BarChart3, Grid3x3, List, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StrategySignal {
    id: number;
    strategy: number;
    strategy_name: string;
    strategy_description: string;
    symbol: string;
    date: string;
    signal: 'BUY' | 'SELL' | 'HOLD' | 'NEUTRAL';
    last_close: string;
    metadata: any;
}

type ViewMode = 'all' | 'by-symbol';
type SignalFilter = 'ALL' | 'BUY' | 'SELL' | 'HOLD';

// Strategy Card Component with Info Dialog
function StrategyCard({ signal }: { signal: StrategySignal }) {
    const [open, setOpen] = useState(false);

    const getSignalColor = (sig: string) => {
        if (sig === 'BUY') return 'border-emerald-300 bg-white hover:shadow-sm hover:border-emerald-400';
        if (sig === 'SELL') return 'border-rose-300 bg-white hover:shadow-sm hover:border-rose-400';
        return 'border-amber-300 bg-white hover:shadow-sm hover:border-amber-400';
    };

    return (
        <div className={cn(
            "p-2 border rounded-md transition-all group max-w-[180px]",
            getSignalColor(signal.signal)
        )}>
            <div className="flex items-center justify-between gap-1">
                <h4 className="font-medium text-slate-800 text-xs flex-1 truncate">
                    {signal.strategy_name}
                </h4>
                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogTrigger asChild>
                        <button className="p-1 rounded-full hover:bg-slate-100 transition-colors flex-shrink-0">
                            <Info className="w-3 h-3 text-slate-600" />
                        </button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                        <DialogHeader>
                            <DialogTitle className="text-xl font-bold text-slate-800">
                                {signal.strategy_name}
                            </DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                            <div>
                                <h4 className="text-sm font-bold text-slate-600 mb-2">Description</h4>
                                <p className="text-slate-700">{signal.strategy_description}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <h4 className="text-sm font-bold text-slate-600 mb-1">Symbol</h4>
                                    <p className="text-lg font-bold text-slate-800">{signal.symbol}</p>
                                </div>
                                <div>
                                    <h4 className="text-sm font-bold text-slate-600 mb-1">Signal</h4>
                                    <Badge className={cn(
                                        'font-bold',
                                        signal.signal === 'BUY' && 'bg-emerald-600',
                                        signal.signal === 'SELL' && 'bg-rose-600',
                                        signal.signal.startsWith('HOLD') && 'bg-amber-600'
                                    )}>
                                        {signal.signal}
                                    </Badge>
                                </div>
                                <div>
                                    <h4 className="text-sm font-bold text-slate-600 mb-1">Last Close</h4>
                                    <p className="text-slate-800">Rs. {signal.last_close}</p>
                                </div>
                                <div>
                                    <h4 className="text-sm font-bold text-slate-600 mb-1">Date</h4>
                                    <p className="text-slate-800">{signal.date}</p>
                                </div>
                            </div>
                            {signal.metadata && (
                                <div>
                                    <h4 className="text-sm font-bold text-slate-600 mb-2">Metadata</h4>
                                    <div className="bg-slate-50 p-3 rounded-lg">
                                        <pre className="text-xs text-slate-700">
                                            {JSON.stringify(signal.metadata, null, 2)}
                                        </pre>
                                    </div>
                                </div>
                            )}
                        </div>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
}

export default function SignalsPage() {
    const [signals, setSignals] = useState<StrategySignal[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<ViewMode>('by-symbol');
    const [signalFilter, setSignalFilter] = useState<SignalFilter>('ALL');
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetchSignals();
    }, []);

    const fetchSignals = async () => {
        setLoading(true);
        try {
            const response = await api.get('/api/stocks/signals/', {
                params: { page_size: 500 }
            });
            if (response.data.results) {
                setSignals(response.data.results);
            }
        } catch (error) {
            console.error("Failed to fetch signals", error);
        } finally {
            setLoading(false);
        }
    };

    // Filter signals
    const filteredSignals = signals.filter(sig => {
        const matchesSignal = signalFilter === 'ALL' || sig.signal === signalFilter;
        const matchesSearch = searchTerm === '' ||
            sig.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
            sig.strategy_name.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesSignal && matchesSearch;
    });

    // Calculate summary stats
    const buyCount = filteredSignals.filter(s => s.signal === 'BUY').length;
    const sellCount = filteredSignals.filter(s => s.signal === 'SELL').length;
    const holdCount = filteredSignals.filter(s => s.signal === 'HOLD' || s.signal.startsWith('HOLD')).length;
    const total = filteredSignals.length;

    // Group signals
    const groupedBySymbol = filteredSignals.reduce((acc, sig) => {
        if (!acc[sig.symbol]) acc[sig.symbol] = [];
        acc[sig.symbol].push(sig);
        return acc;
    }, {} as Record<string, StrategySignal[]>);

    const getSignalBadge = (signal: string) => {
        const styles = {
            BUY: 'bg-emerald-50 text-emerald-700 border-emerald-200',
            SELL: 'bg-rose-50 text-rose-700 border-rose-200',
            HOLD: 'bg-amber-50 text-amber-700 border-amber-200'
        };
        return (
            <Badge className={cn('border font-bold', styles[signal as keyof typeof styles])}>
                {signal}
            </Badge>
        );
    };

    const getSignalIcon = (signal: string) => {
        if (signal === 'BUY') return <TrendingUp className="w-4 h-4" />;
        if (signal === 'SELL') return <TrendingDown className="w-4 h-4" />;
        return <Minus className="w-4 h-4" />;
    };

    return (
        <DashboardLayout>
            <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 pt-2 px-4 pb-4">
                {/* Filters and View Controls */}
                <Card className="mb-2">
                    <CardContent className="py-2 px-3">
                        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                            {/* Signal Type Filters */}
                            <div className="flex flex-wrap gap-2">
                                {(['ALL', 'BUY', 'SELL', 'HOLD'] as SignalFilter[]).map(type => (
                                    <Button
                                        key={type}
                                        variant={signalFilter === type ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => setSignalFilter(type)}
                                        className={cn(
                                            'font-bold',
                                            signalFilter === type && type === 'BUY' && 'bg-emerald-600 hover:bg-emerald-700',
                                            signalFilter === type && type === 'SELL' && 'bg-rose-600 hover:bg-rose-700',
                                            signalFilter === type && type === 'HOLD' && 'bg-amber-600 hover:bg-amber-700'
                                        )}
                                    >
                                        {type}
                                    </Button>
                                ))}
                            </div>

                            {/* Search */}
                            <div className="relative flex-1 max-w-xs">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Search symbol or strategy..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            {/* View Mode Toggle */}
                            <div className="flex gap-2 bg-slate-100 p-1 rounded-lg">
                                <Button
                                    variant={viewMode === 'by-symbol' ? 'default' : 'ghost'}
                                    size="sm"
                                    onClick={() => setViewMode('by-symbol')}
                                    className="gap-2"
                                >
                                    <Grid3x3 className="w-4 h-4" />
                                    By Symbol
                                </Button>
                                <Button
                                    variant={viewMode === 'all' ? 'default' : 'ghost'}
                                    size="sm"
                                    onClick={() => setViewMode('all')}
                                    className="gap-2"
                                >
                                    <List className="w-4 h-4" />
                                    All
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-3">
                    <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 to-white">
                        <CardContent className="p-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-emerald-600 mb-0.5">BUY Signals</p>
                                    <p className="text-3xl font-bold text-emerald-700">{buyCount}</p>
                                    <p className="text-xs text-emerald-600 mt-0.5">
                                        {total > 0 ? ((buyCount / total) * 100).toFixed(1) : 0}% of total
                                    </p>
                                </div>
                                <div className="p-2 bg-emerald-100 rounded-lg">
                                    <TrendingUp className="w-5 h-5 text-emerald-600" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-rose-200 bg-gradient-to-br from-rose-50 to-white">
                        <CardContent className="p-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-rose-600 mb-0.5">SELL Signals</p>
                                    <p className="text-3xl font-bold text-rose-700">{sellCount}</p>
                                    <p className="text-xs text-rose-600 mt-0.5">
                                        {total > 0 ? ((sellCount / total) * 100).toFixed(1) : 0}% of total
                                    </p>
                                </div>
                                <div className="p-2 bg-rose-100 rounded-lg">
                                    <TrendingDown className="w-5 h-5 text-rose-600" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-white">
                        <CardContent className="p-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-amber-600 mb-0.5">HOLD Signals</p>
                                    <p className="text-3xl font-bold text-amber-700">{holdCount}</p>
                                    <p className="text-xs text-amber-600 mt-0.5">
                                        {total > 0 ? ((holdCount / total) * 100).toFixed(1) : 0}% of total
                                    </p>
                                </div>
                                <div className="p-2 bg-amber-100 rounded-lg">
                                    <Minus className="w-5 h-5 text-amber-600" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-white">
                        <CardContent className="p-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-blue-600 mb-0.5">Total Signals</p>
                                    <p className="text-3xl font-bold text-blue-700">{total}</p>
                                    <p className="text-xs text-blue-600 mt-0.5">
                                        {Object.keys(groupedBySymbol).length} symbols
                                    </p>
                                </div>
                                <div className="p-2 bg-blue-100 rounded-lg">
                                    <BarChart3 className="w-5 h-5 text-blue-600" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Signals Display */}
                {loading ? (
                    <Card>
                        <CardContent className="p-12 text-center">
                            <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
                            <p className="text-slate-600">Loading signals...</p>
                        </CardContent>
                    </Card>
                ) : (
                    <>
                        {viewMode === 'by-symbol' && (
                            <div className="space-y-6">
                                {Object.entries(groupedBySymbol).map(([symbol, symbolSignals]) => {
                                    const buySignals = symbolSignals.filter(s => s.signal === 'BUY');
                                    const sellSignals = symbolSignals.filter(s => s.signal === 'SELL');
                                    const holdSignals = symbolSignals.filter(s => s.signal === 'HOLD' || s.signal.startsWith('HOLD'));

                                    return (
                                        <Card key={symbol} className="overflow-hidden">
                                            <CardHeader className="bg-white border-b py-2 px-4">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <CardTitle className="text-lg font-bold text-slate-800">{symbol}</CardTitle>
                                                        <p className="text-xs text-slate-500 mt-0.5">
                                                            {symbolSignals.length} strategies
                                                        </p>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <div className="text-center px-3 py-1 bg-emerald-50 rounded border border-emerald-200">
                                                            <p className="text-xs text-emerald-600 font-medium">BUY</p>
                                                            <p className="text-sm font-bold text-emerald-700">{buySignals.length}</p>
                                                        </div>
                                                        <div className="text-center px-3 py-1 bg-rose-50 rounded border border-rose-200">
                                                            <p className="text-xs text-rose-600 font-medium">SELL</p>
                                                            <p className="text-sm font-bold text-rose-700">{sellSignals.length}</p>
                                                        </div>
                                                        <div className="text-center px-3 py-1 bg-amber-50 rounded border border-amber-200">
                                                            <p className="text-xs text-amber-600 font-medium">HOLD</p>
                                                            <p className="text-sm font-bold text-amber-700">{holdSignals.length}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </CardHeader>
                                            <CardContent className="p-6">
                                                {/* Sprint Board - Three Columns */}
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                    {/* BUY Column */}
                                                    <div className="space-y-3">
                                                        <div className="flex items-center gap-2 pb-3 border-b-2 border-emerald-200">
                                                            <TrendingUp className="w-5 h-5 text-emerald-600" />
                                                            <h3 className="text-sm font-bold text-emerald-700 uppercase tracking-wide">
                                                                BUY ({buySignals.length})
                                                            </h3>
                                                        </div>
                                                        <div className="flex flex-wrap gap-2 min-h-[100px]">
                                                            {buySignals.length > 0 ? (
                                                                buySignals.map(sig => (
                                                                    <StrategyCard key={sig.id} signal={sig} />
                                                                ))
                                                            ) : (
                                                                <p className="text-xs text-slate-400 text-center py-4 w-full">No BUY signals</p>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* SELL Column */}
                                                    <div className="space-y-3">
                                                        <div className="flex items-center gap-2 pb-3 border-b-2 border-rose-200">
                                                            <TrendingDown className="w-5 h-5 text-rose-600" />
                                                            <h3 className="text-sm font-bold text-rose-700 uppercase tracking-wide">
                                                                SELL ({sellSignals.length})
                                                            </h3>
                                                        </div>
                                                        <div className="flex flex-wrap gap-2 min-h-[100px]">
                                                            {sellSignals.length > 0 ? (
                                                                sellSignals.map(sig => (
                                                                    <StrategyCard key={sig.id} signal={sig} />
                                                                ))
                                                            ) : (
                                                                <p className="text-xs text-slate-400 text-center py-4 w-full">No SELL signals</p>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* HOLD Column */}
                                                    <div className="space-y-3">
                                                        <div className="flex items-center gap-2 pb-3 border-b-2 border-amber-200">
                                                            <Minus className="w-5 h-5 text-amber-600" />
                                                            <h3 className="text-sm font-bold text-amber-700 uppercase tracking-wide">
                                                                HOLD ({holdSignals.length})
                                                            </h3>
                                                        </div>
                                                        <div className="flex flex-wrap gap-2 min-h-[100px]">
                                                            {holdSignals.length > 0 ? (
                                                                holdSignals.map(sig => (
                                                                    <StrategyCard key={sig.id} signal={sig} />
                                                                ))
                                                            ) : (
                                                                <p className="text-xs text-slate-400 text-center py-4 w-full">No HOLD signals</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    );
                                })}
                            </div>
                        )}

                        {viewMode === 'all' && (
                            <Card>
                                <CardContent className="p-6">
                                    <div className="overflow-x-auto">
                                        <table className="w-full">
                                            <thead>
                                                <tr className="border-b border-slate-200">
                                                    <th className="text-left p-3 font-bold text-slate-600 text-sm">Symbol</th>
                                                    <th className="text-left p-3 font-bold text-slate-600 text-sm">Strategy</th>
                                                    <th className="text-left p-3 font-bold text-slate-600 text-sm">Signal</th>
                                                    <th className="text-left p-3 font-bold text-slate-600 text-sm">Price</th>
                                                    <th className="text-left p-3 font-bold text-slate-600 text-sm">Date</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {filteredSignals.map(sig => (
                                                    <tr key={sig.id} className="hover:bg-slate-50 transition-colors">
                                                        <td className="p-3 font-bold text-slate-800">{sig.symbol}</td>
                                                        <td className="p-3">
                                                            <div className="max-w-xs">
                                                                <p className="font-medium text-slate-700">{sig.strategy_name}</p>
                                                                <p className="text-xs text-slate-500 truncate">{sig.strategy_description}</p>
                                                            </div>
                                                        </td>
                                                        <td className="p-3">{getSignalBadge(sig.signal)}</td>
                                                        <td className="p-3 text-slate-600">Rs. {sig.last_close}</td>
                                                        <td className="p-3 text-slate-500 text-sm">{sig.date}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {filteredSignals.length === 0 && (
                            <Card>
                                <CardContent className="p-12 text-center">
                                    <p className="text-slate-600">No signals found matching your filters.</p>
                                </CardContent>
                            </Card>
                        )}
                    </>
                )}
            </div>
        </DashboardLayout>
    );
}
