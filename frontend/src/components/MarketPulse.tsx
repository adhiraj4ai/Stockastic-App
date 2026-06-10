'use client';

import { useMarketData } from '@/hooks/useMarketData';
import DashboardLayout from './DashboardLayout';
import { MarketStrip } from './home/MarketStrip';
import { TodaysSignals } from './home/TodaysSignals';
import { SmartMoneyHighlights } from './home/SmartMoneyHighlights';
import { WatchlistAlerts } from './home/WatchlistAlerts';

export function MarketPulse() {
    const { data, loading, marketStatus } = useMarketData(10000);

    return (
        <DashboardLayout
            noPadding
            title="Morning Briefing"
            subtitle="Your day at a glance — signals, smart money, and your watchlist."
        >
            <div className="space-y-6 p-6 pt-0">
                <MarketStrip
                    summary={data?.market_summary}
                    status={marketStatus}
                    loading={loading}
                />
                <TodaysSignals />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                    <SmartMoneyHighlights />
                    <WatchlistAlerts />
                </div>
            </div>
        </DashboardLayout>
    );
}
