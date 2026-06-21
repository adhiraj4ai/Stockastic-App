'use client';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import axios from 'axios';
import { API_BASE_URL } from '@/lib/api';
import { TrendingUp } from 'lucide-react';
import { useTheme } from 'next-themes';

interface HistoryPoint {
    date: string;
    value: number;
}

export function SectorGraph() {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const [data, setData] = useState<HistoryPoint[]>([]);
    const [sector, setSector] = useState('NEPSE');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchHistory = async () => {
            setLoading(true);
            try {
                const response = await axios.get(`${API_BASE_URL}/api/stocks/sector-history/${sector}/`);
                // Format dates lightly? Recharts can parse timestamps but string is okay for category
                setData(response.data);
            } catch (err) {
                console.error("Failed to fetch sector history", err);
            } finally {
                setLoading(false);
            }
        };

        fetchHistory();
    }, [sector]);

    const isPositive = data.length > 1 && data[data.length - 1].value >= data[0].value;
    const color = isPositive ? "#16a34a" : "#dc2626"; // green-600 : red-600

    return (
        <Card className="h-full">
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
                        {sector} Index History
                        <TrendingUp className={`h-4 w-4 ${isPositive ? 'text-green-500' : 'text-red-500'}`} />
                    </CardTitle>
                    <Tabs value={sector} onValueChange={setSector} className="w-[400px]">
                        <TabsList className="grid w-full grid-cols-4">
                            <TabsTrigger value="NEPSE">NEPSE</TabsTrigger>
                            <TabsTrigger value="Commercial Bank">Banking</TabsTrigger>
                            <TabsTrigger value="Hydropower">Hydro</TabsTrigger>
                            <TabsTrigger value="Life Insurance">Life Ins</TabsTrigger>
                        </TabsList>
                    </Tabs>
                </div>
            </CardHeader>
            <CardContent className="h-[calc(100%-80px)]">
                <div className="h-full w-full">
                    {loading ? (
                        <div className="h-full w-full flex items-center justify-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                        </div>
                    ) : (data.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={data}>
                                <defs>
                                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                                        <stop offset="95%" stopColor={color} stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? '#1e293b' : '#E5E7EB'} />
                                <XAxis
                                    dataKey="date"
                                    tick={{ fontSize: 10, fill: isDark ? '#64748b' : '#94a3b8', fontWeight: 'bold' }}
                                    tickLine={false}
                                    axisLine={false}
                                    minTickGap={30}
                                />
                                <YAxis
                                    domain={['auto', 'auto']}
                                    tick={{ fontSize: 10, fill: isDark ? '#64748b' : '#94a3b8', fontWeight: 'bold' }}
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(val) => val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val}
                                />
                                <Tooltip
                                    contentStyle={{
                                        borderRadius: '8px',
                                        border: 'none',
                                        boxShadow: isDark ? '0 10px 15px -3px rgba(0, 0, 0, 0.4)' : '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                                        backgroundColor: isDark ? '#0f172a' : '#fff',
                                        color: isDark ? '#f8fafc' : '#0f172a'
                                    }}
                                    itemStyle={{ color: isDark ? '#f8fafc' : '#0f172a' }}
                                    labelStyle={{ color: isDark ? '#94a3b8' : '#64748b', fontWeight: 'bold', marginBottom: '4px' }}
                                    formatter={(value: number | string | (number | string)[] | undefined) => {
                                        if (value === undefined) return ['', 'Index Value'];
                                        return [Number(value).toLocaleString(), 'Index Value'];
                                    }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="value"
                                    stroke={color}
                                    strokeWidth={2}
                                    fillOpacity={1}
                                    fill="url(#colorValue)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-full flex items-center justify-center text-gray-500">
                            No data available for {sector}
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
