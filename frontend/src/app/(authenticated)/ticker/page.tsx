'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { Search, TrendingUp } from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';

interface Company {
    symbol: string;
    name: string;
}

const QUICK_PICKS = ['NABIL', 'NICA', 'NMB', 'SCB', 'NBL'];

export default function TickerLandingPage() {
    const router = useRouter();
    const [search, setSearch] = useState('');
    const [companies, setCompanies] = useState<Company[]>([]);
    const [portfolioSymbols, setPortfolioSymbols] = useState<string[]>([]);
    const [randomSymbols, setRandomSymbols] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [focused, setFocused] = useState(false);
    const [user, setUser] = useState<{ username: string } | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Auto-focus on mount
    useEffect(() => {
        inputRef.current?.focus();

        // Fetch user
        api.get('/api/users/me/')
            .then(res => setUser(res.data))
            .catch(() => {});
        
        // Fetch portfolio symbols
        api.get('/api/stocks/portfolio/')
            .then(res => {
                const data = Array.isArray(res.data) ? res.data : (res.data.results || []);
                const symbols = Array.from(new Set(data.map((item: any) => item.ticker))) as string[];
                
                if (symbols.length > 0) {
                    setPortfolioSymbols(symbols.slice(0, 10)); // Limit to 10
                } else {
                    // If no portfolio, fetch random companies
                    api.get('/api/stocks/companies/')
                        .then(compRes => {
                            const all = Array.isArray(compRes.data) ? compRes.data : (compRes.data.results || []);
                            // Simple shuffle
                            const shuffled = [...all].sort(() => 0.5 - Math.random());
                            setRandomSymbols(shuffled.slice(0, 8).map(c => c.symbol));
                        });
                }
            })
            .catch(() => {
                // Fallback to random if portfolio fails/null
                api.get('/api/stocks/companies/')
                    .then(compRes => {
                        const all = Array.isArray(compRes.data) ? compRes.data : (compRes.data.results || []);
                        const shuffled = [...all].sort(() => 0.5 - Math.random());
                        setRandomSymbols(shuffled.slice(0, 8).map(c => c.symbol));
                    });
            });
    }, []);

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return "Good Morning";
        if (hour < 17) return "Good Afternoon";
        return "Good Evening";
    };

    useEffect(() => {
        const id = setTimeout(async () => {
            if (!search && !focused) return;
            setLoading(true);
            try {
                const res = await api.get('/api/stocks/companies/', { params: { search } });
                setCompanies(res.data.slice(0, 6));
            } catch {
                setCompanies([]);
            } finally {
                setLoading(false);
            }
        }, 250);
        return () => clearTimeout(id);
    }, [search, focused]);

    const go = (symbol: string) => router.push(`/ticker/${symbol}`);

    const showDropdown = focused && (search.length > 0 || companies.length > 0);

    const displaySymbols = portfolioSymbols.length > 0 ? portfolioSymbols : randomSymbols;
    const displayLabel = portfolioSymbols.length > 0 ? 'Your Portfolio' : 'Discover';

    return (
        <DashboardLayout hideHeader>
            <div className="min-h-screen flex flex-col items-center justify-center px-4">
                {/* Wordmark & Greeting */}
                <div className="mb-14 text-center">
                    {user && (
                        <div className="mb-4 animate-in fade-in slide-in-from-bottom-2 duration-700">
                            <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-[0.2em]">
                                {getGreeting()}, {user.username}
                            </span>
                        </div>
                    )}
                    <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white">
                        Ticker <span className="text-emerald-500">Search</span>
                    </h1>
                    <p className="mt-2 text-sm text-slate-400 dark:text-slate-500">
                        Enter a symbol to load the full intelligence view
                    </p>
                </div>

                {/* Search */}
                <div className="w-full max-w-md relative">
                    <div className={cn(
                        "flex items-center gap-3 bg-white dark:bg-slate-900 border rounded-2xl px-5 py-3.5 transition-all duration-200",
                        focused
                            ? "border-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.08)]"
                            : "border-slate-200 dark:border-slate-800 shadow-sm"
                    )}>
                        <Search size={16} className={cn("shrink-0 transition-colors", focused ? "text-emerald-500" : "text-slate-400")} />
                        <input
                            ref={inputRef}
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            onFocus={() => setFocused(true)}
                            onBlur={() => setTimeout(() => setFocused(false), 150)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && search.trim()) {
                                    // If there's an exact match or first result, navigate there
                                    const match = companies.find(c => c.symbol.toLowerCase() === search.toLowerCase());
                                    go(match?.symbol || companies[0]?.symbol || search.toUpperCase());
                                }
                            }}
                            placeholder="Search symbol or company…"
                            className="flex-1 bg-transparent outline-none text-sm font-semibold text-slate-900 dark:text-slate-100 placeholder:text-slate-300 dark:placeholder:text-slate-700"
                        />
                        {loading && (
                            <div className="w-3.5 h-3.5 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin shrink-0" />
                        )}
                    </div>

                    {/* Dropdown */}
                    {showDropdown && companies.length > 0 && (
                        <div className="absolute top-[calc(100%+8px)] left-0 right-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                            {companies.map((c, i) => (
                                <button
                                    key={c.symbol}
                                    onMouseDown={() => go(c.symbol)}
                                    className={cn(
                                        "w-full flex items-center gap-3.5 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors",
                                        i !== 0 && "border-t border-slate-100 dark:border-slate-800/60"
                                    )}
                                >
                                    <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                                        <TrendingUp size={14} className="text-emerald-600 dark:text-emerald-400" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-none mb-0.5">{c.symbol}</p>
                                        <p className="text-xs text-slate-400 truncate">{c.name}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Quick picks / Portfolio */}
                {!focused && !search && displaySymbols.length > 0 && (
                    <div className="mt-8 flex items-center gap-3 animate-in fade-in duration-500 delay-300">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            {displayLabel}
                        </span>
                        <div className="flex flex-wrap gap-2">
                            {displaySymbols.map(s => (
                                <button
                                    key={s}
                                    onClick={() => go(s)}
                                    className="px-3 py-1 rounded-full text-xs font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </DashboardLayout>
    );
}
