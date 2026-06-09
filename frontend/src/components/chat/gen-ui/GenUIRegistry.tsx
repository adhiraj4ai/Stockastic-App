/**
 * Maps backend tool card `type` strings to React components.
 *
 * Backend chat tools push card payloads in the shape:
 *   { type: "stock_card" | "technicals" | …, data: {...} }
 *
 * GenUIContainer below renders the right component for that type, passing
 * `data` as props. Adapters live inline so the components themselves stay
 * pure prop-typed React components reusable elsewhere.
 */

import React from 'react';
import dynamic from 'next/dynamic';

const LOADER = (cls = 'h-32') => (
    <div className={`${cls} w-full animate-pulse rounded-md bg-muted/40`} />
);

const StockCard = dynamic(() => import('./StockCard'), { loading: () => LOADER('h-40') });
const WhaleWatchCard = dynamic(() => import('./WhaleWatchCard'), { loading: () => LOADER('h-56') });
const FibonacciCard = dynamic(() => import('./FibonacciCard'), { loading: () => LOADER('h-44') });
const MarketSummary = dynamic(() => import('./MarketSummary'), { loading: () => LOADER('h-64') });
const SignalCard = dynamic(() => import('./SignalCard'), { loading: () => LOADER('h-44') });
const PortfolioCard = dynamic(() => import('./PortfolioCard'), { loading: () => LOADER('h-40') });
const HoldingsCard = dynamic(() => import('./HoldingsCard'), { loading: () => LOADER('h-56') });
const TechnicalsCard = dynamic(() => import('./TechnicalsCard'), { loading: () => LOADER('h-56') });
const FundamentalsCard = dynamic(() => import('./FundamentalsCard'), { loading: () => LOADER('h-40') });
const RiskCard = dynamic(() => import('./RiskCard'), { loading: () => LOADER('h-48') });

// Cards that share a module
const SimpleCards = {
    WatchlistCard: dynamic(() => import('./SimpleCards').then((m) => m.WatchlistCard), {
        loading: () => LOADER('h-56'),
    }),
    DividendsCard: dynamic(() => import('./SimpleCards').then((m) => m.DividendsCard), {
        loading: () => LOADER('h-44'),
    }),
    AccumulationCard: dynamic(() => import('./SimpleCards').then((m) => m.AccumulationCard), {
        loading: () => LOADER('h-44'),
    }),
    PriceHistoryCard: dynamic(() => import('./SimpleCards').then((m) => m.PriceHistoryCard), {
        loading: () => LOADER('h-36'),
    }),
    PositionSizingCard: dynamic(() => import('./SimpleCards').then((m) => m.PositionSizingCard), {
        loading: () => LOADER('h-44'),
    }),
    RealizedPnLCard: dynamic(() => import('./SimpleCards').then((m) => m.RealizedPnLCard), {
        loading: () => LOADER('h-32'),
    }),
};

interface GenUIContainerProps {
    type: string;
    data: any;
}

/**
 * The single entrypoint. Switches on backend `type`; each branch knows the
 * shape of `data` and forwards it to the right component.
 */
export const GenUIContainer: React.FC<GenUIContainerProps> = ({ type, data }) => {
    if (!data) return null;

    switch (type) {
        case 'stock_card':
            return <StockCard {...data} />;
        case 'whale_watch':
            return <WhaleWatchCard date={data.date} whales={data.whales || []} />;
        case 'fibonacci':
            return <FibonacciCard {...data} />;
        case 'market_summary':
            return (
                <MarketSummary
                    market_index={data.market_index ?? data.total_points}
                    top_gainers={data.top_gainers || []}
                    top_losers={data.top_losers || []}
                />
            );
        case 'signal':
            return <SignalCard {...data} />;
        case 'portfolio':
            return <PortfolioCard {...data} />;
        case 'holdings':
            return <HoldingsCard holdings={data.holdings || []} />;
        case 'technicals':
            return <TechnicalsCard symbol={data.symbol} groups={data.groups || {}} />;
        case 'fundamentals':
            return <FundamentalsCard {...data} />;
        case 'risk':
            return <RiskCard {...data} />;
        case 'watchlist':
            return <SimpleCards.WatchlistCard rows={data.rows || []} />;
        case 'dividends':
            return <SimpleCards.DividendsCard symbol={data.symbol} rows={data.rows || []} />;
        case 'accumulation':
            return <SimpleCards.AccumulationCard symbol={data.symbol} rows={data.rows || []} />;
        case 'price_history':
            return <SimpleCards.PriceHistoryCard symbol={data.symbol} rows={data.rows || []} />;
        case 'position_sizing':
            return <SimpleCards.PositionSizingCard {...data} />;
        case 'realized_pnl':
            return <SimpleCards.RealizedPnLCard {...data} />;
        default:
            return (
                <div className="px-3 py-2 rounded-md border border-border bg-muted/40 text-xs text-muted-foreground">
                    Unknown card type: <span className="font-mono">{type}</span>
                </div>
            );
    }
};

export default GenUIContainer;
