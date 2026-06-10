'use client';

import { TrendingUp, TrendingDown, Zap } from 'lucide-react';
import { SectionHead, Row, EmptyState, type TemplateProps } from './shared';

function ListTemplate({ data, t, listKey, title, subtitle, icon, mode }: TemplateProps & {
    listKey: 'top_gainers' | 'top_losers' | 'top_turnover';
    title: string;
    subtitle: string;
    icon: typeof TrendingUp;
    mode: 'percent' | 'turnover';
}) {
    const list = data.summary?.[listKey];
    if (!list?.length) return <EmptyState t={t} />;

    return (
        <div>
            <SectionHead t={t} icon={icon} title={title} subtitle={subtitle} />
            <div className="space-y-2">
                {list.slice(0, 5).map((stock: any, i: number) => (
                    <Row
                        key={stock.ticker}
                        t={t}
                        rank={i + 1}
                        label={stock.ticker}
                        sub={stock.sector}
                        value={mode === 'percent'
                            ? `${stock.percent_change >= 0 ? '+' : ''}${Number(stock.percent_change).toFixed(2)}%`
                            : `Rs. ${(stock.turnover / 1000000).toFixed(1)}M`}
                        valueClass={mode === 'percent'
                            ? (stock.percent_change >= 0 ? 'text-emerald-500' : 'text-rose-500')
                            : undefined}
                    />
                ))}
            </div>
        </div>
    );
}

export function Gainers(props: TemplateProps) {
    return <ListTemplate {...props} listKey="top_gainers" title="Top Gainers" subtitle="Today's performance leaders" icon={TrendingUp} mode="percent" />;
}

export function Losers(props: TemplateProps) {
    return <ListTemplate {...props} listKey="top_losers" title="Top Losers" subtitle="Biggest corrections today" icon={TrendingDown} mode="percent" />;
}

export function Turnover(props: TemplateProps) {
    return <ListTemplate {...props} listKey="top_turnover" title="Most Traded" subtitle="Highest turnover today" icon={Zap} mode="turnover" />;
}
