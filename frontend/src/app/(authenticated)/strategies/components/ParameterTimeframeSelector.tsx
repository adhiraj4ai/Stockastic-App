'use client';

import { useState, useEffect } from 'react';
import { Check } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';

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
    preferred_timeframe: '1Y' | '3Y' | '5Y';
    published_params: {
        '1Y'?: ParameterSet;
        '3Y'?: ParameterSet;
        '5Y'?: ParameterSet;
    };
}

interface Props {
    strategyId: number;
    symbol: string;
    onParametersSelected?: (params: Record<string, any>, timeframe: string) => void;
}

const TIMEFRAMES = [
    { value: '1Y', label: 'Short Term', subtitle: '1 Year' },
    { value: '3Y', label: 'Mid Term', subtitle: '3 Years' },
    { value: '5Y', label: 'Long Term', subtitle: '5 Years' }
] as const;

export default function ParameterTimeframeSelector({ strategyId, symbol, onParametersSelected }: Props) {
    const [config, setConfig] = useState<SymbolConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedTimeframe, setSelectedTimeframe] = useState<'1Y' | '3Y' | '5Y'>('3Y');

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
            setSelectedTimeframe(response.data.preferred_timeframe);

            // Auto-select parameters from preferred timeframe
            const paramSet = response.data.published_params[response.data.preferred_timeframe];
            if (paramSet && onParametersSelected) {
                onParametersSelected(paramSet.parameters, response.data.preferred_timeframe);
            }
        } catch (error) {
            console.error('Failed to fetch symbol config:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleTimeframeSelect = async (timeframe: '1Y' | '3Y' | '5Y') => {
        try {
            setSelectedTimeframe(timeframe);

            // Update backend preference
            await api.post(`/api/stocks/strategies/${strategyId}/set_symbol_config/`, {
                symbol,
                preferred_timeframe: timeframe
            });

            // Call callback with new parameters
            const paramSet = config?.published_params[timeframe];
            if (paramSet && onParametersSelected) {
                onParametersSelected(paramSet.parameters, timeframe);
            }

            toast.success(`Switched to ${timeframe} parameters`);
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Failed to update timeframe');
        }
    };

    if (loading) {
        return (
            <div className="py-4">
                <div className="animate-pulse flex space-x-4">
                    <div className="flex-1 space-y-2">
                        <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                        <div className="h-20 bg-gray-200 rounded"></div>
                    </div>
                </div>
            </div>
        );
    }

    if (!config || Object.keys(config.published_params).length === 0) {
        return null; // No published parameters yet
    }

    const hasAnyParams = Object.keys(config.published_params).length > 0;

    if (!hasAnyParams) return null;

    return (
        <div className="bg-gradient-to-br from-gray-50 to-white border border-gray-200 rounded-lg p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                    Optimized Parameters for {symbol}
                </h3>
                <span className="text-xs text-gray-500">Select timeframe</span>
            </div>

            <div className="grid grid-cols-3 gap-4">
                {TIMEFRAMES.map((tf) => {
                    const paramSet = config.published_params[tf.value];
                    const isSelected = selectedTimeframe === tf.value;
                    const isAvailable = !!paramSet;

                    return (
                        <button
                            key={tf.value}
                            onClick={() => isAvailable && handleTimeframeSelect(tf.value)}
                            disabled={!isAvailable}
                            className={`
                relative p-4 rounded-lg border-2 transition-all duration-200
                ${isSelected && isAvailable
                                    ? 'border-blue-500 bg-blue-50 shadow-md'
                                    : isAvailable
                                        ? 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                                        : 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                                }
              `}
                        >
                            {/* Selection indicator */}
                            {isSelected && isAvailable && (
                                <div className="absolute top-2 right-2">
                                    <div className="flex items-center justify-center w-5 h-5 bg-blue-500 rounded-full">
                                        <Check size={12} className="text-white" />
                                    </div>
                                </div>
                            )}

                            <div className="text-left space-y-2">
                                <div>
                                    <div className={`text-sm font-semibold ${isSelected ? 'text-blue-700' : 'text-gray-700'}`}>
                                        {tf.label}
                                    </div>
                                    <div className="text-xs text-gray-500">{tf.subtitle}</div>
                                </div>

                                {paramSet ? (
                                    <div className="space-y-1 pt-2 border-t border-gray-200">
                                        {/* Show key parameters */}
                                        {Object.entries(paramSet.parameters).slice(0, 3).map(([key, value]) => (
                                            <div key={key} className="flex justify-between text-xs">
                                                <span className="text-gray-600">{key}:</span>
                                                <span className="font-medium text-gray-900">{value}</span>
                                            </div>
                                        ))}

                                        {/* Show metrics */}
                                        <div className="pt-1 mt-1 border-t border-gray-100">
                                            <div className="flex justify-between text-xs">
                                                <span className="text-gray-500">Return:</span>
                                                <span className={`font-medium ${paramSet.metrics.return_pct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                    {paramSet.metrics.return_pct.toFixed(1)}%
                                                </span>
                                            </div>
                                            <div className="flex justify-between text-xs">
                                                <span className="text-gray-500">Sharpe:</span>
                                                <span className="font-medium text-gray-900">
                                                    {paramSet.metrics.sharpe_ratio.toFixed(2)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-xs text-gray-400 italic">
                                        Not optimized
                                    </div>
                                )}
                            </div>
                        </button>
                    );
                })}
            </div>

            {selectedTimeframe && config.published_params[selectedTimeframe] && (
                <div className="mt-4 text-xs text-gray-500 text-center">
                    Currently using <span className="font-semibold text-gray-700">{selectedTimeframe}</span> parameters
                </div>
            )}
        </div>
    );
}
