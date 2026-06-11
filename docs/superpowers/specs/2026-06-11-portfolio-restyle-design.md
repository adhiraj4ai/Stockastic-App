# Portfolio Page Restyle — Design Spec

**Date:** 2026-06-11
**Status:** Approved (Direction A "Command Center match", shared-primitives approach, layout v4)
**Mockup reference:** `.superpowers/brainstorm/5263-1781144865/content/full-page-mockup-v4.html` (gitignored; layout described fully below)

## Goal

Bring `/portfolio` (both Holdings and Watchlist tabs) up to the visual standard of the app's newest pages (Accumulation Command Center, Tomorrow's Plan): modern cards, gradient section headers, sentiment color system, skeleton loaders, and subtle motion — **without changing any data fetching, endpoints, business logic, or features**.

## Non-Goals / Invariants

- No new data, endpoints, or refresh behavior. All API calls (`/api/stocks/accounts/`, `/api/stocks/portfolio/`, `/api/stocks/watchlist/`) and their fetch-once semantics stay exactly as they are.
- No feature changes: tabs, account selector, Optimize button, pagination, sorting, watchlist CRUD, and alert toggles keep their current behavior.
- No sparklines, master-detail panels, or other new visual elements (explicitly descoped to "restyle + modernize").
- Number formatting continues through the existing `lib/formatters.ts` helpers (`formatRupees`, `formatNepaliNumber`).
- Charts stay on recharts; only their container cards, colors-as-needed, and legends are restyled.

## Layout Changes (Holdings tab)

The section ORDER changes (user-approved v4). Current order is: stats cards → Risk Radar → holdings table → sector donut + P&L bars (2-col) → heatmap → health scan. New order:

1. **Action bar** — Holdings/Watchlist tab pills, account selector, Settings, New Account, Optimize (restyled only).
2. **KPI cards** — 4-col grid (2-col on small screens): Capital Deployed, Portfolio Value, Total Returns, Session Swing.
3. **Strategic Holdings** — dedicated **full-width** row directly below the KPI tiles (it is a long, multi-account table and must not share width with anything).
4. **Risk Radar | Sector Allocation** — 2-col row (1-col stacked on small screens).
5. **P&L by Sector | P&L Heatmap** — 2-col row.
6. **Portfolio Health** — full-width card (its existing internal 2-col split of allocation alerts / concentration+volatility becomes the card's internal grid).

Note: the current code renders the sector donut and P&L bars together inside one "Portfolio Visualizer" 2-col block. The restyle decouples them into two independent `SectionCard`s so they can live on different rows (donut pairs with Risk Radar; bars pair with the heatmap). Chart logic moves unchanged; only the wrappers change.

The Watchlist tab keeps its current single-table layout, restyled with the same card/table treatment.

## Visual System (Direction A — Command Center match)

- **Cards:** `rounded-2xl`, `bg-card`, `border border-border` (replacing `border-gray-300`/`dark:border-slate-700`), `shadow-sm` with `hover:shadow-md transition-shadow`.
- **Section headers:** gradient bar inside the top of each card, `rounded-t-2xl`, left-to-right fade of the section's accent color (`from-<accent>-500/15 to-transparent`), containing: small accent-colored icon, `text-xs font-semibold` title, and count/status pill badges. Accent per section:
  - Strategic Holdings, P&L Heatmap — **emerald**
  - Risk Radar — **amber**
  - Sector Allocation, P&L by Sector — **indigo**
  - Portfolio Health — **rose**
- **KPI cards:** colored icon chip (`h-7 w-7 rounded-lg bg-<accent>-500/15 text-<accent>-500`), uppercase `text-[10px] tracking-wider text-muted-foreground` label, `text-xl font-semibold tabular-nums` value, and a context pill under the value (e.g., "▲ +14.8%", "3 accounts"). Accents: Capital Deployed blue, Portfolio Value emerald, Total Returns emerald, Session Swing amber.
- **Sentiment values:** P&L percentages render as bordered pill badges — emerald (`bg-emerald-500/10 text-emerald-500 border-emerald-500/25`) for gains, rose for losses — instead of bare colored text. Plain numeric cells use `tabular-nums`.
- **Tables (holdings + watchlist):** uppercase `text-[10px]` muted header row with sort indicators; row dividers `border-border/50`; zebra `odd:bg-transparent even:bg-muted/20`; row hover `hover:bg-muted/40`; account-group separator rows in indigo tint (`bg-indigo-500/5`, `text-indigo-400` uppercase label); pagination as "Showing X–Y of Z" + Prev/numbered/Next in the Command Center style.
- **Heatmap tiles:** `rounded-xl` tiles, same red→green intensity scale as today, ticker + % stacked, existing hover tooltip preserved.
- **Health bars:** thin `rounded-full` progress tracks (`bg-muted`) with gradient fills — amber gradient for warnings, rose for breaches.
- **Typography:** systematic scale — section titles `text-xs font-semibold`, labels `text-[10px] uppercase tracking-wider`, body numbers `text-sm tabular-nums`, KPI values `text-xl`.
- **Buttons/selects in the action bar:** existing behavior, restyled to `rounded-xl` bordered controls; Optimize gets the indigo accent treatment.
- Both light and dark themes via tokens (`bg-card`, `border-border`, `text-muted-foreground`, `bg-muted`); accent utilities use the `-500/Nopacity` pattern so they work in both modes (matching Command Center).

## Architecture

**New file:** `frontend/src/components/portfolio/ui.tsx` — small, presentational-only primitives (no data fetching, no state beyond trivial local UI state):

- `SectionCard({ accent, icon, title, badges?, className?, children })` — card shell + gradient header. `accent` ∈ `emerald | amber | indigo | rose` mapped to static class strings (no dynamic class construction, Tailwind-safe).
- `KpiCard({ accent, icon, label, value, sub })` — stat tile; `sub` is a ReactNode (usually a `SentimentBadge`).
- `SentimentBadge({ tone: 'up' | 'down' | 'neutral' | 'warn', children })` — bordered pill.
- `KpiSkeleton` and `CardSkeleton({ rows? })` — pulse skeletons for the initial load.

**Modified files:**

- `frontend/src/app/(authenticated)/portfolio/page.tsx` — sections re-wrapped in the primitives, reordered per the layout above, donut/bars decoupled, skeletons during initial load, framer-motion fade+rise on section mount and tab switch. All state, handlers, and fetch logic untouched.
- `frontend/src/components/PortfolioTable.tsx` — header/row/zebra/hover/account-separator/pagination restyle in place.

The page keeps its current component structure otherwise (no section-component split — explicitly chosen "shared primitives" over "primitives + split").

## Loading, Motion, Error States

- Initial load: 4 `KpiSkeleton`s + a `CardSkeleton` where the holdings table goes (replacing the lone spinner). Subsequent account switches keep the existing inline spinner behavior on the table.
- Motion: framer-motion (existing dependency) — sections `initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}` with slight stagger; `AnimatePresence` fade on Holdings↔Watchlist tab switch. Durations ≤ 0.25s; no layout-shifting animations.
- Error states: existing error logic and messages unchanged, rendered inside a `SectionCard` with rose accent.

## Testing & Verification

- Existing test suite must stay green (the known pre-existing ChatInterface tool_use failure is out of scope).
- `npx tsc --noEmit` clean for all touched files; `npm run build` succeeds.
- Visual verification in both themes after the Docker frontend image rebuild + hard refresh on localhost:3000.

## Deploy

localhost:3000 serves the Docker-built frontend — changes visible only after a frontend image rebuild + hard refresh.
