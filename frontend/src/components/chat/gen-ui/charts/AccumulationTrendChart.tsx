'use client';

import React from 'react';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine } from 'recharts';

export interface NetPoint {
    date: string;
    net: number;
}

export function toTrendPoints(series: NetPoint[]): NetPoint[] {
    return (series || []).filter((p) => p.date).map((p) => ({ date: p.date, net: Number(p.net ?? 0) || 0 }));
}

export default function AccumulationTrendChart({ series }: { series: NetPoint[] }) {
    const points = toTrendPoints(series);
    if (points.length < 2) return null;
    return (
        <div className="w-full h-44">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={points} margin={{ left: 8, right: 12, top: 8 }}>
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} minTickGap={24} />
                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} width={48} />
                    <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
                    <Tooltip formatter={(v) => [Math.round(Number(v)).toLocaleString(), 'Net']} />
                    <Area type="monotone" dataKey="net" stroke="#6366f1" fill="#6366f1" fillOpacity={0.25} />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
