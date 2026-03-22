'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { ArrowUpRight, ArrowDownRight, Layers, BarChart3, TrendingUp, Calendar, Clock } from 'lucide-react';
import api from '@/lib/api';
import { FullPageLoader } from '@/components/ui/StockLoader';

interface SectorRotation {
    sector: string;
    stock_count: number;
    daily_return: number;
    weekly_return: number;
    monthly_return: number;
    three_month_return: number;
    six_month_return: number;
    yearly_return: number;
}

type TimeframeOption = 'daily' | 'weekly' | 'monthly' | 'three_month' | 'six_month' | 'yearly';

export default function SectorRotationPage() {
    const [sectors, setSectors] = useState<SectorRotation[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTimeframe, setActiveTimeframe] = useState<TimeframeOption>('monthly');

    useEffect(() => {
        const fetchSectors = async () => {
            try {
                const response = await api.get('/api/stocks/sector-rotation/');
                setSectors(response.data.sectors);
            } catch (err) {
                console.error("Failed to load sector rotation data", err);
            } finally {
                setLoading(false);
            }
        };
        fetchSectors();
    }, []);

    if (loading) return <DashboardLayout><FullPageLoader /></DashboardLayout>;

    const timeframeMap: Record<TimeframeOption, { label: string, key: keyof SectorRotation, icon: React.ReactNode }> = {
        'daily': { label: 'Daily (1D)', key: 'daily_return', icon: <Clock size={16} /> },
        'weekly': { label: 'Weekly (1W)', key: 'weekly_return', icon: <Calendar size={16} /> },
        'monthly': { label: 'Monthly (1M)', key: 'monthly_return', icon: <Calendar size={16} /> },
        'three_month': { label: 'Quarterly (3M)', key: 'three_month_return', icon: <Calendar size={16} /> },
        'six_month': { label: 'Half-Year (6M)', key: 'six_month_return', icon: <Calendar size={16} /> },
        'yearly': { label: 'Yearly (1Y)', key: 'yearly_return', icon: <Calendar size={16} /> }
    };

    // Prepare chart data sorted by active timeframe
    const currentKey = timeframeMap[activeTimeframe].key as keyof SectorRotation;
    const chartData = [...sectors].sort((a, b) => (b[currentKey] as number) - (a[currentKey] as number));

    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const val = payload[0].value;
            const isPositive = val >= 0;
            return (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 p-3 rounded-lg shadow-xl">
                    <p className="font-bold text-slate-800 dark:text-white mb-1">{payload[0].payload.sector}</p>
                    <div className="flex items-center gap-1.5">
                        <span className="text-xs text-slate-500">Return:</span>
                        <span className={`font-semibold ${isPositive ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {val > 0 ? '+' : ''}{val}%
                        </span>
                    </div>
                </div>
            );
        }
        return null;
    };

    const formatReturn = (val: number) => {
        const isPositive = val >= 0;
        return (
            <div className={`flex items-center gap-1 font-semibold ${isPositive ? 'text-emerald-500' : 'text-rose-500'}`}>
                {isPositive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                {val > 0 ? '+' : ''}{val}%
            </div>
        );
    };

    return (
        <DashboardLayout
            title="Sector Rotation"
            subtitle="Analyze which sectors are leading or lagging the market across timeframes"
            headerContent={<Layers className="text-blue-500 dark:text-indigo-400" size={32} />}
        >
            <div className="max-w-[1200px] mx-auto space-y-8 pb-12">
                
                {/* Timeframe Controls */}
                <div className="flex flex-wrap items-center gap-2 p-1.5 bg-slate-100 dark:bg-slate-800/50 rounded-xl max-w-fit mx-auto sm:mx-0">
                    {Object.entries(timeframeMap).map(([key, config]) => (
                        <button
                            key={key}
                            onClick={() => setActiveTimeframe(key as TimeframeOption)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                                activeTimeframe === key 
                                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm' 
                                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-white/5'
                            }`}
                        >
                            {config.icon}
                            {config.label}
                        </button>
                    ))}
                </div>

                {/* Main Content Area */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    
                    {/* Bar Chart Visualization */}
                    <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-white/10 shadow-sm col-span-1 lg:col-span-2">
                        <CardHeader className="border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-slate-900/50">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <BarChart3 className="text-blue-500" size={20} />
                                {timeframeMap[activeTimeframe].label} Sector Performance
                            </CardTitle>
                            <CardDescription>Visualizing relative strength across all sectors</CardDescription>
                        </CardHeader>
                        <CardContent className="p-6">
                            <div className="h-[450px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        data={chartData}
                                        layout="vertical"
                                        margin={{ top: 20, right: 30, left: 100, bottom: 5 }}
                                    >
                                        <XAxis type="number" tickFormatter={(val) => `${val}%`} stroke="#888888" fontSize={12} />
                                        <YAxis dataKey="sector" type="category" stroke="#888888" fontSize={11} width={130} />
                                        <Tooltip cursor={{fill: 'transparent'}} content={<CustomTooltip />} />
                                        <Bar dataKey={currentKey} radius={[0, 4, 4, 0]}>
                                            {
                                                chartData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={(entry[currentKey] as number) >= 0 ? '#10b981' : '#f43f5e'} />
                                                ))
                                            }
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Full Data Table */}
                    <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-white/10 shadow-sm col-span-1 lg:col-span-2 overflow-hidden">
                        <CardHeader className="border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-slate-900/50">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <TrendingUp className="text-blue-500" size={20} />
                                Comprehensive Rotation Matrix
                            </CardTitle>
                            <CardDescription>Track momentum shifts sequentially across all major timeframes</CardDescription>
                        </CardHeader>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left whitespace-nowrap">
                                <thead className="text-xs uppercase bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400">
                                    <tr>
                                        <th className="px-6 py-4 font-bold">Sector</th>
                                        <th className="px-6 py-4 font-bold tracking-wider text-right">Stocks</th>
                                        <th className="px-6 py-4 font-bold tracking-wider text-right">1D</th>
                                        <th className="px-6 py-4 font-bold tracking-wider text-right">1W</th>
                                        <th className="px-6 py-4 font-bold tracking-wider text-right">1M</th>
                                        <th className="px-6 py-4 font-bold tracking-wider text-right">3M</th>
                                        <th className="px-6 py-4 font-bold tracking-wider text-right">6M</th>
                                        <th className="px-6 py-4 font-bold tracking-wider text-right">1Y</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                                    {sectors.map((sector) => (
                                        <tr key={sector.sector} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                            <td className="px-6 py-4 font-bold text-slate-800 dark:text-slate-200">
                                                {sector.sector}
                                            </td>
                                            <td className="px-6 py-4 text-right text-slate-500 tabular-nums">
                                                {sector.stock_count}
                                            </td>
                                            <td className="px-6 py-4 text-right tabular-nums">
                                                <div className="flex justify-end">{formatReturn(sector.daily_return)}</div>
                                            </td>
                                            <td className="px-6 py-4 text-right tabular-nums">
                                                <div className="flex justify-end">{formatReturn(sector.weekly_return)}</div>
                                            </td>
                                            <td className="px-6 py-4 text-right tabular-nums">
                                                <div className="flex justify-end">{formatReturn(sector.monthly_return)}</div>
                                            </td>
                                            <td className="px-6 py-4 text-right tabular-nums">
                                                <div className="flex justify-end">{formatReturn(sector.three_month_return)}</div>
                                            </td>
                                            <td className="px-6 py-4 text-right tabular-nums">
                                                <div className="flex justify-end">{formatReturn(sector.six_month_return)}</div>
                                            </td>
                                            <td className="px-6 py-4 text-right tabular-nums">
                                                <div className="flex justify-end">{formatReturn(sector.yearly_return)}</div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>

                </div>
            </div>
        </DashboardLayout>
    );
}
