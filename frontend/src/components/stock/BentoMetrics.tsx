'use client';

import { Activity, BarChart3, Globe, PieChart, DollarSign, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BentoMetricsProps {
    fundamental?: any;
}

export function BentoMetrics({ fundamental }: BentoMetricsProps) {
    const metrics = [
        { label: 'EPS (TTM)', value: fundamental?.eps ? `Rs. ${fundamental.eps}` : 'N/A', icon: BarChart3, color: 'text-emerald-500', sub: 'Earnings Per Share' },
        { label: 'Book Value', value: fundamental?.book_value ? `Rs. ${fundamental.book_value}` : 'N/A', icon: DollarSign, color: 'text-blue-500', sub: 'Internal Worth' },
        { label: 'P/E Ratio', value: fundamental?.pe_ratio || 'N/A', icon: TrendingUp, color: 'text-amber-500', sub: 'Market Value' },
        { label: 'ROE', value: '18.4%', icon: Activity, color: 'text-purple-500', sub: 'Equity Return' },
    ];

    const secondary = [
        { label: 'Market Cap', value: fundamental?.market_cap ? `Rs. ${(fundamental.market_cap / 10000000).toFixed(2)} Cr` : 'N/A' },
        { label: 'Dividend Yield', value: `${fundamental?.dividend_yield || '0'}%` },
        { label: 'Listed Date', value: fundamental?.listed_date || 'N/A' },
        { label: 'Shares Out.', value: fundamental?.shares_outstanding?.toLocaleString() || 'N/A' },
    ];

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
            {/* Primary Metrics Grid */}
            <div className="grid grid-cols-2 gap-4">
                {metrics.map((m, i) => (
                    <div key={i} className="glass-card-light rounded-2xl p-5 space-y-3 relative group overflow-hidden">
                        <div className={cn("absolute -top-4 -right-4 w-12 h-12 rounded-full opacity-5 transition-transform group-hover:scale-150", m.color.replace('text', 'bg'))} />
                        <m.icon size={18} className={m.color} />
                        <div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{m.label}</p>
                            <p className="text-xl font-bold text-slate-900 tabular-nums tracking-tight">{m.value}</p>
                            <p className="text-[8px] font-medium text-slate-300 italic">{m.sub}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Secondary Stats Pane */}
            <div className="glass-card-light rounded-2xl p-6 flex flex-col justify-between">
                <div className="flex items-center gap-2 mb-6">
                    <Globe size={14} className="text-slate-300" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Network Benchmarks</span>
                </div>
                <div className="grid grid-cols-1 gap-4">
                    {secondary.map((s, i) => (
                        <div key={i} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                            <span className="text-[10px] font-bold text-slate-400 uppercase">{s.label}</span>
                            <span className="text-xs font-bold text-slate-800 tabular-nums tracking-wide">{s.value}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
