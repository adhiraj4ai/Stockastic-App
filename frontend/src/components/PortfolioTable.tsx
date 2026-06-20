'use client';

import React from 'react';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
    ArrowUpDown, Radio
} from 'lucide-react';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import StockLink from '@/components/StockLink';
import { ClassificationToggle, Classification } from '@/components/ClassificationToggle';
import { formatNepaliNumber } from '@/lib/formatters';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { SentimentBadge } from '@/components/portfolio/ui';
import { HoldingSnapshot } from '@/components/HoldingSnapshot';

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
    purchased_at?: string;
    tags?: string[];
    classification?: Classification;
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
    onClassificationChange?: (id: number, value: Classification) => void;
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
    isExitPlanDialogOpen,
    onClassificationChange,
}: PortfolioTableProps) {
    if (items.length === 0) {
        return <div className="p-6 text-center text-sm text-muted-foreground">No holdings found for this account.</div>;
    }

    return (
        <div className="overflow-x-auto">
            <Table>
                <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40 border-border">
                        <TableHead className="w-[50px] text-[10px] font-semibold uppercase tracking-wider text-muted-foreground py-4 px-6 text-center">SN</TableHead>
                        <TableHead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer select-none py-4" onClick={() => onSort('ticker')}>
                            <div className="flex items-center gap-1">
                                Ticker 
                                <InfoTooltip content="The unique stock symbol and business sector category." />
                                <ArrowUpDown size={12} className="opacity-50" />
                            </div>
                        </TableHead>
                        <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer select-none py-4" onClick={() => onSort('quantity')}>
                            <div className="flex items-center justify-end gap-1">
                                Quantity 
                                <InfoTooltip content="Total number of units currently held in this position." />
                                <ArrowUpDown size={12} className="opacity-50" />
                            </div>
                        </TableHead>
                        <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer select-none py-4" onClick={() => onSort('wacc')}>
                            <div className="flex items-center justify-end gap-1">
                                WACC (रू) 
                                <InfoTooltip content="Weighted Average Cost of Capital (Break-even entry price including commissions)." />
                                <ArrowUpDown size={12} className="opacity-50" />
                            </div>
                        </TableHead>
                        <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer select-none py-4" onClick={() => onSort('current_price')}>
                            <div className="flex items-center justify-end gap-1">
                                LTP (रू) 
                                <InfoTooltip content="Last Traded Price. The current real-time market value per unit." />
                                <ArrowUpDown size={12} className="opacity-50" />
                            </div>
                        </TableHead>
                        <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer select-none py-4" onClick={() => onSort('current_value')}>
                            <div className="flex items-center justify-end gap-1">
                                Total Value (रू) 
                                <InfoTooltip content="The total monetary valuation of the position at current market prices." />
                                <ArrowUpDown size={12} className="opacity-50" />
                            </div>
                        </TableHead>
                        <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer select-none py-4" onClick={() => onSort('gain_loss')}>
                            <div className="flex items-center justify-end gap-1">
                                Profit/Loss (रू) 
                                <InfoTooltip content="Unrealized profit or loss (Current Value minus initial Investment)." />
                                <ArrowUpDown size={12} className="opacity-50" />
                            </div>
                        </TableHead>
                        <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer select-none py-4" onClick={() => onSort('value_yield')}>
                            <div className="flex items-center justify-end gap-1">
                                Value Yield 
                                <InfoTooltip content="The percentage of profit relative to the total current value of the position." />
                                <ArrowUpDown size={12} className="opacity-50" />
                            </div>
                        </TableHead>
                        <TableHead className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer select-none py-4" onClick={() => onSort('day_gain_loss')}>
                            <div className="flex items-center justify-end gap-1">
                                Today's P/L (रू) 
                                <InfoTooltip content="Profit or loss generated specifically during the current trading session." />
                                <ArrowUpDown size={12} className="opacity-50" />
                            </div>
                        </TableHead>
                        <TableHead className="text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            <div className="flex items-center justify-center gap-1">
                                Health
                                <InfoTooltip content="Proprietary health score based on business fundamentals (Valuation, Growth, Efficiency)." />
                            </div>
                        </TableHead>
                        <TableHead className="text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Action</TableHead>
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
                                    className={`transition-colors duration-150 cursor-pointer border-l-4 border-border/50 even:bg-muted/20 ${isExitPlanDialogOpen && selectedPortfolioItem?.ticker === item.ticker ? 'bg-primary/10 border-l-primary' : isUnderwater ? 'border-l-rose-500/50 hover:bg-rose-500/15 hover:border-l-rose-500' : hasStrategy ? 'border-l-emerald-500/50 hover:bg-emerald-500/15 hover:border-l-emerald-500' : 'border-l-transparent hover:bg-muted/40 hover:border-l-primary/50'}`}
                                    onClick={() => onStrategies(item)}
                                >
                                    <TableCell className="text-center font-semibold text-muted-foreground text-xs py-4 px-6 tabular-nums">
                                        {(currentPage - 1) * pageSize + idx + 1}
                                    </TableCell>
                                    <TableCell className="font-bold tracking-tight py-4">
                                        <div className="flex flex-col gap-1.5">
                                            <div className="flex items-center gap-2">
                                                <StockLink ticker={item.ticker} />
                                                <ClassificationToggle
                                                    itemId={item.id}
                                                    classification={item.classification ?? 'trading'}
                                                    onChange={onClassificationChange}
                                                />
                                                {isUnderwater && (
                                                    <Badge variant="secondary" className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25 text-[9px] px-1.5 h-4 flex items-center gap-1">
                                                        Underwater
                                                    </Badge>
                                                )}
                                                {hasStrategy && (
                                                    <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/25 text-[9px] px-1.5 h-4 flex items-center gap-1 animate-pulse">
                                                        <Radio className="h-2 w-2" /> Active
                                                    </Badge>
                                                )}
                                            </div>
                                            {(item.stop_loss_price || item.target_price) && (
                                                <div className="flex flex-wrap gap-1">
                                                    {item.stop_loss_price && <span className="text-xs bg-rose-500/10 text-rose-600 dark:text-rose-400 px-1.5 py-0.5 rounded-full border border-rose-500/25 font-semibold tabular-nums">SL: {Number(item.stop_loss_price).toFixed(0)}</span>}
                                                    {item.target_price && <span className="text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded-full border border-emerald-500/25 font-semibold tabular-nums">TP: {Number(item.target_price).toFixed(0)}</span>}
                                                    {rrRatio !== 'N/A' && <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full border border-primary/25 font-semibold tabular-nums">R/R: {rrRatio}</span>}
                                                </div>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right text-muted-foreground font-medium tabular-nums py-4">{formatNepaliNumber(item.quantity)}</TableCell>
                                    <TableCell className="text-right text-muted-foreground font-medium tabular-nums py-4">{formatNepaliNumber(Number(item.wacc || item.buy_price).toFixed(2))}</TableCell>
                                    <TableCell className="text-right text-foreground font-semibold tabular-nums py-4">{formatNepaliNumber(item.current_price)}</TableCell>
                                    <TableCell className="text-right text-foreground font-semibold tabular-nums py-4">{formatNepaliNumber(item.current_value)}</TableCell>
                                    <TableCell className={`text-right ${isPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'} py-4`}>
                                        <div className="font-semibold text-sm tabular-nums">
                                            {isPos ? '+' : ''}{formatNepaliNumber(pl)}
                                        </div>
                                        <div className="mt-0.5">
                                            <SentimentBadge tone={isPos ? 'up' : 'down'}>
                                                {isPos ? '+' : ''}{Number(item.gain_loss_percent).toFixed(2)}%
                                            </SentimentBadge>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right py-4">
                                        <div className="font-medium text-muted-foreground text-sm text-right tabular-nums">
                                            {(item.value_yield || 0).toFixed(1)}%
                                        </div>
                                    </TableCell>
                                    <TableCell className={`text-right font-semibold tabular-nums text-sm ${isDayPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'} py-4`}>
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
                                                                'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400'
                                                            }`}
                                                    >
                                                        {item.health_score}
                                                    </Badge>
                                                </TooltipTrigger>
                                                <TooltipContent className="p-0 border-none bg-transparent shadow-xl">
                                                    <HoldingSnapshot item={item} />
                                                </TooltipContent>
                                            </Tooltip>
                                        ) : (
                                            <span className="text-xs text-slate-400">--</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-center py-4">
                                        <div className="flex justify-center gap-2">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onBuy(item.ticker);
                                                }}
                                                className="px-3 py-1.5 text-[11px] font-semibold rounded-lg border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10 transition-all"
                                            >
                                                Buy
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onSell(item.ticker);
                                                }}
                                                className="px-3 py-1.5 text-[11px] font-semibold rounded-lg border border-rose-500/30 text-rose-700 dark:text-rose-400 hover:bg-rose-500/10 transition-all"
                                            >
                                                Sell
                                            </button>
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
