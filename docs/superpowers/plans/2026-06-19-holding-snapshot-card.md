# Holding Snapshot Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the thin health-score hover tooltip in the portfolio holdings table with a rich, two-column "holding snapshot" popover built entirely from data already on each row.

**Architecture:** Pure derivation helpers in `lib/holdingSnapshot.ts` (R/R, day %, holding days, price ladder), a presentational `HoldingSnapshot` component composed of small sub-components, swapped into the existing health-badge `Tooltip` in `PortfolioTable.tsx`. No backend change, no new API call.

**Tech Stack:** Next.js 16 / React 19, TypeScript, Vitest + Testing Library, lucide-react, Tailwind.

## Global Constraints

- No backend / serializer change; no new API call — card uses only `PortfolioItem` data already on the row.
- Trigger unchanged: the health-score badge `Tooltip`. Row-click and action buttons unchanged.
- Money/number formatting via `@/lib/formatters` (`formatRupees`, `formatNepaliNumber`) — never ad hoc.
- Missing values render `N/A` (fundamentals) or `—` (Day, R/R); ladder omits missing points but always includes entry + CMP.
- Signal pill color: BUY → emerald, SELL → rose, HOLD/NEUTRAL → slate, MIXED → amber. No `signals` → omit the pill.
- Health bar color: ≥70 emerald, ≥40 amber, else rose (matches existing badge thresholds).
- 30-line hard limit per function; SOLID; no magic strings (use named maps/consts); warm sans, sentence-case, no all-caps.
- TDD: failing test first for every behavior. Frontend unit tests live in `src/__tests__/unit/`.
- Do NOT run repo-wide `npm run lint` (large pre-existing baseline); `npm run build` is the type-check gate.

---

## File Structure

- Create: `frontend/src/lib/holdingSnapshot.ts` — pure helpers + `LadderPoint` type.
- Create: `frontend/src/components/HoldingSnapshot.tsx` — presentational card + sub-components.
- Modify: `frontend/src/components/PortfolioTable.tsx` — add `purchased_at`/`tags` to `PortfolioItem`; replace the health-badge tooltip body with `<HoldingSnapshot item={item} />`.
- Create: `frontend/src/__tests__/unit/holdingSnapshot.test.ts` — helper tests.
- Create: `frontend/src/__tests__/unit/HoldingSnapshot.test.tsx` — component tests.

---

## Task 1: Pure derivation helpers

**Files:**
- Create: `frontend/src/lib/holdingSnapshot.ts`
- Test: `frontend/src/__tests__/unit/holdingSnapshot.test.ts`

**Interfaces:**
- Produces:
  - `computeRiskReward(wacc?: number, stopLoss?: number, target?: number): number | null`
  - `computeDayPercent(dayGainLoss?: number, currentValue?: number): number | null`
  - `computeHoldingDays(purchasedAt: string, now: Date): number`
  - `interface LadderPoint { key: 'sl'|'entry'|'cmp'|'t1'|'t2'|'t3'; label: string; price: number }`
  - `buildPriceLadder(item): LadderPoint[]` — ascending by price; includes only present points; always entry + cmp.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/__tests__/unit/holdingSnapshot.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
    computeRiskReward, computeDayPercent, computeHoldingDays, buildPriceLadder,
} from '@/lib/holdingSnapshot';

describe('computeRiskReward', () => {
    it('computes reward over risk to 1 dp', () => {
        expect(computeRiskReward(520, 480, 600)).toBe(2);
    });
    it('returns null when stop-loss or target missing', () => {
        expect(computeRiskReward(520, undefined, 600)).toBeNull();
        expect(computeRiskReward(520, 480, undefined)).toBeNull();
    });
    it('returns null when risk is not positive (wacc <= stopLoss)', () => {
        expect(computeRiskReward(480, 480, 600)).toBeNull();
    });
});

describe('computeDayPercent', () => {
    it('computes percent against prior value', () => {
        expect(computeDayPercent(4800, 274000)).toBe(1.8);
    });
    it('returns null on zero prior value', () => {
        expect(computeDayPercent(100, 100)).toBeNull();
    });
    it('returns null when inputs missing', () => {
        expect(computeDayPercent(undefined, 100)).toBeNull();
    });
});

