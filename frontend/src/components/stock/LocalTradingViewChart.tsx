'use client';

import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface LocalTradingViewChartProps {
    symbol: string;
    theme?: 'light' | 'dark';
}

export function LocalTradingViewChart({ symbol, theme = 'light' }: LocalTradingViewChartProps) {
    const [loading, setLoading] = useState(true);

    // Use Chukul's chart which has full TradingView features for NEPSE stocks
    const chartUrl = `https://chukul.com/chart?symbol=${symbol}`;

    useEffect(() => {
        // Give iframe time to load
        const timer = setTimeout(() => setLoading(false), 2000);
        return () => clearTimeout(timer);
    }, [symbol]);

    return (
        <div className="relative w-full h-full flex flex-col bg-white">
            {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
                    <div className="flex flex-col items-center gap-2">
                        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                        <span className="text-sm text-slate-500">Loading chart...</span>
                    </div>
                </div>
            )}
            <iframe
                src={chartUrl}
                className="w-full h-full border-0"
                onLoad={() => setLoading(false)}
                allow="fullscreen"
                title={`${symbol} Chart`}
            />
        </div>
    );
}
