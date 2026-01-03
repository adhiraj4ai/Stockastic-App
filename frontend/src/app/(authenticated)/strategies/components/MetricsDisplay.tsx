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
    chartHeight?: string;
}

export function MetricsDisplay({ stats, plotHtml, strategyId, experimentId, chartHeight = '700px' }: MetricsDisplayProps) {

    // Helper to format/group stats if not already categorized
    const getCategorizedStats = (s: any) => {
        // ALWAYS use frontend categorization to ensure consistency across Backtest and Experiment views.
        // We prefer 'raw' data if available (new backend format), otherwise falling back to 's' (legacy/flat format).
        const data = s.raw || s;

        // Helper for safe number formatting
        const fmt = (val: any, precision = 2, suffix = '') => {
            if (val === undefined || val === null) return '0' + suffix;
            const num = Number(val);
            if (isNaN(num)) return val;
            return num.toFixed(precision) + suffix;
        };

        const safeStr = (val: any) => (val !== undefined && val !== null) ? String(val) : '0';

        // Replicate backend 'Comprehensive' categorization logic exactly
        return {
            'Performance Metrics': {
                'PNL': `${fmt(data.total_pnl)} (${fmt(data.pnl_percent || data['Return [%]'])}%)`,
                'Win rate': `${fmt(data.win_rate || data['Win Rate [%]'])}%`,
                'Sharpe ratio': fmt(data['Sharpe Ratio'] || data.sharpe_ratio),
                'Smart Sharpe': fmt(data['Smart Sharpe']),
                'Sortino ratio': fmt(data['Sortino Ratio'] || data.sortino_ratio),
                'Smart Sortino': fmt(data['Smart Sortino']),
                'Calmar ratio': fmt(data['Calmar Ratio'] || data.calmar_ratio),
                'Omega ratio': fmt(data['Omega Ratio']),
                'Serenity index': fmt(data['Serenity Index']),
                'Average win/loss': fmt(data['Avg. Win/Loss']),
                'Average win': fmt(data['Average Win'] || data['Avg. Win [$]']),
                'Average loss': fmt(data['Average Loss'] || data['Avg. Loss [$]']),
            },
            'Risk Metrics': {
                'Max drawdown': `${fmt(data.max_drawdown || data['Max. Drawdown [%]'])}%`,
                'Average drawdown': `${fmt(data['Avg. Drawdown [%]'])}%`, // Added likely field
                'Profit factor': fmt(data.profit_factor || data['Profit Factor']),
                'Largest losing trade': `${fmt(data['Worst Trade [%]'])}%`,
                'Largest winning trade': `${fmt(data['Best Trade [%]'])}%`,
                'Total winning streak': safeStr(data['Max. Winning Streak']),
                'Total losing streak': safeStr(data['Max. Losing Streak']),
                'Current streak': safeStr(data['Current Streak']),
                'Expectancy': `${fmt(data['Expectancy [%]'])}%`,
                'Expected net profit': fmt(data['Expected Net Profit']),
                'Average holding period': safeStr(data['Avg. Trade Duration'] || 'N/A'),
                'Gross profit': fmt(data['Gross Profit']),
                'Gross loss': fmt(data['Gross Loss']),
                'Volatility (Ann.)': `${fmt(data['Volatility (Ann.) [%]'])}%`, // Added from screenshot
            },
            'Trade Metrics': {
                'Total trades': safeStr(data.total_trades || data['# Trades']),
                'Total winning trades': safeStr(data['Total Winning Trades']),
                'Total losing trades': safeStr(data['Total Losing Trades']),
                'Starting balance': fmt(data['Equity Initial [$]'] || 10000),
                'Finishing balance': fmt(data['Equity Final [$]'] || data.final_equity),
                'Longs count': safeStr(data['Longs Count']),
                'Shorts count': safeStr(data['Shorts Count']),
                'Fee': fmt(data['Fee']),
                'Total open trades': safeStr(data['Total Open Trades']),
                'Open PL': fmt(data['Open PL']),
                'SQN': fmt(data['SQN']), // Added from screenshot
                'Buy & Hold Return': `${fmt(data['Buy & Hold Return [%]'])}%`, // Added from screenshot
            }
        };
    };

    const categorized = getCategorizedStats(stats);
    const hasCategorized = Object.keys(categorized).length > 0;


    return (
        <div className="space-y-6">
            {/* Chart Section */}
            {plotHtml && (
                <div className="w-full bg-white border rounded-xl overflow-hidden mb-6 shadow-md" style={{ height: chartHeight }}>
                    <div className="px-4 py-2 bg-gray-50 border-b flex justify-between items-center">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Strategy Plot</span>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-[10px] uppercase font-bold"
                            onClick={() => {
                                const newWindow = window.open('', '_blank');
                                if (newWindow) {
                                    newWindow.document.write(plotHtml);
                                    newWindow.document.close();
                                }
                            }}
                        >
                            <ExternalLink size={12} className="mr-1" /> Full Screen
                        </Button>
                    </div>
                    <iframe
                        title="Backtest Plot"
                        srcDoc={plotHtml}
                        className="w-full h-full border-0"
                        sandbox="allow-scripts"
                    />
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {Object.entries(categorized).map(([category, metrics]: [string, any]) => (
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
        </div>
    );
}
