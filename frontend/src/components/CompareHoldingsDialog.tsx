'use client';

import React, { useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { PortfolioItem } from '@/components/PortfolioTable';
import {
    TrendingUp, TrendingDown, Activity, Heart, Shield,
    BarChart3, Zap, Scale
} from 'lucide-react';
import { formatRupees } from '@/lib/formatters';
import { RadarChart, Radar, PolarAngleAxis, PolarGrid, PolarRadiusAxis, ResponsiveContainer, Legend } from 'recharts';

interface CompareHoldingsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    items: PortfolioItem[];
}

const COMPARE_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444'];

function MetricRow({
    label, values, format = 'number', icon, highlight = 'higher'
}: {
    label: string;
    values: (number | null | undefined)[];
    format?: 'number' | 'currency' | 'percent' | 'score';
    icon?: React.ReactNode;
    highlight?: 'higher' | 'lower' | 'none';
}) {
    const numValues = values.map(v => v ?? 0);
    const bestIdx = highlight === 'none' ? -1
        : highlight === 'higher' ? numValues.indexOf(Math.max(...numValues))
        : numValues.indexOf(Math.min(...numValues));

    const formatValue = (v: number | null | undefined) => {
        if (v === null || v === undefined) return '—';
        switch (format) {
            case 'currency': return formatRupees(v);
            case 'percent': return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
            case 'score': return v.toFixed(0);
            default: return v.toFixed(2);
        }
    };

    return (
        <div className="flex items-center border-b border-slate-50 dark:border-slate-800/50 last:border-0">
            <div className="w-[140px] shrink-0 flex items-center gap-2 py-3 px-4">
                {icon && <span className="text-slate-400 dark:text-slate-500">{icon}</span>}
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-tight">{label}</span>
            </div>
            {values.map((val, idx) => (
                <div key={idx} className="flex-1 text-center py-3">
                    <span className={`text-sm font-black ${bestIdx === idx ? 'text-blue-600 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300'}`}>
                        {formatValue(val)}
                    </span>
                    {bestIdx === idx && (
                        <span className="ml-1 text-[8px] font-black text-blue-500 dark:text-blue-400">★</span>
                    )}
                </div>
            ))}
        </div>
    );
}

export function CompareHoldingsDialog({ open, onOpenChange, items }: CompareHoldingsDialogProps) {
    // Radar chart data
    const radarData = useMemo(() => {
        if (!items.length) return [];

        const metrics = [
            { name: 'Profitability', key: 'gain_loss_percent', normalize: (v: number) => Math.min(Math.max((v + 30) / 60 * 100, 0), 100) },
            { name: 'Health', key: 'health_score', normalize: (v: number) => v || 0 },
            { name: 'Stability', key: 'volatility', normalize: (v: number) => Math.max(100 - (v || 0), 0) },
            { name: 'Value', key: 'current_value', normalize: (v: number) => {
                const max = Math.max(...items.map(i => Number(i.current_value)));
                return max > 0 ? (v / max) * 100 : 0;
            }},
            { name: 'Signals', key: 'signals', normalize: (_v: number, item: PortfolioItem) => {
                const buyCount = item.signals?.buy_count || 0;
                return Math.min(buyCount * 25, 100);
            }},
        ];

        return metrics.map(m => {
            const entry: any = { metric: m.name };
            items.forEach((item, idx) => {
                const raw = Number((item as any)[m.key]) || 0;
                entry[`item${idx}`] = m.normalize(raw, item);
            });
            return entry;
        });
    }, [items]);

    if (!items.length) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800">
                <DialogHeader className="pb-4 border-b border-slate-100 dark:border-slate-800">
                    <DialogTitle className="flex items-center gap-3 text-xl font-black text-slate-900 dark:text-slate-100">
                        <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                            <Scale className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        Holdings Comparison
                        <Badge variant="secondary" className="text-[9px] font-bold ml-2 px-2 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                            {items.length} Selected
                        </Badge>
                    </DialogTitle>
                </DialogHeader>

                {/* Ticker Headers */}
                <div className="flex items-center border-b border-slate-100 dark:border-slate-800">
                    <div className="w-[140px] shrink-0 py-3 px-4"></div>
                    {items.map((item, idx) => (
                        <div key={item.id} className="flex-1 text-center py-3">
                            <div className="flex flex-col items-center gap-1">
                                <div className="flex items-center gap-1.5">
                                    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COMPARE_COLORS[idx] }} />
                                    <span className="font-black text-sm text-slate-900 dark:text-slate-100">{item.ticker}</span>
                                </div>
                                <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tighter">
                                    {item.sector || 'Unknown'}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Metrics Comparison */}
                <div className="rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden">
                    <MetricRow
                        label="Current Price"
                        values={items.map(i => Number(i.current_price))}
                        format="currency"
                        icon={<BarChart3 size={12} />}
                        highlight="none"
                    />
                    <MetricRow
                        label="WACC"
                        values={items.map(i => Number(i.wacc))}
                        format="currency"
                        icon={<Shield size={12} />}
                        highlight="lower"
                    />
                    <MetricRow
                        label="Quantity"
                        values={items.map(i => Number(i.quantity))}
                        format="number"
                        highlight="none"
                    />
                    <MetricRow
                        label="Current Value"
                        values={items.map(i => Number(i.current_value))}
                        format="currency"
                        highlight="higher"
                    />
                    <MetricRow
                        label="P&L %"
                        values={items.map(i => Number(i.gain_loss_percent))}
                        format="percent"
                        icon={<TrendingUp size={12} />}
                        highlight="higher"
                    />
                    <MetricRow
                        label="P&L Amount"
                        values={items.map(i => Number(i.gain_loss))}
                        format="currency"
                        icon={<TrendingUp size={12} />}
                        highlight="higher"
                    />
                    <MetricRow
                        label="Day P&L"
                        values={items.map(i => Number(i.day_gain_loss))}
                        format="currency"
                        icon={<TrendingDown size={12} />}
                        highlight="higher"
                    />
                    <MetricRow
                        label="Health Score"
                        values={items.map(i => i.health_score)}
                        format="score"
                        icon={<Heart size={12} />}
                        highlight="higher"
                    />
                    <MetricRow
                        label="Volatility"
                        values={items.map(i => i.volatility)}
                        format="percent"
                        icon={<Activity size={12} />}
                        highlight="lower"
                    />
                    <MetricRow
                        label="Buy Signals"
                        values={items.map(i => i.signals?.buy_count || 0)}
                        format="score"
                        icon={<Zap size={12} />}
                        highlight="higher"
                    />
                </div>

                {/* Radar Chart */}
                {radarData.length > 0 && (
                    <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800">
                        <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-4 px-4">
                            Comparative Analysis
                        </h4>
                        <ResponsiveContainer width="100%" height={280}>
                            <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                                <PolarGrid stroke="#E2E8F0" strokeDasharray="3 3" />
                                <PolarAngleAxis
                                    dataKey="metric"
                                    tick={{ fontSize: 10, fontWeight: 700, fill: '#94A3B8' }}
                                />
                                <PolarRadiusAxis tick={false} domain={[0, 100]} axisLine={false} />
                                {items.map((item, idx) => (
                                    <Radar
                                        key={item.id}
                                        name={item.ticker}
                                        dataKey={`item${idx}`}
                                        stroke={COMPARE_COLORS[idx]}
                                        fill={COMPARE_COLORS[idx]}
                                        fillOpacity={0.15}
                                        strokeWidth={2}
                                    />
                                ))}
                                <Legend
                                    wrapperStyle={{ fontSize: 11, fontWeight: 800 }}
                                />
                            </RadarChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
