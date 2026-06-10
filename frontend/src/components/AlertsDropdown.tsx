'use client';

import React from 'react';
import { Bell, Info, TrendingUp, TrendingDown, AlertCircle, Target, Eye, Fish, ExternalLink, RefreshCw, Filter, LayoutGrid, ChevronRight, Zap, ShieldAlert, CalendarClock } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import api from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

interface Alert {
    id: number;
    title: string;
    message: string;
    type: string;
    ticker: string | null;
    read: boolean;
    created_at: string;
    redirect_url?: string;
    metadata?: any;
}

const CATEGORIES = {
    portfolio: [
        'STOP_LOSS_HIT', 'TARGET_REACHED', 'SIGNIFICANT_GAIN', 'SIGNIFICANT_LOSS', 
        'BELOW_WACC', 'PORTFOLIO_DIVERSITY', 'TAKE_PROFIT'
    ],
    signals: [
        'SIGNAL_BUY', 'SIGNAL_SELL', 'SIGNAL_STRONG_BUY', 'SIGNAL_STRONG_SELL', 'DAILY_PLAN_READY'
    ],
    market: [
        'WHALE_BUY', 'WHALE_SELL', 'TREND_BUY_5D', 'VOLUME_SPIKE', 'RSI_OVERSOLD', 
        'RSI_OVERBOUGHT', 'GOLDEN_CROSS', 'DEATH_CROSS', 'WHALE_ENTRY', 
        'SECTOR_PUMP', 'MARKET_BREADTH_SHIFT'
    ]
};

function getToastVariant(type: string): 'success' | 'error' | 'warning' | 'info' {
    if (['TARGET_REACHED', 'SIGNIFICANT_GAIN', 'SIGNAL_BUY', 'SIGNAL_STRONG_BUY', 'WHALE_BUY', 'TREND_BUY_5D', 'GOLDEN_CROSS', 'WHALE_ENTRY', 'VOLUME_SPIKE'].includes(type)) return 'success';
    if (['STOP_LOSS_HIT', 'SIGNIFICANT_LOSS', 'SIGNAL_SELL', 'SIGNAL_STRONG_SELL', 'WHALE_SELL', 'DEATH_CROSS'].includes(type)) return 'error';
    if (['WARNING', 'BELOW_WACC', 'PORTFOLIO_DIVERSITY', 'DAILY_PLAN_READY'].includes(type)) return 'warning';
    return 'info';
}

