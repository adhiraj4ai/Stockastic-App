'use client';

import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

export interface AllocationSlice {
    ticker: string;
    current_value: number;
}

export interface DonutSegment {
    name: string;
    value: number;
    weight: number;
    [key: string]: unknown;
}

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7', '#94a3b8'];

export function toAllocationSegments(rows: AllocationSlice[], maxSlices = 6): DonutSegment[] {
    const total = rows.reduce((s, r) => s + (r.current_value || 0), 0);
    if (total <= 0) return [];
    const sorted = [...rows].filter((r) => r.current_value > 0).sort((a, b) => b.current_value - a.current_value);
    const head = sorted.slice(0, maxSlices);
    const restValue = sorted.slice(maxSlices).reduce((s, r) => s + r.current_value, 0);
    const segs = head.map((r) => ({ name: r.ticker, value: r.current_value, weight: (r.current_value / total) * 100 }));
    if (restValue > 0) segs.push({ name: 'Other', value: restValue, weight: (restValue / total) * 100 });
    return segs;
}

export default function AllocationDonut({ rows }: { rows: AllocationSlice[] }) {
    const segments = toAllocationSegments(rows);
    if (!segments.length) return null;
    return (
        <div className="w-full h-48">
            <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie data={segments} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" paddingAngle={2}>
                        {segments.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v, n) => [`Rs ${Math.round(Number(v)).toLocaleString()}`, n]} />
                </PieChart>
            </ResponsiveContainer>
        </div>
    );
}
