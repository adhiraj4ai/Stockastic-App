'use client';

import React, { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import api from '@/lib/api';
import { formatDistanceToNow, format } from 'date-fns';
import { useRouter } from 'next/navigation';
import {
    Bell, TrendingUp, TrendingDown, AlertCircle, Target, Eye, Fish,
    CheckCircle, Info, RefreshCw, Trash2, CheckCheck, Filter, Loader2,
} from 'lucide-react';

type NotificationType =
    | 'STOP_LOSS_HIT' | 'TARGET_REACHED' | 'SIGNIFICANT_GAIN' | 'SIGNIFICANT_LOSS' | 'BELOW_WACC'
    | 'WATCHLIST_BREAKOUT' | 'WATCHLIST_ENTRY'
    | 'SIGNAL_BUY' | 'SIGNAL_SELL' | 'SIGNAL_STRONG_BUY' | 'SIGNAL_STRONG_SELL'
    | 'WHALE_BUY' | 'WHALE_SELL'
    | 'INFO' | 'SUCCESS' | 'WARNING' | 'PRICE_ALERT';

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

type Category = 'all' | 'portfolio' | 'watchlist' | 'signals' | 'whale';

const CATEGORIES: { key: Category; label: string; icon: React.ReactNode }[] = [
    { key: 'all',       label: 'All',        icon: <Bell size={14} /> },
    { key: 'portfolio', label: 'Portfolio',   icon: <Target size={14} /> },
    { key: 'watchlist', label: 'Watchlist',   icon: <Eye size={14} /> },
    { key: 'signals',   label: 'Signals',     icon: <TrendingUp size={14} /> },
    { key: 'whale',     label: 'Whale Watch', icon: <Fish size={14} /> },
];

function getIcon(type: NotificationType) {
    switch (type) {
        case 'STOP_LOSS_HIT':   return <AlertCircle size={15} />;
        case 'TARGET_REACHED':  return <Target size={15} />;
        case 'SIGNIFICANT_GAIN': return <TrendingUp size={15} />;
        case 'SIGNIFICANT_LOSS': return <TrendingDown size={15} />;
        case 'BELOW_WACC':       return <TrendingDown size={15} />;
        case 'WATCHLIST_ENTRY':  return <Eye size={15} />;
        case 'WATCHLIST_BREAKOUT': return <TrendingUp size={15} />;
        case 'SIGNAL_BUY': case 'SIGNAL_STRONG_BUY': return <TrendingUp size={15} />;
        case 'SIGNAL_SELL': case 'SIGNAL_STRONG_SELL': return <TrendingDown size={15} />;
        case 'WHALE_BUY': case 'WHALE_SELL': return <Fish size={15} />;
        case 'SUCCESS': return <CheckCircle size={15} />;
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
        default:
            return 'border-l-slate-300 dark:border-l-slate-600';
    }
}

export default function NotificationsPage() {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [category, setCategory] = useState<Category>('all');
    const [unreadOnly, setUnreadOnly] = useState(false);
    const router = useRouter();

    const fetchNotifications = useCallback(async () => {
        setLoading(true);
        try {
            const params: Record<string, string> = {};
            if (category !== 'all') params.category = category;
            if (unreadOnly) params.unread = 'true';
            const res = await api.get('/api/stocks/notifications/', { params });
            setNotifications(res.data);
        } catch (err) {
            console.error('Failed to fetch notifications', err);
        } finally {
            setLoading(false);
        }
    }, [category, unreadOnly]);

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
        setActionLoading(false);
    };

    const handleClick = (n: Notification) => {
        if (!n.read) markAsRead(n.id);
        if (n.redirect_url) router.push(n.redirect_url);
        else if (n.ticker) router.push(`/ticker/${n.ticker}`);
    };

    const unreadCount = notifications.filter(n => !n.read).length;

    // Group by date label
    const grouped: Record<string, Notification[]> = {};
    for (const n of notifications) {
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
        <DashboardLayout title="Notifications" subtitle="All alerts across your portfolio, watchlist, signals, and whale watch">
            <div className="max-w-4xl mx-auto space-y-5">

                {/* Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    {/* Category tabs */}
                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/60 rounded-xl p-1">
                        {CATEGORIES.map(c => (
                            <button
                                key={c.key}
                                onClick={() => setCategory(c.key)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                    category === c.key
                                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
                                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                                }`}
                            >
                                {c.icon} {c.label}
                                {c.key === 'all' && unreadCount > 0 && (
                                    <span className="ml-0.5 bg-blue-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">
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

                        <button
                            onClick={triggerCheck}
                            disabled={actionLoading}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:border-blue-300 transition-all disabled:opacity-50"
                            title="Refresh & check new alerts"
                        >
                            <RefreshCw size={12} className={actionLoading ? 'animate-spin' : ''} /> Refresh
                        </button>

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

                {/* Notification list */}
                {loading ? (
                    <div className="flex justify-center items-center py-24">
                        <Loader2 className="animate-spin text-blue-500" size={28} />
                    </div>
                ) : notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 gap-3">
                        <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                            <Bell size={24} className="text-slate-300 dark:text-slate-600" />
                        </div>
                        <p className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                            No notifications
                        </p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {Object.entries(grouped).map(([dateLabel, items]) => (
                            <div key={dateLabel}>
                                <div className="flex items-center gap-3 mb-3">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
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
                                                    ? 'bg-white dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800/60 opacity-70 hover:opacity-100'
                                                    : 'bg-blue-50/40 dark:bg-blue-900/10 border border-blue-100/50 dark:border-blue-800/30 hover:bg-blue-50/70 dark:hover:bg-blue-900/20'
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
                                                    <h4 className={`text-sm font-black tracking-tight ${n.read ? 'text-slate-500 dark:text-slate-400' : 'text-slate-900 dark:text-slate-100'}`}>
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
                                                        <span className="text-[10px] font-black text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full uppercase">
                                                            {n.ticker}
                                                        </span>
                                                    )}
                                                    <span className="text-[10px] font-bold text-slate-300 dark:text-slate-600 uppercase tracking-wider">
                                                        {n.type.replace(/_/g, ' ')}
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
        </DashboardLayout>
    );
}