export function AlertsDropdown() {
    const [alerts, setAlerts] = React.useState<Alert[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [activeTab, setActiveTab] = React.useState('portfolio');
    const [selectedAlert, setSelectedAlert] = React.useState<Alert | null>(null);
    const seenIds = React.useRef<Set<number>>(new Set());
    const isFirstFetch = React.useRef(true);
    const router = useRouter();

    const fetchNotifications = async () => {
        try {
            const response = await api.get('/api/stocks/notifications/');
            const incoming: Alert[] = response.data;
            setAlerts(incoming);
            setLoading(false);

            if (isFirstFetch.current) {
                incoming.forEach(a => seenIds.current.add(a.id));
                isFirstFetch.current = false;
                return;
            }

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
            const response = await api.post('/api/stocks/notifications/trigger_check/');
            if (response.data.status === 'skipped') {
                // Throttle active, no toast needed for quiet skips
                return;
            }
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
        if (!alert.read) markAsRead(alert.id);
        setSelectedAlert(alert);
    };

    const handleRedirect = (alert: Alert) => {
        setSelectedAlert(null);
        if (alert.redirect_url) {
            router.push(alert.redirect_url);
        } else if (alert.ticker && alert.ticker !== 'SUMMARY') {
            router.push(`/ticker/${alert.ticker}`);
        }
    };

    const getNotificationIcon = (type: string) => {
        if (type.includes('SELL') || type.includes('LOSS') || type.includes('BEARISH')) return <TrendingDown size={14} className="stroke-[2.5]" />;
        if (type.includes('BUY') || type.includes('GAIN') || type.includes('BULLISH') || type === 'TARGET_REACHED') return <TrendingUp size={14} className="stroke-[2.5]" />;
        if (type.includes('WHALE')) return <Fish size={14} className="stroke-[2.5]" />;
        if (type === 'VOLUME_SPIKE') return <Zap size={14} className="stroke-[2.5]" />;
        if (type === 'PORTFOLIO_DIVERSITY') return <Filter size={14} className="stroke-[2.5]" />;
        if (type === 'STOP_LOSS_HIT') return <ShieldAlert size={14} className="stroke-[2.5]" />;
        if (type === 'TARGET_REACHED') return <Target size={14} className="stroke-[2.5]" />;
        if (type === 'DAILY_PLAN_READY') return <CalendarClock size={14} className="stroke-[2.5]" />;
        return <Info size={14} className="stroke-[2.5]" />;
    };

    const getNotificationColor = (type: string) => {
        const variant = getToastVariant(type);
        if (variant === 'success') return 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-500/20';
        if (variant === 'error') return 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400 border border-rose-200/50 dark:border-rose-500/20';
        if (variant === 'warning') return 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400 border border-amber-200/50 dark:border-amber-500/20';
        return 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400 border border-blue-200/50 dark:border-blue-500/20';
    };

    React.useEffect(() => {
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 60000);
        return () => clearInterval(interval);
    }, []);

    const unreadCount = alerts.filter(a => !a.read).length;
    const filteredAlerts = (cat: string) => alerts.filter(a => CATEGORIES[cat as keyof typeof CATEGORIES].includes(a.type));
    const unreadByCategory = (cat: string) => filteredAlerts(cat).filter(a => !a.read).length;

    const renderAlertList = (cat: string) => {
        const list = filteredAlerts(cat);
        if (list.length === 0) {
            return (
                <div className="p-8 text-center text-slate-400">
                    <p className="text-[10px] font-medium tracking-tight">No {cat} alerts</p>
                </div>
            );
        }
        return list.map((alert) => (
            <div
                key={alert.id}
                onClick={() => handleNotificationClick(alert)}
                className={`p-4 border-b border-slate-50 dark:border-slate-800/50 hover:bg-white dark:hover:bg-white/[0.02] transition-all cursor-pointer relative group ${!alert.read ? 'bg-blue-500/[0.03] dark:bg-blue-500/[0.05]' : ''}`}
            >
                {!alert.read && <div className="absolute top-0 right-0 w-2 h-2 bg-blue-500 rounded-full mt-4 mr-4 shadow-lg shadow-blue-500/50 ring-4 ring-white dark:ring-slate-900" />}
                <div className="flex gap-4">
                    <div className={`mt-0.5 p-2 rounded-xl h-fit shadow-sm transition-transform group-hover:scale-110 ${getNotificationColor(alert.type)}`}>
                        {getNotificationIcon(alert.type)}
                    </div>
                    <div className="space-y-1.5 flex-1">
                        <div className="flex justify-between items-start">
                            <h4 className="text-[11px] font-semibold text-slate-800 dark:text-slate-100 tracking-tight leading-none pt-1">
                                {alert.ticker === 'SUMMARY' && <span className="mr-1.5 text-blue-500 font-semibold">●</span>}
                                {alert.title}
                            </h4>
                            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded ml-2">
                                {formatDistanceToNow(new Date(alert.created_at), { addSuffix: false })}
                            </span>
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold leading-relaxed line-clamp-2">
                            {alert.message}
                        </p>
                        <div className="flex items-center gap-2">
                            {alert.ticker && alert.ticker !== 'SUMMARY' && (
                                <span className="text-[9px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 px-1.5 rounded">
                                    {alert.ticker}
                                </span>
                            )}
                            {alert.ticker === 'SUMMARY' && alert.metadata?.count && (
                                <span className="text-[9px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-1.5 rounded">
                                    {alert.metadata.count} ASSETS
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        ));
    };

    return (
        <DropdownMenu onOpenChange={(open) => open && triggerCheck()}>
            <DropdownMenuTrigger asChild>
                <button className="p-2 rounded-full hover:bg-amber-50 dark:hover:bg-amber-900/20 text-blue-500 transition-colors relative outline-none">
                    <Bell size={20} />
                    {unreadCount > 0 && (
                        <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-red-500 rounded-full border-2 border-white dark:border-slate-900 text-[8px] font-semibold text-white flex items-center justify-center">
                            {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                    )}
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80 p-0 border-none shadow-sm overflow-hidden rounded-xl bg-white dark:bg-card">
                <div className="bg-slate-900 px-4 py-3 flex justify-between items-center text-white">
                    <DropdownMenuLabel className="p-0 font-bold text-xs flex items-center gap-2">
                        <Bell size={14} className="text-blue-400" /> Notifications
                    </DropdownMenuLabel>
                    <div className="flex items-center gap-3">
                        <button onClick={(e) => { e.stopPropagation(); triggerCheck(); }} className="text-slate-400 hover:text-white transition-colors"><RefreshCw size={12} /></button>
                        {unreadCount > 0 && <span className="text-[10px] bg-blue-500 px-1.5 py-0.5 rounded font-bold">{unreadCount > 99 ? '99+' : unreadCount}</span>}
                    </div>
                </div>

                <Tabs defaultValue="portfolio" className="w-full">
                    <TabsList className="w-full grid grid-cols-3 rounded-none bg-slate-50 dark:bg-slate-800/50 p-1 h-10">
                        <TabsTrigger value="portfolio" className="text-[10px] font-bold relative h-8">
                            Port. {unreadByCategory('portfolio') > 0 && <span className="ml-1 w-1 h-1 bg-red-500 rounded-full" />}
                        </TabsTrigger>
                        <TabsTrigger value="signals" className="text-[10px] font-bold relative h-8">
                            Signals {unreadByCategory('signals') > 0 && <span className="ml-1 w-1 h-1 bg-red-500 rounded-full" />}
                        </TabsTrigger>
                        <TabsTrigger value="market" className="text-[10px] font-bold relative h-8">
                            Market {unreadByCategory('market') > 0 && <span className="ml-1 w-1 h-1 bg-red-500 rounded-full" />}
                        </TabsTrigger>
                    </TabsList>
                    
                    <div className="max-h-[350px] overflow-y-auto">
                        <TabsContent value="portfolio" className="m-0 focus-visible:ring-0">{renderAlertList('portfolio')}</TabsContent>
                        <TabsContent value="signals" className="m-0 focus-visible:ring-0">{renderAlertList('signals')}</TabsContent>
                        <TabsContent value="market" className="m-0 focus-visible:ring-0">{renderAlertList('market')}</TabsContent>
                    </div>
                </Tabs>

                <div className="p-2 bg-slate-50 dark:bg-slate-800 border-t flex gap-1">
                    <button onClick={(e) => { e.stopPropagation(); markAllAsRead(); }} className="flex-1 py-2 text-[10px] font-bold text-slate-400 hover:text-slate-600 transition-colors uppercase tracking-wider">Mark All Read</button>
                    <button onClick={(e) => { e.stopPropagation(); router.push('/notifications'); }} className="flex-1 py-2 text-[10px] font-bold text-blue-500 flex items-center justify-center gap-1 uppercase tracking-wider bg-blue-50 dark:bg-blue-900/20 rounded-md">View History</button>
                </div>
            </DropdownMenuContent>

            <Dialog open={!!selectedAlert} onOpenChange={() => setSelectedAlert(null)}>
                <DialogContent className="sm:max-w-xl border-none bg-slate-50 dark:bg-slate-950 shadow-sm rounded-[2rem] p-0 overflow-hidden ring-1 ring-slate-200 dark:ring-slate-800">
                    {selectedAlert && (
                        <>
                            <div className={`p-8 ${getNotificationColor(selectedAlert.type)} bg-opacity-5 dark:bg-opacity-10 border-b border-border dark:border-slate-800/50 relative overflow-hidden`}>
                                <div className="absolute top-0 right-0 w-32 h-32 bg-current opacity-[0.03] rounded-full translate-x-16 -translate-y-16 blur-3xl" />
                                <div className="flex items-center gap-5 relative z-10">
                                    <div className={`p-4 rounded-2xl ${getNotificationColor(selectedAlert.type)} shadow-lg shadow-current/10`}>
                                        {getNotificationIcon(selectedAlert.type)}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] opacity-50">{selectedAlert.type.replace(/_/g, ' ')}</span>
                                            <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
                                            <span className="text-[10px] font-bold opacity-50">
                                                {formatDistanceToNow(new Date(selectedAlert.created_at), { addSuffix: true })}
                                            </span>
                                        </div>
                                        <h3 className="text-xl font-semibold text-slate-900 dark:text-white leading-tight tracking-tight">
                                            {selectedAlert.title}
                                        </h3>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="p-8 space-y-6">
                                <DialogDescription className="text-slate-600 dark:text-slate-400 text-sm font-semibold leading-relaxed">
                                    {selectedAlert.message}
                                </DialogDescription>
                                
                                {selectedAlert.ticker && selectedAlert.ticker !== 'SUMMARY' && (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-white dark:bg-card p-4 rounded-2xl border border-border dark:border-slate-800/50 shadow-sm group hover:scale-[1.02] transition-all">
                                            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">Target Asset</span>
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-xs ring-1 ring-blue-200 dark:ring-blue-800/50">
                                                    {selectedAlert.ticker.charAt(0)}
                                                </div>
                                                <span className="text-lg font-semibold text-slate-900 dark:text-white">{selectedAlert.ticker}</span>
                                            </div>
                                        </div>
                                        
                                        {selectedAlert.metadata?.price && (
                                            <div className="bg-white dark:bg-card p-4 rounded-2xl border border-border dark:border-slate-800/50 shadow-sm group hover:scale-[1.02] transition-all">
                                                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">Activation Price</span>
                                                <div className="flex items-baseline gap-1">
                                                    <span className="text-[10px] font-bold text-slate-400">Rs.</span>
                                                    <span className="text-lg font-semibold text-slate-900 dark:text-white tabular-nums">
                                                        {selectedAlert.metadata.price.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                                                    </span>
                                                </div>
                                            </div>
                                        )}

                                        {selectedAlert.metadata?.change_pct !== undefined && (
                                            <div className="col-span-2 bg-slate-900 dark:bg-white p-4 rounded-2xl flex items-center justify-between shadow-xl">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${selectedAlert.metadata.change_pct >= 0 ? 'bg-emerald-500/20 text-emerald-500' : 'bg-red-500/20 text-red-500'}`}>
                                                        {selectedAlert.metadata.change_pct >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                                                    </div>
                                                    <div>
                                                        <span className={`text-[10px] font-semibold uppercase tracking-wider ${selectedAlert.metadata.change_pct >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                                            {selectedAlert.metadata.change_pct >= 0 ? 'Profitable Movement' : 'Risk Alert'}
                                                        </span>
                                                        <div className="text-white dark:text-slate-900 font-bold text-sm">Performance Index</div>
                                                    </div>
                                                </div>
                                                <span className={`text-xl font-semibold tabular-nums ${selectedAlert.metadata.change_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                    {selectedAlert.metadata.change_pct > 0 ? '+' : ''}{selectedAlert.metadata.change_pct.toFixed(2)}%
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {selectedAlert.ticker === 'SUMMARY' && (
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between px-1">
                                            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-2">
                                                <Zap size={14} className="text-amber-500" /> Focus Allocation
                                            </h4>
                                            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-3 py-1 rounded-full border border-blue-100 dark:border-blue-800">
                                                {selectedAlert.metadata?.count || 0} Assets Identified
                                            </span>
                                        </div>
                                        
                                        {(() => {
                                            const metadata = selectedAlert.metadata || {};
                                            const tableItems = metadata.items || [];

                                            if (tableItems.length === 0) return null;

                                            return (
                                                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm bg-white dark:bg-card">
                                                    <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                                                        <table className="w-full text-left border-collapse">
                                                            <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-card border-b border-slate-200 dark:border-slate-800">
                                                                <tr>
                                                                    <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Asset</th>
                                                                    <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Risk/Gain</th>
                                                                    <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500 text-right">Value</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                                                                {tableItems.map((item: any, idx: number) => (
                                                                    <tr 
                                                                        key={`${item.symbol}-${idx}`}
                                                                        onClick={() => {
                                                                            setSelectedAlert(null);
                                                                            router.push(`/ticker/${item.symbol}`);
                                                                        }}
                                                                        className="group hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer transition-colors"
                                                                    >
                                                                        <td className="px-5 py-4">
                                                                            <div className="flex items-center gap-3">
                                                                                <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-600 dark:text-slate-400 group-hover:bg-blue-500/10 group-hover:text-blue-500 transition-colors">
                                                                                    {item.symbol.charAt(0)}
                                                                                </div>
                                                                                <div>
                                                                                    <div className="text-xs font-semibold text-slate-900 dark:text-white uppercase group-hover:text-blue-500 transition-colors">
                                                                                        {item.symbol}
                                                                                    </div>
                                                                                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
                                                                                        {item.detail}
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        </td>
                                                                        <td className="px-5 py-4">
                                                                            {item.change_pct !== undefined ? (
                                                                                <div className={`text-[10px] font-semibold flex items-center gap-1 ${item.change_pct >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                                                                    {item.change_pct >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                                                                                    {item.change_pct > 0 ? '+' : ''}{item.change_pct.toFixed(1)}%
                                                                                </div>
                                                                            ) : (
                                                                                <span className="text-[10px] font-bold text-slate-300">N/A</span>
                                                                            )}
                                                                        </td>
                                                                        <td className="px-5 py-4 text-right">
                                                                            {item.price ? (
                                                                                <div className="flex flex-col items-end">
                                                                                    <span className="text-[11px] font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                                                                                        {item.price.toLocaleString()}
                                                                                    </span>
                                                                                    {item.wacc && (
                                                                                        <span className="text-[8px] font-bold text-slate-400 tracking-tighter">Avg: {item.wacc}</span>
                                                                                    )}
                                                                                </div>
                                                                            ) : (
                                                                                <span className="text-[10px] text-slate-300 dark:text-slate-700">-</span>
                                                                            )}
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                )}
                            </div>

                            <DialogFooter className="p-6 bg-slate-900/5 dark:bg-muted flex gap-3">
                                <button
                                    onClick={() => setSelectedAlert(null)}
                                    className="flex-1 py-3.5 px-6 rounded-2xl text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 dark:hover:bg-slate-800/50 transition-all"
                                >
                                    Dismiss Alert
                                </button>
                                <button
                                    onClick={() => handleRedirect(selectedAlert)}
                                    className="flex-[2] py-3.5 px-6 rounded-2xl text-[10px] font-semibold uppercase tracking-[0.2em] text-white bg-blue-600 hover:bg-blue-700 shadow-xl shadow-blue-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3 ring-1 ring-blue-400/20"
                                >
                                    Execute Intelligence <ChevronRight size={14} />
                                </button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </DropdownMenu>
    );
}
