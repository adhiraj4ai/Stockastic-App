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
import api from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';

interface Alert {
    id: number;
    title: string;
    message: string;
    type: 'INFO' | 'SUCCESS' | 'WARNING' | 'PRICE_ALERT' | 'STOP_LOSS';
    ticker: string | null;
    read: boolean;
    created_at: string;
}

export function AlertsDropdown() {
    const [alerts, setAlerts] = React.useState<Alert[]>([]);
    const [loading, setLoading] = React.useState(true);

    const fetchNotifications = async () => {
        try {
            const response = await api.get('/api/stocks/notifications/');
            setAlerts(response.data);
            setLoading(false);
        } catch (error) {
            console.error('Failed to fetch notifications:', error);
            setLoading(false);
        }
    };

    const triggerCheck = async () => {
        try {
            await api.post('/api/stocks/notifications/trigger_check/');
            fetchNotifications();
        } catch (error) {
            console.error('Failed to trigger check:', error);
        }
    };

    const markAllAsRead = async () => {
        try {
            await api.post('/api/stocks/notifications/mark_all_as_read/');
            setAlerts(prev => prev.map(a => ({ ...a, read: true })));
        } catch (error) {
            console.error('Failed to mark all as read:', error);
        }
    };

    const markAsRead = async (id: number) => {
        try {
            await api.post(`/api/stocks/notifications/${id}/mark_as_read/`);
            setAlerts(prev => prev.map(a => a.id === id ? { ...a, read: true } : a));
        } catch (error) {
            console.error('Failed to mark as read:', error);
        }
    };

    React.useEffect(() => {
        fetchNotifications();
        // Periodically refresh notifications
        const interval = setInterval(fetchNotifications, 60000);
        return () => clearInterval(interval);
    }, []);

    const unreadCount = alerts.filter(a => !a.read).length;

    return (
        <DropdownMenu onOpenChange={(open) => open && triggerCheck()}>
            <DropdownMenuTrigger asChild>
                <button className="p-2 rounded-full hover:bg-amber-50 dark:hover:bg-amber-900/20 text-amber-500 hover:text-amber-600 dark:text-amber-400 transition-colors relative outline-none focus:ring-2 focus:ring-amber-100">
                    <Bell size={20} />
                    {unreadCount > 0 && (
                        <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
                    )}
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80 p-0 border-none shadow-2xl overflow-hidden rounded-xl">
                <div className="bg-slate-900 px-4 py-3 flex justify-between items-center">
                    <DropdownMenuLabel className="p-0 text-white font-black text-xs uppercase tracking-widest flex items-center gap-2">
                        <Bell size={14} className="text-blue-400" /> Notifications
                    </DropdownMenuLabel>
                    {unreadCount > 0 && (
                        <span className="text-[10px] bg-blue-500 text-white px-1.5 py-0.5 rounded font-black">
                            {unreadCount} NEW
                        </span>
                    )}
                </div>

                <div className="max-h-[350px] overflow-y-auto">
                    {alerts.length === 0 ? (
                        <div className="p-8 text-center space-y-2">
                            <div className="bg-slate-50 w-10 h-10 rounded-full flex items-center justify-center mx-auto text-slate-300">
                                <Bell size={20} />
                            </div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No notifications</p>
                        </div>
                    ) : (
                        alerts.map((alert) => (
                            <div
                                key={alert.id}
                                onClick={() => !alert.read && markAsRead(alert.id)}
                                className={`p-4 border-b border-gray-50 hover:bg-slate-50 transition-colors cursor-pointer relative ${!alert.read ? 'bg-blue-50/30' : ''}`}
                            >
                                {!alert.read && <div className="absolute top-4 left-1 w-1 h-8 bg-blue-500 rounded-full" />}
                                <div className="flex gap-3">
                                    <div className={`mt-0.5 p-1.5 rounded-lg h-fit ${alert.type === 'PRICE_ALERT' ? 'bg-emerald-50 text-emerald-600' :
                                        alert.type === 'STOP_LOSS' ? 'bg-rose-50 text-rose-600' :
                                            alert.type === 'WARNING' ? 'bg-amber-50 text-amber-600' :
                                                alert.type === 'SUCCESS' ? 'bg-green-50 text-green-600' :
                                                    'bg-blue-50 text-blue-600'
                                        }`}>
                                        {alert.type === 'PRICE_ALERT' ? <TrendingUp size={14} /> :
                                            alert.type === 'STOP_LOSS' ? <AlertTriangle size={14} /> :
                                                alert.type === 'WARNING' ? <AlertTriangle size={14} /> :
                                                    alert.type === 'SUCCESS' ? <CheckCircle2 size={14} /> :
                                                        <Info size={14} />}
                                    </div>
                                    <div className="space-y-1 flex-1">
                                        <div className="flex justify-between items-start">
                                            <h4 className="text-xs font-black text-slate-900 uppercase tracking-tight">{alert.title}</h4>
                                            <span className="text-[9px] font-bold text-slate-400 uppercase">
                                                {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                                            {alert.message}
                                        </p>
                                        {alert.ticker && (
                                            <div className="pt-2">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        // Potential redirect or modal open logic
                                                    }}
                                                    className="text-[9px] font-black text-blue-600 uppercase tracking-widest hover:text-blue-800 flex items-center gap-1"
                                                >
                                                    View {alert.ticker}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {unreadCount > 0 && (
                    <div className="p-2 bg-gray-50 border-t border-gray-100">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                markAllAsRead();
                            }}
                            className="w-full py-2 rounded-lg text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 hover:bg-gray-100 transition-all"
                        >
                            Mark all as read
                        </button>
                    </div>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
