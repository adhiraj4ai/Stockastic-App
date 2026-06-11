'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import api from '@/lib/api';
import { type AppNotification, getSeverity, POPUP_DURATION } from '@/lib/notifications/config';
import { selectPopups } from '@/lib/notifications/popupQueue';
import { NotificationToast } from './NotificationToast';

const POLL_MS = 20_000;
const MAX_BACKOFF_MS = 300_000;
const SEEN_KEY = 'stk-seen-notifications';

interface NotificationContextValue {
    notifications: AppNotification[];
    unreadCount: number;
    loading: boolean;
    isStale: boolean;
    refresh: () => Promise<void>;
    markRead: (id: number) => Promise<void>;
    markAllRead: () => Promise<void>;
    deleteRead: () => Promise<void>;
    triggerCheck: () => Promise<void>;
}

const NotificationContext = React.createContext<NotificationContextValue | null>(null);

export function useNotifications(): NotificationContextValue {
    const ctx = React.useContext(NotificationContext);
    if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
    return ctx;
}

function loadSeen(): Set<number> {
    try {
        return new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? '[]'));
    } catch {
        return new Set();
    }
}

function persistSeen(seen: Set<number>) {
    try {
        sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-500)));
    } catch { /* storage full or unavailable — popups may repeat after refresh, nothing breaks */ }
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
    const [notifications, setNotifications] = React.useState<AppNotification[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [isStale, setIsStale] = React.useState(false);
    const seenIds = React.useRef<Set<number>>(new Set());
    const isFirstFetch = React.useRef(true);
    const failures = React.useRef(0);
    const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const router = useRouter();

    const markRead = React.useCallback(async (id: number) => {
        setNotifications(prev => prev.map(n => (n.id === id ? { ...n, read: true } : n)));
        try {
            await api.post(`/api/stocks/notifications/${id}/mark_as_read/`);
        } catch {
            setNotifications(prev => prev.map(n => (n.id === id ? { ...n, read: false } : n)));
            toast.error('Could not mark notification as read');
        }
    }, []);

    const dispatchPopups = React.useCallback((incoming: AppNotification[]) => {
        const { popups, overflow } = selectPopups(incoming, seenIds.current);
        // Everything unread this poll is now "seen" — popped or counted in overflow.
        incoming.filter(n => !n.read).forEach(n => seenIds.current.add(n.id));
        persistSeen(seenIds.current);

        popups.forEach(n => {
            toast.custom(
                (t) => (
                    <NotificationToast
                        notification={n}
                        onDismiss={() => { toast.dismiss(t); markRead(n.id); }}
                        onNavigate={(href) => { toast.dismiss(t); markRead(n.id); router.push(href); }}
                    />
                ),
                { duration: POPUP_DURATION[getSeverity(n)] },
            );
        });
        if (overflow > 0) {
            toast.message(`+${overflow} more alerts`, {
                description: 'Open the bell to review them.',
                duration: 6000,
            });
        }
    }, [markRead, router]);

    const fetchNotifications = React.useCallback(async () => {
        try {
            const res = await api.get('/api/stocks/notifications/');
            const incoming: AppNotification[] = Array.isArray(res.data) ? res.data : [];
            setNotifications(incoming);
            setIsStale(false);
            failures.current = 0;
            if (isFirstFetch.current) {
                // Never toast pre-existing notifications on load.
                seenIds.current = loadSeen();
                incoming.forEach(n => seenIds.current.add(n.id));
                persistSeen(seenIds.current);
                isFirstFetch.current = false;
            } else {
                dispatchPopups(incoming);
            }
        } catch {
            failures.current += 1;
            setIsStale(true);
        } finally {
            setLoading(false);
        }
    }, [dispatchPopups]);

    React.useEffect(() => {
        let cancelled = false;
        const tick = async () => {
            if (cancelled) return;
            if (!document.hidden) await fetchNotifications();
            const backoff = Math.min(POLL_MS * 2 ** failures.current, MAX_BACKOFF_MS);
            timer.current = setTimeout(tick, backoff);
        };
        tick();
        const onVisible = () => { if (!document.hidden) fetchNotifications(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            cancelled = true;
            if (timer.current) clearTimeout(timer.current);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [fetchNotifications]);

    const markAllRead = React.useCallback(async () => {
        await api.post('/api/stocks/notifications/mark_all_as_read/');
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    }, []);

    const deleteRead = React.useCallback(async () => {
        await api.delete('/api/stocks/notifications/delete_read/');
        setNotifications(prev => prev.filter(n => !n.read));
    }, []);

    const triggerCheck = React.useCallback(async () => {
        try {
            const res = await api.post('/api/stocks/notifications/trigger_check/');
            if (res.data?.status !== 'skipped') await fetchNotifications();
        } catch { /* cooldown or transient failure — next poll covers it */ }
    }, [fetchNotifications]);

    const value: NotificationContextValue = {
        notifications,
        unreadCount: notifications.filter(n => !n.read).length,
        loading,
        isStale,
        refresh: fetchNotifications,
        markRead,
        markAllRead,
        deleteRead,
        triggerCheck,
    };

    return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}
