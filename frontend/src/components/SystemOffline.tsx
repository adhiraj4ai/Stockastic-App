'use client';

import React, { useState } from 'react';
import { WifiOff, RefreshCcw, ServerOff, Terminal } from 'lucide-react';
import api from '@/lib/api';

export default function SystemOffline() {
    const [isRetrying, setIsRetrying] = useState(false);

    const handleRetry = async () => {
        setIsRetrying(true);
        try {
            // Attempt to fetch a simple endpoint to check health
            await api.get('/api/stocks/summary/?mode=status');
            // If success, the page will naturally refresh or the event listener will pick up success in other calls
            window.location.reload();
        } catch (err) {
            console.error("System still unreachable");
            // Stay offline
        } finally {
            setTimeout(() => setIsRetrying(false), 1000);
        }
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            {/* Animated Background */}
            <div className="absolute inset-0 bg-slate-950">
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150"></div>
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/10 blur-[120px] animate-pulse"></div>
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 blur-[120px] animate-pulse delay-700"></div>
            </div>

            {/* Glass Container */}
            <div className="relative w-full max-w-lg aspect-square md:aspect-video rounded-[2.5rem] border border-white/10 bg-white/5 backdrop-blur-3xl shadow-2xl flex flex-col items-center justify-center text-center p-8 md:p-12 overflow-hidden group">
                {/* Decorative Elements */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent"></div>
                
                {/* Icon Section */}
                <div className="mb-8 relative">
                    <div className="h-24 w-24 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-700 shadow-2xl">
                        <ServerOff size={48} className="text-emerald-500 animate-pulse" />
                    </div>
                    <div className="absolute -top-4 -right-4 h-10 w-10 rounded-xl bg-slate-900 border border-white/10 flex items-center justify-center shadow-xl animate-bounce">
                        <WifiOff size={20} className="text-rose-500" />
                    </div>
                </div>

                {/* Text Content */}
                <div className="space-y-4 max-w-sm mb-10">
                    <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white leading-tight">
                        Terminal <span className="text-emerald-500">Offline</span>
                    </h1>
                    <p className="text-slate-400 text-sm md:text-base font-medium leading-relaxed">
                        The Stockastic backend is currently unreachable. We're either performing essential maintenance or there's a minor bridge failure.
                    </p>
                </div>

                {/* Action Section */}
                <div className="flex flex-col sm:flex-row items-center gap-4 w-full px-4">
                    <button
                        onClick={handleRetry}
                        disabled={isRetrying}
                        className="w-full h-14 rounded-2xl bg-white text-slate-950 font-black text-sm uppercase tracking-widest hover:bg-emerald-400 transition-all duration-300 flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50 shadow-xl shadow-emerald-500/10"
                    >
                        {isRetrying ? (
                            <RefreshCcw size={18} className="animate-spin" />
                        ) : (
                            <RefreshCcw size={18} />
                        )}
                        {isRetrying ? "Stabilizing..." : "Restore Connection"}
                    </button>
                    
                    <button 
                        onClick={() => window.location.href = '/chat'}
                        className="w-full h-14 rounded-2xl bg-white/5 border border-white/10 text-white font-bold text-sm hover:bg-white/10 transition-all duration-300 flex items-center justify-center gap-3"
                    >
                        <Terminal size={18} className="opacity-60" />
                        System Status
                    </button>
                </div>

                {/* Footer Info */}
                <div className="mt-8 pt-8 border-t border-white/5 w-full flex items-center justify-center gap-6">
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Main Node Down</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Frontend Active</span>
                    </div>
                </div>
            </div>
            
            <p className="absolute bottom-8 text-[10px] font-bold text-slate-600 uppercase tracking-[0.4em]">
                Stockastic Terminal • Intelligence Bridging Error
            </p>
        </div>
    );
}
