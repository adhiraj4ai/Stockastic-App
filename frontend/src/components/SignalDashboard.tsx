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
    metadata: {
        orders?: number;
        position_size?: number;
        optimized_params?: Record<string, number | string> | string;
        optimization_scope?: string;
        experiment_id?: number | null;
    };
}

/**
 * Enhanced RSI extraction logic with range support
 */
function getRsiInfo(params: any, fullMeta?: any): string {
    const data = (params && typeof params === 'object') ? params : (fullMeta || {});
    
    // Check various common keys for RSI data
    const rsi = data.rsi ?? data.RSI;
    const window = data.rsi_window ?? data.rsi_period ?? data.window ?? data.period;
    const upper = data.rsi_upper ?? data.overbought ?? data.upper;
    const lower = data.rsi_lower ?? data.oversold ?? data.lower;

    if (rsi !== undefined) return String(rsi);
    
    let result = '';
    if (window) result = `W:${window}`;
    
    if (upper !== undefined && lower !== undefined) {
        result += ` (${lower}-${upper})`;
    } else if (upper !== undefined) {
        result += ` U:${upper}`;
    } else if (lower !== undefined) {
        result += ` L:${lower}`;
    }
    
    return result || (params === 'Defaults Used' ? 'Standard' : '—');
}

/**
 * Combined reason logic: Optimization Scope + Current State (Orders/Holdings)
 */
function getReason(meta: StrategySignal['metadata']): string {
    if (!meta) return 'Default';
    
    const scope = meta.optimization_scope ?? 'DEFAULT';
    const orders = meta.orders ?? 0;
    const pos = meta.position_size;
    
    const scopeLabel: Record<string, string> = {
        SYMBOL: 'Asset Opt',
        SECTOR: 'Sector Opt',
        ALL: 'Market Model',
        DEFAULT: 'Standard',
    };

    const segments: string[] = [scopeLabel[scope] ?? scope];
    
    if (orders > 0) {
        segments.push(`${orders} Order${orders > 1 ? 's' : ''}`);
    } 
    
    if (pos !== undefined && pos !== 0) {
        segments.push(pos > 0 ? 'Long' : 'Short');
    }

    return segments.join(' · ');
}

/**
 * Shorten parameter keys for UI display
 */
function shortenKey(key: string): string {
    const maps: Record<string, string> = {
        'sma_fast': 'SF',
        'sma_slow': 'SS',
        'ema_fast': 'EF',
        'ema_slow': 'ES',
        'rsi_window': 'RW',
        'rsi_period': 'RP',
        'rsi_upper': 'RU',
        'rsi_lower': 'RL'
    };
    
    // Handle underscores and common terms
    const clean = key.toLowerCase()
        .replace(/_/g, ' ')
        .replace('period', 'per')
        .replace('length', 'len')
        .replace('multiplier', 'mult');
    
    return maps[key.toLowerCase()] ?? clean.charAt(0).toUpperCase() + clean.slice(1);
}

/**
 * Robust parameter extraction with filtering of internal keys
 */
function formatParams(params: any): Array<{ key: string; value: string }> {
    if (!params) return [];
    
    let p: Record<string, any>;
    if (typeof params === 'string') {
        if (params === 'Defaults Used') return [];
        try {
            p = JSON.parse(params);
        } catch {
            return [];
        }
    } else {
        p = params;
    }
    
    const excludeKeys = new Set([
        'rsi_period', 'rsi_window', 'rsi_upper', 'rsi_lower', 'overbought', 'oversold', 'rsi', 
        'orders', 'position_size', 'optimization_scope', 'experiment_id', 'optimized_params', 'RSI'
    ]);

    return Object.entries(p)
        .filter(([k, v]) => !excludeKeys.has(k) && typeof v !== 'object')
        .map(([k, v]) => ({
            key: shortenKey(k),
            value: typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : String(v)
        }));
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
        <div className="glass-card-light rounded-2xl border border-slate-200 dark:border-slate-800/50 p-6 relative group overflow-hidden shadow-sm">
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
                                <tr className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/30">
                                    <th className="p-3 font-bold">Strategy</th>
                                    <th className="p-3 font-bold text-center">Signal</th>
                                    <th className="p-3 font-bold text-center">Date</th>
                                    <th className="p-3 font-bold text-center">RSI Value</th>
                                    <th className="p-3 font-bold">Logic / Reason</th>
                                    <th className="p-3 font-bold">Parameters</th>
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
                                        <td className="p-3 text-center">
                                            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 font-mono bg-slate-100/50 dark:bg-slate-800/50 px-2 py-0.5 rounded">
                                                {getRsiInfo(sig.metadata?.optimized_params, sig.metadata)}
                                            </span>
                                        </td>
                                        <td className="p-3">
                                            <span className="text-[11px] leading-tight text-slate-500 dark:text-slate-400 block max-w-[150px]">
                                                {getReason(sig.metadata)}
                                            </span>
                                        </td>
                                        <td className="p-3">
                                            <div className="flex flex-wrap gap-1.5 max-w-[280px]">
                                                {(() => {
                                                    const params = sig.metadata?.optimized_params && sig.metadata.optimized_params !== 'Defaults Used' 
                                                        ? sig.metadata.optimized_params 
                                                        : sig.metadata;
                                                    const formatted = formatParams(params);
                                                    
                                                    if (formatted.length === 0) {
                                                        return <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 dark:text-slate-600">Standard</span>;
                                                    }
                                                    
                                                    return formatted.map(({ key, value }) => (
                                                        <div key={key} className="group/chip flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-700 transition-all shadow-sm">
                                                            <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase">{key}</span>
                                                            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 font-mono">{value}</span>
                                                        </div>
                                                    ));
                                                })()}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {signals.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="p-6 text-center text-slate-400 italic">No signals generated yet.</td>
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
