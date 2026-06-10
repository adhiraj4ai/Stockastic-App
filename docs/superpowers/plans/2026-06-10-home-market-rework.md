# Home & Market Page Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the authenticated home page into a personalized "Morning Briefing" cockpit (signals, recommendations, smart money, watchlist, alerts) and restructure the Market page into a top-down storyline with a tab bar that surfaces all 7 hidden subroutes.

**Architecture:** Home (`MarketPulse.tsx`) is rewritten as four independently-fetching zones, each a small component under `frontend/src/components/home/`. The Market overview page drops its duplicated fetch/sentiment/health logic in favor of the shared `useMarketData` hook (which gains market-hours-aware polling), loses the Portfolio card, and reflows into full-width storyline rows. A new `MarketTabs` client component is rendered as the first child of every `/market/*` page (NOT a nested layout.tsx — every page wraps itself in `DashboardLayout`, so a nested layout would render outside the app chrome).

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind, shadcn/ui (`Card`, `Badge`, `Tabs`), lucide-react, framer-motion, axios via `@/lib/api`, vitest for unit tests.

**Spec:** `docs/superpowers/specs/2026-06-10-home-market-rework-design.md`

**Working directory:** `/Users/jugalraj/Documents/Projects/Stockastic/frontend` unless stated otherwise. All file paths below are relative to `frontend/`.

**Verified API response shapes (consumed by new components):**
- `GET /api/stocks/generated-signals/latest/` → plain array of `{symbol, signal: 'BUY'|'SELL', source, entry_price, target_price?, stop_loss_price?, entry_strength, signal_tier?, start_date, ...}`
- `GET /api/stocks/broker-accumulation-recommendations/`, `/api/stocks/smart-accumulated-crossover-recommendations/`, `/api/stocks/ichimoku-accumulation-recommendations/` → plain arrays of `{symbol, signal: 'BUY'|'SELL', strength: 0-100, reason, close, date}`
- `GET /api/stocks/companies/accumulation/?range=1W` → plain array of `{symbol, name, sector, net_qty, accumulation_ratio, top_buyers: string[], close, rsi, roc}`
- `GET /api/stocks/companies/aggressive/?range=1W` → `{accumulators: [...], distributors: [...]}`, items `{symbol, sector, intensity, net_qty, close, producers: string[]}`
- `GET /api/stocks/companies/below_cost/?range=1M` → plain array of `{symbol, sector, broker, wac, current_ltp, discount_pct, roc, rsi}`
- `GET /api/stocks/watchlist/` → plain array of `{id, ticker, current_price?, day_change_percent?, sector?, alert_enabled, ...}`
- `GET /api/stocks/notifications/?unread=true` → plain array of `{id, title, message, type, ticker?, read, created_at}`
- `GET /api/stocks/summary/?mode=status` → `{date, status: 'OPEN'|'CLOSED', is_active: boolean}`

None of these use DRF pagination wrappers.

---

### Task 1: Signal/recommendation merge helper (`homeDigest`)

**Files:**
- Create: `src/lib/homeDigest.ts`
- Test: `src/__tests__/unit/homeDigest.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/unit/homeDigest.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildActionItems, type SignalEpisodeItem, type RecommendationItem } from '@/lib/homeDigest';

const episode = (over: Partial<SignalEpisodeItem> = {}): SignalEpisodeItem => ({
    symbol: 'NABIL',
    signal: 'BUY',
    source: 'SMART_MONEY',
    entry_price: '512.5',
    target_price: 560,
    stop_loss_price: 490,
    entry_strength: 80,
    signal_tier: 'Gold Signal',
    start_date: '2026-06-09',
    ...over,
});

const rec = (over: Partial<RecommendationItem> = {}): RecommendationItem => ({
    symbol: 'SHIVM',
    signal: 'BUY',
    strength: 70,
    reason: 'Bullish MACD',
    close: 645,
    date: '2026-06-09',
    ...over,
});

describe('buildActionItems', () => {
    it('maps episodes and recommendations into unified action items', () => {
        const items = buildActionItems([episode()], [{ label: 'Broker Accumulation', items: [rec()] }]);
        expect(items).toHaveLength(2);
        const nabil = items.find(i => i.symbol === 'NABIL')!;
        expect(nabil.action).toBe('BUY');
        expect(nabil.source).toBe('Smart Money');
        expect(nabil.conviction).toBe(80);
        expect(nabil.price).toBe(512.5);
        expect(nabil.target).toBe(560);
        expect(nabil.stop).toBe(490);
        expect(nabil.detail).toBe('Gold Signal');
        const shivm = items.find(i => i.symbol === 'SHIVM')!;
        expect(shivm.source).toBe('Broker Accumulation');
        expect(shivm.detail).toBe('Bullish MACD');
        expect(shivm.price).toBe(645);
    });

    it('dedupes same symbol+action keeping the highest conviction', () => {
        const items = buildActionItems(
            [episode({ symbol: 'NABIL', entry_strength: 60 })],
            [{ label: 'Ichimoku', items: [rec({ symbol: 'NABIL', strength: 90, reason: 'Cloud breakout' })] }]
        );
        expect(items).toHaveLength(1);
        expect(items[0].conviction).toBe(90);
        expect(items[0].source).toBe('Ichimoku');
    });

    it('keeps opposite actions on the same symbol as separate rows', () => {
        const items = buildActionItems(
            [episode({ symbol: 'NABIL', signal: 'BUY' })],
            [{ label: 'Ichimoku', items: [rec({ symbol: 'NABIL', signal: 'SELL' })] }]
        );
        expect(items).toHaveLength(2);
    });

    it('sorts by conviction descending and applies the limit', () => {
        const recs = Array.from({ length: 10 }, (_, i) =>
            rec({ symbol: `S${i}`, strength: i * 10 })
        );
        const items = buildActionItems([], [{ label: 'Broker Accumulation', items: recs }], 3);
        expect(items).toHaveLength(3);
        expect(items.map(i => i.conviction)).toEqual([90, 80, 70]);
    });

    it('returns [] for empty inputs and labels unknown episode sources verbatim', () => {
        expect(buildActionItems([], [])).toEqual([]);
        const items = buildActionItems([episode({ source: 'NEW_ENGINE' })], []);
        expect(items[0].source).toBe('NEW_ENGINE');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/jugalraj/Documents/Projects/Stockastic/frontend && npx vitest run src/__tests__/unit/homeDigest.test.ts`
Expected: FAIL — cannot resolve `@/lib/homeDigest`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/homeDigest.ts`:

```ts
export interface SignalEpisodeItem {
    symbol: string;
    signal: 'BUY' | 'SELL';
    source: string;
    entry_price: string | number;
    target_price?: number | null;
    stop_loss_price?: number | null;
    entry_strength: number;
    signal_tier?: string | null;
    start_date: string;
}

export interface RecommendationItem {
    symbol: string;
    signal: 'BUY' | 'SELL';
    strength: number;
    reason: string;
    close: number;
    date: string;
}

export interface ActionItem {
    symbol: string;
    action: 'BUY' | 'SELL';
    source: string;
    conviction: number;
    price: number | null;
    detail: string;
    target?: number | null;
    stop?: number | null;
}

