'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTheme } from 'next-themes';
import { LayoutDashboard, TrendingUp, TrendingDown, FileText, LogOut, Wallet, Lightbulb, Activity, ArrowLeft, MessageSquare, ChevronLeft, ChevronRight, Settings, User, PanelLeftClose, PanelLeftOpen, ChevronDown, Bell, Home, Target, Briefcase, Eye, Users, BarChart3, History, Star, Brain, Radar, Landmark, ScanLine, Zap, Share2, Crosshair, DollarSign, Layers, GitMerge } from 'lucide-react';
import { FullPageLoader } from '@/components/ui/StockLoader';
import { SearchBar } from './SearchBar';
import { ChatSidebar } from './ChatSidebar';
import { AlertsDropdown } from './AlertsDropdown';
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
    {
        name: 'Market',
        icon: Landmark,
        subItems: [
            { name: 'Overview', href: '/market', icon: LayoutDashboard },
            { name: 'Movers & Shakers', href: '/market/movers', icon: Zap },
            { name: 'Deep Dive', href: '/market/activity', icon: Activity },
            { name: 'Sector Rotation', href: '/market/rotation', icon: BarChart3 },
            { name: 'Floorsheet', href: '/floorsheet', icon: FileText },
            { name: 'Bulk Transactions', href: '/market/bulk', icon: Layers },
            { name: 'Matching Transactions', href: '/market/matching', icon: GitMerge },
            { name: 'Social Highlights', href: '/social', icon: Share2 },
            { name: 'Global PA Screener', href: '/market/pa-screener', icon: Target },
            { name: 'Volume Profile', href: '/market/volume-profile', icon: BarChart3 },
        ]
    },
    // Chat moved to top nav
    { name: 'Ticker', href: '/ticker', icon: ScanLine },
    {
        name: 'Finfolio',
        icon: Wallet,
        subItems: [
            { name: 'My Portfolio', href: '/portfolio', icon: Briefcase },
            { name: 'Performance', href: '/portfolio/performance', icon: TrendingUp },
            { name: 'Income', href: '/portfolio/income', icon: DollarSign },
            { name: 'Transactions', href: '/portfolio/transactions', icon: History },
            { name: 'Watchlist', href: '/portfolio/watchlist', icon: Eye },
            { name: 'Paper Trading', href: '/paper-trading', icon: LayoutDashboard },
        ]
    },
    {
        name: 'Accumulation',
        icon: Activity,
        subItems: [
            { name: 'Command Center', href: '/accumulation/dashboard', icon: Layers },
            { name: 'Smart Money', href: '/accumulation/smart-money', icon: Brain },
            { name: 'Broker Trends', href: '/accumulation/trends', icon: BarChart3 },
            { name: 'Focus Ranking', href: '/accumulation/focus-ranking', icon: Target },
            { name: 'Accumulation History', href: '/accumulation/history', icon: History },
            { name: 'Price Study', href: '/accumulation/price-study', icon: TrendingUp },
            { name: 'Broker Favorites', href: '/accumulation/favorites', icon: Star },
            { name: 'Share Transfer', href: '/accumulation/share-transfer', icon: Share2 },
            { name: 'Accumulators Navigator', href: '/accumulation/navigator', icon: Users },
            { name: 'Below Cost Positions', href: '/accumulation/below-cost', icon: TrendingDown },
        ]
    },
    { name: 'Financials', href: '/financials', icon: FileText },
    {
        name: 'Strategic Hub',
        icon: Layers,
        subItems: [
            { name: 'Intel Hub', href: '/signals', icon: Radar },
            { name: 'Strategies', href: '/strategies', icon: Lightbulb },
            { name: 'Track Record', href: '/signals/track-record', icon: History },
        ]
    },
    // { name: 'Forecasts', href: '/forecasts', icon: Brain },
    { name: 'Pipeline', href: '/pipeline', icon: Settings },
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
    const [currentUser, setCurrentUser] = useState<{ id: number; username: string; email: string } | null>(null);
    const { resolvedTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const logoSrc = mounted && resolvedTheme === 'dark' ? '/stockastic-logo-dark.png' : '/stockastic-logo-v3.png';

    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    const [marketMeta, setMarketMeta] = useState<{ date: string, status: string } | null>(null);

    const isChatPage = pathname === '/chat';

    useEffect(() => {
        // Fetch Market Status for Header
        import('@/lib/api').then(({ default: api }) => {
            api.get('/api/stocks/summary/?mode=status')
                .then(res => setMarketMeta(res.data))
                .catch(err => console.error("Failed to load market status", err));
        });
    }, []);

    useEffect(() => {
        // Fetch current user
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

        // Periodic check for token existence - simple safeguard
        const checkAuth = () => {
            const token = Cookies.get('access_token');
            if (!token && pathname !== '/login') {
                router.push('/login');
            }
        };

        const interval = setInterval(checkAuth, 5000);
        return () => clearInterval(interval);
    }, [pathname, router]);

    // Filter Navigation Items based on User
    const filteredNavItems = navItems.filter(item => {
        if (!currentUser) return true; // Show all while loading/default
        if (currentUser.username === 'ashmi') {
            return !['Chat', 'Pipeline'].includes(item.name);
        }
        return true;
    });

    useEffect(() => {
        setIsSidebarCollapsed(isChatPinned || isChatPage);
    }, [isChatPinned, isChatPage]);

    // Auto-expand menus that contain the active sub-item
    useEffect(() => {
        navItems.forEach(item => {
            if ('subItems' in item && item.subItems) {
                const hasActiveSubItem = item.subItems.some(subItem => {
                    const subPath = subItem.href.split('?')[0];
                    const subTab = new URLSearchParams(subItem.href.split('?')[1]).get('tab');
                    const currentTab = searchParams.get('tab');
                    return pathname === subPath && (subTab ? currentTab === subTab : true);
                });

                if (hasActiveSubItem && !expandedMenus.includes(item.name)) {
                    setExpandedMenus(prev => [...prev, item.name]);
                }
            }
        });
    }, [pathname, searchParams]);

    const isMenuHoverActive = (item: any) => {
        if (!('subItems' in item && item.subItems)) return false;
        return item.subItems.some((subItem: any) => {
            const subPath = subItem.href.split('?')[0];
            const subTab = new URLSearchParams(subItem.href.split('?')[1]).get('tab');
            const currentTab = searchParams.get('tab');
            return pathname === subPath && (subTab ? currentTab === subTab : true);
        });
    };

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
        const isCurrentlyActive = isMenuHoverActive(item);
        if (!isSidebarCollapsed && expandedMenus.includes(item.name) && !isCurrentlyActive) {
            setExpandedMenus(prev => prev.filter(i => i !== item.name));
        }
    };

    const handleLogout = () => {
        // Clear LocalStorage
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');

        // Clear Cookies
        Cookies.remove('access_token');
        Cookies.remove('refresh_token');

        // Redirect
        router.push('/login');
    };



    return (
        <div className="min-h-screen bg-white dark:bg-[#020617] flex transition-colors duration-300 relative overflow-hidden">
            {/* Ambient Background Glows */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/5 dark:bg-slate-500/5 blur-[80px] rounded-full" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-slate-500/5 dark:bg-blue-500/5 blur-[80px] rounded-full" />
            </div>

            {/* Sidebar */}
            <aside
                className={`bg-white/95 dark:bg-slate-950/40 backdrop-blur-2xl border-r border-gray-200/30 dark:border-white/5 flex flex-col fixed h-full z-30 transition-all duration-500 ease-in-out ${isSidebarCollapsed ? 'w-20' : 'w-64'
                    }`}
            >
                <div className={`p-5 border-b border-gray-200/30 dark:border-white/5 flex items-center justify-between ${isSidebarCollapsed ? 'flex-col gap-4' : ''}`}>
                    {!isSidebarCollapsed && (
                        <div className="w-full flex justify-start pl-1">
                            <Link href="/market" className="hover:opacity-80 transition-opacity duration-300 block">
                                <Image
                                    src={logoSrc}
                                    alt="Stockastic Logo"
                                    width={120}
                                    height={90}
                                    className="object-contain"
                                    priority
                                />
                            </Link>
                        </div>
                    )}
                    <button
                        onClick={toggleSidebar}
                        className={`p-2 rounded-xl bg-slate-50/50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-950/40 dark:text-slate-400/40 hover:text-black dark:hover:text-white transition-all duration-300 ring-1 ring-inset ring-transparent hover:ring-slate-200 dark:hover:ring-white/10 ${isSidebarCollapsed ? '' : ''}`}
                        title={isSidebarCollapsed ? "Expand" : "Collapse"}
                    >
                        {isSidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
                    </button>
                </div>
                <nav className="flex-1 p-3 space-y-1 overflow-y-auto custom-scrollbar relative z-10">
                    {filteredNavItems.map((item) => {
                        const hasSubItems = 'subItems' in item && item.subItems && item.subItems.length > 0;
                        const isExpanded = expandedMenus.includes(item.name);
                        const isActive = 'href' in item && item.href ? (pathname.startsWith(item.href) && item.href !== '/market' || pathname === item.href) : false;

                        return (
                                <div
                                key={item.name}
                                className={`space-y-0.5 transition-all duration-300 ${hasSubItems ? 'border border-gray-200/20 dark:border-white/5 rounded-2xl overflow-hidden bg-slate-50/30 dark:bg-white/[0.02]' : ''}`}
                            >
                                {hasSubItems ? (
                                    <button
                                        onClick={() => toggleMenu(item.name)}
                                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-300 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-black dark:hover:text-white group ${isSidebarCollapsed ? 'justify-center' : 'justify-between'}`}
                                        title={isSidebarCollapsed ? item.name : ''}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`p-1.5 rounded-lg transition-all duration-300 ${isExpanded ? 'bg-slate-100 dark:bg-white/10' : 'group-hover:scale-110'}`}>
                                                <item.icon size={18} className={
                                                    item.name === 'Home' ? 'text-blue-500/70 dark:text-blue-400/70' :
                                                        item.name === 'Chat' ? 'text-purple-500/70 dark:text-purple-400/70' :
                                                            item.name === 'Stocks' ? 'text-green-500/70 dark:text-green-400/70' :
                                                                item.name === 'Finfolio' ? 'text-emerald-500/70 dark:text-emerald-400/70' :
                                                                    item.name === 'Accumulation' ? 'text-orange-500/70 dark:text-orange-400/70' :
                                                                        item.name === 'Financials' ? 'text-cyan-500/70 dark:text-cyan-400/70' :
                                                                            item.name === 'Strategic Hub' ? 'text-pink-500/70 dark:text-pink-400/70' :
                                                                                item.name === 'Pipeline' ? 'text-teal-500/70 dark:text-teal-400/70' :
                                                                                    'text-slate-400 dark:text-slate-500'
                                                } />
                                            </div>
                                            {!isSidebarCollapsed && <span className="text-sm font-semibold tracking-tight">{item.name}</span>}
                                        </div>
                                        {!isSidebarCollapsed && (
                                            <ChevronDown size={14} className={`text-slate-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                                        )}
                                    </button>
                                ) : (
                                    <Link
                                        href={('href' in item ? item.href : '#') as string}
                                        className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-300 group relative ${isActive
                                            ? 'bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-black dark:hover:text-white'
                                            } ${isSidebarCollapsed ? 'justify-center px-2' : ''}`}
                                        title={isSidebarCollapsed ? item.name : ''}
                                    >
                                        <div className={`p-1.5 rounded-lg transition-all duration-300 ${isActive ? 'bg-emerald-500/10' : 'group-hover:scale-110'}`}>
                                            <item.icon size={18} className={
                                                item.name === 'Market' ? 'text-blue-500' :
                                                    item.name === 'Chat' ? 'text-purple-500' :
                                                        item.name === 'Ticker' ? 'text-green-500' :
                                                            item.name === 'Financials' ? 'text-cyan-500' :
                                                                item.name === 'Strategic Hub' ? 'text-pink-500' :
                                                                    item.name === 'Pipeline' ? 'text-teal-500' :
                                                                        isActive ? 'text-emerald-500' : 'text-slate-400 dark:text-slate-500'
                                            } />
                                        </div>
                                        {!isSidebarCollapsed && <span className={`text-sm tracking-tight ${isActive ? 'font-bold text-emerald-600 dark:text-emerald-400' : 'font-semibold'}`}>{item.name}</span>}
                                        {isActive && !isSidebarCollapsed && (
                                            <div className="absolute right-2 w-1.5 h-1.5 bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.8)]" />
                                        )}
                                    </Link>
                                )}

                                {/* Render Sub-items */}
                                {hasSubItems && isExpanded && !isSidebarCollapsed && (
                                    <div className="ml-8 mt-0.5 mb-2 space-y-0.5 animate-in slide-in-from-top-1 fade-in duration-300 border-l border-slate-200/50 dark:border-white/10 pl-2 relative">
                                        {(item as any).subItems.map((subItem: any) => {
                                            const subPath = subItem.href.split('?')[0];
                                            const subTab = new URLSearchParams(subItem.href.split('?')[1]).get('tab');
                                            const currentTab = searchParams.get('tab');

                                            // Generic active logic: match path AND tab (if present)
                                            const isActiveLink = pathname === subPath && (subTab ? currentTab === subTab : true);

                                            const subIconColor = isActiveLink
                                                ? (item.name === 'Accumulation' ? 'text-orange-500 dark:text-orange-400' :
                                                    item.name === 'Finfolio' ? 'text-emerald-500 dark:text-emerald-400' :
                                                        'text-white')
                                                : (item.name === 'Accumulation' ? 'text-orange-500/60 dark:text-orange-400/60' :
                                                    item.name === 'Finfolio' ? 'text-emerald-500/60 dark:text-emerald-400/60' :
                                                        'text-slate-500/60 dark:text-slate-400/60');

                                            return (
                                                <Link
                                                    key={subItem.name}
                                                    href={subItem.href}
                                                    className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[11px] font-medium tracking-tight transition-all duration-300 group ${isActiveLink
                                                        ? 'bg-white/10 text-white shadow-sm'
                                                        : 'text-slate-500 dark:text-slate-400/60 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-black dark:hover:text-white'
                                                        }`}
                                                >
                                                    {subItem.icon && <subItem.icon size={13} className={`${subIconColor} group-hover:scale-110 transition-transform`} />}
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
                <div className="p-4 border-t border-gray-200/50 dark:border-white/5 relative z-10 bg-white/50 dark:bg-transparent">
                    <div className={`flex flex-col gap-1 ${isSidebarCollapsed ? 'items-center' : ''}`}>
                    </div>
                </div>
            </aside>

            {/* Main content */}
            <main
                className={`flex-1 flex flex-col min-w-0 transition-all duration-500 ease-in-out z-10 ${isSidebarCollapsed ? 'ml-20' : 'ml-64'
                    } ${isChatPinned && !isChatPage ? 'mr-96' : ''}`}
            >
                {/* Top Navigation Bar */}
                {!hideHeader && (
                    <header className={`bg-white/80 dark:bg-slate-900/60 backdrop-blur-xl border-b border-gray-200/50 dark:border-white/5 fixed top-0 right-0 z-40 px-8 py-4 flex justify-between items-center transition-all duration-500 shadow-sm ${isSidebarCollapsed ? 'left-20' : 'left-64'} ${isChatPinned && !isChatPage ? 'right-96' : 'right-0'}`}>
                        {headerContent ? (
                            <div className="flex-1 mr-4">
                                {headerContent}
                            </div>
                        ) : (
                            <div className="w-1/3 flex items-center gap-4">
                                {showBack && (
                                    <button
                                        onClick={() => router.back()}
                                        className="p-2 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-gray-600 dark:text-slate-400 transition-all duration-300"
                                        title="Go Back"
                                    >
                                        <ArrowLeft size={18} />
                                    </button>
                                )}
                                {pathname.startsWith('/signals') ? (
                                    <div className="flex flex-col min-w-0">
                                        <h2 className="text-lg font-bold bg-gradient-to-r from-slate-900 to-black dark:from-white dark:to-slate-400 bg-clip-text text-transparent tracking-tight">
                                            Strategic Hub
                                        </h2>
                                        <p className="text-[10px] text-slate-500 dark:text-slate-500 font-bold">Real-time signals from multiple engines, ranked by conviction</p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col min-w-0">
                                        <h2 className={`text-2xl font-bold text-gray-900 dark:text-slate-100 truncate ${!title ? 'capitalize' : ''}`}>
                                            {title || (pathname.includes('/ticker/') ? 'Stock Details' : pathname.split('/').pop())}
                                        </h2>
                                        {subtitle && (
                                            <p className="text-sm text-slate-900/60 dark:text-slate-400/60 truncate pr-4 mt-0.5">{subtitle}</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}


                        <div className="w-1/3 flex justify-center items-center gap-4">
                            {pathname.startsWith('/ticker/') && (() => {
                                const currentTicker = pathname.split('/ticker/')[1]?.split('/')[0];
                                return (
                                    <div className="flex items-center bg-white dark:bg-slate-950/40 border border-slate-200/60 dark:border-white/5 rounded-2xl overflow-hidden shadow-sm transition-all hover:shadow-md group">
                                        <SymbolSelector
                                            value={currentTicker}
                                            onChange={(symbol) => router.push(`/ticker/${symbol}`)}
                                            className="border-none shadow-none hover:shadow-none bg-transparent dark:bg-transparent rounded-r-none h-11 px-5"
                                        />
                                        {tickerPrice !== undefined && (
                                            <>
                                                <div className="w-[1px] h-6 bg-slate-200 dark:bg-slate-800/80" />
                                                <div className="flex flex-col items-start px-5 py-1 justify-center min-w-[100px]">
                                                    <div className="flex items-center gap-1.5 leading-none">
                                                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tighter">LTP</span>
                                                        <span className="text-sm font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                                                            रू {tickerPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                        </span>
                                                    </div>
                                                    {priceChange !== undefined && (
                                                        <div className={cn(
                                                            "text-[10px] font-bold flex items-center gap-0.5 mt-0.5",
                                                            priceChange >= 0 ? "text-emerald-500" : "text-rose-500"
                                                        )}>
                                                            {priceChange >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                                                            {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
                                                        </div>
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>

                        <div className="w-1/3 flex justify-end gap-5 items-center">
                            {extraHeaderItems && (
                                <div className="hidden md:block">
                                    {extraHeaderItems}
                                </div>
                            )}
                            {marketMeta && (
                                <div className="hidden md:flex flex-col items-end mr-2">
                                    <div className="flex items-center gap-2">
                                        <span className={`h-2 w-2 rounded-full ${marketMeta.status === 'OPEN' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400/60'}`}></span>
                                        <span className="text-[10px] font-bold text-slate-900/60 dark:text-slate-400/60">
                                            {marketMeta.status === 'OPEN' ? 'Market open' : 'Market closed'}
                                        </span>
                                    </div>
                                    <span className="text-xs font-mono font-bold text-slate-900 dark:text-slate-100">
                                        {marketMeta.date}
                                    </span>
                                </div>
                            )}
                            <AlertsDropdown />

                            {(!currentUser || currentUser.username !== 'ashmi') && (
                                <Link href="/chat">
                                    <button
                                        className="p-2.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 transition-all duration-300 relative group group-hover:scale-105"
                                        title="Chat"
                                    >
                                        <MessageSquare size={18} className="group-hover:rotate-6 transition-transform" />
                                        <span className="absolute top-2 right-2 w-2 h-2 bg-purple-500 rounded-full" />
                                    </button>
                                </Link>
                            )}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <button className="flex items-center gap-3 p-1.5 pr-3 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200/50 dark:border-white/5 hover:border-black dark:hover:border-white/50 hover:bg-white dark:hover:bg-white/10 transition-all duration-500 group outline-none">
                                        <div className="h-9 w-9 rounded-xl bg-black dark:bg-white text-white dark:text-black flex items-center justify-center font-bold shadow-lg shadow-slate-900/20 group-hover:scale-105 transition-transform">
                                            {(currentUser?.username === 'admin' ? 'J' : currentUser?.username === 'ashmi' ? 'A' : 'G')}
                                        </div>
                                        <div className="flex flex-col items-start mr-1">
                                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 tracking-tight">
                                                {currentUser ? (currentUser.username === 'admin' ? 'Jugal Raj' : currentUser.username === 'ashmi' ? 'Ashmi' : currentUser.username) : 'User'}
                                            </span>
                                            {currentUser && (
                                                <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1.5 bg-emerald-500/10 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full mt-0.5 border border-emerald-500/20">
                                                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                                                    Active
                                                </span>
                                            )}
                                        </div>
                                        <ChevronDown size={14} className="text-slate-900/40 dark:text-slate-400/60 group-hover:text-black dark:group-hover:text-white transition-transform active:rotate-180" />
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-64 p-2 rounded-2xl border-white/5 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-2xl">
                                    <DropdownMenuLabel className="font-bold text-[10px] text-slate-900/60 dark:text-slate-400/60">Terminal access</DropdownMenuLabel>
                                    <DropdownMenuSeparator className="bg-slate-100 dark:bg-white/5" />
                                    <DropdownMenuItem className="cursor-pointer gap-3 p-3 rounded-xl focus:bg-blue-50 dark:focus:bg-white/5 focus:text-blue-600 dark:focus:text-blue-400 transition-all group" onClick={() => setIsSettingsOpen(true)}>
                                        <div className="p-2 rounded-lg bg-slate-100 dark:bg-white/5 group-hover:bg-blue-100 dark:group-hover:bg-blue-500/20 transition-colors">
                                            <Settings size={16} />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold">Preferences</span>
                                            <span className="text-[10px] opacity-60">Control terminal interface</span>
                                        </div>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator className="bg-slate-100 dark:bg-white/5" />
                                    <DropdownMenuItem
                                        onClick={handleLogout}
                                        className="cursor-pointer gap-3 p-3 rounded-xl text-rose-600 dark:text-rose-400 focus:bg-rose-50 dark:focus:bg-rose-500/10 focus:text-rose-700 dark:focus:text-rose-300 transition-all group"
                                    >
                                        <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-500/10 group-hover:bg-rose-100 dark:group-hover:bg-rose-500/20 transition-colors">
                                            <LogOut size={16} />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold">Sign Out</span>
                                            <span className="text-[10px] opacity-60">End terminal session</span>
                                        </div>
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </header>
                )}

                <div className={`${noPadding ? '' : 'p-8'} ${!hideHeader ? 'pt-[90px]' : ''} relative z-0`}>
                    {children}
                </div>
            </main >
            {!isChatPage && <ChatSidebar isPinned={isChatPinned} onPinToggle={() => setIsChatPinned(!isChatPinned)} hideFloatingButton={true} />}

            <SettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
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
