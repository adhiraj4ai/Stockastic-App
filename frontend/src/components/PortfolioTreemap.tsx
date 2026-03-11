'use client';

import React, { useMemo, useState } from 'react';
import { Treemap, ResponsiveContainer, Tooltip } from 'recharts';
import { formatRupees } from '@/lib/formatters';
import { PortfolioItem } from '@/components/PortfolioTable';

interface PortfolioTreemapProps {
    items: PortfolioItem[];
    totalValue: number;
    onItemClick?: (item: PortfolioItem) => void;
}

// Custom content renderer for the treemap cells
function CustomizedContent(props: any) {
    const { x, y, width, height, name, pnlPercent, depth } = props;

    if (depth !== 1 || width < 30 || height < 25) return null;

    const isPositive = pnlPercent >= 0;

    // Color based on P&L %
    let bgColor: string;
    if (pnlPercent > 20) bgColor = '#059669';       // emerald-600
    else if (pnlPercent > 10) bgColor = '#10B981';   // emerald-500
    else if (pnlPercent > 5) bgColor = '#34D399';    // emerald-400
    else if (pnlPercent > 0) bgColor = '#6EE7B7';    // emerald-300
    else if (pnlPercent > -5) bgColor = '#FCA5A5';   // red-300
    else if (pnlPercent > -10) bgColor = '#F87171';   // red-400
    else if (pnlPercent > -20) bgColor = '#EF4444';   // red-500
    else bgColor = '#DC2626';                          // red-600

    const textColor = Math.abs(pnlPercent) > 5 ? '#FFFFFF' : (isPositive ? '#064E3B' : '#7F1D1D');
    const showPct = width > 50 && height > 30;
    const showName = width > 35;

    return (
        <g>
            <rect
                x={x}
                y={y}
                width={width}
                height={height}
                rx={6}
                ry={6}
                fill={bgColor}
                stroke="rgba(255,255,255,0.3)"
                strokeWidth={2}
                className="cursor-pointer transition-all hover:opacity-90"
                style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))' }}
            />
            {showName && (
                <text
                    x={x + width / 2}
                    y={y + height / 2 - (showPct ? 6 : 0)}
                    fill={textColor}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="font-black"
                    style={{ fontSize: Math.min(14, width / name.length * 1.3), fontWeight: 900 }}
                >
                    {name}
                </text>
            )}
            {showPct && (
                <text
                    x={x + width / 2}
                    y={y + height / 2 + 12}
                    fill={textColor}
                    textAnchor="middle"
                    dominantBaseline="central"
                    style={{ fontSize: 10, fontWeight: 800, opacity: 0.9 }}
                >
                    {isPositive ? '+' : ''}{pnlPercent.toFixed(1)}%
                </text>
            )}
        </g>
    );
}

// Custom tooltip
function CustomTooltip({ active, payload }: any) {
    if (!active || !payload || !payload.length) return null;

    const data = payload[0].payload;

    return (
        <div className="bg-gray-900/95 dark:bg-slate-950/95 text-white p-3 rounded-xl shadow-2xl border border-gray-700/50 dark:border-slate-700/50 backdrop-blur-sm min-w-[180px]">
            <div className="flex items-center justify-between border-b border-gray-700 dark:border-slate-700 pb-2 mb-2">
                <span className="font-black text-sm">{data.name}</span>
                <span className="text-[9px] font-bold text-slate-400 uppercase">{data.sector}</span>
            </div>
            <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                    <span className="text-slate-400">Value</span>
                    <span className="font-black">{formatRupees(data.value)}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-slate-400">Weight</span>
                    <span className="font-bold">{data.weight.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-slate-400">P&L</span>
                    <span className={`font-black ${data.pnlPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {data.pnlPercent >= 0 ? '+' : ''}{data.pnlPercent.toFixed(2)}%
                    </span>
                </div>
                <div className="flex justify-between">
                    <span className="text-slate-400">Profit</span>
                    <span className={`font-black ${data.pnlAmount >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatRupees(data.pnlAmount)}
                    </span>
                </div>
            </div>
        </div>
    );
}

export function PortfolioTreemap({ items, totalValue, onItemClick }: PortfolioTreemapProps) {
    const treemapData = useMemo(() => {
        if (!items.length) return [];

        return items.map(item => ({
            name: item.ticker,
            value: Math.max(Number(item.current_value), 1), // Treemap requires positive values
            pnlPercent: Number(item.gain_loss_percent),
            pnlAmount: Number(item.gain_loss),
            weight: totalValue > 0 ? (Number(item.current_value) / totalValue * 100) : 0,
            sector: item.sector || 'Unknown',
            item: item, // Keep reference to original item
        }));
    }, [items, totalValue]);

    if (treemapData.length === 0) {
        return (
            <div className="flex items-center justify-center h-full text-slate-400 dark:text-slate-500">
                <span className="text-sm">No holdings to visualize</span>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <ResponsiveContainer width="100%" height={320}>
                <Treemap
                    data={treemapData}
                    dataKey="value"
                    aspectRatio={4 / 3}
                    stroke="transparent"
                    content={<CustomizedContent />}
                    onClick={(data: any) => {
                        if (data?.item && onItemClick) {
                            onItemClick(data.item);
                        }
                    }}
                >
                    <Tooltip content={<CustomTooltip />} />
                </Treemap>
            </ResponsiveContainer>

            {/* Legend */}
            <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 px-2">
                <span>Bearish</span>
                <div className="flex gap-1">
                    <div className="h-2.5 w-6 rounded-sm bg-red-600" />
                    <div className="h-2.5 w-6 rounded-sm bg-red-400" />
                    <div className="h-2.5 w-6 rounded-sm bg-red-300" />
                    <div className="h-2.5 w-6 rounded-sm bg-emerald-300" />
                    <div className="h-2.5 w-6 rounded-sm bg-emerald-400" />
                    <div className="h-2.5 w-6 rounded-sm bg-emerald-600" />
                </div>
                <span>Bullish</span>
            </div>
        </div>
    );
}
