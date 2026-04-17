'use client';

import React from 'react';
import { TopNavigationBar } from './TopNavigationBar';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-white dark:bg-[#020617] flex flex-col transition-colors duration-300 relative overflow-hidden">
            <TopNavigationBar />
            
            {/* Ambient Background Glows */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/5 dark:bg-slate-500/5 blur-[80px] rounded-full" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-slate-500/5 dark:bg-blue-500/5 blur-[80px] rounded-full" />
            </div>
            
            <main className="flex-1 flex flex-col min-w-0 z-10 pt-16">
                {children}
            </main>
        </div>
    );
}
