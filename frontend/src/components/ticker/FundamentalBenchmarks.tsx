import React from 'react';
import { BarChart2 } from 'lucide-react';
import { formatRupees } from '@/lib/formatters';

interface FundamentalBenchmarksProps {
    fundamental: any;
}

export const FundamentalBenchmarks: React.FC<FundamentalBenchmarksProps> = ({ fundamental }) => {
    if (!fundamental) return null;

    return (
        <div className="glass-card-light rounded-3xl p-8">
            <div className="flex items-center gap-3 mb-10">
                <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800">
                    <BarChart2 size={18} />
                </div>
                <div>
                    <h4 className="font-bold text-slate-800 dark:text-slate-100 text-lg">Fundamental Benchmarks</h4>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">Sector-wide comparison</p>
                </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-100 dark:border-slate-800">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-800">
                        <tr>
                            <th className="px-6 py-4 text-left font-bold text-slate-400 uppercase tracking-widest text-[9px]">Metric</th>
                            <th className="px-6 py-4 text-center font-bold text-slate-400 uppercase tracking-widest text-[9px]">Value</th>
                            <th className="px-6 py-4 text-left font-bold text-slate-400 uppercase tracking-widest text-[9px]">Sector Range (Low - High)</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white/50 dark:bg-slate-900/50">
                        {[
                            { name: 'P/E Ratio', key: 'pe_ratio', label: 'P/E Ratio' },
                            { name: 'P/B Ratio', key: 'price_to_book', label: 'P/B Ratio' },
                            { name: 'ROE (%)', key: 'ro_equity', label: 'ROE' },
                            { name: 'EPS', key: 'eps', label: 'EPS' },
                            { name: 'Dividend Yield', key: 'dividend_yield', label: 'Dividend Yield' },
                            { name: 'Book Value', key: 'book_value', label: 'Book Value' },
                            { name: 'Market Cap', key: 'market_cap', label: 'Mkt Cap' }
                        ].map((metric, i) => {
                            const indicator = fundamental?.fundamental_indicators?.find((ind: any) =>
                                ind.name.toLowerCase().includes(metric.label.toLowerCase()) ||
                                metric.label.toLowerCase().includes(ind.name.toLowerCase())
                            ) || fundamental?.fundamental_indicators?.find((ind: any) => ind.name === metric.name);

                            const rawValue = fundamental?.[metric.key];
                            const displayValue = indicator?.value || formatRupees(rawValue);

                            return (
                                <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors group">
                                    <td className="px-6 py-4 font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">{metric.name}</td>
                                    <td className="px-6 py-4 text-center">
                                        <span className="px-2.5 py-1 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-bold text-xs ring-1 ring-blue-100 dark:ring-blue-800">{displayValue}</span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-4">
                                            <div className="flex flex-col min-w-[40px]">
                                                <span className="text-xs text-rose-500 dark:text-rose-400 font-bold uppercase">{indicator?.sector_low || '-'}</span>
                                                <span className="text-[8px] text-slate-400 dark:text-slate-500 font-mono leading-tight">{indicator?.sector_low_ticker || ''}</span>
                                            </div>
                                            <div className="flex-1 h-1 bg-slate-100 dark:bg-slate-800 rounded-full relative">
                                                <div className="absolute top-1/2 left-1/4 w-1.5 h-1.5 -translate-y-1/2 bg-blue-500 rounded-full shadow-sm" />
                                            </div>
                                            <div className="flex flex-col items-end min-w-[40px]">
                                                <span className="text-xs text-emerald-500 dark:text-emerald-400 font-bold uppercase">{indicator?.sector_high || '-'}</span>
                                                <span className="text-[8px] text-slate-400 dark:text-slate-500 font-mono leading-tight">{indicator?.sector_high_ticker || ''}</span>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
