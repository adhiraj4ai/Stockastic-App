import React, { useState, useEffect, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { useTheme } from 'next-themes';
import api from '@/lib/api';
import { formatRupees, formatNepaliNumber } from '@/lib/formatters';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { Activity, Droplets, ArrowRightLeft, Layers, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';

interface TickerLiquidityProps {
    symbol: string;
    history: any[];
    fundamental: any;
    range?: string;
}

export const TickerLiquidity: React.FC<TickerLiquidityProps> = ({ symbol, history, fundamental, range = '1M' }) => {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const [profileData, setProfileData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchVolumeProfile = async () => {
            setLoading(true);
            setError(null);
            try {
                const response = await api.get('/api/stocks/market/volume-profile/', {
                    params: { symbol, range }
                });
                setProfileData(response.data);
            } catch (err: any) {
                console.error("Volume profile error:", err);
                setError("Insufficient trading data for this timeframe.");
            } finally {
                setLoading(false);
            }
        };
        fetchVolumeProfile();
    }, [symbol, range]);

    // Calculate Liquidity Metrics perfectly synced with the selected timeframe
    const liquidityMetrics = useMemo(() => {
        if (!history || history.length === 0) return null;

        const rangeDaysMap: Record<string, number> = { '1M': 30, '3M': 90, '6M': 180, '1Y': 365, 'ALL': 3650 };
        const calendarDays = rangeDaysMap[range] || 30;

        const sortedHistory = [...history].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const latestDate = new Date(sortedHistory[0].date);
        const cutoffDate = new Date(latestDate.getTime() - calendarDays * 24 * 60 * 60 * 1000);
        
        const recentHistory = sortedHistory.filter(day => new Date(day.date) >= cutoffDate);
            
        if (recentHistory.length === 0) return null;

        const totalVol = recentHistory.reduce((sum, day) => sum + (Number(day.volume) || 0), 0);
        // Use actual turnover field when available, fall back to volume * close
        const totalTurnover = recentHistory.reduce((sum, day) => {
            const turnover = Number(day.turnover);
            return sum + (turnover > 0 ? turnover : (Number(day.volume) || 0) * (Number(day.close) || 0));
        }, 0);
        // Use actual transaction count from history data
        const totalTrans = recentHistory.reduce((sum, day) => sum + (Number(day.trans) || 0), 0);

        const tradingDays = recentHistory.length;
        const adv = totalVol / tradingDays;
        const adt = totalTurnover / tradingDays;
        const avgTradeSize = totalTrans > 0 ? (totalVol / totalTrans) : 0;

        // Turnover Velocity (Annualized Turnover / Market Cap)
        const annualizedTurnover = adt * 252;
        const marketCap = Number(fundamental?.market_cap) || 0;

        const turnoverVelocity = marketCap > 0 ? (annualizedTurnover / marketCap) * 100 : 0;

        return {
            adv,
            adt,
            avgTradeSize,
            turnoverVelocity,
            label: range
        };
    }, [history, fundamental, range]);


    const getChartOption = () => {
        if (!profileData || !profileData.bars || profileData.bars.length === 0) return {};

        const bars = profileData.bars;
        const poc = profileData.poc;
        const val = profileData.val;
        const vah = profileData.vah;

        const prices = bars.map((b: any) => b.price);
        const volumes = bars.map((b: any) => b.volume);
        
        const minVol = Math.min(...volumes);
        const maxVol = Math.max(...volumes);

        // Core Volume Profile Highlights
        let markLineData: any[] = [
            { yAxis: String(poc), name: 'POC', label: { formatter: 'POC' }, lineStyle: { color: '#f59e0b', width: 2, type: 'solid' } },
            { yAxis: String(vah), name: 'VAH', label: { formatter: 'VAH' }, lineStyle: { color: '#3b82f6' } },
            { yAxis: String(val), name: 'VAL', label: { formatter: 'VAL' }, lineStyle: { color: '#3b82f6' } }
        ];


        return {
            grid: {
                top: '5%',
                right: '5%',
                bottom: '10%',
                left: '10%',
                containLabel: true
            },
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
                backgroundColor: isDark ? 'rgba(15, 23, 42, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                borderColor: isDark ? '#1e293b' : '#e2e8f0',
                textStyle: { color: isDark ? '#f8fafc' : '#0f172a' },
                formatter: (params: any) => {
                    const price = Number(params[0].axisValue);
                    const vol = params[0].value;
                    let label = "";
                    if (price === poc) label = '<br/><span style="color:#f59e0b;font-weight:bold;">Point of Control (POC)</span>';
                    else if (price === vah) label = '<br/><span style="color:#3b82f6;font-weight:bold;">Value Area High (VAH)</span>';
                    else if (price === val) label = '<br/><span style="color:#3b82f6;font-weight:bold;">Value Area Low (VAL)</span>';

                    return `Price Level: <b>Rs. ${price}</b><br/>Volume: <b>${formatNepaliNumber(vol)}</b>${label}`;
                }
            },
            xAxis: {
                type: 'value',
                position: 'bottom',
                splitLine: { lineStyle: { color: isDark ? '#1e293b' : '#f1f5f9', type: 'dashed' } },
                axisLabel: { color: isDark ? '#64748b' : '#94a3b8', formatter: (val: number) => formatNepaliNumber(val) },
                show: false // Hide x-axis visually to keep it clean like a volume profile anchored to y-axis
            },
            yAxis: {
                type: 'category',
                data: prices,
                axisLine: { lineStyle: { color: isDark ? '#334155' : '#e2e8f0' } },
                axisLabel: { color: isDark ? '#94a3b8' : '#64748b', fontWeight: 600 }
            },
            series: [
                {
                    name: 'Volume',
                    type: 'bar',
                    data: bars.map((b: any) => {
                        const isPOC = b.price === poc;
                        const isVA = b.price >= val && b.price <= vah;
                        
                        // Scale color opacity based on volume
                        const opacity = 0.3 + (0.7 * ((b.volume - minVol) / (maxVol - minVol || 1)));

                        return {
                            value: b.volume,
                            itemStyle: {
                                color: isPOC ? '#f59e0b' : (isVA ? `rgba(59, 130, 246, ${opacity})` : (isDark ? 'rgba(71, 85, 105, 0.4)' : 'rgba(203, 213, 225, 0.4)')),
                                borderColor: isPOC ? '#d97706' : 'transparent',
                                borderWidth: isPOC ? 1 : 0,
                                borderRadius: [0, 4, 4, 0]
                            }
                        };
                    }),
                    barCategoryGap: '20%',
                    markLine: {
                        symbol: ['none', 'none'],
                        label: { show: true, position: 'insideMiddleTop', color: isDark ? '#cbd5e1' : '#475569', fontSize: 10, align: 'center' },
                        lineStyle: { type: 'dashed', width: 1.5 },
                        data: markLineData
                    }
                }
            ]
        };
    };

    return (
        <div className="space-y-6">
            {/* Section divider */}
            <div className="flex items-center gap-4">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-300 dark:via-slate-700 to-transparent" />
                <div className="flex items-center gap-2">
                    <Droplets size={14} className="text-primary" />
                    <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Liquidity Intelligence</span>
                </div>
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-300 dark:via-slate-700 to-transparent" />
            </div>

            {/* Liquidity Metrics Bento Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-white/40 dark:bg-card border-slate-200 dark:border-slate-800/50 shadow-sm border">
                    <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-xs font-semibold text-slate-500 flex items-center gap-1.5 uppercase tracking-wider mb-1">
                                    ADV ({liquidityMetrics?.label || '30D'})
                                    <InfoTooltip content={`Average Daily Volume over the selected timeframe (${liquidityMetrics?.label || '30D'}).`} />
                                </p>
                                <div className="text-xl font-bold font-mono text-slate-900 dark:text-white">
                                    {liquidityMetrics ? formatNepaliNumber(liquidityMetrics.adv) : '-'}
                                </div>
                            </div>
                            <div className="p-2 bg-primary/10 rounded-lg text-primary">
                                <Layers size={16} />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-white/40 dark:bg-card border-slate-200 dark:border-slate-800/50 shadow-sm border">
                    <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-xs font-semibold text-slate-500 flex items-center gap-1.5 uppercase tracking-wider mb-1">
                                    Avg Turnover
                                    <InfoTooltip content={`Average Daily Turnover (Monetary Value) over the selected timeframe (${liquidityMetrics?.label || '30D'}).`} />
                                </p>
                                <div className="text-xl font-bold font-mono text-slate-900 dark:text-white">
                                    {liquidityMetrics ? formatRupees(liquidityMetrics.adt) : '-'}
                                </div>
                            </div>
                            <div className="p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg text-emerald-600 dark:text-emerald-400">
                                <Activity size={16} />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-white/40 dark:bg-card border-slate-200 dark:border-slate-800/50 shadow-sm border">
                    <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-xs font-semibold text-slate-500 flex items-center gap-1.5 uppercase tracking-wider mb-1">
                                    Avg Trade Size
                                    <InfoTooltip content="Average volume per transaction. Higher values can indicate institutional block trades." />
                                </p>
                                <div className="text-xl font-bold font-mono text-slate-900 dark:text-white">
                                    {liquidityMetrics && liquidityMetrics.avgTradeSize > 0 ? formatNepaliNumber(Math.round(liquidityMetrics.avgTradeSize)) : 'N/A'}
                                </div>
                            </div>
                            <div className="p-2 bg-primary/10 rounded-lg text-primary">
                                <ArrowRightLeft size={16} />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-white/40 dark:bg-card border-slate-200 dark:border-slate-800/50 shadow-sm border">
                    <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-xs font-semibold text-slate-500 flex items-center gap-1.5 uppercase tracking-wider mb-1">
                                    Velocity
                                    <InfoTooltip content="Turnover Velocity (Annualized Turnover / Market Cap). Measures the share churn rate." />
                                </p>
                                <div className="text-xl font-bold font-mono text-slate-900 dark:text-white">
                                    {liquidityMetrics && liquidityMetrics.turnoverVelocity > 0 ? `${liquidityMetrics.turnoverVelocity.toFixed(1)}%` : 'N/A'}
                                </div>
                            </div>
                            <div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-amber-600 dark:text-amber-400">
                                <Droplets size={16} />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Volume Profile Chart */}
            <div className="bg-white dark:bg-card border border-slate-200 dark:border-border rounded-2xl overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-slate-200 dark:border-border">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        Institutional Volume Profile
                        <InfoTooltip content="Visualizes the total volume traded at specific price levels over the timeframe." />
                    </h3>
                    <p className="text-xs font-semibold text-slate-500 mt-1">Identifies liquidity pools and fair value areas.</p>
                </div>

                <div className="p-6 relative min-h-[400px]">
                    {loading && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/50 dark:bg-card backdrop-blur-sm">
                            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                        </div>
                    )}
                    
                    {error && !loading ? (
                        <div className="flex flex-col items-center justify-center h-full text-center p-8 text-slate-500 space-y-3">
                            <Info size={32} className="opacity-50" />
                            <p>{error}</p>
                        </div>
                    ) : (
                        <ReactECharts 
                            option={getChartOption()} 
                            style={{ height: '400px', width: '100%' }}
                            notMerge={true}
                        />
                    )}
                    
                    {!loading && !error && profileData && (
                        <div className="flex flex-wrap items-center gap-6 mt-4 pt-4 border-t border-border dark:border-slate-800/50 text-xs text-slate-500 font-semibold">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-amber-500" />
                                POC: <span className="text-slate-900 dark:text-white font-mono font-bold">{profileData.poc}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-blue-500" />
                                Value Area: <span className="text-slate-900 dark:text-white font-mono font-bold">{profileData.val} - {profileData.vah}</span>
                                <span className="text-[10px] text-slate-400 ml-1">(70% of Volume)</span>
                            </div>
                            <div className="flex items-center gap-2 ml-auto">
                                Total Vol in Range: <span className="text-slate-900 dark:text-white font-mono font-bold">{formatNepaliNumber(profileData.total_volume)}</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>

        </div>
    );
};

export default TickerLiquidity;
