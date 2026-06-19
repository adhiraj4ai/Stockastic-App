# View-strategies Dialog — Phase 1 Implementation Plan (shell + Plan + Transactions)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the "View strategies" dialog (`ExitStrategyDialog`) into a decomposed, single-level-tab shell with a redesigned Plan tab (editor + live price ladder) and a dedicated Transactions tab, keeping the existing analysis engine behind one temporary "Analysis" tab.

**Architecture:** Extract a `useExitStrategy` data hook and pure `lib/exitPlan.ts` helpers, build focused presentational components under `components/exit/`, and reassemble `ExitStrategyDialog` as a thin orchestrator with one flat `Tabs` (`plan · transactions · analysis`). The analysis tab still embeds the current `DailySignalStatus` unchanged (flattened in Phase 2).

**Tech Stack:** Next.js 16 / React 19, TypeScript, Vitest + Testing Library, lucide-react, shadcn `Tabs`/`Dialog`/`Input`/`Textarea`/`Button`.

## Global Constraints

- Frontend-only; no backend change; same API calls as today (`GET portfolio/{id}/suggest_exits/`, `PATCH portfolio/{id}/`, `DELETE transactions/{id}/`).
- Single-level tabs only — Phase 1 tab bar is `Plan · Transactions · Analysis`; default tab is **Plan**. (Analysis stays nested internally until Phase 2.)
- Money/number formatting via `@/lib/formatters` (`formatRupees`, `formatNepaliNumber`); no ad-hoc formatting.
- Remove hardcoded filler: the "STK SCORE: STABLE" badge and the "HARD STOP PROTECTION ACTIVE" badge.
- Surface previously-hidden transaction data: `reason` and the fee breakdown (`commission`, `sebon_fee`, `dp_charge`, `cgt`, `receivable_amount`).
- Save behaviour unchanged: PATCH `stop_loss_price`, `target_price`, `target_price_2`, `target_price_3`, `thesis`, `strategy_type`.
- Warm sans, sentence-case, no all-caps; 30-line hard limit per function; SOLID; no magic strings (named maps/consts); DRY; YAGNI.
- TDD: failing test first. Frontend unit tests live in `src/__tests__/unit/`.
- Do NOT run repo-wide `npm run lint` (large pre-existing baseline); `npm run build` is the type-check gate.
- DRF serializes Decimal fields as strings — coerce with `Number(...)` before arithmetic/`.toFixed`.

---

## File Structure

- Create: `frontend/src/lib/exitPlan.ts` — `computeExitRiskReward`, `buildExitLadder`, `ExitLadderPoint`.
- Create: `frontend/src/hooks/useExitStrategy.ts` — data hook (fetch/delete/default-fill).
- Create: `frontend/src/components/exit/ExitDialogHeader.tsx`
- Create: `frontend/src/components/exit/PlanTab.tsx` (+ internal `GamePlanCards`, `ExitInputs`, `ExitPriceLadder`, `HealthWarnings`, `ThesisField`).
- Create: `frontend/src/components/exit/TransactionsTab.tsx`
- Rewrite: `frontend/src/components/ExitStrategyDialog.tsx` — thin orchestrator.
- Tests: `src/__tests__/unit/exitPlan.test.ts`, `useExitStrategy.test.ts`, `PlanTab.test.tsx`, `TransactionsTab.test.tsx`, `ExitStrategyDialog.test.tsx`.

Reference (current implementation to port/adapt): `frontend/src/components/ExitStrategyDialog.tsx` (full file, 527 lines) — header lines 156-218, game-plan cards 324-366, inputs 369-439, thesis 441-468, transactions table 247-302, save/fetch/delete 59-149, footer 494-510, analysis embed 472-489.

---

## Task 1: Pure plan helpers (`lib/exitPlan.ts`)

**Files:**
- Create: `frontend/src/lib/exitPlan.ts`
- Test: `frontend/src/__tests__/unit/exitPlan.test.ts`

