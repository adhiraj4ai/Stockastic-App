'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { Search, TrendingUp, Sparkles } from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { traderPrompt, resolveOmniboxIntent, type OmniboxCompany } from '@/lib/homeHero';

export function TickerLanding() {
    const router = useRouter();
    const [search, setSearch] = useState('');
    const [companies, setCompanies] = useState<OmniboxCompany[]>([]);
    const [portfolioSymbols, setPortfolioSymbols] = useState<string[]>([]);
    const [randomSymbols, setRandomSymbols] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [focused, setFocused] = useState(false);
    const [highlighted, setHighlighted] = useState(-1);
    const [user, setUser] = useState<{
        username: string,
        nickname?: string,
        first_name?: string,
        last_name?: string,
        profile_picture?: string,
        permissions?: any
    } | null>(null);
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

    const getDisplayName = () => {
        if (!user) return '';
        if (user.nickname) return user.nickname;
        const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
        if (fullName) return fullName;
        return user.username;
    };

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return "Good morning";
        if (hour < 17) return "Good afternoon";
        return "Good evening";
    };

    const canChat = !!user && (user.permissions === 'all' || user.permissions?.chat === true);

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

    // Reset keyboard highlight whenever the result set changes
    useEffect(() => {
        setHighlighted(-1);
    }, [search, companies.length]);

    const go = (symbol: string) => router.push(`/ticker/${symbol}`);
    const ask = (q: string) => router.push(`/chat?q=${encodeURIComponent(q)}`);

    const showAiRow = canChat && search.trim().length > 0;
    const rowCount = companies.length + (showAiRow ? 1 : 0);
    const showDropdown = focused && rowCount > 0 && search.length > 0;

    const submit = () => {
        // A highlighted row wins over the heuristic
        if (highlighted >= 0 && highlighted < companies.length) {
            go(companies[highlighted].symbol);
            return;
        }
        if (showAiRow && highlighted === companies.length) {
            ask(search.trim());
            return;
        }
        const intent = resolveOmniboxIntent(search, companies, canChat);
        if (!intent) return;
        if (intent.type === 'chat') ask(intent.q);
        else go(intent.symbol);
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown' && rowCount > 0) {
            e.preventDefault();
            setHighlighted(h => (h + 1) % rowCount);
        } else if (e.key === 'ArrowUp' && rowCount > 0) {
            e.preventDefault();
            setHighlighted(h => (h - 1 + rowCount) % rowCount);
        } else if (e.key === 'Enter') {
            submit();
        } else if (e.key === 'Escape') {
            inputRef.current?.blur();
        }
    };

    const displaySymbols = portfolioSymbols.length > 0 ? portfolioSymbols : randomSymbols;
    const displayLabel = portfolioSymbols.length > 0 ? 'Your Portfolio' : 'Discover';

    return (
        <DashboardLayout title="Home" subtitle="Ticker Intelligence">
            <div className="min-h-[calc(100vh-130px)] flex flex-col items-center justify-center px-4">
                {/* Greeting */}
                <div className="mb-10 text-center animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                        {getGreeting()}{getDisplayName() ? `, ${getDisplayName()}` : ''}.
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        {traderPrompt(new Date())}
                    </p>
                </div>

                {/* Omnibox */}
                <div className="w-full max-w-xl relative">
                    <div className={cn(
                        "flex items-center gap-3 bg-white dark:bg-card border rounded-2xl px-5 py-3.5 transition-all duration-200",
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
                            onKeyDown={onKeyDown}
                            placeholder={canChat ? "Ask anything or type a symbol…" : "Search symbol or company…"}
                            className="flex-1 bg-transparent outline-none text-sm font-semibold text-slate-900 dark:text-slate-100 placeholder:text-slate-300 dark:placeholder:text-slate-700"
                        />
                        {loading && (
                            <div className="w-3.5 h-3.5 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin shrink-0" />
                        )}
                    </div>

                    {/* Hint */}
                    {canChat && !showDropdown && (
                        <p className="mt-2 text-center text-[11px] text-slate-400 dark:text-slate-600">
                            “ADBL” opens the ticker · “should I buy ADBL?” asks the AI
                        </p>
                    )}

                    {/* Dropdown */}
                    {showDropdown && (
                        <div className="absolute top-[calc(100%+8px)] left-0 right-0 bg-white dark:bg-card border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                            {companies.map((c, i) => (
                                <button
                                    key={c.symbol}
                                    onMouseDown={() => go(c.symbol)}
                                    onMouseEnter={() => setHighlighted(i)}
                                    className={cn(
                                        "w-full flex items-center gap-3.5 px-4 py-3 text-left transition-colors",
                                        i !== 0 && "border-t border-border dark:border-slate-800/60",
                                        highlighted === i
                                            ? "bg-slate-50 dark:bg-slate-800"
                                            : "hover:bg-slate-50 dark:hover:bg-slate-800"
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
                            {showAiRow && (
                                <button
                                    onMouseDown={() => ask(search.trim())}
                                    onMouseEnter={() => setHighlighted(companies.length)}
                                    className={cn(
                                        "w-full flex items-center gap-3.5 px-4 py-3 text-left transition-colors",
                                        companies.length > 0 && "border-t border-border dark:border-slate-800/60",
                                        highlighted === companies.length
                                            ? "bg-violet-50 dark:bg-violet-900/20"
                                            : "hover:bg-violet-50 dark:hover:bg-violet-900/20"
                                    )}
                                >
                                    <div className="w-8 h-8 rounded-xl bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
                                        <Sparkles size={14} className="text-violet-600 dark:text-violet-400" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-none mb-0.5">Ask Stockastic AI</p>
                                        <p className="text-xs text-slate-400 truncate">“{search.trim()}”</p>
                                    </div>
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Quick picks / Portfolio */}
                {!focused && !search && displaySymbols.length > 0 && (
                    <div className="mt-8 flex items-center gap-3 animate-in fade-in duration-500 delay-300">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
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

export default TickerLanding;
