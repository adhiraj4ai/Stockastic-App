'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { 
    Home, LayoutDashboard, Briefcase, 
    Search, LogIn, LogOut, User,
    Menu, X, Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Cookies from 'js-cookie';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function TopNavigationBar() {
    const pathname = usePathname();
    const router = useRouter();
    const { resolvedTheme } = useTheme();
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        const token = Cookies.get('access_token');
        setIsAuthenticated(!!token);
    }, []);

    const logoSrc = mounted && resolvedTheme === 'dark' ? '/stockastic-logo-dark.png' : '/stockastic-logo-v3.png';

    const navLinks = [
        { name: 'Home', href: '/', icon: Home },
        { name: 'Dashboard', href: '/market', icon: LayoutDashboard },
        ...(isAuthenticated ? [{ name: 'Portfolio', href: '/portfolio', icon: Briefcase }] : []),
    ];

    const handleLogout = async () => {
        try {
            const { default: api } = await import('@/lib/api');
            await api.post('/api/auth/logout/');
        } catch (err) {
            console.error("Logout failed", err);
        } finally {
            Cookies.remove('access_token');
            Cookies.remove('refresh_token');
            setIsAuthenticated(false);
            router.push('/login');
        }
    };

    if (!mounted) return null;

    return (
        <nav className="fixed top-0 left-0 right-0 z-50 bg-white/70 dark:bg-[#020617]/70 backdrop-blur-2xl border-b border-slate-200/50 dark:border-white/5 transition-all duration-500">
            <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between">
                {/* Logo Section */}
                <div className="flex items-center gap-8">
                    <Link href="/" className="hover:opacity-80 transition-opacity">
                        <Image
                            src={logoSrc}
                            alt="Stockastic"
                            width={110}
                            height={80}
                            className="object-contain"
                            priority
                        />
                    </Link>

                    {/* Desktop Navigation */}
                    <div className="hidden md:flex items-center gap-1">
                        {navLinks.map((link) => {
                            const isActive = pathname === link.href;
                            return (
                                <Link 
                                    key={link.href} 
                                    href={link.href}
                                    className={cn(
                                        "px-4 py-2 rounded-xl text-sm font-bold transition-all duration-300 flex items-center gap-2",
                                        isActive 
                                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" 
                                            : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white"
                                    )}
                                >
                                    <link.icon size={16} className={isActive ? "text-emerald-500" : "opacity-60"} />
                                    {link.name}
                                </Link>
                            );
                        })}
                    </div>
                </div>

                {/* Action Section */}
                <div className="flex items-center gap-4">
                    {isAuthenticated ? (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button className="h-10 w-10 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center font-black shadow-lg hover:scale-105 transition-all duration-300 border border-slate-200/50 dark:border-white/10 uppercase">
                                    <User size={18} />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56 p-2 rounded-2xl border-slate-200 dark:border-white/5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-2xl">
                                <DropdownMenuLabel className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-3 py-2">Account</DropdownMenuLabel>
                                <DropdownMenuSeparator className="bg-slate-100 dark:bg-white/5" />
                                <DropdownMenuItem onClick={() => router.push('/portfolio')} className="cursor-pointer gap-3 p-3 rounded-xl focus:bg-emerald-50 dark:focus:bg-emerald-500/10 focus:text-emerald-600 dark:focus:text-emerald-400 transition-all">
                                    <Briefcase size={16} />
                                    <span className="text-sm font-bold">My Portfolio</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => router.push('/market')} className="cursor-pointer gap-3 p-3 rounded-xl focus:bg-blue-50 dark:focus:bg-blue-500/10 focus:text-blue-600 dark:focus:text-blue-400 transition-all">
                                    <LayoutDashboard size={16} />
                                    <span className="text-sm font-bold">Dashboard</span>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator className="bg-slate-100 dark:bg-white/5" />
                                <DropdownMenuItem onClick={handleLogout} className="cursor-pointer gap-3 p-3 rounded-xl text-rose-600 dark:text-rose-400 focus:bg-rose-50 dark:focus:bg-rose-500/10 focus:text-rose-700 dark:focus:text-rose-300 transition-all">
                                    <LogOut size={16} />
                                    <span className="text-sm font-bold">Sign Out</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    ) : (
                        <div className="flex items-center gap-3">
                            <Link href="/login">
                                <Button variant="ghost" className="rounded-xl font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">
                                    Sign In
                                </Button>
                            </Link>
                            <Link href="/login?mode=signup">
                                <Button className="rounded-xl font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/25 px-6">
                                    Get Started
                                </Button>
                            </Link>
                        </div>
                    )}
                </div>
            </div>
        </nav>
    );
}
