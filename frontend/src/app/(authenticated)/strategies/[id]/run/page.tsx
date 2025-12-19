'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { useRouter, useParams } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Play, ArrowLeft, Calendar, FileText, TrendingUp, Activity, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { CompanySelect } from '@/components/CompanySelect';

interface Strategy {
    id: number;
    name: string;
    description: string;
    code: string;
}

const METRIC_GROUPS = [
    {
        title: "Performance Metrics",
        metrics: [
            { label: "Return", key: "Return [%]", suffix: "%" },
            { label: "Win Rate", key: "Win Rate [%]", suffix: "%" },
            { label: "Sharpe Ratio", key: "Sharpe Ratio" },
            { label: "Sortino Ratio", key: "Sortino Ratio" },
            { label: "Calmar Ratio", key: "Calmar Ratio" },
            { label: "Avg Win/Loss Ratio", key: "Avg Win/Loss Ratio" },
            { label: "Average Win", key: "Average Win" },
            { label: "Average Loss", key: "Average Loss" },
        ]
    },
    {
        title: "Risk Metrics",
        metrics: [
            { label: "Max Drawdown", key: "Max. Drawdown [%]", suffix: "%" },
            { label: "Largest Winning Trade", key: "Largest Winning Trade" },
            { label: "Largest Losing Trade", key: "Largest Losing Trade" },
            { label: "Expectancy", key: "Expectancy [%]", suffix: "%" },
            { label: "Avg Holding Period", key: "Average Holding Period" },
            { label: "Gross Profit", key: "Gross Profit" },
            { label: "Gross Loss", key: "Gross Loss" },
        ]
    },
    {
        title: "Trade Metrics",
        metrics: [
            { label: "Total Trades", key: "# Trades" },
            { label: "Winning Trades", key: "Total Winning Trades" },
            { label: "Losing Trades", key: "Total Losing Trades" },
            { label: "Finishing Balance", key: "Equity Final [$]" },
            { label: "Longs Count", key: "Total Long Trades" },
            { label: "Shorts Count", key: "Total Short Trades" },
            { label: "Fee", key: "Commissions [$]" },
        ]
    }
];

