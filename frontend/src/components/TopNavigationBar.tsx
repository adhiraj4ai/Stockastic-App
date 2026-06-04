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

    const navLinks = isAuthenticated
        ? [{ name: 'Home', href: '/', icon: Home }]
        : [
            { name: 'Home', href: '/', icon: Home },
            { name: 'Dashboard', href: '/market', icon: LayoutDashboard },
            { name: 'Portfolio', href: '/portfolio', icon: Briefcase },
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
        <nav className="fixed top-0 left-0 right-0 z-50 bg-background border-b border-border">
            <div className="max-w-[1600px] mx-auto px-6 h-14 flex items-center justify-between">
                {/* Logo Section */}
                <div className="flex items-center gap-6">
                    <Link href="/" className="hover:opacity-80 transition-opacity">
                        <Image
                            src={logoSrc}
                            alt="Stockastic"
                            width={104}
                            height={28}
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
                                        "px-2.5 py-1.5 rounded-md text-[13px] font-medium transition-colors flex items-center gap-2",
                                        isActive
                                            ? "bg-accent text-foreground"
                                            : "text-muted-foreground hover:bg-accent hover:text-foreground"
                                    )}
                                >
                                    <link.icon size={14} />
                                    {link.name}
                                </Link>
                            );
                        })}
                    </div>
                </div>

                {/* Action Section */}
                <div className="flex items-center gap-3">
                    {isAuthenticated ? (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button className="h-8 w-8 rounded-md bg-foreground text-background flex items-center justify-center hover:opacity-90 transition-opacity">
                                    <User size={15} />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48 p-1 rounded-md">
                                <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground px-2 py-1.5">Account</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => router.push('/portfolio')} className="cursor-pointer gap-2 px-2 py-1.5 text-[13px]">
                                    <Briefcase size={14} className="text-muted-foreground" />
                                    <span>My portfolio</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => router.push('/market')} className="cursor-pointer gap-2 px-2 py-1.5 text-[13px]">
                                    <LayoutDashboard size={14} className="text-muted-foreground" />
                                    <span>Dashboard</span>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={handleLogout} className="cursor-pointer gap-2 px-2 py-1.5 text-[13px] text-destructive focus:text-destructive">
                                    <LogOut size={14} />
                                    <span>Sign out</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    ) : (
                        <div className="flex items-center gap-2">
                            <Link href="/login">
                                <Button variant="ghost" size="sm" className="text-[13px] font-medium">
                                    Sign in
                                </Button>
                            </Link>
                            <Link href="/login?mode=signup">
                                <Button size="sm" className="text-[13px] font-medium">
                                    Get started
                                </Button>
                            </Link>
                        </div>
                    )}
                </div>
            </div>
        </nav>
    );
}
