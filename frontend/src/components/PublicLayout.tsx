'use client';

import React from 'react';
import { TopNavigationBar } from './TopNavigationBar';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-background flex flex-col">
            <TopNavigationBar />
            <main className="flex-1 flex flex-col min-w-0 pt-16">
                {children}
            </main>
        </div>
    );
}
