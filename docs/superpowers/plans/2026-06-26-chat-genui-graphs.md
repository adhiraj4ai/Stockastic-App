# Chat generative-UI graphs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Embed preconfigured graphs (and richer tables) inside existing chat gen-UI cards so a chart appears automatically whenever a chat tool returns the relevant data.

**Architecture:** Add a small catalog of pure, prop-typed chart primitives under `frontend/src/components/chat/gen-ui/charts/`, each exposing a pure data-transform function plus a React component. Enrich five existing card components to map their `data` → a chart primitive (rendered above the existing/enriched table). The card `type` strings, the SSE protocol, and `GenUIRegistry` are untouched. One backend tool gains an additive `series` field (accumulation); all other domains are frontend-only.

**Tech Stack:** Next.js 16 / React 19, TypeScript, Tailwind 4, recharts 3.6, echarts 6 (`echarts-for-react`), Vitest + @testing-library/react (jsdom); Django 5.2 + pytest for the one backend change.

## Global Constraints

- Function/method bodies ≤ 30 lines — extract helpers rather than inlining.
- TDD: write the failing test first, watch it fail, then minimal implementation.
- Frontend tests live under `frontend/src/__tests__/` (the only path `vitest.config.ts` includes) — NOT co-located. Use `frontend/src/__tests__/unit/gen-ui/`.
- Format currency/decimals consistently with sibling cards (`npr` helper / `lib/numbers`); never format ad hoc.
- Warm sans-serif, sentence-case label text; no new all-caps strings. Reuse the existing `Th`/`Td`/`Stat` helpers in each card for table consistency.
- echarts components render client-side only (`dynamic(..., { ssr: false })`), mirroring `StockChart.tsx`.
- No new card `type` strings; do not edit `GenUIRegistry.tsx` switch or `chat-sse.ts`/`applyFrame`.
- Charts/recharts/echarts are NOT rendered in unit tests (jsdom has no layout/canvas). Unit tests target the pure transform functions; card tests mock the chart primitive module. This is the intended, documented test boundary.
- Run frontend commands from `frontend/`; backend commands from `backend/` (or via `docker-compose exec backend`).

---

## Shared test helper (used by several tasks)

Card tests mock the chart primitive so jsdom never has to render recharts/echarts. The mock pattern (repeated per card test, shown in full each time) is:

```tsx
vi.mock('@/components/chat/gen-ui/charts/CandlestickChart', () => ({
    __esModule: true,
    default: () => <div data-testid="candlestick-chart" />,
}));
```

---

### Task 1: `CandlestickChart` primitive (price/OHLCV)

**Files:**
- Create: `frontend/src/components/chat/gen-ui/charts/CandlestickChart.tsx`
- Test: `frontend/src/__tests__/unit/gen-ui/CandlestickChart.test.tsx`

**Interfaces:**
- Consumes: nothing (leaf primitive).
- Produces:
  - `export interface CandleRow { date: string; open?: number | string; high?: number | string; low?: number | string; close?: number | string; volume?: number | string }`
  - `export function toCandleSeries(rows: CandleRow[]): { dates: string[]; ohlc: number[][]; volumes: number[] }` — `ohlc` entries are `[open, close, low, high]` (echarts candlestick order).
  - `export default function CandlestickChart({ rows }: { rows: CandleRow[] }): JSX.Element | null`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { toCandleSeries } from '@/components/chat/gen-ui/charts/CandlestickChart';

