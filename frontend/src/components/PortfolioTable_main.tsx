'use client';

import React from 'react';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
    ArrowUpDown, PlusCircle, MinusCircle, Target, Radio
} from 'lucide-react';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import StockLink from '@/components/StockLink';
import { formatNepaliNumber } from '@/lib/formatters';
import { InfoTooltip } from '@/components/ui/InfoTooltip';

export interface PortfolioItem {
    id: number;
    account: number;
    ticker: string;
    quantity: number;
    buy_price: number;
    wacc: number;
    current_price: number;
    current_value: number;
    investment_value: number;
    gain_loss: number;
    gain_loss_percent: number;
    day_gain_loss: number;
    sector?: string;
    volatility?: number;
    stop_loss_price?: number;
    target_price?: number;
    target_price_2?: number;
    target_price_3?: number;
    thesis?: string;
    strategy_type?: string;
    signals?: {
        latest_date: string;
        summary: 'BUY' | 'SELL' | 'HOLD' | 'NEUTRAL' | 'MIXED';
        details: Array<{
            signal: string;
            strategy_name: string;
            strategy_description: string;
        }>;
        buy_count?: number;
    };
    health_score?: number;
    fundamental_metrics?: {
        pe: number | null;
        pb: number | null;
        roe: number | null;
        growth: number | null;
        de: number | null;
    };
    value_yield?: number;
}

interface PortfolioTableProps {
    items: PortfolioItem[];
    currentPage: number;
    pageSize: number;
    onSort: (key: keyof PortfolioItem) => void;
    onBuy: (ticker: string) => void;
    onSell: (ticker: string) => void;
    onStrategies: (item: PortfolioItem) => void;
    selectedPortfolioItem: PortfolioItem | null;
    isExitPlanDialogOpen: boolean;
}