**Interfaces:**
- Produces:
  - `computeExitRiskReward(cmp?: number, stopLoss?: number, target?: number): number | null` — reward/risk relative to CMP, 2 dp; null if inputs missing or `cmp - stopLoss <= 0`.
  - `interface ExitLadderPoint { key: 'sl'|'entry'|'cmp'|'t1'|'t2'|'t3'; label: string; price: number }`
  - `buildExitLadder(v: { stopLoss?: number; entry?: number; cmp?: number; t1?: number; t2?: number; t3?: number }): ExitLadderPoint[]` — descending by price (top = highest); includes only present points; always entry + cmp (when finite).

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/__tests__/unit/exitPlan.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeExitRiskReward, buildExitLadder } from '@/lib/exitPlan';

describe('computeExitRiskReward', () => {
    it('computes reward over risk vs CMP to 2 dp', () => {
        expect(computeExitRiskReward(548, 480, 600)).toBeCloseTo(0.76, 2);
    });
    it('returns null when inputs missing', () => {
        expect(computeExitRiskReward(undefined, 480, 600)).toBeNull();
        expect(computeExitRiskReward(548, undefined, 600)).toBeNull();
    });
    it('returns null when risk is not positive', () => {
        expect(computeExitRiskReward(480, 480, 600)).toBeNull();
    });
});

