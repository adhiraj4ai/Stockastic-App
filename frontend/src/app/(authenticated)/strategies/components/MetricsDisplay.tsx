'use client';

import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableRow,
} from "@/components/ui/table";
import { TrendingUp, AlertTriangle, Activity, ExternalLink } from 'lucide-react';

interface MetricsDisplayProps {
    stats: any;
    plotHtml?: string;
    strategyId: string;
    experimentId?: number;
}

export function MetricsDisplay({ stats, plotHtml, strategyId, experimentId }: MetricsDisplayProps) {
    const hasCategorized = stats.categorized && Object.keys(stats.categorized).length > 0;

    return (
        <div className="space-y-6">
            {/* Chart Section */}
            {plotHtml && (
                <div className="w-full bg-white border rounded-xl overflow-hidden mb-6 shadow-md" style={{ height: '700px' }}>
                    <div className="px-4 py-2 bg-gray-50 border-b flex justify-between items-center">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Strategy Plot</span>
                        {(experimentId || stats.id) && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-[10px] uppercase font-bold"
                                onClick={() => window.open(`/strategies/${strategyId}/experiments/${experimentId || stats.id}`, '_blank')}
                            >
                                <ExternalLink size={12} className="mr-1" /> Full Screen
                            </Button>
                        )}
                    </div>
                    <iframe
                        title="Backtest Plot"
                        srcDoc={plotHtml}
                        className="w-full h-full border-0"
                        sandbox="allow-scripts"
                    />
                </div>
            )}

            {hasCategorized ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {Object.entries(stats.categorized).map(([category, metrics]: [string, any]) => (
                        <Card key={category} className="shadow-sm border-gray-100 overflow-hidden">
                            <CardHeader className="py-3 px-4 bg-gray-50/50 border-b border-gray-100">
                                <CardTitle className="text-sm font-bold text-gray-700 uppercase tracking-tight flex items-center gap-2">
                                    {category === 'Performance Metrics' && <TrendingUp size={14} className="text-green-500" />}
                                    {category === 'Risk Metrics' && <AlertTriangle size={14} className="text-red-500" />}
                                    {category === 'Trade Metrics' && <Activity size={14} className="text-blue-500" />}
                                    {category}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <Table>
                                    <TableBody>
                                        {Object.entries(metrics).map(([label, value]: [string, any]) => (
                                            <TableRow key={label} className="hover:bg-transparent border-gray-50">
                                                <TableCell className="py-2.5 px-4 text-xs font-medium text-gray-500">
                                                    {label}
                                                </TableCell>
                                                <TableCell className="py-2.5 px-4 text-xs font-mono text-right font-bold text-gray-900">
                                                    {String(value)}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-gray-50 p-3 rounded-lg">
                            <p className="text-xs text-gray-500">Total Trades</p>
                            <p className="text-lg font-bold">{stats.total_trades}</p>
                        </div>
                        <div className="bg-gray-50 p-3 rounded-lg">
                            <p className="text-xs text-gray-500">Win Rate</p>
                            <p className="text-lg font-bold">{stats.win_rate?.toFixed(1)}%</p>
                        </div>
                        <div className="bg-gray-50 p-3 rounded-lg">
                            <p className="text-xs text-gray-500">Max Drawdown</p>
                            <p className="text-lg font-bold text-red-600">{stats.max_drawdown?.toFixed(2)}%</p>
                        </div>
                        <div className="bg-gray-50 p-3 rounded-lg">
                            <p className="text-xs text-gray-500">Profit Factor</p>
                            <p className="text-lg font-bold">{stats.profit_factor?.toFixed(2)}</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h4 className="text-sm font-medium border-b pb-2">Full Metrics</h4>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-8 text-sm">
                            <div>
                                <span className="text-gray-500 block text-xs">Sharpe Ratio</span>
                                <span className="font-mono">{stats.sharpe_ratio?.toFixed(2)}</span>
                            </div>
                            <div>
                                <span className="text-gray-500 block text-xs">Sortino Ratio</span>
                                <span className="font-mono">{stats.sortino_ratio?.toFixed(2)}</span>
                            </div>
                            <div>
                                <span className="text-gray-500 block text-xs">Calmar Ratio</span>
                                <span className="font-mono">{stats.calmar_ratio?.toFixed(2)}</span>
                            </div>
                            <div>
                                <span className="text-gray-500 block text-xs">Total PnL</span>
                                <span className={`font-mono ${stats.total_pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {stats.total_pnl?.toFixed(2)}
                                </span>
                            </div>
                            <div>
                                <span className="text-gray-500 block text-xs">Avg Trade</span>
                                <span className="font-mono">{stats.avg_trade?.toFixed(2)}%</span>
                            </div>
                            <div>
                                <span className="text-gray-500 block text-xs">Max Trade Duration</span>
                                <span className="font-mono">{stats.max_trade_duration}</span>
                            </div>
                        </div>
                    </div>

                    <div className="mt-4">
                        <h4 className="text-sm font-medium mb-2">Raw Data</h4>
                        <pre className="bg-slate-900 text-slate-50 p-4 rounded-lg text-xs overflow-auto max-h-40">
                            {JSON.stringify(stats, null, 2)}
                        </pre>
                    </div>
                </>
            )}
        </div>
    );
}
