'use client';

import React from 'react';
import { Bell, Info, TrendingUp, TrendingDown, AlertTriangle, AlertCircle, CheckCircle, CheckCircle2, Target, Eye, Fish, ExternalLink, RefreshCw, Filter } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import api from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

interface Alert {
    id: number;
    title: string;
    message: string;
    type: 'STOP_LOSS_HIT' | 'TARGET_REACHED' | 'SIGNIFICANT_GAIN' | 'SIGNIFICANT_LOSS' | 'BELOW_WACC' |
    'WATCHLIST_BREAKOUT' | 'WATCHLIST_ENTRY' |
    'SIGNAL_BUY' | 'SIGNAL_SELL' | 'SIGNAL_STRONG_BUY' | 'SIGNAL_STRONG_SELL' |
    'WHALE_BUY' | 'WHALE_SELL' |
    'INFO' | 'SUCCESS' | 'WARNING' | 'PRICE_ALERT' | 'TREND_BUY_5D' |
    'VOLUME_SPIKE' | 'RSI_OVERSOLD' | 'RSI_OVERBOUGHT' | 
    'MACD_BULLISH' | 'MACD_BEARISH' | 'GOLDEN_CROSS' | 'DEATH_CROSS' |
    'CONSISTENT_BUYING' | 'CONSISTENT_SELLING' | 'WHALE_ENTRY' |
    'SECTOR_PUMP' | 'MARKET_BREADTH_SHIFT' | 'PORTFOLIO_DIVERSITY' | 'TAKE_PROFIT';
    ticker: string | null;
    read: boolean;
    created_at: string;
    redirect_url?: string;
    metadata?: any;
}

function getToastVariant(type: Alert['type']): 'success' | 'error' | 'warning' | 'info' {
    switch (type) {
        case 'TARGET_REACHED':
        case 'SIGNIFICANT_GAIN':
        case 'SIGNAL_BUY':
        case 'SIGNAL_STRONG_BUY':
        case 'WHALE_BUY':
        case 'TREND_BUY_5D':
            return 'success';
        case 'STOP_LOSS_HIT':
        case 'SIGNIFICANT_LOSS':
        case 'SIGNAL_SELL':
        case 'SIGNAL_STRONG_SELL':
        case 'WHALE_SELL':
            return 'error';
        case 'WARNING':
        case 'BELOW_WACC':
        case 'PORTFOLIO_DIVERSITY':
            return 'warning';
        case 'RSI_OVERSOLD':
        case 'GOLDEN_CROSS':
        case 'WHALE_ENTRY':
        case 'VOLUME_SPIKE':
            return 'success';
        default:
            return 'info';
    }
}

