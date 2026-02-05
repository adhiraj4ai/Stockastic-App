import React from 'react';
import { TrendingUp } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface TechnicalDivergenceProps {
    technicalIndicators: any[];
}

export const TechnicalDivergence: React.FC<TechnicalDivergenceProps> = ({ technicalIndicators }) => {
    return (
        <div className="glass-card-light rounded-3xl p-8 border-slate-200 bg-white border shadow-sm">
            <div className="flex items-center gap-3 mb-10">
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
                    <TrendingUp size={18} />
                </div>
                <div>
                    <h4 className="font-bold text-slate-800 text-lg">Technical Divergence</h4>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Relative strength mapping</p>
                </div>
            </div>

            <div className="p-6">
                <Tabs defaultValue="Momentum" className="w-full">
                    <TabsList className="grid w-full grid-cols-4 mb-6 p-1 bg-slate-100/80 rounded-xl">
                        {['Momentum', 'Trend', 'Volatility', 'Volume'].map(cat => (
                            <TabsTrigger
                                key={cat}
                                value={cat}
                                className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-sm transition-all duration-200 text-[10px] sm:text-xs"
                            >
                                {cat}
                            </TabsTrigger>
                        ))}
                    </TabsList>

                    {['Momentum', 'Trend', 'Volatility', 'Volume'].map(category => {
                        const indicators = technicalIndicators?.filter((ind: any) => ind.category === category) || [];

                        return (
                            <TabsContent key={category} value={category} className="mt-0 focus-visible:outline-none ring-offset-background">
                                <div className="overflow-hidden overflow-y-auto max-h-[500px] rounded-2xl border border-slate-100 shadow-sm relative no-scrollbar">
                                    <table className="w-full text-sm">
                                        <thead className="bg-slate-50 border-b border-slate-100 backdrop-blur-sm sticky top-0 z-10">
                                            <tr>
                                                <th className="px-6 py-4 text-left font-bold text-slate-400 uppercase tracking-widest text-[9px]">Indicator</th>
                                                <th className="px-6 py-4 text-center font-bold text-slate-400 uppercase tracking-widest text-[9px]">Value</th>
                                                <th className="px-6 py-4 text-left font-bold text-slate-400 uppercase tracking-widest text-[9px]">Sector Range (Low - High)</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 bg-white">
                                            {indicators.length > 0 ? (
                                                indicators.map((indicator: any, i: number) => (
                                                    <tr key={i} className="hover:bg-slate-50/50 transition-colors group">
                                                        <td className="px-6 py-4 font-bold text-slate-700 whitespace-nowrap">{indicator.name}</td>
                                                        <td className="px-6 py-4 text-center">
                                                            <span className="px-2.5 py-1 rounded bg-slate-50 text-slate-700 font-bold text-xs ring-1 ring-slate-200 group-hover:bg-white group-hover:shadow-sm transition-all">{indicator.value}</span>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            {indicator.sector_high !== '-' ? (
                                                                <div className="flex items-center gap-4">
                                                                    <div className="flex flex-col min-w-[40px]">
                                                                        <span className="text-xs text-rose-500 font-bold uppercase">{indicator.sector_low}</span>
                                                                    </div>
                                                                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full relative overflow-hidden">
                                                                        <div className="absolute inset-0 bg-gradient-to-r from-rose-100 via-slate-100 to-emerald-100 opacity-50"></div>
                                                                        <div className="absolute top-0 bottom-0 w-1 bg-slate-400 rounded-full left-1/2 -translate-x-1/2 ring-2 ring-white"></div>
                                                                    </div>
                                                                    <div className="flex flex-col items-end min-w-[40px]">
                                                                        <span className="text-xs text-emerald-500 font-bold uppercase">{indicator.sector_high}</span>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <span className="text-xs text-slate-400 italic">No Sector Data</span>
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
