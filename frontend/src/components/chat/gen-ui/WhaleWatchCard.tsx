import React from 'react';
import { motion } from 'framer-motion';
import { Shield, Target, Users, BarChart3, ArrowUpRight } from 'lucide-react';

interface WhaleEntry {
    broker_id: number;
    total_turnover: number;
    top_picks: Array<{
        symbol: string;
        turnover: number;
        quantity: number;
    }>;
}

interface WhaleWatchCardProps {
    date: string;
    whales: WhaleEntry[];
}

const WhaleWatchCard: React.FC<WhaleWatchCardProps> = ({ date, whales }) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="horizon-card border-gray-200 dark:border-gray-800"
        >
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
                        <Shield size={20} />
                    </div>
                    <div>
                        <h3 className="font-bold text-gray-900 dark:text-white tracking-tight">Whale watch</h3>
                        <p className="text-[10px] font-medium text-gray-500 dark:text-gray-500 tracking-tight">{date}</p>
                    </div>
                </div>
                <div className="px-3 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full text-[10px] font-semibold tracking-tight border border-emerald-500/10">
                    Institutional
                </div>
            </div>

            <div className="space-y-4">
                {whales.map((whale, idx) => (
                    <motion.div
                        key={whale.broker_id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-800/50 hover:border-primary/30 transition-all group"
                    >
                        <div className="flex justify-between items-center mb-3">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 tracking-tight">#0{idx + 1}</span>
                                <span className="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-primary transition-colors tracking-tight">
                                    Broker {whale.broker_id}
                                </span>
                            </div>
                            <div className="text-[11px] font-medium text-gray-500 dark:text-gray-400 tracking-tight">
                                Turnover: <span className="text-gray-900 dark:text-gray-200 font-semibold">Rs. {(whale.total_turnover / 1000000).toFixed(1)}M</span>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-2 mt-2">
                            {whale.top_picks.map((pick) => (
                                <div
                                    key={pick.symbol}
                                    className="px-2 py-1 rounded-lg bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 text-[10px] font-semibold flex items-center gap-1.5 shadow-sm hover:shadow-md transition-all cursor-default tracking-tight"
                                >
                                    <span className="text-gray-900 dark:text-gray-100">{pick.symbol}</span>
                                    <span className="text-[8px] text-gray-400 px-1 border-l border-gray-100 dark:border-gray-800">
                                        {(pick.turnover / 1000000).toFixed(1)}M
                                    </span>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                ))}
            </div>

            <div className="mt-6 flex justify-center">
                <button className="text-xs font-medium text-gray-400 hover:text-primary transition-colors flex items-center gap-2 tracking-tight">
                    Explore deeper trends <ArrowUpRight size={14} />
                </button>
            </div>
        </motion.div>
    );
};

export default WhaleWatchCard;