export function PortfolioTable({
    items,
    currentPage,
    pageSize,
    onSort,
    onBuy,
    onSell,
    onStrategies,
    selectedPortfolioItem,
    isExitPlanDialogOpen
}: PortfolioTableProps) {
    if (items.length === 0) {
        return <div className="p-4 text-center text-gray-500">No holdings found for this account.</div>;
    }

    return (
        <div className="overflow-x-auto">
            <Table>
                <TableHeader>
                    <TableRow className="bg-gray-50/50 dark:bg-slate-800/30 hover:bg-gray-50/50 dark:hover:bg-slate-800/30">
                        <TableHead className="w-[50px] font-bold text-gray-900 dark:text-slate-100 py-4 px-6 text-center">SN</TableHead>
                        <TableHead className="font-bold text-gray-900 dark:text-slate-100 cursor-pointer select-none py-4" onClick={() => onSort('ticker')}>
                            <div className="flex items-center gap-1">
                                Ticker 
                                <InfoTooltip content="The unique stock symbol and business sector category." />
                                <ArrowUpDown size={12} className="opacity-50" />
                            </div>
                        </TableHead>
                        <TableHead className="text-right font-bold text-gray-900 dark:text-slate-100 cursor-pointer select-none py-4" onClick={() => onSort('quantity')}>
                            <div className="flex items-center justify-end gap-1">
                                Quantity 
                                <InfoTooltip content="Total number of units currently held in this position." />
                                <ArrowUpDown size={12} className="opacity-50" />
                            </div>
                        </TableHead>
                        <TableHead className="text-right font-bold text-gray-900 dark:text-slate-100 cursor-pointer select-none py-4" onClick={() => onSort('wacc')}>
                            <div className="flex items-center justify-end gap-1">
                                WACC (रू) 
                                <InfoTooltip content="Weighted Average Cost of Capital (Break-even entry price including commissions)." />
                                <ArrowUpDown size={12} className="opacity-50" />
                            </div>
                        </TableHead>
                        <TableHead className="text-right font-bold text-gray-900 dark:text-slate-100 cursor-pointer select-none py-4" onClick={() => onSort('current_price')}>
                            <div className="flex items-center justify-end gap-1">
                                LTP (रू) 
                                <InfoTooltip content="Last Traded Price. The current real-time market value per unit." />
                                <ArrowUpDown size={12} className="opacity-50" />
                            </div>
                        </TableHead>
                        <TableHead className="text-right font-bold text-gray-900 dark:text-slate-100 cursor-pointer select-none py-4" onClick={() => onSort('current_value')}>
                            <div className="flex items-center justify-end gap-1">
                                Total Value (रू) 
                                <InfoTooltip content="The total monetary valuation of the position at current market prices." />
                                <ArrowUpDown size={12} className="opacity-50" />
                            </div>
                        </TableHead>
                        <TableHead className="text-right font-bold text-gray-900 dark:text-slate-100 cursor-pointer select-none py-4" onClick={() => onSort('gain_loss')}>
                            <div className="flex items-center justify-end gap-1">
                                Profit/Loss (रू) 
                                <InfoTooltip content="Unrealized profit or loss (Current Value minus initial Investment)." />
                                <ArrowUpDown size={12} className="opacity-50" />
                            </div>
                        </TableHead>
                        <TableHead className="text-right font-bold text-gray-900 dark:text-slate-100 cursor-pointer select-none py-4" onClick={() => onSort('value_yield')}>
                            <div className="flex items-center justify-end gap-1">
                                Value Yield 
                                <InfoTooltip content="The percentage of profit relative to the total current value of the position." />
                                <ArrowUpDown size={12} className="opacity-50" />
                            </div>
                        </TableHead>
                        <TableHead className="text-right font-bold text-gray-900 dark:text-slate-100 cursor-pointer select-none py-4" onClick={() => onSort('day_gain_loss')}>
                            <div className="flex items-center justify-end gap-1">
                                Today's P/L (रू) 
                                <InfoTooltip content="Profit or loss generated specifically during the current trading session." />
                                <ArrowUpDown size={12} className="opacity-50" />
                            </div>
                        </TableHead>
                        <TableHead className="text-center font-bold text-gray-900 dark:text-slate-100">
                            <div className="flex items-center justify-center gap-1">
                                Health
                                <InfoTooltip content="Proprietary health score based on business fundamentals (Valuation, Growth, Efficiency)." />
                            </div>
                        </TableHead>
                        <TableHead className="text-center font-bold text-gray-900 dark:text-slate-100">Action</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {items.map((item, idx) => {
                        const pl = Number(item.gain_loss);
                        const isPos = pl >= 0;
                        const dayPl = Number(item.day_gain_loss);
                        const isDayPos = dayPl >= 0;

                        const hasStrategy = !!item.stop_loss_price;
                        const isUnderwater = Number(item.current_price) < Number(item.wacc || item.buy_price);

                        // Calculate R/R for row display
                        let rrRatio = 'N/A';
                        if (item.stop_loss_price && item.target_price && item.current_price) {
                            const risk = Number(item.current_price) - Number(item.stop_loss_price);
                            const reward = Number(item.target_price) - Number(item.current_price);
                            if (risk > 0) rrRatio = `1:${(reward / risk).toFixed(1)}`;
                        }

                        return (
                            <React.Fragment key={`${item.ticker}-${idx}`}>
                                <TableRow
                                    className={`transition-all duration-200 cursor-pointer border-l-4 hover:shadow-lg hover:scale-[1.01] hover:-translate-y-0.5 ${isExitPlanDialogOpen && selectedPortfolioItem?.ticker === item.ticker ? 'bg-blue-50/50 dark:bg-blue-900/30 border-l-blue-500 shadow-lg scale-[1.01]' : isUnderwater ? 'border-l-red-500/50 hover:bg-red-50/20 dark:hover:bg-red-900/20 hover:border-l-red-500' : hasStrategy ? 'border-l-green-500/50 hover:bg-green-50/20 dark:hover:bg-green-900/20 hover:border-l-green-500' : 'border-l-transparent hover:bg-slate-50/80 dark:hover:bg-slate-800/50 hover:border-l-blue-400/50'}`}
                                    onClick={() => onStrategies(item)}
                                >
                                    <TableCell className="text-center font-bold text-gray-400 dark:text-gray-500 text-sm py-4 px-6">
                                        {(currentPage - 1) * pageSize + idx + 1}
                                    </TableCell>
                                    <TableCell className="font-bold tracking-tight py-4">
                                        <div className="flex flex-col gap-1.5">
                                            <div className="flex items-center gap-2">
                                                <StockLink ticker={item.ticker} />
                                                {isUnderwater && (
                                                    <Badge variant="secondary" className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-100 dark:border-red-800 text-[9px] px-1.5 h-4 flex items-center gap-1">
                                                        Underwater
                                                    </Badge>
                                                )}
                                                {hasStrategy && (
                                                    <Badge variant="secondary" className="bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-800 text-[9px] px-1.5 h-4 flex items-center gap-1 animate-pulse">
                                                        <Radio className="h-2 w-2" /> Active
                                                    </Badge>
                                                )}
                                            </div>
                                            {(item.stop_loss_price || item.target_price) && (
                                                <div className="flex flex-wrap gap-1">
                                                    {item.stop_loss_price && <span className="text-xs bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded border border-red-100 dark:border-red-800 font-bold tracking-tight shadow-sm">SL: {Number(item.stop_loss_price).toFixed(0)}</span>}
                                                    {item.target_price && <span className="text-xs bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 px-1.5 py-0.5 rounded border border-green-100 dark:border-green-800 font-bold tracking-tight shadow-sm">TP: {Number(item.target_price).toFixed(0)}</span>}
                                                    {rrRatio !== 'N/A' && <span className="text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded border border-blue-100 dark:border-blue-800 font-bold tracking-tight shadow-sm">R/R: {rrRatio}</span>}
                                                </div>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right text-gray-600 dark:text-slate-400 font-bold tracking-tight py-4">{formatNepaliNumber(item.quantity)}</TableCell>
                                    <TableCell className="text-right text-gray-600 dark:text-slate-400 font-bold tracking-tight py-4">{formatNepaliNumber(Number(item.wacc || item.buy_price).toFixed(2))}</TableCell>
                                    <TableCell className="text-right text-gray-900 dark:text-slate-100 font-bold tracking-tight py-4">{formatNepaliNumber(item.current_price)}</TableCell>
                                    <TableCell className="text-right font-bold text-gray-900 dark:text-slate-100 tracking-tight py-4">{formatNepaliNumber(item.current_value)}</TableCell>
                                    <TableCell className={`text-right ${isPos ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'} py-4`}>
                                        <div className="font-bold text-base tracking-tight">
                                            {isPos ? '+' : ''}{formatNepaliNumber(pl)}
                                        </div>
                                        <div className={`text-xs font-bold tracking-tight ${isPos ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400'} px-1 rounded inline-block mt-0.5`}>
                                            {Number(item.gain_loss_percent).toFixed(2)}%
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right py-4">
                                        <div className="font-bold text-gray-600 dark:text-slate-400 text-sm text-right tracking-tight">
                                            {(item.value_yield || 0).toFixed(1)}%
                                        </div>
                                    </TableCell>
                                    <TableCell className={`text-right font-bold tracking-tight ${isDayPos ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'} py-4`}>
                                        {isDayPos ? '+' : ''}{formatNepaliNumber(dayPl)}
                                    </TableCell>
                                    <TableCell className="text-center py-4">
                                        {item.health_score !== undefined && item.health_score !== null ? (
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Badge
                                                        variant="secondary"
                                                        className={`font-bold transition-all px-2.5 py-1 ${item.health_score >= 70 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400' :
                                                            item.health_score >= 40 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' :
                                                                'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
                                                            }`}
                                                    >
                                                        {item.health_score}
                                                    </Badge>
                                                </TooltipTrigger>
                                                <TooltipContent className="p-0 border-none shadow-xl bg-white dark:bg-slate-900 overflow-hidden">
                                                    <div className="w-52 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                                                        <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                                                            <h4 className="text-xs font-bold tracking-normal text-slate-500">Fundamental health</h4>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <span className="text-xl font-bold text-slate-900 dark:text-slate-100">{item.health_score}</span>
                                                                <span className="text-[10px] font-medium text-slate-400">/ 100</span>
                                                            </div>
                                                        </div>
                                                        <div className="p-3 space-y-2 pb-4">
                                                            <div className="flex justify-between items-center text-[11px]">
                                                                <span className="text-slate-500">P/E Ratio</span>
                                                                <span className="font-bold text-slate-700 dark:text-slate-300">{item.fundamental_metrics?.pe?.toFixed(2) || 'N/A'}</span>
                                                            </div>
                                                            <div className="flex justify-between items-center text-[11px]">
                                                                <span className="text-slate-500">P/B Ratio</span>
                                                                <span className="font-bold text-slate-700 dark:text-slate-300">{item.fundamental_metrics?.pb?.toFixed(2) || 'N/A'}</span>
                                                            </div>
                                                            <div className="flex justify-between items-center text-[11px]">
                                                                <span className="text-slate-500">ROE</span>
                                                                <span className="font-bold text-slate-700 dark:text-slate-300">{item.fundamental_metrics?.roe ? `${item.fundamental_metrics.roe.toFixed(1)}%` : 'N/A'}</span>
                                                            </div>
                                                            <div className="flex justify-between items-center text-[11px]">
                                                                <span className="text-slate-500">EPS Growth</span>
                                                                <span className="font-bold text-slate-700 dark:text-slate-300">{item.fundamental_metrics?.growth ? `${item.fundamental_metrics.growth.toFixed(1)}%` : 'N/A'}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </TooltipContent>
                                            </Tooltip>
                                        ) : (
                                            <span className="text-xs text-slate-400">--</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-center py-4">
                                        <div className="flex justify-center gap-1">
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onBuy(item.ticker);
                                                        }}
                                                        className="p-2 text-gray-300 dark:text-slate-600 hover:text-green-600 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-all"
                                                    >
                                                        <PlusCircle size={18} />
                                                    </button>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p>Buy More</p>
                                                </TooltipContent>
                                            </Tooltip>

                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onSell(item.ticker);
                                                        }}
                                                        className="p-2 text-gray-300 dark:text-slate-600 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                                                    >
                                                        <MinusCircle size={18} />
                                                    </button>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p>Sell</p>
                                                </TooltipContent>
                                            </Tooltip>

                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <button
                                                        className={`p-2 rounded-lg transition-all ${isExitPlanDialogOpen && selectedPortfolioItem?.ticker === item.ticker ? 'bg-blue-600 dark:bg-blue-500 text-white shadow-xl rotate-0' : 'text-gray-300 dark:text-slate-600 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rotate-[-45deg] hover:rotate-0'}`}
                                                    >
                                                        <Target size={18} />
                                                    </button>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    <p>View Strategies</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            </React.Fragment>
                        );
                    })}
                </TableBody>
            </Table>
        </div>
    );
}
