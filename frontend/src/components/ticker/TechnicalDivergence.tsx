import React from 'react';
import { TrendingUp } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface TechnicalDivergenceProps {
    technicalIndicators: any[];
}

export const TechnicalDivergence: React.FC<TechnicalDivergenceProps> = ({ technicalIndicators }) => {
    return (
        <div className="glass-card-light rounded-xl p-8">
            <div className="flex items-center gap-3 mb-10">
                <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800">
                    <TrendingUp size={18} />
                </div>
                <div>
                    <h4 className="font-bold text-slate-800 dark:text-slate-100 text-lg tracking-tight">Technical divergence</h4>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium tracking-tight">Relative strength mapping</p>
                </div>
            </div>

            <div className="p-6">
                <Tabs defaultValue="Momentum" className="w-full">
                    <TabsList className="grid w-full grid-cols-4 mb-6 p-1 bg-slate-100/80 dark:bg-slate-800/80 rounded-xl">
                        {['Momentum', 'Trend', 'Volatility', 'Volume'].map(cat => (
                            <TabsTrigger
                                key={cat}
                                value={cat}
                                className="rounded-lg transition-all duration-200 text-[10px] sm:text-xs"
                            >
                                {cat}
                            </TabsTrigger>
                        ))}
                    </TabsList>

                    {['Momentum', 'Trend', 'Volatility', 'Volume'].map(category => {
                        const indicators = technicalIndicators?.filter((ind: any) => ind.category === category) || [];

                        return (
                            <TabsContent key={category} value={category} className="mt-0 focus-visible:outline-none ring-offset-background">
                                <div className="overflow-hidden overflow-y-auto max-h-[500px] rounded-2xl border border-border dark:border-slate-800 shadow-sm relative no-scrollbar">
                                    <table className="w-full text-sm">
                                        <thead className="bg-slate-50 dark:bg-slate-800 border-b border-border dark:border-slate-800 sticky top-0 z-10">
                                            <tr>
                                                <th className="px-6 py-4 text-left font-semibold text-slate-400 tracking-tight text-[9px]">Indicator</th>
                                                <th className="px-6 py-4 text-center font-semibold text-slate-400 tracking-tight text-[9px]">Value</th>
                                                <th className="px-6 py-4 text-left font-semibold text-slate-400 tracking-tight text-[9px]">Sector range (low - high)</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white/50 dark:bg-card">
                                            {indicators.length > 0 ? (
                                                indicators.map((indicator: any, i: number) => (
                                                    <tr key={i} className="hover:bg-accent hover:text-accent-foreground transition-colors group">
                                                        <td className="px-6 py-4 font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap tracking-tight">{indicator.name}</td>
                                                        <td className="px-6 py-4 text-center">
                                                            <span className="px-2.5 py-1 rounded bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs ring-1 ring-slate-200 dark:ring-slate-700 group-hover:bg-white dark:group-hover:bg-slate-700 group-hover:shadow-sm transition-all tracking-tight">{indicator.value}</span>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            {indicator.sector_high !== '-' ? (
                                                                <div className="flex items-center gap-4">
                                                                    <div className="flex flex-col min-w-[40px]">
                                                                        <span className="text-xs text-rose-500 font-semibold tracking-tight">{indicator.sector_low}</span>
                                                                    </div>
                                                                    <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full relative overflow-hidden">
                                                                        <div className="absolute inset-0 bg-gradient-to-r from-rose-100 dark:from-rose-900/20 via-slate-100 dark:via-slate-800 to-emerald-100 dark:to-emerald-900/20 opacity-50"></div>
                                                                        <div className="absolute top-0 bottom-0 w-1 bg-slate-400 dark:bg-slate-500 rounded-full left-1/2 -translate-x-1/2 ring-2 ring-white dark:ring-slate-900"></div>
                                                                    </div>
                                                                    <div className="flex flex-col items-end min-w-[40px]">
                                                                        <span className="text-xs text-emerald-500 font-semibold tracking-tight">{indicator.sector_high}</span>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <span className="text-xs text-slate-400 italic">No sector data</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))
                                            ) : (
                                                <tr>
                                                    <td colSpan={3} className="px-6 py-8 text-center text-slate-400 italic">
                                                        No indicators available for this category.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </TabsContent>
                        );
                    })}
                </Tabs>
            </div>
        </div>
    );
};