export default function RunStrategyPage() {
    const router = useRouter();
    const params = useParams();
    const strategyId = params.id;

    const [strategy, setStrategy] = useState<Strategy | null>(null);
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState(false);
    const [results, setResults] = useState<any>(null);
    const [optimizing, setOptimizing] = useState(false);
    const [showOptimizeDialog, setShowOptimizeDialog] = useState(false);
    const [optimizationResults, setOptimizationResults] = useState<any>(null);

    // Param State
    const [mode, setMode] = useState<'symbol' | 'sector'>('symbol');
    const [symbol, setSymbol] = useState('');
    const [sector, setSector] = useState('');
    const [sectors, setSectors] = useState<{ name: string; count: number }[]>([]);

    // Default Dates: Last 5 Years
    const today = new Date();
    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(today.getFullYear() - 5);

    const formatDate = (date: Date) => date.toISOString().split('T')[0];

    const [startDate, setStartDate] = useState(formatDate(fiveYearsAgo));
    const [endDate, setEndDate] = useState(formatDate(today));

    useEffect(() => {
        if (strategyId) {
            fetchStrategy();
        }
        fetchSectors();
    }, [strategyId]);

    const fetchStrategy = async () => {
        try {
            const response = await api.get(`/api/stocks/strategies/${strategyId}/`);
            setStrategy(response.data);
        } catch (error: any) {
            // 401 handled by global interceptor
            toast.error('Failed to load strategy');
        } finally {
            setLoading(false);
        }
    };

    const fetchSectors = async () => {
        try {
            const response = await api.get('/api/stocks/companies/sectors/');
            setSectors(response.data);
        } catch (error) {
            console.error('Failed to load sectors', error);
        }
    };

    const handleRun = async () => {
        if (!strategy) return;

        // Validate based on mode
        if (mode === 'symbol' && !symbol) {
            toast.error('Please select a stock symbol');
            return;
        }
        if (mode === 'sector' && !sector) {
            toast.error('Please select a sector');
            return;
        }

        setRunning(true);
        setResults(null);
        try {
            const requestData = mode === 'symbol'
                ? { code: strategy.code, symbol, start_date: startDate, end_date: endDate }
                : { code: strategy.code, sector, start_date: startDate, end_date: endDate };
            console.log('Backtest request:', requestData);
            const response = await api.post('/api/stocks/strategies/backtest/', requestData);
            setResults(response.data);
            toast.success(mode === 'sector' ? 'Sector backtest complete' : 'Backtest complete');
        } catch (error: any) {
            console.error('Backtest failed', error);
            console.error('Error response:', error.response?.data);
            console.error('Error status:', error.response?.status);

            let errorMsg = 'Backtest failed';
            if (error.response?.data?.error) {
                errorMsg = error.response.data.error;

                // Add helpful context for sector backtests
                if (mode === 'sector' && errorMsg.includes('No successful backtests')) {
                    errorMsg += '. Try a different date range or sector with more available data.';
                }
            } else if (error.response?.status === 404) {
                errorMsg = 'No data found for the selected parameters';
            } else if (error.response?.statusText) {
                errorMsg = `${error.response.status}: ${error.response.statusText}`;
            } else if (error.message) {
                errorMsg = error.message;
            }

            toast.error(errorMsg);
        } finally {
            setRunning(false);
        }
    };

    const handleOptimize = async (paramRanges: any, nTrials: number) => {
        if (!strategy) return;
        if (!symbol) {
            toast.error('Please select a stock symbol');
            return;
        }
        setOptimizing(true);
        try {
            const requestData = {
                code: strategy.code,
                symbol,
                start_date: startDate,
                end_date: endDate,
                param_ranges: paramRanges,
                n_trials: nTrials
            };
            console.log('Optimization request:', requestData);
            const response = await api.post('/api/stocks/strategies/optimize/', requestData);
            setOptimizationResults(response.data);
            toast.success(`Optimization complete! Best return: ${response.data.best_value.toFixed(2)}%`);
        } catch (error: any) {
            console.error('Optimization failed', error);
            console.error('Error response:', error.response?.data);
            console.error('Error status:', error.response?.status);

            let errorMsg = 'Optimization failed';
            if (error.response?.data?.error) {
                errorMsg = error.response.data.error;
            } else if (error.response?.data?.traceback) {
                errorMsg = error.response.data.traceback.substring(0, 200) + '...';
            } else if (error.response?.status) {
                errorMsg = `HTTP ${error.response.status}: ${error.response.statusText || 'Request failed'}`;
            } else if (error.message) {
                errorMsg = error.message;
            }

            toast.error(errorMsg);
        } finally {
            setOptimizing(false);
        }
    };

    const handleApplyOptimized = async () => {
        if (!optimizationResults || !strategy) return;
        try {
            await api.patch(`/api/stocks/strategies/${strategyId}/`,
                { code: optimizationResults.optimized_code }
            );
            setStrategy({ ...strategy, code: optimizationResults.optimized_code });
            setOptimizationResults(null);
            toast.success('Optimized parameters applied to strategy!');
        } catch (error: any) {
            toast.error('Failed to update strategy');
        }
    };

    if (loading) return <DashboardLayout><div>Loading...</div></DashboardLayout>;

    return (
        <DashboardLayout title={strategy?.name || 'Strategy Backtest'} noPadding>
            <div className="flex h-full overflow-hidden">
                {/* Sidebar: Config */}
                <div className="w-80 bg-gray-50 border-r border-gray-200 p-6 overflow-y-auto flex flex-col">
                    <h3 className="font-bold text-gray-900 mb-6 uppercase tracking-wider text-sm flex items-center gap-2">
                        <Activity size={16} /> Configuration
                    </h3>

                    <div className="space-y-6 flex-1">
                        {/* Mode Toggle */}
                        <div className="space-y-2">
                            <Label>Backtest Mode</Label>
                            <div className="flex gap-2">
                                <Button
                                    variant={mode === 'symbol' ? 'default' : 'outline'}
                                    onClick={() => setMode('symbol')}
                                    className="flex-1"
                                    size="sm"
                                >
                                    Single Stock
                                </Button>
                                <Button
                                    variant={mode === 'sector' ? 'default' : 'outline'}
                                    onClick={() => setMode('sector')}
                                    className="flex-1"
                                    size="sm"
                                >
                                    Sector
                                </Button>
                            </div>
                        </div>

                        {/* Symbol or Sector Selection */}
                        {mode === 'symbol' ? (
                            <div className="space-y-2">
                                <Label>Ticker Symbol</Label>
                                <CompanySelect value={symbol} onChange={(val) => setSymbol(val)} />
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <Label>Sector</Label>
                                <select
                                    value={sector}
                                    onChange={(e) => setSector(e.target.value)}
                                    className="w-full h-10 px-3 rounded-md border border-gray-300 bg-white text-sm"
                                >
                                    <option value="">Select a sector...</option>
                                    {sectors.map((s) => (
                                        <option key={s.name} value={s.name}>
                                            {s.name} ({s.count} stocks)
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label>Start Date</Label>
                            <div className="relative">
                                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-white pl-10" />
                                <Calendar className="absolute left-3 top-2.5 text-gray-400" size={16} />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>End Date</Label>
                            <div className="relative">
                                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="bg-white pl-10" />
                                <Calendar className="absolute left-3 top-2.5 text-gray-400" size={16} />
                            </div>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="space-y-3 pt-6 border-t border-gray-200 mt-6">
                        <Button
                            onClick={handleRun}
                            disabled={running || (mode === 'symbol' ? !symbol : !sector)}
                            className="w-full bg-blue-600 hover:bg-blue-700"
                        >
                            {running ? 'Running...' : <><Play size={16} className="mr-2" /> Run Backtest</>}
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => setShowOptimizeDialog(true)}
                            disabled={optimizing || (mode === 'symbol' ? !symbol : !sector)}
                            className="w-full border-purple-200 text-purple-700 hover:bg-purple-50"
                        >
                            {optimizing ? 'Optimizing...' : <><Zap size={16} className="mr-2" /> Optimize Parameters</>}
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => router.push(`/strategies/${strategyId}/edit`)}
                            className="w-full"
                        >
                            Edit Strategy
                        </Button>
                    </div>
                </div>

                {/* Main Content: Results */}
                <div className="flex-1 bg-gray-50/50 p-6 overflow-y-auto">
                    {results ? (
                        results.sector ? (
                            // Sector Results
                            <div className="max-w-5xl mx-auto space-y-6">
                                <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-6 rounded-xl">
                                    <h2 className="text-2xl font-bold mb-2">Sector: {results.sector}</h2>
                                    <p className="text-purple-100">{results.successful_backtests} of {results.total_stocks} stocks backtested successfully</p>
                                </div>

                                {/* Aggregated KPI Cards */}
                                <div className="grid grid-cols-4 gap-4">
                                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                                        <div className="text-sm text-gray-500 mb-1">Avg Return</div>
                                        <div className={`text-2xl font-bold ${results.aggregated_stats.avg_return >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            {results.aggregated_stats.avg_return.toFixed(2)}%
                                        </div>
                                    </div>
                                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                                        <div className="text-sm text-gray-500 mb-1">Avg Win Rate</div>
                                        <div className="text-2xl font-bold text-gray-900">
                                            {results.aggregated_stats.avg_win_rate.toFixed(1)}%
                                        </div>
                                    </div>
                                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                                        <div className="text-sm text-gray-500 mb-1">Best Stock</div>
                                        <div className="text-lg font-bold text-green-600">
                                            {results.aggregated_stats.best_stock?.symbol || '-'}
                                        </div>
                                        <div className="text-sm text-gray-500">
                                            {results.aggregated_stats.best_stock ? `${results.aggregated_stats.best_stock.return.toFixed(2)}%` : 'N/A'}
                                        </div>
                                    </div>
                                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                                        <div className="text-sm text-gray-500 mb-1">Worst Stock</div>
                                        <div className="text-lg font-bold text-red-600">
                                            {results.aggregated_stats.worst_stock?.symbol || '-'}
                                        </div>
                                        <div className="text-sm text-gray-500">
                                            {results.aggregated_stats.worst_stock ? `${results.aggregated_stats.worst_stock.return.toFixed(2)}%` : 'N/A'}
                                        </div>
                                    </div>
                                </div>

                                {/* Individual Stock Results Table */}
                                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                                    <div className="p-4 border-b border-gray-200">
                                        <h3 className="font-bold text-gray-900">Individual Stock Results</h3>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full">
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Symbol</th>
                                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Return %</th>
                                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Win Rate</th>
                                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Trades</th>
                                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total PnL</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-200">
                                                {results.individual_results.map((stock: any) => (
                                                    <tr key={stock.symbol} className="hover:bg-gray-50">
                                                        <td className="px-4 py-3 font-medium text-gray-900">{stock.symbol}</td>
                                                        <td className={`px-4 py-3 text-right font-semibold ${stock.return >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                            {stock.return.toFixed(2)}%
                                                        </td>
                                                        <td className="px-4 py-3 text-right text-gray-600">
                                                            {stock.win_rate.toFixed(1)}%
                                                        </td>
                                                        <td className="px-4 py-3 text-right text-gray-600">
                                                            {stock.total_trades}
                                                        </td>
                                                        <td className={`px-4 py-3 text-right font-medium ${stock.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                            Rs. {stock.total_pnl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Failed Stocks Table */}
                                {results.failed_stocks && results.failed_stocks.length > 0 && (
                                    <div className="bg-white rounded-xl border border-red-100 shadow-sm overflow-hidden">
                                        <div className="p-4 border-b border-red-50 bg-red-50/30">
                                            <h3 className="font-bold text-red-900">Skipped Stocks ({results.failed_stocks.length})</h3>
                                            <p className="text-xs text-red-600 mt-0.5">These stocks could not be backtested, usually due to missing historical data for the selected range.</p>
                                        </div>
                                        <div className="overflow-x-auto max-h-80 overflow-y-auto">
                                            <table className="w-full">
                                                <thead className="bg-gray-50">
                                                    <tr>
                                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Symbol</th>
                                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100 italic">
                                                    {results.failed_stocks.map((stock: any) => (
                                                        <tr key={stock.symbol} className="hover:bg-red-50/20 transition-colors">
                                                            <td className="px-4 py-2 text-sm font-medium text-gray-700">{stock.symbol}</td>
                                                            <td className="px-4 py-2 text-sm text-gray-500">{stock.error}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            // Single Stock Results
                            <div className="max-w-5xl mx-auto space-y-6">
                                {/* KPI Cards */}
                                <div className="grid grid-cols-4 gap-4">
                                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                                        <div className="text-sm text-gray-500 mb-1">Total PnL</div>
                                        <div className={`text-2xl font-bold ${results.stats.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            Rs. {results.stats.total_pnl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </div>
                                    </div>
                                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                                        <div className="text-sm text-gray-500 mb-1">Win Rate</div>
                                        <div className="text-2xl font-bold text-gray-900">{results.stats.win_rate.toFixed(1)}%</div>
                                    </div>
                                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                                        <div className="text-sm text-gray-500 mb-1">Total Trades</div>
                                        <div className="text-2xl font-bold text-gray-900">
                                            {results.stats.total_trades}
                                        </div>
                                    </div>
                                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                                        <div className="text-sm text-gray-500 mb-1">Return %</div>
                                        <div className={`text-2xl font-bold ${results.stats.pnl_percent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            {results.stats.pnl_percent.toFixed(2)}%
                                        </div>
                                    </div>
                                </div>

                                {/* Backtesting.py Interactive Plot */}
                                {results.plot_html && (
                                    <div className="bg-white p-2 rounded-xl border border-gray-200 shadow-sm overflow-hidden h-[600px]">
                                        <iframe
                                            srcDoc={results.plot_html}
                                            className="w-full h-full border-none"
                                            title="Backtest Results"
                                        />
                                    </div>
                                )}

                                {/* Raw Stats (Grouped View) */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    {METRIC_GROUPS.map((group) => (
                                        <div key={group.title} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden h-fit">
                                            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                                                <h3 className="font-bold text-gray-900 flex items-center gap-2 text-sm uppercase tracking-wider">
                                                    {group.title}
                                                </h3>
                                            </div>
                                            <div className="p-6 space-y-4">
                                                {group.metrics.map((metric) => {
                                                    const rawValue = results.stats.raw ? results.stats.raw[metric.key] : null;
                                                    let displayValue = rawValue;

                                                    // Special handling for PNL in Performance Metrics
                                                    if (metric.label === "Return" && results.stats.total_pnl && results.stats.pnl_percent) {
                                                        const pnl = results.stats.total_pnl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                                        const pct = results.stats.pnl_percent.toFixed(2);
                                                        displayValue = `Rs. ${pnl} (${pct}%)`;
                                                    } else if (typeof rawValue === 'number') {
                                                        displayValue = rawValue.toLocaleString('en-US', { maximumFractionDigits: 2 });
                                                        if (metric.suffix) displayValue += metric.suffix;
                                                    } else if (rawValue === null || rawValue === undefined) {
                                                        displayValue = "-";
                                                    }

                                                    return (
                                                        <div key={metric.label} className="flex justify-between items-center text-sm">
                                                            <span className="text-gray-500">{metric.label}</span>
                                                            <span className="font-medium font-mono">{displayValue}</span>
                                                        </div>
                                                    );
                                                })}

                                                {/* Add any unmapped keys to 'Risk' or specific other logic if needed? 
                                                    For now keeping it strict to the config for cleanliness. 
                                                */}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                            </div>
                        )
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400">
                            <Activity size={48} className="mb-4 opacity-20" />
                            <p className="text-lg font-medium">Ready to Backtest</p>
                            <p className="text-sm">Configure parameters and click "Run Backtest" to begin.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Optimization Dialog */}
            {showOptimizeDialog && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-gray-200">
                            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                                <Zap className="text-purple-600" size={24} />
                                Optimize Strategy Parameters
                            </h2>
                            <p className="text-sm text-gray-500 mt-1">Find the best parameter values using Optuna optimization</p>
                        </div>

                        {!optimizationResults ? (
                            <OptimizeForm
                                onOptimize={handleOptimize}
                                onCancel={() => setShowOptimizeDialog(false)}
                                optimizing={optimizing}
                                strategyCode={strategy?.code || ""}
                            />
                        ) : (
                            <OptimizationResults
                                results={optimizationResults}
                                onApply={handleApplyOptimized}
                                onClose={() => {
                                    setOptimizationResults(null);
                                    setShowOptimizeDialog(false);
                                }}
                            />
                        )}
                    </div>
                </div>
            )
            }
        </DashboardLayout >
    );
}

// Optimization Form Component
function OptimizeForm({ onOptimize, onCancel, optimizing, strategyCode }: any) {
    const [nTrials, setNTrials] = useState(50);

    // Extract parameters from strategy code
    const extractParameters = (code: string) => {
        const params: any = {};
        // Match class attributes like "n1 = 10" or "risk_per_trade = 0.05"
        const regex = /^\s*(\w+)\s*=\s*([\d.]+)/gm;
        let match;
        while ((match = regex.exec(code)) !== null) {
            const paramName = match[1];
            const valueStr = match[2];

            // Skip common non-parameter attributes
            if (['self', 'data', 'position', 'equity'].includes(paramName)) {
                continue;
            }

            // Skip float parameters (they need manual configuration)
            if (valueStr.includes('.')) {
                continue;
            }

            // Only process integer parameters
            const value = parseInt(valueStr);
            const min = Math.max(1, Math.floor(value * 0.5));
            const max = Math.ceil(value * 2);
            params[paramName] = [min, max];
        }

        // Return default if no params found
        return Object.keys(params).length > 0 ? params : { "n1": [5, 30], "n2": [20, 100] };
    };

    const [paramJson, setParamJson] = useState(JSON.stringify(extractParameters(strategyCode), null, 2));
    const [jsonError, setJsonError] = useState('');

    const handleSubmit = () => {
        try {
            const paramRanges = JSON.parse(paramJson);

            // Validate format
            for (const [key, value] of Object.entries(paramRanges)) {
                if (!Array.isArray(value) || value.length !== 2) {
                    setJsonError(`Invalid format for "${key}". Expected [min, max] array.`);
                    return;
                }
            }

            setJsonError('');
            onOptimize(paramRanges, nTrials);
        } catch (error) {
            setJsonError('Invalid JSON format. Please check your syntax.');
        }
    };

    return (
        <div className="p-6 space-y-6">
            <div>
                <Label className="text-sm font-medium text-gray-700 mb-2 block">Number of Trials</Label>
                <Input
                    type="number"
                    value={nTrials}
                    onChange={(e) => setNTrials(parseInt(e.target.value))}
                    min={10}
                    max={200}
                    className="w-full"
                />
                <p className="text-xs text-gray-500 mt-1">More trials = better results but slower (recommended: 50-100)</p>
            </div>


            <div>
                <Label className="text-sm font-medium text-gray-700 mb-2 block">Parameter Ranges (JSON)</Label>
                <textarea
                    value={paramJson}
                    onChange={(e) => {
                        setParamJson(e.target.value);
                        setJsonError('');
                    }}
                    className="w-full h-48 p-3 border border-gray-300 rounded-md font-mono text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    placeholder='{\n  "n1": [5, 30],\n  "n2": [20, 100]\n}'
                />
                {jsonError && (
                    <p className="text-xs text-red-600 mt-1">{jsonError}</p>
                )}
                <p className="text-xs text-gray-500 mt-2">
                    Format: <code className="bg-gray-100 px-1 rounded">{"{ \"param_name\": [min, max] }"}</code>
                </p>
                <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
                    <p className="text-xs text-blue-800 font-medium mb-1">Example:</p>
                    <pre className="text-xs text-blue-700 font-mono">
                        {`{
  "n1": [5, 30],
  "n2": [20, 100],
  "rsi_period": [10, 20]
}`}
                    </pre>
                </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
                <Button variant="outline" onClick={onCancel} disabled={optimizing}>
                    Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={optimizing} className="bg-purple-600 hover:bg-purple-700">
                    {optimizing ? 'Optimizing...' : 'Start Optimization'}
                </Button>
            </div>
        </div>
    );
}

// Optimization Results Component
function OptimizationResults({ results, onApply, onClose }: any) {
    return (
        <div className="p-6 space-y-6">
            <div className="bg-gradient-to-r from-purple-50 to-blue-50 p-6 rounded-lg border border-purple-200">
                <div className="text-sm text-gray-600 mb-2">Best Return Achieved</div>
                <div className="text-4xl font-bold text-purple-600">{results.best_value.toFixed(2)}%</div>
            </div>

            <div>
                <h3 className="font-semibold text-gray-900 mb-3">Optimized Parameters</h3>
                <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                    {Object.entries(results.best_params).map(([key, value]: any) => (
                        <div key={key} className="flex justify-between items-center">
                            <span className="text-gray-600 font-mono">{key}</span>
                            <span className="font-bold text-gray-900">{value}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div>
                <h3 className="font-semibold text-gray-900 mb-3">Top 5 Trials</h3>
                <div className="space-y-2">
                    {results.trials
                        .filter((t: any) => t.value !== null)
                        .sort((a: any, b: any) => b.value - a.value)
                        .slice(0, 5)
                        .map((trial: any, idx: number) => (
                            <div key={trial.number} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                <div className="flex items-center gap-3">
                                    <div className="w-6 h-6 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-sm font-bold">
                                        {idx + 1}
                                    </div>
                                    <div className="text-sm">
                                        {Object.entries(trial.params).map(([k, v]: any) => (
                                            <span key={k} className="mr-3">
                                                <span className="text-gray-500">{k}=</span>
                                                <span className="font-mono font-semibold">{v}</span>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <div className="text-sm font-bold text-gray-900">{trial.value.toFixed(2)}%</div>
                            </div>
                        ))}
                </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
                <Button variant="outline" onClick={onClose}>
                    Close
                </Button>
                <Button onClick={onApply} className="bg-green-600 hover:bg-green-700">
                    Apply to Strategy
                </Button>
            </div>
        </div>
    );
}
