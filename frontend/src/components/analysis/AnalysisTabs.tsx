'use client';

import React from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useTickerAnalysis } from '@/hooks/useTickerAnalysis';
import { SignalsSection } from '@/components/analysis/SignalsSection';
import { TechnicalsSection } from '@/components/analysis/TechnicalsSection';
import { FundamentalsSection } from '@/components/analysis/FundamentalsSection';
import { AccumulationSection } from '@/components/analysis/AccumulationSection';

interface Ladder {
    cmp?: number; entry?: number; stopLoss?: number;
    tp1?: number; tp2?: number; tp3?: number; direction: 'BUY' | 'SELL';
}

const TABS = [
    { value: 'signals', label: 'Signals' },
    { value: 'technicals', label: 'Technicals' },
    { value: 'fundamentals', label: 'Fundamentals' },
    { value: 'accumulation', label: 'Accumulation' },
];

function DataState({ loading }: { loading: boolean }) {
    return (
        <div className="p-8 text-center text-sm text-muted-foreground">
            {loading ? 'Loading analysis…' : 'Analysis unavailable.'}
        </div>
    );
}

export function AnalysisTabs({ symbol, ladder }: { symbol: string; ladder: Ladder }) {
    const { loading, data } = useTickerAnalysis(symbol);
    const ready = !loading && !!data;
    return (
        <Tabs defaultValue="signals" className="w-full">
            <TabsList>
                {TABS.map(t => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}
            </TabsList>
            <TabsContent value="signals">
                {ready ? <SignalsSection data={data} ladder={ladder} /> : <DataState loading={loading} />}
            </TabsContent>
            <TabsContent value="technicals">
                {ready ? <TechnicalsSection data={data} /> : <DataState loading={loading} />}
            </TabsContent>
            <TabsContent value="fundamentals">
                {ready ? <FundamentalsSection data={data} /> : <DataState loading={loading} />}
            </TabsContent>
            <TabsContent value="accumulation">
                <AccumulationSection symbol={symbol} />
            </TabsContent>
        </Tabs>
    );
}
