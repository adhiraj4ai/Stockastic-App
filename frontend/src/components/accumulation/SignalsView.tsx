'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, TrendingUp, TrendingDown, AlertTriangle, Crosshair, ArrowRight } from 'lucide-react';
import api from '@/lib/api';
import { Progress } from "@/components/ui/progress";
import Link from 'next/link';

interface Signal {
    symbol: string;
    name: string;
    sector: string;
    broker: number;
    cumulative_net: number;
    wac: number;
    ltp: number;
    markup_percent: number;
    signal_type: 'Platinum Buy' | 'Momentum Buy' | 'Contrarian Buy' | 'Watchlist';
    risk_reward: string;
}

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function SignalsView() {
    const [signals, setSignals] = useState<Signal[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchSignals = async () => {
            try {
                const res = await api.get('/api/stocks/broker-analysis/signals/');
                setSignals(res.data);
            } catch (err) {
                console.error("Failed to fetch signals", err);
            } finally {
                setLoading(false);
            }
        };
        fetchSignals();
    }, []);

    const groupedSignals = {
        platinum: signals.filter(s => s.signal_type === 'Platinum Buy'),
        momentum: signals.filter(s => s.signal_type === 'Momentum Buy'),
        contrarian: signals.filter(s => s.signal_type === 'Contrarian Buy'),
        watchlist: signals.filter(s => s.signal_type === 'Watchlist'),
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center p-20 space-y-4">
                <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
                <p className="text-slate-500 font-medium tracking-wide">Scanning for Smart Money Signals...</p>
            </div>
        );
    }

    const sections = [
        { id: 'platinum', label: 'Platinum', signals: groupedSignals.platinum, color: 'bg-indigo-500', badge: 'High Conviction', badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
        { id: 'momentum', label: 'Momentum', signals: groupedSignals.momentum, color: 'bg-emerald-500', badge: 'Trend Following', badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
        { id: 'contrarian', label: 'Contrarian', signals: groupedSignals.contrarian, color: 'bg-amber-500', badge: 'Dip Buying', badgeColor: 'bg-amber-50 text-amber-700 border-amber-200' },
        { id: 'watchlist', label: 'Watchlist', signals: groupedSignals.watchlist, color: 'bg-slate-400', badge: 'Wait for Pullback', badgeColor: 'bg-slate-50 text-slate-700 border-slate-200' },
    ];

    // Find first non-empty section to set as default tab
    const defaultTab = sections.find(s => s.signals.length > 0)?.id || 'platinum';

    return (
        <div className="space-y-8 pb-10">
            <div className="flex flex-col gap-2">
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Crosshair className="w-6 h-6 text-indigo-500" />
                    Smart Signals
                </h2>
                <p className="text-slate-500 dark:text-slate-400">
                    High-probability setups where Smart Money (Top Brokers) is accumulating, and price is still favorable.
                </p>
            </div>

            <Tabs defaultValue={defaultTab} className="w-full">
                <div className="flex justify-between items-center mb-6">
                    <TabsList className="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-1">
                        {sections.map(section => (
                            <TabsTrigger
                                key={section.id}
                                value={section.id}
                                className="px-4 py-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-800 data-[state=active]:shadow-sm rounded-md transition-all flex items-center gap-2"
                            >
                                <span className={`w-2 h-2 rounded-full ${section.color}`}></span>
                                {section.label}
                                <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                                    {section.signals.length}
                                </Badge>
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </div>

                {sections.map(section => (
                    <TabsContent key={section.id} value={section.id} className="mt-0 outline-none">
                        {section.signals.length > 0 ? (
                            <div className="space-y-6">
                                <div className="flex items-center gap-3">
                                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">{section.label} Setups</h3>
                                    <Badge variant="outline" className={section.badgeColor}>
                                        {section.badge}
                                    </Badge>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                    {section.signals.map(signal => (
                                        <SignalCard key={signal.symbol} signal={signal} />
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center p-20 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                                <p className="text-slate-500">No {section.label} signals found right now.</p>
                            </div>
                        )}
                    </TabsContent>
                ))}
            </Tabs>

            {signals.length === 0 && (
                <div className="flex flex-col items-center justify-center p-20 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                    <p className="text-slate-500">No signals found matching the criteria right now.</p>
                </div>
            )}
        </div>
    );
}

function SignalCard({ signal }: { signal: Signal }) {
    const isPositive = signal.markup_percent > 0;
    const progressValue = Math.min(Math.max((signal.markup_percent + 10) * 2, 0), 100); // Normalize -10 to +40 -> 0 to 100 roughly

    return (
        <Card className="hover:shadow-lg transition-all duration-300 border-slate-200 dark:border-slate-800 group relative overflow-hidden">
            <div className={`absolute top-0 left-0 w-1 h-full ${signal.signal_type === 'Platinum Buy' ? 'bg-indigo-500' :
                signal.signal_type === 'Momentum Buy' ? 'bg-emerald-500' :
                    signal.signal_type === 'Contrarian Buy' ? 'bg-amber-500' :
                        signal.signal_type === 'Watchlist' ? 'bg-slate-400' : 'bg-slate-400'
                }`}></div>

            <CardContent className="p-5">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <h4 className="text-xl font-black text-slate-800 dark:text-slate-100">{signal.symbol}</h4>
                            <span className="text-xs font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                {signal.sector}
                            </span>
                        </div>
                        <p className="text-sm text-slate-500 font-medium mt-1 truncate max-w-[200px]">{signal.name}</p>
                    </div>
                    <div className="text-right">
                        <div className="text-2xl font-mono font-bold text-slate-900 dark:text-slate-100">
                            Rs. {signal.ltp}
                        </div>
                        <div className={`text-xs font-bold flex items-center justify-end gap-1 ${isPositive ? 'text-emerald-600' : 'text-rose-600'
                            }`}>
                            {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {Math.abs(signal.markup_percent)}% vs WAC
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border border-slate-100 dark:border-slate-800/50">
                        <div className="flex justify-between text-sm mb-1">
                            <span className="text-slate-500">Whale Broker</span>
                            <span className="font-bold text-slate-700 dark:text-slate-300">Broker {signal.broker}</span>
                        </div>
                        <div className="flex justify-between text-sm mb-1">
                            <span className="text-slate-500">Accumulated</span>
                            <span className="font-mono font-medium text-slate-900 dark:text-slate-100">{signal.cumulative_net.toLocaleString()} qty</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-slate-500">Avg Cost (WAC)</span>
                            <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">Rs. {signal.wac}</span>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <div className="flex justify-between text-xs text-slate-500">
                            <span>WAC Zone</span>
                            <span>Breakout</span>
                        </div>
                        <Progress value={progressValue} className="h-2" />
                    </div>

                    <Link href={`/ticker/${signal.symbol}`} className="w-full">
                        <Button className="w-full group-hover:bg-indigo-600 transition-colors" size="sm">
                            Analyze Opportunity <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                    </Link>
                </div>
            </CardContent>
        </Card>
    );
}
