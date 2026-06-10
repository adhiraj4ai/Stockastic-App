'use client';

import { Activity } from 'lucide-react';
import { useMarketData } from '@/hooks/useMarketData';
import DashboardLayout from './DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LiveMarketPulseTable } from './LiveMarketPulseTable';
import { LiveBulkTransactions } from './LiveBulkTransactions';
import { MarketStrip } from './home/MarketStrip';
import { TodaysSignals } from './home/TodaysSignals';
import { SmartMoneyHighlights } from './home/SmartMoneyHighlights';
import { WatchlistAlerts } from './home/WatchlistAlerts';

export function MarketPulse() {
    const { data, allStocks, loading, marketStatus } = useMarketData(10000);

    return (
        <DashboardLayout
            noPadding
            title="Morning Briefing"
            subtitle="Live market pulse plus your signals, smart money, and watchlist."
        >
            <div className="space-y-6 p-6 pt-0">
                <MarketStrip
                    summary={data?.market_summary}
                    status={marketStatus}
                    loading={loading}
                />

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                    <Card className="overflow-hidden lg:col-span-2">
                        <CardHeader className="px-5 py-4 border-b border-border">
                            <div className="flex justify-between items-center">
                                <div className="flex flex-col">
                                    <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                                        <Activity size={14} className="text-muted-foreground" /> Live Pulse Monitor
                                    </CardTitle>
                                    <p className="text-xs text-muted-foreground mt-0.5">Prices flash on update · 10s refresh</p>
                                </div>
                                <Badge variant="outline" className="font-normal text-xs gap-1.5">
                                    <span className={`h-1.5 w-1.5 rounded-full ${marketStatus === 'OPEN' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                                    {marketStatus === 'OPEN' ? 'Live' : 'Last session'}
                                </Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <LiveMarketPulseTable stocks={allStocks} />
                        </CardContent>
                    </Card>

                    <LiveBulkTransactions />
                </div>

                <TodaysSignals />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                    <SmartMoneyHighlights />
                    <WatchlistAlerts />
                </div>
            </div>
        </DashboardLayout>
    );
}