const SOURCE_LABELS: Record<string, string> = {
    SMART_MONEY: 'Smart Money',
    WHALE_WATCH: 'Whale Watch',
    BROKER_ACCUMULATION: 'Broker Accumulation',
    SMART_CROSSOVER: 'Smart Crossover',
    ICHIMOKU: 'Ichimoku',
};

export function buildActionItems(
    episodes: SignalEpisodeItem[],
    recommendationSets: { label: string; items: RecommendationItem[] }[],
    limit = 8
): ActionItem[] {
    const candidates: ActionItem[] = [];

    for (const ep of episodes) {
        const price = Number(ep.entry_price);
        candidates.push({
            symbol: ep.symbol,
            action: ep.signal,
            source: SOURCE_LABELS[ep.source] ?? ep.source,
            conviction: ep.entry_strength,
            price: Number.isFinite(price) ? price : null,
            detail: ep.signal_tier ?? '',
            target: ep.target_price ?? null,
            stop: ep.stop_loss_price ?? null,
        });
    }

    for (const set of recommendationSets) {
        for (const r of set.items) {
            candidates.push({
                symbol: r.symbol,
                action: r.signal,
                source: set.label,
                conviction: r.strength,
                price: r.close ?? null,
                detail: r.reason ?? '',
            });
        }
    }

    const best = new Map<string, ActionItem>();
    for (const item of candidates) {
        const key = `${item.symbol}:${item.action}`;
        const existing = best.get(key);
        if (!existing || item.conviction > existing.conviction) best.set(key, item);
    }

    return Array.from(best.values())
        .sort((a, b) => b.conviction - a.conviction)
        .slice(0, limit);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/unit/homeDigest.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/jugalraj/Documents/Projects/Stockastic
git add frontend/src/lib/homeDigest.ts frontend/src/__tests__/unit/homeDigest.test.ts
git commit -m "feat(home): signal/recommendation merge helper for morning briefing"
```

---

### Task 2: Market-hours-aware polling in `useMarketData`

**Files:**
- Modify: `src/hooks/useMarketData.ts`

The hook currently polls `/api/stocks/summary/` every `refreshInterval` ms unconditionally. Add: fetch `?mode=status` once on mount; when the market is CLOSED, slow polling to 120s. Expose `marketStatus`.

- [ ] **Step 1: Add status state and fetch**

In `src/hooks/useMarketData.ts`, change the function signature (line 47) and add a status effect directly after the existing `useState` declarations (after line 52):

```ts
export function useMarketData(refreshInterval = 10000, closedRefreshInterval = 120000) {
    const [data, setData] = useState<MarketSummaryData | null>(null);
    const [allStocks, setAllStocks] = useState<StockData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [indexHistory, setIndexHistory] = useState<{ date: string, value: number, volume: number, turnover: number }[]>([]);
    const [marketStatus, setMarketStatus] = useState<'OPEN' | 'CLOSED' | null>(null);

    useEffect(() => {
        let cancelled = false;
        api.get('/api/stocks/summary/', { params: { mode: 'status' } })
            .then(res => {
                if (!cancelled) setMarketStatus(res.data?.status === 'OPEN' ? 'OPEN' : 'CLOSED');
            })
            .catch(() => {
                // Fail open: keep the fast refresh if status can't be determined
                if (!cancelled) setMarketStatus('OPEN');
            });
        return () => { cancelled = true; };
    }, []);

    const effectiveInterval = marketStatus === 'CLOSED'
        ? Math.max(refreshInterval, closedRefreshInterval)
        : refreshInterval;
```

- [ ] **Step 2: Use the effective interval in the polling effect**

In the same file, the main data effect (currently `useEffect(() => { ... }, [refreshInterval])`, lines 54–104) — replace both references:

1. The interval setup inside the effect:

```ts
        let interval: NodeJS.Timeout | null = null;
        if (effectiveInterval > 0) {
            interval = setInterval(fetchData, effectiveInterval);
        }
```

2. The dependency array: change `}, [refreshInterval]);` to `}, [effectiveInterval]);`

(When status resolves to CLOSED, the effect re-runs once with the slower interval — the extra immediate fetch is harmless.)

- [ ] **Step 3: Return `marketStatus`**

In the return object at the bottom of the hook (lines 161–170), add `marketStatus`:

```ts
    return {
        data,
        allStocks,
        loading,
        error,
        indexHistory,
        marketSentiment,
        marketHealth,
        indexSparkData,
        marketStatus
    };
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no NEW errors (run `git stash && npx tsc --noEmit; git stash pop` first if you need a baseline — the repo may have pre-existing errors).

- [ ] **Step 5: Commit**

```bash
cd /Users/jugalraj/Documents/Projects/Stockastic
git add frontend/src/hooks/useMarketData.ts
git commit -m "feat(market-data): market-hours-aware polling + marketStatus in useMarketData"
```

---

### Task 3: `MarketStrip` home zone

**Files:**
- Create: `src/components/home/MarketStrip.tsx`

Compact one-row market summary. Receives data from the parent (home page already runs `useMarketData`); renders its own loading/error states inline so the page never blanks.

- [ ] **Step 1: Create the component**

Create `src/components/home/MarketStrip.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { ArrowUpRight, ArrowDownRight, ChevronRight, Globe } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatNepaliNumber, formatRupees } from '@/lib/formatters';

interface MarketStripSummary {
    date: string;
    total_turnover: number;
    total_volume: number;
    total_points: number;
    points_change: number;
    percent_change: number;
    advancers: number;
    decliners: number;
}

interface MarketStripProps {
    summary: MarketStripSummary | null | undefined;
    status: 'OPEN' | 'CLOSED' | null;
    loading: boolean;
    error: string | null;
}

export function MarketStrip({ summary, status, loading, error }: MarketStripProps) {
    if (loading) {
        return <div className="surface p-4 text-sm text-muted-foreground animate-pulse">Loading market data…</div>;
    }
    if (error || !summary) {
        return (
            <div className="surface p-4 text-sm text-muted-foreground">
                Market data unavailable right now.{' '}
                <Link href="/market" className="text-primary hover:underline">Open Market Terminal</Link>
            </div>
        );
    }
    const isPositive = summary.points_change >= 0;
    return (
        <Link
            href="/market"
            className="surface p-4 flex flex-wrap items-center gap-x-8 gap-y-2 hover:bg-accent/50 transition-colors group"
        >
            <div className="flex items-center gap-2">
                <Globe size={13} className="text-muted-foreground" />
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">NEPSE</span>
                <span className="text-sm font-semibold text-foreground tabular-nums">{formatNepaliNumber(summary.total_points)}</span>
                <span className={`flex items-center gap-0.5 text-xs font-medium tabular-nums ${isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {isPositive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                    {Math.abs(summary.points_change).toFixed(2)} ({summary.percent_change.toFixed(2)}%)
                </span>
            </div>
            <div className="text-xs text-muted-foreground">
                Turnover <span className="font-mono text-foreground tabular-nums">{formatRupees(summary.total_turnover / 1000000)}M</span>
            </div>
            <div className="text-xs text-muted-foreground">
                Volume <span className="font-mono text-foreground tabular-nums">{(summary.total_volume / 1000000).toFixed(1)}M</span>
            </div>
            <div className="text-xs text-muted-foreground">
                Adv <span className="text-emerald-600 dark:text-emerald-400 font-medium tabular-nums">{summary.advancers}</span>
                {' · '}
                Dec <span className="text-rose-600 dark:text-rose-400 font-medium tabular-nums">{summary.decliners}</span>
            </div>
            <Badge variant="outline" className="font-normal text-[10px] gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${status === 'OPEN' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                {status === 'OPEN' ? 'Market Open' : 'Market Closed'}
            </Badge>
            <ChevronRight size={14} className="ml-auto text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
        </Link>
    );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/jugalraj/Documents/Projects/Stockastic
git add frontend/src/components/home/MarketStrip.tsx
git commit -m "feat(home): compact MarketStrip zone"
```

---

### Task 4: `TodaysSignals` home zone

**Files:**
- Create: `src/components/home/TodaysSignals.tsx`

Self-fetching full-width hero zone. Fetches the latest signal episodes + the three recommendation engines with `Promise.allSettled` so partial failures still render. Shows an inline error only when ALL sources fail.

- [ ] **Step 1: Create the component**

Create `src/components/home/TodaysSignals.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Zap, ArrowRight, Target, ShieldAlert } from 'lucide-react';
import api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatNepaliNumber } from '@/lib/formatters';
import { buildActionItems, type ActionItem, type RecommendationItem, type SignalEpisodeItem } from '@/lib/homeDigest';

