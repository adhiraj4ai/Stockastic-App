'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, TrendingUp, FileText, LogOut, Wallet, Lightbulb, Activity, ArrowLeft, MessageSquare, ChevronLeft, ChevronRight, Settings, User, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { SearchBar } from './SearchBar';
import { ChatSidebar } from './ChatSidebar';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const navItems = [
    { name: 'Dashboard', href: '/home', icon: LayoutDashboard },
    { name: 'Chat', href: '/chat', icon: MessageSquare },
    { name: 'Stocks', href: '/stock/NABIL', icon: TrendingUp },
    { name: 'Portfolio', href: '/portfolio', icon: Wallet },
    { name: 'Accumulation', href: '/accumulation', icon: Activity },
    { name: 'Strategies', href: '/strategies', icon: Lightbulb },
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

export default function DashboardLayout({ children, title, subtitle, noPadding, showBack }: { children: React.ReactNode; title?: string; subtitle?: string; noPadding?: boolean; showBack?: boolean }) {
    const pathname = usePathname();
    const router = useRouter();
    const [isChatPinned, setIsChatPinned] = useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

    const isChatPage = pathname === '/chat';

    useEffect(() => {
        setIsSidebarCollapsed(isChatPinned || isChatPage);
    }, [isChatPinned, isChatPage]);

    const toggleSidebar = () => {
        setIsSidebarCollapsed(!isSidebarCollapsed);
    };

    const handleLogout = () => {
        // Clear LocalStorage
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');

        // Clear Cookies (set expiration to past)
        document.cookie = 'access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
        document.cookie = 'refresh_token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
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
                        <h1 className="font-bold text-gray-900 text-2xl transition-all duration-300">
                            Stockastic
                        </h1>
                    )}
                    <button
                        onClick={toggleSidebar}
                        className={`p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors ${isSidebarCollapsed ? '' : ''}`}
                        title={isSidebarCollapsed ? "Expand" : "Collapse"}
                    >
                        {isSidebarCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
                    </button>
                </div>
                <nav className="flex-1 p-3 space-y-1">
                    {navItems.map((item) => {
                        const isActive = pathname.startsWith(item.href) && item.href !== '/home' || pathname === item.href;
                        return (
                            <Link
                                key={item.name}
                                href={item.href}
                                className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${isActive
                                    ? 'bg-gray-900 text-white'
                                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                                    } ${isSidebarCollapsed ? 'justify-center' : ''}`}
                                title={isSidebarCollapsed ? item.name : ''}
                            >
                                <item.icon size={18} className={isActive ? 'text-blue-400' : 'text-gray-400'} />
                                {!isSidebarCollapsed && <span className="text-sm font-medium whitespace-nowrap">{item.name}</span>}
                            </Link>
                        );
                    })}
                </nav>
                <div className="p-3 border-t border-gray-200">
                    <div className={`flex flex-col gap-1 ${isSidebarCollapsed ? 'items-center' : ''}`}>
                        <p className={`text-[10px] uppercase font-bold text-gray-400 mb-1 px-4 ${isSidebarCollapsed ? 'hidden' : ''}`}>System</p>
                        {/* Help or other items could go here */}
                    </div>
                </div>
            </aside>

            {/* Main content */}
            <main
                className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ease-in-out ${isSidebarCollapsed ? 'ml-20' : 'ml-64'
                    } ${isChatPinned && !isChatPage ? 'mr-96' : ''}`}
            >
                {/* Top Navigation Bar */}
                <header className="bg-white border-b border-gray-200 sticky top-0 z-20 px-8 py-4 flex justify-between items-center shadow-sm">
                    {/* Header content unchanged */}
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
                        <div className="flex flex-col min-w-0">
                            <h2 className="text-xl font-semibold text-gray-800 capitalize truncate">
                                {title || (pathname.includes('/stock/') ? 'Stock Details' : pathname.split('/').pop())}
                            </h2>
                            {subtitle && (
                                <p className="text-xs text-gray-500 truncate">{subtitle}</p>
                            )}
                        </div>
                    </div>

                    <div className="w-1/3 flex justify-center">
                        <SearchBar />
                    </div>

                    <div className="w-1/3 flex justify-end gap-4 items-center">
                        <div className="flex flex-col items-end mr-2">
                            <span className="text-sm font-semibold text-gray-800">Hi Jugal</span>
                            <span className="text-[10px] text-green-500 font-medium flex items-center gap-1">
                                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                                Online
                            </span>
                        </div>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold border border-blue-200 shadow-sm hover:ring-2 hover:ring-blue-400 transition-all outline-none">
                                    J
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

                <div className={noPadding ? '' : 'p-8'}>
                    {children}
                </div>
            </main >
            {!isChatPage && <ChatSidebar isPinned={isChatPinned} onPinToggle={() => setIsChatPinned(!isChatPinned)} />}
        </div >
    );
}
