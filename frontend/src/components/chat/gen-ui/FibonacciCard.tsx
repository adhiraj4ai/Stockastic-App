import React from 'react';
import { motion } from 'framer-motion';
import { Target, ArrowUp, ArrowDown, Activity } from 'lucide-react';

interface FibonacciLevel {
    ratio: number;
    label: string;
    price: number;
    distance_pct: number;
    is_above: boolean;
}

interface FibonacciCardProps {
    symbol: string;
    current_price: number;
    swing_high: number;
    swing_low: number;
    trend: 'UPTREND' | 'DOWNTREND';
    levels: FibonacciLevel[];
    nearest_support?: FibonacciLevel;
    nearest_resistance?: FibonacciLevel;
    max_upside_percent: number;
    max_downside_percent: number;
}

const FibonacciCard: React.FC<FibonacciCardProps> = ({
    symbol,
    current_price,
    swing_high,
    swing_low,
    trend,
    levels,
    nearest_support,
    nearest_resistance,
    max_upside_percent,
    max_downside_percent,
}) => {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="horizon-card border-gray-200 dark:border-gray-800 bg-gradient-to-br from-gray-50/50 to-white/50 dark:from-gray-900/40 dark:to-gray-950/40"
        >
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h3 className="font-bold text-gray-900 dark:text-white tracking-tight flex items-center gap-2">
                        Fibonacci analysis
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold tracking-tight ${trend === 'UPTREND' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                            {trend === 'UPTREND' ? 'Uptrend' : 'Downtrend'}
                        </span>
                    </h3>
                    <p className="text-[10px] font-medium text-gray-500 dark:text-gray-500 tracking-tight">{symbol} • retracement targets</p>
                </div>
                <div className="text-right">
                    <div className="text-lg font-bold text-gray-900 dark:text-white tracking-tight">Rs. {current_price}</div>
                    <div className="text-[10px] font-medium text-gray-400 tracking-tight">Current price</div>
                </div>
            </div>

            <div className="space-y-3">
                {levels.map((level, idx) => (
                    <div key={level.label} className="relative group">
                        <div className="flex justify-between items-center mb-1">
                            <span className={`text-[10px] font-medium tracking-tight ${level.price === current_price ? 'text-emerald-500' : 'text-gray-400'}`}>
                                {level.label}
                            </span>
                            <span className="text-[10px] font-semibold text-gray-900 dark:text-gray-200 tracking-tight">
                                Rs. {level.price}
                            </span>
                        </div>
                        <div className="h-1 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${level.ratio * 100}%` }}
                                className={`h-full ${level.is_above ? 'bg-rose-500/30' : 'bg-emerald-500/30'}`}
                            />
                        </div>
                        {level.price === nearest_support?.price && (
                            <div className="absolute -left-2 top-0 h-full w-0.5 bg-emerald-500 rounded-full" title="Nearest Support" />
                        )}
                        {level.price === nearest_resistance?.price && (
                            <div className="absolute -left-2 top-0 h-full w-0.5 bg-rose-500 rounded-full" title="Nearest Resistance" />
                        )}
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-2 gap-4 mt-6 pt-4 border-t border-gray-100 dark:border-gray-800/50">
                <div>
                    <div className="text-[9px] font-medium text-emerald-600 dark:text-emerald-500 mb-1 flex items-center gap-1 tracking-tight">
                        <Target size={10} /> Nearest support
                    </div>
                    <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 tracking-tight">
                        {nearest_support ? `Rs. ${nearest_support.price}` : 'N/A'}
                    </div>
                </div>
                <div>
                    <div className="text-[9px] font-medium text-rose-600 dark:text-rose-500 mb-1 flex items-center gap-1 tracking-tight">
                        <Target size={10} /> Nearest resistance
                    </div>
                    <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 tracking-tight">
                        {nearest_resistance ? `Rs. ${nearest_resistance.price}` : 'N/A'}
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

export default FibonacciCard;