const REC_SOURCES = [
    { label: 'Broker Accumulation', url: '/api/stocks/broker-accumulation-recommendations/' },
    { label: 'Smart Crossover', url: '/api/stocks/smart-accumulated-crossover-recommendations/' },
    { label: 'Ichimoku', url: '/api/stocks/ichimoku-accumulation-recommendations/' },
];

export function TodaysSignals() {
    const [items, setItems] = useState<ActionItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            const [episodesRes, ...recResults] = await Promise.allSettled([
                api.get('/api/stocks/generated-signals/latest/'),
                ...REC_SOURCES.map(s => api.get(s.url, { params: { sector: 'All' } })),
            ]);
            if (cancelled) return;
            const episodes: SignalEpisodeItem[] =
                episodesRes.status === 'fulfilled' && Array.isArray(episodesRes.value.data)
                    ? episodesRes.value.data
                    : [];
            const recommendationSets = REC_SOURCES.map((s, i) => {
                const r = recResults[i];
                const data = r.status === 'fulfilled' && Array.isArray(r.value.data)
                    ? (r.value.data as RecommendationItem[])
                    : [];
                return { label: s.label, items: data };
            });
            setFailed(episodesRes.status === 'rejected' && recResults.every(r => r.status === 'rejected'));
            setItems(buildActionItems(episodes, recommendationSets, 8));
            setLoading(false);
        };
        load();
        return () => { cancelled = true; };
    }, []);

    return (
        <Card className="overflow-hidden">
            <CardHeader className="px-5 py-4 border-b border-border">
                <div className="flex justify-between items-center">
                    <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <Zap size={14} className="text-muted-foreground" /> Today&apos;s Signals &amp; Recommendations
                    </CardTitle>
                    <div className="flex items-center gap-4 text-xs">
                        <Link href="/signals" className="text-muted-foreground hover:text-foreground flex items-center gap-1">
                            Signals <ArrowRight size={12} />
                        </Link>
                        <Link href="/recommendations" className="text-muted-foreground hover:text-foreground flex items-center gap-1">
                            Recommendations <ArrowRight size={12} />
                        </Link>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                {loading ? (
                    <div className="p-6 text-sm text-muted-foreground animate-pulse">Scanning engines for today&apos;s setups…</div>
                ) : failed ? (
                    <div className="p-6 text-sm text-muted-foreground flex items-center gap-2">
                        <ShieldAlert size={14} /> Couldn&apos;t load signals right now.
                    </div>
                ) : items.length === 0 ? (
                    <div className="p-8 text-center">
                        <p className="text-sm text-muted-foreground mb-2">No active signals today.</p>
                        <Link href="/strategies" className="text-xs text-primary hover:underline">
                            Build or run a strategy →
                        </Link>
                    </div>
                ) : (
                    <div className="divide-y divide-border">
                        {items.map(item => (
                            <Link
                                key={`${item.symbol}-${item.action}-${item.source}`}
                                href={`/ticker/${item.symbol}`}
                                className="flex items-center gap-4 px-5 py-3 hover:bg-accent transition-colors"
                            >
                                <Badge
                                    variant="outline"
                                    className={`w-14 justify-center font-semibold text-[10px] ${item.action === 'BUY'
                                        ? 'text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                                        : 'text-rose-600 dark:text-rose-400 border-rose-500/30'}`}
                                >
                                    {item.action}
                                </Badge>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-sm font-medium text-foreground">{item.symbol}</span>
                                        <span className="text-[11px] text-muted-foreground">{item.source}</span>
                                    </div>
                                    {item.detail && (
                                        <p className="text-[11px] text-muted-foreground truncate">{item.detail}</p>
                                    )}
                                </div>
                                {item.target != null && (
                                    <div className="hidden sm:flex items-center gap-1 text-[11px] text-muted-foreground tabular-nums">
                                        <Target size={11} /> {formatNepaliNumber(item.target)}
                                    </div>
                                )}
                                {item.price != null && (
                                    <span className="text-sm font-mono text-foreground tabular-nums">{formatNepaliNumber(item.price)}</span>
                                )}
                                <div className="w-16 text-right">
                                    <span className="text-xs font-semibold text-foreground tabular-nums">{Math.round(item.conviction)}</span>
                                    <span className="text-[10px] text-muted-foreground"> /100</span>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/jugalraj/Documents/Projects/Stockastic
git add frontend/src/components/home/TodaysSignals.tsx
git commit -m "feat(home): TodaysSignals hero zone merging engines + recommendations"
```

---

### Task 5: `SmartMoneyHighlights` home zone

**Files:**
- Create: `src/components/home/SmartMoneyHighlights.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/home/SmartMoneyHighlights.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Brain, ArrowRight, TrendingUp, Flame, ShieldAlert } from 'lucide-react';
import api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatNepaliNumber } from '@/lib/formatters';

interface AccumulationRow {
    symbol: string;
    sector: string;
    net_qty: number;
    accumulation_ratio: number;
    close: number;
}

interface AggressiveRow {
    symbol: string;
    sector: string;
    intensity: number;
    close: number;
}

interface BelowCostRow {
    symbol: string;
    broker: string;
    wac: number;
    current_ltp: number;
    discount_pct: number;
}

export function SmartMoneyHighlights() {
    const [accumulation, setAccumulation] = useState<AccumulationRow[]>([]);
    const [aggressive, setAggressive] = useState<AggressiveRow[]>([]);
    const [belowCost, setBelowCost] = useState<BelowCostRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            const [accRes, aggRes, bcRes] = await Promise.allSettled([
                api.get('/api/stocks/companies/accumulation/', { params: { range: '1W' } }),
                api.get('/api/stocks/companies/aggressive/', { params: { range: '1W' } }),
                api.get('/api/stocks/companies/below_cost/', { params: { range: '1M' } }),
            ]);
            if (cancelled) return;
            const acc: AccumulationRow[] = accRes.status === 'fulfilled' && Array.isArray(accRes.value.data) ? accRes.value.data : [];
            const agg: AggressiveRow[] = aggRes.status === 'fulfilled' && Array.isArray(aggRes.value.data?.accumulators) ? aggRes.value.data.accumulators : [];
            const bc: BelowCostRow[] = bcRes.status === 'fulfilled' && Array.isArray(bcRes.value.data) ? bcRes.value.data : [];
            setAccumulation([...acc].sort((a, b) => (b.net_qty ?? 0) - (a.net_qty ?? 0)).slice(0, 5));
            setAggressive([...agg].sort((a, b) => (b.intensity ?? 0) - (a.intensity ?? 0)).slice(0, 3));
            setBelowCost(bc.slice(0, 3));
            setFailed([accRes, aggRes, bcRes].every(r => r.status === 'rejected'));
            setLoading(false);
        };
        load();
        return () => { cancelled = true; };
    }, []);

    const Row = ({ href, left, sub, right }: { href: string; left: string; sub?: string; right: React.ReactNode }) => (
        <Link href={href} className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-accent transition-colors">
            <div className="min-w-0">
                <span className="text-xs font-medium text-foreground">{left}</span>
                {sub && <span className="ml-2 text-[10px] text-muted-foreground">{sub}</span>}
            </div>
            <div className="text-xs tabular-nums">{right}</div>
        </Link>
    );

    return (
        <Card className="h-full">
            <CardHeader className="px-5 py-4 border-b border-border">
                <div className="flex justify-between items-center">
                    <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <Brain size={14} className="text-muted-foreground" /> Smart Money Highlights
                    </CardTitle>
                    <Link href="/accumulation/dashboard" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                        Command Center <ArrowRight size={12} />
                    </Link>
                </div>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
                {loading ? (
                    <div className="text-sm text-muted-foreground animate-pulse py-4">Tracking smart money…</div>
                ) : failed ? (
                    <div className="text-sm text-muted-foreground flex items-center gap-2 py-4">
                        <ShieldAlert size={14} /> Couldn&apos;t load accumulation data.
                    </div>
                ) : (
                    <>
                        <div>
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
                                <TrendingUp size={11} /> Top net accumulation · 1W
                            </div>
                            {accumulation.length === 0 ? (
                                <p className="text-xs text-muted-foreground px-2 py-1">No accumulation detected this week.</p>
                            ) : accumulation.map(row => (
                                <Row
                                    key={row.symbol}
                                    href={`/ticker/${row.symbol}`}
                                    left={row.symbol}
                                    sub={row.sector}
                                    right={<span className="text-emerald-600 dark:text-emerald-400 font-medium">+{formatNepaliNumber(row.net_qty)}</span>}
                                />
                            ))}
                        </div>
                        <div>
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
                                <Flame size={11} /> Aggressive accumulators
                            </div>
                            {aggressive.length === 0 ? (
                                <p className="text-xs text-muted-foreground px-2 py-1">No aggressive buying detected.</p>
                            ) : aggressive.map(row => (
                                <Row
                                    key={row.symbol}
                                    href={`/ticker/${row.symbol}`}
                                    left={row.symbol}
                                    sub={row.sector}
                                    right={<span className="text-foreground">{row.intensity?.toFixed(1)}% intensity</span>}
                                />
                            ))}
                        </div>
                        <div>
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Brokers underwater (below cost)</div>
                            {belowCost.length === 0 ? (
                                <p className="text-xs text-muted-foreground px-2 py-1">None right now.</p>
                            ) : belowCost.map(row => (
                                <Row
                                    key={`${row.symbol}-${row.broker}`}
                                    href={`/ticker/${row.symbol}`}
                                    left={row.symbol}
                                    sub={`Broker ${row.broker}`}
                                    right={<span className="text-muted-foreground">LTP {formatNepaliNumber(row.current_ltp)} vs WAC {formatNepaliNumber(row.wac)}</span>}
                                />
                            ))}
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/jugalraj/Documents/Projects/Stockastic
git add frontend/src/components/home/SmartMoneyHighlights.tsx
git commit -m "feat(home): SmartMoneyHighlights zone (accumulation, aggressive, below-cost)"
```

---

### Task 6: `WatchlistAlerts` home zone

**Files:**
- Create: `src/components/home/WatchlistAlerts.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/home/WatchlistAlerts.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Eye, Bell, ArrowRight, TrendingUp, TrendingDown, ShieldAlert, Plus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatNepaliNumber } from '@/lib/formatters';

interface WatchlistRow {
    id: number;
    ticker: string;
    current_price?: number | null;
    day_change_percent?: number | null;
    sector?: string | null;
}

interface NotificationRow {
    id: number;
    title: string;
    message: string;
    type: string;
    ticker?: string | null;
    created_at: string;
}

export function WatchlistAlerts() {
    const [watchlist, setWatchlist] = useState<WatchlistRow[]>([]);
    const [alerts, setAlerts] = useState<NotificationRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            const [wlRes, ntRes] = await Promise.allSettled([
                api.get('/api/stocks/watchlist/'),
                api.get('/api/stocks/notifications/', { params: { unread: 'true' } }),
            ]);
            if (cancelled) return;
            setWatchlist(wlRes.status === 'fulfilled' && Array.isArray(wlRes.value.data) ? wlRes.value.data.slice(0, 8) : []);
            setAlerts(ntRes.status === 'fulfilled' && Array.isArray(ntRes.value.data) ? ntRes.value.data.slice(0, 5) : []);
            setFailed(wlRes.status === 'rejected' && ntRes.status === 'rejected');
            setLoading(false);
        };
        load();
        return () => { cancelled = true; };
    }, []);

    return (
        <Card className="h-full">
            <CardHeader className="px-5 py-4 border-b border-border">
                <div className="flex justify-between items-center">
                    <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <Eye size={14} className="text-muted-foreground" /> Watchlist &amp; Alerts
                    </CardTitle>
                    <div className="flex items-center gap-4 text-xs">
                        <Link href="/portfolio/watchlist" className="text-muted-foreground hover:text-foreground flex items-center gap-1">
                            Watchlist <ArrowRight size={12} />
                        </Link>
                        <Link href="/notifications" className="text-muted-foreground hover:text-foreground flex items-center gap-1">
                            Alerts <ArrowRight size={12} />
                        </Link>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
                {loading ? (
                    <div className="text-sm text-muted-foreground animate-pulse py-4">Loading your watchlist…</div>
                ) : failed ? (
                    <div className="text-sm text-muted-foreground flex items-center gap-2 py-4">
                        <ShieldAlert size={14} /> Couldn&apos;t load watchlist or alerts.
                    </div>
                ) : (
                    <>
                        <div>
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Watchlist</div>
                            {watchlist.length === 0 ? (
                                <Link
                                    href="/portfolio/watchlist"
                                    className="flex items-center gap-2 px-2 py-3 rounded-md border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                                >
                                    <Plus size={13} /> Your watchlist is empty — add tickers to track them here.
                                </Link>
                            ) : watchlist.map(row => {
                                const change = Number(row.day_change_percent ?? 0);
                                const positive = change >= 0;
                                return (
                                    <Link
                                        key={row.id}
                                        href={`/ticker/${row.ticker}`}
                                        className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-accent transition-colors"
                                    >
                                        <div className="min-w-0">
                                            <span className="text-xs font-medium text-foreground">{row.ticker}</span>
                                            {row.sector && <span className="ml-2 text-[10px] text-muted-foreground">{row.sector}</span>}
                                        </div>
                                        <div className="flex items-center gap-3 tabular-nums">
                                            {row.current_price != null && (
                                                <span className="text-xs font-mono text-foreground">{formatNepaliNumber(row.current_price)}</span>
                                            )}
                                            <span className={`flex items-center gap-0.5 text-xs font-medium w-16 justify-end ${positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                                {positive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                                                {change.toFixed(2)}%
                                            </span>
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                        <div>
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
                                <Bell size={11} /> Unread alerts
                            </div>
                            {alerts.length === 0 ? (
                                <p className="text-xs text-muted-foreground px-2 py-1">No unread alerts. You&apos;re all caught up.</p>
                            ) : alerts.map(alert => (
                                <Link
                                    key={alert.id}
                                    href={alert.ticker ? `/ticker/${alert.ticker}` : '/notifications'}
                                    className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-accent transition-colors"
                                >
                                    <span className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                                    <div className="min-w-0">
                                        <p className="text-xs text-foreground truncate">{alert.title}</p>
                                        <p className="text-[10px] text-muted-foreground">
                                            {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}
                                        </p>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/jugalraj/Documents/Projects/Stockastic
git add frontend/src/components/home/WatchlistAlerts.tsx
git commit -m "feat(home): WatchlistAlerts zone"
```

---

### Task 7: Rewrite `MarketPulse` as the Morning Briefing

**Files:**
- Modify: `src/components/MarketPulse.tsx` (full rewrite — replace the entire file)

- [ ] **Step 1: Replace the file contents**

Replace ALL of `src/components/MarketPulse.tsx` with:

```tsx
'use client';

import { useMarketData } from '@/hooks/useMarketData';
import DashboardLayout from './DashboardLayout';
import { MarketStrip } from './home/MarketStrip';
import { TodaysSignals } from './home/TodaysSignals';
import { SmartMoneyHighlights } from './home/SmartMoneyHighlights';
import { WatchlistAlerts } from './home/WatchlistAlerts';

export function MarketPulse() {
    const { data, loading, error, marketStatus } = useMarketData(10000);

    return (
        <DashboardLayout
            noPadding
            title="Morning Briefing"
            subtitle="Your day at a glance — signals, smart money, and your watchlist."
        >
            <div className="space-y-6 p-6 pt-0">
                <MarketStrip
                    summary={data?.market_summary}
                    status={marketStatus}
                    loading={loading}
                    error={error}
                />
                <TodaysSignals />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                    <SmartMoneyHighlights />
                    <WatchlistAlerts />
                </div>
            </div>
        </DashboardLayout>
    );
}
```

Notes:
- Each zone fetches and fails independently — there is intentionally NO page-level loader or page-level error return.
- `LiveMarketPulseTable`, `LiveBulkTransactions`, `SentimentGauge`, `MarketHealthRadar` imports are gone from this file. Do NOT delete those component files.

- [ ] **Step 2: Type-check and run unit tests**

Run: `npx tsc --noEmit && npx vitest run src/__tests__/unit/homeDigest.test.ts`
Expected: no new type errors; tests pass.

- [ ] **Step 3: Commit**

```bash
cd /Users/jugalraj/Documents/Projects/Stockastic
git add frontend/src/components/MarketPulse.tsx
git commit -m "feat(home): rewrite MarketPulse as Morning Briefing cockpit"
```

---

### Task 8: `MarketTabs` component

**Files:**
- Create: `src/components/MarketTabs.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/MarketTabs.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const TABS = [
    { name: 'Overview', href: '/market' },
    { name: 'Movers', href: '/market/movers' },
    { name: 'Activity', href: '/market/activity' },
    { name: 'Bulk', href: '/market/bulk' },
    { name: 'Rotation', href: '/market/rotation' },
    { name: 'Volume Profile', href: '/market/volume-profile' },
    { name: 'Screener', href: '/market/pa-screener' },
    { name: 'Matching', href: '/market/matching' },
];

export function MarketTabs({ className }: { className?: string }) {
    const pathname = usePathname();
    return (
        <nav
            className={cn(
                'flex gap-1 whitespace-nowrap border-b border-border overflow-x-auto mb-6',
                className
            )}
            aria-label="Market sections"
        >
            {TABS.map(tab => {
                const active = tab.href === '/market'
                    ? pathname === '/market'
                    : pathname.startsWith(tab.href);
                return (
                    <Link
                        key={tab.href}
                        href={tab.href}
                        className={cn(
                            'px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors',
                            active
                                ? 'border-primary text-foreground'
                                : 'border-transparent text-muted-foreground hover:text-foreground'
                        )}
                    >
                        {tab.name}
                    </Link>
                );
            })}
        </nav>
    );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/jugalraj/Documents/Projects/Stockastic
git add frontend/src/components/MarketTabs.tsx
git commit -m "feat(market): MarketTabs navigation bar for all market views"
```

---

### Task 9: Restructure the Market overview page

**Files:**
- Modify: `src/app/(authenticated)/market/page.tsx` (full rewrite — replace the entire file)

Key changes vs. the current file: uses `useMarketData` (deletes ~180 lines of duplicated fetch/sentiment/health logic), drops `PortfolioSummary` + the `/api/stocks/portfolio/` fetch, drops the Snapshot card and the Rotation `SectorGraph` (it lives on the Rotation tab), keeps the ticker ribbon + command palette, and reflows everything into full-width storyline rows.

- [ ] **Step 1: Replace the file contents**

Replace ALL of `src/app/(authenticated)/market/page.tsx` with:

```tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    TrendingUp, TrendingDown, Zap, BarChart3, Globe, ShieldAlert,
    HeartPulse, Activity as ActivityIcon, LineChart, Clock, Wallet, Lightbulb,
    MessageSquare, ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import { motion, Variants } from 'framer-motion';
import {
    CommandDialog,
    CommandInput,
    CommandList,
    CommandEmpty,
    CommandGroup,
    CommandItem
} from '@/components/ui/command';
import { PageLoader } from '@/components/ui/StockLoader';
import { MarketBubbleMap } from '@/components/MarketBubbleMap';
import { SentimentGauge } from '@/components/SentimentGauge';
import { SectorTreemap } from '@/components/SectorTreemap';
import { BrokerFlowChart } from '@/components/BrokerFlowChart';
import { MarketHealthRadar } from '@/components/MarketHealthRadar';
import { VolumeShockers } from '@/components/VolumeShockers';
import { BreakoutWatchlist } from '@/components/BreakoutWatchlist';
import { MarketBreadthTrend } from '@/components/MarketBreadthTrend';
import { InstitutionalInterest } from '@/components/InstitutionalInterest';
import { MarketTabs } from '@/components/MarketTabs';
import { useMarketData, type StockData } from '@/hooks/useMarketData';
import { formatNepaliNumber, formatRupees } from '@/lib/formatters';
import { InfoTooltip } from '@/components/ui/InfoTooltip';

const containerVariants: Variants = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: { staggerChildren: 0.1 }
    }
};

const itemVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    show: {
        opacity: 1,
        y: 0,
        transition: { type: 'spring' as const, stiffness: 100, damping: 15 }
    }
};

export default function MarketTerminalPage() {
    const { data, allStocks, loading, error, marketSentiment, marketHealth } = useMarketData(10000);
    const [recentStocks, setRecentStocks] = useState<string[]>([]);
    const [isCommandOpen, setIsCommandOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const router = useRouter();

    // Load Recently Viewed
    useEffect(() => {
        setMounted(true);
        const saved = localStorage.getItem('recent_stocks');
        if (saved) {
            try {
                setRecentStocks(JSON.parse(saved));
            } catch (e) {
                console.error('Failed to parse recent stocks', e);
            }
        }
    }, []);

    // Command Palette Keyboard Shortcut
    useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setIsCommandOpen((open) => !open);
            }
        };
        document.addEventListener('keydown', down);
        return () => document.removeEventListener('keydown', down);
    }, []);

    if (!mounted) return null;

    if (error) {
        return (
            <DashboardLayout>
                <MarketTabs />
                <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-8">
                    <ShieldAlert className="h-10 w-10 text-destructive mb-4" />
                    <div className="text-foreground text-base font-semibold mb-2">Error loading market data</div>
                    <div className="text-muted-foreground text-sm mb-6">{error}</div>
                    <button
                        onClick={() => window.location.reload()}
                        className="px-4 py-1.5 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition text-sm font-medium"
                    >
                        Retry connection
                    </button>
                </div>
            </DashboardLayout>
        );
    }

    if (loading) {
        return (
            <DashboardLayout>
                <MarketTabs />
                <div className="flex items-center justify-center min-h-[50vh]">
                    <PageLoader text="Initializing data stream..." />
                </div>
            </DashboardLayout>
        );
    }

    if (!data || !data.market_summary) {
        return (
            <DashboardLayout>
                <MarketTabs />
                <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-8">
                    <span className="text-gray-500 dark:text-gray-400">No market data available yet. Please run data ingestion.</span>
                </div>
            </DashboardLayout>
        );
    }

    const { market_summary, top_turnover, top_gainers, top_losers, sector_summary } = data;
    const isPositive = market_summary.points_change >= 0;

    const addToRecent = (ticker: string) => {
        const next = [ticker, ...recentStocks.filter(s => s !== ticker)].slice(0, 5);
        setRecentStocks(next);
        localStorage.setItem('recent_stocks', JSON.stringify(next));
    };

    const handleStockClick = (ticker: string) => {
        addToRecent(ticker);
        router.push(`/ticker/${ticker}`);
    };

    const StockRow = ({ stock }: { stock: StockData }) => {
        const isStockPositive = stock.change >= 0;
        return (
            <TableRow
                key={stock.ticker}
                className="cursor-pointer hover:bg-accent transition-colors"
                onClick={() => handleStockClick(stock.ticker)}
            >
                <TableCell className="py-2.5">
                    <div className="flex flex-col leading-tight">
                        <span className="font-medium text-foreground">{stock.ticker}</span>
                        <span className="text-[11px] text-muted-foreground">{stock.sector || 'Listed Equity'}</span>
                    </div>
                </TableCell>
                <TableCell className="text-right py-2.5 font-mono text-foreground tabular-nums">
                    {formatNepaliNumber(stock.close)}
                </TableCell>
                <TableCell className={`text-right py-2.5 font-medium tabular-nums ${isStockPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    <div className="flex flex-col items-end leading-tight">
                        <div className="flex items-center justify-end gap-1">
                            {isStockPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                            {Number(stock.percent_change).toFixed(2)}%
                        </div>
                        {stock.roc !== undefined && stock.roc !== null && (
                            <span className="text-[10px] font-mono text-muted-foreground">ROC: {stock.roc}%</span>
                        )}
                    </div>
                </TableCell>
            </TableRow>
        );
    };

    return (
        <DashboardLayout
            noPadding
            title="Market Terminal"
            subtitle="Real-time analytics and predictive insights."
        >
            {/* Ticker ribbon */}
            <div className="bg-muted/50 border-b border-border overflow-hidden py-2">
                <div className="flex animate-infinite-scroll whitespace-nowrap items-center gap-10 px-4">
                    {[0, 1].map(dup => (
                        top_gainers.concat(top_losers).slice(0, 10).map((stock, i) => (
                            <div key={`${dup}-${i}`} className="flex items-center gap-2 cursor-pointer hover:opacity-70 transition-opacity" onClick={() => router.push(`/ticker/${stock.ticker}`)}>
                                <span className="font-medium text-xs text-foreground">{stock.ticker}</span>
                                <span className="font-mono text-xs text-muted-foreground tabular-nums">{formatNepaliNumber(stock.close)}</span>
                                <span className={`text-[11px] font-medium tabular-nums ${stock.change >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                    {stock.change >= 0 ? '+' : ''}{stock.percent_change.toFixed(1)}%
                                </span>
                            </div>
                        ))
                    ))}
                </div>
            </div>

            <div className="px-6 lg:px-10 py-6 space-y-6 min-h-screen">
                <MarketTabs />

                <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="show"
                    className="space-y-6"
                >
                    {/* Row 1: Index hero */}
                    <motion.div variants={itemVariants} className="surface p-6">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-muted-foreground">
                                    <Globe size={13} />
                                    <span className="text-[11px] uppercase tracking-wider">NEPSE Index</span>
                                </div>
                                <div className="flex items-baseline gap-4">
                                    <h1 className="text-4xl font-semibold text-foreground tracking-tight tabular-nums">
                                        {formatNepaliNumber(market_summary.total_points)}
                                    </h1>
                                    <div className={`flex items-center gap-1 font-medium tabular-nums ${isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                        {isPositive ? <ArrowUpRight size={18} /> : <ArrowDownRight size={18} />}
                                        <span className="text-lg">{Math.abs(market_summary.points_change).toFixed(2)}</span>
                                        <span className="text-sm text-muted-foreground">({market_summary.percent_change.toFixed(2)}%)</span>
                                    </div>
                                </div>
                                <p className="text-xs text-muted-foreground">Session · {market_summary.date}</p>
                            </div>
                            <div className="flex items-center gap-8">
                                <div>
                                    <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-0.5">Turnover</div>
                                    <div className="text-lg font-medium text-foreground font-mono tabular-nums">{formatRupees(market_summary.total_turnover / 1000000)}M</div>
                                </div>
                                <div className="w-px h-8 bg-border" />
                                <div>
                                    <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-0.5">Volume</div>
                                    <div className="text-lg font-medium text-foreground font-mono tabular-nums">{(market_summary.total_volume / 1000000).toFixed(1)}M</div>
                                </div>
                                <div className="w-px h-8 bg-border" />
                                <div>
                                    <div className="text-[11px] text-muted-foreground uppercase tracking-wider mb-0.5">Adv / Dec</div>
                                    <div className="text-lg font-medium font-mono tabular-nums">
                                        <span className="text-emerald-600 dark:text-emerald-400">{market_summary.advancers}</span>
                                        <span className="text-muted-foreground"> / </span>
                                        <span className="text-rose-600 dark:text-rose-400">{market_summary.decliners}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>

                    {/* Row 2: Market internals */}
                    <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                        <Card>
                            <CardHeader className="p-4 pb-1">
                                <CardTitle className="text-sm font-semibold text-foreground flex items-center">
                                    <HeartPulse size={14} className="text-rose-500 mr-2" />
                                    Market Sentiment
                                    <InfoTooltip content="Aggregated market bias (0-100) based on Advancers vs Decliners and price momentum." />
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-5 pt-0">
                                <SentimentGauge value={marketSentiment} height={200} />
                                <div className="mt-3 space-y-3">
                                    <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full flex overflow-hidden">
                                        <div className="h-full bg-emerald-500" style={{ width: `${market_summary.advancers_percent}%` }}></div>
                                        <div className="h-full bg-rose-500" style={{ width: `${market_summary.decliners_percent}%` }}></div>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-emerald-600 dark:text-emerald-400 font-medium tabular-nums">{market_summary.advancers} advancing</span>
                                        <span className="text-rose-600 dark:text-rose-400 font-medium tabular-nums">{market_summary.decliners} declining</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="p-4 pb-1">
                                <CardTitle className="text-sm font-semibold text-foreground flex items-center">
                                    <ActivityIcon size={14} className="text-blue-500 mr-2" />
                                    Rally Quality Matrix
                                    <InfoTooltip content="Assessment of the market trend's sustainability based on Volume, Turnover, Breadth, and Participation." />
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-5 pt-0 flex items-center justify-center">
                                <MarketHealthRadar
                                    data={marketHealth.scores}
                                    rawData={marketHealth.raw || undefined}
                                    height={260}
                                />
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="p-4 pb-1">
                                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                                    <LineChart size={14} className="text-emerald-500" /> Breadth (5D)
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-5 pt-0">
                                <MarketBreadthTrend height={260} />
                            </CardContent>
                        </Card>
                    </motion.div>

                    {/* Row 3: Sectors & movers */}
                    <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                        <Card>
                            <CardHeader className="p-4 pb-1">
                                <CardTitle className="text-sm font-semibold text-foreground flex items-center">
                                    <BarChart3 size={14} className="mr-2" />
                                    Sector Performance
                                    <InfoTooltip content="Treemap showing which sectors are attracting the most capital (turnover) and their relative performance." />
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-5 pt-0 h-[380px]">
                                <SectorTreemap sectors={sector_summary || []} height={360} />
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="p-4 pb-1">
                                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                                    <Zap size={14} className="text-blue-500" /> High Alpha Signals
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-5 pt-2">
                                <Tabs defaultValue="gainers" className="w-full">
                                    <TabsList className="grid w-full grid-cols-3 mb-3">
                                        <TabsTrigger value="gainers" className="text-xs">Top Gainers</TabsTrigger>
                                        <TabsTrigger value="losers" className="text-xs">Top Losers</TabsTrigger>
                                        <TabsTrigger value="roc" className="text-xs">ROC Watch</TabsTrigger>
                                    </TabsList>
                                    <TabsContent value="gainers" className="m-0 focus-visible:outline-none">
                                        <Table>
                                            <TableBody>
                                                {top_gainers.slice(0, 8).map((stock) => <StockRow key={stock.ticker} stock={stock} />)}
                                            </TableBody>
                                        </Table>
                                    </TabsContent>
                                    <TabsContent value="losers" className="m-0 focus-visible:outline-none">
                                        <Table>
                                            <TableBody>
                                                {top_losers.slice(0, 8).map((stock) => <StockRow key={stock.ticker} stock={stock} />)}
                                            </TableBody>
                                        </Table>
                                    </TabsContent>
                                    <TabsContent value="roc" className="m-0 focus-visible:outline-none">
                                        <Table>
                                            <TableBody>
                                                {[...top_gainers, ...top_losers]
                                                    .filter(s => s.roc !== undefined && s.roc !== null)
                                                    .sort((a, b) => (b.roc || 0) - (a.roc || 0))
                                                    .slice(0, 8)
                                                    .map((stock) => <StockRow key={stock.ticker} stock={stock} />)
                                                }
                                            </TableBody>
                                        </Table>
                                    </TabsContent>
                                </Tabs>
                            </CardContent>
                        </Card>
                    </motion.div>

                    {/* Row 4: Smart money */}
                    <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                        <Card>
                            <CardHeader className="p-4 pb-1">
                                <CardTitle className="text-sm font-semibold text-foreground flex items-center">
                                    <Wallet size={14} className="text-blue-500 mr-2" />
                                    Smart Money Flow
                                    <InfoTooltip content="Visualizes high-impact net-buying by the top institutional brokers." />
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-5">
                                <BrokerFlowChart data={(data as any).whale_watch || []} height={350} />
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="p-4 pb-1">
                                <CardTitle className="text-sm font-semibold text-foreground flex items-center">
                                    <Globe size={14} className="text-blue-600 mr-2" />
                                    Market Liquidity Map
                                    <InfoTooltip content="Bubble chart where size represents turnover and color represents daily percentage change." />
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <MarketBubbleMap stocks={allStocks} height={390} />
                            </CardContent>
                        </Card>
                    </motion.div>

                    {/* Row 5: Secondary internals */}
                    <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                        <Card>
                            <CardHeader className="p-4 pb-1">
                                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                                    <Zap size={14} className="text-orange-500" /> Volume Shockers
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 pt-0">
                                <VolumeShockers stocks={top_turnover} />
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="p-5">
                                <BreakoutWatchlist stocks={allStocks} />
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="p-5">
                                <InstitutionalInterest />
                            </CardContent>
                        </Card>
                    </motion.div>
                </motion.div>
            </div>

            {/* Command Palette */}
            <CommandDialog open={isCommandOpen} onOpenChange={setIsCommandOpen}>
                <CommandInput placeholder="Type a ticker or command..." />
                <CommandList>
                    <CommandEmpty>No results found.</CommandEmpty>
                    {recentStocks.length > 0 && (
                        <CommandGroup heading="Recent">
                            {recentStocks.map(symbol => (
                                <CommandItem
                                    key={symbol}
                                    onSelect={() => {
                                        handleStockClick(symbol);
                                        setIsCommandOpen(false);
                                    }}
                                    className="flex items-center gap-2"
                                >
                                    <Clock className="h-4 w-4 text-slate-400" />
                                    <span className="font-bold">{symbol}</span>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    )}
                    <CommandGroup heading="Active Stocks">
                        {allStocks.slice(0, 10).map(stock => (
                            <CommandItem
                                key={stock.ticker}
                                onSelect={() => {
                                    handleStockClick(stock.ticker);
                                    setIsCommandOpen(false);
                                }}
                                className="flex items-center justify-between"
                            >
                                <div className="flex items-center gap-2">
                                    <div className="p-1 bg-slate-100 dark:bg-slate-800 rounded">
                                        <TrendingUp className="h-3 w-3 text-blue-600" />
                                    </div>
                                    <span className="font-bold">{stock.ticker}</span>
                                    <span className="text-xs text-slate-400 dark:text-slate-500">{stock.sector}</span>
                                </div>
                                <span className={stock.percent_change >= 0 ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}>
                                    {stock.percent_change.toFixed(2)}%
                                </span>
                            </CommandItem>
                        ))}
                    </CommandGroup>
                    <CommandGroup heading="Navigation">
                        <CommandItem onSelect={() => { router.push('/portfolio'); setIsCommandOpen(false); }}>
                            <Wallet className="mr-2 h-4 w-4" /> Portfolio
                        </CommandItem>
                        <CommandItem onSelect={() => { router.push('/strategies'); setIsCommandOpen(false); }}>
                            <Lightbulb className="mr-2 h-4 w-4" /> Strategies
                        </CommandItem>
                        <CommandItem onSelect={() => { router.push('/chat'); setIsCommandOpen(false); }}>
                            <MessageSquare className="mr-2 h-4 w-4" /> AI Terminal
                        </CommandItem>
                    </CommandGroup>
                </CommandList>
            </CommandDialog>

            <style jsx global>{`
                @keyframes infinite-scroll {
                    from { transform: translateX(0); }
                    to { transform: translateX(-50%); }
                }
                .animate-infinite-scroll {
                    animation: infinite-scroll 40s linear infinite;
                }
            `}</style>
        </DashboardLayout>
    );
}
```

Note: `StockData` must be exported from `useMarketData` — it already is (`export interface StockData` in `src/hooks/useMarketData.ts:4`).

IMPORTANT — there is an uncommitted pre-existing modification in this file and in `backend/stocks/views/market.py` (from earlier work on this branch). Before replacing the file, run `git diff frontend/src/app/\(authenticated\)/market/page.tsx` and check what the uncommitted change is. If it's relevant to data fetching, preserve it; if it's part of this rework's earlier exploration, the rewrite supersedes it. Do NOT touch `backend/stocks/views/market.py`.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors. Likely cleanup needed: unused imports (the old file imported `SectorGraph`, `Sparkline`, `MarketHeatmap`, `PortfolioSummary`, `MiniSectorCard`, `Input`, `Badge`, `TableHead`/`TableHeader`, `api`, many lucide icons) — the new file already omits them; the compiler will flag anything missed.

- [ ] **Step 3: Commit**

```bash
cd /Users/jugalraj/Documents/Projects/Stockastic
git add "frontend/src/app/(authenticated)/market/page.tsx"
git commit -m "feat(market): restructure overview as top-down storyline, drop portfolio card, use useMarketData"
```

---

### Task 10: Add `MarketTabs` to the 7 subroute pages

**Files:**
- Modify: `src/app/(authenticated)/market/movers/page.tsx`
- Modify: `src/app/(authenticated)/market/activity/page.tsx`
- Modify: `src/app/(authenticated)/market/bulk/page.tsx`
- Modify: `src/app/(authenticated)/market/matching/page.tsx`
- Modify: `src/app/(authenticated)/market/rotation/page.tsx`
- Modify: `src/app/(authenticated)/market/volume-profile/page.tsx`
- Modify: `src/app/(authenticated)/market/pa-screener/page.tsx`

- [ ] **Step 1: Add the tab bar to each page**

For EACH of the 7 files:

1. Add the import alongside the other component imports:

```tsx
import { MarketTabs } from '@/components/MarketTabs';
```

2. Find the page's MAIN content return (`grep -n "<DashboardLayout" <file>` — some pages have additional loading/error returns; only modify the main one, identifiable by having `title="..."` and the page's real content). Insert `<MarketTabs />` as the FIRST child inside `<DashboardLayout ...>`:

```tsx
        <DashboardLayout title="Movers & Shakers" subtitle="SCANNERS">
            <MarketTabs />
            {/* ...existing content unchanged... */}
```

Known anchors (line numbers from before this task — re-grep, they may shift):
- `movers/page.tsx:351` — `<DashboardLayout title="Movers & Shakers" subtitle="SCANNERS">`
- `activity/page.tsx:151` — `<DashboardLayout title="Market Activity Analysis" subtitle="Multi-timeframe breakdown of top stocks">`
- `bulk/page.tsx:134` — `<DashboardLayout title="Bulk Transactions">` (the second `<DashboardLayout>` at line 315 is a loading state — leave it)
- `matching/page.tsx:135` — `<DashboardLayout title="Matching Transactions">` (same pattern — leave the loading-state one)
- `volume-profile/page.tsx:171` — multi-line `<DashboardLayout` opening tag; insert after the closing `>` of the opening tag
- `rotation/page.tsx` and `pa-screener/page.tsx` — grep for the anchor

3. NOTE: if a page's `DashboardLayout` uses `noPadding`, wrap the tab bar in padding instead: `<div className="px-6 lg:px-10 pt-4"><MarketTabs className="mb-0" /></div>`. (As of writing, only the overview page uses `noPadding`; all 7 subroutes use default padding.)

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Visual sanity check (optional but recommended)**

If the dev stack is running, load `/market/movers` and `/market/bulk` and confirm the tab bar renders with the correct active tab.

- [ ] **Step 4: Commit**

```bash
cd /Users/jugalraj/Documents/Projects/Stockastic
git add "frontend/src/app/(authenticated)/market/"
git commit -m "feat(market): surface MarketTabs on all 7 market subroutes"
```

---

### Task 11: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Unit tests**

Run: `cd /Users/jugalraj/Documents/Projects/Stockastic/frontend && npx vitest run`
Expected: all tests pass, including `homeDigest.test.ts`.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: build succeeds. Fix any type or lint errors introduced by this rework (do not fix pre-existing unrelated failures — note them instead).

- [ ] **Step 3: Manual run-through**

Start the dev stack (backend + `npm run dev`) and verify:

- `/` (logged in): Morning Briefing renders — market strip with OPEN/CLOSED badge, Today's Signals (or its empty state), Smart Money Highlights, Watchlist & Alerts. Each zone loads independently; with the backend stopped, zones show inline errors and the page shell still renders.
- Market strip links to `/market`; signal rows link to `/ticker/{symbol}`; zone headers link to `/signals`, `/recommendations`, `/accumulation/dashboard`, `/portfolio/watchlist`, `/notifications`.
- `/market`: ticker ribbon, tab bar with "Overview" active, then hero → internals → sectors/movers → smart money → secondary internals, in full-width rows. No Portfolio card. Cmd+K opens the palette.
- Each of the 7 subroutes shows the tab bar with the correct active tab; clicking tabs navigates between all 8 views.
- No console errors beyond pre-existing ones.

- [ ] **Step 4: Final commit (if any fixes were made)**

```bash
cd /Users/jugalraj/Documents/Projects/Stockastic
git add -A frontend/
git commit -m "fix(home,market): verification fixes for home & market rework"
```
