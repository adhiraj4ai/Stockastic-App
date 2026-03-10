'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import api from '@/lib/api';

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export default function IdleSessionProvider({ children }: { children: React.ReactNode }) {
    const [lastActivity, setLastActivity] = useState<number>(Date.now());
    const router = useRouter();
    const pathname = usePathname();

    // Do not track idle time or force logout on auth pages
    const isPublicRoute = ['/login', '/signup', '/forgot-password', '/reset-password'].some(route => pathname?.startsWith(route)) || pathname === '/';

    const checkIdle = useCallback(() => {
        if (isPublicRoute) return;

        const now = Date.now();
        if (now - lastActivity > IDLE_TIMEOUT_MS) {
            // Log out user
            api.post('/auth/logout/')
                .catch(() => { })
                .finally(() => {
                    localStorage.removeItem('access_token');
                    router.push(`/login?idle=true`);
                });
        }
    }, [lastActivity, isPublicRoute, router, pathname]);

    useEffect(() => {
        if (isPublicRoute) return;

        const interval = setInterval(checkIdle, 60000); // Check every minute
        return () => clearInterval(interval);
    }, [checkIdle, isPublicRoute]);

    useEffect(() => {
        if (isPublicRoute) return;

        const updateActivity = () => setLastActivity(Date.now());

        // Listen for standard user interaction events
        const events = ['mousemove', 'keydown', 'scroll', 'click', 'touchstart'];
        events.forEach(event => window.addEventListener(event, updateActivity, { passive: true }));

        return () => {
            events.forEach(event => window.removeEventListener(event, updateActivity));
        };
    }, [isPublicRoute]);

    return <>{children}</>;
}
