'use client';

import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { useRouter } from 'next/navigation';

interface StockData {
    ticker: string;
    close: number;
    percent_change: number;
    turnover: number;
    sector?: string;
}

interface MarketBubbleMapProps {
    stocks: StockData[];
    height?: number | string;
}

export const MarketBubbleMap = ({ stocks, height = 450 }: MarketBubbleMapProps) => {
    const router = useRouter();

    const option = useMemo(() => {
        // Filter and sort stocks by turnover to keep the visual clean
        const topStocks = [...stocks]
            .sort((a, b) => b.turnover - a.turnover)
            .slice(0, 80);

        // Define sectors for categories
        const sectors = Array.from(new Set(topStocks.map(s => s.sector || 'Others')));

        const nodes = topStocks.map(s => {
            const size = Math.sqrt(s.turnover) / 20; // Scale size
            const colorThreshold = 2;
            let color = '#94a3b8'; // neutral slate

            if (s.percent_change > 0) {
                // Green shades
                color = s.percent_change > colorThreshold ? '#059669' : '#34d399';
            } else if (s.percent_change < 0) {
                // Red shades
                color = Math.abs(s.percent_change) > colorThreshold ? '#dc2626' : '#f87171';
            }

            return {
                name: s.ticker,
                value: s.turnover,
                symbolSize: Math.max(15, Math.min(size, 80)),
                category: s.sector || 'Others',
                draggable: true,
                itemStyle: {
                    color: color,
                    borderColor: '#fff',
                    borderWidth: 1,
                    shadowBlur: 10,
                    shadowColor: 'rgba(0,0,0,0.1)'
                },
                label: {
                    show: size > 25,
                    fontSize: 10,
                    fontWeight: 'bold',
                    color: '#fff'
                },
                tooltip: {
                    formatter: `${s.ticker}<br/>${s.sector}<br/>Change: ${s.percent_change}%<br/>Turnover: ${s.turnover.toLocaleString()}`
                }
            };
        });

        return {
            tooltip: {
                trigger: 'item'
            },
            legend: {
                data: sectors,
                top: 'bottom',
                textStyle: { color: '#64748b', fontSize: 10 },
                icon: 'circle'
            },
            series: [
                {
                    type: 'graph',
                    layout: 'force',
                    animation: true,
                    data: nodes,
                    categories: sectors.map(name => ({ name })),
                    force: {
                        repulsion: 100,
                        edgeLength: 5,
                        gravity: 0.1
                    },
                    roam: true,
                    emphasis: {
                        focus: 'adjacency',
                        lineStyle: {
                            width: 10
                        }
                    }
                }
            ]
        };
    }, [stocks]);

    const onEvents = {
        'click': (params: any) => {
            if (params.dataType === 'node') {
                router.push(`/stock/${params.name}`);
            }
        }
    };

    return (
        <ReactECharts
            option={option}
            onEvents={onEvents}
            style={{ height: height, width: '100%' }}
        />
    );
};
