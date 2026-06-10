# Social Highlights Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/social` as a registry-driven shareable-card studio: 9 templates, 3 aspect ratios, dark/light themes, and a 5-action export toolbar (save, copy image, copy text, X intent, LinkedIn intent).

**Architecture:** A pure text-formatter module (`socialCardText.ts`), a theme/ratio-aware `SocialCardFrame`, one small content component per template, a `TEMPLATES` registry, a lazy data hook (`useSocialCardData`), and an `ExportToolbar`. The page composes them; the old 290-line `SocialPostCard.tsx` is deleted at the end.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind, lucide-react, html2canvas, sonner toasts, vitest.

**Spec:** `docs/superpowers/specs/2026-06-10-social-highlights-rework-design.md`

**Working directory:** `/Users/jugalraj/Documents/Projects/Stockastic/frontend`. All paths relative to it.

**Verified data shapes:**
- `/api/stocks/summary/` → `{market_summary: {date, total_points, points_change, percent_change, total_turnover, total_volume, advancers, decliners, advancers_percent, decliners_percent}, top_gainers[], top_losers[], top_turnover[], sector_summary[{name, change, turnover, count}], near_52_high[], near_52_low[]}`. Stock items: `{ticker, close, percent_change, turnover, sector, weeks_52_high?, weeks_52_low?}`. Same shape with `?range=weekly`.
- `/api/stocks/generated-signals/latest/` + 3 recommendation endpoints → consumed via `buildActionItems` from `@/lib/homeDigest` (already exists, returns `ActionItem {symbol, action, source, conviction, price, detail, target?, stop?}`).
- `/api/stocks/companies/accumulation/?range=1W` → array `{symbol, sector, net_qty, accumulation_ratio, close}`.
- `/api/stocks/companies/aggressive/?range=1W` → `{accumulators: [{symbol, sector, intensity, close}], distributors: []}`.
- Logo assets: `/stockastic-logo-dark.png` (dark), `/stockastic-logo-v3.png` (light).

---

### Task 1: `socialCardText` formatters (TDD)

**Files:**
- Create: `src/lib/socialCardText.ts`
- Test: `src/__tests__/unit/socialCardText.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/unit/socialCardText.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatCardText, type SocialCardData } from '@/lib/socialCardText';

const summaryPayload = {
    market_summary: {
        date: '2026-06-10', total_points: 2145.8, points_change: 25.4, percent_change: 1.2,
        total_turnover: 4_200_000_000, total_volume: 9_100_000,
        advancers: 142, decliners: 58, advancers_percent: 71, decliners_percent: 29,
    },
    top_gainers: [{ ticker: 'SHIVM', percent_change: 4.0, close: 645, turnover: 50_000_000, sector: 'Cement' }],
    top_losers: [{ ticker: 'NIFRA', percent_change: -2.2, close: 310, turnover: 30_000_000, sector: 'Finance' }],
    top_turnover: [{ ticker: 'NABIL', percent_change: 1.8, close: 512, turnover: 220_000_000, sector: 'Banks' }],
    sector_summary: [{ name: 'Hydro Power', change: 2.1, turnover: 900_000_000, count: 80 }],
    near_52_high: [{ ticker: 'NLIC', percent_change: 3.1, close: 1200, turnover: 0, sector: 'Insurance' }],
    near_52_low: [{ ticker: 'UNL', percent_change: -1.0, close: 39000, turnover: 0, sector: 'Manufacturing' }],
};

const base: SocialCardData = {
    summary: summaryPayload,
    weekly: summaryPayload,
    signals: [{ symbol: 'NABIL', action: 'BUY', source: 'Smart Money', conviction: 86, price: 512, detail: 'Gold Signal' }],
    accumulation: {
        top: [{ symbol: 'HIDCL', sector: 'Hydro', net_qty: 2_100_000, accumulation_ratio: 12, close: 220 }],
        aggressive: [{ symbol: 'UNL', sector: 'Manufacturing', intensity: 8.2, close: 39000 }],
    },
};

describe('formatCardText', () => {
    it('formats the daily summary', () => {
        const text = formatCardText('summary', base);
        expect(text).toContain('#NEPSE');
        expect(text).toContain('2145.80');
        expect(text).toContain('+25.40');
        expect(text).toContain('420.00 Cr');
        expect(text).toContain('142');
    });

    it('formats gainers, losers and turnover lists', () => {
        expect(formatCardText('gainers', base)).toContain('1. SHIVM: +4.00%');
        expect(formatCardText('losers', base)).toContain('1. NIFRA: -2.20%');
        expect(formatCardText('turnover', base)).toContain('1. NABIL: Rs. 220.0M');
    });

    it('formats sectors', () => {
        expect(formatCardText('sectors', base)).toContain('Hydro Power: +2.10%');
    });

    it('formats signals with action emoji and conviction', () => {
        const text = formatCardText('signals', base);
        expect(text).toContain('🟢 BUY NABIL');
        expect(text).toContain('86/100');
    });

    it('formats smart money and 52-week and weekly', () => {
        expect(formatCardText('smart-money', base)).toContain('HIDCL');
        const ftw = formatCardText('fifty-two-week', base);
        expect(ftw).toContain('NLIC');
        expect(ftw).toContain('UNL');
        expect(formatCardText('weekly', base)).toContain('Weekly');
    });

    it('returns empty string when the required data is missing', () => {
        expect(formatCardText('summary', {})).toBe('');
        expect(formatCardText('signals', { signals: [] })).toBe('');
        expect(formatCardText('smart-money', {})).toBe('');
        expect(formatCardText('weekly', {})).toBe('');
        expect(formatCardText('fifty-two-week', {})).toBe('');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/jugalraj/Documents/Projects/Stockastic/frontend && npx vitest run src/__tests__/unit/socialCardText.test.ts`
