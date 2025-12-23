'use client';

import React from 'react';
import { Bell, Info, TrendingUp, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Alert {
    id: number;
    title: string;
    message: string;
    type: 'INFO' | 'SUCCESS' | 'WARNING' | 'PRICE_ALERT';
    time: string;
    read: boolean;
}

const mockAlerts: Alert[] = [
    {
        id: 1,
        title: 'Price Target Hit',
        message: 'NABIL has reached your target price of Rs. 610. Strategy ready for execution.',
        type: 'PRICE_ALERT',
        time: '2 mins ago',
        read: false
    },
    {
        id: 2,
        title: 'Portfolio Rebalanced',
        message: 'Your monthly portfolio rebalancing has been successfully processed.',
        type: 'SUCCESS',
        time: '1 hour ago',
        read: false
    },
    {
        id: 3,
        title: 'Technical Breakout',
        message: 'SHLB showing RSI momentum above 70. Potential overbought zone.',
        type: 'WARNING',
        time: '3 hours ago',
        read: true
    },
    {
        id: 4,
        title: 'System Update',
        message: 'New accumulation patterns added to analysis engine.',
        type: 'INFO',
        time: '5 hours ago',
        read: true
    }
];

export function AlertsDropdown() {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors relative outline-none focus:ring-2 focus:ring-blue-100">
                    <Bell size={20} />
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80 p-0 border-none shadow-2xl overflow-hidden rounded-xl">
                <div className="bg-slate-900 px-4 py-3 flex justify-between items-center">
                    <DropdownMenuLabel className="p-0 text-white font-black text-xs uppercase tracking-widest flex items-center gap-2">
                        <Bell size={14} className="text-blue-400" /> Notifications
                    </DropdownMenuLabel>
                    <span className="text-[10px] bg-blue-500 text-white px-1.5 py-0.5 rounded font-black">2 NEW</span>
                </div>

                <div className="max-h-[350px] overflow-y-auto">
                    {mockAlerts.map((alert) => (
                        <div
                            key={alert.id}
                            className={`p-4 border-b border-gray-50 hover:bg-slate-50 transition-colors cursor-pointer relative ${!alert.read ? 'bg-blue-50/30' : ''}`}
                        >
                            {!alert.read && <div className="absolute top-4 left-1 w-1 h-8 bg-blue-500 rounded-full" />}
                            <div className="flex gap-3">
                                <div className={`mt-0.5 p-1.5 rounded-lg h-fit ${alert.type === 'PRICE_ALERT' ? 'bg-emerald-50 text-emerald-600' :
                                        alert.type === 'WARNING' ? 'bg-amber-50 text-amber-600' :
                                            alert.type === 'SUCCESS' ? 'bg-green-50 text-green-600' :
                                                'bg-blue-50 text-blue-600'
                                    }`}>
                                    {alert.type === 'PRICE_ALERT' ? <TrendingUp size={14} /> :
                                        alert.type === 'WARNING' ? <AlertTriangle size={14} /> :
                                            alert.type === 'SUCCESS' ? <CheckCircle2 size={14} /> :
                                                <Info size={14} />}
                                </div>
                                <div className="space-y-1">
                                    <div className="flex justify-between items-start">
                                        <h4 className="text-xs font-black text-slate-900 uppercase tracking-tight">{alert.title}</h4>
                                        <span className="text-[9px] font-bold text-slate-400 uppercase">{alert.time}</span>
                                    </div>
                                    <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                                        {alert.message}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="p-2 bg-gray-50 border-t border-gray-100">
                    <button className="w-full py-2 rounded-lg text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 hover:bg-gray-100 transition-all">
                        Mark all as read
                    </button>
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
