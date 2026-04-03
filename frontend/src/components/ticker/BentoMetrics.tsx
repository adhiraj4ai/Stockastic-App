'use client';

import { Activity, BarChart3, Globe, PieChart, DollarSign, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatNepaliNumber, formatRupees } from '@/lib/formatters';
import { InfoTooltip } from '@/components/ui/InfoTooltip';

interface BentoMetricsProps {
    fundamental?: any;
}

export function BentoMetrics({ fundamental }: BentoMetricsProps) {
    const metrics = [
        { label: 'EPS (TTM)', value: formatRupees(fundamental?.eps), icon: BarChart3, color: 'text-emerald-500', sub: 'Earnings Per Share', tooltip: 'Earnings Per Share (Trailing 12 Months). Indicates how much profit is generated per share.' },
        { label: 'Book Value', value: formatRupees(fundamental?.book_value), icon: DollarSign, color: 'text-blue-500', sub: 'Internal Worth', tooltip: 'Net asset value per share. The theoretical value if the company were liquidated today.' },
        { label: 'P/E Ratio', value: fundamental?.pe_ratio || 'N/A', icon: TrendingUp, color: 'text-amber-500', sub: 'Market Value', tooltip: 'Price-to-Earnings ratio. Compares the current share price to its annual earnings.' },
        { label: 'ROE', value: '18.4%', icon: Activity, color: 'text-purple-500', sub: 'Equity Return', tooltip: 'Return on Equity. Measures how efficiently a company uses shareholder capital to generate profit.' },
    ];

    const secondary = [
        { label: 'Market Cap', value: fundamental?.market_cap ? `${formatRupees(fundamental.market_cap / 10000000)} Cr` : 'N/A', tooltip: 'Total market value of all outstanding shares.' },
        { label: 'Dividend Yield', value: `${fundamental?.dividend_yield || '0'}%`, tooltip: 'Annual dividend as a percentage of the current share price.' },
        { label: 'Listed Date', value: fundamental?.listed_date || 'N/A', tooltip: 'The date when the company was first listed on the exchange.' },
        { label: 'Shares Out.', value: formatNepaliNumber(fundamental?.shares_outstanding) || 'N/A', tooltip: 'Total number of shares currently issued by the company.' },
    ];

    // Extract Technical Levels
    // console.log('Fundamental Data:', fundamental);
    const indicators = fundamental?.technical_indicators || [];
    const getPivot = (key: string) => indicators.find((i: any) => i.name?.includes(key))?.value || '-';

    const p = getPivot('Pivot (P)');
    const r1 = getPivot('Resistance 1');
    const r2 = getPivot('Resistance 2');
    const s1 = getPivot('Support 1');
    const s2 = getPivot('Support 2');

    const mixedMetrics = [
        ...metrics,
        { label: 'Resistance 2', value: r2, icon: Activity, color: 'text-rose-600', sub: 'Major Ceiling', tooltip: 'Strong resistance level where heavy selling is historically expected.' },
        { label: 'Resistance 1', value: r1, icon: TrendingUp, color: 'text-rose-400', sub: 'Key Resistance', tooltip: 'Immediate price level that may act as a barrier to further upside.' },
        { label: 'Pivot Point', value: p, icon: BarChart3, color: 'text-blue-600', sub: 'Trend Anchor', tooltip: 'The central turning point for price direction calculated from the previous session.' },
        { label: 'Support 1', value: s1, icon: TrendingUp, color: 'text-emerald-400', sub: 'Key Support', tooltip: 'Immediate price level where buying interest is historically expected to emerge.' },
        { label: 'Support 2', value: s2, icon: Activity, color: 'text-emerald-600', sub: 'Major Floor', tooltip: 'Strong support level where heavy buying historically defends the price.' },
    ];

    return (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 h-full">
            {/* Primary Metrics 3x3 Grid */}
            <div className="md:col-span-8 grid grid-cols-2 md:grid-cols-3 gap-4">
                {mixedMetrics.map((m, i) => (
                    <div key={i} className="glass-card-light rounded-2xl border dark:border-slate-800/50 p-4 space-y-2 relative group overflow-hidden flex flex-col justify-between h-32 md:h-28">
                        <div className={cn("absolute -top-4 -right-4 w-12 h-12 rounded-full opacity-5 transition-transform group-hover:scale-150", m.color.replace('text', 'bg'))} />
                        <m.icon size={16} className={m.color} />
                        <div>
                            <div className="flex items-center">
                                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 truncate">{m.label}</p>
                                {(m as any).tooltip && <InfoTooltip content={(m as any).tooltip} />}
                            </div>
                            <p className="text-xl font-bold text-slate-900 dark:text-slate-100 tabular-nums tracking-tight truncate">{m.value}</p>
                            <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 italic truncate">{m.sub}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Secondary Stats Pane (Narrower) */}
            <div className="md:col-span-4 glass-card-light rounded-2xl border dark:border-slate-800/50 p-6 flex flex-col justify-start space-y-6">
                <div className="flex items-center gap-2 mb-2">
                    <Globe size={14} className="text-slate-400" />
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Network Benchmarks</span>
                </div>
                <div className="grid grid-cols-1 gap-4">
                    {secondary.map((s, i) => (
                        <div key={i} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
                            <div className="flex items-center gap-1">
                                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{s.label}</span>
                                {(s as any).tooltip && <InfoTooltip content={(s as any).tooltip} />}
                            </div>
                            <span className="text-sm font-bold text-slate-800 dark:text-slate-200 tabular-nums tracking-wide">{s.value}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
