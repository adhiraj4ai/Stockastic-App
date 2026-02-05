'use client';
import { useState, useEffect } from 'react';
import api from '@/lib/api';

interface StrategySignal {
    id: number;
    strategy: number;
    strategy_name: string;
    strategy_description: string;
    symbol: string;
    date: string;
    signal: 'BUY' | 'SELL' | 'HOLD' | 'NEUTRAL';
    last_close: string;
    metadata: any;
}

export default function SignalDashboard({ symbol }: { symbol: string }) {
    const [signals, setSignals] = useState<StrategySignal[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchSignals();
    }, [symbol]);

    const fetchSignals = async () => {
        setLoading(true);
        try {
            const params: any = { symbol };
            const response = await api.get('/api/stocks/signals/', { params });
            if (response.data.results) {
                setSignals(response.data.results);
            }
        } catch (error) {
            console.error("Failed to fetch signals", error);
        } finally {
            setLoading(false);
        }
    };

    // Summary Statistics
    const buyCount = signals.filter(s => s.signal === 'BUY').length;
    const sellCount = signals.filter(s => s.signal === 'SELL').length;
    const holdCount = signals.filter(s => s.signal === 'HOLD').length;
    const total = signals.length;

    let consensus = "NEUTRAL";
    if (buyCount > sellCount && buyCount > holdCount) consensus = "BUY";
    if (sellCount > buyCount && sellCount > holdCount) consensus = "SELL";
    if (holdCount > buyCount && holdCount > sellCount) consensus = "HOLD";

    return (
        <div className="glass-card-light rounded-2xl p-6 relative group overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative z-10">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Daily Strategy Signals</h2>
                    <div className="flex gap-4 items-center">
                        <div className="px-4 py-2 bg-blue-50 dark:bg-slate-900 text-blue-600 dark:text-blue-400 rounded-lg border border-blue-100 dark:border-slate-800">
                            Consensus: <span className="font-bold">{consensus}</span>
                        </div>
                        <div className="text-sm text-slate-400 dark:text-slate-500">
                            Based on {total} strategies
                        </div>
                    </div>
                </div>

                <div className="space-y-4 max-h-[600px] overflow-y-auto custom-scrollbar">
                    {loading ? (
                        <div className="text-center text-slate-500 py-10">Loading signals...</div>
                    ) : (
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="text-sm text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800">
                                    <th className="p-3 font-semibold">Strategy</th>
                                    <th className="p-3 font-semibold text-center">Signal</th>
                                    <th className="p-3 font-semibold text-center">Date</th>
                                    <th className="p-3 font-semibold">Meta</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 dark:divide-slate-800 bg-white/20 dark:bg-slate-950/40">
                                {signals.map((sig) => (
                                    <tr key={sig.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                                        <td className="p-3">
                                            <div className="font-medium text-slate-700 dark:text-slate-200">{sig.strategy_name}</div>
                                            <div className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[200px]">{sig.strategy_description}</div>
                                        </td>
                                        <td className="p-3 text-center">
                                            <span className={`px-2 py-1 rounded text-[10px] font-bold ${sig.signal === 'BUY' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' :
                                                sig.signal === 'SELL' ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400' :
                                                    sig.signal === 'HOLD' ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' :
                                                        'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                                                }`}>
                                                {sig.signal}
                                            </span>
                                        </td>
                                        <td className="p-3 text-slate-500 dark:text-slate-400 text-sm text-center">{sig.date}</td>
                                        <td className="p-3 text-slate-400 dark:text-slate-500 text-xs font-mono">
                                            {JSON.stringify(sig.metadata)}
                                        </td>
                                    </tr>
                                ))}
                                {signals.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="p-6 text-center text-slate-400 italic">No signals generated yet.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}
