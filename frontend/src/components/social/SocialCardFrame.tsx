'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export type CardTheme = 'dark' | 'light';
export type CardRatio = '4:5' | '1:1' | '9:16';

export interface ThemeTokens {
    text: string;
    subtext: string;
    faint: string;
    surface: string;
    border: string;
    cardBg: string;
    exportBg: string;
    logo: string;
}

export const THEMES: Record<CardTheme, ThemeTokens> = {
    dark: {
        text: 'text-white',
        subtext: 'text-slate-400',
        faint: 'text-slate-500',
        surface: 'bg-white/5',
        border: 'border-white/10',
        cardBg: 'bg-slate-950',
        exportBg: '#020617',
        logo: '/stockastic-logo-dark.png',
    },
    light: {
        text: 'text-slate-900',
        subtext: 'text-slate-500',
        faint: 'text-slate-400',
        surface: 'bg-slate-100',
        border: 'border-slate-200',
        cardBg: 'bg-white',
        exportBg: '#ffffff',
        logo: '/stockastic-logo-v3.png',
    },
};

const RATIO_CLASSES: Record<CardRatio, string> = {
    '4:5': 'aspect-[4/5] max-w-md',
    '1:1': 'aspect-square max-w-md',
    '9:16': 'aspect-[9/16] max-w-[340px]',
};

interface SocialCardFrameProps {
    theme: CardTheme;
    ratio: CardRatio;
    captureRef: React.RefObject<HTMLDivElement | null>;
    children: React.ReactNode;
}

export function SocialCardFrame({ theme, ratio, captureRef, children }: SocialCardFrameProps) {
    const t = THEMES[theme];
    return (
        <div
            ref={captureRef}
            className={cn(
                'relative w-full mx-auto rounded-2xl overflow-hidden border p-7 flex flex-col',
                t.cardBg, t.border, RATIO_CLASSES[ratio],
            )}
        >
            {/* Brand accent glow — a gradient (not CSS blur) so html2canvas exports it faithfully */}
            <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: 'radial-gradient(circle at top right, rgba(249,115,22,0.12), transparent 55%)' }}
            />
            {theme === 'dark' && (
                <div
                    className="absolute inset-0 opacity-[0.03] pointer-events-none"
                    style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '24px 24px' }}
                />
            )}

            {/* Header */}
            <div className="flex items-center justify-between relative z-10 mb-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={t.logo} alt="Stockastic" width={100} height={40} className="object-contain h-8 w-auto" crossOrigin="anonymous" />
                <span className={cn('text-[10px] font-medium tracking-tight', t.faint)}>
                    {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
            </div>

            {/* Content */}
            <div className="relative z-10 flex-1 flex flex-col justify-center py-2 min-h-0">
                {children}
            </div>

            {/* Footer */}
            <div className={cn('relative z-10 pt-4 border-t flex items-center justify-between mt-auto', t.border)}>
                <span className={cn('text-[10px] font-bold tracking-tight', t.text)}>stockastic.market</span>
                <span className="text-[10px] font-semibold text-orange-500 tracking-wider uppercase">Market Intelligence</span>
            </div>
        </div>
    );
}