describe('computeHoldingDays', () => {
    it('counts whole days between dates', () => {
        expect(computeHoldingDays('2026-01-01T00:00:00Z', new Date('2026-01-11T00:00:00Z'))).toBe(10);
    });
    it('is 0 on the same day', () => {
        expect(computeHoldingDays('2026-01-01T00:00:00Z', new Date('2026-01-01T05:00:00Z'))).toBe(0);
    });
});

describe('buildPriceLadder', () => {
    const full = {
        stop_loss_price: 480, wacc: 520, current_price: 548,
        target_price: 600, target_price_2: 650, target_price_3: 700,
    } as never;

    it('returns all present points ascending by price', () => {
        expect(buildPriceLadder(full).map(p => p.key)).toEqual(['sl', 'entry', 'cmp', 't1', 't2', 't3']);
    });
    it('omits missing optional points but keeps entry + cmp', () => {
        const minimal = { wacc: 520, current_price: 548 } as never;
        expect(buildPriceLadder(minimal).map(p => p.key)).toEqual(['entry', 'cmp']);
    });
    it('keeps order with only a stop-loss set', () => {
        const slOnly = { stop_loss_price: 480, wacc: 520, current_price: 548 } as never;
        expect(buildPriceLadder(slOnly).map(p => p.key)).toEqual(['sl', 'entry', 'cmp']);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/__tests__/unit/holdingSnapshot.test.ts`
Expected: FAIL — cannot resolve `@/lib/holdingSnapshot`.

- [ ] **Step 3: Implement the helpers**

Create `frontend/src/lib/holdingSnapshot.ts`:

```ts
import type { PortfolioItem } from '@/components/PortfolioTable';

const round1 = (v: number): number => Math.round(v * 10) / 10;

export function computeRiskReward(
    wacc?: number, stopLoss?: number, target?: number,
): number | null {
    if (wacc == null || stopLoss == null || target == null) return null;
    const risk = wacc - stopLoss;
    if (risk <= 0) return null;
    return round1((target - wacc) / risk);
}

export function computeDayPercent(
    dayGainLoss?: number, currentValue?: number,
): number | null {
    if (dayGainLoss == null || currentValue == null) return null;
    const prior = currentValue - dayGainLoss;
    if (prior === 0) return null;
    return round1((dayGainLoss / prior) * 100);
}

export function computeHoldingDays(purchasedAt: string, now: Date): number {
    const start = new Date(purchasedAt).getTime();
    const dayMs = 86_400_000;
    return Math.max(0, Math.floor((now.getTime() - start) / dayMs));
}

export interface LadderPoint {
    key: 'sl' | 'entry' | 'cmp' | 't1' | 't2' | 't3';
    label: string;
    price: number;
}

export function buildPriceLadder(item: PortfolioItem): LadderPoint[] {
    const always = new Set(['entry', 'cmp']);
    const candidates: Array<[LadderPoint['key'], string, number | undefined]> = [
        ['sl', 'SL', item.stop_loss_price],
        ['entry', 'Entry', item.wacc],
        ['cmp', 'CMP', item.current_price],
        ['t1', 'T1', item.target_price],
        ['t2', 'T2', item.target_price_2],
        ['t3', 'T3', item.target_price_3],
    ];
    return candidates
        .filter(([key, , value]) => always.has(key) || value != null)
        .map(([key, label, value]) => ({ key, label, price: Number(value) }))
        .filter(point => Number.isFinite(point.price))
        .sort((a, b) => a.price - b.price);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/__tests__/unit/holdingSnapshot.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/holdingSnapshot.ts frontend/src/__tests__/unit/holdingSnapshot.test.ts
git commit -m "feat(portfolio): add holding snapshot derivation helpers"
```

---

## Task 2: HoldingSnapshot component + table wiring

**Files:**
- Create: `frontend/src/components/HoldingSnapshot.tsx`
- Modify: `frontend/src/components/PortfolioTable.tsx` (`PortfolioItem` interface ~lines 23-64; tooltip body ~lines 258-286)
- Test: `frontend/src/__tests__/unit/HoldingSnapshot.test.tsx`

**Interfaces:**
- Consumes: helpers + `LadderPoint` from Task 1; `PortfolioItem` (with new `purchased_at?: string` and `tags?: string[]`).
- Produces: `HoldingSnapshot({ item: PortfolioItem })` default-styled 360px card.

- [ ] **Step 1: Write the failing component test**

Create `frontend/src/__tests__/unit/HoldingSnapshot.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { HoldingSnapshot } from '@/components/HoldingSnapshot';

const base = {
    id: 1, account: 1, ticker: 'NABIL', quantity: 500, buy_price: 500, wacc: 520,
    current_price: 548, current_value: 274000, investment_value: 260000,
    gain_loss: 14000, gain_loss_percent: 12.4, day_gain_loss: 4800,
    sector: 'Banking', volatility: 28, stop_loss_price: 480, target_price: 600,
    target_price_2: 650, health_score: 78,
    fundamental_metrics: { pe: 14.2, pb: 1.9, roe: 18, growth: 12, de: 0.4 },
    signals: { latest_date: '2026-06-18', summary: 'BUY' as const, details: [], buy_count: 4 },
    classification: 'investment' as const, tags: ['Core'], purchased_at: '2026-01-01T00:00:00Z',
} as never;

describe('HoldingSnapshot', () => {
    it('shows P/L percent and the signal pill', () => {
        render(<HoldingSnapshot item={base} />);
        expect(screen.getByText('+12.4%')).toBeInTheDocument();
        expect(screen.getByText('BUY 4/5')).toBeInTheDocument();
    });

    it('renders N/A for a missing fundamental', () => {
        const item = { ...base, fundamental_metrics: { pe: null, pb: 1.9, roe: 18, growth: 12, de: 0.4 } };
        render(<HoldingSnapshot item={item} />);
        expect(screen.getByText('P/E N/A')).toBeInTheDocument();
    });

    it('renders ladder markers for present points', () => {
        render(<HoldingSnapshot item={base} />);
        expect(screen.getByText('CMP')).toBeInTheDocument();
        expect(screen.getByText('SL')).toBeInTheDocument();
        expect(screen.getByText('T1')).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/unit/HoldingSnapshot.test.tsx`
Expected: FAIL — cannot resolve `@/components/HoldingSnapshot`.

- [ ] **Step 3: Add `purchased_at` and `tags` to the `PortfolioItem` interface**

In `frontend/src/components/PortfolioTable.tsx`, inside `export interface PortfolioItem { ... }` (after `value_yield?: number;`, before `classification?: Classification;`), add:

```tsx
    purchased_at?: string;
    tags?: string[];
```

- [ ] **Step 4: Implement the component**

Create `frontend/src/components/HoldingSnapshot.tsx`:

```tsx
'use client';

import React from 'react';
import { Landmark, Repeat } from 'lucide-react';
import { formatRupees, formatNepaliNumber } from '@/lib/formatters';
import type { PortfolioItem } from '@/components/PortfolioTable';
import {
    computeRiskReward, computeDayPercent, computeHoldingDays, buildPriceLadder,
} from '@/lib/holdingSnapshot';

const SIGNAL_STYLES: Record<string, string> = {
    BUY: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
    SELL: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400',
    HOLD: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    NEUTRAL: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    MIXED: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
};

const healthBarColor = (score: number) =>
    score >= 70 ? 'bg-emerald-500' : score >= 40 ? 'bg-amber-500' : 'bg-rose-500';

const asPct = (v: number | null | undefined) => (v == null ? 'N/A' : `${v.toFixed(1)}%`);
const asRatio = (v: number | null | undefined) => (v == null ? 'N/A' : v.toFixed(2));
const signed = (v: number, suffix: string) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}${suffix}`;

function SnapshotHeader({ item }: { item: PortfolioItem }) {
    const ClsIcon = item.classification === 'investment' ? Landmark : Repeat;
    const summary = item.signals?.summary;
    const buyCount = item.signals?.buy_count;
    const pill = summary && buyCount != null ? `${summary} ${buyCount}/5` : summary;
    return (
        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-1.5 min-w-0">
                <ClsIcon size={13} className="text-slate-400 shrink-0" />
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{item.ticker}</span>
                {item.sector && <span className="text-[10px] text-slate-400 truncate">· {item.sector}</span>}
            </div>
            {summary && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap ${SIGNAL_STYLES[summary]}`}>{pill}</span>
            )}
        </div>
    );
}

function SnapshotMoney({ item }: { item: PortfolioItem }) {
    const up = item.gain_loss >= 0;
    const tone = up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
    const day = computeDayPercent(item.day_gain_loss, item.current_value);
    const rr = computeRiskReward(item.wacc, item.stop_loss_price, item.target_price);
    return (
        <div className="space-y-1 p-3">
            <div className={`text-xl font-bold tabular-nums ${tone}`}>{signed(item.gain_loss_percent, '%')}</div>
            <div className={`text-xs font-semibold tabular-nums ${tone}`}>{up ? '+' : ''}{formatRupees(item.gain_loss)}</div>
            <div className="text-[11px] text-slate-500">{item.quantity}u · {formatRupees(item.current_value)}</div>
            <div className="text-[11px] text-slate-500">Day {day == null ? '—' : signed(day, '%')}</div>
            <div className="text-[11px] text-slate-500">R/R {rr == null ? '—' : rr.toFixed(1)}</div>
        </div>
    );
}

function SnapshotFundamentals({ item }: { item: PortfolioItem }) {
    const f = item.fundamental_metrics;
    const score = item.health_score;
    const tag = item.tags?.[0];
    const days = item.purchased_at ? computeHoldingDays(item.purchased_at, new Date()) : null;
    return (
        <div className="space-y-1.5 p-3 border-l border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap">Health {score != null ? `${score}/100` : 'N/A'}</span>
                {score != null && (
                    <span className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                        <span className={`block h-full ${healthBarColor(score)}`} style={{ width: `${score}%` }} />
                    </span>
                )}
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                <span>P/E {asRatio(f?.pe)}</span><span>P/B {asRatio(f?.pb)}</span>
                <span>ROE {asPct(f?.roe)}</span><span>Gr {asPct(f?.growth)}</span>
                <span>D/E {asRatio(f?.de)}</span><span>Vol {asPct(item.volatility)}</span>
            </div>
            <div className="text-[10px] text-slate-400 pt-1">{tag ? `#${tag} · ` : ''}{days != null ? `held ${days}d` : ''}</div>
        </div>
    );
}

function PriceLadder({ item }: { item: PortfolioItem }) {
    const points = buildPriceLadder(item);
    const min = points[0].price;
    const span = (points[points.length - 1].price - min) || 1;
    const dot = (key: string) =>
        key === 'cmp' ? 'bg-indigo-500 ring-2 ring-indigo-200 dark:ring-indigo-900'
            : key === 'entry' ? 'bg-slate-700 dark:bg-slate-300' : 'bg-slate-400';
    return (
        <div className="px-3 pt-2 pb-3 border-t border-slate-200 dark:border-slate-800">
            <div className="relative h-px bg-slate-200 dark:bg-slate-700 my-5">
                {points.map(p => (
                    <div key={p.key} className="absolute -translate-x-1/2 flex flex-col items-center" style={{ left: `${((p.price - min) / span) * 100}%` }}>
                        <span className={`h-2 w-2 rounded-full -mt-1 ${dot(p.key)}`} />
                        <span className="text-[8px] text-slate-400 mt-1 whitespace-nowrap">{p.label}</span>
                        <span className="text-[8px] font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">{formatNepaliNumber(p.price)}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function HoldingSnapshot({ item }: { item: PortfolioItem }) {
    return (
        <div className="w-[360px] overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-card">
            <SnapshotHeader item={item} />
            <div className="grid grid-cols-2">
                <SnapshotMoney item={item} />
                <SnapshotFundamentals item={item} />
            </div>
            <PriceLadder item={item} />
        </div>
    );
}
```

- [ ] **Step 5: Run the component test to verify it passes**

Run: `cd frontend && npx vitest run src/__tests__/unit/HoldingSnapshot.test.tsx`
Expected: PASS (3 passed).

- [ ] **Step 6: Wire the component into PortfolioTable**

In `frontend/src/components/PortfolioTable.tsx`:

a) Add the import near the other component imports (after the `SentimentBadge` import on line 21):

```tsx
import { HoldingSnapshot } from '@/components/HoldingSnapshot';
```

b) Replace the entire `TooltipContent` block for the health badge (currently lines ~258-286, the `<TooltipContent ...>` … `</TooltipContent>` that contains the `w-52` fundamental-health card) with:

```tsx
                                                <TooltipContent className="p-0 border-none bg-transparent shadow-xl">
                                                    <HoldingSnapshot item={item} />
                                                </TooltipContent>
```

Leave the surrounding `<Tooltip>`, `<TooltipTrigger asChild>`, and the health-score `<Badge>` exactly as they are.

- [ ] **Step 7: Type-check the wiring with a build**

Run: `cd frontend && npm run build`
Expected: `Compiled successfully`; `/portfolio` route listed; no type errors.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/HoldingSnapshot.tsx frontend/src/components/PortfolioTable.tsx frontend/src/__tests__/unit/HoldingSnapshot.test.tsx
git commit -m "feat(portfolio): rich holding snapshot card on the health-badge hover"
```

---

## Task 3: Regression + deploy

**Files:** none (verification only)

- [ ] **Step 1: Run the snapshot + neighbouring portfolio unit tests**

Run: `cd frontend && npx vitest run src/__tests__/unit/holdingSnapshot.test.ts src/__tests__/unit/HoldingSnapshot.test.tsx src/__tests__/unit/PortfolioUi.test.tsx src/__tests__/unit/ClassificationToggle.test.tsx src/__tests__/unit/portfolioTotals.test.ts`
Expected: all PASS.

- [ ] **Step 2: Production build**

Run: `cd frontend && npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 3: Deploy the frontend image**

Run: `docker-compose up -d --build frontend`
Then verify: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000` → `200`.
(No migration; frontend-only change. Hard-refresh the portfolio page; hover a holding's health badge to see the snapshot.)

---

## Self-Review

**Spec coverage:**
- Two-column dense layout (header / money+position / fundamentals+meta / ladder) → Task 2 component. ✓
- Trigger unchanged (health badge) → Task 2 Step 6 leaves Tooltip/Trigger/Badge intact. ✓
- Signal pill color map + omit when absent → `SIGNAL_STYLES`, conditional render. ✓
- Health bar thresholds 70/40 → `healthBarColor`. ✓
- Derived R/R, Day %, holding days, ladder (omit missing, keep entry+cmp) → Task 1 helpers + tests. ✓
- `N/A`/`—` empty states → `asPct`/`asRatio`/`—` literals + tests. ✓
- Money via `@/lib/formatters` → imports used. ✓
- No backend change / no new fetch → only `PortfolioItem` data + new optional type fields. ✓
- Deploy = frontend rebuild, no migration → Task 3. ✓

**Placeholder scan:** no TBD/TODO; every code step has complete code.

**Type consistency:** helper signatures in Task 1 match their calls in Task 2 (`computeRiskReward(wacc, stop_loss_price, target_price)`, `computeDayPercent(day_gain_loss, current_value)`, `computeHoldingDays(purchased_at, new Date())`, `buildPriceLadder(item)`); `LadderPoint.key` values (`sl/entry/cmp/t1/t2/t3`) match `buildPriceLadder` output and the `dot()` switch; `purchased_at`/`tags` added to `PortfolioItem` in Task 2 Step 3 before use.

**Out of scope confirmed:** no backend, no sub-projects B/C, no sparkline, no row-click change.
