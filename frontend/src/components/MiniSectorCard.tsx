'use client';

import React from 'react';
import { Sparkline } from './Sparkline';

interface MiniSectorCardProps {
    name: string;
    change: number;
    turnover: number;
    sparkData?: number[];
    icon?: React.ReactNode;
    gradient?: string;
}

export const MiniSectorCard = ({
    name,
    change,
    turnover,
    sparkData = [20, 30, 25, 40, 35, 50],
    icon,
    gradient = "from-blue-500/10 to-indigo-500/10"
}: MiniSectorCardProps) => {
    const isPositive = change >= 0;

    return (
        <div className="relative overflow-hidden bg-white dark:bg-slate-900/50 p-3.5 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 shadow-lg hover:shadow-xl transition-all duration-500 group cursor-pointer backdrop-blur-xl">
            {/* Ambient Background Gradient */}
            <div className={`absolute -right-4 -top-4 w-20 h-20 bg-gradient-to-br ${gradient} blur-2xl opacity-20 group-hover:opacity-40 transition-opacity duration-700`} />

            <div className="relative z-10">
                <div className="flex justify-between items-start mb-2.5">
                    <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                            {icon && (
                                <div className={`p-1 rounded-md bg-gradient-to-br ${gradient} text-slate-700 dark:text-slate-300 shadow-sm transition-transform group-hover:scale-110 duration-500`}>
                                    {React.cloneElement(icon as React.ReactElement<any>, { size: 12 })}
                                </div>
                            )}
                            <span className="text-[9px] font-black text-slate-500 dark:text-slate-400 tracking-wider uppercase truncate max-w-[80px]">{name}</span>
                        </div>
                        <div className={`text-xl font-black tracking-tighter ${isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                            {isPositive ? '+' : ''}{change.toFixed(2)}%
                        </div>
                    </div>
                    <div className="h-10 w-16">
                        <Sparkline data={sparkData} height={40} color={isPositive ? '#10b981' : '#f43f5e'} />
                    </div>
                </div>

                <div className="flex justify-between items-center pt-2.5 border-t border-slate-100 dark:border-white/5">
                    <div className="flex flex-col">
                        <span className="text-[8px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tight">Turnover</span>
                        <span className="text-[10px] font-mono font-bold text-slate-800 dark:text-slate-200">Rs. {(turnover / 1000000).toFixed(1)}M</span>
                    </div>
                    <div className={`h-1 w-1 rounded-full ${isPositive ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                </div>
            </div>
        </div>
    );
};
