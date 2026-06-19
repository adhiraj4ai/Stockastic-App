'use client';

import TickerAccumulation from '@/components/ticker/TickerAccumulation';

export function AccumulationSection({ symbol }: { symbol: string }) {
    return (
        <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 bg-slate-50/30 dark:bg-slate-950/20">
            <TickerAccumulation symbol={symbol} />
        </div>
    );
}
