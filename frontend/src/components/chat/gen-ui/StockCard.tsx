import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Activity, DollarSign, BarChart3, ChevronRight } from 'lucide-react';

interface StockCardProps {
    symbol: string;
    name?: string;
    price: number;
    change: number;
    change_pct: number;
    sector?: string;
    volume?: number;
    high_52w?: number;
    low_52w?: number;
}

const StockCard: React.FC<StockCardProps> = ({
    symbol,
    name,
    price,
    change,
    change_pct,
    sector,
    volume,
    high_52w,
    low_52w,
}) => {
    const isPositive = change >= 0;

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="horizon-card overflow-hidden !p-0 border-gray-200 dark:border-gray-800"
        >
            <div className="p-5">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <h3 className="text-xl font-black text-gray-900 dark:text-white flex items-center gap-2">
                            {symbol}
                            {sector && (
                                <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 font-bold">
                                    {sector}
                                </span>
                            )}
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-1">{name}</p>
                    </div>
                    <div className="text-right">
                        <div className="text-2xl font-black text-gray-900 dark:text-white">
                            Rs. {price.toLocaleString()}
                        </div>
                        <div className={`flex items-center justify-end gap-1 font-bold ${isPositive ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {isPositive ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                            {isPositive ? '+' : ''}{change} ({change_pct.toFixed(2)}%)
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-6">
                    <div className="bg-gray-50 dark:bg-gray-900/40 p-3 rounded-xl border border-gray-100 dark:border-gray-800/50">
                        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs font-semibold mb-1">
                            <Activity size={12} />
                            VOLUME
                        </div>
                        <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
                            {volume ? volume.toLocaleString() : 'N/A'}
                        </div>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-900/40 p-3 rounded-xl border border-gray-100 dark:border-gray-800/50">
                        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs font-semibold mb-1">
                            <BarChart3 size={12} />
                            52W RANGE
                        </div>
                        <div className="text-[10px] font-bold text-gray-900 dark:text-gray-100 flex justify-between">
                            <span>Low: {low_52w || '-'}</span>
                            <span>High: {high_52w || '-'}</span>
                        </div>
                        <div className="mt-1 h-1 bg-gray-200 dark:bg-gray-800 rounded-full relative overflow-hidden">
                            {price && high_52w && low_52w && (
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${Math.min(100, Math.max(0, ((price - low_52w) / (high_52w - low_52w)) * 100))}%` }}
                                    className="absolute h-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                                />
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="px-5 py-3 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-100 dark:border-gray-800/50 flex justify-between items-center">
                <button className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 transition-all hover:gap-1.5">
                    VIEW FULL CHART <ChevronRight size={12} />
                </button>
                <button className="text-[11px] font-bold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
                    TECHNICALS
                </button>
            </div>
        </motion.div>
    );
};

export default StockCard;