describe('toCandleSeries', () => {
    it('maps OHLCV rows to echarts series in [open, close, low, high] order', () => {
        const rows = [
            { date: '2026-06-01', open: 100, high: 110, low: 95, close: 105, volume: 1000 },
            { date: '2026-06-02', open: '105', high: '112', low: '104', close: '108', volume: '2000' },
        ];
        const { dates, ohlc, volumes } = toCandleSeries(rows);
        expect(dates).toEqual(['2026-06-01', '2026-06-02']);
        expect(ohlc).toEqual([[100, 105, 95, 110], [105, 108, 104, 112]]);
        expect(volumes).toEqual([1000, 2000]);
    });

    it('coerces missing numeric fields to 0', () => {
        const { ohlc, volumes } = toCandleSeries([{ date: 'd' }]);
        expect(ohlc).toEqual([[0, 0, 0, 0]]);
        expect(volumes).toEqual([0]);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/unit/gen-ui/CandlestickChart.test.tsx`
Expected: FAIL — `toCandleSeries` is not exported / module not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import type { EChartsOption } from 'echarts';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

export interface CandleRow {
    date: string;
    open?: number | string;
    high?: number | string;
    low?: number | string;
    close?: number | string;
    volume?: number | string;
}

const num = (v: number | string | undefined): number => Number(v ?? 0) || 0;

export function toCandleSeries(rows: CandleRow[]): {
    dates: string[];
    ohlc: number[][];
    volumes: number[];
} {
    return {
        dates: rows.map((r) => r.date),
        ohlc: rows.map((r) => [num(r.open), num(r.close), num(r.low), num(r.high)]),
        volumes: rows.map((r) => num(r.volume)),
    };
}

function buildOption(rows: CandleRow[]): EChartsOption {
    const { dates, ohlc, volumes } = toCandleSeries(rows);
    return {
        tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
        grid: [
            { left: 48, right: 12, top: 8, height: '58%' },
            { left: 48, right: 12, bottom: 24, height: '18%' },
        ],
        xAxis: [
            { type: 'category', data: dates, boundaryGap: true, axisLabel: { color: '#6b7280', fontSize: 10 } },
            { type: 'category', gridIndex: 1, data: dates, axisLabel: { show: false } },
        ],
        yAxis: [
            { scale: true, axisLabel: { color: '#6b7280', fontSize: 10 } },
            { gridIndex: 1, splitNumber: 2, axisLabel: { show: false }, splitLine: { show: false } },
        ],
        series: [
            {
                name: 'Price', type: 'candlestick', data: ohlc,
                itemStyle: { color: '#10b981', color0: '#ef4444', borderColor: '#10b981', borderColor0: '#ef4444' },
            },
            { name: 'Volume', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, data: volumes, itemStyle: { color: '#6366f1', opacity: 0.45 } },
        ],
    };
}

export default function CandlestickChart({ rows }: { rows: CandleRow[] }) {
    if (!rows?.length) return null;
    return (
        <div className="w-full h-56">
            <ReactECharts option={buildOption(rows)} style={{ height: '100%', width: '100%' }} />
        </div>
    );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/__tests__/unit/gen-ui/CandlestickChart.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/chat/gen-ui/charts/CandlestickChart.tsx frontend/src/__tests__/unit/gen-ui/CandlestickChart.test.tsx
git commit -m "feat(chat): add CandlestickChart gen-ui primitive"
```

---

### Task 2: Embed candlestick + OHLCV table in `PriceHistoryCard`

**Files:**
- Modify: `frontend/src/components/chat/gen-ui/SimpleCards.tsx:178-203` (`PriceHistoryCard`)
- Test: `frontend/src/__tests__/unit/gen-ui/PriceHistoryCard.test.tsx`

**Interfaces:**
- Consumes: `CandlestickChart` (default) from Task 1.
- Produces: unchanged export `PriceHistoryCard({ symbol, rows })`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PriceHistoryCard } from '@/components/chat/gen-ui/SimpleCards';

vi.mock('@/components/chat/gen-ui/charts/CandlestickChart', () => ({
    __esModule: true,
    default: () => <div data-testid="candlestick-chart" />,
}));

const rows = [
    { date: '2026-06-01', open: 100, high: 110, low: 95, close: 105, volume: 1000 },
    { date: '2026-06-02', open: 105, high: 112, low: 104, close: 108, volume: 2000 },
];

describe('PriceHistoryCard', () => {
    it('renders the candlestick chart and an OHLCV row table', () => {
        render(<PriceHistoryCard symbol="NABIL" rows={rows} />);
        expect(screen.getByTestId('candlestick-chart')).toBeInTheDocument();
        expect(screen.getByText('Volume')).toBeInTheDocument(); // new table header
        expect(screen.getByText('2,000')).toBeInTheDocument();   // volume cell, formatted
    });

    it('returns null for empty rows', () => {
        const { container } = render(<PriceHistoryCard symbol="NABIL" rows={[]} />);
        expect(container).toBeEmptyDOMElement();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/unit/gen-ui/PriceHistoryCard.test.tsx`
Expected: FAIL — no `candlestick-chart` testid; `Volume` header not found.

- [ ] **Step 3: Write minimal implementation**

Add the import at the top of `SimpleCards.tsx` (with the other imports):

```tsx
import CandlestickChart from './charts/CandlestickChart';
```

Replace the body of `PriceHistoryCard` (lines 178-203) with:

```tsx
export function PriceHistoryCard({ symbol, rows }: { symbol: string; rows: PriceHistoryRow[] }) {
    if (!rows.length) return null;
    const closes = rows.map((r) => Number(r.close || 0));
    const first = closes[0];
    const last = closes[closes.length - 1];
    const changePct = first ? ((last - first) / first) * 100 : 0;
    const recent = [...rows].slice(-8).reverse();
    return (
        <div className="surface p-4 text-sm space-y-3">
            <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">{symbol} · {rows.length}-day history</span>
                <span className={cn('text-[12px] font-medium tabular-nums', toneFor(changePct))}>
                    {changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%
                </span>
            </div>
            <CandlestickChart rows={rows} />
            <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                    <thead className="bg-muted/40 text-muted-foreground">
                        <tr><Th>Date</Th><Th align="right">Open</Th><Th align="right">High</Th><Th align="right">Low</Th><Th align="right">Close</Th><Th align="right">Volume</Th></tr>
                    </thead>
                    <tbody>
                        {recent.map((r) => (
                            <tr key={r.date} className="border-t border-border">
                                <Td>{r.date}</Td>
                                <Td align="right" mono>{Number(r.open || 0).toFixed(2)}</Td>
                                <Td align="right" mono>{Number(r.high || 0).toFixed(2)}</Td>
                                <Td align="right" mono>{Number(r.low || 0).toFixed(2)}</Td>
                                <Td align="right" mono>{Number(r.close || 0).toFixed(2)}</Td>
                                <Td align="right" mono>{Math.round(Number(r.volume || 0)).toLocaleString()}</Td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/__tests__/unit/gen-ui/PriceHistoryCard.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/chat/gen-ui/SimpleCards.tsx frontend/src/__tests__/unit/gen-ui/PriceHistoryCard.test.tsx
git commit -m "feat(chat): embed candlestick + OHLCV table in PriceHistoryCard"
```

---

### Task 3: `AllocationDonut` primitive (portfolio allocation)

**Files:**
- Create: `frontend/src/components/chat/gen-ui/charts/AllocationDonut.tsx`
- Test: `frontend/src/__tests__/unit/gen-ui/AllocationDonut.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export interface AllocationSlice { ticker: string; current_value: number }`
  - `export interface DonutSegment { name: string; value: number; weight: number }` (`weight` is a 0–100 percentage)
  - `export function toAllocationSegments(rows: AllocationSlice[], maxSlices?: number): DonutSegment[]` — sorts desc by value, keeps top `maxSlices` (default 6), groups the remainder into an `"Other"` segment; `weight` = value / total × 100.
  - `export default function AllocationDonut({ rows }: { rows: AllocationSlice[] }): JSX.Element | null`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { toAllocationSegments } from '@/components/chat/gen-ui/charts/AllocationDonut';

describe('toAllocationSegments', () => {
    it('computes weights as a percentage of total value', () => {
        const seg = toAllocationSegments([
            { ticker: 'A', current_value: 75 },
            { ticker: 'B', current_value: 25 },
        ]);
        expect(seg).toEqual([
            { name: 'A', value: 75, weight: 75 },
            { name: 'B', value: 25, weight: 25 },
        ]);
    });

    it('groups slices beyond the cap into an "Other" segment', () => {
        const rows = Array.from({ length: 8 }, (_, i) => ({ ticker: `T${i}`, current_value: 10 }));
        const seg = toAllocationSegments(rows, 6);
        expect(seg).toHaveLength(7);
        expect(seg[6]).toEqual({ name: 'Other', value: 20, weight: 25 });
    });

    it('returns an empty array when there is no value', () => {
        expect(toAllocationSegments([])).toEqual([]);
        expect(toAllocationSegments([{ ticker: 'A', current_value: 0 }])).toEqual([]);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/unit/gen-ui/AllocationDonut.test.tsx`
Expected: FAIL — module/`toAllocationSegments` not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
'use client';

import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

export interface AllocationSlice {
    ticker: string;
    current_value: number;
}

export interface DonutSegment {
    name: string;
    value: number;
    weight: number;
}

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7', '#94a3b8'];

export function toAllocationSegments(rows: AllocationSlice[], maxSlices = 6): DonutSegment[] {
    const total = rows.reduce((s, r) => s + (r.current_value || 0), 0);
    if (total <= 0) return [];
    const sorted = [...rows].filter((r) => r.current_value > 0).sort((a, b) => b.current_value - a.current_value);
    const head = sorted.slice(0, maxSlices);
    const restValue = sorted.slice(maxSlices).reduce((s, r) => s + r.current_value, 0);
    const segs = head.map((r) => ({ name: r.ticker, value: r.current_value, weight: (r.current_value / total) * 100 }));
    if (restValue > 0) segs.push({ name: 'Other', value: restValue, weight: (restValue / total) * 100 });
    return segs;
}

export default function AllocationDonut({ rows }: { rows: AllocationSlice[] }) {
    const segments = toAllocationSegments(rows);
    if (!segments.length) return null;
    return (
        <div className="w-full h-48">
            <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie data={segments} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" paddingAngle={2}>
                        {segments.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number, n: string) => [`Rs ${Math.round(v).toLocaleString()}`, n]} />
                </PieChart>
            </ResponsiveContainer>
        </div>
    );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/__tests__/unit/gen-ui/AllocationDonut.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/chat/gen-ui/charts/AllocationDonut.tsx frontend/src/__tests__/unit/gen-ui/AllocationDonut.test.tsx
git commit -m "feat(chat): add AllocationDonut gen-ui primitive"
```

---

### Task 4: Embed donut + weight column in `HoldingsCard`

**Files:**
- Modify: `frontend/src/components/chat/gen-ui/HoldingsCard.tsx`
- Test: `frontend/src/__tests__/unit/gen-ui/HoldingsCard.test.tsx`

**Interfaces:**
- Consumes: `AllocationDonut` (default) from Task 3.
- Produces: unchanged default export `HoldingsCard(data)`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import HoldingsCard from '@/components/chat/gen-ui/HoldingsCard';

vi.mock('@/components/chat/gen-ui/charts/AllocationDonut', () => ({
    __esModule: true,
    default: () => <div data-testid="allocation-donut" />,
}));

const holdings = [
    { ticker: 'A', quantity: 10, wacc: 100, current_price: 150, current_value: 1500, gain_loss: 500, gain_loss_pct: 50, day_gain_loss: 0 },
    { ticker: 'B', quantity: 10, wacc: 100, current_price: 50, current_value: 500, gain_loss: -500, gain_loss_pct: -50, day_gain_loss: 0 },
];

describe('HoldingsCard', () => {
    it('renders the allocation donut and a weight column', () => {
        render(<HoldingsCard holdings={holdings} />);
        expect(screen.getByTestId('allocation-donut')).toBeInTheDocument();
        expect(screen.getByText('Weight')).toBeInTheDocument();
        expect(screen.getByText('75.0%')).toBeInTheDocument(); // 1500 / 2000
    });

    it('renders without the donut when there are no holdings', () => {
        render(<HoldingsCard holdings={[]} />);
        expect(screen.queryByTestId('allocation-donut')).not.toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/unit/gen-ui/HoldingsCard.test.tsx`
Expected: FAIL — no donut testid; `Weight` header not found.

- [ ] **Step 3: Write minimal implementation**

Add import near the top of `HoldingsCard.tsx`:

```tsx
import AllocationDonut from './charts/AllocationDonut';
```

Replace the component body (the `return (...)` in `HoldingsCard`) so the donut renders above the table and a weight column is added. Compute total once and render the donut only when there are rows:

```tsx
export default function HoldingsCard(data: HoldingsCardData) {
    const rows = data.holdings || [];
    const total = rows.reduce((s, r) => s + (r.current_value || 0), 0);
    return (
        <div className="surface overflow-hidden text-sm">
            <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
                <span className="font-medium text-foreground">Holdings</span>
                <span className="text-[11px] text-muted-foreground">{rows.length} positions</span>
            </div>
            {rows.length > 0 && <div className="px-4 pt-3"><AllocationDonut rows={rows} /></div>}
            <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                    <thead className="bg-muted/40 text-muted-foreground">
                        <tr>
                            <Th>Ticker</Th><Th align="right">Qty</Th><Th align="right">WACC</Th>
                            <Th align="right">LTP</Th><Th align="right">Value</Th><Th align="right">Weight</Th>
                            <Th align="right">P/L</Th><Th>Signal</Th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r) => (
                            <tr key={r.ticker} className="border-t border-border">
                                <Td><div className="font-medium text-foreground">{r.ticker}</div>{r.sector && <div className="text-[10px] text-muted-foreground">{r.sector}</div>}</Td>
                                <Td align="right" mono>{r.quantity}</Td>
                                <Td align="right" mono>{r.wacc.toFixed(2)}</Td>
                                <Td align="right" mono>{r.current_price.toFixed(2)}</Td>
                                <Td align="right" mono>{npr(r.current_value)}</Td>
                                <Td align="right" mono>{total > 0 ? `${((r.current_value / total) * 100).toFixed(1)}%` : '—'}</Td>
                                <Td align="right" mono>
                                    <span className={cn(r.gain_loss >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>
                                        {r.gain_loss_pct >= 0 ? '+' : ''}{r.gain_loss_pct.toFixed(2)}%
                                    </span>
                                </Td>
                                <Td>{r.signal ? <SignalChip s={r.signal} /> : <span className="text-muted-foreground">—</span>}</Td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/__tests__/unit/gen-ui/HoldingsCard.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/chat/gen-ui/HoldingsCard.tsx frontend/src/__tests__/unit/gen-ui/HoldingsCard.test.tsx
git commit -m "feat(chat): embed allocation donut + weight column in HoldingsCard"
```

---

### Task 5: `RiskRadarChart` primitive (risk)

**Files:**
- Create: `frontend/src/components/chat/gen-ui/charts/RiskRadarChart.tsx`
- Test: `frontend/src/__tests__/unit/gen-ui/RiskRadarChart.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export interface RadarAxis { axis: string; value: number; fullMark: number }`
  - `export function toRadarPoints(data: RadarAxis[]): { axis: string; value: number; fullMark: number }[]` — passthrough that drops entries with a non-positive `fullMark` (guards the recharts domain).
  - `export default function RiskRadarChart({ radar_data }: { radar_data: RadarAxis[] }): JSX.Element | null`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { toRadarPoints } from '@/components/chat/gen-ui/charts/RiskRadarChart';

describe('toRadarPoints', () => {
    it('keeps axes with a positive fullMark', () => {
        const pts = toRadarPoints([
            { axis: 'Concentration', value: 6, fullMark: 10 },
            { axis: 'Liquidity', value: 3, fullMark: 10 },
        ]);
        expect(pts).toHaveLength(2);
        expect(pts[0]).toEqual({ axis: 'Concentration', value: 6, fullMark: 10 });
    });

    it('drops axes with a non-positive fullMark', () => {
        const pts = toRadarPoints([{ axis: 'X', value: 1, fullMark: 0 }]);
        expect(pts).toEqual([]);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/unit/gen-ui/RiskRadarChart.test.tsx`
Expected: FAIL — module/`toRadarPoints` not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
'use client';

import React from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';

export interface RadarAxis {
    axis: string;
    value: number;
    fullMark: number;
}

export function toRadarPoints(data: RadarAxis[]): RadarAxis[] {
    return (data || []).filter((d) => d.fullMark > 0);
}

export default function RiskRadarChart({ radar_data }: { radar_data: RadarAxis[] }) {
    const points = toRadarPoints(radar_data);
    if (points.length < 3) return null; // a radar needs at least 3 axes to read
    const max = Math.max(...points.map((p) => p.fullMark));
    return (
        <div className="w-full h-52">
            <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="78%" data={points}>
                    <PolarGrid stroke="#e2e8f0" />
                    <PolarAngleAxis dataKey="axis" tick={{ fill: '#64748b', fontSize: 11 }} />
                    <PolarRadiusAxis angle={30} domain={[0, max]} axisLine={false} tick={false} />
                    <Radar name="Risk" dataKey="value" stroke="#6366f1" fill="#6366f1" fillOpacity={0.4} />
                    <Tooltip />
                </RadarChart>
            </ResponsiveContainer>
        </div>
    );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/__tests__/unit/gen-ui/RiskRadarChart.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/chat/gen-ui/charts/RiskRadarChart.tsx frontend/src/__tests__/unit/gen-ui/RiskRadarChart.test.tsx
git commit -m "feat(chat): add RiskRadarChart gen-ui primitive"
```

---

### Task 6: Embed radar in `RiskCard` (keep dimension bars as the table)

**Files:**
- Modify: `frontend/src/components/chat/gen-ui/RiskCard.tsx:19-65`
- Test: `frontend/src/__tests__/unit/gen-ui/RiskCard.test.tsx`

**Interfaces:**
- Consumes: `RiskRadarChart` (default) from Task 5. `RiskCard`'s existing `data.radar_data` already matches `RadarAxis[]`.
- Produces: unchanged default export `RiskCard(data)`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import RiskCard from '@/components/chat/gen-ui/RiskCard';

vi.mock('@/components/chat/gen-ui/charts/RiskRadarChart', () => ({
    __esModule: true,
    default: () => <div data-testid="risk-radar" />,
}));

const radar_data = [
    { axis: 'Concentration', value: 6, fullMark: 10 },
    { axis: 'Liquidity', value: 3, fullMark: 10 },
    { axis: 'Volatility', value: 5, fullMark: 10 },
];

describe('RiskCard', () => {
    it('renders the radar chart above the existing dimension bars', () => {
        render(<RiskCard radar_data={radar_data} summary={{ total_value: 1, risk_level: 'MEDIUM' }} />);
        expect(screen.getByTestId('risk-radar')).toBeInTheDocument();
        expect(screen.getByText('Concentration')).toBeInTheDocument(); // dimension bar label retained
    });

    it('omits the radar when there is no radar_data', () => {
        render(<RiskCard summary={{ total_value: 1, risk_level: 'LOW' }} />);
        expect(screen.queryByTestId('risk-radar')).not.toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/unit/gen-ui/RiskCard.test.tsx`
Expected: FAIL — no `risk-radar` testid.

- [ ] **Step 3: Write minimal implementation**

Add import near the top of `RiskCard.tsx`:

```tsx
import RiskRadarChart from './charts/RiskRadarChart';
```

Insert the radar block immediately after the header `</div>` and before the existing `{data.radar_data && ...}` bars block (i.e. right after line 31's closing `</div>`):

```tsx
            {data.radar_data && data.radar_data.length >= 3 && (
                <div className="mb-3"><RiskRadarChart radar_data={data.radar_data} /></div>
            )}
```

Leave the existing dimension-bar block (lines 32-47) in place — it now serves as the textual breakdown beneath the radar.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/__tests__/unit/gen-ui/RiskCard.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/chat/gen-ui/RiskCard.tsx frontend/src/__tests__/unit/gen-ui/RiskCard.test.tsx
git commit -m "feat(chat): embed risk radar chart in RiskCard"
```

---

### Task 7: `MoversBarChart` primitive (market movers)

**Files:**
- Create: `frontend/src/components/chat/gen-ui/charts/MoversBarChart.tsx`
- Test: `frontend/src/__tests__/unit/gen-ui/MoversBarChart.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export interface Mover { symbol: string; price_change: number }`
  - `export interface MoverBar { symbol: string; change: number; positive: boolean }`
  - `export function toMoverBars(gainers: Mover[], losers: Mover[], perSide?: number): MoverBar[]` — takes top `perSide` (default 5) gainers (desc) then top `perSide` losers (asc), coercing `price_change` to a number; `positive` = change ≥ 0.
  - `export default function MoversBarChart({ gainers, losers }: { gainers: Mover[]; losers: Mover[] }): JSX.Element | null`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { toMoverBars } from '@/components/chat/gen-ui/charts/MoversBarChart';

describe('toMoverBars', () => {
    it('combines top gainers (desc) then losers (asc) with a positive flag', () => {
        const bars = toMoverBars(
            [{ symbol: 'A', price_change: 5 }, { symbol: 'B', price_change: 8 }],
            [{ symbol: 'C', price_change: -3 }, { symbol: 'D', price_change: -7 }],
            2,
        );
        expect(bars.map((b) => b.symbol)).toEqual(['B', 'A', 'D', 'C']);
        expect(bars[0]).toEqual({ symbol: 'B', change: 8, positive: true });
        expect(bars[3]).toEqual({ symbol: 'C', change: -3, positive: false });
    });

    it('returns an empty array when both sides are empty', () => {
        expect(toMoverBars([], [])).toEqual([]);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/unit/gen-ui/MoversBarChart.test.tsx`
Expected: FAIL — module/`toMoverBars` not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
'use client';

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Cell, ResponsiveContainer, Tooltip } from 'recharts';

export interface Mover {
    symbol: string;
    price_change: number;
}

export interface MoverBar {
    symbol: string;
    change: number;
    positive: boolean;
}

const num = (v: number) => Number(v ?? 0) || 0;

export function toMoverBars(gainers: Mover[], losers: Mover[], perSide = 5): MoverBar[] {
    const top = [...(gainers || [])].sort((a, b) => num(b.price_change) - num(a.price_change)).slice(0, perSide);
    const bottom = [...(losers || [])].sort((a, b) => num(a.price_change) - num(b.price_change)).slice(0, perSide);
    return [...top, ...bottom].map((m) => ({ symbol: m.symbol, change: num(m.price_change), positive: num(m.price_change) >= 0 }));
}

export default function MoversBarChart({ gainers, losers }: { gainers: Mover[]; losers: Mover[] }) {
    const bars = toMoverBars(gainers, losers);
    if (!bars.length) return null;
    return (
        <div className="w-full h-56">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bars} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} unit="%" />
                    <YAxis type="category" dataKey="symbol" width={64} tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip formatter={(v: number) => [`${v.toFixed(2)}%`, 'Change']} />
                    <Bar dataKey="change">
                        {bars.map((b, i) => <Cell key={i} fill={b.positive ? '#10b981' : '#ef4444'} />)}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/__tests__/unit/gen-ui/MoversBarChart.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/chat/gen-ui/charts/MoversBarChart.tsx frontend/src/__tests__/unit/gen-ui/MoversBarChart.test.tsx
git commit -m "feat(chat): add MoversBarChart gen-ui primitive"
```

---

### Task 8: Embed movers bar chart in `MarketSummary`

**Files:**
- Modify: `frontend/src/components/chat/gen-ui/MarketSummary.tsx:27-47` (insert chart after the header block, before the gainers/losers grid)
- Test: `frontend/src/__tests__/unit/gen-ui/MarketSummary.test.tsx`

**Interfaces:**
- Consumes: `MoversBarChart` (default) from Task 7. `MarketSummary`'s `top_gainers`/`top_losers` rows already match `Mover` (they carry `symbol` + `price_change`).
- Produces: unchanged default export `MarketSummary`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import MarketSummary from '@/components/chat/gen-ui/MarketSummary';

vi.mock('@/components/chat/gen-ui/charts/MoversBarChart', () => ({
    __esModule: true,
    default: () => <div data-testid="movers-bar" />,
}));

describe('MarketSummary', () => {
    it('renders the movers bar chart alongside the gainer/loser lists', () => {
        render(<MarketSummary market_index={1.2} top_gainers={[{ symbol: 'A', price_change: 5 }]} top_losers={[{ symbol: 'B', price_change: -4 }]} />);
        expect(screen.getByTestId('movers-bar')).toBeInTheDocument();
        expect(screen.getByText('A')).toBeInTheDocument();
        expect(screen.getByText('B')).toBeInTheDocument();
    });

    it('omits the chart when both lists are empty', () => {
        render(<MarketSummary top_gainers={[]} top_losers={[]} />);
        expect(screen.queryByTestId('movers-bar')).not.toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/unit/gen-ui/MarketSummary.test.tsx`
Expected: FAIL — no `movers-bar` testid.

- [ ] **Step 3: Write minimal implementation**

Add import near the top of `MarketSummary.tsx`:

```tsx
import MoversBarChart from './charts/MoversBarChart';
```

Inside the `<div className="p-6">`, immediately after the header block (the `flex items-center gap-3 mb-6` div closes around line 47) and before the `grid grid-cols-1 md:grid-cols-2` block, insert:

```tsx
                {(gainers.length > 0 || losers.length > 0) && (
                    <div className="mb-6">
                        <MoversBarChart gainers={gainers} losers={losers} />
                    </div>
                )}
```

(`gainers` and `losers` are the already-defensive arrays defined at lines 25-26.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/__tests__/unit/gen-ui/MarketSummary.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/chat/gen-ui/MarketSummary.tsx frontend/src/__tests__/unit/gen-ui/MarketSummary.test.tsx
git commit -m "feat(chat): embed movers bar chart in MarketSummary"
```

---

### Task 9: Backend — add `series` time-series to the accumulation card

The `get_accumulation` tool currently emits a top-20-by-net cross-section, which is not a time series. Add an additive `series: [{date, net}]` field aggregating net accumulation by `transaction_date` so the frontend can draw a trend line. No new card type, no migration.

**Files:**
- Modify: `backend/chat/tools/market.py:553-574` (`get_accumulation._run`)
- Test: `backend/chat/tests/test_accumulation_card.py`

**Interfaces:**
- Produces: `accumulation` card `data` now also contains `series: List[{"date": str, "net": float}]`, sorted ascending by date.

- [ ] **Step 1: Write the failing test**

Use the existing `DailyCumulativeAccumulation` model. Create `backend/chat/tests/test_accumulation_card.py`:

```python
import pytest
from chat.tools.market import _accumulation_series


def test_accumulation_series_aggregates_net_by_date_ascending():
    rows = [
        {"transaction_date": "2026-06-02", "cumulative_net": 30},
        {"transaction_date": "2026-06-01", "cumulative_net": 10},
        {"transaction_date": "2026-06-01", "cumulative_net": 5},
    ]
    series = _accumulation_series(rows)
    assert series == [
        {"date": "2026-06-01", "net": 15.0},
        {"date": "2026-06-02", "net": 30.0},
    ]


def test_accumulation_series_handles_empty_rows():
    assert _accumulation_series([]) == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest chat/tests/test_accumulation_card.py -v`
Expected: FAIL — `cannot import name '_accumulation_series'`.

- [ ] **Step 3: Write minimal implementation**

Add this helper near the top-level of `market.py` (module scope, above `get_accumulation`):

```python
def _accumulation_series(rows: list[dict]) -> list[dict]:
    by_date: dict[str, float] = {}
    for r in rows:
        date = str(r.get("transaction_date") or "")
        if not date:
            continue
        by_date[date] = by_date.get(date, 0.0) + float(r.get("cumulative_net") or 0)
    return [{"date": d, "net": by_date[d]} for d in sorted(by_date)]
```

Then in `get_accumulation._run`, extend the returned card `data` (the `return _result(... card=...)` at lines 572-574). Build the series from the full query rows (not the top-20 slice):

```python
        return _result("\n".join(lines), card={"type": "accumulation", "data": {
            "symbol": ticker,
            "rows": _jsonable(rows[:20]),
            "series": _accumulation_series(_jsonable(rows)),
        }})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest chat/tests/test_accumulation_card.py -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/chat/tools/market.py backend/chat/tests/test_accumulation_card.py
git commit -m "feat(chat): add net-by-date series to accumulation card payload"
```

---

### Task 10: `AccumulationTrendChart` primitive + embed in `AccumulationCard`

**Files:**
- Create: `frontend/src/components/chat/gen-ui/charts/AccumulationTrendChart.tsx`
- Modify: `frontend/src/components/chat/gen-ui/SimpleCards.tsx` (`AccumulationCard`, lines 128-164; and the `AccumulationRow`/props area)
- Modify: `frontend/src/components/chat/gen-ui/GenUIRegistry.tsx:99-100` (pass the new `series` prop through — `data` already flows, so add `series={data.series || []}`)
- Test: `frontend/src/__tests__/unit/gen-ui/AccumulationTrendChart.test.tsx`, `frontend/src/__tests__/unit/gen-ui/AccumulationCard.test.tsx`

**Interfaces:**
- Consumes: `accumulation` card `data.series` from Task 9.
- Produces:
  - `export interface NetPoint { date: string; net: number }`
  - `export function toTrendPoints(series: NetPoint[]): NetPoint[]` — coerces `net` to number, drops undated points.
  - `export default function AccumulationTrendChart({ series }: { series: NetPoint[] }): JSX.Element | null`
  - `AccumulationCard` gains an optional `series?: NetPoint[]` prop.

- [ ] **Step 1: Write the failing test (primitive transform)**

`AccumulationTrendChart.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { toTrendPoints } from '@/components/chat/gen-ui/charts/AccumulationTrendChart';

describe('toTrendPoints', () => {
    it('coerces net to number and keeps dated points', () => {
        expect(toTrendPoints([{ date: '2026-06-01', net: 10 }, { date: '2026-06-02', net: 20 }]))
            .toEqual([{ date: '2026-06-01', net: 10 }, { date: '2026-06-02', net: 20 }]);
    });

    it('drops undated points', () => {
        expect(toTrendPoints([{ date: '', net: 5 }])).toEqual([]);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/unit/gen-ui/AccumulationTrendChart.test.tsx`
Expected: FAIL — module/`toTrendPoints` not found.

- [ ] **Step 3: Write the primitive**

```tsx
'use client';

import React from 'react';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine } from 'recharts';

export interface NetPoint {
    date: string;
    net: number;
}

export function toTrendPoints(series: NetPoint[]): NetPoint[] {
    return (series || []).filter((p) => p.date).map((p) => ({ date: p.date, net: Number(p.net ?? 0) || 0 }));
}

export default function AccumulationTrendChart({ series }: { series: NetPoint[] }) {
    const points = toTrendPoints(series);
    if (points.length < 2) return null;
    return (
        <div className="w-full h-44">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={points} margin={{ left: 8, right: 12, top: 8 }}>
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} minTickGap={24} />
                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} width={48} />
                    <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
                    <Tooltip formatter={(v: number) => [Math.round(v).toLocaleString(), 'Net']} />
                    <Area type="monotone" dataKey="net" stroke="#6366f1" fill="#6366f1" fillOpacity={0.25} />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
```

- [ ] **Step 4: Run transform test to verify it passes**

Run: `cd frontend && npx vitest run src/__tests__/unit/gen-ui/AccumulationTrendChart.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the failing card test**

`AccumulationCard.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AccumulationCard } from '@/components/chat/gen-ui/SimpleCards';

vi.mock('@/components/chat/gen-ui/charts/AccumulationTrendChart', () => ({
    __esModule: true,
    default: () => <div data-testid="accumulation-trend" />,
}));

const rows = [{ entity_id: '1', transaction_date: '2026-06-01', cumulative_buy: 100, cumulative_sell: 40, cumulative_net: 60 }];
const series = [{ date: '2026-06-01', net: 60 }, { date: '2026-06-02', net: 80 }];

describe('AccumulationCard', () => {
    it('renders the trend chart when series is present and keeps the broker table', () => {
        render(<AccumulationCard symbol="NABIL" rows={rows} series={series} />);
        expect(screen.getByTestId('accumulation-trend')).toBeInTheDocument();
        expect(screen.getByText('#1')).toBeInTheDocument(); // broker row retained
    });

    it('omits the trend chart when there is no series', () => {
        render(<AccumulationCard symbol="NABIL" rows={rows} />);
        expect(screen.queryByTestId('accumulation-trend')).not.toBeInTheDocument();
    });
});
```

- [ ] **Step 6: Run card test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/unit/gen-ui/AccumulationCard.test.tsx`
Expected: FAIL — `AccumulationCard` does not accept `series` / no trend testid.

- [ ] **Step 7: Wire the chart into `AccumulationCard`**

Add import in `SimpleCards.tsx`:

```tsx
import AccumulationTrendChart, { NetPoint } from './charts/AccumulationTrendChart';
```

Change the `AccumulationCard` signature and add the chart above the table (keep the existing `sorted` table body unchanged):

```tsx
export function AccumulationCard({ symbol, rows, series }: { symbol: string; rows: AccumulationRow[]; series?: NetPoint[] }) {
    const sorted = [...rows].sort((a, b) => Math.abs(b.cumulative_net) - Math.abs(a.cumulative_net)).slice(0, 10);
    return (
        <div className="surface overflow-hidden text-sm">
            <div className="px-4 py-2.5 border-b border-border">
                <span className="font-medium text-foreground">{symbol} · Broker accumulation</span>
            </div>
            {series && series.length > 1 && <div className="px-4 pt-3"><AccumulationTrendChart series={series} /></div>}
            <div className="overflow-x-auto">
                {/* existing <table>…</table> unchanged */}
            </div>
        </div>
    );
}
```

(Keep the existing `<table>` block exactly as it is at lines 135-161.)

- [ ] **Step 8: Pass `series` through the registry**

In `GenUIRegistry.tsx`, update the `accumulation` case (line 99-100):

```tsx
        case 'accumulation':
            return <SimpleCards.AccumulationCard symbol={data.symbol} rows={data.rows || []} series={data.series || []} />;
```

- [ ] **Step 9: Run card test to verify it passes**

Run: `cd frontend && npx vitest run src/__tests__/unit/gen-ui/AccumulationCard.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 10: Commit**

```bash
git add frontend/src/components/chat/gen-ui/charts/AccumulationTrendChart.tsx frontend/src/components/chat/gen-ui/SimpleCards.tsx frontend/src/components/chat/gen-ui/GenUIRegistry.tsx frontend/src/__tests__/unit/gen-ui/AccumulationTrendChart.test.tsx frontend/src/__tests__/unit/gen-ui/AccumulationCard.test.tsx
git commit -m "feat(chat): embed accumulation trend chart in AccumulationCard"
```

---

### Task 11: Full suite green + lint

**Files:** none (verification task).

- [ ] **Step 1: Run the full frontend unit suite**

Run: `cd frontend && npm run test`
Expected: PASS, including the 7 new gen-ui test files; no pre-existing tests broken.

- [ ] **Step 2: Run frontend lint**

Run: `cd frontend && npm run lint`
Expected: no new errors in `components/chat/gen-ui/**` or `__tests__/unit/gen-ui/**`.

- [ ] **Step 3: Run the backend chat tests**

Run: `cd backend && pytest chat/tests/test_accumulation_card.py -v` (or the full `pytest chat/` if fast enough)
Expected: PASS.

- [ ] **Step 4: Commit any lint fixes**

```bash
git add -A
git commit -m "chore(chat): lint fixes for gen-ui graph cards"
```

(Skip if there is nothing to commit.)

---

## Deploy notes

- Frontend changes require a Docker image rebuild + hard refresh (`localhost:3000` is Docker-built, not the dev server).
- The backend `accumulation` card change is code-only — restart the backend container; no migration.

## Self-Review

**Spec coverage:**
- Trigger model (data-driven) ✓ — charts derive from existing card payloads, no model invocation.
- Embed-not-duplicate ✓ — each chart renders inside its existing card (Tasks 2, 4, 6, 8, 10).
- Charts + richer tables ✓ — Price gains an OHLCV table (Task 2); Holdings gains a Weight column (Task 4); Risk keeps dimension bars beneath the radar (Task 6); Accumulation keeps the broker table (Task 10); Market keeps gainer/loser lists (Task 8).
- Five domains ✓ — Price (1-2), Allocation (3-4), Risk (5-6), Market movers (7-8), Accumulation (9-10).
- Reuse existing patterns ✓ — echarts candlestick mirrors `StockChart.tsx`; radar mirrors `RiskRadar.tsx`; donut mirrors `PortfolioGoals.tsx`.
- Backend audit outcome ✓ — Price & Allocation confirmed frontend-only; Risk frontend-only (`radar_data` already present); Market movers frontend-only (`price_change` present); Accumulation is the one additive backend field (`series`, Task 9). No new card types, no protocol change, no migration.
- TDD + commits per task ✓. 30-line limit respected (transforms and components are small; helpers extracted).

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every command shows expected output.

**Type consistency:** Transform names referenced across tasks are stable — `toCandleSeries`, `toAllocationSegments`, `toRadarPoints`, `toMoverBars`, `toTrendPoints`; `NetPoint` defined in Task 10 and consumed by `AccumulationCard`; `_accumulation_series` defined and tested in Task 9. Card props (`series` on `AccumulationCard`) consistent between Task 10's component and the registry wiring.
