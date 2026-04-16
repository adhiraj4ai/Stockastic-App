'use client';

import React, { useState } from 'react';
import { RefreshCcw, ServerOff } from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';

export default function SystemOffline() {
    const [isRetrying, setIsRetrying] = useState(false);

    const handleRetry = async () => {
        setIsRetrying(true);
        try {
            await api.get('/api/stocks/summary/?mode=status');
            window.location.reload();
        } catch (err) {
            console.error("System still unreachable");
        } finally {
            setTimeout(() => setIsRetrying(false), 800);
        }
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950 px-6">
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10 pointer-events-none"></div>
            
            <div className="flex flex-col items-center max-w-sm text-center">
                <div className="mb-8 p-4 rounded-2xl bg-white/5 border border-white/10 text-rose-500">
                    <ServerOff size={32} />
                </div>
                
                <h1 className="text-2xl font-black text-white tracking-tight mb-2">
                    System <span className="text-rose-500">Offline</span>
                </h1>
                
                <p className="text-slate-500 text-sm font-medium mb-10 leading-relaxed">
                    Terminal connection lost. We're working to restore service.
                </p>
 
                <button
                    onClick={handleRetry}
                    disabled={isRetrying}
                    className={cn(
                        "group relative inline-flex items-center gap-3 px-8 py-3.5 rounded-full text-white text-xs font-black uppercase tracking-[0.2em] transition-all active:scale-95 disabled:opacity-80 shadow-lg",
                        isRetrying ? "bg-orange-500 shadow-orange-500/20" : "bg-rose-500 hover:bg-rose-600 shadow-rose-500/20"
                    )}
                >
                    <RefreshCcw size={14} className={isRetrying ? "animate-spin" : "group-hover:rotate-180 transition-transform duration-500"} />
                    {isRetrying ? "Retrying..." : "Reconnect"}
                </button>
            </div>
            
            <div className="absolute bottom-12 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Connection Lost</span>
            </div>
        </div>
    );
}
