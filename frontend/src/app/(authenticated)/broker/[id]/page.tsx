'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import DashboardLayout from '@/components/DashboardLayout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { 
    ArrowLeft, 
    PieChart as PieChartIcon, 
    Briefcase, 
    TrendingUp, 
    Filter,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    ChevronRight,
    Activity,
    Target,
    Layers,
    BarChart3
} from 'lucide-react';
import Link from 'next/link';
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { FullPageLoader } from '@/components/ui/StockLoader';
import { formatRupees } from '@/lib/formatters';

interface BrokerHolding {
    symbol: string;
    name: string;
    sector: string;
    quantity: number;
    current_price: number;
    wac: number;
    value: number;
    trend_5d: number;
    trend_10d: number;
    trend_15d: number;
    trend_1m: number;
    trend_3m: number;
}

interface BrokerProfile {
    broker_id: string;
    total_value: number;
    holdings: BrokerHolding[];
}

type SortConfig = {
    key: keyof BrokerHolding | '';
    direction: 'asc' | 'desc';
};

export default function BrokerPage() {
    const params = useParams();
    const router = useRouter();
    const id = params.id as string;

    const [profile, setProfile] = useState<BrokerProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    
    // Filtering & Sorting State
    const [selectedSectors, setSelectedSectors] = useState<string[]>([]);
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'value', direction: 'desc' });

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const res = await api.get('/api/stocks/broker_portfolio/', {
                    params: { broker_id: id }
                });
                setProfile(res.data);
                // Initialize sectors
                const sectors = Array.from(new Set(res.data.holdings.map((h: BrokerHolding) => h.sector)));
                setSelectedSectors(sectors as string[]);
            } catch (err) {
                console.error(err);
                setError('Failed to load broker profile');
            } finally {
                setLoading(false);
            }
        };
        if (id) fetchProfile();
    }, [id]);

    const sectors = useMemo(() => {
        if (!profile) return [];
        return Array.from(new Set(profile.holdings.map(h => h.sector))).sort();
    }, [profile]);

    const handleSort = (key: keyof BrokerHolding) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
        }));
    };

    const filteredAndSortedHoldings = useMemo(() => {
        if (!profile) return [];
        
        let result = profile.holdings.filter(h => selectedSectors.includes(h.sector));
        
        if (sortConfig.key) {
            const key = sortConfig.key;
            result.sort((a, b) => {
                const aVal = a[key];
                const bVal = b[key];
                
                // If sorting by trend columns, use percentage of quantity for comparison
                const trendKeys = ['trend_5d', 'trend_10d', 'trend_15d', 'trend_1m', 'trend_3m'];
                if (trendKeys.includes(key as string)) {
                    const aTrend = Number(aVal) || 0;
                    const bTrend = Number(bVal) || 0;
                    const aQty = a.quantity || 1;
                    const bQty = b.quantity || 1;
                    
                    const aPct = aTrend / aQty;
                    const bPct = bTrend / bQty;
                    
                    if (aPct < bPct) return sortConfig.direction === 'asc' ? -1 : 1;
                    if (aPct > bPct) return sortConfig.direction === 'asc' ? 1 : -1;
                    return 0;
                }

                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        
        return result;
    }, [profile, selectedSectors, sortConfig]);

    const toggleSector = (sector: string) => {
        setSelectedSectors(prev => 
            prev.includes(sector) 
                ? prev.filter(s => s !== sector)
                : [...prev, sector]
        );
    };

    const selectAllSectors = () => setSelectedSectors(sectors);
    const deselectAllSectors = () => setSelectedSectors([]);

    // Logic for Summary Intelligence
    const summaryInfo = useMemo(() => {
        if (!profile || profile.holdings.length === 0) return null;
        
        const topVelocityBuy = [...profile.holdings].sort((a, b) => b.trend_5d - a.trend_5d)[0];
        const topVelocitySell = [...profile.holdings].sort((a, b) => a.trend_5d - b.trend_5d)[0];
        
        const sectorExposure = Object.entries(
            profile.holdings.reduce((acc, h) => {
                acc[h.sector] = (acc[h.sector] || 0) + h.value;
                return acc;
            }, {} as Record<string, number>)
        ).sort((a, b) => b[1] - a[1]);
        
        return {
            topBuy: topVelocityBuy,
            topSell: topVelocitySell,
            topSector: sectorExposure[0],
            avgHolding: profile.total_value / profile.holdings.length
        };
    }, [profile]);

    if (loading) return (
        <DashboardLayout>
            <FullPageLoader />
        </DashboardLayout>
    );

    if (error || !profile) {
        return (
            <DashboardLayout title="Error">
                <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-8 space-y-6">
                    <div className="w-20 h-20 bg-rose-50 dark:bg-rose-900/20 rounded-full flex items-center justify-center">
                        <Target size={40} className="text-rose-600 dark:text-rose-400" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">{error || 'Broker Intelligence Offline'}</h2>
                        <p className="text-slate-500 dark:text-slate-400 max-w-xs mx-auto">The requested broker profile could not be retrieved from the terminal nodes.</p>
                    </div>
                    <Button onClick={() => router.back()} variant="outline" className="h-11 px-6 rounded-xl border-slate-200 dark:border-slate-800">
                        <ArrowLeft className="w-4 h-4 mr-2" /> Return to Command Center
                    </Button>
                </div>
            </DashboardLayout>
        );
    }

    // Chart Data
    const sectorMap: Record<string, number> = {};
    profile.holdings.forEach(h => {
        sectorMap[h.sector] = (sectorMap[h.sector] || 0) + h.value;
    });

    const chartData = Object.entries(sectorMap)
        .map(([name, value]) => ({ 
            name, 
            value,
            percentage: (value / profile.total_value) * 100
        }))
        .sort((a, b) => b.value - a.value);

    const COLORS = [
        '#3b82f6', '#10b981', '#6366f1', '#f59e0b', '#ec4899', 
        '#8b5cf6', '#14b8a6', '#f97316', '#06b6d4', '#ef4444'
    ];

    const TrendIndicator = ({ value, total }: { value: number, total?: number }) => {
        if (!value) return <span className="text-slate-300 dark:text-slate-700 font-mono">—</span>;
        const isPos = value > 0;
        const percentage = total ? (value / total) * 100 : null;
        
        return (
            <div className={cn(
                "flex flex-col items-end gap-1.5 font-mono font-bold",
                isPos ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
            )}>
                {percentage !== null && (
                    <span className="text-[12px] font-semibold tracking-tight leading-none">
                        {isPos ? '+' : ''}{percentage.toFixed(1)}%
                    </span>
                )}
                <div className={cn(
                    "flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[9px] opacity-80",
                    isPos ? "bg-emerald-500/5 border-emerald-500/20" : "bg-rose-500/5 border-rose-500/20"
                )}>
                    {isPos ? <ArrowUp size={8} /> : <ArrowDown size={8} />}
                    {Math.abs(value).toLocaleString()}
                </div>
            </div>
        );
    };

    const SortIcon = ({ column }: { column: keyof BrokerHolding }) => {
        if (sortConfig.key !== column) return <ArrowUpDown size={12} className="ml-1.5 opacity-20" />;
        return sortConfig.direction === 'asc' 
            ? <ArrowUp size={12} className="ml-1.5 text-primary" />
            : <ArrowDown size={12} className="ml-1.5 text-primary" />;
    };

    return (
        <DashboardLayout 
            noPadding
            title={<>Broker Analysis <span className="text-primary">#{id}</span></>}
            subtitle="Quant-driven institutional portfolio forensics and holding velocity tracking."
            extraHeaderItems={
                <Button 
                    variant="outline" 
                    onClick={() => router.push('/accumulation/trends')}
                    className="bg-white/50 dark:bg-card border-slate-200 dark:border-slate-800 h-10 px-5 rounded-xl font-bold text-xs gap-2"
                >
                    <ArrowLeft size={16} /> Command Center
                </Button>
            }
        >
            <div className="bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 terminal-grid-light selection:bg-blue-500/10 font-sans relative">
                
                {/* Content Container */}
                <div className="px-8 py-10 space-y-10 relative z-10 animate-in fade-in slide-in-from-bottom-6 duration-1000">
                    
                    {/* Top Stats Row - Optimized 3-Column Layout */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
                        
                        {/* 1. Hero NAV Card (Size Reduced) */}
                        <div className="glass-card-light dark:bg-card rounded-2xl border border-slate-200 dark:border-slate-800/50 overflow-hidden p-6 space-y-6 relative group h-full">
                            <div className="absolute -right-8 -top-8 opacity-[0.03] group-hover:opacity-[0.05] group-hover:scale-110 transition-all duration-1000">
                                <Activity size={200} />
                            </div>
                            
                            <div className="flex items-center gap-3 relative z-10">
                                <div className="h-9 w-9 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                                    <Target size={18} className="text-blue-600 dark:text-blue-400" />
                                </div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Node Performance</p>
                            </div>
                            
                            <div className="space-y-1 relative z-10">
                                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500 italic">Net Portfolio NAV</p>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-4xl font-semibold text-slate-900 dark:text-slate-100 tracking-tighter tabular-nums">
                                        {profile.total_value ? `रू. ${(profile.total_value / 10000000).toFixed(2)} Cr` : 'N/A'}
                                    </span>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-border dark:border-slate-800/50 space-y-3 relative z-10">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Diversity</span>
                                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">{profile.holdings.length} Assets</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Flow Status</span>
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                                        <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-none font-bold text-[9px] uppercase px-2 py-0">Synced</Badge>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 2. Sector Allocation Card (Updated to %) */}
                        <div className="glass-card-light dark:bg-card rounded-2xl border border-slate-200 dark:border-slate-800/50 p-6 flex flex-col h-full relative group">
                            <div className="flex items-center gap-2 mb-4">
                                <PieChartIcon size={16} className="text-blue-500" />
                                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Asset Deployment (%)</h4>
                            </div>
                            
                            <div className="flex-1 min-h-[160px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={chartData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={55}
                                            outerRadius={75}
                                            paddingAngle={4}
                                            dataKey="value"
                                            stroke="none"
                                        >
                                            {chartData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} className="focus:outline-none" />
                                            ))}
                                        </Pie>
                                        <RechartsTooltip 
                                            contentStyle={{ 
                                                backgroundColor: 'oklch(var(--card))', 
                                                border: '1px solid oklch(var(--border))', 
                                                borderRadius: '12px', 
                                                fontSize: '11px', 
                                                fontWeight: '800',
                                                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                                            }}
                                            formatter={(value: number | undefined, name: any, props: any) => [
                                                `${props.payload.percentage.toFixed(1)}%`,
                                                name || ''
                                            ]}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>

                            <div className="grid grid-cols-2 gap-y-2 w-full mt-4 pt-4 border-t border-border dark:border-slate-800/50">
                                 {chartData.slice(0, 4).map((entry, idx) => (
                                     <div key={idx} className="flex items-center gap-2">
                                         <div className="w-1.5 h-1.5 rounded-sm" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                                         <span className="text-[10px] font-bold truncate max-w-[80px] uppercase text-slate-500">{entry.name}</span>
                                         <span className="text-[9px] font-semibold text-slate-900 dark:text-slate-100 ml-auto">{entry.percentage.toFixed(0)}%</span>
                                     </div>
                                 ))}
                            </div>
                        </div>

                        {/* 3. [NEW] Summary Intelligence Card */}
                        <div className="glass-card-light dark:bg-card rounded-2xl border border-slate-200 dark:border-slate-800/50 p-6 flex flex-col h-full relative group space-y-4">
                            <div className="flex items-center gap-2">
                                <Activity size={16} className="text-indigo-500" />
                                <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Node Intelligence</h4>
                            </div>
                            
                            <div className="space-y-3 flex-1">
                                <div className="p-3 rounded-xl bg-slate-50/50 dark:bg-slate-800/30 border border-border dark:border-slate-800/50">
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-1">Dominant Exposure</p>
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">{summaryInfo?.topSector?.[0] || 'N/A'}</span>
                                        <span className="text-[10px] font-bold text-blue-500">रू. {(Number(summaryInfo?.topSector?.[1] || 0) / 10000000).toFixed(1)} Cr</span>
                                    </div>
                                </div>

                                <div className="p-3 rounded-xl bg-slate-50/50 dark:bg-slate-800/30 border border-border dark:border-slate-800/50">
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-1">Max 5D Velocity</p>
                                    <div className="flex items-center justify-between">
                                        <div className="flex flex-col">
                                            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{summaryInfo?.topBuy?.symbol || 'N/A'}</span>
                                            <span className="text-[9px] font-bold text-slate-500">Buying Force</span>
                                        </div>
                                        <TrendIndicator value={summaryInfo?.topBuy?.trend_5d || 0} />
                                    </div>
                                </div>

                                <div className="p-3 rounded-xl bg-slate-50/50 dark:bg-slate-800/30 border border-border dark:border-slate-800/50">
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-1">Avg Deployment / Asset</p>
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">रू. {(Number(summaryInfo?.avgHolding || 0) / 100000).toFixed(2)} L</span>
                                        <Layers size={14} className="text-slate-300" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Sector Filter Bar */}
                    <div className="glass-card-light dark:bg-card/20 rounded-2xl border border-slate-200 dark:border-slate-800/50 p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Filter size={16} className="text-blue-500" />
                                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Filter nodes by Sector</h4>
                            </div>
                            <div className="flex gap-4">
                                <button onClick={selectAllSectors} className="text-[10px] font-bold uppercase tracking-[0.1em] text-primary hover:text-primary/80 transition-colors">Select All</button>
                                <button onClick={deselectAllSectors} className="text-[10px] font-bold uppercase tracking-[0.1em] text-rose-500 hover:text-rose-600 transition-colors">Deselect All</button>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {sectors.map(sector => (
                                <button
                                    key={sector}
                                    onClick={() => toggleSector(sector)}
                                    className={cn(
                                        "px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wide transition-all border",
                                        selectedSectors.includes(sector)
                                            ? "bg-primary/10 text-primary border-primary/30 shadow"
                                            : "bg-white dark:bg-card border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-accent hover:text-accent-foreground"
                                    )}
                                >
                                    {sector}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Holdings Table Section */}
                    <div className="glass-card-light dark:bg-card rounded-2xl border border-slate-200 dark:border-slate-800/50 overflow-hidden shadow-sm">
                        <div className="p-8 border-b border-border dark:border-slate-800/50 flex flex-col md:flex-row md:items-center justify-between gap-6">
                            <div className="flex items-center gap-4">
                                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                                    <TrendingUp size={20} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold tracking-tight">Current Strategic Positions</h3>
                                    <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mt-1">Multi-horizon velocity delta audit for net inventory positions.</p>
                                </div>
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-800/50 px-4 py-2 rounded-xl border border-border dark:border-slate-700">
                                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-[0.1em]">Auditing <span className="text-blue-500">{filteredAndSortedHoldings.length}</span> Active Positions</span>
                            </div>
                        </div>

                        <div className="overflow-x-auto overflow-y-hidden">
                            <Table>
                                <TableHeader className="bg-slate-50 dark:bg-card border-b border-slate-200 dark:border-slate-800">
                                    <TableRow className="hover:bg-transparent h-14">
                                        <TableHead onClick={() => handleSort('symbol')} className="cursor-pointer group px-8">
                                            <div className="flex items-center text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 group-hover:text-primary transition-colors">
                                                Symbol <SortIcon column="symbol" />
                                            </div>
                                        </TableHead>
                                        <TableHead onClick={() => handleSort('quantity')} className="text-right cursor-pointer group px-4">
                                            <div className="flex items-center justify-end text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 group-hover:text-primary transition-colors">
                                                Qty <SortIcon column="quantity" />
                                            </div>
                                        </TableHead>
                                        <TableHead onClick={() => handleSort('wac')} className="text-right cursor-pointer group px-4 bg-orange-500/[0.03]">
                                            <div className="flex items-center justify-end text-[10px] font-semibold uppercase tracking-wider text-amber-600/60 dark:text-amber-400/50 group-hover:text-amber-500 transition-colors">
                                                WAC <SortIcon column="wac" />
                                            </div>
                                        </TableHead>
                                        <TableHead onClick={() => handleSort('current_price')} className="text-right cursor-pointer group px-4">
                                            <div className="flex items-center justify-end text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 group-hover:text-primary transition-colors">
                                                LTP <SortIcon column="current_price" />
                                            </div>
                                        </TableHead>
                                        <TableHead onClick={() => handleSort('value')} className="text-right cursor-pointer group px-4">
                                            <div className="flex items-center justify-end text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 group-hover:text-primary transition-colors">
                                                NAV <SortIcon column="value" />
                                            </div>
                                        </TableHead>
                                        {/* Trend Columns */}
                                        <TableHead onClick={() => handleSort('trend_5d')} className="text-right cursor-pointer group px-4 bg-blue-500/[0.03]">
                                            <div className="flex items-center justify-end text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 group-hover:text-primary transition-colors">
                                                5D Δ (%) <SortIcon column="trend_5d" />
                                            </div>
                                        </TableHead>
                                        <TableHead onClick={() => handleSort('trend_10d')} className="text-right cursor-pointer group px-4">
                                            <div className="flex items-center justify-end text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 group-hover:text-primary transition-colors">
                                                10D Δ (%) <SortIcon column="trend_10d" />
                                            </div>
                                        </TableHead>
                                        <TableHead onClick={() => handleSort('trend_1m')} className="text-right cursor-pointer group px-4">
                                            <div className="flex items-center justify-end text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 group-hover:text-primary transition-colors">
                                                1M Δ (%) <SortIcon column="trend_1m" />
                                            </div>
                                        </TableHead>
                                        <TableHead onClick={() => handleSort('trend_3m')} className="text-right cursor-pointer group px-8">
                                            <div className="flex items-center justify-end text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 group-hover:text-primary transition-colors">
                                                3M Δ (%) <SortIcon column="trend_3m" />
                                            </div>
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody className="divide-y divide-slate-100 dark:divide-slate-800/60 bg-white/30 dark:bg-card">
                                    {filteredAndSortedHoldings.map((h) => (
                                        <TableRow key={h.symbol} className="group hover:bg-accent hover:text-accent-foreground transition-all duration-300">
                                            <TableCell className="py-5 px-8">
                                                <div className="flex flex-col">
                                                    <Link href={`/ticker/${h.symbol}`} className="text-sm font-bold text-primary hover:text-primary/80 transition-colors">
                                                        {h.symbol}
                                                    </Link>
                                                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tight truncate max-w-[140px] opacity-60 group-hover:opacity-100 transition-opacity">{h.name}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right py-5 px-4 font-mono font-bold text-[11px] text-slate-700 dark:text-slate-300">
                                                {h.quantity.toLocaleString()}
                                            </TableCell>
                                            <TableCell className="text-right py-5 px-4 font-mono text-[11px] text-amber-600 dark:text-amber-400/80 font-bold bg-orange-500/[0.02]">
                                                {h.wac ? h.wac.toLocaleString(undefined, { maximumFractionDigits: 1 }) : '—'}
                                            </TableCell>
                                            <TableCell className="text-right py-5 px-4 font-mono text-[11px] text-slate-500 dark:text-slate-500 font-bold">
                                                {h.current_price ? h.current_price.toLocaleString() : '—'}
                                            </TableCell>
                                            <TableCell className="text-right py-5 px-4 font-mono font-bold text-xs text-slate-900 dark:text-slate-100">
                                                {h.value ? `${(h.value / 100000).toFixed(2)} L` : '—'}
                                            </TableCell>
                                            {/* Trends */}
                                            <TableCell className="text-right py-5 px-4 bg-blue-500/[0.03]">
                                                <TrendIndicator value={h.trend_5d} total={h.quantity} />
                                            </TableCell>
                                            <TableCell className="text-right py-5 px-4">
                                                <TrendIndicator value={h.trend_10d} total={h.quantity} />
                                            </TableCell>
                                            <TableCell className="text-right py-5 px-4">
                                                <TrendIndicator value={h.trend_1m} total={h.quantity} />
                                            </TableCell>
                                            <TableCell className="text-right py-5 px-8">
                                                <TrendIndicator value={h.trend_3m} total={h.quantity} />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {filteredAndSortedHoldings.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={9} className="h-40 text-center text-slate-400 font-bold uppercase text-[10px] tracking-[0.2em] bg-white/20 dark:bg-card/20">
                                                No holdings matching selected filter criteria.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
