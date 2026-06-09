'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTheme } from 'next-themes';
import { LayoutDashboard, TrendingUp, TrendingDown, FileText, LogOut, Wallet, Lightbulb, Activity, ArrowLeft, MessageSquare, NotebookPen, ChevronLeft, ChevronRight, Settings, User, PanelLeftClose, PanelLeftOpen, ChevronDown, Bell, Home, Target, Briefcase, Eye, Users, BarChart3, History, Star, Brain, Radar, Building2, ScanLine, Zap, Share2, Crosshair, DollarSign, Layers, GitMerge, Shield, Search } from 'lucide-react';
import { FullPageLoader } from '@/components/ui/StockLoader';
import { SearchBar } from './SearchBar';
import { AlertsDropdown } from './AlertsDropdown';
import SystemOffline from './SystemOffline';
import { SymbolSelector } from './SymbolSelector';
import { cn } from '@/lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Cookies from 'js-cookie';
import { SettingsDialog } from './SettingsDialog';

const navItems = [
    { name: 'Home', href: '/', icon: Home, permission: 'home', color: 'text-blue-500' },
    { name: 'Ticker Intelligence', href: '/ticker', icon: Search, permission: 'home', color: 'text-indigo-500' },
    {
        name: 'Market',
        icon: Building2,
        color: 'text-emerald-500',
        subItems: [
            { name: 'Terminal', href: '/market', icon: LayoutDashboard, permission: 'market_overview' },
            { name: 'Movers & Shakers', href: '/market/movers', icon: Zap, permission: 'market_movers' },
            { name: 'Deep Dive', href: '/market/activity', icon: Activity, permission: 'market_activity' },
            { name: 'Sector Rotation', href: '/market/rotation', icon: BarChart3, permission: 'market_rotation' },
            { name: 'Social Highlights', href: '/social', icon: Share2, permission: 'market_social' },
            { name: 'Global PA Screener', href: '/market/pa-screener', icon: Target, permission: 'market_pa_screener' },
        ]
    },
    {
        name: 'Floorsheet',
        icon: FileText,
        color: 'text-amber-500',
        subItems: [
            { name: 'Floorsheet', href: '/floorsheet', icon: FileText, permission: 'market_floorsheet' },
            { name: 'Bulk Transactions', href: '/market/bulk', icon: Layers, permission: 'market_bulk' },
            { name: 'Matching Transactions', href: '/market/matching', icon: GitMerge, permission: 'market_matching' },
            { name: 'Volume Profile', href: '/market/volume-profile', icon: BarChart3, permission: 'market_volume' },
            { name: 'Accumulation History', href: '/accumulation/history', icon: History, permission: 'accumulation_history' },
            { name: 'Share Transfer', href: '/accumulation/share-transfer', icon: Share2, permission: 'share_transfer' },
        ]
    },
    // Chat moved to top nav
    {
        name: 'Finfolio',
        icon: Wallet,
        color: 'text-violet-500',
        subItems: [
            { name: 'My Portfolio', href: '/portfolio', icon: Briefcase, permission: 'portfolio_main' },
            { name: 'Performance', href: '/portfolio/performance', icon: TrendingUp, permission: 'portfolio_performance' },
            { name: 'Income', href: '/portfolio/income', icon: DollarSign, permission: 'portfolio_income' },
            { name: 'Transactions', href: '/portfolio/transactions', icon: History, permission: 'portfolio_transactions' },
            { name: 'Watchlist', href: '/portfolio/watchlist', icon: Eye, permission: 'portfolio_watchlist' },
            { name: 'Trade Plans', href: '/portfolio/plans', icon: Layers, permission: 'portfolio_trade_plans' },
            { name: 'Paper Trading', href: '/paper-trading', icon: LayoutDashboard, permission: 'paper_trading' },
        ]
    },
    {
        name: 'Accumulation',
        icon: Activity,
        color: 'text-rose-500',
        subItems: [
            { name: 'Command Center', href: '/accumulation/dashboard', icon: Layers, permission: 'accumulation_dash' },
            { name: 'Smart Money', href: '/accumulation/smart-money', icon: Brain, permission: 'smart_money' },
            { name: 'Broker Trends', href: '/accumulation/trends', icon: BarChart3, permission: 'broker_trends' },
            { name: 'Focus Ranking', href: '/accumulation/focus-ranking', icon: Target, permission: 'focus_ranking' },
            { name: 'Price Study', href: '/accumulation/price-study', icon: TrendingUp, permission: 'price_study' },
            { name: 'Broker Favorites', href: '/accumulation/favorites', icon: Star, permission: 'broker_favorites' },
            { name: 'Accumulators Navigator', href: '/accumulation/navigator', icon: Users, permission: 'navigator' },
            { name: 'Below Cost Positions', href: '/accumulation/below-cost', icon: TrendingDown, permission: 'below_cost' },
        ]
    },
    {
        name: 'Strategic Hub',
        icon: Layers,
        color: 'text-cyan-500',
        subItems: [
            { name: 'Intel Hub', href: '/signals', icon: Radar, permission: 'intel_hub' },
            { name: 'Strategies', href: '/strategies', icon: Lightbulb, permission: 'strategies' },
            { name: 'Track Record', href: '/signals/track-record', icon: History, permission: 'track_record' },
        ]
    },
    {
        name: 'Stockastic AI',
        icon: Brain,
        color: 'text-fuchsia-500',
        subItems: [
            { name: 'Chat', href: '/chat', icon: MessageSquare, permission: 'chat' },
            { name: 'Notebooks', href: '/notebook', icon: NotebookPen, permission: 'chat' },
        ]
    },
    {
        name: 'Administration',
        icon: Shield,
        color: 'text-slate-500 dark:text-slate-400',
        subItems: [
            { name: 'User Management', href: '/admin/users', icon: Users, permission: 'admin_user_mgmt' },
            { name: 'Financials', href: '/admin/financials', icon: FileText, permission: 'admin_financials' },
            { name: 'Pipeline', href: '/admin/pipeline', icon: GitMerge, permission: 'admin_pipeline' },
        ]
    },
];

