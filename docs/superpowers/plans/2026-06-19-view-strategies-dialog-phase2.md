# Analysis Engine Rewrite — Phase 2 Implementation Plan (shared hook + flat sections)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dialog's single nested "Analysis" tab with four flat top-level tabs (`Signals · Technicals · Fundamentals · Accumulation`) backed by a shared `useTickerAnalysis` hook + four section components that re-present today's data.

**Architecture:** A `useTickerAnalysis(symbol)` hook fires the existing six API calls and normalises them into one typed `TickerAnalysisData`; pure helpers in `lib/tickerAnalysis.ts` carry the derived computations (technical-bias aggregate, health score, confluence, indicator lookup, % helpers); four presentational sections under `components/analysis/` consume the hook's data. The dialog composes them into its single `Tabs`. The shared `DailySignalStatus` stays in place this phase (deleted in Phase 3).

**Tech Stack:** Next.js 16 / React 19, TypeScript, Vitest + Testing Library, recharts (existing), lucide-react.

## Global Constraints

- Re-present EXISTING data only; no backend change; same six endpoints as `DailySignalStatus` today. No new analytics (→ sub-project D).
- Single-level tabs: end-state dialog bar `Plan · Transactions · Signals · Technicals · Fundamentals · Accumulation`. No nested tablist.
- Money/number formatting via `@/lib/formatters`; missing values render `N/A`/`—`.
- DRF decimals/strings: coerce with `Number(...)` before arithmetic/`.toFixed`.
- Warm sans, sentence-case, no all-caps; 30-line hard limit per function; SOLID; no magic strings (named maps/consts); DRY; YAGNI.
- TDD: failing test first. Frontend unit tests in `src/__tests__/unit/`.
- Do NOT run repo-wide `npm run lint`; `npm run build` is the type-check gate.
- Phase 2 does NOT touch `IntelHubClient` or delete `DailySignalStatus` (Phase 3).

---

## Data contract (source of truth for field paths)

The six calls and the exact fields each section needs (from the current `DailySignalStatus`):

1. `GET /api/stocks/details/${symbol}/` → `price{last_price,volume,turnover}`, `fundamental{pe_ratio_unaudited|pe_ratio, eps_unaudited|eps, book_value_unaudited|book_value, price_to_book, ro_equity, dividend_yield, market_cap, yoy_earnings_growth, qoq_earnings_growth, debt_to_equity, sector, fifty_two_week_high, fifty_two_week_low, day_high, day_low, fundamental_indicators[], broker_accumulation{'1M'[],'AT'[]}}`, `company{name,sector}`, `technical_indicators[]` (rows `{name, value, raw_value}` matched by `name.toUpperCase().includes(...)`).
2. `GET /api/stocks/signals/?symbol=${symbol}&page_size=10` → `results[]` `{date, signal, strategy_name, last_close}`.
3. `GET /api/stocks/batch-indicators/?symbols=${symbol}` → `[symbol]{ltp, rsi, macd, macd_hist, macd_signal, roc, trends{'5d','10d','1m'}}`.
4. `GET /api/stocks/companies/accumulation/?range=1W` → array; entry where `symbol===symbol` → `{accumulation_ratio, net_qty}`.
5. `GET /api/stocks/fibonacci/${symbol}/` (catch→null) → `{trend, nearest_support, nearest_resistance, levels[]{ratio, price, is_above, distance_pct}}`.
6. `GET /api/stocks/generated-signals/latest/` (catch→[]) → array filtered `symbol===symbol` → `{source, signal, signal_tier, strength}`.

Indicator name needles (Call 1 `technical_indicators`): `50-DAY SMA`, `200-DAY SMA`, `ATR`, `ADX`, `VWAP`, `BOLLINGER`/`BB%B`, `PIVOT (P)`/`PIVOT`, `RESISTANCE 1`/`R1`, `SUPPORT 1`/`S1`, `CCI`, `WILLIAMS`, `MFI`, `ULTIMATE`, `STOCHASTIC (%D)`/`%D`, `STOCHASTIC`/`%K`, `AROON UP`, `AROON DOWN`, `PSAR`, `CMF`, `OBV`.

Reference component to re-present (with the section line ranges): `frontend/src/components/signals/DailySignalStatus.tsx` — overview/Signals 450-867, Technicals 870-1123, Fundamentals 1125-1306, Accumulators 1309-1313, PriceLadder 82-178, derived computations 63-78 / 262-266 / 900-915 / 1181.

---

## File Structure

