# Chat generative-UI graphs — design

**Date:** 2026-06-26
**Branch:** `worktree-feat+chat-genui-graphs` (worktree, branched from `origin/main`)
**Status:** Approved design, ready for implementation plan

## Problem

Chat already renders structured "cards" through a mature generative-UI pipeline,
but none of the cards draw an actual graph — they are tables, metric grids, and
progress bars. We want preconfigured graph types that appear automatically when a
chat tool fetches relevant data, embedded inside the card that already shows that
data, and we want the sparser cards to also carry richer tabular detail.

## How the existing pipeline works (context)

- **Backend:** chat tools push typed JSON cards through a side-channel
  (`chat/_user_context.push_card`). Cards are drained after each `tool_result`
  and streamed as `card` SSE frames: `{ kind, type, data, tool }`
  (`chat/streaming.py`). The `data` object is arbitrary JSON and is **never**
  shown to the model — it is frontend-only.
- **Frontend:** `chat-sse.ts` parses SSE frames; `ChatInterface.applyFrame()`
  pushes `card` blocks onto the message; `MessageBubble` → `GenUIContainer`
  (`gen-ui/GenUIRegistry.tsx`) switches on `type` and renders the matching card
  component, passing `data` as props.

The card `type` strings and the streaming protocol are stable. This feature adds
**no new card types and no protocol change** — it enriches existing card
components and, where needed, adds fields to existing card `data` payloads.

## Decisions

1. **Trigger model — data-driven (not model-driven).** Graphs appear
   automatically when a data tool returns; the model does not choose to draw a
   chart. (Chosen over a dedicated `render_chart` tool.)
2. **Embed, don't duplicate.** The chart renders *inside* the existing card for
   that tool, above the existing tabular content — one coherent card per tool
   result. (Chosen over a separate chart card or replacing the table.)
3. **Charts + richer tables.** Sparse cards gain both a chart and fuller tabular
   detail, not just a chart bolted onto thin data.
4. **Reuse the app's existing chart components/patterns** rather than inventing
   new charting infrastructure. Both `echarts`/`echarts-for-react` and `recharts`
   are already in `package.json` and used across the app.

## v1 scope — five domains

| Domain | Card `type` | Card component | Chart | Lib | Existing pattern reused |
|--------|-------------|----------------|-------|-----|-------------------------|
| Price/OHLCV | `price_history` | `PriceHistoryCard` (`SimpleCards.tsx`) | Candlestick + volume | echarts | `StockChart.tsx` |
| Allocation | `holdings` | `HoldingsCard.tsx` | Allocation donut | recharts | `PortfolioGoals.tsx` |
| Risk | `risk` | `RiskCard.tsx` | Radar | recharts | `RiskRadar.tsx` |
| Market movers | `market_summary` | `MarketSummary.tsx` | Gainers/losers bars | recharts | — |
| Broker accumulation | `accumulation` | `AccumulationCard` (`SimpleCards.tsx`) | Trend line over time | recharts | — |

## Architecture

### Chart primitives — the "preconfigured catalog"

New folder `frontend/src/components/chat/gen-ui/charts/`. Each primitive is a
pure, prop-typed React component (no data fetching, no card knowledge), so it is
unit-testable in isolation and reusable beyond chat:

| Primitive | Lib | Consumed by |
|-----------|-----|-------------|
| `CandlestickChart` | echarts (`ssr: false` dynamic import) | `PriceHistoryCard` |
| `AllocationDonut` | recharts | `HoldingsCard` |
| `RiskRadarChart` | recharts | `RiskCard` |
| `MoversBarChart` | recharts | `MarketSummary` |
| `AccumulationTrendChart` | recharts | `AccumulationCard` |

Each card maps its `data` → the primitive's props, renders the chart above its
(enriched) table, and degrades gracefully when data is missing.

### Data flow

```
tool (backend) ── card{type,data} ──► SSE ──► applyFrame ──► card block
        │                                                        │
        └─ data already frontend-only ──► GenUIContainer ─► <Card data> ─┐
                                                                          │
                       maps data → props ──► <ChartPrimitive> + <Table> ──┘
```

No change to the registry switch, `applyFrame`, or the SSE protocol.

### Backend payload audit (per domain)

Charts derive only from `data` the card already carries — **except** where the
current payload is too sparse for a good chart or a richer table. Confirmed
status:

- **Price/OHLCV — frontend-only.** `price_history` card already carries full
  OHLCV rows (`date, open, high, low, close, volume, diff_percent`) in
  `chat/tools/market.py::get_price_history`.
- **Allocation — frontend-only.** `holdings` card already carries per-holding
  `current_value` (rows pre-sorted desc) in
  `chat/tools/portfolio.py::get_holdings`.
- **Risk — needs audit.** A radar needs several normalized (0–1 or 0–100)
  dimensions. If `risk` card data lacks them, add an additive `dimensions: [{key,
  label, value}]` array to that tool's card `data`.
- **Market movers — likely frontend-only.** `market_summary` already carries
  `top_gainers` / `top_losers`; confirm each row has a numeric change field for
  the bars.
- **Broker accumulation — needs audit.** A trend line needs a time series.
  Confirm the `accumulation` card carries dated rows; if not, extend that tool's
  card `data` with a `series: [{date, value}]` array.

Any backend change is **additive fields on existing card `data`** — no new card
types, no streaming/protocol change, no migration. Exact gaps are confirmed
per-domain during implementation before writing the chart.

## Components touched

- **New:** `gen-ui/charts/CandlestickChart.tsx`, `AllocationDonut.tsx`,
  `RiskRadarChart.tsx`, `MoversBarChart.tsx`, `AccumulationTrendChart.tsx`
  (+ co-located tests).
- **Edited:** `gen-ui/SimpleCards.tsx` (`PriceHistoryCard`, `AccumulationCard`),
  `gen-ui/HoldingsCard.tsx`, `gen-ui/RiskCard.tsx`, `gen-ui/MarketSummary.tsx`.
- **Edited (only if audit finds gaps):** `chat/tools/*.py` for the `risk` and
  `accumulation` card payloads (+ pytest).

## Testing — TDD (red → green → refactor)

Per `CLAUDE.md`, tests are written first.

**Frontend (Vitest, co-located):**
- Each chart primitive: derives the correct series/segments from a sample
  payload; renders an empty/fallback state for missing or empty data without
  crashing.
- Each enriched card: renders the chart for a representative `data` payload;
  shows the new table columns; falls back cleanly when the chart-feeding fields
  are absent (older payloads stay safe).

**Backend (pytest), only for domains needing payload extension:**
- A test asserting the tool's card `data` now includes the new fields
  (`dimensions` / `series`) with the expected shape — written before the tool
  change.

## Conventions

- Function/method bodies ≤ 30 lines; extract helpers (e.g. `data → series`
  mappers) rather than inlining.
- Format API decimals via `lib/numbers`; never ad hoc.
- Warm sans-serif, sentence-case labels; no all-caps, no monospace/terminal
  styling. Chart legends/axes follow the same.
- echarts charts render client-side only (`ssr: false`) matching `StockChart.tsx`.
- No new card `type` strings; registry and SSE protocol untouched.

## Out of scope (v1)

- Model-driven / on-demand chart invocation (`render_chart` tool).
- Remaining domains (dividends, smart-money/whale bars, realized P/L, signal
  gauge, sector treemap) — deferred to a follow-up using the same catalog.
- Chart interactivity beyond what the reused components already provide
  (zoom/brush, drill-through).
