'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, TrendingUp, FileText, LogOut, Wallet, Lightbulb, Activity, ArrowLeft } from 'lucide-react';
import { SearchBar } from './SearchBar';

const navItems = [
    { name: 'Dashboard', href: '/home', icon: LayoutDashboard },
    { name: 'Stocks', href: '/stock/NABIL', icon: TrendingUp },
    { name: 'Portfolio', href: '/portfolio', icon: Wallet },
    { name: 'Floorsheet', href: '/floorsheet', icon: FileText },
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

export default function DashboardLayout({ children, title, noPadding, showBack }: { children: React.ReactNode; title?: string; noPadding?: boolean; showBack?: boolean }) {
    const pathname = usePathname();
    const router = useRouter();

    const handleLogout = () => {
        // Clear LocalStorage
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');

        // Clear Cookies (set expiration to past)
        document.cookie = 'access_token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
        document.cookie = 'refresh_token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';

        router.push('/login');
    };

    return (
        <div className="min-h-screen bg-gray-50 flex">
            {/* Sidebar */}
            <aside className="w-64 bg-white border-r border-gray-200 flex flex-col fixed h-full z-10">
                <div className="p-6 border-b border-gray-200">
                    <h1 className="text-2xl font-bold text-gray-900">Stockastic</h1>
                </div>
                <nav className="flex-1 p-4 space-y-2">
                    {navItems.map((item) => {
                        const isActive = pathname.startsWith(item.href) && item.href !== '/home' || pathname === item.href;
                        return (
                            <Link
                                key={item.name}
                                href={item.href}
                                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive
                                    ? 'bg-gray-900 text-white'
                                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                                    }`}
                            >
                                <item.icon size={20} className={isActive ? 'text-blue-400' : 'text-gray-400'} />
                                <span className="font-medium">{item.name}</span>
                            </Link>
                        );
                    })}
                </nav>
                <div className="p-4 border-t border-gray-200">
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 px-4 py-3 w-full rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                    >
                        <LogOut size={20} />
                        <span className="font-medium">Logout</span>
                    </button>
                </div>
            </aside>

            {/* Main content */}
            <main className="flex-1 flex flex-col ml-64 min-w-0">
                {/* Top Navigation Bar */}
                <header className="bg-white border-b border-gray-200 sticky top-0 z-10 px-8 py-4 flex justify-between items-center shadow-sm">
                    <div className="w-1/4 flex items-center gap-3">
                        {showBack && (
                            <button
                                onClick={() => router.back()}
                                className="p-1.5 rounded-full hover:bg-gray-100 text-gray-600 transition-colors"
                                title="Go Back"
                            >
                                <ArrowLeft size={20} />
                            </button>
                        )}
                        <h2 className="text-xl font-semibold text-gray-800 capitalize truncate">
                            {title || (pathname.includes('/stock/') ? 'Stock Details' : pathname.split('/').pop())}
                        </h2>
                    </div>

                    {/* Centered Search Bar */}
                    <div className="w-1/2 flex justify-center">
                        <SearchBar />
                    </div>

                    <div className="w-1/4 flex justify-end">
                        <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold border border-blue-200 shadow-sm">
                            U
                        </div>
                    </div>
                </header>

                <div className={noPadding ? '' : 'p-8'}>
                    {children}
                </div>
            </main>
        </div>
    );
}
