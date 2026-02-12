'use client';

import { useState, useEffect } from 'react';
import { Check, Calendar, Zap, TrendingUp, ShieldCheck, Scale, Settings } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { Badge } from '@/components/ui/badge';

interface ParameterSet {
    experiment_id: number;
    parameters: Record<string, any>;
    metrics: {
        return_pct: number;
        sharpe_ratio: number;
        win_rate: number;
        max_drawdown: number;
    };
}

interface SymbolConfig {
    id: number;
    strategy: number;
    symbol: string;
    preferred_objective: 'win_rate' | 'profit' | 'balanced';
    published_params: {
        'win_rate'?: ParameterSet;
        'profit'?: ParameterSet;
        'balanced'?: ParameterSet;
    };
    updated_at?: string;
}

interface Props {
    strategyId: number;
    symbol: string;
    onParametersSelected?: (params: Record<string, any>, objective: string) => void;
}

const OBJECTIVES = [
    { value: 'profit', label: 'Max Profit', subtitle: 'Aggressive Growth', icon: TrendingUp, color: 'emerald' },
    { value: 'win_rate', label: 'Win Rate', subtitle: 'Safety & Precision', icon: ShieldCheck, color: 'indigo' },
    { value: 'balanced', label: 'Balanced', subtitle: 'Optimal Risk/Reward', icon: Scale, color: 'blue' }
] as const;

export default function ParameterObjectiveSelector({ strategyId, symbol, onParametersSelected }: Props) {
    const [config, setConfig] = useState<SymbolConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedObjective, setSelectedObjective] = useState<'win_rate' | 'profit' | 'balanced'>('balanced');

    useEffect(() => {
        fetchConfig();
    }, [strategyId, symbol]);

    const fetchConfig = async () => {
        try {
            setLoading(true);
            const response = await api.get(`/api/stocks/strategies/${strategyId}/symbol_config/`, {
                params: { symbol }
            });
            setConfig(response.data);
            setSelectedObjective(response.data.preferred_objective);

            // Auto-select parameters from preferred objective but DON'T change dates
            const paramSet = response.data.published_params[response.data.preferred_objective];
            if (paramSet && onParametersSelected) {
                onParametersSelected(paramSet.parameters, response.data.preferred_objective);
            }
        } catch (error) {
            console.error('Failed to fetch symbol config:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleObjectiveSelect = async (objective: 'win_rate' | 'profit' | 'balanced') => {
        try {
            setSelectedObjective(objective);

            // Update backend preference
            await api.post(`/api/stocks/strategies/${strategyId}/set_symbol_config/`, {
                symbol,
                preferred_objective: objective
            });

            // Call callback with new parameters
            const paramSet = config?.published_params[objective];
            if (paramSet && onParametersSelected) {
                onParametersSelected(paramSet.parameters, objective);
            }

            toast.success(`Switched to ${objective.replace('_', ' ')} parameters`);
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Failed to update configuration');
        }
    };

    if (loading) {
        return (
            <div className="py-4 space-y-3">
                <div className="h-4 bg-gray-100 dark:bg-slate-800 rounded w-1/2 animate-pulse" />
                <div className="space-y-2">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-16 bg-gray-50 dark:bg-slate-800/50 rounded-xl animate-pulse" />
                    ))}
                </div>
            </div>
        );
    }

    if (!config || Object.keys(config.published_params).length === 0) {
        return null;
    }

    return (
        <div className="mb-6 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="flex items-center gap-2 mb-3">
                <Settings size={14} className="text-slate-400" />
                <span className="text-[11px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest">
                    Performance Flavor
                </span>
            </div>

            <div className="space-y-1">
                {OBJECTIVES.map((obj) => {
                    const paramSet = config.published_params[obj.value];
                    const isSelected = selectedObjective === obj.value;
                    const isAvailable = !!paramSet;
                    const Icon = obj.icon;

                    // Extract metrics with fallbacks
                    const returnPct = paramSet?.metrics?.return_pct ?? 0;
                    const sharpeRatio = paramSet?.metrics?.sharpe_ratio ?? 0;

                    return (
                        <button
                            key={obj.value}
                            onClick={() => isAvailable && handleObjectiveSelect(obj.value)}
                            disabled={!isAvailable}
                            className={`
                                w-full group relative flex items-center gap-3 p-3 rounded-xl transition-all duration-300
                                ${isSelected && isAvailable
                                    ? 'bg-slate-50 dark:bg-slate-800'
                                    : isAvailable
                                        ? 'hover:bg-slate-50/50 dark:hover:bg-slate-800/50'
                                        : 'opacity-40 grayscale cursor-not-allowed'
                                }
                            `}
                        >
                            <div className={`
                                p-2 rounded-lg transition-all
                                ${isSelected
                                    ? `bg-${obj.color}-100 dark:bg-${obj.color}-900/30 text-${obj.color}-600 dark:text-${obj.color}-400`
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400 group-hover:bg-slate-200 dark:group-hover:bg-slate-700 group-hover:text-slate-600'}
                            `}>
                                <Icon size={18} />
                            </div>

                            <div className="flex-1 text-left min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className={`text-[13px] font-black uppercase tracking-tight transition-colors ${isSelected ? 'text-slate-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-400'}`}>
                                        {obj.label}
                                    </span>
                                    {obj.value === 'balanced' && (
                                        <span className="text-[8px] font-black bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded tracking-widest animate-pulse">REC</span>
                                    )}
                                </div>
                                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 truncate opacity-80 uppercase tracking-tighter">
                                    {obj.subtitle}
                                </p>
                            </div>

                            {isAvailable && (
                                <div className="text-right ml-2">
                                    <div className={`text-sm font-black tracking-tighter ${returnPct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                        {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(1)}%
                                    </div>
                                    <div className="flex items-center justify-end gap-1 mt-0.5">
                                        <span className="text-[9px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-tighter">Sharpe</span>
                                        <span className="text-[10px] font-black text-slate-500 dark:text-slate-400">
                                            {sharpeRatio.toFixed(2)}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {isSelected && (
                                <div className="ml-2 w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center">
                                    <Check size={12} className="text-white" />
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>

            <div className="mt-3 flex items-center justify-between text-slate-400 dark:text-slate-500">
                <div className="flex items-center gap-2">
                    <Zap size={10} className="fill-current" />
                    <span className="text-[9px] font-bold uppercase tracking-widest">
                        3Y Optimized Config
                    </span>
                </div>
                {config.updated_at && (
                    <span className="text-[8px] font-mono text-slate-300 dark:text-slate-600">
                        Rev: {new Date(config.updated_at).toLocaleDateString()}
                    </span>
                )}
            </div>
        </div>
    );
}
