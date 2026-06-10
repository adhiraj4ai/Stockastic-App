'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowUpRight, ArrowDownRight, Layers, TrendingUp, Compass, Activity, Database } from 'lucide-react';
import api from '@/lib/api';
import { FullPageLoader } from '@/components/ui/StockLoader';
import { cn } from '@/lib/utils';
import { SectorWinRateChart, SectorAvgReturnChart, SectorScatterChart, SectorLagAnalysisChart } from './SectorStudyComponents';
import { InfoTooltip } from '@/components/ui/InfoTooltip';

// --- Types ---

interface SectorStudy {
    total_events: number;
    sectors_covered: number;
    date_range: { from: string; to: string };
    overall: {
        win_rates: { '5d': number; '10d': number; '20d': number; '30d': number };
        avg_excess_returns: { '5d': number; '10d': number; '20d': number; '30d': number };
        median_excess_returns: { '5d': number; '10d': number; '20d': number; '30d': number };
        lag_analysis: Array<{ lag: number; win_rate: number; avg_excess_return: number }>;
    };
    scatter_data: Array<{ sector: string; date: string; intensity: number; excess_return_20d: number }>;
}

interface CurrentSignal {
    sector: string;
    acc_intensity: number;
    acc_net_10d: number;
    acc_signal: string;
    acc_stocks_count: number;
    stock_count: number;
    current_return_1m: number | null;
    projected_excess_20d: number | null;
    historical_win_rate_20d: number | null;
    top_accumulated_stocks: string[];
}

interface SectorRotationRaw {
    sector: string;
    stock_count: number;
    daily_return: number;
    weekly_return: number;
    monthly_return: number;
    three_month_return: number;
    six_month_return: number;
    yearly_return: number;
}

// --- Helper ---

