'use client';

import React, { useState } from 'react';
import { TrendingUp, TrendingDown, LineChart, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { FibonacciRetracement } from '@/components/ticker/FibonacciRetracement';
import IndicatorTooltip from '@/components/ticker/IndicatorTooltip';
import { cn } from '@/lib/utils';
import { formatNepaliNumber } from '@/lib/formatters';

interface TechnicalAnalysisProps {
    symbol: string;
    data: any;
    history: any[];
}


export default function TechnicalAnalysis({ symbol, data, history }: TechnicalAnalysisProps) {
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['Momentum', 'Trend', 'Volatility', 'Volume']));

    const toggleCategory = (category: string) => {
        const newExpanded = new Set(expandedCategories);
        if (newExpanded.has(category)) {
            newExpanded.delete(category);
        } else {
            newExpanded.add(category);
        }
        setExpandedCategories(newExpanded);
    };

    const categories = [
        {
            name: 'Momentum',
            icon: TrendingUp,
            color: 'blue',
            bgClass: 'bg-blue-50 dark:bg-blue-900/20',
            borderClass: 'border-blue-100 dark:border-blue-800',
            textClass: 'text-blue-600 dark:text-blue-400',
            hoverClass: 'hover:bg-blue-50/50 dark:hover:bg-blue-900/10'
        },
        {
            name: 'Trend',
            icon: LineChart,
            color: 'emerald',
            bgClass: 'bg-emerald-50 dark:bg-emerald-900/20',
            borderClass: 'border-emerald-100 dark:border-emerald-800',
            textClass: 'text-emerald-600 dark:text-emerald-400',
            hoverClass: 'hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10'
        },
        {
            name: 'Volume',
            icon: LineChart, // Fallback icon since BarChart2 is removed
            color: 'purple',
            bgClass: 'bg-purple-50 dark:bg-purple-900/20',
            borderClass: 'border-purple-100 dark:border-purple-800',
            textClass: 'text-purple-600 dark:text-purple-400',
            hoverClass: 'hover:bg-purple-50/50 dark:hover:bg-purple-900/10'
        }
    ];

    return (
        <div className="space-y-8">
            {/* Technical Divergence */}
            <div className="glass-card-light rounded-2xl p-8 border border-slate-200 dark:border-slate-800/50 shadow-sm">
                <div className="flex items-center gap-3 mb-8">
                    <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800">
                        <TrendingUp size={18} />
                    </div>
                    <div>
                        <h4 className="font-bold text-slate-800 dark:text-slate-100 text-lg">Technical Divergence</h4>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">Relative strength mapping</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {categories.map((category) => {
                        const indicators = data.fundamental?.technical_indicators?.filter((ind: any) => ind.category === category.name) || [];
                        const isExpanded = expandedCategories.has(category.name);
                        const Icon = category.icon;

                        return (
                            <div
                                key={category.name}
                                className={cn(
                                    "border rounded-2xl overflow-hidden transition-all duration-300",
                                    category.borderClass,
                                    isExpanded ? "shadow-md" : "shadow-sm"
                                )}
                            >
                                <button
                                    onClick={() => toggleCategory(category.name)}
                                    className={cn(
                                        "w-full flex items-center justify-between px-6 py-4 transition-colors",
                                        category.bgClass,
                                        category.hoverClass
                                    )}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={cn("p-2 rounded-lg", category.bgClass, category.borderClass, "border")}>
                                            <Icon size={16} className={category.textClass} />
                                        </div>
                                        <div className="text-left">
                                            <h5 className={cn("font-bold", category.textClass)}>{category.name}</h5>
                                            <p className="text-[10px] text-slate-500 dark:text-slate-400">
                                                {indicators.length} indicator{indicators.length !== 1 ? 's' : ''}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Badge className={cn("text-xs", category.bgClass, category.textClass, "border-none")}>
                                            {indicators.length}
                                        </Badge>
                                        <ChevronDown
                                            size={18}
                                            className={cn(
                                                "transition-transform duration-300",
                                                category.textClass,
                                                isExpanded && "rotate-180"
                                            )}
                                        />
                                    </div>
                                </button>

                                {isExpanded && (
                                    <div className="bg-white/50 dark:bg-slate-900/50 animate-in slide-in-from-top-2 duration-300">
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm">
                                                <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                                                    <tr>
                                                        <th className="px-4 py-3 text-left font-semibold text-slate-400 dark:text-slate-500 text-[9px]">Indicator</th>
                                                        <th className="px-4 py-3 text-center font-semibold text-slate-400 dark:text-slate-500 text-[9px]">Value</th>
                                                        <th className="px-4 py-3 text-left font-semibold text-slate-400 dark:text-slate-500 text-[9px]">Sector Range</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                                    {indicators.length > 0 ? (
                                                        indicators.map((indicator: any, i: number) => (
                                                            <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                                                                <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300 text-xs">
                                                                    <div className="flex items-center gap-1">
                                                                        {indicator.name}
                                                                        <IndicatorTooltip name={indicator.name} description="" />
                                                                    </div>
                                                                </td>
                                                                <td className="px-4 py-3 text-center">
                                                                    <span className={cn("px-2 py-1 rounded text-xs font-bold", category.bgClass, category.textClass)}>
                                                                        {indicator.value}
                                                                    </span>
                                                                </td>
                                                                <td className="px-4 py-3">
                                                                    {indicator.sector_high !== '-' ? (
                                                                        <div className="flex items-center gap-2">
                                                                            <div className="flex flex-col min-w-[50px]">
                                                                                <span className="text-[10px] text-rose-500 font-bold">{indicator.sector_low}</span>
                                                                                <span className="text-[8px] text-slate-400 dark:text-slate-500 font-mono">{indicator.sector_low_ticker || ''}</span>
                                                                            </div>
                                                                            <div className="flex-1 h-1 bg-slate-200 dark:bg-slate-700 rounded-full relative">
                                                                                <div className="absolute inset-0 bg-gradient-to-r from-rose-200 via-slate-200 to-emerald-200 dark:from-rose-900/30 dark:via-slate-700 dark:to-emerald-900/30 rounded-full"></div>
                                                                            </div>
                                                                            <div className="flex flex-col items-end min-w-[50px]">
                                                                                <span className="text-[10px] text-emerald-500 font-bold">{indicator.sector_high}</span>
                                                                                <span className="text-[8px] text-slate-400 dark:text-slate-500 font-mono">{indicator.sector_high_ticker || ''}</span>
                                                                            </div>
                                                                        </div>
                                                                    ) : (
                                                                        <span className="text-[10px] text-slate-400 italic">No data</span>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        ))
                                                    ) : (
                                                        <tr>
                                                            <td colSpan={3} className="px-4 py-6 text-center text-slate-400 text-xs italic">
                                                                No indicators available
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Fibonacci Retracement - Component has its own heading */}
            <FibonacciRetracement symbol={symbol} history={history} indicators={data?.fundamental?.technical_indicators || []} />

        </div>
    );
}
