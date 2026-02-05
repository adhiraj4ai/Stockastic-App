'use client';

import { useEffect, useRef } from 'react';

interface TradingViewChartProps {
    symbol: string;
    theme?: 'light' | 'dark';
    interval?: string;
    className?: string;
}

export function TradingViewChart({
    symbol,
    theme = 'dark',
    interval = 'D',
    className
}: TradingViewChartProps) {
    const container = useRef<HTMLDivElement>(null);
    const containerId = useRef(`tradingview_${Math.random().toString(36).substring(2, 9)}`);

    useEffect(() => {
        if (!container.current) return;

        const containerNode = container.current;
        containerNode.innerHTML = ""; // Clear previous content

        const script = document.createElement("script");
        script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
        script.type = "text/javascript";
        script.async = true;

        const config = {
            "autosize": true,
            "symbol": `NEPSE:${symbol}`,
            "interval": interval,
            "timezone": "Etc/UTC",
            "theme": theme,
            "style": "1",
            "locale": "en",
            "enable_publishing": false,
            "allow_symbol_change": true,
            "calendar": false,
            "support_host": "https://www.tradingview.com",
            "container_id": containerId.current
        };

        script.innerHTML = JSON.stringify(config);
        containerNode.appendChild(script);

        return () => {
            if (containerNode) {
                containerNode.innerHTML = "";
            }
        };
    }, [symbol, theme, interval]);

    return (
        <div className={className} style={{ height: '100%', width: '100%' }}>
            <div
                id={containerId.current}
                ref={container}
                className="tradingview-widget-container"
                style={{ height: '100%', width: '100%' }}
            />
        </div>
    );
}