Expected: FAIL — cannot resolve `@/lib/socialCardText`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/socialCardText.ts`:

```ts
import type { ActionItem } from '@/lib/homeDigest';

export type SocialTemplateId =
    | 'summary' | 'gainers' | 'losers' | 'turnover' | 'sectors'
    | 'signals' | 'smart-money' | 'fifty-two-week' | 'weekly';

export interface SocialCardData {
    summary?: any;
    weekly?: any;
    signals?: ActionItem[];
    accumulation?: { top: any[]; aggressive: any[] };
}

const HASHTAGS = '#NEPSE #Nepal #Stockastic';

const pct = (n: number) => `${n >= 0 ? '+' : ''}${Number(n).toFixed(2)}%`;

export function formatCardText(id: SocialTemplateId, data: SocialCardData): string {
    switch (id) {
        case 'summary': {
            const ms = data.summary?.market_summary;
            if (!ms) return '';
            return `🇳🇵 #NEPSE Daily Update\n\n📌 Index: ${Number(ms.total_points).toFixed(2)} (${ms.points_change >= 0 ? '+' : ''}${Number(ms.points_change).toFixed(2)}, ${Number(ms.percent_change).toFixed(2)}%)\n💰 Turnover: Rs. ${(ms.total_turnover / 10000000).toFixed(2)} Cr\n📈 Advancers: ${ms.advancers} · 📉 Decliners: ${ms.decliners}\n\n${HASHTAGS}`;
        }
        case 'gainers': {
            const list = data.summary?.top_gainers;
            if (!list?.length) return '';
            return `🔥 Top Gainers Today\n\n${list.slice(0, 5).map((s: any, i: number) => `${i + 1}. ${s.ticker}: ${pct(s.percent_change)}`).join('\n')}\n\n${HASHTAGS}`;
        }
        case 'losers': {
            const list = data.summary?.top_losers;
            if (!list?.length) return '';
            return `📉 Top Losers Today\n\n${list.slice(0, 5).map((s: any, i: number) => `${i + 1}. ${s.ticker}: ${pct(s.percent_change)}`).join('\n')}\n\n${HASHTAGS}`;
        }
        case 'turnover': {
            const list = data.summary?.top_turnover;
            if (!list?.length) return '';
            return `💰 Most Traded Today\n\n${list.slice(0, 5).map((s: any, i: number) => `${i + 1}. ${s.ticker}: Rs. ${(s.turnover / 1000000).toFixed(1)}M`).join('\n')}\n\n${HASHTAGS}`;
        }
        case 'sectors': {
            const list = data.summary?.sector_summary;
            if (!list?.length) return '';
            return `🏗️ Sector Performance\n\n${list.slice(0, 6).map((s: any) => `${s.name}: ${pct(s.change)}`).join('\n')}\n\n${HASHTAGS}`;
        }
        case 'signals': {
            const items = data.signals;
            if (!items?.length) return '';
            return `⚡ Today's Top Signals\n\n${items.slice(0, 5).map(i => `${i.action === 'BUY' ? '🟢 BUY' : '🔴 SELL'} ${i.symbol} · ${i.source} (${Math.round(i.conviction)}/100)`).join('\n')}\n\nNot financial advice.\n${HASHTAGS}`;
        }
        case 'smart-money': {
            const top = data.accumulation?.top;
            if (!top?.length) return '';
            return `🐋 Smart Money Watch · 1W\n\n${top.slice(0, 5).map((r: any) => `📥 ${r.symbol}: +${Number(r.net_qty).toLocaleString()} net shares`).join('\n')}\n\n${HASHTAGS}`;
        }
        case 'fifty-two-week': {
            const highs = data.summary?.near_52_high;
            const lows = data.summary?.near_52_low;
            if (!highs?.length && !lows?.length) return '';
            const hi = (highs ?? []).slice(0, 4).map((s: any) => s.ticker).join(', ');
            const lo = (lows ?? []).slice(0, 4).map((s: any) => s.ticker).join(', ');
            return `🎯 52-Week Watch\n\n🚀 Near 52W High: ${hi || '—'}\n🧊 Near 52W Low: ${lo || '—'}\n\n${HASHTAGS}`;
        }
        case 'weekly': {
            const ms = data.weekly?.market_summary;
            if (!ms) return '';
            const leaders = (data.weekly?.top_gainers ?? []).slice(0, 3)
                .map((s: any) => `${s.ticker} ${pct(s.percent_change)}`).join(' · ');
            return `🗓️ #NEPSE Weekly Recap\n\n📌 Index: ${Number(ms.total_points).toFixed(2)} (${pct(ms.percent_change)})\n💰 Turnover: Rs. ${(ms.total_turnover / 10000000).toFixed(2)} Cr\n🔥 Week's leaders: ${leaders || '—'}\n\n${HASHTAGS}`;
        }
    }
    return '';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/unit/socialCardText.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/jugalraj/Documents/Projects/Stockastic
git add frontend/src/lib/socialCardText.ts frontend/src/__tests__/unit/socialCardText.test.ts
git commit -m "feat(social): per-template share-text formatters"
```

---

### Task 2: `SocialCardFrame` + theme tokens

**Files:**
- Create: `src/components/social/SocialCardFrame.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/social/SocialCardFrame.tsx`:

```tsx
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
            {/* Brand accent glow */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/10 blur-[100px] -mr-32 -mt-32 pointer-events-none" />
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
```

Notes: no fake snapshot ID, no decorative social icons — per spec. The capture ref wraps the whole card.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit` — pre-existing errors live only in chat test files; no new ones.

- [ ] **Step 3: Commit**

```bash
cd /Users/jugalraj/Documents/Projects/Stockastic
git add frontend/src/components/social/SocialCardFrame.tsx
git commit -m "feat(social): theme/ratio-aware SocialCardFrame"
```

---

### Task 3: Redesigned existing templates (DailyWrap, TopList ×3, Sectors)

**Files:**
- Create: `src/components/social/templates/shared.tsx`
- Create: `src/components/social/templates/DailyWrap.tsx`
- Create: `src/components/social/templates/TopList.tsx`
- Create: `src/components/social/templates/Sectors.tsx`

- [ ] **Step 1: Create the shared helpers**

Create `src/components/social/templates/shared.tsx`:

```tsx
'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import type { ThemeTokens } from '@/components/social/SocialCardFrame';
import type { SocialCardData } from '@/lib/socialCardText';
import type { LucideIcon } from 'lucide-react';

export interface TemplateProps {
    data: SocialCardData;
    t: ThemeTokens;
}

export function SectionHead({ t, icon: Icon, title, subtitle }: {
    t: ThemeTokens; icon: LucideIcon; title: string; subtitle: string;
}) {
    return (
        <div className="flex items-center gap-3 mb-5">
            <div className="p-2 rounded-xl bg-orange-500/15 text-orange-500 border border-orange-500/20">
                <Icon size={18} />
            </div>
            <div>
                <h3 className={cn('text-lg font-bold tracking-tight leading-tight', t.text)}>{title}</h3>
                <p className={cn('text-[10px] font-medium tracking-tight', t.faint)}>{subtitle}</p>
            </div>
        </div>
    );
}

export function Row({ t, rank, label, sub, value, valueClass }: {
    t: ThemeTokens; rank?: number; label: string; sub?: string;
    value: React.ReactNode; valueClass?: string;
}) {
    return (
        <div className={cn('flex items-center justify-between px-3 py-2.5 rounded-xl border', t.surface, t.border)}>
            <div className="flex items-center gap-3 min-w-0">
                {rank !== undefined && (
                    <span className="w-5 text-center text-[11px] font-bold text-orange-500 tabular-nums shrink-0">{rank}</span>
                )}
                <div className="flex flex-col min-w-0 leading-tight">
                    <span className={cn('text-xs font-bold truncate', t.text)}>{label}</span>
                    {sub && <span className={cn('text-[9px] font-medium truncate', t.faint)}>{sub}</span>}
                </div>
            </div>
            <div className={cn('text-sm font-bold tabular-nums text-right shrink-0', valueClass ?? t.text)}>{value}</div>
        </div>
    );
}

export function EmptyState({ t }: { t: ThemeTokens }) {
    return (
        <div className="flex items-center justify-center h-full">
            <p className={cn('text-xs font-medium', t.faint)}>Data unavailable — try again later.</p>
        </div>
    );
}
```

- [ ] **Step 2: Create DailyWrap**

Create `src/components/social/templates/DailyWrap.tsx`:

```tsx
'use client';

import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState, type TemplateProps } from './shared';

export function DailyWrap({ data, t }: TemplateProps) {
    const ms = data.summary?.market_summary;
    if (!ms) return <EmptyState t={t} />;
    const isPositive = ms.points_change >= 0;

    return (
        <div className="space-y-5">
            <div className="flex justify-between items-start">
                <div className="space-y-1">
                    <span className={cn('text-[10px] font-semibold uppercase tracking-wider', t.faint)}>NEPSE Index</span>
                    <h3 className={cn('text-4xl font-bold tracking-tighter flex items-baseline gap-2', t.text)}>
                        {Number(ms.total_points).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </h3>
                    <span className={cn('text-sm font-bold tracking-tight', isPositive ? 'text-emerald-500' : 'text-rose-500')}>
                        {isPositive ? '▲' : '▼'} {Math.abs(ms.points_change).toFixed(2)} ({Number(ms.percent_change).toFixed(2)}%)
                    </span>
                </div>
                <div className={cn('p-3 rounded-2xl border', isPositive ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500', t.border)}>
                    {isPositive ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className={cn('p-4 rounded-2xl border', t.surface, t.border)}>
                    <span className={cn('text-[10px] font-medium block mb-1', t.faint)}>Turnover</span>
                    <div className={cn('text-xl font-bold tracking-tight', t.text)}>
                        Rs. {(ms.total_turnover / 10000000).toFixed(2)}<span className="text-xs ml-1 opacity-60">Cr</span>
                    </div>
                </div>
                <div className={cn('p-4 rounded-2xl border', t.surface, t.border)}>
                    <span className={cn('text-[10px] font-medium block mb-1', t.faint)}>Breadth</span>
                    <div className={cn('text-xl font-bold tracking-tight', t.text)}>
                        {(ms.advancers / (ms.advancers + ms.decliners || 1)).toFixed(2)}<span className="text-xs ml-1 opacity-60">Ratio</span>
                    </div>
                </div>
            </div>

            <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-bold tracking-tight">
                    <span className="text-emerald-500">Advancers ({ms.advancers})</span>
                    <span className="text-rose-500">Decliners ({ms.decliners})</span>
                </div>
                <div className={cn('h-2.5 w-full rounded-full flex overflow-hidden border', t.surface, t.border)}>
                    <div className="h-full bg-emerald-500 rounded-l-full" style={{ width: `${ms.advancers_percent}%` }} />
                    <div className="h-full bg-rose-500 rounded-r-full ml-auto" style={{ width: `${ms.decliners_percent}%` }} />
                </div>
            </div>
        </div>
    );
}
```

- [ ] **Step 3: Create TopList (Gainers, Losers, Turnover)**

Create `src/components/social/templates/TopList.tsx`:

```tsx
'use client';

import { TrendingUp, TrendingDown, Zap } from 'lucide-react';
import { SectionHead, Row, EmptyState, type TemplateProps } from './shared';

function ListTemplate({ data, t, listKey, title, subtitle, icon, mode }: TemplateProps & {
    listKey: 'top_gainers' | 'top_losers' | 'top_turnover';
    title: string;
    subtitle: string;
    icon: typeof TrendingUp;
    mode: 'percent' | 'turnover';
}) {
    const list = data.summary?.[listKey];
    if (!list?.length) return <EmptyState t={t} />;

    return (
        <div>
            <SectionHead t={t} icon={icon} title={title} subtitle={subtitle} />
            <div className="space-y-2">
                {list.slice(0, 5).map((stock: any, i: number) => (
                    <Row
                        key={stock.ticker}
                        t={t}
                        rank={i + 1}
                        label={stock.ticker}
                        sub={stock.sector}
                        value={mode === 'percent'
                            ? `${stock.percent_change >= 0 ? '+' : ''}${Number(stock.percent_change).toFixed(2)}%`
                            : `Rs. ${(stock.turnover / 1000000).toFixed(1)}M`}
                        valueClass={mode === 'percent'
                            ? (stock.percent_change >= 0 ? 'text-emerald-500' : 'text-rose-500')
                            : undefined}
                    />
                ))}
            </div>
        </div>
    );
}

export function Gainers(props: TemplateProps) {
    return <ListTemplate {...props} listKey="top_gainers" title="Top Gainers" subtitle="Today's performance leaders" icon={TrendingUp} mode="percent" />;
}

export function Losers(props: TemplateProps) {
    return <ListTemplate {...props} listKey="top_losers" title="Top Losers" subtitle="Biggest corrections today" icon={TrendingDown} mode="percent" />;
}

export function Turnover(props: TemplateProps) {
    return <ListTemplate {...props} listKey="top_turnover" title="Most Traded" subtitle="Highest turnover today" icon={Zap} mode="turnover" />;
}
```

- [ ] **Step 4: Create Sectors**

Create `src/components/social/templates/Sectors.tsx`:

```tsx
'use client';

import { BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SectionHead, EmptyState, type TemplateProps } from './shared';

export function Sectors({ data, t }: TemplateProps) {
    const list = data.summary?.sector_summary;
    if (!list?.length) return <EmptyState t={t} />;

    return (
        <div>
            <SectionHead t={t} icon={BarChart3} title="Sector Heatmap" subtitle="Macro market movement" />
            <div className="space-y-3">
                {list.slice(0, 6).map((sector: any) => (
                    <div key={sector.name} className="flex items-center gap-3">
                        <div className={cn('w-24 text-[10px] font-bold truncate tracking-tight', t.subtext)}>{sector.name}</div>
                        <div className={cn('flex-1 h-2 rounded-full overflow-hidden flex border', t.surface, t.border)}>
                            <div
                                className={cn('h-full rounded-full', sector.change >= 0 ? 'bg-emerald-500' : 'bg-rose-500')}
                                style={{ width: `${Math.min(100, Math.abs(sector.change) * 20)}%`, marginLeft: sector.change < 0 ? 'auto' : '0' }}
                            />
                        </div>
                        <div className={cn('w-14 text-[10px] font-bold text-right tabular-nums', sector.change >= 0 ? 'text-emerald-500' : 'text-rose-500')}>
                            {sector.change >= 0 ? '+' : ''}{Number(sector.change).toFixed(2)}%
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
```

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit` — no new errors.

```bash
cd /Users/jugalraj/Documents/Projects/Stockastic
git add frontend/src/components/social/templates/
git commit -m "feat(social): redesigned daily wrap, top lists, sectors templates"
```

---

### Task 4: New templates (Signals, SmartMoney, FiftyTwoWeek, WeeklyRecap)

**Files:**
- Create: `src/components/social/templates/Signals.tsx`
- Create: `src/components/social/templates/SmartMoney.tsx`
- Create: `src/components/social/templates/FiftyTwoWeek.tsx`
- Create: `src/components/social/templates/WeeklyRecap.tsx`

- [ ] **Step 1: Create Signals**

Create `src/components/social/templates/Signals.tsx`:

```tsx
'use client';

import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SectionHead, EmptyState, type TemplateProps } from './shared';

export function Signals({ data, t }: TemplateProps) {
    const items = data.signals;
    if (!items?.length) return <EmptyState t={t} />;

    return (
        <div>
            <SectionHead t={t} icon={Zap} title="Today's Top Signals" subtitle="Engine calls ranked by conviction" />
            <div className="space-y-2">
                {items.slice(0, 5).map(item => (
                    <div key={`${item.symbol}-${item.action}`} className={cn('flex items-center justify-between px-3 py-2.5 rounded-xl border', t.surface, t.border)}>
                        <div className="flex items-center gap-3 min-w-0">
                            <span className={cn(
                                'text-[9px] font-bold px-2 py-0.5 rounded-md shrink-0',
                                item.action === 'BUY' ? 'bg-emerald-500/15 text-emerald-500' : 'bg-rose-500/15 text-rose-500',
                            )}>
                                {item.action}
                            </span>
                            <div className="flex flex-col min-w-0 leading-tight">
                                <span className={cn('text-xs font-bold truncate', t.text)}>{item.symbol}</span>
                                <span className={cn('text-[9px] font-medium truncate', t.faint)}>{item.source}</span>
                            </div>
                        </div>
                        <div className="text-right shrink-0">
                            <span className="text-sm font-bold text-orange-500 tabular-nums">{Math.round(item.conviction)}</span>
                            <span className={cn('text-[9px]', t.faint)}> /100</span>
                        </div>
                    </div>
                ))}
            </div>
            <p className={cn('text-[8px] mt-3 text-center font-medium', t.faint)}>Not financial advice.</p>
        </div>
    );
}
```

- [ ] **Step 2: Create SmartMoney**

Create `src/components/social/templates/SmartMoney.tsx`:

```tsx
'use client';

import { Brain, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SectionHead, Row, EmptyState, type TemplateProps } from './shared';

export function SmartMoney({ data, t }: TemplateProps) {
    const top = data.accumulation?.top;
    const aggressive = data.accumulation?.aggressive;
    if (!top?.length && !aggressive?.length) return <EmptyState t={t} />;

    return (
        <div>
            <SectionHead t={t} icon={Brain} title="Smart Money Watch" subtitle="Institutional accumulation · 1W" />
            <div className="space-y-2">
                {(top ?? []).slice(0, 4).map(row => (
                    <Row
                        key={row.symbol}
                        t={t}
                        label={row.symbol}
                        sub={row.sector}
                        value={`+${Number(row.net_qty).toLocaleString()}`}
                        valueClass="text-emerald-500"
                    />
                ))}
            </div>
            {!!aggressive?.length && (
                <div className="mt-4">
                    <div className={cn('text-[9px] font-semibold uppercase tracking-wider mb-2 flex items-center gap-1', t.faint)}>
                        <Flame size={10} className="text-orange-500" /> Aggressive accumulators
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {aggressive.slice(0, 3).map(row => (
                            <span key={row.symbol} className={cn('text-[10px] font-bold px-2.5 py-1 rounded-lg border', t.surface, t.border, t.text)}>
                                {row.symbol} <span className="text-orange-500">{Number(row.intensity).toFixed(1)}%</span>
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
```

- [ ] **Step 3: Create FiftyTwoWeek**

Create `src/components/social/templates/FiftyTwoWeek.tsx`:

```tsx
'use client';

import { Target, Rocket, Snowflake } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SectionHead, Row, EmptyState, type TemplateProps } from './shared';

export function FiftyTwoWeek({ data, t }: TemplateProps) {
    const highs = data.summary?.near_52_high ?? [];
    const lows = data.summary?.near_52_low ?? [];
    if (!highs.length && !lows.length) return <EmptyState t={t} />;

    return (
        <div>
            <SectionHead t={t} icon={Target} title="52-Week Watch" subtitle="Stocks at the edges of their range" />
            <div className={cn('text-[9px] font-semibold uppercase tracking-wider mb-2 flex items-center gap-1 text-emerald-500')}>
                <Rocket size={10} /> Near 52W high
            </div>
            <div className="space-y-2">
                {highs.slice(0, 3).map((s: any) => (
                    <Row key={s.ticker} t={t} label={s.ticker} sub={s.sector}
                        value={`${s.percent_change >= 0 ? '+' : ''}${Number(s.percent_change).toFixed(2)}%`}
                        valueClass="text-emerald-500" />
                ))}
                {!highs.length && <p className={cn('text-[10px] px-1', t.faint)}>None today.</p>}
            </div>
            <div className={cn('text-[9px] font-semibold uppercase tracking-wider mt-4 mb-2 flex items-center gap-1 text-sky-500')}>
                <Snowflake size={10} /> Near 52W low
            </div>
            <div className="space-y-2">
                {lows.slice(0, 3).map((s: any) => (
                    <Row key={s.ticker} t={t} label={s.ticker} sub={s.sector}
                        value={`${s.percent_change >= 0 ? '+' : ''}${Number(s.percent_change).toFixed(2)}%`}
                        valueClass="text-rose-500" />
                ))}
                {!lows.length && <p className={cn('text-[10px] px-1', t.faint)}>None today.</p>}
            </div>
        </div>
    );
}
```

- [ ] **Step 4: Create WeeklyRecap**

Create `src/components/social/templates/WeeklyRecap.tsx`:

```tsx
'use client';

import { CalendarRange } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SectionHead, Row, EmptyState, type TemplateProps } from './shared';

export function WeeklyRecap({ data, t }: TemplateProps) {
    const ms = data.weekly?.market_summary;
    if (!ms) return <EmptyState t={t} />;
    const isPositive = ms.points_change >= 0;
    const leaders = (data.weekly?.top_gainers ?? []).slice(0, 3);
    const sectors = ([...(data.weekly?.sector_summary ?? [])]
        .sort((a: any, b: any) => b.change - a.change)).slice(0, 3);

    return (
        <div>
            <SectionHead t={t} icon={CalendarRange} title="Weekly Recap" subtitle="The week on NEPSE at a glance" />
            <div className={cn('p-4 rounded-2xl border mb-4', t.surface, t.border)}>
                <span className={cn('text-[10px] font-medium block mb-1', t.faint)}>NEPSE · weekly</span>
                <div className="flex items-baseline gap-2">
                    <span className={cn('text-2xl font-bold tracking-tight', t.text)}>
                        {Number(ms.total_points).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className={cn('text-sm font-bold', isPositive ? 'text-emerald-500' : 'text-rose-500')}>
                        {isPositive ? '+' : ''}{Number(ms.percent_change).toFixed(2)}%
                    </span>
                </div>
            </div>
            <div className={cn('text-[9px] font-semibold uppercase tracking-wider mb-2', t.faint)}>Week&apos;s leaders</div>
            <div className="space-y-2">
                {leaders.map((s: any, i: number) => (
                    <Row key={s.ticker} t={t} rank={i + 1} label={s.ticker} sub={s.sector}
                        value={`+${Number(s.percent_change).toFixed(2)}%`} valueClass="text-emerald-500" />
                ))}
            </div>
            {!!sectors.length && (
                <div className="mt-4 flex flex-wrap gap-2">
                    {sectors.map((s: any) => (
                        <span key={s.name} className={cn('text-[10px] font-bold px-2.5 py-1 rounded-lg border', t.surface, t.border, t.text)}>
                            {s.name} <span className={s.change >= 0 ? 'text-emerald-500' : 'text-rose-500'}>{s.change >= 0 ? '+' : ''}{Number(s.change).toFixed(1)}%</span>
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}
```

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit` — no new errors.

```bash
cd /Users/jugalraj/Documents/Projects/Stockastic
git add frontend/src/components/social/templates/
git commit -m "feat(social): signals, smart-money, 52-week, weekly recap templates"
```

---

### Task 5: Template registry

**Files:**
- Create: `src/components/social/registry.ts`

- [ ] **Step 1: Create the registry**

Create `src/components/social/registry.ts`:

```ts
import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
    Share2, TrendingUp, TrendingDown, Zap, BarChart3,
    Brain, Target, CalendarRange, Activity,
} from 'lucide-react';
import type { SocialTemplateId } from '@/lib/socialCardText';
import type { TemplateProps } from './templates/shared';
import { DailyWrap } from './templates/DailyWrap';
import { Gainers, Losers, Turnover } from './templates/TopList';
import { Sectors } from './templates/Sectors';
import { Signals } from './templates/Signals';
import { SmartMoney } from './templates/SmartMoney';
import { FiftyTwoWeek } from './templates/FiftyTwoWeek';
import { WeeklyRecap } from './templates/WeeklyRecap';

export type DataNeed = 'summary' | 'weekly' | 'signals' | 'accumulation';

export interface SocialTemplate {
    id: SocialTemplateId;
    name: string;
    desc: string;
    icon: LucideIcon;
    needs: DataNeed;
    Component: ComponentType<TemplateProps>;
}

export const TEMPLATES: SocialTemplate[] = [
    { id: 'summary', name: 'Daily Market Wrap', desc: 'Index, turnover, and market breadth.', icon: Share2, needs: 'summary', Component: DailyWrap },
    { id: 'signals', name: "Today's Signals", desc: 'Top engine calls ranked by conviction.', icon: Zap, needs: 'signals', Component: Signals },
    { id: 'smart-money', name: 'Smart Money', desc: 'Institutional accumulation highlights.', icon: Brain, needs: 'accumulation', Component: SmartMoney },
    { id: 'gainers', name: 'Top Gainers', desc: 'Best performing stocks today.', icon: TrendingUp, needs: 'summary', Component: Gainers },
    { id: 'losers', name: 'Top Losers', desc: 'Biggest price corrections today.', icon: TrendingDown, needs: 'summary', Component: Losers },
    { id: 'turnover', name: 'Most Traded', desc: 'Highest trading activity today.', icon: Activity, needs: 'summary', Component: Turnover },
    { id: 'fifty-two-week', name: '52-Week Watch', desc: 'Stocks near yearly highs and lows.', icon: Target, needs: 'summary', Component: FiftyTwoWeek },
    { id: 'sectors', name: 'Sector Heatmap', desc: 'How each sector performed today.', icon: BarChart3, needs: 'summary', Component: Sectors },
    { id: 'weekly', name: 'Weekly Recap', desc: "The week's index move and leaders.", icon: CalendarRange, needs: 'weekly', Component: WeeklyRecap },
];
```

- [ ] **Step 2: Type-check and commit**

Run: `npx tsc --noEmit` — no new errors.

```bash
cd /Users/jugalraj/Documents/Projects/Stockastic
git add frontend/src/components/social/registry.ts
git commit -m "feat(social): template registry"
```

---

### Task 6: `useSocialCardData` hook

**Files:**
- Create: `src/components/social/useSocialCardData.ts`

- [ ] **Step 1: Create the hook**

Create `src/components/social/useSocialCardData.ts`:

```ts
'use client';

import { useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import { buildActionItems, type RecommendationItem, type SignalEpisodeItem } from '@/lib/homeDigest';
import type { SocialCardData } from '@/lib/socialCardText';
import type { DataNeed } from './registry';

const REC_SOURCES = [
    { label: 'Broker Accumulation', url: '/api/stocks/broker-accumulation-recommendations/' },
    { label: 'Smart Crossover', url: '/api/stocks/smart-accumulated-crossover-recommendations/' },
    { label: 'Ichimoku', url: '/api/stocks/ichimoku-accumulation-recommendations/' },
];

export function useSocialCardData(need: DataNeed) {
    const [data, setData] = useState<SocialCardData>({});
    // All needs start "loading" so an unfetched template shows the loader (not a
    // flash of the empty state) on the render before its lazy fetch effect runs.
    const [loading, setLoading] = useState<Record<DataNeed, boolean>>({
        summary: true, weekly: true, signals: true, accumulation: true,
    });
    const startedRef = useRef<Record<DataNeed, boolean>>({
        summary: false, weekly: false, signals: false, accumulation: false,
    });

    useEffect(() => {
        let cancelled = false;
        if (startedRef.current[need]) return;
        startedRef.current[need] = true;
        setLoading(prev => ({ ...prev, [need]: true }));

        const finish = (patch: Partial<SocialCardData>) => {
            if (cancelled) return;
            setData(prev => ({ ...prev, ...patch }));
            setLoading(prev => ({ ...prev, [need]: false }));
        };

        if (need === 'summary') {
            api.get('/api/stocks/summary/')
                .then(res => finish({ summary: res.data }))
                .catch(() => finish({}));
        } else if (need === 'weekly') {
            api.get('/api/stocks/summary/', { params: { range: 'weekly' } })
                .then(res => finish({ weekly: res.data }))
                .catch(() => finish({}));
        } else if (need === 'signals') {
            Promise.allSettled([
                api.get('/api/stocks/generated-signals/latest/'),
                ...REC_SOURCES.map(s => api.get(s.url, { params: { sector: 'All' } })),
            ]).then(([episodesRes, ...recResults]) => {
                const episodes: SignalEpisodeItem[] =
                    episodesRes.status === 'fulfilled' && Array.isArray(episodesRes.value.data)
                        ? episodesRes.value.data : [];
                const recommendationSets = REC_SOURCES.map((s, i) => {
                    const r = recResults[i];
                    const items = r.status === 'fulfilled' && Array.isArray(r.value.data)
                        ? (r.value.data as RecommendationItem[]) : [];
                    return { label: s.label, items };
                });
                finish({ signals: buildActionItems(episodes, recommendationSets, 5) });
            });
        } else if (need === 'accumulation') {
            Promise.allSettled([
                api.get('/api/stocks/companies/accumulation/', { params: { range: '1W' } }),
                api.get('/api/stocks/companies/aggressive/', { params: { range: '1W' } }),
            ]).then(([accRes, aggRes]) => {
                const acc = accRes.status === 'fulfilled' && Array.isArray(accRes.value.data) ? accRes.value.data : [];
                const agg = aggRes.status === 'fulfilled' && Array.isArray(aggRes.value.data?.accumulators)
                    ? aggRes.value.data.accumulators : [];
                finish({
                    accumulation: {
                        top: acc.filter((r: any) => (r.net_qty ?? 0) > 0)
                            .sort((a: any, b: any) => (b.net_qty ?? 0) - (a.net_qty ?? 0)).slice(0, 5),
                        aggressive: [...agg].sort((a: any, b: any) => (b.intensity ?? 0) - (a.intensity ?? 0)).slice(0, 3),
                    },
                });
            });
        }

        return () => { cancelled = true; };
    }, [need]);

    // Always kick off summary on mount (six templates depend on it).
    useEffect(() => {
        if (startedRef.current.summary) return;
        startedRef.current.summary = true;
        let cancelled = false;
        api.get('/api/stocks/summary/')
            .then(res => { if (!cancelled) setData(prev => ({ ...prev, summary: res.data })); })
            .catch(() => undefined)
            .finally(() => { if (!cancelled) setLoading(prev => ({ ...prev, summary: false })); });
        return () => { cancelled = true; };
    }, []);

    return { data, loading };
}
```

Note: the two effects share `startedRef.summary`, so the summary is fetched exactly once whether the first selected template needs it or not.

- [ ] **Step 2: Type-check and commit**

Run: `npx tsc --noEmit` — no new errors.

```bash
cd /Users/jugalraj/Documents/Projects/Stockastic
git add frontend/src/components/social/useSocialCardData.ts
git commit -m "feat(social): lazy per-need data hook"
```

---

### Task 7: `ExportToolbar`

**Files:**
- Create: `src/components/social/ExportToolbar.tsx`

- [ ] **Step 1: Create the toolbar**

Create `src/components/social/ExportToolbar.tsx`:

```tsx
'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Download, Copy, ClipboardCopy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import html2canvas from 'html2canvas';
import { formatCardText, type SocialCardData, type SocialTemplateId } from '@/lib/socialCardText';
import { THEMES, type CardTheme } from './SocialCardFrame';

interface ExportToolbarProps {
    captureRef: React.RefObject<HTMLDivElement | null>;
    templateId: SocialTemplateId;
    data: SocialCardData;
    theme: CardTheme;
}

export function ExportToolbar({ captureRef, templateId, data, theme }: ExportToolbarProps) {
    const text = formatCardText(templateId, data);

    const renderCanvas = async () => {
        const el = captureRef.current;
        if (!el) throw new Error('Nothing to capture');
        await new Promise(resolve => setTimeout(resolve, 100));
        return html2canvas(el, {
            scale: 1080 / el.offsetWidth,
            backgroundColor: THEMES[theme].exportBg,
            useCORS: true,
            allowTaint: true,
            logging: false,
        });
    };

    const handleSave = async () => {
        const toastId = toast.loading('Generating image…');
        try {
            const canvas = await renderCanvas();
            const link = document.createElement('a');
            link.href = canvas.toDataURL('image/png');
            link.download = `stockastic-${templateId}-${new Date().toISOString().split('T')[0]}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            toast.success('Image saved.', { id: toastId });
        } catch {
            toast.error('Failed to generate image.', { id: toastId });
        }
    };

    const handleCopyImage = async () => {
        if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
            toast.error('Copying images is not supported in this browser — use Save image instead.');
            return;
        }
        const toastId = toast.loading('Copying image…');
        try {
            const canvas = await renderCanvas();
            const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            if (!blob) throw new Error('toBlob failed');
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            toast.success('Image copied — paste it into your post.', { id: toastId });
        } catch {
            toast.error('Failed to copy image.', { id: toastId });
        }
    };

    const handleCopyText = () => {
        navigator.clipboard.writeText(text);
        toast.success('Post text copied.');
    };

    const openIntent = (url: string) => window.open(url, '_blank', 'noopener,noreferrer');

    return (
        <div className="w-full max-w-md mx-auto space-y-3">
            <div className="grid grid-cols-2 gap-3">
                <Button onClick={handleSave} className="gap-2 h-11 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold">
                    <Download size={15} /> Save image
                </Button>
                <Button onClick={handleCopyImage} variant="outline" className="gap-2 h-11 rounded-xl font-semibold">
                    <ClipboardCopy size={15} /> Copy image
                </Button>
            </div>
            <div className="grid grid-cols-3 gap-3">
                <Button onClick={handleCopyText} disabled={!text} variant="outline" className="gap-2 h-10 rounded-xl text-xs font-semibold">
                    <Copy size={13} /> Copy text
                </Button>
                <Button
                    onClick={() => openIntent(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`)}
                    disabled={!text} variant="outline" className="gap-2 h-10 rounded-xl text-xs font-semibold"
                >
                    <ExternalLink size={13} /> Post on X
                </Button>
                <Button
                    onClick={() => openIntent(`https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(text)}`)}
                    disabled={!text} variant="outline" className="gap-2 h-10 rounded-xl text-xs font-semibold"
                >
                    <ExternalLink size={13} /> LinkedIn
                </Button>
            </div>
            <p className="text-[10px] text-muted-foreground text-center">
                Platforms can&apos;t accept images via web links — use <span className="font-semibold">Copy image</span> and paste it in the composer.
            </p>
        </div>
    );
}
```

- [ ] **Step 2: Type-check and commit**

Run: `npx tsc --noEmit` — no new errors.

```bash
cd /Users/jugalraj/Documents/Projects/Stockastic
git add frontend/src/components/social/ExportToolbar.tsx
git commit -m "feat(social): export toolbar with save/copy-image/text + share intents"
```

---

### Task 8: Rewrite the page; delete `SocialPostCard`

**Files:**
- Modify: `src/app/(authenticated)/social/page.tsx` (full rewrite — replace the entire file)
- Delete: `src/components/SocialPostCard.tsx`

- [ ] **Step 1: Confirm `SocialPostCard` has no other consumers**

Run: `grep -rn "SocialPostCard" src --include="*.tsx" | grep -v "components/SocialPostCard"`
Expected: only `src/app/(authenticated)/social/page.tsx`. If anything else appears, STOP and report.

- [ ] **Step 2: Replace the page**

Replace ALL of `src/app/(authenticated)/social/page.tsx` with:

```tsx
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
                                    ? 'bg-orange-500 border-orange-500 text-white shadow'
                                    : 'bg-white dark:bg-card border-slate-200 dark:border-border text-slate-600 dark:text-slate-400 hover:border-orange-500/30',
                            )}
                        >
                            <div className={cn(
                                'p-2.5 rounded-xl transition-colors shrink-0',
                                selectedId === tpl.id ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-muted text-slate-500',
                            )}>
                                <tpl.icon size={17} />
                            </div>
                            <div className="min-w-0">
                                <div className="font-bold text-sm tracking-tight">{tpl.name}</div>
                                <div className={cn('text-[10px] truncate', selectedId === tpl.id ? 'text-white/70' : 'text-slate-500')}>{tpl.desc}</div>
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
                                        ratio === r.id ? 'bg-orange-500 text-white shadow' : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
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
                                        theme === th ? 'bg-orange-500 text-white shadow' : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
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

                    <ExportToolbar captureRef={captureRef} templateId={template.id} data={data} theme={theme} />
                </div>
            </div>
        </DashboardLayout>
    );
}
```

- [ ] **Step 3: Delete the old component**

Run: `rm src/components/SocialPostCard.tsx`

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npx vitest run src/__tests__/unit/socialCardText.test.ts`
Expected: no new type errors (chat test files only); 6 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/jugalraj/Documents/Projects/Stockastic
git add "frontend/src/app/(authenticated)/social/page.tsx" frontend/src/components/SocialPostCard.tsx
git commit -m "feat(social): registry-driven social studio page; delete SocialPostCard"
```

---

### Task 9: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Unit tests**

Run: `npx vitest run`
Expected: all pass except the single pre-existing `ChatInterface.test.tsx` failure (unrelated; do not fix).

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: success. Fix only errors introduced by this rework.

- [ ] **Step 3: Docker rebuild + manual run-through**

```bash
cd /Users/jugalraj/Documents/Projects/Stockastic
docker compose build frontend && docker compose up -d frontend
```

Then on http://localhost:3000/social (hard refresh, logged in):
- All 9 templates selectable; preview renders for each (or shows the in-card "Data unavailable" state).
- Ratio toggle reshapes the card (4:5 / 1:1 / 9:16); theme toggle switches dark/light including the logo.
- Save image downloads a PNG; Copy image puts a PNG on the clipboard (Chrome); Copy text copies the formatted post; X and LinkedIn buttons open pre-filled composers.
- Signals/Smart Money/Weekly templates trigger their lazy fetches on first selection only (check the network tab).

- [ ] **Step 4: Final commit (if fixes were made)**

```bash
cd /Users/jugalraj/Documents/Projects/Stockastic
git add -A frontend/src
git commit -m "fix(social): verification fixes for social highlights rework"
```
