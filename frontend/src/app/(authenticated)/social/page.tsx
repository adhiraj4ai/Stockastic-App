'use client';

import React, { useRef, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { cn } from '@/lib/utils';
import { Monitor, Square, Smartphone, Sun, Moon } from 'lucide-react';
import { SocialCardFrame, THEMES, type CardRatio, type CardTheme } from '@/components/social/SocialCardFrame';
import { ExportToolbar } from '@/components/social/ExportToolbar';
import { TEMPLATES } from '@/components/social/registry';
import { useSocialCardData } from '@/components/social/useSocialCardData';

const RATIOS: { id: CardRatio; label: string; icon: typeof Square }[] = [
    { id: '4:5', label: 'Portrait', icon: Monitor },
    { id: '1:1', label: 'Square', icon: Square },
    { id: '9:16', label: 'Story', icon: Smartphone },
];

export default function SocialPage() {
    const [selectedId, setSelectedId] = useState(TEMPLATES[0].id);
    const [ratio, setRatio] = useState<CardRatio>('4:5');
    const [theme, setTheme] = useState<CardTheme>('dark');
    const captureRef = useRef<HTMLDivElement | null>(null);

    const template = TEMPLATES.find(t => t.id === selectedId)!;
    const { data, loading } = useSocialCardData(template.needs);
    const t = THEMES[theme];
    const isLoading = loading[template.needs];

    return (
        <DashboardLayout
            title="Social Highlights"
            subtitle="Turn market data into shareable cards for X, LinkedIn, and Instagram."
        >
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* Template list */}
                <div className="lg:col-span-4 space-y-2">
                    {TEMPLATES.map(tpl => (
                        <button
                            key={tpl.id}
                            onClick={() => setSelectedId(tpl.id)}
                            className={cn(
                                'group flex items-center gap-3 p-3.5 rounded-2xl border transition-all text-left w-full',
                                selectedId === tpl.id
                                    ? 'bg-primary border-primary text-primary-foreground shadow'
                                    : 'bg-white dark:bg-card border-slate-200 dark:border-border text-slate-600 dark:text-slate-400 hover:border-primary/30',
                            )}
                        >
                            <div className={cn(
                                'p-2.5 rounded-xl transition-colors shrink-0',
                                selectedId === tpl.id ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-slate-100 dark:bg-muted text-slate-500',
                            )}>
                                <tpl.icon size={17} />
                            </div>
                            <div className="min-w-0">
                                <div className="font-bold text-sm tracking-tight">{tpl.name}</div>
                                <div className={cn('text-[10px] truncate', selectedId === tpl.id ? 'text-primary-foreground/70' : 'text-slate-500')}>{tpl.desc}</div>
                            </div>
                        </button>
                    ))}
                </div>

                {/* Preview pane */}
                <div className="lg:col-span-8 space-y-5">
                    {/* Control bar */}
                    <div className="bg-white dark:bg-card rounded-2xl border border-slate-200 dark:border-border shadow-sm px-4 py-3 flex flex-wrap items-center gap-3">
                        <div className="bg-slate-50 dark:bg-muted p-1 rounded-xl border border-border flex">
                            {RATIOS.map(r => (
                                <button
                                    key={r.id}
                                    onClick={() => setRatio(r.id)}
                                    className={cn(
                                        'px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap',
                                        ratio === r.id ? 'bg-primary text-primary-foreground shadow' : 'text-slate-400 hover:bg-accent hover:text-accent-foreground',
                                    )}
                                >
                                    <r.icon size={12} /> {r.label}
                                </button>
                            ))}
                        </div>
                        <div className="bg-slate-50 dark:bg-muted p-1 rounded-xl border border-border flex">
                            {(['dark', 'light'] as CardTheme[]).map(th => (
                                <button
                                    key={th}
                                    onClick={() => setTheme(th)}
                                    className={cn(
                                        'px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all capitalize',
                                        theme === th ? 'bg-primary text-primary-foreground shadow' : 'text-slate-400 hover:bg-accent hover:text-accent-foreground',
                                    )}
                                >
                                    {th === 'dark' ? <Moon size={12} /> : <Sun size={12} />} {th}
                                </button>
                            ))}
                        </div>
                        <span className="ml-auto text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                            Exports at 1080px
                        </span>
                    </div>

                    {/* Card preview */}
                    <SocialCardFrame theme={theme} ratio={ratio} captureRef={captureRef}>
                        {isLoading ? (
                            <div className="flex items-center justify-center h-full">
                                <p className={cn('text-xs font-medium animate-pulse', t.faint)}>Loading data…</p>
                            </div>
                        ) : (
                            <template.Component data={data} t={t} />
                        )}
                    </SocialCardFrame>

                    <ExportToolbar captureRef={captureRef} templateId={template.id} data={data} theme={theme} disabled={isLoading} />
                </div>
            </div>
        </DashboardLayout>
    );
}
