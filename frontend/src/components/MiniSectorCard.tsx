'use client';

import React from 'react';
import { Sparkline } from './Sparkline';

interface MiniSectorCardProps {
    name: string;
    change: number;
    turnover: number;
    sparkData?: number[];
}

export const MiniSectorCard = ({ name, change, turnover, sparkData = [20, 30, 25, 40, 35, 50] }: MiniSectorCardProps) => {
    const isPositive = change >= 0;

    return (
        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow group cursor-pointer">
            <div className="flex justify-between items-start mb-3">
                <div className="space-y-0.5">
                    <span className="text-[10px] font-black text-slate-900 tracking-widest">{name}</span>
                    <div className={`text-lg font-black tracking-tight ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {isPositive ? '+' : ''}{change.toFixed(2)}%
                    </div>
                </div>
                <div className="h-10 w-20">
                    <Sparkline data={sparkData} height={40} color={isPositive ? '#059669' : '#e11d48'} />
                </div>
            </div>
            <div className="flex justify-between items-center pt-3 border-t border-slate-50">
                <span className="text-[9px] font-bold text-slate-900">Turnover</span>
                <span className="text-[10px] font-mono font-bold text-slate-800">Rs. {(turnover / 1000000).toFixed(1)}M</span>
            </div>
        </div>
    );
};
