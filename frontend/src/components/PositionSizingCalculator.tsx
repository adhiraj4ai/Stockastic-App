'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calculator, TrendingUp, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/api';

interface PositionSizingCalculatorProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onApply?: (shares: number) => void;
    defaultTicker?: string;
    accountId?: string | number;
}

interface CalculationResult {
    max_shares: number;
    total_investment: number;
    risk_amount: number;
    max_loss_if_stopped: number;
    risk_per_share: number;
    position_size_percentage: number;
    risk_reward_ratio?: number;
    potential_profit?: number;
    warnings: Array<{
        type: string;
        message: string;
        severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    }>;
    account_balance: number;
    risk_percentage: number;
}

export function PositionSizingCalculator({
    open,
    onOpenChange,
    onApply,
    defaultTicker,
    accountId = 'all'
}: PositionSizingCalculatorProps) {
    const [entryPrice, setEntryPrice] = useState<string>('');
    const [stopLossPrice, setStopLossPrice] = useState<string>('');
    const [riskPercentage, setRiskPercentage] = useState<string>('2.0');
    const [targetPrice, setTargetPrice] = useState<string>('');
    const [result, setResult] = useState<CalculationResult | null>(null);
    const [error, setError] = useState<string>('');
    const [calculating, setCalculating] = useState(false);

    // Auto-calculate when inputs change
    useEffect(() => {
        if (entryPrice && stopLossPrice && riskPercentage) {
            calculatePositionSize();
        } else {
            setResult(null);
        }
    }, [entryPrice, stopLossPrice, riskPercentage, targetPrice, accountId]);

    const calculatePositionSize = async () => {
        if (!entryPrice || !stopLossPrice) return;

        setCalculating(true);
        setError('');

        try {
            const response = await api.post('/api/stocks/portfolio/calculate_position_size/', {
                account_id: accountId,
                entry_price: parseFloat(entryPrice),
                stop_loss_price: parseFloat(stopLossPrice),
                risk_percentage: parseFloat(riskPercentage),
                target_price: targetPrice ? parseFloat(targetPrice) : null
            });

            setResult(response.data);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to calculate position size');
            setResult(null);
        } finally {
            setCalculating(false);
        }
    };

    const getRiskBadgeColor = (risk: number) => {
        if (risk <= 2) return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800';
        if (risk <= 3) return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800';
        return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800';
    };

    const getSeverityIcon = (severity: string) => {
        switch (severity) {
            case 'CRITICAL':
            case 'HIGH':
                return <AlertTriangle className="h-4 w-4 text-red-500" />;
            case 'MEDIUM':
                return <Info className="h-4 w-4 text-yellow-500" />;
            default:
                return <Info className="h-4 w-4 text-blue-500" />;
        }
    };

    const handleApply = () => {
        if (result && onApply) {
            onApply(result.max_shares);
            onOpenChange(false);
        }
    };

    const presetRisks = [
        { label: 'Conservative', value: 1.0, desc: '1% risk' },
        { label: 'Moderate', value: 2.0, desc: '2% risk' },
        { label: 'Aggressive', value: 3.0, desc: '3% risk' },
        { label: 'Very Aggressive', value: 5.0, desc: '5% risk' }
    ];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-2xl">
                        <Calculator className="h-6 w-6 text-blue-500" />
                        Position Sizing Calculator
                    </DialogTitle>
                    <DialogDescription>
                        Calculate optimal share quantity based on your risk tolerance
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 mt-4">
                    {/* Input Section */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Entry Price */}
                        <div className="space-y-2">
                            <Label htmlFor="entry-price" className="font-semibold">
                                Entry Price (Rs.) <span className="text-red-500">*</span>
                            </Label>
                            <Input
                                id="entry-price"
                                type="number"
                                step="0.01"
                                placeholder="e.g., 1000"
                                value={entryPrice}
                                onChange={(e) => setEntryPrice(e.target.value)}
                                className="text-lg font-bold"
                            />
                        </div>

                        {/* Stop-Loss Price */}
                        <div className="space-y-2">
                            <Label htmlFor="stop-loss" className="font-semibold">
                                Stop-Loss Price (Rs.) <span className="text-red-500">*</span>
                            </Label>
                            <Input
                                id="stop-loss"
                                type="number"
                                step="0.01"
                                placeholder="e.g., 950"
                                value={stopLossPrice}
                                onChange={(e) => setStopLossPrice(e.target.value)}
                                className="text-lg font-bold"
                            />
                        </div>

                        {/* Target Price (Optional) */}
                        <div className="space-y-2">
                            <Label htmlFor="target-price" className="font-semibold">
                                Target Price (Rs.) <span className="text-gray-400 text-xs">Optional</span>
                            </Label>
                            <Input
                                id="target-price"
                                type="number"
                                step="0.01"
                                placeholder="e.g., 1150"
                                value={targetPrice}
                                onChange={(e) => setTargetPrice(e.target.value)}
                                className="text-lg font-bold"
                            />
                        </div>

                        {/* Risk Percentage */}
                        <div className="space-y-2">
                            <Label htmlFor="risk-pct" className="font-semibold">
                                Risk % per Trade
                            </Label>
                            <Input
                                id="risk-pct"
                                type="number"
                                step="0.1"
                                min="0.1"
                                max="10"
                                value={riskPercentage}
                                onChange={(e) => setRiskPercentage(e.target.value)}
                                className="text-lg font-bold"
                            />
                        </div>
                    </div>

                    {/* Risk Presets */}
                    <div className="space-y-2">
                        <Label className="text-sm font-semibold text-gray-600 dark:text-gray-400">Quick Presets</Label>
                        <div className="flex flex-wrap gap-2">
                            {presetRisks.map((preset) => (
                                <Button
                                    key={preset.value}
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setRiskPercentage(preset.value.toString())}
                                    className={`${parseFloat(riskPercentage) === preset.value
                                            ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-500 text-blue-700 dark:text-blue-400'
                                            : ''
                                        }`}
                                >
                                    {preset.label}
                                    <span className="ml-1 text-xs opacity-70">({preset.desc})</span>
                                </Button>
                            ))}
                        </div>
                    </div>

                    {/* Error Display */}
                    {error && (
                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-start gap-3">
                            <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5" />
                            <div>
                                <p className="font-semibold text-red-700 dark:text-red-400">Error</p>
                                <p className="text-sm text-red-600 dark:text-red-300">{error}</p>
                            </div>
                        </div>
                    )}

                    {/* Results Section */}
                    {result && !error && (
                        <div className="space-y-4 border-t pt-4">
                            {/* Main Result */}
                            <div className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-xl p-6 border-2 border-blue-200 dark:border-blue-800">
                                <div className="text-center">
                                    <p className="text-sm font-semibold text-gray-600 dark:text-gray-400 tracking-tight mb-2">
                                        Recommended position size
                                    </p>
                                    <div className="text-5xl font-bold text-blue-600 dark:text-blue-400 mb-2">
                                        {result.max_shares.toLocaleString()}
                                    </div>
                                    <p className="text-lg font-bold text-gray-700 dark:text-gray-300">shares</p>
                                </div>
                            </div>

                            {/* Metrics Grid */}
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                <div className="bg-white dark:bg-card border border-gray-200 dark:border-slate-700 rounded-lg p-4">
                                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Total investment</p>
                                    <p className="text-xl font-bold text-gray-900 dark:text-slate-100">
                                        Rs. {result.total_investment.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                    </p>
                                </div>

                                <div className="bg-white dark:bg-card border border-gray-200 dark:border-slate-700 rounded-lg p-4">
                                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Max loss</p>
                                    <p className="text-xl font-bold text-red-600 dark:text-red-400">
                                        Rs. {result.max_loss_if_stopped.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                    </p>
                                </div>

                                <div className="bg-white dark:bg-card border border-gray-200 dark:border-slate-700 rounded-lg p-4">
                                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Risk per share</p>
                                    <p className="text-xl font-bold text-gray-900 dark:text-slate-100">
                                        Rs. {result.risk_per_share.toFixed(2)}
                                    </p>
                                </div>

                                <div className="bg-white dark:bg-card border border-gray-200 dark:border-slate-700 rounded-lg p-4">
                                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Position size</p>
                                    <Badge className={getRiskBadgeColor(result.position_size_percentage)}>
                                        {result.position_size_percentage.toFixed(1)}% of portfolio
                                    </Badge>
                                </div>

                                <div className="bg-white dark:bg-card border border-gray-200 dark:border-slate-700 rounded-lg p-4">
                                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Risk level</p>
                                    <Badge className={getRiskBadgeColor(result.risk_percentage)}>
                                        {result.risk_percentage.toFixed(1)}% risk
                                    </Badge>
                                </div>

                                {result.risk_reward_ratio && (
                                    <div className="bg-white dark:bg-card border border-gray-200 dark:border-slate-700 rounded-lg p-4">
                                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">R/R ratio</p>
                                        <p className="text-xl font-bold text-green-600 dark:text-green-400">
                                            1:{result.risk_reward_ratio.toFixed(1)}
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Potential Profit */}
                            {result.potential_profit && (
                                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
                                            <span className="font-semibold text-green-700 dark:text-green-400">Potential profit at target</span>
                                        </div>
                                        <span className="text-2xl font-bold text-green-600 dark:text-green-400">
                                            +Rs. {result.potential_profit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Warnings */}
                            {result.warnings && result.warnings.length > 0 && (
                                <div className="space-y-2">
                                    <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Warnings & Recommendations</Label>
                                    {result.warnings.map((warning, idx) => (
                                        <div
                                            key={idx}
                                            className={`flex items-start gap-3 p-3 rounded-lg border ${warning.severity === 'CRITICAL' || warning.severity === 'HIGH'
                                                    ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                                                    : warning.severity === 'MEDIUM'
                                                        ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                                                        : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                                                }`}
                                        >
                                            {getSeverityIcon(warning.severity)}
                                            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{warning.message}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex justify-end gap-3 border-t pt-4">
                        <Button variant="outline" onClick={() => onOpenChange(false)}>
                            Cancel
                        </Button>
                        {onApply && result && result.max_shares > 0 && (
                            <Button onClick={handleApply} className="bg-blue-600 hover:bg-blue-700 text-white">
                                <CheckCircle2 className="h-4 w-4 mr-2" />
                                Apply {result.max_shares} Shares
                            </Button>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