function StatCard({ label, value, sub, color = 'indigo' }: { label: string; value: string; sub?: string; color?: 'emerald' | 'rose' | 'indigo' | 'blue' | 'orange' }) {
    const colorMap = {
        emerald: 'text-emerald-500 dark:text-emerald-400 bg-emerald-500/10',
        rose: 'text-rose-500 dark:text-rose-400 bg-rose-500/10',
        indigo: 'text-indigo-500 dark:text-indigo-400 bg-indigo-500/10',
        blue: 'text-blue-500 dark:text-blue-400 bg-blue-500/10',
        orange: 'text-orange-500 dark:text-orange-400 bg-orange-500/10',
    };
    return (
        <div className="bg-white dark:bg-card border border-border dark:border-slate-800 rounded-2xl p-5 flex flex-col gap-1.5 shadow-sm">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</span>
            <span className={cn('text-2xl font-semibold tabular-nums', colorMap[color].split(' ')[0])}>{value}</span>
            {sub && <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">{sub}</span>}
        </div>
    );
}

function fmtReturn(n: number | null | undefined): string {
    if (n == null) return '—';
    return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
}

function fmtIntensity(n: number): string {
    return (n >= 0 ? '+' : '') + n.toFixed(1) + 'x';
}

export default function SectorRotationPage() {
    const [loading, setLoading] = useState(true);
    const [studyData, setStudyData] = useState<SectorStudy | null>(null);
    const [currentSignals, setCurrentSignals] = useState<CurrentSignal[]>([]);
    const [rawSectors, setRawSectors] = useState<SectorRotationRaw[]>([]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                // Fetch both endpoints concurrently
                const [studyRes, rawRes] = await Promise.all([
                    api.get('/api/stocks/sector-rotation-study/'),
                    api.get('/api/stocks/sector-rotation/')
                ]);
                
                if (studyRes.data?.study) {
                    setStudyData(studyRes.data.study);
                    setCurrentSignals(studyRes.data.current_signals || []);
                }
                if (rawRes.data?.sectors) {
                    setRawSectors(rawRes.data.sectors);
                }
            } catch (err) {
                console.error("Failed to load sector rotation data", err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    if (loading) return <DashboardLayout><FullPageLoader /></DashboardLayout>;

    const formatMatrixReturn = (val: number) => {
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
            title="Sector Rotation Study"
            subtitle="Analyze how aggregate broker accumulation predicts sector outperformance against the broad market."
            headerContent={<Compass className="text-blue-500 dark:text-indigo-400" size={32} />}
        >
            <div className="max-w-[1200px] mx-auto space-y-10 pb-12">
                
                {studyData ? (
                    <>
                        {/* 1. Study Header / Stats */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <StatCard
                                label="Total Rotation Events"
                                value={studyData.total_events.toString()}
                                sub={`Over ${studyData.sectors_covered} sectors`}
                                color="indigo"
                            />
                            <StatCard
                                label="Date Range"
                                value={`${new Date(studyData.date_range.from).getFullYear()} - ${new Date(studyData.date_range.to).getFullYear()}`}
                                sub={`${studyData.date_range.from} to ${studyData.date_range.to}`}
                                color="blue"
                            />
                            <StatCard
                                label="Avg 20D Excess Return"
                                value={fmtReturn(studyData.overall.avg_excess_returns?.['20d'] ?? 0)}
                                sub="Sector outperformance vs Market"
                                color={(studyData.overall.avg_excess_returns?.['20d'] ?? 0) >= 0 ? 'emerald' : 'rose'}
                            />
                            <StatCard
                                label="20D Win Rate"
                                value={`${((studyData.overall.win_rates?.['20d'] ?? 0) * 100).toFixed(1)}%`}
                                sub="Times sector beat the market"
                                color={(studyData.overall.win_rates?.['20d'] ?? 0) >= 0.5 ? 'emerald' : 'rose'}
                            />
                        </div>

                        {/* 2. Study Charts */}
                        <div className="grid md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-5 duration-700">
                            <SectorWinRateChart winRates={studyData.overall.win_rates} />
                            <SectorAvgReturnChart 
                                avgReturns={studyData.overall.avg_excess_returns} 
                                medianReturns={studyData.overall.median_excess_returns} 
                            />
                            <SectorScatterChart scatterData={studyData.scatter_data} />
                            <SectorLagAnalysisChart lagAnalysis={studyData.overall.lag_analysis} />
                        </div>
                    </>
                ) : (
                    <div className="bg-slate-50 dark:bg-card border border-slate-200 dark:border-slate-800 rounded-2xl p-8 flex flex-col items-center gap-4 text-center">
                        <Database size={32} className="text-slate-400" />
                        <div>
                            <h3 className="font-bold text-slate-800 dark:text-white mb-1">Insufficient Historical Data</h3>
                            <p className="text-sm text-slate-500">Not enough past sector rotation events were identified to generate a comprehensive study.</p>
                        </div>
                    </div>
                )}

                <div className="w-full h-px bg-gradient-to-r from-transparent via-slate-200 dark:via-slate-800 to-transparent my-4"></div>

                {/* 3. Current Rotation Signals (Opportunities) */}
                <div className="space-y-4">
                    <div className="flex items-center gap-3 px-1">
                        <Activity className="text-orange-500" size={24} />
                        <div>
                            <div className="flex items-center">
                                <h2 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">Active Rotation Signals</h2>
                                <InfoTooltip content="Sectors currently acting as magnets for heavy capital inflows. The 'Projected 20d Excess' estimates sector outperformance based on historical regression." />
                            </div>
                            <p className="text-xs font-medium text-slate-500 mt-0.5">Sectors currently flashing heavy accumulation, projecting future outperformance.</p>
                        </div>
                    </div>

                    {currentSignals.length === 0 ? (
                        <div className="bg-white dark:bg-card border border-border dark:border-slate-800 rounded-2xl p-10 flex flex-col items-center justify-center text-center gap-4 shadow-sm">
                            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                                <Compass size={20} className="text-slate-400" />
                            </div>
                            <div>
                                <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">No Significant Rotation Detected</h3>
                                <p className="text-sm text-slate-500 mt-1 max-w-sm">Broker networks are currently distributing flows evenly or holding neutral positions. No single sector is experiencing aggregated heavy inflows.</p>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {currentSignals.map((signal, idx) => {
                                const isPositiveEdge = (signal.projected_excess_20d ?? 0) >= 0;
                                const isWinRateGood = (signal.historical_win_rate_20d ?? 0) >= 0.5;

                                return (
                                    <div key={idx} className="bg-white dark:bg-card border border-border dark:border-slate-800 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
                                        
                                        {/* Highlight Bar */}
                                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-500 to-indigo-500"></div>

                                        <div className="flex justify-between items-start mb-4">
                                            <div>
                                                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1.5">{signal.sector}</h3>
                                                <div className="flex items-center gap-2">
                                                    <span className={cn(
                                                        "text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded ml-[-1px]",
                                                        "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                                    )}>
                                                        Heavy Inflow
                                                    </span>
                                                    <span className="text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                                                        {signal.stock_count} Tracked Stocks
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">Accumulation</div>
                                                <div className="text-xl font-semibold text-blue-600 dark:text-blue-500 tabular-nums">
                                                    {fmtIntensity(signal.acc_intensity)}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-3 gap-2 py-3 border-y border-border dark:border-slate-800/80 mb-4 bg-slate-50/50 dark:bg-slate-800/20 px-2 rounded-lg">
                                            <div className="flex flex-col">
                                                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">1M Performance</span>
                                                <span className={cn("text-sm font-bold tabular-nums", (signal.current_return_1m ?? 0) >= 0 ? 'text-emerald-500' : 'text-rose-500')}>
                                                    {fmtReturn(signal.current_return_1m)}
                                                </span>
                                            </div>
                                            <div className="flex flex-col border-l border-slate-200 dark:border-slate-700 pl-3">
                                                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Proj 20d Excess</span>
                                                <span className={cn("text-sm font-bold tabular-nums", isPositiveEdge ? 'text-indigo-500' : 'text-rose-500')}>
                                                    {fmtReturn(signal.projected_excess_20d)}
                                                </span>
                                            </div>
                                            <div className="flex flex-col border-l border-slate-200 dark:border-slate-700 pl-3">
                                                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Hist. Win Rate</span>
                                                <span className={cn("text-sm font-bold tabular-nums", isWinRateGood ? 'text-emerald-500' : 'text-rose-500')}>
                                                    {signal.historical_win_rate_20d != null ? (signal.historical_win_rate_20d * 100).toFixed(0) + '%' : '—'}
                                                </span>
                                            </div>
                                        </div>

                                        {signal.top_accumulated_stocks.length > 0 && (
                                            <div>
                                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Rotation Led By</div>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {signal.top_accumulated_stocks.map(ticker => (
                                                        <span key={ticker} className="text-xs font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-1 rounded-md shadow-sm">
                                                            {ticker}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="w-full h-px bg-gradient-to-r from-transparent via-slate-200 dark:via-slate-800 to-transparent my-4"></div>

                {/* 4. Full Raw Data Table (Legacy) */}
                <div className="space-y-4 pt-4">
                    <div className="flex items-center gap-3 px-1">
                        <Layers className="text-slate-400" size={24} />
                        <div>
                            <div className="flex items-center">
                                <h2 className="text-lg font-semibold text-slate-900 dark:text-white tracking-tight">Raw Sector Matrix</h2>
                                <InfoTooltip content="The classic performance matrix tracking absolute sector returns across broad timelines, regardless of accumulation metrics." />
                            </div>
                            <p className="text-xs font-medium text-slate-500 mt-0.5">Traditional broad market absolute returns across timelines.</p>
                        </div>
                    </div>
                    
                    <Card className="bg-white dark:bg-card border-slate-200 dark:border-border shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left whitespace-nowrap">
                                <thead className="text-[10px] uppercase tracking-wider bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 border-b border-border dark:border-slate-800">
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
                                    {rawSectors.map((sector) => (
                                        <tr key={sector.sector} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                            <td className="px-6 py-4 font-bold text-slate-800 dark:text-slate-200">
                                                {sector.sector}
                                            </td>
                                            <td className="px-6 py-4 text-right text-slate-500 tabular-nums font-mono text-xs">
                                                {sector.stock_count}
                                            </td>
                                            <td className="px-6 py-4 text-right tabular-nums text-xs">
                                                <div className="flex justify-end">{formatMatrixReturn(sector.daily_return)}</div>
                                            </td>
                                            <td className="px-6 py-4 text-right tabular-nums text-xs">
                                                <div className="flex justify-end">{formatMatrixReturn(sector.weekly_return)}</div>
                                            </td>
                                            <td className="px-6 py-4 text-right tabular-nums text-xs">
                                                <div className="flex justify-end">{formatMatrixReturn(sector.monthly_return)}</div>
                                            </td>
                                            <td className="px-6 py-4 text-right tabular-nums text-xs">
                                                <div className="flex justify-end">{formatMatrixReturn(sector.three_month_return)}</div>
                                            </td>
                                            <td className="px-6 py-4 text-right tabular-nums text-xs">
                                                <div className="flex justify-end">{formatMatrixReturn(sector.six_month_return)}</div>
                                            </td>
                                            <td className="px-6 py-4 text-right tabular-nums text-xs">
                                                <div className="flex justify-end">{formatMatrixReturn(sector.yearly_return)}</div>
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
