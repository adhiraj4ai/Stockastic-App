'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const TABS = [
    { name: 'Overview', href: '/market' },
    { name: 'Movers', href: '/market/movers' },
    { name: 'Activity', href: '/market/activity' },
    { name: 'Bulk', href: '/market/bulk' },
    { name: 'Rotation', href: '/market/rotation' },
    { name: 'Volume Profile', href: '/market/volume-profile' },
    { name: 'Screener', href: '/market/pa-screener' },
    { name: 'Matching', href: '/market/matching' },
];

export function MarketTabs({ className }: { className?: string }) {
    const pathname = usePathname();
    return (
        <nav
            className={cn(
                'flex gap-1 whitespace-nowrap border-b border-border overflow-x-auto mb-6',
                className
            )}
            aria-label="Market sections"
        >
            {TABS.map(tab => {
                const active = tab.href === '/market'
                    ? pathname === '/market'
                    : pathname.startsWith(tab.href);
                return (
                    <Link
                        key={tab.href}
                        href={tab.href}
                        className={cn(
                            'px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors',
                            active
                                ? 'border-primary text-foreground'
                                : 'border-transparent text-muted-foreground hover:text-foreground'
                        )}
                    >
                        {tab.name}
                    </Link>
                );
            })}
        </nav>
    );
}
