'use client';

import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from 'recharts';

interface ForecastChartProps {
    symbol: string;
    historicalData?: Array<{ date: string; price: number }>;
    forecastData: Array<{
        date: string;
        predicted_price: number;
        confidence_lower?: number;
        confidence_upper?: number;
    }>;
    height?: number;
}

export default function ForecastChart({ symbol, historicalData = [], forecastData, height = 400 }: ForecastChartProps) {
    const [chartData, setChartData] = useState<any[]>([]);

    useEffect(() => {
        // Combine historical and forecast data
        const combined: any[] = [];

        // Add historical data
        historicalData.forEach(item => {
            combined.push({
                date: new Date(item.date).toLocaleDateString(),
                actual: item.price,
                forecast: null,
                lower: null,
                upper: null,
                type: 'historical'
            });
        });

        // Add forecast data
        forecastData.forEach(item => {
            combined.push({
                date: new Date(item.date).toLocaleDateString(),
                actual: null,
                forecast: parseFloat(item.predicted_price.toString()),
                lower: item.confidence_lower ? parseFloat(item.confidence_lower.toString()) : null,
                upper: item.confidence_upper ? parseFloat(item.confidence_upper.toString()) : null,
                type: 'forecast'
            });
        });

        setChartData(combined);
    }, [historicalData, forecastData]);

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
                    <p className="font-semibold text-sm mb-1">{label}</p>
                    {payload.map((entry: any, index: number) => (
                        <p key={index} className="text-xs" style={{ color: entry.color }}>
                            {entry.name}: {entry.value ? `Rs. ${entry.value.toFixed(2)}` : 'N/A'}
                        </p>
                    ))}
                </div>
            );
        }
        return null;
    };

    return (
        <div className="w-full">
            <ResponsiveContainer width="100%" height={height}>
                <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="colorForecast" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#94a3b8" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                        dataKey="date"
                        tick={{ fontSize: 12 }}
                        interval="preserveStartEnd"
                    />
                    <YAxis
                        tick={{ fontSize: 12 }}
                        domain={['auto', 'auto']}
                        tickFormatter={(value) => `Rs. ${value}`}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />

                    {/* Confidence interval */}
                    <Area
                        type="monotone"
                        dataKey="upper"
                        stroke="none"
                        fill="#ddd6fe"
                        fillOpacity={0.3}
                        name="Upper Bound"
                    />
                    <Area
                        type="monotone"
                        dataKey="lower"
                        stroke="none"
                        fill="#ddd6fe"
                        fillOpacity={0.3}
                        name="Lower Bound"
                    />

                    {/* Actual price line */}
                    <Line
                        type="monotone"
                        dataKey="actual"
                        stroke="#6366f1"
                        strokeWidth={2}
                        dot={false}
                        name="Actual Price"
                        connectNulls={false}
                    />

                    {/* Forecast line */}
                    <Line
                        type="monotone"
                        dataKey="forecast"
                        stroke="#94a3b8"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        dot={{ fill: '#94a3b8', r: 3 }}
                        name="Forecast"
                        connectNulls={false}
                    />
                </AreaChart>
            </ResponsiveContainer>

            <div className="flex items-center justify-center gap-6 mt-4 text-sm">
                <div className="flex items-center gap-2">
                    <div className="w-4 h-0.5 bg-blue-500"></div>
                    <span className="text-gray-600">Historical</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-4 h-0.5 bg-purple-500 border-dashed border-t-2 border-purple-500"></div>
                    <span className="text-gray-600">Forecast</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-4 h-3 bg-purple-200 opacity-50"></div>
                    <span className="text-gray-600">Confidence Interval</span>
                </div>
            </div>
        </div>
    );
}
