# Analysis Engine Rollout — Phase 3 Implementation Plan (Signals page + delete old engine)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repoint the Signals Intel Hub page to the new flat analysis sections and delete the legacy `DailySignalStatus`, completing the no-nested-tabs rollout across both consumers.

**Architecture:** Extract a shared `AnalysisTabs` component (its own single-level Tabs of `Signals · Technicals · Fundamentals · Accumulation`, fed by `useTickerAnalysis`) for the Signals page. The dialog keeps rendering the four sections inline within its six-tab bar (using a sub-Tabs there would re-introduce nesting). Then delete `DailySignalStatus.tsx`.

**Tech Stack:** Next.js 16 / React 19, TypeScript, Vitest + Testing Library.

## Global Constraints

- Re-present existing data only; no backend change. No new analytics.
- Single-level tabs only — `AnalysisTabs` is one `Tabs`; on the Signals page it is NOT nested inside another tablist.
- Money/price/volume via `@/lib/formatters`; sentence-case, no all-caps (no `uppercase` class); `N/A` for nulls.
- 30-line hard limit per function; SOLID; no magic strings; DRY; YAGNI.
- TDD: failing test first. Frontend unit tests in `src/__tests__/unit/`.
- Do NOT run repo-wide `npm run lint`; `npm run build` is the type-check gate.
- After Phase 3, `DailySignalStatus.tsx` is deleted and nothing imports it.

---

## File Structure

- Create: `frontend/src/components/analysis/AnalysisTabs.tsx` — shared four-tab analysis block.
- Modify: `frontend/src/app/(authenticated)/signals/IntelHubClient.tsx` — replace `<DailySignalStatus .../>` (lines ~1083-1096) with `<AnalysisTabs .../>`; drop the import.
- Delete: `frontend/src/components/signals/DailySignalStatus.tsx`.
- Tests: `AnalysisTabs.test.tsx`; update/confirm no test references `DailySignalStatus`.

Consumes (built in Phase 2): `useTickerAnalysis` (`@/hooks/useTickerAnalysis`), `SignalsSection`/`TechnicalsSection`/`FundamentalsSection`/`AccumulationSection` (`@/components/analysis/*`).

---

## Task 1: Shared `AnalysisTabs` component

**Files:**
- Create: `frontend/src/components/analysis/AnalysisTabs.tsx`
- Test: `frontend/src/__tests__/unit/AnalysisTabs.test.tsx`

**Interfaces:**
- Consumes: `useTickerAnalysis`, the four section components.
- Produces: `AnalysisTabs({ symbol, ladder }: { symbol?: string; ladder: { cmp?: number; entry?: number; stopLoss?: number; tp1?: number; tp2?: number; tp3?: number; direction: 'BUY' | 'SELL' } })` — one `Tabs` (default `signals`) with triggers `Signals`, `Technicals`, `Fundamentals`, `Accumulation`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/__tests__/unit/AnalysisTabs.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/hooks/useTickerAnalysis', () => ({ useTickerAnalysis: () => ({ loading: false, error: false, data: {} }) }));
vi.mock('@/components/analysis/SignalsSection', () => ({ SignalsSection: () => <div>signals-body</div> }));
vi.mock('@/components/analysis/TechnicalsSection', () => ({ TechnicalsSection: () => <div>technicals-body</div> }));
vi.mock('@/components/analysis/FundamentalsSection', () => ({ FundamentalsSection: () => <div>fundamentals-body</div> }));
vi.mock('@/components/analysis/AccumulationSection', () => ({ AccumulationSection: () => <div>accumulation-body</div> }));

import { AnalysisTabs } from '@/components/analysis/AnalysisTabs';

