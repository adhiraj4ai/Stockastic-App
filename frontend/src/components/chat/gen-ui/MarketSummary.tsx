import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, LayoutGrid, ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface MarketSummaryProps {
    market_index?: number;
    top_gainers: Array<{
        symbol: string;
        sector?: string;
        price_change: number;
    }>;
    top_losers: Array<{
        symbol: string;
        sector?: string;
        price_change: number;
    }>;
}

const MarketSummary: React.FC<MarketSummaryProps> = ({
    market_index,
    top_gainers = [],
    top_losers = [],
}) => {
    // Ensure data is always an array to prevent crashes
    const gainers = Array.isArray(top_gainers) ? top_gainers : [];
    const losers = Array.isArray(top_losers) ? top_losers : [];
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="horizon-card overflow-hidden border-gray-200 dark:border-gray-800 bg-white/50 dark:bg-gray-900/50 backdrop-blur-xl"
        >
            <div className="p-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                        <LayoutGrid size={20} />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white tracking-tight text-xl">Market snapshot</h3>
                        {market_index !== undefined && (
                            <div className={`flex items-center gap-1.5 text-sm font-semibold tracking-tight ${market_index >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                {market_index >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                                {market_index >= 0 ? '+' : ''}{market_index}% overall
                            </div>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Top Gainers */}
                    <div className="space-y-3">
                        <h4 className="text-xs font-semibold tracking-tight text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                            <ArrowUpRight size={14} />
                            Top gainers
                        </h4>
                        <div className="space-y-2">
                            {gainers.map((stock, i) => (
                                <motion.div
                                    key={stock.symbol}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: i * 0.1 }}
                                    className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800/50"
                                >
                                    <div>
                                        <div className="font-bold text-gray-900 dark:text-white tracking-tight">{stock.symbol}</div>
                                        {stock.sector && <div className="text-[10px] font-medium text-gray-500 dark:text-gray-500 tracking-tight">{stock.sector}</div>}
                                    </div>
                                    <div className="text-sm font-semibold text-emerald-500 tracking-tight">
                                        +{Number(stock.price_change || 0).toFixed(2)}%
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>

                    {/* Top Losers */}
                    <div className="space-y-3">
                        <h4 className="text-xs font-semibold tracking-tight text-rose-600 dark:text-rose-400 flex items-center gap-2">
                            <ArrowDownRight size={14} />
                            Top losers
                        </h4>
                        <div className="space-y-2">
                            {losers.map((stock, i) => (
                                <motion.div
                                    key={stock.symbol}
                                    initial={{ opacity: 0, x: 10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: i * 0.1 }}
                                    className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800/50"
                                >
                                    <div>
                                        <div className="font-bold text-gray-900 dark:text-white tracking-tight">{stock.symbol}</div>
                                        {stock.sector && <div className="text-[10px] font-medium text-gray-500 dark:text-gray-500 tracking-tight">{stock.sector}</div>}
                                    </div>
                                    <div className="text-sm font-semibold text-rose-500 tracking-tight">
                                        {Number(stock.price_change || 0).toFixed(2)}%
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

export default MarketSummary;