export function AlertsDropdown() {
    const [alerts, setAlerts] = React.useState<Alert[]>([]);
    const [loading, setLoading] = React.useState(true);
    const seenIds = React.useRef<Set<number>>(new Set());
    const isFirstFetch = React.useRef(true);
    const router = useRouter();

    const fetchNotifications = async () => {
        try {
            const response = await api.get('/api/stocks/notifications/');
            const incoming: Alert[] = response.data;
            setAlerts(incoming);
            setLoading(false);

            // On the very first fetch just seed seenIds — don't toast stale notifications
            if (isFirstFetch.current) {
                incoming.forEach(a => seenIds.current.add(a.id));
                isFirstFetch.current = false;
                return;
            }

            // Toast any unread notifications we haven't seen yet
            incoming
                .filter(a => !a.read && !seenIds.current.has(a.id))
                .forEach(a => {
                    seenIds.current.add(a.id);
                    const variant = getToastVariant(a.type);
                    const action = a.redirect_url
                        ? { label: 'View', onClick: () => router.push(a.redirect_url!) }
                        : undefined;
                    toast[variant](a.title, {
                        description: a.message,
                        action,
                        duration: 7000,
                    });
                });
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

    const handleNotificationClick = (alert: Alert) => {
        // Mark as read
        if (!alert.read) {
            markAsRead(alert.id);
        }

        // Redirect if URL provided
        if (alert.redirect_url) {
            router.push(alert.redirect_url);
        } else if (alert.ticker) {
            // Fallback: redirect to ticker page
            router.push(`/ticker/${alert.ticker}`);
        }
    };

    const getNotificationIcon = (type: Alert['type']) => {
        switch (type) {
            case 'STOP_LOSS_HIT':
                return <AlertCircle size={14} />;
            case 'TARGET_REACHED':
                return <Target size={14} />;
            case 'SIGNIFICANT_GAIN':
                return <TrendingUp size={14} />;
            case 'SIGNIFICANT_LOSS':
                return <TrendingDown size={14} />;
            case 'WATCHLIST_ENTRY':
                return <Eye size={14} />;
            case 'WATCHLIST_BREAKOUT':
                return <TrendingUp size={14} />;
            case 'SIGNAL_BUY':
            case 'SIGNAL_STRONG_BUY':
                return <TrendingUp size={14} />;
            case 'SIGNAL_SELL':
            case 'SIGNAL_STRONG_SELL':
                return <TrendingDown size={14} />;
            case 'WHALE_BUY':
            case 'WHALE_SELL':
                return <Fish size={14} />;
            case 'TREND_BUY_5D':
                return <TrendingUp size={14} />;
            case 'SUCCESS':
                return <CheckCircle size={14} />;
            case 'VOLUME_SPIKE':
                return <RefreshCw size={14} />;
            case 'RSI_OVERSOLD':
                return <Target size={14} />;
            case 'RSI_OVERBOUGHT':
                return <AlertCircle size={14} />;
            case 'GOLDEN_CROSS':
                return <TrendingUp size={14} />;
            case 'WHALE_ENTRY':
                return <Fish size={14} />;
            case 'SECTOR_PUMP':
                return <TrendingUp size={14} />;
            case 'PORTFOLIO_DIVERSITY':
                return <Filter size={14} />;
            case 'WARNING':
            case 'PRICE_ALERT':
                return <AlertCircle size={14} />;
            default:
                return <Info size={14} />;
        }
    };

    const getNotificationColor = (type: Alert['type']) => {
        switch (type) {
            case 'STOP_LOSS_HIT':
                return 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400';
            case 'TARGET_REACHED':
                return 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400';
            case 'SIGNIFICANT_GAIN':
                return 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400';
            case 'SIGNIFICANT_LOSS':
                return 'bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400';
            case 'WATCHLIST_ENTRY':
                return 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400';
            case 'WATCHLIST_BREAKOUT':
                return 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400';
            case 'SIGNAL_BUY':
                return 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400';
            case 'SIGNAL_STRONG_BUY':
                return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
            case 'SIGNAL_SELL':
                return 'bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400';
            case 'SIGNAL_STRONG_SELL':
                return 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300';
            case 'WHALE_BUY':
                return 'bg-cyan-50 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300';
            case 'WHALE_SELL':
                return 'bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300';
            case 'TREND_BUY_5D':
                return 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400';
            case 'VOLUME_SPIKE':
                return 'bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400';
            case 'GOLDEN_CROSS':
                return 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400';
            case 'RSI_OVERSOLD':
                return 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400';
            case 'SUCCESS':
                return 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400';
            case 'WARNING':
            case 'PRICE_ALERT':
            case 'PORTFOLIO_DIVERSITY':
                return 'bg-yellow-50 text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400';
            default:
                return 'bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
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
                        <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white dark:border-slate-900" />
                    )}
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80 p-0 border-none shadow-2xl overflow-hidden rounded-xl">
                <div className="bg-slate-900 dark:bg-slate-800 px-4 py-3 flex justify-between items-center">
                    <DropdownMenuLabel className="p-0 text-white font-black text-xs uppercase tracking-widest flex items-center gap-2">
                        <Bell size={14} className="text-blue-400" /> Alerts
                    </DropdownMenuLabel>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={(e) => { e.stopPropagation(); triggerCheck(); }}
                            className="p-1 hover:bg-slate-800 rounded-md text-slate-400 hover:text-white transition-colors"
                            title="Refresh Alerts"
                        >
                            <RefreshCw size={12} />
                        </button>
                        {unreadCount > 0 && (
                            <span className="text-[10px] bg-blue-500 text-white px-1.5 py-0.5 rounded font-black">
                                {unreadCount} NEW
                            </span>
                        )}
                    </div>
                </div>

                <div className="max-h-[350px] overflow-y-auto">
                    {alerts.length === 0 ? (
                        <div className="p-8 text-center space-y-2">
                            <div className="bg-slate-50 dark:bg-slate-800 w-10 h-10 rounded-full flex items-center justify-center mx-auto text-slate-300 dark:text-slate-600">
                                <Bell size={20} />
                            </div>
                            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">No alerts</p>
                        </div>
                    ) : (
                        alerts.map((alert) => (
                            <div
                                key={alert.id}
                                onClick={() => handleNotificationClick(alert)}
                                className={`p-4 border-b border-gray-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer relative ${!alert.read ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''}`}
                            >
                                {!alert.read && <div className="absolute top-4 left-1 w-1 h-8 bg-blue-500 rounded-full" />}
                                <div className="flex gap-3">
                                    <div className={`mt-0.5 p-1.5 rounded-lg h-fit ${getNotificationColor(alert.type)}`}>
                                        {getNotificationIcon(alert.type)}
                                    </div>
                                    <div className="space-y-1 flex-1">
                                        <div className="flex justify-between items-start">
                                            <h4 className="text-xs font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight">{alert.title}</h4>
                                            <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase">
                                                {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                                            {alert.message}
                                        </p>
                                        {alert.ticker && (
                                            <div className="pt-1">
                                                <span className="text-[9px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest">
                                                    {alert.ticker}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div className="p-2 bg-gray-50 dark:bg-slate-800 border-t border-gray-100 dark:border-slate-700 flex gap-1">
                    {unreadCount > 0 && (
                        <button
                            onClick={(e) => { e.stopPropagation(); markAllAsRead(); }}
                            className="flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 transition-all"
                        >
                            Mark all read
                        </button>
                    )}
                    <button
                        onClick={(e) => { e.stopPropagation(); router.push('/notifications'); }}
                        className="flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest text-blue-500 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all flex items-center justify-center gap-1"
                    >
                        <ExternalLink size={10} /> View all
                    </button>
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
