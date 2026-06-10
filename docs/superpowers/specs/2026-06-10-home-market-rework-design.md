# Home & Market Page Rework — Design

**Date:** 2026-06-10
**Status:** Approved
**Scope:** Authenticated home page (`/`) and Market page (`/market` + subroutes). Guest landing page is out of scope. Visual theme is unchanged — this is a structure/content rework.

## Problem

The authenticated home page (`MarketPulse`) and the Market page ("Market Terminal") duplicate ~80% of each other: index hero, sentiment, top movers, and breadth appear on both. Neither page surfaces the rest of the app (signals, recommendations, accumulation, watchlist). The Market page's seven subroutes (movers, activity, bulk, rotation, volume-profile, pa-screener, matching) are invisible from the main page — discoverable only by URL. Refresh behavior is inconsistent: home polls every 10s, Market is static after load.

## Decision

**Home = personal cockpit. Market = market-wide deep-dive.** Zero duplication; each page has one job.

- Home becomes a "Morning Briefing": what should I act on today (signals, recommendations, smart money, watchlist, alerts) plus a compact market strip.
- Market owns all market-wide analytics, restructured as a top-down storyline, with a persistent tab bar integrating all subroutes.

## Home Page — "Morning Briefing"

Route `/` (authenticated), inside the existing `DashboardLayout`. `MarketPulse.tsx` is rewritten with four zones, each a small subcomponent:

### Zone 1 — Compact market strip (`MarketStrip`)
- Full-width single row at top: NEPSE index + points/% change, turnover, volume, advancers/decliners, market OPEN/CLOSED status.
- No hero treatment. Whole strip links to `/market`.
- Data: `/api/stocks/summary/` via existing `useMarketData` hook. Polling is market-hours-aware: 10s while market is open, ≥60s when closed (use `?mode=status` to know state).

### Zone 2 — Today's Signals & Recommendations (`TodaysSignals`)
- Full-width hero zone — the primary "act on this" surface.
- Latest generated signal episodes: `/api/stocks/generated-signals/latest/` (symbol, BUY/SELL, source engine, entry strength, target/stop prices).
- Merged with top recommendations (conviction-sorted, top ~5) from:
  - `/api/stocks/broker-accumulation-recommendations/`
  - `/api/stocks/smart-accumulated-crossover-recommendations/`
  - `/api/stocks/ichimoku-accumulation-recommendations/`
- Each row links to `/ticker/{symbol}`. Zone header links to `/signals` and `/recommendations`.
- Merge logic (dedupe by symbol, conviction sort) extracted to a pure helper; unit-tested if non-trivial.
- Empty state: "No active signals today" + link to `/strategies`.

### Zone 3 — Smart Money / Accumulation highlights (left half)
(`SmartMoneyHighlights`)
- Top 5 net accumulation flows: `/api/stocks/companies/accumulation/?range=1W`.
- Top aggressive accumulators: `/api/stocks/companies/aggressive/?range=1W`.
- 2–3 below-cost entries: `/api/stocks/companies/below_cost/`.
- Header links to `/accumulation/dashboard`.

### Zone 4 — Watchlist & Alerts (right half)
(`WatchlistAlerts`)
- Watchlist tickers with LTP/change: `/api/stocks/watchlist/`.
- Top 5 unread notifications with category icons: `/api/stocks/notifications/?unread=true`.
- Empty watchlist → inline "add ticker" affordance. Header links to `/portfolio/watchlist` and `/notifications`.

### Removed from home
Live pulse ticker table, bulk transactions feed, sentiment gauge, health radar. All exist on (or move to) Market. `LiveMarketPulseTable` and `LiveBulkTransactions` become unused on home but are left in the codebase unless confirmed orphaned.

### Data strategy
Client-side parallel fetches per zone (~7 calls on load), matching existing app patterns. No new backend endpoint now; a `/api/stocks/home-digest/` aggregator is the documented upgrade path if load feels slow.

## Market Page — Top-Down Storyline + Tabs

### Tab bar (`MarketTabs`)
- New shared component: `Overview | Movers | Activity | Bulk | Rotation | Volume Profile | Screener | Matching`.
- Rendered from a new `frontend/src/app/(authenticated)/market/layout.tsx` so every subroute inherits it. Active tab derived from pathname. URLs unchanged.
- Subroute pages otherwise untouched, except removing local headers/back-links that clash with the tab bar.

### Overview tab (`market/page.tsx`) — full-width rows, top-down
1. **Index hero row** — NEPSE points, change, %, turnover, volume, advancers/decliners. Existing animated ticker ribbon stays beneath it. Cmd+K command palette stays.
2. **Market internals row** (3 cols) — Sentiment gauge + advancers/decliners; Health Radar; 5-day Breadth Trend.
3. **Sectors & movers row** (2 cols) — Sector treemap | High-Alpha tabs (Gainers / Losers / ROC). Rows link to `/ticker/{symbol}`; movers header links to the Movers tab.
4. **Smart money row** (2 cols) — Broker Flow chart | Liquidity Bubble Map.
5. **Secondary internals row** (3 cols) — Volume Shockers; Breakout Watchlist; Institutional Interest (rehomed from the old sticky sidebar, components reused as-is).

### Removed from Market
- Portfolio Summary card (data remains on `/portfolio`). Drop the `/api/stocks/portfolio/` fetch from this page.
- The sticky 3-column sidebar layout.
- No widget component is deleted — everything is rehomed or already lives on a subroute.

### Refresh behavior
Overview adopts the same market-hours-aware polling as home (live while open, slow when closed), fixing the home-live/market-static inconsistency.

### Data
Same endpoints as today minus portfolio: `/api/stocks/summary/`, `/api/stocks/sector-history/NEPSE/`.

## Error & Empty States

Every zone/card fetches and renders independently. A failed fetch shows a compact inline error within that card only — never blanks the page. Empty states are first-class (no signals today, empty watchlist, no unread alerts) and link to the relevant feature page.

## Components Summary

| Component | Change |
|---|---|
| `MarketPulse.tsx` | Rewritten as Morning Briefing; zones as subcomponents `MarketStrip`, `TodaysSignals`, `SmartMoneyHighlights`, `WatchlistAlerts` |
| `MarketTabs` | New; pathname-driven active state |
| `market/layout.tsx` | New; renders `MarketTabs` |
| `market/page.tsx` | Restructured to storyline rows; existing widgets (SectorTreemap, BrokerFlowChart, MarketBubbleMap, MarketHealthRadar, VolumeShockers, BreakoutWatchlist, InstitutionalInterest) reused as-is |
| `useMarketData` | Gains market-hours-aware polling interval |

## Testing & Verification

- No existing component tests for these pages; verification is `npm run build` (type-check) plus a manual run-through: home zones load with data, market overview rows render, tab bar appears on every `/market/*` route with correct active state, links navigate correctly, error/empty states behave.
- Pure helpers (e.g. signal/recommendation merge) get unit tests if non-trivial.

## Out of Scope / Future

- Guest landing page refresh.
- `/api/stocks/home-digest/` aggregator endpoint (upgrade path if home load is slow).
- Subroute content improvements (user noted "we will update a few in future").
- Removal of `LiveMarketPulseTable` / `LiveBulkTransactions` if confirmed orphaned.
