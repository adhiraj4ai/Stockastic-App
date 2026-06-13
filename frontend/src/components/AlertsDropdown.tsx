'use client';

import React from 'react';
import { Bell, RefreshCw } from 'lucide-react';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { formatDistanceToNow } from 'date-fns';
import { useRouter } from 'next/navigation';
import {
    type AppNotification, type Category, getCategory, getMetrics, getSeverity,
    getTypeConfig, SEVERITY_DOT, TONE_CLASSES,
} from '@/lib/notifications/config';
import { useNotifications } from '@/components/notifications/NotificationProvider';
import { NotificationDetail } from '@/components/notifications/NotificationDetail';
import { formatNepaliNumber } from '@/lib/formatters';

// Dropdown groups the 7 registry categories into 3 tabs.
const TAB_CATEGORIES: Record<string, Category[]> = {
    portfolio: ['portfolio', 'watchlist'],
    signals: ['signals', 'system'],
    market: ['technical', 'broker', 'market'],
};

function AlertRow({ n, onClick }: { n: AppNotification; onClick: () => void }) {
    const config = getTypeConfig(n.type);
    const tone = TONE_CLASSES[config.tone];
    const severity = getSeverity(n);
    const key = getMetrics(n)[0];
    const Icon = config.icon;

    return (
        <div
            onClick={onClick}
            className={`flex cursor-pointer gap-3 border-b border-border/60 px-3.5 py-3 transition-colors hover:bg-accent ${!n.read ? 'bg-primary/[0.04]' : ''}`}
        >
            <span className={`mt-1 p-1.5 rounded-md h-fit ${tone.icon}`}><Icon size={13} /></span>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY_DOT[severity]}`} />
                    <span className={`truncate text-xs font-semibold ${n.read ? 'text-muted-foreground' : 'text-foreground'}`}>
                        {n.title}
                    </span>
                    <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: false })}
                    </span>
                </div>
                <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{n.message}</p>
                <div className="mt-1 flex items-center gap-2">
                    {n.ticker && n.ticker !== 'SUMMARY' && (
                        <span className="rounded border border-border bg-secondary px-1.5 text-[10px] font-semibold text-secondary-foreground tabular-nums">
                            {n.ticker}
                        </span>
                    )}
                    {n.ticker === 'SUMMARY' && (
                        <span className="rounded border border-border bg-secondary px-1.5 text-[10px] font-semibold text-secondary-foreground">
                            {n.metadata?.count ?? n.metadata?.symbols?.length ?? 0} assets
                        </span>
                    )}
                    {key && (
                        <span className={`text-[10px] font-semibold tabular-nums ${
                            key.kind === 'percent'
                                ? key.value >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'
                                : 'text-foreground'
                        }`}>
                            {key.kind === 'price' ? `Rs. ${formatNepaliNumber(key.value)}`
                                : key.kind === 'percent' ? `${key.value >= 0 ? '+' : ''}${key.value.toFixed(1)}%`
                                : key.value.toFixed(1)}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}

export function AlertsDropdown() {
    const { notifications, unreadCount, isStale, markRead, markAllRead, triggerCheck } = useNotifications();
    const [selected, setSelected] = React.useState<AppNotification | null>(null);
    const router = useRouter();

    const byTab = (tab: string) =>
        notifications.filter(n => TAB_CATEGORIES[tab].includes(getCategory(n.type)));
    const unreadByTab = (tab: string) => byTab(tab).filter(n => !n.read).length;

    const open = (n: AppNotification) => {
        if (!n.read) markRead(n.id);
        setSelected(n);
    };

    const renderList = (tab: string) => {
        const list = byTab(tab);
        if (list.length === 0) {
            return <div className="p-8 text-center text-xs text-muted-foreground">No {tab} alerts</div>;
        }
        return list.map(n => <AlertRow key={n.id} n={n} onClick={() => open(n)} />);
    };

    return (
        <DropdownMenu onOpenChange={(o) => o && triggerCheck()}>
            <DropdownMenuTrigger asChild>
                <button className="relative rounded-full p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground outline-none">
                    <Bell size={18} />
                    {unreadCount > 0 && (
                        <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
                            {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                    )}
                    {isStale && <span className="absolute bottom-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-amber-500" />}
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[360px] overflow-hidden rounded-lg border border-border bg-popover p-0 shadow-md">
                <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                    <DropdownMenuLabel className="flex items-center gap-2 p-0 text-xs font-semibold text-foreground">
                        <Bell size={13} className="text-primary" /> Notifications
                    </DropdownMenuLabel>
                    <button
                        onClick={(e) => { e.stopPropagation(); triggerCheck(); }}
                        className="text-muted-foreground transition-colors hover:text-foreground"
                        aria-label="Check for new alerts"
                    >
                        <RefreshCw size={12} />
                    </button>
                </div>

                <Tabs defaultValue="portfolio" className="w-full">
                    <TabsList className="grid h-9 w-full grid-cols-3 rounded-none border-b border-border bg-muted/50 p-0.5">
                        {Object.keys(TAB_CATEGORIES).map(tab => (
                            <TabsTrigger key={tab} value={tab} className="h-7 text-[11px] font-medium capitalize">
                                {tab}
                                {unreadByTab(tab) > 0 && <span className="ml-1 h-1 w-1 rounded-full bg-primary" />}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                    <div className="max-h-[360px] overflow-y-auto custom-scrollbar">
                        {Object.keys(TAB_CATEGORIES).map(tab => (
                            <TabsContent key={tab} value={tab} className="m-0 focus-visible:ring-0">
                                {renderList(tab)}
                            </TabsContent>
                        ))}
                    </div>
                </Tabs>

                <div className="flex gap-1 border-t border-border bg-muted/40 p-1.5">
                    <button
                        onClick={(e) => { e.stopPropagation(); markAllRead(); }}
                        className="flex-1 rounded-md py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                        Mark all read
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); router.push('/notifications'); }}
                        className="flex-1 rounded-md bg-primary/10 py-1.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/15"
                    >
                        View all
                    </button>
                </div>
            </DropdownMenuContent>

            <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
                <DialogContent className="sm:max-w-lg">
                    <DialogTitle className="sr-only">{selected?.title ?? 'Notification'}</DialogTitle>
                    {selected && (
                        <NotificationDetail
                            notification={selected}
                            onClose={() => setSelected(null)}
                            onNavigate={(href) => router.push(href)}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </DropdownMenu>
    );
}
