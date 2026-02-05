'use client';

import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableRow,
} from "@/components/ui/table";
import { TrendingUp, AlertTriangle, Activity, ExternalLink, Percent, Target, ShieldAlert, BarChart3 } from 'lucide-react';

interface MetricsDisplayProps {
    stats: any;
    plotHtml?: string;
    strategyId: string;
    experimentId?: number;
    chartHeight?: string;
}

function SummaryTile({ title, value, value2, subtext, icon: Icon, colorClass, trend }: {
    title: string, value: string, value2?: string, subtext: string, icon: any, colorClass: string, trend?: 'up' | 'down'
}) {
    return (
        <Card className="overflow-hidden border-none shadow-lg bg-white dark:bg-slate-900 group hover:shadow-2xl transition-all duration-500">
            <div className={`h-1.5 w-full ${colorClass.split(' ')[0]}`} />
            <CardContent className="p-6">
                <div className="flex justify-between items-center mb-5">
                    <h4 className="text-xs font-black text-gray-500 dark:text-slate-400 uppercase tracking-tight">{title}</h4>
                    <div className={`p-2 rounded-xl ${colorClass.split(' ')[1]} dark:bg-slate-800 ${colorClass.split(' ')[2]} transition-all duration-300 group-hover:rotate-6 group-hover:scale-110 shadow-sm`}>
                        <Icon size={18} />
                    </div>
                </div>

                <div className="space-y-1">
                    <div className="flex items-baseline flex-wrap gap-x-4 gap-y-1">
                        <span className="text-3xl font-black text-gray-900 dark:text-slate-100 tracking-tighter transition-all group-hover:text-blue-600 dark:group-hover:text-blue-400">
                            {value}
                        </span>
                        {value2 && (
                            <span className="text-xl font-bold text-gray-400 dark:text-slate-500 tracking-tight">
                                {value2}
                            </span>
                        )}
                    </div>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-50 dark:border-slate-800 flex items-center justify-between gap-3">
                    <p className="text-[10px] text-gray-500 dark:text-slate-400 font-medium leading-tight flex-1">
                        {subtext}
                    </p>
                    {trend && (
                        <div className={`text-[9px] font-black px-2.5 py-1 rounded-full whitespace-nowrap shadow-sm ${trend === 'up' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                            {trend === 'up' ? '↑ Positive' : '↓ Warning'}
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

export function MetricsDisplay({ stats, plotHtml, strategyId, experimentId, chartHeight = '700px' }: MetricsDisplayProps) {

    // Helper to format/group stats if not already categorized
    const getCategorizedStats = (s: any) => {
        const data = s.raw || s;

        const fmt = (val: any, precision = 2, suffix = '') => {
            if (val === undefined || val === null) return '0' + suffix;
            const num = Number(val);
            if (isNaN(num)) return val;
            return num.toFixed(precision) + suffix;
        };

        const safeStr = (val: any) => (val !== undefined && val !== null) ? String(val) : '0';

        return {
            'Performance Metrics': {
                'PNL': `${fmt(data.total_pnl || data['Equity Final [$]'] - (data['Equity Initial [$]'] || 10000))} (${fmt(data.pnl_percent || data['Return [%]'])}%)`,
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
                'Average drawdown': `${fmt(data['Avg. Drawdown [%]'] || 0)}%`,
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
                'Volatility (Ann.)': `${fmt(data['Volatility (Ann.) [%]'])}%`,
            },
            'Trade Metrics': {
                'Total trades': safeStr(data.total_trades || data['# Trades']),
                'Total winning trades': safeStr(data['Total Winning Trades']),
                'Total losing trades': safeStr(data['Total Losing Trades']),
                'Stop Loss Exits': safeStr(data.sl_exits || 0),
                'Take Profit Exits': safeStr(data.tp_exits || 0),
                'Starting balance': fmt(data['Equity Initial [$]'] || data.equity_initial),
                'Finishing balance': fmt(data['Equity Final [$]'] || data.final_equity),
                'Longs count': safeStr(data['Longs Count']),
                'Shorts count': safeStr(data['Shorts Count']),
                'Fee': fmt(data['Fee']),
                'Total open trades': safeStr(data['Total Open Trades']),
                'Open PL': fmt(data['Open PL']),
                'SQN': fmt(data['SQN']),
                'Buy & Hold Return': `${fmt(data['Buy & Hold Return [%]'])}%`,
            }
        };
    };

    const categorized = getCategorizedStats(stats);
    const data = stats.raw || stats;

    // Formatting helpers for tiles
    const fmtTile = (val: any) => {
        const n = Number(val);
        return isNaN(n) ? "0.00" : n.toFixed(2);
    };

    return (
        <div className="space-y-6">
            {/* Chart Section */}
            {plotHtml && (
                <div className="w-full bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl overflow-hidden mb-8 shadow-sm" style={{ height: chartHeight }}>
                    <div className="px-5 py-3 bg-gray-50/50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                            <span className="text-[10px] font-bold text-gray-500 dark:text-slate-400">Strategy Performance Visualization</span>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-[10px] font-bold border-2 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 hover:border-blue-200 dark:hover:border-blue-900 transition-all"
                            onClick={() => {
                                const newWindow = window.open('', '_blank');
                                if (newWindow) {
                                    newWindow.document.write(`
                                        <html>
                                            <head><title>Backtest Report</title></head>
                                            <body style="margin:0;padding:0;overflow:hidden">${plotHtml}</body>
                                        </html>
                                    `);
                                    newWindow.document.close();
                                }
                            }}
                        >
                            <ExternalLink size={12} className="mr-2" /> Pop-out
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

            {/* Summary Tiles Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 px-1">
                <SummaryTile
                    title="Total Performance"
                    value={`${fmtTile(data.pnl_percent || data['Return [%]'])}%`}
                    value2={`$${fmtTile(data.total_pnl || data['Equity Final [$]'] - (data['Equity Initial [$]'] || 10000))}`}
                    subtext={`Net profit generated from your initial capital over the period.`}
                    icon={Percent}
                    colorClass="bg-green-500 bg-green-50 text-green-600"
                    trend={(data.pnl_percent || data['Return [%]']) > 0 ? 'up' : 'down'}
                />
                <SummaryTile
                    title="Efficiency Ratio"
                    value={fmtTile(data.profit_factor || data['Profit Factor'] || 1.0)}
                    value2={fmtTile(data.sharpe_ratio || data['Sharpe Ratio'])}
                    subtext={`Profit Factor & Sharpe Ratio indicating risk-adjusted returns.`}
                    icon={BarChart3}
                    colorClass="bg-indigo-500 bg-indigo-50 text-indigo-600"
                />
                <SummaryTile
                    title="Strategy Precision"
                    value={`${fmtTile(data.win_rate || data['Win Rate [%]'])}%`}
                    value2={`${data.total_trades || data['# Trades'] || 0} Trades`}
                    subtext={`${data['Total Winning Trades'] || 0} Win vs ${data['Total Losing Trades'] || 0} Loss.`}
                    icon={Target}
                    colorClass="bg-blue-500 bg-blue-50 text-blue-600"
                />
                <SummaryTile
                    title="Risk Tolerance"
                    value={`${fmtTile(data.max_drawdown || data['Max. Drawdown [%]'])}%`}
                    value2={`${fmtTile(data['Avg. Drawdown [%]'] || 0)}% Avg`}
                    subtext={`Maximum historical dip from peak compared to average dip.`}
                    icon={ShieldAlert}
                    colorClass="bg-red-500 bg-red-50 text-red-600"
                    trend={(data.max_drawdown || data['Max. Drawdown [%]']) < 15 ? 'up' : 'down'}
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
                {Object.entries(categorized).map(([category, metrics]: [string, any]) => (
                    <Card key={category} className="shadow-sm border-gray-100 dark:border-slate-800 overflow-hidden bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
                        <CardHeader className="py-3 px-5 bg-gray-50/50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-800">
                            <CardTitle className="text-[11px] font-bold text-gray-600 dark:text-slate-400 flex items-center gap-2">
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
                                        <TableRow key={label} className="hover:bg-blue-50/30 dark:hover:bg-blue-900/10 border-gray-50 dark:border-slate-800 transition-colors">
                                            <TableCell className="py-2.5 px-5 text-xs font-semibold text-gray-500 dark:text-slate-500">
                                                {label}
                                            </TableCell>
                                            <TableCell className="py-2.5 px-5 text-xs font-mono text-right font-black text-gray-900 dark:text-slate-100">
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