- Create: `frontend/src/lib/tickerAnalysis.ts` — pure helpers + types.
- Create: `frontend/src/hooks/useTickerAnalysis.ts` — six-call fetch + normalisation → `TickerAnalysisData`.
- Create: `frontend/src/components/analysis/SignalsSection.tsx`
- Create: `frontend/src/components/analysis/TechnicalsSection.tsx`
- Create: `frontend/src/components/analysis/FundamentalsSection.tsx`
- Create: `frontend/src/components/analysis/AccumulationSection.tsx`
- Modify: `frontend/src/components/ExitStrategyDialog.tsx` — replace the single `analysis` tab with four flat tabs fed by `useTickerAnalysis`.
- Tests: `tickerAnalysis.test.ts`, `useTickerAnalysis.test.ts`, `SignalsSection.test.tsx`, `TechnicalsSection.test.tsx`, `FundamentalsSection.test.tsx`, `ExitStrategyDialog.test.tsx` (update to six tabs).

---

## Task 1: Pure analysis helpers (`lib/tickerAnalysis.ts`)

**Files:**
- Create: `frontend/src/lib/tickerAnalysis.ts`
- Test: `frontend/src/__tests__/unit/tickerAnalysis.test.ts`

**Interfaces — Produces:**
- `interface IndicatorRow { name: string; value: string; raw_value?: string | number }`
- `findIndicator(rows: IndicatorRow[] | undefined, ...needles: string[]): number | null`
- `type Lean = 'bullish' | 'bearish' | 'neutral'`
- `interface BiasInput { rsi: number|null; macd: number|null; macdSignal: number|null; stochK: number|null; cci: number|null; williamsR: number|null; mfi: number|null; roc: number|null; adx: number|null; trend5d: number|null; sma50: number|null; sma200: number|null; cmf: number|null; cmp: number|null }`
- `interface BiasResult { rating: 'Strong Buy'|'Buy'|'Neutral'|'Sell'|'Strong Sell'; bull: number; bear: number; neutral: number; total: number }`
- `computeTechnicalBias(i: BiasInput): BiasResult`
- `computeHealthScore(roe?: number|null, pe?: number|null, de?: number|null): number`
- `computeConfluence(signals: { signal: string }[], direction: string): { agree: number; total: number }`
- `pctReturn(price?: number|null, entry?: number|null): number | null` (signed, 1 dp)

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/__tests__/unit/tickerAnalysis.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
    findIndicator, computeTechnicalBias, computeHealthScore, computeConfluence, pctReturn,
} from '@/lib/tickerAnalysis';

const rows = [
    { name: '50-Day SMA', value: '510.0', raw_value: 510 },
    { name: 'ATR (14)', value: '12.3', raw_value: 12.3 },
];

describe('findIndicator', () => {
    it('matches by case-insensitive substring and returns the numeric value', () => {
        expect(findIndicator(rows, '50-DAY SMA')).toBe(510);
        expect(findIndicator(rows, 'ATR')).toBe(12.3);
    });
    it('returns null when no row matches or rows missing', () => {
        expect(findIndicator(rows, 'RSI')).toBeNull();
        expect(findIndicator(undefined, 'ATR')).toBeNull();
    });
});

describe('computeTechnicalBias', () => {
    it('rates Strong Buy when bullish dominates by >2', () => {
        const r = computeTechnicalBias({
            rsi: 25, macd: 2, macdSignal: 1, stochK: 10, cci: -150, williamsR: -90,
            mfi: 10, roc: 5, adx: 30, trend5d: 1, sma50: 510, sma200: 500, cmf: 0.1, cmp: 520,
        });
        expect(r.rating).toBe('Strong Buy');
        expect(r.bull + r.bear + r.neutral).toBe(10);
        expect(r.total).toBe(10);
    });
    it('is Neutral when balanced', () => {
        const r = computeTechnicalBias({
            rsi: 50, macd: 1, macdSignal: 1, stochK: 50, cci: 0, williamsR: -50,
            mfi: 50, roc: 0, adx: 10, trend5d: 0, sma50: 500, sma200: 500, cmf: 0, cmp: 500,
        });
        expect(r.rating).toBe('Neutral');
    });
});

describe('computeHealthScore', () => {
    it('adds PE and D/E bonuses on top of ROE, capped at 100', () => {
        expect(computeHealthScore(18, 14, 0.4)).toBe(58);
        expect(computeHealthScore(90, 10, 0.2)).toBe(100);
    });
    it('treats missing inputs as no bonus', () => {
        expect(computeHealthScore(null, null, null)).toBe(0);
    });
});

describe('computeConfluence', () => {
    it('counts signals agreeing with the direction', () => {
        expect(computeConfluence([{ signal: 'BUY' }, { signal: 'SELL' }, { signal: 'BUY' }], 'BUY'))
            .toEqual({ agree: 2, total: 3 });
    });
});

