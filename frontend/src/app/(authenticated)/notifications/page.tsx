'use client';

import React, { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import api from '@/lib/api';
import { formatDistanceToNow, format } from 'date-fns';
import { useRouter } from 'next/navigation';
import {
    Bell, TrendingUp, TrendingDown, AlertCircle, Target, Eye, Fish,
    CheckCircle, Info, RefreshCw, Trash2, CheckCheck, Filter, Loader2,
    LayoutGrid, ExternalLink
} from 'lucide-react';

type NotificationType =
    | 'STOP_LOSS_HIT' | 'TARGET_REACHED' | 'SIGNIFICANT_GAIN' | 'SIGNIFICANT_LOSS' | 'BELOW_WACC'
    | 'WATCHLIST_BREAKOUT' | 'WATCHLIST_ENTRY'
    | 'SIGNAL_BUY' | 'SIGNAL_SELL' | 'SIGNAL_STRONG_BUY' | 'SIGNAL_STRONG_SELL'
    | 'WHALE_BUY' | 'WHALE_SELL'
    | 'INFO' | 'SUCCESS' | 'WARNING' | 'PRICE_ALERT' | 'TREND_BUY_5D'
    | 'VOLUME_SPIKE' | 'RSI_OVERSOLD' | 'RSI_OVERBOUGHT' 
    | 'MACD_BULLISH' | 'MACD_BEARISH' | 'GOLDEN_CROSS' | 'DEATH_CROSS'
    | 'CONSISTENT_BUYING' | 'CONSISTENT_SELLING' | 'WHALE_ENTRY'
    | 'SECTOR_PUMP' | 'MARKET_BREADTH_SHIFT' | 'PORTFOLIO_DIVERSITY' | 'TAKE_PROFIT';

interface Notification {
    id: number;
    title: string;
    message: string;
    type: NotificationType;
    ticker: string | null;
    read: boolean;
    created_at: string;
    redirect_url?: string;
    metadata?: any;
}

type Severity = 'all' | 'high' | 'medium' | 'low';

const SEVERITIES: { key: Severity; label: string; icon: React.ReactNode }[] = [
    { key: 'all', label: 'All Alerts', icon: <Bell size={14} /> },
    { key: 'high', label: 'High Priority', icon: <AlertCircle size={14} /> },
    { key: 'medium', label: 'Medium Priority', icon: <Target size={14} /> },
    { key: 'low', label: 'Low Priority', icon: <Info size={14} /> },
];

type Category = 'all' | 'portfolio' | 'watchlist' | 'technical' | 'broker' | 'market' | 'system';

const CATEGORIES: { key: Category; label: string; icon: any; color: string }[] = [
    { key: 'all', label: 'All Areas', icon: Bell, color: 'text-slate-500' },
    { key: 'portfolio', label: 'Portfolio', icon: Target, color: 'text-emerald-500' },
    { key: 'watchlist', label: 'Watchlist', icon: Eye, color: 'text-blue-500' },
    { key: 'technical', label: 'Technical', icon: TrendingUp, color: 'text-purple-500' },
    { key: 'broker', label: 'Broker Analysis', icon: Fish, color: 'text-cyan-500' },
    { key: 'market', label: 'Market Trends', icon: RefreshCw, color: 'text-orange-500' },
    { key: 'system', label: 'System', icon: Info, color: 'text-slate-400' },
];

function getCategory(type: NotificationType): Category {
    switch (type) {
        case 'STOP_LOSS_HIT':
        case 'TARGET_REACHED':
        case 'SIGNIFICANT_GAIN':
        case 'SIGNIFICANT_LOSS':
        case 'BELOW_WACC':
        case 'PORTFOLIO_DIVERSITY':
        case 'TAKE_PROFIT':
            return 'portfolio';
        case 'WATCHLIST_BREAKOUT':
        case 'WATCHLIST_ENTRY':
            return 'watchlist';
        case 'VOLUME_SPIKE':
        case 'RSI_OVERSOLD':
        case 'RSI_OVERBOUGHT':
        case 'MACD_BULLISH':
        case 'MACD_BEARISH':
        case 'GOLDEN_CROSS':
        case 'DEATH_CROSS':
            return 'technical';
        case 'WHALE_BUY':
        case 'WHALE_SELL':
        case 'WHALE_ENTRY':
        case 'TREND_BUY_5D':
        case 'CONSISTENT_BUYING':
        case 'CONSISTENT_SELLING':
            return 'broker';
        case 'SECTOR_PUMP':
        case 'MARKET_BREADTH_SHIFT':
            return 'market';
        default:
            return 'system';
    }
}

function getSeverity(type: NotificationType): Severity {
    switch (type) {
        case 'STOP_LOSS_HIT':
        case 'SIGNIFICANT_LOSS':
        case 'BELOW_WACC':
        case 'WHALE_SELL':
        case 'SIGNAL_STRONG_SELL':
        case 'VOLUME_SPIKE':
        case 'RSI_OVERSOLD':
        case 'GOLDEN_CROSS':
        case 'DEATH_CROSS':
        case 'WHALE_ENTRY':
        case 'MARKET_BREADTH_SHIFT':
            return 'high';
        case 'TARGET_REACHED':
        case 'SIGNIFICANT_GAIN':
        case 'SIGNAL_STRONG_BUY':
        case 'WHALE_BUY':
        case 'WATCHLIST_BREAKOUT':
        case 'RSI_OVERBOUGHT':
        case 'MACD_BULLISH':
        case 'MACD_BEARISH':
        case 'CONSISTENT_BUYING':
        case 'CONSISTENT_SELLING':
        case 'SECTOR_PUMP':
        case 'PORTFOLIO_DIVERSITY':
        case 'TAKE_PROFIT':
            return 'medium';
        default:
            return 'low';
    }
}

function getIcon(type: NotificationType) {
    switch (type) {
        case 'STOP_LOSS_HIT': return <AlertCircle size={15} />;
        case 'TARGET_REACHED': return <Target size={15} />;
        case 'SIGNIFICANT_GAIN': return <TrendingUp size={15} />;
        case 'SIGNIFICANT_LOSS': return <TrendingDown size={15} />;
        case 'BELOW_WACC': return <TrendingDown size={15} />;
        case 'WATCHLIST_ENTRY': return <Eye size={15} />;
        case 'WATCHLIST_BREAKOUT': return <TrendingUp size={15} />;
        case 'SIGNAL_BUY': case 'SIGNAL_STRONG_BUY': return <TrendingUp size={15} />;
        case 'SIGNAL_SELL': case 'SIGNAL_STRONG_SELL': return <TrendingDown size={15} />;
        case 'WHALE_BUY': case 'WHALE_SELL': return <Fish size={15} />;
        case 'SUCCESS': return <CheckCircle size={15} />;
        case 'TREND_BUY_5D': return <TrendingUp size={15} />;
        case 'VOLUME_SPIKE': return <RefreshCw size={15} />;
        case 'RSI_OVERSOLD': return <Target size={15} />;
        case 'RSI_OVERBOUGHT': return <AlertCircle size={15} />;
        case 'GOLDEN_CROSS': return <TrendingUp size={15} />;
        case 'WHALE_ENTRY': return <Fish size={15} />;
        case 'SECTOR_PUMP': return <TrendingUp size={15} />;
        case 'PORTFOLIO_DIVERSITY': return <Filter size={15} />;
        default: return <Info size={15} />;
    }
}

function getIconClass(type: NotificationType): string {
    switch (type) {
        case 'STOP_LOSS_HIT':
        case 'SIGNIFICANT_LOSS':
        case 'SIGNAL_STRONG_SELL': return 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400';
        case 'TARGET_REACHED':
        case 'SIGNIFICANT_GAIN':
        case 'SIGNAL_STRONG_BUY': return 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400';
        case 'SIGNAL_BUY': return 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400';
        case 'SIGNAL_SELL': return 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400';
        case 'BELOW_WACC': return 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400';
        case 'WATCHLIST_ENTRY': return 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400';
        case 'WATCHLIST_BREAKOUT': return 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400';
        case 'WHALE_BUY': return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300';
        case 'WHALE_SELL': return 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300';
        case 'TREND_BUY_5D': return 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400';
        case 'VOLUME_SPIKE': return 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400';
        case 'GOLDEN_CROSS': return 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400';
        default: return 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';
    }
}

function getBorderClass(type: NotificationType): string {
    switch (type) {
        case 'STOP_LOSS_HIT': case 'SIGNIFICANT_LOSS': case 'SIGNAL_STRONG_SELL':
            return 'border-l-red-400 dark:border-l-red-600';
        case 'TARGET_REACHED': case 'SIGNIFICANT_GAIN': case 'SIGNAL_STRONG_BUY':
            return 'border-l-emerald-400 dark:border-l-emerald-600';
        case 'SIGNAL_BUY':
            return 'border-l-green-400 dark:border-l-green-600';
        case 'SIGNAL_SELL':
            return 'border-l-orange-400 dark:border-l-orange-600';
        case 'BELOW_WACC':
            return 'border-l-amber-400 dark:border-l-amber-600';
        case 'WATCHLIST_ENTRY':
            return 'border-l-blue-400 dark:border-l-blue-600';
        case 'WATCHLIST_BREAKOUT':
            return 'border-l-purple-400 dark:border-l-purple-600';
        case 'WHALE_BUY':
            return 'border-l-cyan-400 dark:border-l-cyan-500';
        case 'WHALE_SELL':
            return 'border-l-violet-400 dark:border-l-violet-500';
        case 'TREND_BUY_5D':
            return 'border-l-blue-400 dark:border-l-blue-600';
        default:
            return 'border-l-slate-300 dark:border-l-slate-600';
    }
}

export default function AlertsPage() {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [severity, setSeverity] = useState<Severity>('all');
    const [category, setCategory] = useState<Category>('all');
    const [unreadOnly, setUnreadOnly] = useState(false);
    const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
    const router = useRouter();

    const [selectedAlert, setSelectedAlert] = useState<Notification | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);

    const fetchNotifications = useCallback(async () => {
        setLoading(true);
        try {
            const params: Record<string, string> = {};
            if (unreadOnly) params.unread = 'true';
            
            const res = await api.get('/api/stocks/notifications/', { params });
            setNotifications(res.data);
        } catch (err) {
            console.error('Failed to fetch notifications', err);
        } finally {
            setLoading(false);
        }
    }, [unreadOnly]);

    useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

    const markAsRead = async (id: number) => {
        await api.post(`/api/stocks/notifications/${id}/mark_as_read/`);
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    };

    const markAllAsRead = async () => {
        setActionLoading(true);
        await api.post('/api/stocks/notifications/mark_all_as_read/');
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        setActionLoading(false);
    };

    const deleteRead = async () => {
        setActionLoading(true);
        await api.delete('/api/stocks/notifications/delete_read/');
        setNotifications(prev => prev.filter(n => !n.read));
        setActionLoading(false);
    };

    const triggerCheck = async () => {
        setActionLoading(true);
        await api.post('/api/stocks/notifications/trigger_check/');
        await fetchNotifications();
        setLastRefreshed(new Date());
        setActionLoading(false);
    };

    const handleClick = (n: Notification) => {
        if (!n.read) markAsRead(n.id);
        setSelectedAlert(n);
        setIsDetailOpen(true);
    };

    // Filter by severity and category
    const filteredNotifications = notifications.filter(n => {
        const matchesSeverity = severity === 'all' || getSeverity(n.type) === severity;
        const matchesCategory = category === 'all' || getCategory(n.type) === category;
        return matchesSeverity && matchesCategory;
    });

    const unreadCount = filteredNotifications.filter(n => !n.read).length;

    // Group by date label
    const grouped: Record<string, Notification[]> = {};
    for (const n of filteredNotifications) {
        const d = new Date(n.created_at);
        const now = new Date();
        let label: string;
        if (d.toDateString() === now.toDateString()) label = 'Today';
        else {
            const yesterday = new Date(now);
            yesterday.setDate(now.getDate() - 1);
            label = d.toDateString() === yesterday.toDateString()
                ? 'Yesterday'
                : format(d, 'dd MMM yyyy');
        }
        (grouped[label] ||= []).push(n);
    }

    return (
        <DashboardLayout title="Alerts" subtitle="Advanced system monitoring and position tracking">
            <div className="max-w-6xl mx-auto space-y-5">

                {/* Notification Detail Modal */}
                {selectedAlert && (
                    <div 
                        className={`fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 transition-opacity duration-300 ${isDetailOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                        onClick={() => setIsDetailOpen(false)}
                    >
                        <div 
                            className={`bg-white dark:bg-card w-full max-w-2xl rounded-xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-800 transform transition-transform duration-300 ${isDetailOpen ? 'scale-100' : 'scale-95'}`}
                            onClick={e => e.stopPropagation()}
                        >
                            <div className={`h-2 w-full ${getIconClass(selectedAlert.type)} opacity-50`} />
                            
                            <div className="p-8 space-y-6">
                                <div className="flex items-start justify-between">
                                    <div className={`p-4 rounded-2xl ${getIconClass(selectedAlert.type)}`}>
                                        {getIcon(selectedAlert.type)}
                                    </div>
                                    <button 
                                        onClick={() => setIsDetailOpen(false)}
                                        className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 transition-colors"
                                    >
                                        <Trash2 size={20} className="rotate-45" />
                                    </button>
                                </div>

                                <div className="space-y-2">
                                    <h3 className="text-2xl font-semibold text-slate-900 dark:text-white tracking-tight leading-tight">
                                        {selectedAlert.title}
                                    </h3>
                                    <p className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                                        {format(new Date(selectedAlert.created_at), 'eeee, MMM dd • HH:mm')}
                                    </p>
                                </div>

                                <div className="bg-slate-50 dark:bg-slate-800/40 p-5 rounded-2xl border border-border dark:border-slate-800/60">
                                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                                        {selectedAlert.message}
                                    </p>
                                </div>

                                {selectedAlert.ticker === 'SUMMARY' && (
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-2">
                                                <LayoutGrid size={12} /> Detailed Breakdown
                                            </h4>
                                            <span className="text-[10px] font-bold text-blue-500 bg-blue-50 dark:bg-blue-900/20 px-2.5 py-1 rounded-full border border-blue-100/50 dark:border-blue-800/30">
                                                {selectedAlert.metadata?.count || selectedAlert.metadata?.items?.length || selectedAlert.metadata?.symbols?.length || 0} Assets Impacted
                                            </span>
                                        </div>
                                        
                                        {(() => {
                                            const metadata = selectedAlert.metadata || {};
                                            const tableItems = metadata.items || (metadata.symbols || []).map((s: string) => ({
                                                symbol: s,
                                                detail: "Consolidated Alert",
                                                price: null
                                            }));

                                            if (tableItems.length === 0) return null;

                                            return (
                                                <div className="relative border border-border dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm bg-white dark:bg-card">
                                                    <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                                                        <table className="w-full text-left border-collapse">
                                                            <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800/80 border-b border-border dark:border-slate-800">
                                                                <tr>
                                                                    <th className="px-5 py-3 text-[9px] font-semibold uppercase tracking-wider text-slate-500">Symbol</th>
                                                                    <th className="px-5 py-3 text-[9px] font-semibold uppercase tracking-wider text-slate-500">Event Detail</th>
                                                                    <th className="px-5 py-3 text-[9px] font-semibold uppercase tracking-wider text-slate-500 text-right">Price</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                                                                {tableItems.map((item: any, idx: number) => (
                                                                    <tr 
                                                                        key={`${item.symbol}-${idx}`}
                                                                        onClick={() => {
                                                                            setIsDetailOpen(false);
                                                                            router.push(`/ticker/${item.symbol}`);
                                                                        }}
                                                                        className="group hover:bg-blue-50/50 dark:hover:bg-blue-900/10 cursor-pointer transition-colors"
                                                                    >
                                                                        <td className="px-5 py-4">
                                                                            <div className="flex items-center gap-2">
                                                                                <span className="text-xs font-semibold text-slate-900 dark:text-white uppercase group-hover:text-blue-600 transition-colors">
                                                                                    {item.symbol}
                                                                                </span>
                                                                                <ExternalLink size={10} className="opacity-0 group-hover:opacity-100 text-blue-400 transition-all" />
                                                                            </div>
                                                                        </td>
                                                                        <td className="px-5 py-4">
                                                                            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                                                                                {item.detail}
                                                                            </span>
                                                                        </td>
                                                                        <td className="px-5 py-4 text-right">
                                                                            {item.price ? (
                                                                                <span className="text-xs font-semibold text-slate-900 dark:text-white tabular-nums">
                                                                                    Rs. {item.price.toLocaleString()}
                                                                                </span>
                                                                            ) : (
                                                                                <span className="text-xs text-slate-300 dark:text-slate-700">-</span>
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

                                <div className="pt-4 flex gap-3">
                                    <button 
                                        onClick={() => setIsDetailOpen(false)}
                                        className="flex-1 px-6 py-4 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold text-xs uppercase tracking-wider hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                                    >
                                        Dismiss
                                    </button>
                                    {(selectedAlert.redirect_url || (selectedAlert.ticker && selectedAlert.ticker !== 'SUMMARY')) && (
                                        <button 
                                            onClick={() => {
                                                setIsDetailOpen(false);
                                                router.push(selectedAlert.redirect_url || `/ticker/${selectedAlert.ticker}`);
                                            }}
                                            className="flex-1 px-6 py-4 rounded-2xl bg-blue-600 text-white font-semibold text-xs uppercase tracking-wider hover:bg-blue-700 shadow-xl shadow-blue-500/20 transition-all"
                                        >
                                            View Details
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    {/* Category tabs */}
                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/60 rounded-xl p-1">
                        {SEVERITIES.map(s => (
                            <button
                                key={s.key}
                                onClick={() => setSeverity(s.key)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                    severity === s.key
                                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
                                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                                }`}
                            >
                                {s.icon} {s.label}
                                {s.key === 'all' && unreadCount > 0 && (
                                    <span className="ml-0.5 bg-blue-500 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded-full">
                                        {unreadCount}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Right actions */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setUnreadOnly(v => !v)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                                unreadOnly
                                    ? 'bg-blue-500 text-white border-blue-500'
                                    : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-blue-300'
                            }`}
                        >
                            <Filter size={12} /> Unread only
                        </button>

                        <div className="flex flex-col items-end gap-1">
                            <button
                                onClick={triggerCheck}
                                disabled={actionLoading}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50"
                                title="Refresh & check new alerts"
                            >
                                <RefreshCw size={13} className={actionLoading ? 'animate-spin' : ''} /> Check New Alerts
                            </button>
                            <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tighter">
                                Last checked: {format(lastRefreshed, 'HH:mm:ss')}
                            </span>
                        </div>

                        {unreadCount > 0 && (
                            <button
                                onClick={markAllAsRead}
                                disabled={actionLoading}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-all disabled:opacity-50"
                            >
                                <CheckCheck size={12} /> Mark all read
                            </button>
                        )}

                        <button
                            onClick={deleteRead}
                            disabled={actionLoading}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 text-rose-500 dark:text-rose-400 border border-rose-200 dark:border-rose-800 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all disabled:opacity-50"
                        >
                            <Trash2 size={12} /> Delete read
                        </button>
                    </div>
                </div>

                {/* Notification list layout */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                    {/* Main Feed */}
                    <div className="md:col-span-8 space-y-6">
                        {loading ? (
                            <div className="flex justify-center items-center py-24">
                                <Loader2 className="animate-spin text-blue-500" size={28} />
                            </div>
                        ) : filteredNotifications.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-24 gap-3 bg-white dark:bg-card rounded-2xl border border-border dark:border-slate-800/60">
                                <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                                    <Bell size={24} className="text-slate-300 dark:text-slate-600" />
                                </div>
                                <p className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                                    No alerts found
                                </p>
                                {(category !== 'all' || severity !== 'all') && (
                                    <button 
                                        onClick={() => { setCategory('all'); setSeverity('all'); }}
                                        className="text-[10px] font-semibold text-blue-500 uppercase hover:underline"
                                    >
                                        Clear all filters
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {Object.entries(grouped).map(([dateLabel, items]) => (
                                    <div key={dateLabel}>
                                        <div className="flex items-center gap-3 mb-3 px-1">
                                            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                                {dateLabel}
                                            </span>
                                            <div className="flex-1 h-px bg-slate-100 dark:bg-slate-800" />
                                            <span className="text-[10px] font-bold text-slate-300 dark:text-slate-600">
                                                {items.length}
                                            </span>
                                        </div>

                                        <div className="space-y-2">
                                            {items.map(n => (
                                                <div
                                                    key={n.id}
                                                    onClick={() => handleClick(n)}
                                                    className={`relative flex gap-4 p-4 rounded-xl border-l-4 cursor-pointer transition-all
                                                        ${getBorderClass(n.type)}
                                                        ${n.read
                                                            ? 'bg-white dark:bg-card border border-border dark:border-slate-800/60 opacity-70 hover:opacity-100'
                                                            : 'bg-blue-50/40 dark:bg-blue-900/10 border border-blue-100/50 dark:border-blue-800/30 hover:bg-blue-50/70 dark:hover:bg-blue-900/20 shadow-sm'
                                                        }`}
                                                >
                                                    {/* Unread dot */}
                                                    {!n.read && (
                                                        <span className="absolute top-4 right-4 w-2 h-2 bg-blue-500 rounded-full" />
                                                    )}

                                                    {/* Icon */}
                                                    <div className={`shrink-0 mt-0.5 p-2 rounded-lg h-fit ${getIconClass(n.type)}`}>
                                                        {getIcon(n.type)}
                                                    </div>

                                                    {/* Body */}
                                                    <div className="flex-1 min-w-0 space-y-1">
                                                        <div className="flex items-start justify-between gap-3">
                                                            <h4 className={`text-sm font-semibold tracking-tight ${n.read ? 'text-slate-500 dark:text-slate-400' : 'text-slate-900 dark:text-slate-100'}`}>
                                                                {n.title}
                                                            </h4>
                                                            <span className="shrink-0 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">
                                                                {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                                                            </span>
                                                        </div>

                                                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                                                            {n.message}
                                                        </p>

                                                        <div className="flex items-center gap-2 pt-0.5">
                                                            {n.ticker && (
                                                                <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full uppercase">
                                                                    {n.ticker}
                                                                </span>
                                                            )}
                                                            <span className="text-[10px] font-bold text-slate-300 dark:text-slate-600 uppercase tracking-wider">
                                                                {n.type.replace(/_/g, ' ')}
                                                            </span>
                                                            <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-tighter ml-auto">
                                                                #{getCategory(n.type)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Right Sidebar - Category Grouping */}
                    <div className="md:col-span-4 space-y-6">
                        <div className="bg-white dark:bg-card rounded-2xl border border-border dark:border-slate-800/60 overflow-hidden sticky top-5">
                            <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-b border-border dark:border-slate-800/60">
                                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
                                    <Filter size={12} /> Filter by Area
                                </h3>
                            </div>
                            <div className="p-2 space-y-1">
                                {CATEGORIES.map(cat => {
                                    const count = notifications.filter(n => 
                                        (cat.key === 'all' || getCategory(n.type) === cat.key) &&
                                        (severity === 'all' || getSeverity(n.type) === severity)
                                    ).length;
                                    const unread = notifications.filter(n => 
                                        !n.read &&
                                        (cat.key === 'all' || getCategory(n.type) === cat.key) &&
                                        (severity === 'all' || getSeverity(n.type) === severity)
                                    ).length;

                                    return (
                                        <button
                                            key={cat.key}
                                            onClick={() => setCategory(cat.key)}
                                            className={`w-full flex items-center justify-between p-2.5 rounded-xl transition-all ${
                                                category === cat.key
                                                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 shadow-sm'
                                                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-200'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`p-1.5 rounded-lg ${category === cat.key ? 'bg-blue-100 dark:bg-blue-900/40' : 'bg-slate-100 dark:bg-slate-800'}`}>
                                                    <cat.icon size={14} />
                                                </div>
                                                <span className="text-xs font-bold leading-none">{cat.label}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                {unread > 0 && (
                                                    <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                                                )}
                                                <span className={`text-[10px] font-semibold ${category === cat.key ? 'text-blue-500' : 'text-slate-400'}`}>
                                                    {count}
                                                </span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="px-4 py-3 bg-slate-50/50 dark:bg-slate-800/20 border-t border-border dark:border-slate-800/60 mt-2">
                                <p className="text-[9px] text-slate-400 leading-tight">
                                    Click an area to isolate specific alerts. You can combine this with Priority filters above.
                                </p>
                            </div>
                        </div>

                        {/* Stats card */}
                        <div className="bg-primary text-primary-foreground rounded-2xl p-5 text-white shadow-lg shadow-blue-500/20">
                            <h4 className="text-[10px] font-semibold uppercase tracking-wider opacity-70 mb-4">Total Health</h4>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-2xl font-semibold">{notifications.length}</p>
                                    <p className="text-[9px] font-bold uppercase opacity-70">Total Alerts</p>
                                </div>
                                <div>
                                    <p className="text-2xl font-semibold">{notifications.filter(n => !n.read).length}</p>
                                    <p className="text-[9px] font-bold uppercase opacity-70">Unread</p>
                                </div>
                            </div>
                            <div className="mt-5 pt-4 border-t border-white/10 flex items-center justify-between">
                                <p className="text-[10px] font-medium opacity-80">System status: Normal</p>
                                <div className="flex gap-1">
                                    <div className="w-1 h-1 bg-green-400 rounded-full" />
                                    <div className="w-1 h-1 bg-green-400 rounded-full" />
                                    <div className="w-1 h-1 bg-green-400 rounded-full" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
