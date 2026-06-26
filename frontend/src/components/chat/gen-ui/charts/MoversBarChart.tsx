'use client';

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Cell, ResponsiveContainer, Tooltip } from 'recharts';

export interface Mover {
    symbol: string;
    price_change: number;
}

export interface MoverBar {
    symbol: string;
    change: number;
    positive: boolean;
}

const num = (v: number) => Number(v ?? 0) || 0;

export function toMoverBars(gainers: Mover[], losers: Mover[], perSide = 5): MoverBar[] {
    const top = [...(gainers || [])].sort((a, b) => num(b.price_change) - num(a.price_change)).slice(0, perSide);
    const bottom = [...(losers || [])].sort((a, b) => num(a.price_change) - num(b.price_change)).slice(0, perSide);
    return [...top, ...bottom].map((m) => ({ symbol: m.symbol, change: num(m.price_change), positive: num(m.price_change) >= 0 }));
}

export default function MoversBarChart({ gainers, losers }: { gainers: Mover[]; losers: Mover[] }) {
    const bars = toMoverBars(gainers, losers);
    if (!bars.length) return null;
    return (
        <div className="w-full h-56">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bars} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} unit="%" />
                    <YAxis type="category" dataKey="symbol" width={64} tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip formatter={(v) => [`${Number(v).toFixed(2)}%`, 'Change']} />
                    <Bar dataKey="change">
                        {bars.map((b, i) => <Cell key={i} fill={b.positive ? '#10b981' : '#ef4444'} />)}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
