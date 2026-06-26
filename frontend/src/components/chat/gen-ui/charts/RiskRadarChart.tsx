'use client';

import React from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';

export interface RadarAxis {
    axis: string;
    value: number;
    fullMark: number;
}

export function toRadarPoints(data: RadarAxis[]): RadarAxis[] {
    return (data || []).filter((d) => d.fullMark > 0);
}

export default function RiskRadarChart({ radar_data }: { radar_data: RadarAxis[] }) {
    const points = toRadarPoints(radar_data);
    if (points.length < 3) return null; // a radar needs at least 3 axes to read
    const max = Math.max(...points.map((p) => p.fullMark));
    return (
        <div className="w-full h-52">
            <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="78%" data={points}>
                    <PolarGrid stroke="#e2e8f0" />
                    <PolarAngleAxis dataKey="axis" tick={{ fill: '#64748b', fontSize: 11 }} />
                    <PolarRadiusAxis angle={30} domain={[0, max]} axisLine={false} tick={false} />
                    <Radar name="Risk" dataKey="value" stroke="#6366f1" fill="#6366f1" fillOpacity={0.4} />
                    <Tooltip />
                </RadarChart>
            </ResponsiveContainer>
        </div>
    );
}
