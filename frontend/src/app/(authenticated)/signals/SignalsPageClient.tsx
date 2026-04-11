'use client';

import { useEffect, useState, Fragment } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { TrendingUp, TrendingDown, Minus, Search, BarChart3, Grid3x3, List, Info, RefreshCw, Zap, ChevronDown, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, PlusCircle, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { num, fixed } from '@/lib/numbers';

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

interface ActivePosition {
    symbol: string;
    buy_signal: StrategySignal;
    buy_date: string;
    buy_price: string;
    current_price?: string;
    return_pct?: number;
    days_held: number;
    strategies: string[];
}

interface ClosedPosition {
    symbol: string;
    buy_signal: StrategySignal;
    sell_signal: StrategySignal;
    buy_date: string;
    sell_date: string;
    buy_price: string;
    sell_price: string;
    return_pct: number;
    days_held: number;
    buy_strategy: string;
    sell_strategy: string;
}

interface TrackingData {
    active_positions: ActivePosition[];
    closed_positions: ClosedPosition[];
    summary: {
        total_active: number;
        total_closed: number;
        avg_return: number;
        avg_holding_period: number;
    };
}

type ViewMode = 'all' | 'by-symbol';
type TabMode = 'signals' | 'tracking';
type SignalFilter = 'ALL' | 'BUY' | 'SELL' | 'HOLD';

// Component to render the grouped table
function GroupedSignalsTable({ signals, getSignalBadge }: { signals: StrategySignal[], getSignalBadge: (s: string) => React.ReactNode }) {
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>({ key: 'symbol', direction: 'asc' });

    const toggleGroup = (groupId: string) => {
        const newExpanded = new Set(expandedGroups);
        if (newExpanded.has(groupId)) {
            newExpanded.delete(groupId);
        } else {
            newExpanded.add(groupId);
        }
        setExpandedGroups(newExpanded);
    };

    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const handleAddToWatchlist = async (ticker: string, e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent row expansion
        try {
            await api.post('/api/stocks/watchlist/', { ticker });
            toast.success(`Added ${ticker} to watchlist`);
        } catch (error: any) {
            console.error('Failed to add to watchlist', error);
            if (error.response?.data?.ticker) { // Backend validation error for duplicate
                toast.error(`${ticker} is already in your watchlist`);
            } else {
                toast.error('Failed to add to watchlist');
            }
        }
    };

    const SortIcon = ({ columnKey }: { columnKey: string }) => {
        if (sortConfig?.key !== columnKey) return <ArrowUpDown className="w-3 h-3 ml-1 text-slate-300 dark:text-slate-600" />;
        if (sortConfig.direction === 'asc') return <ArrowUp className="w-3 h-3 ml-1 text-blue-500 dark:text-blue-400" />;
        return <ArrowDown className="w-3 h-3 ml-1 text-blue-500 dark:text-blue-400" />;
    };

    // Group signals by Symbol + Signal Type
    const groups = signals.reduce((acc, signal) => {
        // Group NEUTRAL and HOLD_SHORT into HOLD broad category for grouping if desired, 
        // but here we'll stick to strict signalType grouping for clarity
        const key = `${signal.symbol}-${signal.signal}`;

        if (!acc[key]) {
            acc[key] = {
                id: key,
                symbol: signal.symbol,
                signalType: signal.signal,
                signals: [],
                lastClose: signal.last_close,
                date: signal.date
            };
        }
        acc[key].signals.push(signal);
        return acc;
    }, {} as Record<string, { id: string, symbol: string, signalType: string, signals: StrategySignal[], lastClose: string, date: string }>);

    const sortedGroups = Object.values(groups).sort((a, b) => {
        if (!sortConfig) return 0;

        const { key, direction } = sortConfig;
        let valA: any = a[key as keyof typeof a];
        let valB: any = b[key as keyof typeof b];

        // Handle special cases
        if (key === 'count') {
            valA = a.signals.length;
            valB = b.signals.length;
        } else if (key === 'lastClose') {
            valA = parseFloat(a.lastClose.replace(/Rs\. /g, '').replace(/,/g, ''));
            valB = parseFloat(b.lastClose.replace(/Rs\. /g, '').replace(/,/g, ''));
        }

        if (valA < valB) return direction === 'asc' ? -1 : 1;
        if (valA > valB) return direction === 'asc' ? 1 : -1;
        return 0;
    });

    return (
        <Card className="dark:bg-slate-900 dark:border-slate-800">
            <CardContent className="p-6">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-800">
                                <th className="text-left p-3 font-bold text-slate-400 dark:text-slate-500 text-[10px] w-12"></th>
                                <th
                                    className="text-left p-3 font-bold text-slate-400 dark:text-slate-500 text-[10px] cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                    onClick={() => handleSort('symbol')}
                                >
                                    <div className="flex items-center">
                                        Symbol <SortIcon columnKey="symbol" />
                                    </div>
                                </th>
                                <th
                                    className="text-left p-3 font-bold text-slate-400 dark:text-slate-500 text-[10px] cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                    onClick={() => handleSort('signalType')}
                                >
                                    <div className="flex items-center">
                                        Signal <SortIcon columnKey="signalType" />
                                    </div>
                                </th>
                                <th
                                    className="text-left p-3 font-bold text-slate-400 dark:text-slate-500 text-[10px] cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                    onClick={() => handleSort('count')}
                                >
                                    <div className="flex items-center">
                                        Strategies <SortIcon columnKey="count" />
                                    </div>
                                </th>
                                <th
                                    className="text-left p-3 font-bold text-slate-400 dark:text-slate-500 text-[10px] cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                    onClick={() => handleSort('lastClose')}
                                >
                                    <div className="flex items-center">
                                        Price <SortIcon columnKey="lastClose" />
                                    </div>
                                </th>
                                <th
                                    className="text-left p-3 font-bold text-slate-400 dark:text-slate-500 text-[10px] cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                    onClick={() => handleSort('date')}
                                >
                                    <div className="flex items-center">
                                        Date <SortIcon columnKey="date" />
                                    </div>
                                </th>
                                <th className="text-left p-3 font-bold text-slate-400 dark:text-slate-500 text-[10px] w-32">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {sortedGroups.map(group => (
                                <Fragment key={group.id}>
                                    <tr
                                        onClick={() => toggleGroup(group.id)}
                                        className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer group"
                                    >
                                        <td className="p-3 text-slate-400">
                                            {expandedGroups.has(group.id) ?
                                                <ChevronDown className="w-4 h-4 text-blue-500" /> :
                                                <ChevronRight className="w-4 h-4 group-hover:text-blue-500 transition-colors" />
                                            }
                                        </td>
                                        <td className="p-3 font-bold text-slate-800 dark:text-slate-100">{group.symbol}</td>
                                        <td className="p-3">{getSignalBadge(group.signalType)}</td>
                                        <td className="p-3">
                                            <Badge variant="outline" className="bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300">
                                                {group.signals.length} Strategies
                                            </Badge>
                                        </td>
                                        <td className="p-3 text-slate-600 dark:text-slate-300">Rs. {group.lastClose}</td>
                                        <td className="p-3 text-slate-500 dark:text-slate-400 text-sm">{group.date}</td>
                                        <td className="p-3">
                                            {group.signalType === 'BUY' && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-8 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 border-blue-200 dark:border-blue-800 px-2 shadow-sm"
                                                    onClick={(e) => handleAddToWatchlist(group.symbol, e)}
                                                    title="Add to Watchlist"
                                                >
                                                    <PlusCircle className="w-3.5 h-3.5 mr-1.5" />
                                                    Watchlist
                                                </Button>
                                            )}
                                        </td>
                                    </tr>

                                    {/* Expanded Details Row */}
                                    {expandedGroups.has(group.id) && (
                                        <tr className="bg-slate-50/50 dark:bg-slate-800/50">
                                            <td colSpan={7} className="p-0">
                                                <div className="px-12 py-4 space-y-2 border-l-4 border-l-slate-200 dark:border-l-slate-700 ml-6 my-2">
                                                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-3">
                                                        Contributing strategies
                                                    </p>
                                                    {group.signals.map(sig => (
                                                        <div key={sig.id} className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-100 dark:border-slate-700 shadow-sm flex justify-between items-center">
                                                            <div>
                                                                <p className="font-bold text-sm text-slate-800 dark:text-slate-100">{sig.strategy_name}</p>
                                                                <p className="text-xs text-slate-500 dark:text-slate-400">{sig.strategy_description}</p>
                                                            </div>
                                                            {sig.metadata && (
                                                                <div className="text-xs font-mono text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded">
                                                                    {/* Simplified metadata display */}
                                                                    orders: {sig.metadata.orders ?? 0}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            </CardContent>
        </Card>
    );
}

// Strategy Card Component with Enriched Info Dialog
function StrategyCard({ signal }: { signal: StrategySignal }) {
    const [open, setOpen] = useState(false);
    const meta = signal.metadata || {};
    const params = meta.optimized_params;
    const hasParams = params && typeof params === 'object' && Object.keys(params).length > 0;
    const isBuy = signal.signal === 'BUY';
    const isSell = signal.signal === 'SELL';
    const price = parseFloat(signal.last_close) || 0;

    const getSignalColor = (sig: string) => {
        if (sig === 'BUY') return 'border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-800 hover:shadow-sm hover:border-emerald-400 dark:hover:border-emerald-600';
        if (sig === 'SELL') return 'border-rose-300 dark:border-rose-700 bg-white dark:bg-slate-800 hover:shadow-sm hover:border-rose-400 dark:hover:border-rose-600';
        return 'border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-800 hover:shadow-sm hover:border-amber-400 dark:hover:border-amber-600';
    };

    return (
        <div className={cn("p-2 border rounded-md transition-all group max-w-[180px]", getSignalColor(signal.signal))}>
            <div className="flex items-center justify-between gap-1">
                <h4 className="font-medium text-slate-800 dark:text-slate-100 text-xs flex-1 truncate">
                    {signal.strategy_name}
                </h4>
                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogTrigger asChild>
                        <button className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex-shrink-0">
                            <Info className="w-3 h-3 text-slate-600 dark:text-slate-400" />
                        </button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto p-0">
                        {/* Header */}
                        <div className={cn("px-6 py-4 border-b", isBuy ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/50 dark:border-emerald-800/50" : isSell ? "bg-rose-50/50 dark:bg-rose-950/20 border-rose-200/50 dark:border-rose-800/50" : "bg-amber-50/50 dark:bg-amber-950/20 border-amber-200/50 dark:border-amber-800/50")}>
                            <DialogHeader>
                                <div className="flex items-center gap-3">
                                    <DialogTitle className="text-lg font-black text-slate-900 dark:text-white">
                                        {signal.symbol}
                                    </DialogTitle>
                                    <Badge className={cn('font-bold text-white text-xs px-3', isBuy && 'bg-emerald-600', isSell && 'bg-rose-600', !isBuy && !isSell && 'bg-amber-600')}>
                                        {signal.signal}
                                    </Badge>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-auto">{signal.date}</span>
                                </div>
                            </DialogHeader>
                        </div>

                        <div className="p-6 space-y-5">
                            {/* Strategy Info */}
                            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 border border-slate-200/50 dark:border-slate-700/50">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{signal.strategy_name}</p>
                                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{signal.strategy_description}</p>
                            </div>

                            {/* Quick Stats Grid */}
                            <div className="grid grid-cols-3 gap-3">
                                <div className="bg-white dark:bg-slate-900/60 rounded-2xl p-3 border border-slate-200/50 dark:border-slate-700/50 text-center">
                                    <p className="text-[9px] font-bold text-slate-400 uppercase">Price</p>
                                    <p className="text-lg font-black text-slate-900 dark:text-white tabular-nums">Rs. {price.toLocaleString()}</p>
                                </div>
                                <div className="bg-white dark:bg-slate-900/60 rounded-2xl p-3 border border-slate-200/50 dark:border-slate-700/50 text-center">
                                    <p className="text-[9px] font-bold text-slate-400 uppercase">Orders Fired</p>
                                    <p className="text-lg font-black text-blue-500 tabular-nums">{meta.orders ?? 0}</p>
                                </div>
                                <div className="bg-white dark:bg-slate-900/60 rounded-2xl p-3 border border-slate-200/50 dark:border-slate-700/50 text-center">
                                    <p className="text-[9px] font-bold text-slate-400 uppercase">Position</p>
                                    <p className={cn("text-lg font-black tabular-nums", (meta.position_size || 0) > 0 ? "text-emerald-500" : (meta.position_size || 0) < 0 ? "text-rose-500" : "text-slate-400")}>
                                        {(meta.position_size || 0) > 0 ? 'Long' : (meta.position_size || 0) < 0 ? 'Short' : 'Flat'}
                                    </p>
                                </div>
                            </div>

                            {/* Signal Justification */}
                            <div className={cn("rounded-2xl p-4 border", isBuy ? "bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-200/50 dark:border-emerald-700/50" : isSell ? "bg-rose-50/50 dark:bg-rose-900/10 border-rose-200/50 dark:border-rose-700/50" : "bg-amber-50/50 dark:bg-amber-900/10 border-amber-200/50 dark:border-amber-700/50")}>
                                <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: isBuy ? '#10b981' : isSell ? '#f43f5e' : '#f59e0b' }}>
                                    Why {signal.signal}?
                                </p>
                                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                                    {isBuy && `The ${signal.strategy_name} strategy detected a buy condition on ${signal.symbol} at Rs. ${price.toLocaleString()}. The algorithm placed ${meta.orders ?? 0} order(s) based on ${hasParams ? 'optimized' : 'default'} parameters${meta.optimization_scope && meta.optimization_scope !== 'DEFAULT' ? ` (${meta.optimization_scope}-level tuning)` : ''}.`}
                                    {isSell && `The ${signal.strategy_name} strategy triggered a sell signal for ${signal.symbol} at Rs. ${price.toLocaleString()}. This suggests the strategy's exit conditions were met with ${meta.orders ?? 0} order(s) placed to close or short the position.`}
                                    {!isBuy && !isSell && `The ${signal.strategy_name} strategy recommends holding the current position in ${signal.symbol}. The strategy is maintaining its stance with a ${(meta.position_size || 0) > 0 ? 'long' : 'short'} position.`}
                                </p>
                            </div>

                            {/* Optimized Parameters */}
                            {hasParams && (
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Optimized Parameters</p>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                        {Object.entries(params).map(([k, v]: [string, any]) => (
                                            <div key={k} className="bg-white dark:bg-slate-900/60 rounded-xl px-3 py-2 border border-slate-200/50 dark:border-slate-700/50">
                                                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">{k.replace(/_/g, ' ')}</p>
                                                <p className="text-sm font-black text-slate-700 dark:text-slate-200 tabular-nums">
                                                    {fixed(v, 4)}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Optimization Context */}
                            <div className="flex items-center gap-3 text-[10px] text-slate-400 font-semibold bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-200/50 dark:border-slate-700/50">
                                <Zap className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                <span>
                                    Optimization: <span className="text-slate-600 dark:text-slate-300 font-bold">{meta.optimization_scope === 'SYMBOL' ? `Symbol-level (${signal.symbol})` : meta.optimization_scope === 'SECTOR' ? 'Sector-level' : meta.optimization_scope === 'ALL' ? 'Market-wide' : 'Default parameters'}</span>
                                </span>
                                {meta.experiment_id && <span className="ml-auto text-slate-400">Exp #{meta.experiment_id}</span>}
                            </div>
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
    const [viewMode, setViewMode] = useState<ViewMode>('all');
    const [tabMode, setTabMode] = useState<TabMode>('signals');
    const [signalFilter, setSignalFilter] = useState<SignalFilter>('ALL');
    const [searchTerm, setSearchTerm] = useState('');
    const [generating, setGenerating] = useState(false);
    const [trackingData, setTrackingData] = useState<TrackingData | null>(null);
    const [trackingLoading, setTrackingLoading] = useState(false);

    useEffect(() => {
        fetchSignals();
    }, []);

    useEffect(() => {
        if (tabMode === 'tracking') {
            fetchTrackingData();
        }
    }, [tabMode]);

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

    const fetchTrackingData = async () => {
        setTrackingLoading(true);
        try {
            const response = await api.get('/api/stocks/signals/tracking/');
            setTrackingData(response.data);
        } catch (error) {
            console.error("Failed to fetch tracking data", error);
            toast.error('Failed to load tracking data');
        } finally {
            setTrackingLoading(false);
        }
    };

    // Filter signals
    const handleGenerateSignals = async () => {
        setGenerating(true);
        try {
            const response = await api.post('/api/stocks/pipeline/trigger_signals/');
            toast.success(response.data.message || 'Signal generation started');

            // Periodically refresh signals for the next minute? 
            // Or just suggest user to refresh.
            toast.info('Signals will update in a few moments. We will refresh automatically in 10 seconds.', {
                duration: 5000,
            });

            setTimeout(() => {
                fetchSignals();
            }, 10000);

        } catch (error: any) {
            console.error("Failed to trigger signal generation", error);
            toast.error(error.response?.data?.error || 'Failed to start signal generation');
        } finally {
            setGenerating(false);
        }
    };

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
            BUY: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
            SELL: 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800',
            HOLD: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800'
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
            <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950 pt-2 px-4 pb-4 transition-colors duration-300">
                {/* Filters and View Controls */}
                <Card className="mb-6 overflow-hidden border-none shadow-xl glass-card-light">
                    <CardContent className="p-0">
                        {/* Integrated Header and Controls */}
                        <div className="p-6 pb-4 flex flex-col lg:flex-row gap-6 items-start lg:items-center justify-between border-b border-slate-100 dark:border-slate-800">
                            <div className="flex items-center gap-4">
                                <div className="p-2.5 bg-indigo-600 dark:bg-indigo-500 rounded-xl shadow-lg shadow-indigo-200 dark:shadow-none">
                                    <BarChart3 className="w-6 h-6 text-white" />
                                </div>
                                <h2 className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight">Market Signals</h2>
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                onClick={handleGenerateSignals}
                                                disabled={generating}
                                                size="sm"
                                                className="bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white rounded-full px-4 h-9 shadow-md shadow-indigo-100 dark:shadow-none transition-all duration-300 hover:scale-105 active:scale-95"
                                            >
                                                {generating ? (
                                                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                                                ) : (
                                                    <Zap className="w-4 h-4 fill-white text-white mr-1.5" />
                                                )}
                                                {generating ? 'Processing...' : 'Generate New'}
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p>Scan all symbols for fresh buy/sell opportunities</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-3 items-center w-full lg:w-auto">
                                {/* Search Bar */}
                                <div className="relative w-full sm:w-64 group">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500 group-focus-within:text-indigo-500 dark:group-focus-within:text-indigo-400 transition-colors" />
                                    <input
                                        type="text"
                                        placeholder="Search symbol or strategy..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:focus:ring-indigo-400/20 focus:border-indigo-500 dark:focus:border-indigo-400 transition-all text-sm h-10 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                                    />
                                </div>

                                <Separator orientation="vertical" className="hidden sm:block h-6 mx-1 bg-slate-200 dark:bg-slate-700" />

                                {/* View Mode Toggle */}
                                <div className="flex gap-1 bg-slate-100/80 dark:bg-slate-800/80 p-1 rounded-xl w-full sm:w-auto">
                                    <Button
                                        variant={viewMode === 'by-symbol' ? 'secondary' : 'ghost'}
                                        size="sm"
                                        onClick={() => setViewMode('by-symbol')}
                                        className={cn(
                                            "h-8 rounded-lg px-3 text-xs font-bold transition-all",
                                            viewMode === 'by-symbol' ? "bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-300" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                                        )}
                                    >
                                        <Grid3x3 className="w-3.5 h-3.5 mr-1.5" />
                                        Nested
                                    </Button>
                                    <Button
                                        variant={viewMode === 'all' ? 'secondary' : 'ghost'}
                                        size="sm"
                                        onClick={() => setViewMode('all')}
                                        className={cn(
                                            "h-8 rounded-lg px-3 text-xs font-bold transition-all",
                                            viewMode === 'all' ? "bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-300" : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                                        )}
                                    >
                                        <List className="w-3.5 h-3.5 mr-1.5" />
                                        Linear
                                    </Button>
                                </div>
                            </div>
                        </div>

                        {/* Navigation and Filters Row */}
                        <div className="px-6 py-3 flex flex-col md:flex-row gap-4 items-center justify-between bg-slate-50/30 dark:bg-slate-900/30">
                            <Tabs value={tabMode} onValueChange={(v) => setTabMode(v as TabMode)} className="w-full md:w-auto">
                                <TabsList className="bg-slate-200/50 dark:bg-slate-800/50 p-1 h-10 rounded-xl">
                                    <TabsTrigger
                                        value="signals"
                                        className="rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:text-indigo-600 dark:data-[state=active]:text-indigo-300 px-6 font-bold text-xs text-slate-600 dark:text-slate-400"
                                    >
                                        All opportunities
                                    </TabsTrigger>
                                    <TabsTrigger
                                        value="tracking"
                                        className="rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700 data-[state=active]:text-indigo-600 dark:data-[state=active]:text-indigo-300 px-6 font-bold text-xs text-slate-600 dark:text-slate-400"
                                    >
                                        Active tracking
                                    </TabsTrigger>
                                </TabsList>
                            </Tabs>

                            {tabMode === 'signals' && (
                                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
                                    <div className="flex items-center mr-2 text-[10px] font-black text-slate-400 dark:text-slate-500 tracking-tighter">
                                        <Filter className="w-3 h-3 mr-1" />
                                        Refine by
                                    </div>
                                    {(['ALL', 'BUY', 'SELL', 'HOLD'] as SignalFilter[]).map(type => (
                                        <Button
                                            key={type}
                                            variant={signalFilter === type ? 'default' : 'outline'}
                                            size="sm"
                                            onClick={() => setSignalFilter(type)}
                                            className={cn(
                                                'h-8 px-4 rounded-full text-xs font-black transition-all border-slate-200 dark:border-slate-700',
                                                signalFilter === type && type === 'BUY' && 'bg-emerald-500 hover:bg-emerald-600 border-emerald-500 shadow-lg shadow-emerald-100 dark:shadow-none text-white',
                                                signalFilter === type && type === 'SELL' && 'bg-rose-500 hover:bg-rose-600 border-rose-500 shadow-lg shadow-rose-100 dark:shadow-none text-white',
                                                signalFilter === type && type === 'HOLD' && 'bg-amber-500 hover:bg-amber-600 border-amber-500 shadow-lg shadow-amber-100 dark:shadow-none text-white',
                                                signalFilter === type && type === 'ALL' && 'bg-slate-800 hover:bg-slate-900 border-slate-800 shadow-lg shadow-slate-200 dark:shadow-none text-white',
                                                signalFilter !== type && 'bg-transparent text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                                            )}
                                        >
                                            {type === 'ALL' ? 'Everything' : type}
                                        </Button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Tab Content Display */}
                {tabMode === 'signals' && (
                    <>
                        {/* Summary Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-3">
                            <Card className="border-emerald-200 dark:border-emerald-900/50 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/30 dark:to-slate-900">
                                <CardContent className="p-3">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400 mb-0.5">Buy signals</p>
                                            <p className="text-3xl font-bold text-emerald-700 dark:text-emerald-300">{buyCount}</p>
                                            <p className="text-xs text-emerald-600 dark:text-emerald-500 mt-0.5">
                                                {total > 0 ? fixed((buyCount / total) * 100, 1) : 0}% of total
                                            </p>
                                        </div>
                                        <div className="p-2 bg-emerald-100 dark:bg-emerald-900/50 rounded-lg">
                                            <TrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="border-rose-200 dark:border-rose-900/50 bg-gradient-to-br from-rose-50 to-white dark:from-rose-950/30 dark:to-slate-900">
                                <CardContent className="p-3">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-medium text-rose-600 dark:text-rose-400 mb-0.5">Sell signals</p>
                                            <p className="text-3xl font-bold text-rose-700 dark:text-rose-300">{sellCount}</p>
                                            <p className="text-xs text-rose-600 dark:text-rose-500 mt-0.5">
                                                {total > 0 ? fixed((sellCount / total) * 100, 1) : 0}% of total
                                            </p>
                                        </div>
                                        <div className="p-2 bg-rose-100 dark:bg-rose-900/50 rounded-lg">
                                            <TrendingDown className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="border-amber-200 dark:border-amber-900/50 bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/30 dark:to-slate-900">
                                <CardContent className="p-3">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-medium text-amber-600 dark:text-amber-400 mb-0.5">Hold signals</p>
                                            <p className="text-3xl font-bold text-amber-700 dark:text-amber-300">{holdCount}</p>
                                            <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
                                                {total > 0 ? fixed((holdCount / total) * 100, 1) : 0}% of total
                                            </p>
                                        </div>
                                        <div className="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-lg">
                                            <Minus className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="border-blue-200 dark:border-blue-900/50 bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/30 dark:to-slate-900">
                                <CardContent className="p-3">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-0.5">Total Signals</p>
                                            <p className="text-3xl font-bold text-blue-700 dark:text-blue-300">{total}</p>
                                            <p className="text-xs text-blue-600 dark:text-blue-500 mt-0.5">
                                                {Object.keys(groupedBySymbol).length} symbols
                                            </p>
                                        </div>
                                        <div className="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                                            <BarChart3 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Signals Display */}
                        {loading ? (
                            <Card className="dark:bg-slate-900 dark:border-slate-800">
                                <CardContent className="p-12 text-center">
                                    <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
                                    <p className="text-slate-600 dark:text-slate-400">Loading signals...</p>
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
                                                <Card key={symbol} className="overflow-hidden dark:bg-slate-900 dark:border-slate-800">
                                                    <CardHeader className="bg-white dark:bg-slate-900 border-b dark:border-slate-800 py-2 px-4">
                                                        <div className="flex items-center justify-between">
                                                            <div>
                                                                <CardTitle className="text-lg font-bold text-slate-800 dark:text-slate-100">{symbol}</CardTitle>
                                                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                                                    {symbolSignals.length} strategies
                                                                </p>
                                                            </div>
                                                            <div className="flex gap-2">
                                                                <div className="text-center px-3 py-1 bg-emerald-50 dark:bg-emerald-900/20 rounded border border-emerald-200 dark:border-emerald-800">
                                                                    <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">BUY</p>
                                                                    <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">{buySignals.length}</p>
                                                                </div>
                                                                <div className="text-center px-3 py-1 bg-rose-50 dark:bg-rose-900/20 rounded border border-rose-200 dark:border-rose-800">
                                                                    <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">SELL</p>
                                                                    <p className="text-sm font-bold text-rose-700 dark:text-rose-300">{sellSignals.length}</p>
                                                                </div>
                                                                <div className="text-center px-3 py-1 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-200 dark:border-amber-800">
                                                                    <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">HOLD</p>
                                                                    <p className="text-sm font-bold text-amber-700 dark:text-amber-300">{holdSignals.length}</p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </CardHeader>
                                                    <CardContent className="p-6">
                                                        {/* Sprint Board - Three Columns */}
                                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                            {/* BUY Column */}
                                                            <div className="space-y-3">
                                                                <div className="flex items-center gap-2 pb-3 border-b-2 border-emerald-200 dark:border-emerald-800">
                                                                    <TrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                                                                    <h3 className="text-sm font-bold text-emerald-700 dark:text-emerald-400 tracking-wide">
                                                                        BUY ({buySignals.length})
                                                                    </h3>
                                                                </div>
                                                                <div className="flex flex-wrap gap-2 min-h-[100px]">
                                                                    {buySignals.length > 0 ? (
                                                                        buySignals.map(sig => (
                                                                            <StrategyCard key={sig.id} signal={sig} />
                                                                        ))
                                                                    ) : (
                                                                        <p className="text-xs text-slate-400 dark:text-slate-600 text-center py-4 w-full">No BUY signals</p>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* SELL Column */}
                                                            <div className="space-y-3">
                                                                <div className="flex items-center gap-2 pb-3 border-b-2 border-rose-200 dark:border-rose-800">
                                                                    <TrendingDown className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                                                                    <h3 className="text-sm font-bold text-rose-700 dark:text-rose-400 tracking-wide">
                                                                        SELL ({sellSignals.length})
                                                                    </h3>
                                                                </div>
                                                                <div className="flex flex-wrap gap-2 min-h-[100px]">
                                                                    {sellSignals.length > 0 ? (
                                                                        sellSignals.map(sig => (
                                                                            <StrategyCard key={sig.id} signal={sig} />
                                                                        ))
                                                                    ) : (
                                                                        <p className="text-xs text-slate-400 dark:text-slate-600 text-center py-4 w-full">No SELL signals</p>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* HOLD Column */}
                                                            <div className="space-y-3">
                                                                <div className="flex items-center gap-2 pb-3 border-b-2 border-amber-200 dark:border-amber-800">
                                                                    <Minus className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                                                                    <h3 className="text-sm font-bold text-amber-700 dark:text-amber-400 tracking-wide">
                                                                        HOLD ({holdSignals.length})
                                                                    </h3>
                                                                </div>
                                                                <div className="flex flex-wrap gap-2 min-h-[100px]">
                                                                    {holdSignals.length > 0 ? (
                                                                        holdSignals.map(sig => (
                                                                            <StrategyCard key={sig.id} signal={sig} />
                                                                        ))
                                                                    ) : (
                                                                        <p className="text-xs text-slate-400 dark:text-slate-600 text-center py-4 w-full">No HOLD signals</p>
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
                                    <GroupedSignalsTable signals={filteredSignals} getSignalBadge={getSignalBadge} />
                                )}

                                {filteredSignals.length === 0 && (
                                    <Card className="dark:bg-slate-900 dark:border-slate-800">
                                        <CardContent className="p-12 text-center">
                                            <p className="text-slate-600 dark:text-slate-400">No signals found matching your filters.</p>
                                        </CardContent>
                                    </Card>
                                )}
                            </>
                        )}
                    </>
                )}

                {/* Tracking View */}
                {tabMode === 'tracking' && (
                    <>
                        {trackingLoading ? (
                            <Card className="dark:bg-slate-900 dark:border-slate-800">
                                <CardContent className="p-12 text-center">
                                    <div className="animate-spin w-8 h-8 border-4 border-blue-600 dark:border-blue-400 border-t-transparent rounded-full mx-auto mb-4"></div>
                                    <p className="text-slate-600 dark:text-slate-400">Loading tracking data...</p>
                                </CardContent>
                            </Card>
                        ) : trackingData ? (
                            <>
                                {/* Tracking Summary Cards */}
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-3">
                                    <Card className="glass-card-light overflow-hidden border-none shadow-md">
                                        <CardContent className="p-4">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-1">Active Positions</p>
                                                    <p className="text-3xl font-black text-slate-800 dark:text-slate-100">{trackingData.summary?.total_active ?? 0}</p>
                                                    <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase">Awaiting SELL signal</p>
                                                </div>
                                                <div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-2xl border border-blue-100 dark:border-blue-800/30">
                                                    <Zap className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                    <Card className="glass-card-light overflow-hidden border-none shadow-md">
                                        <CardContent className="p-4">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-[10px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-400 mb-1">Closed Positions</p>
                                                    <p className="text-3xl font-black text-slate-800 dark:text-slate-100">{trackingData.summary?.total_closed ?? 0}</p>
                                                    <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase">Completed cycles</p>
                                                </div>
                                                <div className="p-3 bg-purple-50 dark:bg-purple-900/30 rounded-2xl border border-purple-100 dark:border-purple-800/30">
                                                    <CheckCircle2 className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                    <Card className="glass-card-light overflow-hidden border-none shadow-md">
                                        <CardContent className="p-4">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className={cn("text-[10px] font-black uppercase tracking-wider mb-1",
                                                        (trackingData.summary?.avg_return ?? 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                                                    )}>Avg Return</p>
                                                    <p className={cn("text-3xl font-black",
                                                        (trackingData.summary?.avg_return ?? 0) >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"
                                                    )}>{fixed(trackingData.summary?.avg_return, 2, '0.00')}%</p>
                                                    <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase">Per trade</p>
                                                </div>
                                                <div className={cn("p-3 rounded-2xl border",
                                                    (trackingData.summary?.avg_return ?? 0) >= 0 ? "bg-emerald-50 dark:bg-emerald-900/30 border-emerald-100 dark:border-emerald-800/30" : "bg-rose-50 dark:bg-rose-900/30 border-rose-100 dark:border-rose-800/30"
                                                )}>
                                                    <TrendingUp className={cn("w-5 h-5",
                                                        (trackingData.summary?.avg_return ?? 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                                                    )} />
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>

                                    <Card className="glass-card-light overflow-hidden border-none shadow-md">
                                        <CardContent className="p-4">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">Avg Holding Period</p>
                                                    <p className="text-3xl font-black text-slate-800 dark:text-slate-100">{fixed(trackingData.summary?.avg_holding_period, 1, '0.0')}</p>
                                                    <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase">Days</p>
                                                </div>
                                                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700">
                                                    <Clock className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </div>

                                {/* Active Positions Table */}
                                <Card className="mb-6 glass-card-light overflow-hidden border-none">
                                    <CardHeader>
                                        <CardTitle className="text-lg font-bold text-slate-800 dark:text-slate-100">Active Positions</CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-0">
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm text-left">
                                                <thead className="bg-slate-50/50 dark:bg-slate-900 text-slate-400 dark:text-slate-500 uppercase text-[10px] font-black border-b border-slate-100 dark:border-slate-800">
                                                    <tr>
                                                        <th className="px-4 py-4">Symbol</th>
                                                        <th className="px-4 py-4">Buy Price</th>
                                                        <th className="px-4 py-4">Current Price</th>
                                                        <th className="px-4 py-4">Return</th>
                                                        <th className="px-4 py-4">Buy Date</th>
                                                        <th className="px-4 py-4">Days Held</th>
                                                        <th className="px-4 py-4">Strategy</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white/20 dark:bg-slate-950/40">
                                                    {(trackingData.active_positions || []).map((pos, idx) => (
                                                        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                                                            <td className="px-4 py-3 font-bold">{pos.symbol}</td>
                                                            <td className="px-4 py-3 font-mono">Rs. {pos.buy_price}</td>
                                                            <td className="px-4 py-3 font-mono">
                                                                {pos.current_price && pos.current_price !== 'N/A' ? `Rs. ${pos.current_price}` : (pos.current_price || 'Loading...')}
                                                            </td>
                                                            <td className="px-4 py-3">
                                                                {pos.return_pct !== undefined ? (
                                                                    <Badge className={cn(
                                                                        pos.return_pct >= 0
                                                                            ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50"
                                                                            : "bg-rose-100 dark:bg-rose-900/30 text-rose-800 dark:text-rose-400 hover:bg-rose-200 dark:hover:bg-rose-900/50"
                                                                    )}>
                                                                        {num(pos.return_pct) >= 0 ? "+" : ""}{fixed(pos.return_pct, 2)}%
                                                                    </Badge>
                                                                ) : (
                                                                    <span className="text-slate-400">---</span>
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-3">{new Date(pos.buy_date).toLocaleDateString()}</td>
                                                            <td className="px-4 py-3">{pos.days_held} days</td>
                                                            <td className="px-4 py-3 text-xs text-slate-500">
                                                                {pos.strategies.join(', ')}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    {(trackingData.active_positions || []).length === 0 && (
                                                        <tr>
                                                            <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                                                                No active positions found.
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* Closed Positions Table */}
                                <Card className="glass-card-light overflow-hidden border-none">
                                    <CardHeader>
                                        <CardTitle className="text-lg font-bold text-slate-800 dark:text-slate-100">Closed Positions</CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-0">
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm text-left">
                                                <thead className="bg-slate-50/50 dark:bg-slate-900 text-slate-400 dark:text-slate-500 uppercase text-[10px] font-black border-b border-slate-100 dark:border-slate-800">
                                                    <tr>
                                                        <th className="px-4 py-4">Symbol</th>
                                                        <th className="px-4 py-4">Buy</th>
                                                        <th className="px-4 py-4">Sell</th>
                                                        <th className="px-4 py-4">Return</th>
                                                        <th className="px-4 py-4">Start</th>
                                                        <th className="px-4 py-4">End</th>
                                                        <th className="px-4 py-4">Held</th>
                                                        <th className="px-4 py-4">Strategy</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white/20 dark:bg-slate-950/40">
                                                    {(trackingData.closed_positions || []).map((pos, idx) => (
                                                        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                                                            <td className="px-4 py-3 font-bold">{pos.symbol}</td>
                                                            <td className="px-4 py-3 font-mono">Rs. {pos.buy_price}</td>
                                                            <td className="px-4 py-3 font-mono">Rs. {pos.sell_price}</td>
                                                            <td className="px-4 py-3">
                                                                <Badge className={cn(
                                                                    pos.return_pct >= 0
                                                                        ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50"
                                                                        : "bg-rose-100 dark:bg-rose-900/30 text-rose-800 dark:text-rose-400 hover:bg-rose-200 dark:hover:bg-rose-900/50"
                                                                )}>
                                                                    {num(pos.return_pct) >= 0 ? "+" : ""}{fixed(pos.return_pct, 2)}%
                                                                </Badge>
                                                            </td>
                                                            <td className="px-4 py-3 text-xs">{new Date(pos.buy_date).toLocaleDateString()}</td>
                                                            <td className="px-4 py-3 text-xs">{new Date(pos.sell_date).toLocaleDateString()}</td>
                                                            <td className="px-4 py-3 text-xs">{pos.days_held} days</td>
                                                            <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                                                                In: {pos.buy_strategy}<br />Out: {pos.sell_strategy}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    {(trackingData.closed_positions || []).length === 0 && (
                                                        <tr>
                                                            <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                                                                No closed positions found.
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </CardContent>
                                </Card>
                            </>
                        ) : null}
                    </>
                )}
            </div>
        </DashboardLayout>
    );
}

// Missing imports that were used in the tracking view logic
import { CheckCircle2, Clock } from 'lucide-react';