describe('AnalysisTabs', () => {
    it('renders a single flat tab list of the four analysis sections', () => {
        render(<AnalysisTabs symbol="NABIL" ladder={{ cmp: 548, entry: 520, direction: 'BUY' }} />);
        const tabs = screen.getAllByRole('tab');
        expect(tabs.map(t => t.textContent)).toEqual(['Signals', 'Technicals', 'Fundamentals', 'Accumulation']);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/unit/AnalysisTabs.test.tsx`
Expected: FAIL — cannot resolve `@/components/analysis/AnalysisTabs`.

- [ ] **Step 3: Implement `AnalysisTabs`**

Create `frontend/src/components/analysis/AnalysisTabs.tsx`:

```tsx
'use client';

import React from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useTickerAnalysis } from '@/hooks/useTickerAnalysis';
import { SignalsSection } from '@/components/analysis/SignalsSection';
import { TechnicalsSection } from '@/components/analysis/TechnicalsSection';
import { FundamentalsSection } from '@/components/analysis/FundamentalsSection';
import { AccumulationSection } from '@/components/analysis/AccumulationSection';

interface Ladder {
    cmp?: number; entry?: number; stopLoss?: number;
    tp1?: number; tp2?: number; tp3?: number; direction: 'BUY' | 'SELL';
}

const TABS = [
    { value: 'signals', label: 'Signals' },
    { value: 'technicals', label: 'Technicals' },
    { value: 'fundamentals', label: 'Fundamentals' },
    { value: 'accumulation', label: 'Accumulation' },
];

function DataState({ loading }: { loading: boolean }) {
    return (
        <div className="p-8 text-center text-sm text-muted-foreground">
            {loading ? 'Loading analysis…' : 'Analysis unavailable.'}
        </div>
    );
}

export function AnalysisTabs({ symbol, ladder }: { symbol?: string; ladder: Ladder }) {
    const { loading, data } = useTickerAnalysis(symbol);
    const ready = !loading && !!data;
    return (
        <Tabs defaultValue="signals" className="w-full">
            <TabsList>
                {TABS.map(t => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}
            </TabsList>
            <TabsContent value="signals">
                {ready ? <SignalsSection data={data} ladder={ladder} /> : <DataState loading={loading} />}
            </TabsContent>
            <TabsContent value="technicals">
                {ready ? <TechnicalsSection data={data} /> : <DataState loading={loading} />}
            </TabsContent>
            <TabsContent value="fundamentals">
                {ready ? <FundamentalsSection data={data} /> : <DataState loading={loading} />}
            </TabsContent>
            <TabsContent value="accumulation">
                <AccumulationSection symbol={symbol} />
            </TabsContent>
        </Tabs>
    );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/__tests__/unit/AnalysisTabs.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/analysis/AnalysisTabs.tsx frontend/src/__tests__/unit/AnalysisTabs.test.tsx
git commit -m "feat(analysis): shared AnalysisTabs (flat four-section analysis block)"
```

---

## Task 2: Repoint the Signals page to `AnalysisTabs`

**Files:**
- Modify: `frontend/src/app/(authenticated)/signals/IntelHubClient.tsx` (lines ~1083-1096; import line ~15)

**Interfaces:**
- Consumes: `AnalysisTabs` (Task 1).

- [ ] **Step 1: Replace the import**

In `IntelHubClient.tsx`, remove `import { DailySignalStatus } from '@/components/signals/DailySignalStatus';` (line ~15) and add:

```tsx
import { AnalysisTabs } from '@/components/analysis/AnalysisTabs';
```

- [ ] **Step 2: Replace the render block**

Replace the `<DailySignalStatus ... />` element (inside the `SignalDetailErrorBoundary`, lines ~1083-1096) with:

```tsx
                            <AnalysisTabs
                                symbol={selectedSignal.symbol}
                                ladder={{
                                    cmp: selectedSignal.currentPrice || selectedSignal.ltp || undefined,
                                    entry: selectedSignal.ltp || undefined,
                                    stopLoss: selectedSignal.stopLoss,
                                    tp1: selectedSignal.tp1 ?? selectedSignal.targetPrice,
                                    tp2: selectedSignal.tp2,
                                    tp3: selectedSignal.tp3,
                                    direction: selectedSignal.direction,
                                }}
                            />
```

Leave `SignalDetailErrorBoundary` and the surrounding `DialogContent`/`VisuallyHidden` title/description as-is.

- [ ] **Step 3: Build to type-check**

Run: `cd frontend && npm run build`
Expected: `Compiled successfully`; `/signals` route present; no type errors. (`DailySignalStatus` is now imported by nothing.)

- [ ] **Step 4: Commit**

```bash
git add "frontend/src/app/(authenticated)/signals/IntelHubClient.tsx"
git commit -m "feat(signals): render flat AnalysisTabs in the Signals page (replace DailySignalStatus)"
```

---

## Task 3: Delete the legacy `DailySignalStatus`

**Files:**
- Delete: `frontend/src/components/signals/DailySignalStatus.tsx`

- [ ] **Step 1: Confirm nothing imports it**

Run: `cd frontend && grep -rln "DailySignalStatus" src/ | grep -v "signals/DailySignalStatus.tsx"`
Expected: NO output (only the file itself, about to be deleted).

- [ ] **Step 2: Delete the file**

Run: `cd frontend && git rm src/components/signals/DailySignalStatus.tsx`

- [ ] **Step 3: Build to confirm no broken references**

Run: `cd frontend && npm run build`
Expected: `Compiled successfully`; no "module not found" errors.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(analysis): delete legacy DailySignalStatus (replaced by flat sections)"
```

---

## Task 4: Phase 3 regression + deploy

**Files:** none (verification only)

- [ ] **Step 1: Run the analysis + exit + dialog unit tests**

Run: `cd frontend && npx vitest run src/__tests__/unit/AnalysisTabs.test.tsx src/__tests__/unit/tickerAnalysis.test.ts src/__tests__/unit/useTickerAnalysis.test.ts src/__tests__/unit/SignalsSection.test.tsx src/__tests__/unit/TechnicalsSection.test.tsx src/__tests__/unit/FundamentalsSection.test.tsx src/__tests__/unit/ExitStrategyDialog.test.tsx`
Expected: all PASS.

- [ ] **Step 2: Production build**

Run: `cd frontend && npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 3: Deploy the frontend image**

Run: `docker-compose up -d --build frontend`
Verify: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000` → `200`.
(No migration. Hard-refresh; verify BOTH: the Signals page signal-detail dialog shows the four flat tabs and renders data; the portfolio "View strategies" dialog still shows its six flat tabs. No nested tabs anywhere.)

---

## Self-Review

**Spec coverage (Phase 3 scope):**
- Signals page uses the new flat sections (single-level tabs) → Tasks 1-2. ✓
- Shared composition without nesting (`AnalysisTabs` is the Signals page's only tablist; dialog keeps inline sections) → Task 1 design note. ✓
- `DailySignalStatus` deleted, nothing orphaned → Task 3. ✓
- Both consumers verified → Task 4. ✓
- No backend change, no new analytics → constraints. ✓

**Placeholder scan:** Task 1 carries full component + test code; Tasks 2-3 are precise edits/deletes with exact import/element/path and build gates.

**Type consistency:** `AnalysisTabs` ladder shape matches `SignalsSection`'s `ladder` prop (cmp/entry/stopLoss/tp1-3/direction) and the dialog's ladder object from Phase 2; `useTickerAnalysis`/section imports match their Phase 2 exports; the Signals-page `selectedSignal` fields (symbol/currentPrice/ltp/stopLoss/tp1-3/targetPrice/direction) map onto the ladder.