const stocks = [
    { symbol: 'NABIL', name: 'Nabil Bank Ltd.' },
    { symbol: 'NICA', name: 'NIC Asia Bank Ltd.' },
    { symbol: 'SHLB', name: 'Shine Resunga Development Bank' },
    { symbol: 'AAPL', name: 'Apple Inc.' },
    { symbol: 'GOOGL', name: 'Alphabet Inc.' },
    { symbol: 'TSLA', name: 'Tesla Inc.' },
    { symbol: 'AMZN', name: 'Amazon.com Inc.' },
    { symbol: 'MSFT', name: 'Microsoft Corporation' }
];
function DashboardContent({
    children,
    title,
    subtitle,
    noPadding,
    showBack,
    hideHeader = false,
    headerContent,
    extraHeaderItems,
    tickerPrice,
    priceChange
}: {
    children: React.ReactNode;
    title?: React.ReactNode;
    subtitle?: string;
    noPadding?: boolean;
    showBack?: boolean;
    hideHeader?: boolean;
    headerContent?: React.ReactNode;
    extraHeaderItems?: React.ReactNode;
    tickerPrice?: number;
    priceChange?: number;
}) {
    const pathname = usePathname();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isChatPinned, setIsChatPinned] = useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [expandedMenus, setExpandedMenus] = useState<string[]>([]);
    const [currentUser, setCurrentUser] = useState<{
        id: number;
        username: string;
        email: string;
        nickname?: string;
        first_name?: string;
        last_name?: string;
        profile_picture?: string;
        role?: string;
        is_staff?: boolean;
        is_superuser?: boolean;
        subscription_tier?: 'BASIC' | 'PRO' | 'ULTRA' | 'NONE';
        permissions?: any;
    } | null>(null);
    const [isOffline, setIsOffline] = useState(false);
    const { resolvedTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const logoSrc = mounted && resolvedTheme === 'dark' ? '/stockastic-logo-dark.png' : '/stockastic-logo-v3.png';

    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    const [marketMeta, setMarketMeta] = useState<{ date: string, status: string } | null>(null);

    const isChatPage = pathname === '/chat';
    const isNotebookPage = pathname === '/notebook';
    const isFullWidthPage = isChatPage || isNotebookPage;

    useEffect(() => {
        // Fetch Market Status for Header
        import('@/lib/api').then(({ default: api }) => {
            api.get('/api/stocks/summary/?mode=status')
                .then(res => setMarketMeta(res.data))
                .catch(err => console.error("Failed to load market status", err));
        });
    }, []);

    useEffect(() => {
        // Fetch current user - this triggers a 401 and redirect if session is invalid
        import('@/lib/api').then(({ default: api }) => {
            api.get('/api/users/me/')
                .then(res => setCurrentUser(res.data))
                .catch(err => {
                    console.error("Failed to load user profile", err);
                    const status = err.response ? err.response.status : null;
                    if (status === 401) {
                        router.push('/login');
                    }
                });
        });
    }, [pathname, router]);

    useEffect(() => {
        const handleOffline = () => setIsOffline(true);
        const handleOnline = () => setIsOffline(false);

        window.addEventListener('terminal-offline', handleOffline);
        window.addEventListener('terminal-online', handleOnline);

        // Automatic Recovery Polling
        let recoveryInterval: any;
        if (isOffline) {
            recoveryInterval = setInterval(async () => {
                try {
                    const healthUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000') + '/api/stocks/health-check/';
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 3000);
                    const res = await fetch(healthUrl, { signal: controller.signal });
                    clearTimeout(timeoutId);
                    const json = await res.json();
                    if (json.status === 'online') {
                        console.log('System recovered. Restoring connection.');
                        setIsOffline(false);
                        window.location.reload();
                    }
                } catch (err) {
                    console.log('System still offline...');
                }
            }, 10000);
        }

        return () => {
            window.removeEventListener('terminal-offline', handleOffline);
            window.removeEventListener('terminal-online', handleOnline);
            if (recoveryInterval) clearInterval(recoveryInterval);
        };
    }, [isOffline]);

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return "Good Morning";
        if (hour < 17) return "Good Afternoon";
        return "Good Evening";
    };

    // Filter Navigation Items based on Granular Dynamic Permissions
    const filteredNavItems = navItems.map(item => {
        // While loading, default to most restrictive (Basic)
        if (!currentUser) {
            const basic = ['Home', 'Market', 'Finfolio'];
            if (!basic.includes(item.name)) return null;
            return item;
        }

        const perms = currentUser.permissions;
        if (perms === 'all') return item;
        if (!perms) return null;

        // Hierarchical filtering
        if ('subItems' in item && item.subItems) {
            const filteredSubItems = item.subItems.filter(sub => {
                if (!sub.permission) return true;
                return perms[sub.permission] === true;
            });

            // If the parent has its own permission key, check it
            const itemPerm = (item as any).permission;
            if (itemPerm && perms[itemPerm] === false) return null;

            // Hide parent if all sub-items are restricted
            if (filteredSubItems.length === 0) return null;

            return { ...item, subItems: filteredSubItems };
        }

        // Parent only check
        const itemPerm = (item as any).permission;
        if (itemPerm && perms[itemPerm] === false) return null;

        return item;
    }).filter(Boolean) as any[];

    // Handle Granular Dynamic Route Guard
    useEffect(() => {
        if (!currentUser) return;

        const perms = currentUser.permissions;
        if (perms === 'all') return;
        if (!perms) return;

        // Check if current path is allowed based on navItems registry
        const checkPathAllowed = (path: string) => {
            // Hard block /admin for non-admins
            if (path.startsWith('/admin') && perms !== 'all') return false;

            // Find in parents
            const parent = navItems.find(i => i.href === path);
            if (parent && parent.permission && !perms[parent.permission]) return false;

            // Find in subItems
            for (const item of navItems) {
                if (item.subItems) {
                    const sub = item.subItems.find(s => s.href === path);
                    if (sub && sub.permission && !perms[sub.permission]) return false;
                }
            }
            return true;
        };

        if (!checkPathAllowed(pathname)) {
            // Special cases for Chat and partial paths
            if (pathname === '/chat' && !perms['chat']) {
                router.push('/ticker');
                return;
            }

            // For general restricted paths, push to home or market
            if (pathname !== '/ticker' && pathname !== '/market') {
                router.push('/ticker');
            }
        }
    }, [pathname, currentUser, router]);

    useEffect(() => {
        setIsSidebarCollapsed(isChatPinned || isFullWidthPage);
    }, [isChatPinned, isFullWidthPage]);

    // Resolve the single active nav link by GLOBAL longest-prefix match. This avoids the
    // "Home is active everywhere" bug (every path startsWith '/') and the cross-group
    // double-match (e.g. /market/bulk under Floorsheet also matching /market under Market):
    // the most specific (longest) matching href wins across the entire nav.
    const activeHref = useMemo(() => {
        const leaves: string[] = [];
        navItems.forEach((item: any) => {
            if (item.subItems) item.subItems.forEach((s: any) => leaves.push(s.href));
            else if (item.href) leaves.push(item.href);
        });
        const currentTab = searchParams.get('tab');
        const score = (href: string) => {
            const [p, q] = href.split('?');
            const tab = q ? new URLSearchParams(q).get('tab') : null;
            const pathOk = p === pathname || (p !== '/' && pathname.startsWith(p + '/'));
            if (!pathOk) return -1;
            if (tab && currentTab !== tab) return -1;
            return p.length + (tab ? 1000 : 0); // tab-specific links outrank a plain path match
        };
        let bestHref: string | null = null, best = 0;
        leaves.forEach((h) => { const s = score(h); if (s > best) { best = s; bestHref = h; } });
        return bestHref;
    }, [pathname, searchParams]);

    const isParentActive = (item: any) =>
        'subItems' in item && Array.isArray(item.subItems) && item.subItems.some((s: any) => s.href === activeHref);

    // Auto-expand the menu that contains the active sub-item.
    useEffect(() => {
        navItems.forEach((item: any) => {
            if (item.subItems && item.subItems.some((s: any) => s.href === activeHref)) {
                setExpandedMenus(prev => prev.includes(item.name) ? prev : [...prev, item.name]);
            }
        });
    }, [activeHref]);

    const toggleSidebar = () => {
        setIsSidebarCollapsed(!isSidebarCollapsed);
    };

    const toggleMenu = (name: string) => {
        if (isSidebarCollapsed) {
            setIsSidebarCollapsed(false);
            if (!expandedMenus.includes(name)) {
                setExpandedMenus([...expandedMenus, name]);
            }
            return;
        }
        setExpandedMenus(prev =>
            prev.includes(name) ? prev.filter(i => i !== name) : [...prev, name]
        );
    };

    const openMenu = (name: string) => {
        if (!isSidebarCollapsed && !expandedMenus.includes(name)) {
            setExpandedMenus(prev => [...prev, name]);
        }
    };

    const closeMenu = (item: any) => {
        const isCurrentlyActive = isParentActive(item);
        if (!isSidebarCollapsed && expandedMenus.includes(item.name) && !isCurrentlyActive) {
            setExpandedMenus(prev => prev.filter(i => i !== item.name));
        }
    };

    const handleLogout = async () => {
        try {
            const { default: api } = await import('@/lib/api');
            await api.post('/api/auth/logout/');
        } catch (err) {
            console.error("Logout request failed", err);
        } finally {
            // Clear LocalStorage
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');

            // Clear Cookies (Note: HttpOnly cookies can only be cleared by the backend)
            Cookies.remove('access_token');
            Cookies.remove('refresh_token');

            // Redirect
            router.push('/login');
        }
    };



    return (
        <div className="min-h-screen bg-background flex relative">

            {/* Sidebar */}
            <aside
                className={`bg-sidebar border-r border-sidebar-border flex flex-col fixed h-full z-30 transition-[width] duration-200 ease-out ${isSidebarCollapsed ? 'w-20' : 'w-64'
                    }`}
            >
                <div className={`px-4 h-14 border-b border-sidebar-border flex items-center justify-between ${isSidebarCollapsed ? 'flex-col gap-2 h-auto py-3' : ''}`}>
                    {!isSidebarCollapsed && (
                        <Link href="/ticker" className="hover:opacity-80 transition-opacity block">
                            <Image
                                src={logoSrc}
                                alt="Stockastic Logo"
                                width={104}
                                height={28}
                                className="object-contain"
                                priority
                            />
                        </Link>
                    )}
                    <button
                        onClick={toggleSidebar}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        title={isSidebarCollapsed ? "Expand" : "Collapse"}
                    >
                        {isSidebarCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
                    </button>
                </div>
                <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto custom-scrollbar relative z-10">
                    {filteredNavItems.map((item) => {
                        const hasSubItems = 'subItems' in item && item.subItems && item.subItems.length > 0;
                        const isExpanded = expandedMenus.includes(item.name);
                        const isActive = 'href' in item && item.href ? item.href === activeHref : false;
                        const parentActive = hasSubItems && isParentActive(item);

                        return (
                            <div key={item.name}>
                                {hasSubItems ? (
                                    <button
                                        onClick={() => toggleMenu(item.name)}
                                        className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md transition-colors ${isSidebarCollapsed ? 'justify-center' : 'justify-between'} ${parentActive ? 'bg-sidebar-accent text-sidebar-foreground font-medium' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'}`}
                                        title={isSidebarCollapsed ? item.name : ''}
                                    >
                                        <div className="flex items-center gap-2.5">
                                            <item.icon size={16} className={item.color || "text-muted-foreground"} />
                                            {!isSidebarCollapsed && <span className="text-[13px] font-medium">{item.name}</span>}
                                        </div>
                                        {!isSidebarCollapsed && (
                                            <ChevronDown size={13} className={`text-muted-foreground transition-transform duration-150 ${isExpanded ? 'rotate-180' : ''}`} />
                                        )}
                                    </button>
                                ) : (
                                    <Link
                                        href={('href' in item ? item.href : '#') as string}
                                        className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md transition-colors ${isActive
                                            ? 'bg-sidebar-accent text-sidebar-foreground font-medium'
                                            : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                                            } ${isSidebarCollapsed ? 'justify-center' : ''}`}
                                        title={isSidebarCollapsed ? item.name : ''}
                                    >
                                        <item.icon size={16} className={isActive ? 'text-foreground' : (item.color || 'text-muted-foreground')} />
                                        {!isSidebarCollapsed && <span className="text-[13px]">{item.name}</span>}
                                    </Link>
                                )}

                                {/* Sub-items */}
                                {hasSubItems && isExpanded && !isSidebarCollapsed && (
                                    <div className="ml-[22px] mt-0.5 mb-1 space-y-0.5 border-l border-sidebar-border pl-2">
                                        {(item as any).subItems.map((subItem: any) => {
                                            const isActiveLink = subItem.href === activeHref;

                                            return (
                                                <Link
                                                    key={subItem.name}
                                                    href={subItem.href}
                                                    className={`flex items-center gap-2 px-2 py-1 rounded text-[12px] transition-colors ${isActiveLink
                                                        ? 'bg-sidebar-accent text-sidebar-foreground font-medium'
                                                        : 'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                                                        }`}
                                                >
                                                    {subItem.icon && <subItem.icon size={12} className={isActiveLink ? 'text-foreground' : 'text-muted-foreground'} />}
                                                    {subItem.name}
                                                </Link>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </nav>
                <div className="p-2 border-t border-sidebar-border">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button className={cn(
                                "w-full flex items-center gap-2.5 p-1.5 rounded-md hover:bg-sidebar-accent transition-colors outline-none",
                                isSidebarCollapsed && "justify-center"
                            )}>
                                <div className="h-7 w-7 min-w-[28px] rounded-md bg-foreground text-background flex items-center justify-center text-[11px] font-medium uppercase overflow-hidden">
                                    {currentUser?.profile_picture ? (
                                        <img
                                            src={currentUser.profile_picture}
                                            alt={currentUser.username}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <span>{currentUser?.nickname?.[0] || currentUser?.first_name?.[0] || currentUser?.username?.[0] || 'U'}</span>
                                    )}
                                </div>
                                {!isSidebarCollapsed && (
                                    <>
                                        <div className="flex flex-col items-start min-w-0 flex-1 leading-tight">
                                            <span className="text-[13px] font-medium text-sidebar-foreground truncate w-full text-left">
                                                {(currentUser as any)?.nickname ||
                                                    (((currentUser as any)?.first_name || (currentUser as any)?.last_name)
                                                        ? `${(currentUser as any)?.first_name || ''} ${(currentUser as any)?.last_name || ''}`.trim()
                                                        : currentUser?.username) || 'User'}
                                            </span>
                                            <span className="text-[11px] text-muted-foreground truncate w-full text-left">
                                                {getGreeting()}
                                            </span>
                                        </div>
                                        <ChevronDown size={13} className="text-muted-foreground" />
                                    </>
                                )}
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            side={isSidebarCollapsed ? "right" : "top"}
                            align={isSidebarCollapsed ? "end" : "center"}
                            sideOffset={8}
                            className="w-56 p-1 rounded-md z-[60]"
                        >
                            <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground px-2 py-1.5">Account</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="cursor-pointer gap-2 px-2 py-1.5 text-[13px]" onClick={() => setIsSettingsOpen(true)}>
                                <Settings size={14} className="text-muted-foreground" />
                                <span>Preferences</span>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                onClick={handleLogout}
                                className="cursor-pointer gap-2 px-2 py-1.5 text-[13px] text-destructive focus:text-destructive"
                            >
                                <LogOut size={14} />
                                <span>Sign out</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </aside>

            {/* Main content */}
            <main
                className={`flex-1 flex flex-col min-w-0 transition-[margin] duration-200 ease-out z-10 ${isSidebarCollapsed ? 'ml-20' : 'ml-64'
                    } ${isChatPinned && !isFullWidthPage ? 'mr-96' : ''}`}
            >
                {/* Top Navigation Bar */}
                {!hideHeader && (
                    <header className={`bg-background border-b border-border fixed top-0 right-0 z-40 px-6 h-14 flex justify-between items-center transition-[left,right] duration-200 ${isSidebarCollapsed ? 'left-20' : 'left-64'} ${isChatPinned && !isFullWidthPage ? 'right-96' : 'right-0'}`}>
                        {headerContent ? (
                            <div className="flex-1 mr-4">
                                {headerContent}
                            </div>
                        ) : (
                            <div className="w-1/3 flex items-center gap-3">
                                {showBack && (
                                    <button
                                        onClick={() => router.back()}
                                        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                                        title="Go Back"
                                    >
                                        <ArrowLeft size={16} />
                                    </button>
                                )}
                                {pathname.startsWith('/signals') ? (
                                    <div className="flex flex-col min-w-0 leading-tight">
                                        <h2 className="text-[15px] font-semibold text-foreground tracking-tight">
                                            Strategic Hub
                                        </h2>
                                        <p className="text-[11px] text-muted-foreground truncate">Real-time signals from multiple engines, ranked by conviction</p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col min-w-0 leading-tight">
                                        <h2 className={`text-[15px] font-semibold text-foreground truncate ${!title ? 'capitalize' : ''}`}>
                                            {title || (pathname.includes('/ticker/') ? 'Stock Intelligence' : pathname.split('/').pop())}
                                        </h2>
                                        {subtitle && (
                                            <p className="text-[12px] text-muted-foreground truncate pr-4">{subtitle}</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}


                        {/* Center Section: Navigation Links & Ticker Pulse */}
                        <div className="flex-1 flex justify-center items-center gap-1">
                            {[
                                { name: 'Home', href: '/', icon: Home },
                                { name: 'Dashboard', href: '/market', icon: LayoutDashboard },
                                { name: 'Portfolio', href: '/portfolio', icon: Briefcase }
                            ].map((link) => {
                                const isActive = pathname === link.href || (link.href === '/market' && pathname.startsWith('/market'));
                                return (
                                    <Link
                                        key={link.href}
                                        href={link.href}
                                        className={cn(
                                            "px-2.5 py-1.5 rounded-md text-[13px] font-medium transition-colors flex items-center gap-2",
                                            isActive
                                                ? "bg-accent text-foreground"
                                                : "text-muted-foreground hover:bg-accent hover:text-foreground"
                                        )}
                                    >
                                        <link.icon size={14} />
                                        <span className="hidden lg:inline">{link.name}</span>
                                    </Link>
                                );
                            })}

                            {pathname.startsWith('/ticker/') && (
                                <div className="flex items-center bg-card border border-border rounded-md overflow-hidden ml-3">
                                    <SymbolSelector
                                        value={pathname.split('/ticker/')[1]?.split('/')[0]}
                                        onChange={(symbol) => router.push(`/ticker/${symbol}`)}
                                        className="border-none shadow-none hover:shadow-none bg-transparent dark:bg-transparent rounded-r-none h-9 px-3"
                                    />
                                    {tickerPrice !== undefined && (
                                        <>
                                            <div className="w-px h-5 bg-border" />
                                            <div className="flex items-center gap-3 px-3 min-w-[100px]">
                                                <div className="flex items-center gap-1.5 leading-none">
                                                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">LTP</span>
                                                    <span className="text-[13px] font-medium text-foreground tabular-nums">
                                                        रू {tickerPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                    </span>
                                                </div>
                                                {priceChange !== undefined && (
                                                    <div className={cn(
                                                        "text-[11px] font-medium flex items-center gap-0.5 tabular-nums",
                                                        priceChange >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                                                    )}>
                                                        {priceChange >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                                                        {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
                                                    </div>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="w-1/3 flex justify-end gap-3 items-center">
                            {extraHeaderItems && (
                                <div className="hidden md:block">
                                    {extraHeaderItems}
                                </div>
                            )}
                            {marketMeta && (
                                <div className="hidden md:flex items-center gap-2 leading-tight">
                                    <span className={`h-1.5 w-1.5 rounded-full ${marketMeta.status === 'OPEN' ? 'bg-emerald-500' : 'bg-muted-foreground/50'}`}></span>
                                    <span className="text-[11px] text-muted-foreground">
                                        {marketMeta.status === 'OPEN' ? 'Market open' : 'Market closed'}
                                    </span>
                                    <span className="text-[11px] font-mono text-foreground tabular-nums">
                                        {marketMeta.date}
                                    </span>
                                </div>
                            )}
                            <AlertsDropdown />
                        </div>
                    </header>
                )}

                <div className={`${noPadding ? '' : 'p-6'} ${!hideHeader ? 'pt-[72px]' : ''} relative z-0`}>
                    {children}
                </div>
            </main >

            <SettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
            {isOffline && <SystemOffline />}
        </div >
    );
}

export default function DashboardLayout(props: any) {
    return (
        <Suspense fallback={<FullPageLoader />}>
            <DashboardContent {...props} />
        </Suspense>
    );
}