describe('pctReturn', () => {
    it('computes signed percent to 1 dp', () => {
        expect(pctReturn(600, 520)).toBeCloseTo(15.4, 1);
    });
    it('returns null when inputs missing', () => {
        expect(pctReturn(undefined, 520)).toBeNull();
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/__tests__/unit/tickerAnalysis.test.ts`
Expected: FAIL — cannot resolve `@/lib/tickerAnalysis`.

- [ ] **Step 3: Implement the helpers**

Create `frontend/src/lib/tickerAnalysis.ts`:

```ts
export interface IndicatorRow { name: string; value: string; raw_value?: string | number; }
export type Lean = 'bullish' | 'bearish' | 'neutral';

export function findIndicator(rows: IndicatorRow[] | undefined, ...needles: string[]): number | null {
    if (!rows) return null;
    const upper = needles.map(n => n.toUpperCase());
    const row = rows.find(r => upper.some(n => r.name?.toUpperCase().includes(n)));
    if (!row) return null;
    const v = Number(row.raw_value ?? row.value);
    return Number.isFinite(v) ? v : null;
}

export interface BiasInput {
    rsi: number | null; macd: number | null; macdSignal: number | null; stochK: number | null;
    cci: number | null; williamsR: number | null; mfi: number | null; roc: number | null;
    adx: number | null; trend5d: number | null; sma50: number | null; sma200: number | null;
    cmf: number | null; cmp: number | null;
}
export interface BiasResult {
    rating: 'Strong Buy' | 'Buy' | 'Neutral' | 'Sell' | 'Strong Sell';
    bull: number; bear: number; neutral: number; total: number;
}

const lean = (bull: boolean, bear: boolean): Lean => (bull ? 'bullish' : bear ? 'bearish' : 'neutral');
const gt = (a: number | null, b: number | null) => a != null && b != null && a > b;

function biasLeans(i: BiasInput): Lean[] {
    return [
        lean(i.rsi != null && i.rsi < 30, i.rsi != null && i.rsi > 70),
        lean(gt(i.macd, i.macdSignal), gt(i.macdSignal, i.macd)),
        lean(i.stochK != null && i.stochK < 20, i.stochK != null && i.stochK > 80),
        lean(i.cci != null && i.cci < -100, i.cci != null && i.cci > 100),
        lean(i.williamsR != null && i.williamsR < -80, i.williamsR != null && i.williamsR > -20),
        lean(i.mfi != null && i.mfi < 20, i.mfi != null && i.mfi > 80),
        lean(i.roc != null && i.roc > 2, i.roc != null && i.roc < -2),
        lean(gt(i.adx, 25) && gt(i.trend5d, 0), gt(i.adx, 25) && gt(0, i.trend5d)),
        lean(gt(i.cmp, i.sma50) && gt(i.sma50, i.sma200), gt(i.sma50, i.cmp) && gt(i.sma200, i.sma50)),
        lean(i.cmf != null && i.cmf > 0.05, i.cmf != null && i.cmf < -0.05),
    ];
}

function rate(bull: number, bear: number): BiasResult['rating'] {
    if (bull > bear + 2) return 'Strong Buy';
    if (bull > bear) return 'Buy';
    if (bear > bull + 2) return 'Strong Sell';
    if (bear > bull) return 'Sell';
    return 'Neutral';
}

export function computeTechnicalBias(i: BiasInput): BiasResult {
    const leans = biasLeans(i);
    const bull = leans.filter(l => l === 'bullish').length;
    const bear = leans.filter(l => l === 'bearish').length;
    return { rating: rate(bull, bear), bull, bear, neutral: leans.length - bull - bear, total: leans.length };
}

export function computeHealthScore(roe?: number | null, pe?: number | null, de?: number | null): number {
    const base = (Number(roe) || 0) + ((pe ?? 99) < 25 ? 20 : 0) + ((de ?? 99) < 1 ? 20 : 0);
    return Math.min(100, Math.max(0, Math.round(base)));
}

export function computeConfluence(signals: { signal: string }[], direction: string): { agree: number; total: number } {
    return { agree: signals.filter(s => s.signal === direction).length, total: signals.length };
}

export function pctReturn(price?: number | null, entry?: number | null): number | null {
    if (price == null || entry == null || entry === 0) return null;
    return Math.round(((price - entry) / entry) * 1000) / 10;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/__tests__/unit/tickerAnalysis.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/tickerAnalysis.ts frontend/src/__tests__/unit/tickerAnalysis.test.ts
git commit -m "feat(analysis): pure ticker-analysis helpers (bias, health, confluence, indicator lookup)"
```

---

## Task 2: `useTickerAnalysis` hook

**Files:**
- Create: `frontend/src/hooks/useTickerAnalysis.ts`
- Test: `frontend/src/__tests__/unit/useTickerAnalysis.test.ts`

**Interfaces:**
- Consumes: `findIndicator`, `IndicatorRow` (Task 1).
- Produces: `useTickerAnalysis(symbol?: string): { loading: boolean; error: boolean; data: TickerAnalysisData | null }` where `TickerAnalysisData` is the normalised object below. The hook fires the six calls concurrently (calls 5 and 6 swallow errors → null/[]); on a core-call failure sets `error: true` (does not throw).

```ts
export interface TickerAnalysisData {
    price: { cmp: number | null; dayHigh: number | null; dayLow: number | null; w52High: number | null; w52Low: number | null; volume: number | null; turnover: number | null };
    live: { rsi: number | null; macd: number | null; macdSignal: number | null; macdHist: number | null; roc: number | null; trend5d: number | null; trend10d: number | null; trend1m: number | null };
    fundamentals: { pe: number | null; eps: number | null; bookValue: number | null; priceToBook: number | null; roe: number | null; divYield: number | null; marketCap: number | null; yoyGrowth: number | null; qoqGrowth: number | null; debtEquity: number | null; sector: string | null; indicators: Array<{ name: string; value: string; sector_high: number; sector_low: number }> };
    technicals: { sma50: number | null; sma200: number | null; atr: number | null; adx: number | null; vwap: number | null; bbp: number | null; pivotP: number | null; pivotS1: number | null; pivotR1: number | null; cci: number | null; williamsR: number | null; mfi: number | null; ultimateOsc: number | null; stochK: number | null; stochD: number | null; aroonUp: number | null; aroonDown: number | null; psar: number | null; cmf: number | null; obv: number | null };
    accumulation: { ratio: number; netQty: number } | null;
    fibonacci: { trend: string; nearestSupport: number; nearestResistance: number; levels: Array<{ ratio: number | null; price: number; is_above: boolean; distance_pct: number | null }> } | null;
    generatedSignals: Array<{ source: string; signal: string; signal_tier: string; strength: number }>;
    history: Array<{ date: string; signal: string; strategy_name: string; last_close: string }>;
    brokers: Array<{ broker: string | number; wac: number; type: string }>;
    company: { name: string | null; sector: string | null };
}
```

- [ ] **Step 1: Write the failing test**

Create `frontend/src/__tests__/unit/useTickerAnalysis.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import api from '@/lib/api';
import { useTickerAnalysis } from '@/hooks/useTickerAnalysis';

vi.mock('@/lib/api', () => ({ default: { get: vi.fn() } }));

function routeGet(url: string) {
    if (url.includes('/details/')) return Promise.resolve({ data: {
        price: { last_price: 548, volume: 1000, turnover: 50000 },
        fundamental: { pe_ratio: 14.2, eps: 38, ro_equity: 18, debt_to_equity: 0.4, dividend_yield: 2.1, sector: 'Banking', fifty_two_week_high: 700, fifty_two_week_low: 400, day_high: 555, day_low: 540, fundamental_indicators: [], broker_accumulation: { '1M': [], AT: [] } },
        company: { name: 'Nabil Bank', sector: 'Banking' },
        technical_indicators: [{ name: '50-Day SMA', value: '510', raw_value: 510 }, { name: 'ATR (14)', value: '12', raw_value: 12 }],
    } });
    if (url.includes('/signals/')) return Promise.resolve({ data: { results: [{ date: '2026-06-10', signal: 'BUY', strategy_name: 'X', last_close: '540' }] } });
    if (url.includes('/batch-indicators/')) return Promise.resolve({ data: { NABIL: { ltp: 548, rsi: 60, macd: 2, macd_signal: 1, macd_hist: 1, roc: 3, trends: { '5d': 1, '10d': 2, '1m': 5 } } } });
    if (url.includes('/companies/accumulation/')) return Promise.resolve({ data: [{ symbol: 'NABIL', accumulation_ratio: 65, net_qty: 1200 }] });
    if (url.includes('/fibonacci/')) return Promise.resolve({ data: { trend: 'UPTREND', nearest_support: 530, nearest_resistance: 560, levels: [] } });
    if (url.includes('/generated-signals/')) return Promise.resolve({ data: [{ symbol: 'NABIL', source: 'eng', signal: 'BUY', signal_tier: 'A', strength: 80 }] });
    return Promise.resolve({ data: {} });
}

describe('useTickerAnalysis', () => {
    afterEach(() => vi.clearAllMocks());

    it('normalises the six calls into structured data', async () => {
        (api.get as ReturnType<typeof vi.fn>).mockImplementation((url: string) => routeGet(url));
        const { result } = renderHook(() => useTickerAnalysis('NABIL'));
        await waitFor(() => expect(result.current.loading).toBe(false));
        const d = result.current.data!;
        expect(d.price.cmp).toBe(548);
        expect(d.technicals.sma50).toBe(510);
        expect(d.technicals.atr).toBe(12);
        expect(d.fundamentals.roe).toBe(18);
        expect(d.accumulation).toEqual({ ratio: 65, netQty: 1200 });
        expect(d.generatedSignals).toHaveLength(1);
        expect(d.history).toHaveLength(1);
        expect(result.current.error).toBe(false);
    });

    it('sets error when a core call fails', async () => {
        (api.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
        const { result } = renderHook(() => useTickerAnalysis('NABIL'));
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.error).toBe(true);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/unit/useTickerAnalysis.test.ts`
Expected: FAIL — cannot resolve `@/hooks/useTickerAnalysis`.

- [ ] **Step 3: Implement the hook**

Create `frontend/src/hooks/useTickerAnalysis.ts`. Fire the six `api.get` calls concurrently (calls 5 & 6 `.catch(() => default)`), then normalise into `TickerAnalysisData` using `findIndicator(technical_indicators, ...needles)` (needle list from the Data contract) for every `technicals.*` field, the fundamental field fallbacks (`pe_ratio_unaudited ?? pe_ratio`, etc.), the accumulation array filter by symbol, brokers from `broker_accumulation['1M']` filtered to `type==='BUY'`, and `cmp = batch.ltp ?? price.last_price ?? fundamental.last_price ?? null`. Wrap the core calls (1-4) in try/catch → `error: true`. Extract normalisation into small `parse*` helpers so no function exceeds 30 lines. Use an `active` flag for race-safety and depend on `[symbol]`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/__tests__/unit/useTickerAnalysis.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useTickerAnalysis.ts frontend/src/__tests__/unit/useTickerAnalysis.test.ts
git commit -m "feat(analysis): useTickerAnalysis hook normalising the six analysis calls"
```

---

## Task 3: SignalsSection

**Files:**
- Create: `frontend/src/components/analysis/SignalsSection.tsx`
- Test: `frontend/src/__tests__/unit/SignalsSection.test.tsx`

**Interfaces:**
- Consumes: `TickerAnalysisData` (Task 2); `pctReturn`, `computeConfluence` (Task 1); the existing `lib/holdingSnapshot` or `lib/exitPlan` ladder is NOT reused here (this ladder is the analysis price ladder).
- Produces: `SignalsSection({ data, ladder }: { data: TickerAnalysisData; ladder: { cmp?: number; entry?: number; stopLoss?: number; tp1?: number; tp2?: number; tp3?: number; direction: 'BUY'|'SELL' } })`.

**Content (re-present from DailySignalStatus overview tab, lines 450-867 + PriceLadder 82-178):** price ladder (SL·entry·CMP·T1-3, horizontal) at the top; signal-confluence card (list `data.generatedSignals` with source/tier/signal/strength, header `agree/total` via `computeConfluence(generatedSignals, ladder.direction)`); institutional-flow card from `data.accumulation` (ACCUMULATING/DISTRIBUTING by `netQty`, bar at `ratio%`); trade-targets card (T1/T2/T3 price + `pctReturn(tp, entry)`); fibonacci card from `data.fibonacci`; pivot cluster (`technicals.pivotS1/pivotP/pivotR1`); volatility mini (ATR, ADX strong/ranging); signal-history list (`data.history` BUY/SELL, first 5). Omit any card whose data is null/empty. Sentence-case; money via formatters; keep each function ≤30 lines (extract sub-cards).

- [ ] **Step 1: Write the failing test**

Create `frontend/src/__tests__/unit/SignalsSection.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SignalsSection } from '@/components/analysis/SignalsSection';

const data = {
    price: { cmp: 548, dayHigh: 555, dayLow: 540, w52High: 700, w52Low: 400, volume: 1000, turnover: 50000 },
    live: { rsi: 60, macd: 2, macdSignal: 1, macdHist: 1, roc: 3, trend5d: 1, trend10d: 2, trend1m: 5 },
    fundamentals: { pe: 14, eps: 38, bookValue: null, priceToBook: 1.9, roe: 18, divYield: 2, marketCap: null, yoyGrowth: 12, qoqGrowth: 4, debtEquity: 0.4, sector: 'Banking', indicators: [] },
    technicals: { sma50: 510, sma200: 500, atr: 12, adx: 32, vwap: 545, bbp: 0.6, pivotP: 548, pivotS1: 530, pivotR1: 560, cci: 0, williamsR: -50, mfi: 50, ultimateOsc: 55, stochK: 40, stochD: 42, aroonUp: 70, aroonDown: 30, psar: 540, cmf: 0.1, obv: 1000 },
    accumulation: { ratio: 65, netQty: 1200 },
    fibonacci: { trend: 'UPTREND', nearestSupport: 530, nearestResistance: 560, levels: [] },
    generatedSignals: [{ source: 'eng', signal: 'BUY', signal_tier: 'A', strength: 80 }],
    history: [{ date: '2026-06-10', signal: 'BUY', strategy_name: 'Momentum', last_close: '540' }],
    brokers: [], company: { name: 'Nabil', sector: 'Banking' },
} as never;

const ladder = { cmp: 548, entry: 520, stopLoss: 480, tp1: 600, tp2: 650, direction: 'BUY' as const };

describe('SignalsSection', () => {
    it('renders the ladder, a confluence signal, and institutional flow', () => {
        render(<SignalsSection data={data} ladder={ladder} />);
        expect(screen.getByText('CMP')).toBeInTheDocument();
        expect(screen.getByText(/Accumulating/i)).toBeInTheDocument();
        expect(screen.getByText('Momentum')).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/unit/SignalsSection.test.tsx`
Expected: FAIL — cannot resolve `@/components/analysis/SignalsSection`.

- [ ] **Step 3: Implement `SignalsSection`**

Build per the Content contract above; re-present the visual structure from `DailySignalStatus` lines 450-867 and the price ladder 82-178. Extract sub-cards (`SignalLadder`, `ConfluenceCard`, `FlowCard`, `TargetsCard`, `FibonacciCard`, `HistoryList`) so each function ≤30 lines. Money via `@/lib/formatters`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/__tests__/unit/SignalsSection.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/analysis/SignalsSection.tsx frontend/src/__tests__/unit/SignalsSection.test.tsx
git commit -m "feat(analysis): flat SignalsSection (ladder, confluence, flow, targets, fibonacci, history)"
```

---

## Task 4: TechnicalsSection

**Files:**
- Create: `frontend/src/components/analysis/TechnicalsSection.tsx`
- Test: `frontend/src/__tests__/unit/TechnicalsSection.test.tsx`

**Interfaces:**
- Consumes: `TickerAnalysisData` (Task 2); `computeTechnicalBias` (Task 1).
- Produces: `TechnicalsSection({ data }: { data: TickerAnalysisData })`.

**Content (re-present from DailySignalStatus technicals tab, lines 870-1123):** technical-bias hero from `computeTechnicalBias({...data.live, ...data.technicals, cmp: data.price.cmp})` (rating + bull/neutral/bear counts of `total`); momentum oscillators grid (RSI, Stoch %K, CCI, MFI, Williams %R, Ultimate Osc, ROC, Stoch %D — each a labelled gauge/value, `N/A` when null); trend intelligence (MACD line/signal/hist, ADX strong/weak, SMA 50/200 golden/death cross, PSAR vs CMP, Aroon up/down); volume pressure (CMF + bar, OBV, VWAP distance % = `(cmp - vwap)/vwap*100`); volatility & channels (ATR + daily range % = `atr/cmp*100`, Bollinger %B). Sentence-case; ≤30-line functions (extract `OscGauge`, `TrendCard`, `VolumeCard`, `VolatilityCard`).

- [ ] **Step 1: Write the failing test**

Create `frontend/src/__tests__/unit/TechnicalsSection.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { TechnicalsSection } from '@/components/analysis/TechnicalsSection';

const data = {
    price: { cmp: 548 }, live: { rsi: 25, macd: 2, macdSignal: 1, macdHist: 1, roc: 5, trend5d: 1, trend10d: 1, trend1m: 1 },
    technicals: { sma50: 510, sma200: 500, atr: 12, adx: 32, vwap: 545, bbp: 0.6, pivotP: 548, pivotS1: 530, pivotR1: 560, cci: -150, williamsR: -90, mfi: 10, ultimateOsc: 55, stochK: 10, stochD: 12, aroonUp: 70, aroonDown: 30, psar: 540, cmf: 0.1, obv: 1000 },
    fundamentals: {}, accumulation: null, fibonacci: null, generatedSignals: [], history: [], brokers: [], company: {},
} as never;

describe('TechnicalsSection', () => {
    it('renders the technical-bias rating and an oscillator label', () => {
        render(<TechnicalsSection data={data} />);
        expect(screen.getByText('Strong Buy')).toBeInTheDocument();
        expect(screen.getByText('RSI')).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/unit/TechnicalsSection.test.tsx`
Expected: FAIL — cannot resolve the module.

- [ ] **Step 3: Implement `TechnicalsSection`** per the Content contract; re-present from lines 870-1123; extract sub-components to honour the 30-line limit.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/__tests__/unit/TechnicalsSection.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/analysis/TechnicalsSection.tsx frontend/src/__tests__/unit/TechnicalsSection.test.tsx
git commit -m "feat(analysis): flat TechnicalsSection (bias, oscillators, trend, volume, volatility)"
```

---

## Task 5: FundamentalsSection + AccumulationSection

**Files:**
- Create: `frontend/src/components/analysis/FundamentalsSection.tsx`
- Create: `frontend/src/components/analysis/AccumulationSection.tsx`
- Test: `frontend/src/__tests__/unit/FundamentalsSection.test.tsx`

**Interfaces:**
- Consumes: `TickerAnalysisData` (Task 2); `computeHealthScore` (Task 1).
- Produces:
  - `FundamentalsSection({ data }: { data: TickerAnalysisData })`.
  - `AccumulationSection({ symbol }: { symbol: string })` — renders `<TickerAccumulation symbol={symbol} />` (default import from `@/components/ticker/TickerAccumulation`) inside a scroll container.

**Content (re-present from DailySignalStatus fundamentals tab, lines 1125-1306):** intelligence-verdict hero (headline label by `pe`/`eps`; ROE + D/E badges; ACCUMULATE if `pe>0 && roe>12` else MONITOR); financial-health donut using `computeHealthScore(roe, pe, debtEquity)`; valuation matrix (P/E, P/B, EPS, dividend yield); efficiency hub (ROE, D/E, YoY, QoQ); market benchmarking (first 3 `fundamentals.indicators` as `(value - sector_low)/(sector_high - sector_low)*100` bars); risk audit pass/fail (Debt `de<1.5`, Payout `divYield>0`, Equity `roe>10`, Growth `yoyGrowth>0`). `N/A` for missing. ≤30-line functions.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/__tests__/unit/FundamentalsSection.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { FundamentalsSection } from '@/components/analysis/FundamentalsSection';

const data = {
    fundamentals: { pe: 14, eps: 38, bookValue: 290, priceToBook: 1.9, roe: 18, divYield: 2, marketCap: 1e9, yoyGrowth: 12, qoqGrowth: 4, debtEquity: 0.4, sector: 'Banking', indicators: [] },
    price: {}, live: {}, technicals: {}, accumulation: null, fibonacci: null, generatedSignals: [], history: [], brokers: [], company: {},
} as never;

describe('FundamentalsSection', () => {
    it('renders the health score and valuation values', () => {
        render(<FundamentalsSection data={data} />);
        // computeHealthScore(18,14,0.4) = 58
        expect(screen.getByText('58')).toBeInTheDocument();
        expect(screen.getByText(/14/)).toBeInTheDocument(); // P/E
    });
    it('shows N/A for a missing metric', () => {
        const d = { ...data, fundamentals: { ...data.fundamentals, priceToBook: null } };
        render(<FundamentalsSection data={d} />);
        expect(screen.getAllByText('N/A').length).toBeGreaterThan(0);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/unit/FundamentalsSection.test.tsx`
Expected: FAIL — cannot resolve the module.

- [ ] **Step 3: Implement both components** per the Content contract; re-present from lines 1125-1313; extract sub-cards for the 30-line limit.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/__tests__/unit/FundamentalsSection.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/analysis/FundamentalsSection.tsx frontend/src/components/analysis/AccumulationSection.tsx frontend/src/__tests__/unit/FundamentalsSection.test.tsx
git commit -m "feat(analysis): flat Fundamentals + Accumulation sections"
```

---

## Task 6: Wire the four sections into the dialog (end-state tab bar)

**Files:**
- Modify: `frontend/src/components/ExitStrategyDialog.tsx`
- Test: `frontend/src/__tests__/unit/ExitStrategyDialog.test.tsx` (update)

**Interfaces:**
- Consumes: `useTickerAnalysis` (Task 2); `SignalsSection`, `TechnicalsSection`, `FundamentalsSection`, `AccumulationSection` (Tasks 3-5).
- Produces: dialog `Tabs` with six flat values `plan | transactions | signals | technicals | fundamentals | accumulation`, default `plan`.

- [ ] **Step 1: Update the failing dialog test**

In `frontend/src/__tests__/unit/ExitStrategyDialog.test.tsx`, change the tab-list assertion to expect the six labels and remove the `DailySignalStatus` mock (no longer rendered by the dialog), mocking the new sections instead. Add `vi.mock('@/hooks/useTickerAnalysis', () => ({ useTickerAnalysis: () => ({ loading: false, error: false, data: null }) }))` and lightweight mocks for the four section modules returning a stub div. Assert:

```tsx
const tabs = await screen.findAllByRole('tab');
expect(tabs.map(t => t.textContent)).toEqual(['Plan', 'Transactions', 'Signals', 'Technicals', 'Fundamentals', 'Accumulation']);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/unit/ExitStrategyDialog.test.tsx`
Expected: FAIL — current dialog renders three tabs (`Plan`/`Transactions`/`Analysis`).

- [ ] **Step 3: Wire the sections**

In `ExitStrategyDialog.tsx`: call `useTickerAnalysis(portfolioItem?.ticker)`. Replace the single `analysis` `TabsTrigger` + `TabsContent` with four triggers (`Signals`, `Technicals`, `Fundamentals`, `Accumulation`) and four contents. Build the `ladder` object for `SignalsSection` from the plan form values + `currentPrice`/`wacc`: `{ cmp: currentPrice, entry: wacc, stopLoss: Number(sl)||undefined, tp1: Number(tp)||undefined, tp2: Number(tp2)||undefined, tp3: Number(tp3)||undefined, direction: 'BUY' }`. Render a shared loading skeleton / "Analysis unavailable" when `loading`/`error`/`!data`. Remove the `DailySignalStatus` import from the dialog. Keep each function ≤30 lines.

- [ ] **Step 4: Run test + build**

Run: `cd frontend && npx vitest run src/__tests__/unit/ExitStrategyDialog.test.tsx`
Expected: PASS (six flat tabs).

Run: `cd frontend && npm run build`
Expected: `Compiled successfully`; no type errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ExitStrategyDialog.tsx frontend/src/__tests__/unit/ExitStrategyDialog.test.tsx
git commit -m "feat(analysis): flatten dialog analysis into Signals/Technicals/Fundamentals/Accumulation tabs"
```

---

## Task 7: Phase 2 regression + deploy

**Files:** none (verification only)

- [ ] **Step 1: Run the analysis + exit unit tests**

Run: `cd frontend && npx vitest run src/__tests__/unit/tickerAnalysis.test.ts src/__tests__/unit/useTickerAnalysis.test.ts src/__tests__/unit/SignalsSection.test.tsx src/__tests__/unit/TechnicalsSection.test.tsx src/__tests__/unit/FundamentalsSection.test.tsx src/__tests__/unit/ExitStrategyDialog.test.tsx src/__tests__/unit/PlanTab.test.tsx src/__tests__/unit/TransactionsTab.test.tsx`
Expected: all PASS.

- [ ] **Step 2: Production build**

Run: `cd frontend && npm run build`
Expected: `Compiled successfully`.

- [ ] **Step 3: Deploy the frontend image**

Run: `docker-compose up -d --build frontend`
Verify: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000` → `200`.
(No migration. Hard-refresh; open "View strategies" and confirm six flat tabs, each analysis section renders real data. The Signals page still uses the old DailySignalStatus — that is Phase 3.)

---

## Self-Review

**Spec coverage (Phase 2 scope):**
- Shared `useTickerAnalysis` hook over the six calls → Task 2. ✓
- Four flat section components re-presenting existing data → Tasks 3-5. ✓
- Derived computations (bias, health, confluence, %), indicator lookup → Task 1. ✓
- Dialog flattened to six single-level tabs → Task 6. ✓
- Empty/error states (N/A, section-level unavailable) → Tasks 2-6. ✓
- No backend change, no new analytics → constraints honoured. ✓
- Signals-page rollout + delete `DailySignalStatus` → Phase 3 (separate plan), intentionally excluded.

**Placeholder scan:** logic tasks (1, 2) carry full code + tests; section tasks (3-5) carry exact field contracts, derived-helper references, current-file line ranges to re-present, prop interfaces, and concrete component tests — port, not invent.

**Type consistency:** `TickerAnalysisData` defined in Task 2 is the prop type consumed by Tasks 3-6; helper signatures (`computeTechnicalBias(BiasInput)`, `computeHealthScore(roe,pe,de)`, `computeConfluence`, `pctReturn`, `findIndicator`) from Task 1 match their use in the hook and sections; the six dialog tab values/labels in Task 6 match the updated test.