describe('buildExitLadder', () => {
    it('orders present points descending by price', () => {
        const out = buildExitLadder({ stopLoss: 480, entry: 520, cmp: 548, t1: 600, t2: 650, t3: 700 });
        expect(out.map(p => p.key)).toEqual(['t3', 't2', 't1', 'cmp', 'entry', 'sl']);
    });
    it('omits missing optional points but keeps entry + cmp', () => {
        const out = buildExitLadder({ entry: 520, cmp: 548 });
        expect(out.map(p => p.key)).toEqual(['cmp', 'entry']);
    });
    it('drops non-finite values (empty inputs)', () => {
        const out = buildExitLadder({ stopLoss: NaN, entry: 520, cmp: 548, t1: 600 });
        expect(out.map(p => p.key)).toEqual(['t1', 'cmp', 'entry']);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/__tests__/unit/exitPlan.test.ts`
Expected: FAIL — cannot resolve `@/lib/exitPlan`.

- [ ] **Step 3: Implement the helpers**

Create `frontend/src/lib/exitPlan.ts`:

```ts
export function computeExitRiskReward(
    cmp?: number, stopLoss?: number, target?: number,
): number | null {
    if (cmp == null || stopLoss == null || target == null) return null;
    const risk = cmp - stopLoss;
    if (risk <= 0) return null;
    return Math.round(((target - cmp) / risk) * 100) / 100;
}

export interface ExitLadderPoint {
    key: 'sl' | 'entry' | 'cmp' | 't1' | 't2' | 't3';
    label: string;
    price: number;
}

export function buildExitLadder(v: {
    stopLoss?: number; entry?: number; cmp?: number; t1?: number; t2?: number; t3?: number;
}): ExitLadderPoint[] {
    const always = new Set<ExitLadderPoint['key']>(['entry', 'cmp']);
    const candidates: Array<[ExitLadderPoint['key'], string, number | undefined]> = [
        ['t3', 'T3', v.t3], ['t2', 'T2', v.t2], ['t1', 'T1', v.t1],
        ['cmp', 'CMP', v.cmp], ['entry', 'Entry', v.entry], ['sl', 'SL', v.stopLoss],
    ];
    return candidates
        .filter(([key, , value]) => always.has(key) || value != null)
        .map(([key, label, value]) => ({ key, label, price: Number(value) }))
        .filter(point => Number.isFinite(point.price))
        .sort((a, b) => b.price - a.price);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/__tests__/unit/exitPlan.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/exitPlan.ts frontend/src/__tests__/unit/exitPlan.test.ts
git commit -m "feat(exit): pure exit-plan helpers (risk/reward, price ladder)"
```

---

## Task 2: `useExitStrategy` data hook

**Files:**
- Create: `frontend/src/hooks/useExitStrategy.ts`
- Test: `frontend/src/__tests__/unit/useExitStrategy.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `useExitStrategy(portfolioItem, open): { loading, strategies, healthWarnings, currentPrice, wacc, isUnderwater, transactions, defaults, refresh }` where `defaults = { sl, tp, tp2, tp3 }` (strings) computed from the saved item, falling back to `strategies.fixed` when the item has no `stop_loss_price`. Types below.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/__tests__/unit/useExitStrategy.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import api from '@/lib/api';
import { useExitStrategy } from '@/hooks/useExitStrategy';

vi.mock('@/lib/api', () => ({ default: { get: vi.fn(), delete: vi.fn() } }));

const suggestResponse = {
    data: {
        current_price: 548, wacc: 520, is_underwater: false,
        strategies: { fixed: { name: 'Fixed', sl: 494, tp: 602, tp2: 650, tp3: null, desc: 'x' } },
        health_warnings: [], transactions: [],
    },
};

describe('useExitStrategy', () => {
    afterEach(() => vi.clearAllMocks());

    it('default-fills SL/TP from strategies.fixed when item has no stop loss', async () => {
        (api.get as ReturnType<typeof vi.fn>).mockResolvedValue(suggestResponse);
        const item = { id: 5, ticker: 'NABIL', quantity: 100 } as never;
        const { result } = renderHook(() => useExitStrategy(item, true));
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.defaults).toEqual({ sl: '494.00', tp: '602.00', tp2: '650.00', tp3: '' });
        expect(result.current.currentPrice).toBe(548);
    });

    it('uses the item\'s saved values when present', async () => {
        (api.get as ReturnType<typeof vi.fn>).mockResolvedValue(suggestResponse);
        const item = { id: 5, ticker: 'NABIL', quantity: 100, stop_loss_price: 500, target_price: 610 } as never;
        const { result } = renderHook(() => useExitStrategy(item, true));
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.defaults.sl).toBe('500');
        expect(result.current.defaults.tp).toBe('610');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/unit/useExitStrategy.test.ts`
Expected: FAIL — cannot resolve `@/hooks/useExitStrategy`.

- [ ] **Step 3: Implement the hook**

Create `frontend/src/hooks/useExitStrategy.ts`:

```ts
import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import type { PortfolioItem } from '@/components/PortfolioTable';

export interface StrategyOption { name: string; sl: number; tp: number; tp2?: number | null; tp3?: number | null; desc: string; }
export interface HealthWarning { type: string; message: string; severity: 'LOW' | 'MEDIUM' | 'HIGH'; }
export interface ExitDefaults { sl: string; tp: string; tp2: string; tp3: string; }

const str = (v: number | null | undefined) => (v == null ? '' : v.toString());

function deriveDefaults(item: PortfolioItem, strategies: Record<string, StrategyOption>): ExitDefaults {
    if (!item.stop_loss_price && strategies.fixed) {
        const d = strategies.fixed;
        return { sl: d.sl.toFixed(2), tp: d.tp.toFixed(2), tp2: d.tp2 ? d.tp2.toFixed(2) : '', tp3: d.tp3 ? d.tp3.toFixed(2) : '' };
    }
    return { sl: str(item.stop_loss_price), tp: str(item.target_price), tp2: str(item.target_price_2), tp3: str(item.target_price_3) };
}

export function useExitStrategy(portfolioItem: PortfolioItem | null, open: boolean) {
    const [loading, setLoading] = useState(true);
    const [strategies, setStrategies] = useState<Record<string, StrategyOption>>({});
    const [healthWarnings, setHealthWarnings] = useState<HealthWarning[]>([]);
    const [currentPrice, setCurrentPrice] = useState(0);
    const [wacc, setWacc] = useState(0);
    const [isUnderwater, setIsUnderwater] = useState(false);
    const [transactions, setTransactions] = useState<Record<string, unknown>[]>([]);
    const [defaults, setDefaults] = useState<ExitDefaults>({ sl: '', tp: '', tp2: '', tp3: '' });
    const [tick, setTick] = useState(0);

    const refresh = useCallback(() => setTick(t => t + 1), []);

    useEffect(() => {
        if (!open || !portfolioItem) return;
        let active = true;
        setLoading(true);
        api.get(`/api/stocks/portfolio/${portfolioItem.id}/suggest_exits/`)
            .then(res => {
                if (!active) return;
                const d = res.data;
                setStrategies(d.strategies || {});
                setHealthWarnings(d.health_warnings || []);
                setCurrentPrice(d.current_price);
                setWacc(d.wacc);
                setIsUnderwater(d.is_underwater);
                setTransactions(d.transactions || []);
                setDefaults(deriveDefaults(portfolioItem, d.strategies || {}));
            })
            .catch(err => console.error('Failed to fetch exit suggestions', err))
            .finally(() => active && setLoading(false));
        return () => { active = false; };
    }, [open, portfolioItem, tick]);

    return { loading, strategies, healthWarnings, currentPrice, wacc, isUnderwater, transactions, defaults, refresh };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/__tests__/unit/useExitStrategy.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useExitStrategy.ts frontend/src/__tests__/unit/useExitStrategy.test.ts
git commit -m "feat(exit): useExitStrategy data hook with default-fill"
```

---

## Task 3: Plan tab components

**Files:**
- Create: `frontend/src/components/exit/ExitDialogHeader.tsx`
- Create: `frontend/src/components/exit/PlanTab.tsx`
- Test: `frontend/src/__tests__/unit/PlanTab.test.tsx`

**Interfaces:**
- Consumes: `computeExitRiskReward`, `buildExitLadder`, `ExitLadderPoint` (Task 1); `StrategyOption`, `HealthWarning` (Task 2); `PortfolioItem` type.
- Produces:
  - `ExitDialogHeader({ item: PortfolioItem; currentPrice: number; wacc: number; isUnderwater: boolean })`.
  - `interface PlanTabProps { strategies: Record<string, StrategyOption>; healthWarnings: HealthWarning[]; currentPrice: number; wacc: number; sl: string; tp: string; tp2: string; tp3: string; thesis: string; selectedStrategy: string; onApplyStrategy(key: string): void; onField(field: 'sl'|'tp'|'tp2'|'tp3'|'thesis', value: string): void }`
  - `PlanTab(props: PlanTabProps)` — renders left editor (GamePlanCards + ExitInputs + live R/R) and right column (ExitPriceLadder from current form values + HealthWarnings), thesis spanning the bottom.

**Layout & content (adapt from current file):**
- `ExitDialogHeader`: title `Exit strategy · {ticker}` (sentence-case), underwater badge `Underwater` (rose) / `Strategic view` (primary outline), a signal pill from `item.signals` (reuse the color map convention: BUY emerald / SELL rose / HOLD·NEUTRAL slate / MIXED amber; omit when absent), and the metric strip `LTP {formatRupees(currentPrice)} · Avg cost {formatRupees(wacc)} · Qty {item.quantity}` plus `P/L {item.gain_loss_percent}%`. Port structure from current lines 156-194 but sentence-case and formatter-based.
- `GamePlanCards` (internal): map `Object.entries(strategies)` to selectable cards (name, SL/TP chips, desc); selected = `selectedStrategy === key`; click → `onApplyStrategy(key)`. Adapt from lines 324-366.
- `ExitInputs` (internal): four number inputs Stop / Target 1 / Target 2 / Target 3 bound to `sl/tp/tp2/tp3` via `onField`; each change also sets strategy to MANUAL upstream (handled in orchestrator's `onField`). Live R/R: `computeExitRiskReward(currentPrice, Number(sl), Number(tp))` rendered as `1:{rr.toFixed(2)}` or `N/A`. Adapt from lines 369-439 but REMOVE the "HARD STOP PROTECTION ACTIVE" badge.
- `ExitPriceLadder` (internal): vertical ladder from `buildExitLadder({ stopLoss: Number(sl), entry: wacc, cmp: currentPrice, t1: Number(tp), t2: Number(tp2), t3: Number(tp3) })`; SL rose, entry slate, CMP indigo highlight, targets emerald; price via `formatNepaliNumber`. Re-renders as inputs change.
- `HealthWarnings` (internal): map `healthWarnings` to alert cards (severity colors), omit when empty. Adapt lines 310-322.
- `ThesisField` (internal): textarea bound to `thesis` via `onField('thesis', ...)`. Adapt lines 448-453. REMOVE the "STK SCORE: STABLE" badge.

Keep each component/sub-function under 30 lines (split as needed). Sentence-case labels throughout.

- [ ] **Step 1: Write the failing component test**

Create `frontend/src/__tests__/unit/PlanTab.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PlanTab } from '@/components/exit/PlanTab';

const baseProps = {
    strategies: { fixed: { name: 'Fixed', sl: 494, tp: 602, desc: 'Fixed % plan' } },
    healthWarnings: [],
    currentPrice: 548, wacc: 520,
    sl: '480', tp: '600', tp2: '', tp3: '', thesis: '',
    selectedStrategy: 'MANUAL',
    onApplyStrategy: vi.fn(),
    onField: vi.fn(),
};

describe('PlanTab', () => {
    it('renders a game-plan card and applies it on click', () => {
        const onApplyStrategy = vi.fn();
        render(<PlanTab {...baseProps} onApplyStrategy={onApplyStrategy} />);
        fireEvent.click(screen.getByText('Fixed'));
        expect(onApplyStrategy).toHaveBeenCalledWith('fixed');
    });

    it('renders the live risk/reward from current inputs', () => {
        render(<PlanTab {...baseProps} />);
        // (600-548)/(548-480) = 0.76
        expect(screen.getByText('1:0.76')).toBeInTheDocument();
    });

    it('renders ladder markers including CMP and SL', () => {
        render(<PlanTab {...baseProps} />);
        expect(screen.getByText('CMP')).toBeInTheDocument();
        expect(screen.getByText('SL')).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/unit/PlanTab.test.tsx`
Expected: FAIL — cannot resolve `@/components/exit/PlanTab`.

- [ ] **Step 3: Implement `ExitDialogHeader` and `PlanTab`**

Create the two files following the Layout & content section above. Build `PlanTab` from internal sub-components (`GamePlanCards`, `ExitInputs`, `ExitPriceLadder`, `HealthWarnings`, `ThesisField`), each a small function in `PlanTab.tsx`, keeping every function ≤30 lines. Use `@/lib/formatters` for money. Wire R/R via `computeExitRiskReward(currentPrice, Number(sl), Number(tp))` rendered `1:${rr.toFixed(2)}` else `N/A`. Wire the ladder via `buildExitLadder(...)` as specified. Port visual structure from the referenced current-file line ranges; remove the two filler badges; sentence-case all labels.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/__tests__/unit/PlanTab.test.tsx`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/exit/ExitDialogHeader.tsx frontend/src/components/exit/PlanTab.tsx frontend/src/__tests__/unit/PlanTab.test.tsx
git commit -m "feat(exit): plan tab (editor + live price ladder) and dialog header"
```

---

## Task 4: Transactions tab

**Files:**
- Create: `frontend/src/components/exit/TransactionsTab.tsx`
- Test: `frontend/src/__tests__/unit/TransactionsTab.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks (takes plain transaction objects).
- Produces: `TransactionsTab({ transactions: Record<string, unknown>[]; onEdit(t): void; onDelete(id: number): void })` — table with columns Date · Type · Reason · Quantity · Rate · Amount · Commission · SEBON · DP · CGT · Receivable, plus edit/delete; empty state when none. Sorted newest first.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/__tests__/unit/TransactionsTab.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TransactionsTab } from '@/components/exit/TransactionsTab';

const tx = {
    id: 9, transaction_date: '2026-06-10T00:00:00Z', transaction_type: 'BUY', reason: 'BETTER_OPPORTUNITY',
    quantity: 100, rate: '520.00', amount: '52000.00', commission: '200.00', sebon_fee: '10.00',
    dp_charge: '25.00', cgt: '0.00', receivable_amount: '51765.00',
};

describe('TransactionsTab', () => {
    it('shows an empty state when there are no transactions', () => {
        render(<TransactionsTab transactions={[]} onEdit={vi.fn()} onDelete={vi.fn()} />);
        expect(screen.getByText(/no transactions/i)).toBeInTheDocument();
    });

    it('renders the reason and fee breakdown, and fires edit/delete', () => {
        const onEdit = vi.fn(); const onDelete = vi.fn();
        render(<TransactionsTab transactions={[tx]} onEdit={onEdit} onDelete={onDelete} />);
        expect(screen.getByText(/BETTER_OPPORTUNITY|Better opportunity/i)).toBeInTheDocument();
        expect(screen.getByText('200.00')).toBeInTheDocument(); // commission surfaced
        fireEvent.click(screen.getByTitle(/edit/i));
        expect(onEdit).toHaveBeenCalled();
        fireEvent.click(screen.getByTitle(/delete/i));
        expect(onDelete).toHaveBeenCalledWith(9);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/unit/TransactionsTab.test.tsx`
Expected: FAIL — cannot resolve `@/components/exit/TransactionsTab`.

- [ ] **Step 3: Implement `TransactionsTab`**

Create `frontend/src/components/exit/TransactionsTab.tsx`. Port the table from current lines 247-302, then: add `Reason`, `Commission`, `SEBON`, `DP`, `CGT`, `Receivable` columns (read `t.reason`, `t.commission`, `t.sebon_fee`, `t.dp_charge`, `t.cgt`, `t.receivable_amount`); keep edit (`onEdit(t)`) and delete (`onDelete(t.id)`) buttons with `title="Edit transaction"` / `title="Delete transaction"`; sort newest first by `transaction_date`. Render an empty state (`No transactions yet.`) when the array is empty. Money via `formatRupees`/`formatNepaliNumber`; keep the function ≤30 lines by extracting a `TransactionRow` sub-component.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/__tests__/unit/TransactionsTab.test.tsx`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/exit/TransactionsTab.tsx frontend/src/__tests__/unit/TransactionsTab.test.tsx
git commit -m "feat(exit): dedicated transactions tab with reason + fee breakdown"
```

---

## Task 5: Reassemble `ExitStrategyDialog` orchestrator

**Files:**
- Rewrite: `frontend/src/components/ExitStrategyDialog.tsx`
- Test: `frontend/src/__tests__/unit/ExitStrategyDialog.test.tsx`

**Interfaces:**
- Consumes: `useExitStrategy` (Task 2), `ExitDialogHeader` + `PlanTab` (Task 3), `TransactionsTab` (Task 4). Keeps existing props `{ open, onOpenChange, portfolioItem, onSave, accounts }`.
- Produces: a dialog rendering ONE `Tabs` with values `plan | transactions | analysis`, default `plan`; analysis renders the existing `DailySignalStatus` unchanged.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/__tests__/unit/ExitStrategyDialog.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import api from '@/lib/api';
import { ExitStrategyDialog } from '@/components/ExitStrategyDialog';

vi.mock('@/lib/api', () => ({ default: { get: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));
vi.mock('@/components/signals/DailySignalStatus', () => ({ DailySignalStatus: () => <div>analysis-engine</div> }));

const item = { id: 5, ticker: 'NABIL', quantity: 100, gain_loss: 0, gain_loss_percent: 0 } as never;

describe('ExitStrategyDialog', () => {
    afterEach(() => vi.clearAllMocks());

    it('renders a single flat tab list: Plan, Transactions, Analysis', async () => {
        (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({
            data: { current_price: 548, wacc: 520, is_underwater: false, strategies: {}, health_warnings: [], transactions: [] },
        });
        render(<ExitStrategyDialog open onOpenChange={vi.fn()} portfolioItem={item} onSave={vi.fn()} accounts={[]} />);
        const tabs = await screen.findAllByRole('tab');
        expect(tabs.map(t => t.textContent)).toEqual(['Plan', 'Transactions', 'Analysis']);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/unit/ExitStrategyDialog.test.tsx`
Expected: FAIL — current dialog has tabs `Deep Technical Analysis` / `Strategy Planner` (or no `plan`/`transactions`/`analysis` tablist).

- [ ] **Step 3: Rewrite the dialog as a thin orchestrator**

Rewrite `frontend/src/components/ExitStrategyDialog.tsx`:
- Keep the same prop interface and the `Dialog`/`DialogContent` shell (roomy; keep generous size so the analysis tab has room).
- Use `useExitStrategy(portfolioItem, open)` for data; hold form state `sl/tp/tp2/tp3/thesis/selectedStrategy` locally, initialised from `defaults` via an effect on `defaults`. `onField(field, value)` updates the field and sets `selectedStrategy` to `'MANUAL'` (except thesis). `onApplyStrategy(key)` applies `strategies[key]` to the inputs and sets `selectedStrategy=key` (port from current lines 109-118).
- `handleSave` PATCHes the same six fields (current lines 120-139); `handleDelete(id)` deletes then `refresh()` (current lines 98-107); keep `TransactionModal` for edit, calling `refresh()` on success.
- Render ONE `Tabs` (default `plan`): `TabsList` with three triggers labelled exactly `Plan`, `Transactions`, `Analysis`; contents render `<PlanTab .../>`, `<TransactionsTab .../>`, and the existing `<DailySignalStatus .../>` block (port current lines 472-489 verbatim — same props). `ExitDialogHeader` above the tabs; footer (Discard changes / Commit strategy) below (port lines 494-510, sentence-case).
- Remove all now-unused imports/state from the old implementation (no dead code).

- [ ] **Step 4: Run test + build**

Run: `cd frontend && npx vitest run src/__tests__/unit/ExitStrategyDialog.test.tsx`
Expected: PASS (tab list is exactly Plan/Transactions/Analysis).

Run: `cd frontend && npm run build`
Expected: `Compiled successfully`; no type errors. (`/portfolio` and `/signals` routes present.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ExitStrategyDialog.tsx frontend/src/__tests__/unit/ExitStrategyDialog.test.tsx
git commit -m "feat(exit): reassemble dialog as single-tab orchestrator (Plan/Transactions/Analysis)"
```

---

## Task 6: Phase 1 regression + deploy

**Files:** none (verification only)

- [ ] **Step 1: Run the exit + neighbouring portfolio unit tests**

Run: `cd frontend && npx vitest run src/__tests__/unit/exitPlan.test.ts src/__tests__/unit/useExitStrategy.test.ts src/__tests__/unit/PlanTab.test.tsx src/__tests__/unit/TransactionsTab.test.tsx src/__tests__/unit/ExitStrategyDialog.test.tsx src/__tests__/unit/HoldingSnapshot.test.tsx`
Expected: all PASS.

- [ ] **Step 2: Production build**

Run: `cd frontend && npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 3: Deploy the frontend image**

Run: `docker-compose up -d --build frontend`
Verify: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000` → `200`.
(No migration. Hard-refresh; open a holding's "View strategies" (target icon) and confirm: default Plan tab, live ladder reacts to input edits, Transactions tab shows reason + fees, Analysis tab still renders the engine.)

---

## Self-Review

**Spec coverage (Phase 1 scope):**
- Single-level tabs `Plan · Transactions · Analysis`, default Plan → Task 5. ✓
- Plan editor + live ladder + warnings + thesis → Tasks 1, 3. ✓
- Dedicated Transactions tab with reason + fees → Task 4. ✓
- Hardcoded filler removed (STK SCORE, HARD STOP) → Task 3. ✓
- Save behaviour unchanged (six PATCH fields) → Task 5. ✓
- Analysis embeds existing DailySignalStatus (Phase 2 flattens) → Task 5. ✓
- Decomposition (hook + helpers + focused components) → Tasks 1-5. ✓
- Frontend-only deploy → Task 6. ✓
- Phase 2 (analysis hook + flat sections) and Phase 3 (Signals rollout + delete engine) are SEPARATE plans, written at their pause points — intentionally not covered here.

**Placeholder scan:** logic tasks (1, 2) carry full code + tests; UI tasks (3, 4, 5) carry full prop interfaces, concrete layout/content rules, exact current-file line ranges to port, and complete test code — the implementer adapts existing JSX rather than inventing it.

**Type consistency:** `computeExitRiskReward(cmp, stopLoss, target)` and `buildExitLadder({stopLoss, entry, cmp, t1, t2, t3})` (Task 1) match their calls in Task 3; `useExitStrategy` return shape (Task 2) matches the orchestrator's usage (Task 5); `PlanTabProps`/`TransactionsTab` props (Tasks 3, 4) match the orchestrator's wiring (Task 5); tab labels `Plan`/`Transactions`/`Analysis` match the Task 5 test.
