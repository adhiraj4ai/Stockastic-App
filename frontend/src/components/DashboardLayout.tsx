'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { LayoutDashboard, TrendingUp, FileText, LogOut, Wallet, Lightbulb, Activity, ArrowLeft, MessageSquare, ChevronLeft, ChevronRight, Settings, User, PanelLeftClose, PanelLeftOpen, ChevronDown, Bell, Home, Target, Briefcase, Eye, Flame, Users, BarChart3, History, Star, TrendingDown, Brain } from 'lucide-react';
import { SearchBar } from './SearchBar';
import { ChatSidebar } from './ChatSidebar';
import { AlertsDropdown } from './AlertsDropdown';
import { SymbolSelector } from './SymbolSelector';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Cookies from 'js-cookie';

const navItems = [
    { name: 'Home', href: '/home', icon: Home },
    { name: 'Chat', href: '/chat', icon: MessageSquare },
    { name: 'Stocks', href: '/stock/NABIL', icon: TrendingUp },
    {
        name: 'Finfolio',
        icon: Wallet,
        subItems: [
            { name: 'My Portfolio', href: '/portfolio?tab=holdings', icon: Briefcase },
            { name: 'Watchlist', href: '/portfolio?tab=watchlist', icon: Eye },
        ]
    },
    {
        name: 'Accumulation',
        icon: Activity,
        subItems: [
            { name: 'Accumulation Overview', href: '/accumulation?tab=overview', icon: LayoutDashboard },
            { name: 'Aggressive Patterns', href: '/accumulation?tab=aggressive', icon: Flame },
            { name: 'Aggressive Trader', href: '/accumulation?tab=aggressive-trader', icon: TrendingDown },
            { name: 'Broker Trends', href: '/accumulation?tab=trends', icon: BarChart3 },
            { name: 'Accumulation History', href: '/accumulation?tab=history', icon: History },
            { name: 'Broker Favorites', href: '/accumulation?tab=favorites', icon: Star },
            { name: 'Accumulators', href: '/accumulation?tab=accumulators', icon: Users },
        ]
    },
    { name: 'Financials', href: '/financials', icon: FileText },
    { name: 'Strategies', href: '/strategies', icon: Lightbulb },
    { name: 'Signals', href: '/signals', icon: Target },
    // { name: 'Forecasts', href: '/forecasts', icon: Brain },
    { name: 'Recommendations', href: '/recommendations', icon: Target },
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
    headerContent
}: {
    children: React.ReactNode;
    title?: React.ReactNode;
    subtitle?: string;
    noPadding?: boolean;
    showBack?: boolean;
    hideHeader?: boolean;
    headerContent?: React.ReactNode;
}) {
    const pathname = usePathname();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isChatPinned, setIsChatPinned] = useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [expandedMenus, setExpandedMenus] = useState<string[]>([]);
    const [currentUser, setCurrentUser] = useState<{ id: number; username: string; email: string } | null>(null);

    const isChatPage = pathname === '/chat';

    useEffect(() => {
        // Fetch current user
        import('@/lib/api').then(({ default: api }) => {
            api.get('/api/users/me/')
                .then(res => setCurrentUser(res.data))
                .catch(err => console.error("Failed to load user profile", err));
        });
    }, []);

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
        <div className="min-h-screen bg-gray-50 flex">
            {/* Sidebar (unchanged) */}
            <aside
                // ... same aside code ...
                className={`bg-white border-r border-gray-200 flex flex-col fixed h-full z-10 transition-all duration-300 ${isSidebarCollapsed ? 'w-20' : 'w-64'
                    }`}
            >
                <div className={`p-4 border-b border-gray-200 flex items-center justify-between ${isSidebarCollapsed ? 'flex-col gap-4' : ''}`}>
                    {!isSidebarCollapsed && (
                        <div className="w-full flex justify-center py-0">
                            <Link href="/home">
                                <Image
                                    src="/stockastic-logo-v3.png"
                                    alt="Stockastic Logo"
                                    width={144}
                                    height={108}
                                    className="object-contain"
                                    priority
                                />
                            </Link>
                        </div>
                    )}
                    <button
                        onClick={toggleSidebar}
                        className={`p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors ${isSidebarCollapsed ? '' : ''}`}
                        title={isSidebarCollapsed ? "Expand" : "Collapse"}
                    >
                        {isSidebarCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
                    </button>
                </div>
                <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
                    {filteredNavItems.map((item) => {
                        const hasSubItems = 'subItems' in item && item.subItems && item.subItems.length > 0;
                        const isExpanded = expandedMenus.includes(item.name);
                        const isActive = 'href' in item && item.href ? (pathname.startsWith(item.href) && item.href !== '/home' || pathname === item.href) : false;

                        return (
                            <div
                                key={item.name}
                                className="space-y-1"
                            >
                                {hasSubItems ? (
                                    <button
                                        onClick={() => toggleMenu(item.name)}
                                        className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-colors text-gray-600 hover:bg-gray-100 hover:text-gray-900 ${isSidebarCollapsed ? 'justify-center' : 'justify-between'}`}
                                        title={isSidebarCollapsed ? item.name : ''}
                                    >
                                        <div className="flex items-center gap-3">
                                            <item.icon size={18} className={
                                                item.name === 'Home' ? 'text-blue-500' :
                                                    item.name === 'Chat' ? 'text-purple-500' :
                                                        item.name === 'Stocks' ? 'text-green-500' :
                                                            item.name === 'Finfolio' ? 'text-emerald-500' :
                                                                item.name === 'Accumulation' ? 'text-orange-500' :
                                                                    item.name === 'Financials' ? 'text-cyan-500' :
                                                                        item.name === 'Strategies' ? 'text-yellow-500' :
                                                                            item.name === 'Forecasts' ? 'text-pink-500' :
                                                                                item.name === 'Recommendations' ? 'text-red-500' :
                                                                                    item.name === 'Pipeline' ? 'text-gray-500' :
                                                                                        'text-gray-400'
                                            } />
                                            {!isSidebarCollapsed && <span className="text-sm font-medium whitespace-nowrap">{item.name}</span>}
                                        </div>
                                        {!isSidebarCollapsed && (
                                            isExpanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />
                                        )}
                                    </button>
                                ) : (
                                    <Link
                                        href={('href' in item ? item.href : '#') as string}
                                        className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${isActive
                                            ? 'bg-gray-900 text-white shadow-md'
                                            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                                            } ${isSidebarCollapsed ? 'justify-center' : ''}`}
                                        title={isSidebarCollapsed ? item.name : ''}
                                    >
                                        <item.icon size={18} className={
                                            isActive ? 'text-white' :
                                                item.name === 'Home' ? 'text-blue-500' :
                                                    item.name === 'Chat' ? 'text-purple-500' :
                                                        item.name === 'Stocks' ? 'text-green-500' :
                                                            item.name === 'Financials' ? 'text-cyan-500' :
                                                                item.name === 'Strategies' ? 'text-yellow-500' :
                                                                    item.name === 'Forecasts' ? 'text-pink-500' :
                                                                        item.name === 'Recommendations' ? 'text-red-500' :
                                                                            item.name === 'Pipeline' ? 'text-gray-500' :
                                                                                'text-gray-400'
                                        } />
                                        {!isSidebarCollapsed && <span className="text-sm font-medium whitespace-nowrap">{item.name}</span>}
                                    </Link>
                                )}

                                {/* Render Sub-items */}
                                {hasSubItems && isExpanded && !isSidebarCollapsed && (
                                    <div className="ml-9 space-y-1 animate-in slide-in-from-left-2 duration-200">
                                        {(item as any).subItems.map((subItem: any) => {
                                            const subPath = subItem.href.split('?')[0];
                                            const subTab = new URLSearchParams(subItem.href.split('?')[1]).get('tab');
                                            const currentTab = searchParams.get('tab');

                                            // Generic active logic: match path AND tab (if present)
                                            const isActiveLink = pathname === subPath && (subTab ? currentTab === subTab : true);

                                            return (
                                                <Link
                                                    key={subItem.name}
                                                    href={subItem.href}
                                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${isActiveLink
                                                        ? 'bg-blue-50 text-blue-700'
                                                        : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                                                        }`}
                                                >
                                                    {subItem.icon && <subItem.icon size={14} className={isActiveLink ? 'text-blue-600' : 'text-gray-400'} />}
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
                <div className="p-3 border-t border-gray-200">
                    <div className={`flex flex-col gap-1 ${isSidebarCollapsed ? 'items-center' : ''}`}>


                    </div>
                </div>
            </aside>

            {/* Main content */}
            <main
                className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ease-in-out ${isSidebarCollapsed ? 'ml-20' : 'ml-64'
                    } ${isChatPinned && !isChatPage ? 'mr-96' : ''}`}
            >
                {/* Top Navigation Bar */}
                {!hideHeader && (
                    <header className="bg-white border-b border-gray-200 sticky top-0 z-20 px-8 py-4 flex justify-between items-center shadow-sm">
                        {headerContent ? (
                            <div className="flex-1 mr-4">
                                {headerContent}
                            </div>
                        ) : (
                            <div className="w-1/3 flex items-center gap-3">
                                {showBack && (
                                    <button
                                        onClick={() => router.back()}
                                        className="p-1.5 rounded-full hover:bg-gray-100 text-gray-600 transition-colors"
                                        title="Go Back"
                                    >
                                        <ArrowLeft size={20} />
                                    </button>
                                )}
                                {pathname === '/signals' ? (
                                    <div className="flex flex-col min-w-0">
                                        <h2 className="text-lg font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                                            Strategy Signals Dashboard
                                        </h2>
                                        <p className="text-xs text-slate-500">Real-time trading signals from all active strategies</p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col min-w-0">
                                        <h2 className="text-xl font-semibold text-gray-800 capitalize truncate">
                                            {title || (pathname.includes('/stock/') ? 'Stock Details' : pathname.split('/').pop())}
                                        </h2>
                                        {subtitle && (
                                            <p className="text-xs text-gray-500 truncate">{subtitle}</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="w-1/3 flex justify-center">
                            {pathname.startsWith('/stock/') && (() => {
                                const currentTicker = pathname.split('/stock/')[1]?.split('/')[0];
                                return (
                                    <SymbolSelector
                                        value={currentTicker}
                                        onChange={(symbol) => router.push(`/stock/${symbol}`)}
                                    />
                                );
                            })()}
                        </div>

                        <div className="w-1/3 flex justify-end gap-4 items-center">
                            <AlertsDropdown />
                            <div className="flex flex-col items-end mr-2">
                                <span className="text-sm font-semibold text-gray-800">Hi {currentUser?.username === 'admin' ? 'Jugal' : currentUser?.username === 'ashmi' ? 'Ashmi' : 'Guest'}</span>
                                <span className="text-[10px] text-green-500 font-medium flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                                    Online
                                </span>
                            </div>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <button className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold border border-blue-200 shadow-sm hover:ring-2 hover:ring-blue-400 transition-all outline-none uppercase">
                                        {currentUser?.username?.[0] || 'G'}
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56">
                                    <DropdownMenuLabel>My Account</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="cursor-pointer gap-2">
                                        <User size={16} />
                                        <span>Profile</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem className="cursor-pointer gap-2">
                                        <Settings size={16} />
                                        <span>Settings</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        onClick={handleLogout}
                                        className="cursor-pointer gap-2 text-red-600 focus:text-red-600 focus:bg-red-50"
                                    >
                                        <LogOut size={16} />
                                        <span>Logout</span>
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </header>
                )}

                <div className={noPadding ? '' : 'p-8'}>
                    {children}
                </div>
            </main >
            {!isChatPage && <ChatSidebar isPinned={isChatPinned} onPinToggle={() => setIsChatPinned(!isChatPinned)} />}
        </div >
    );
}

export default function DashboardLayout(props: any) {
    return (
        <Suspense fallback={<div className="flex items-center justify-center min-h-screen bg-gray-50">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>}>
            <DashboardContent {...props} />
        </Suspense>
    );
}
