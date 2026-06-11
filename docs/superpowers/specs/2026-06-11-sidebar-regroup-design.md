# Sidebar Regroup — Design Spec

**Date:** 2026-06-11
**Status:** Approved (Approach A: targeted regroup)

## Goal

Reorganize the sidebar in `frontend/src/components/DashboardLayout.tsx` so that:

- Section order follows the user's daily workflow: **Plan → Watch → Act → Review**
- Group names are plain and descriptive (no brand-y labels)
- Misplaced items move to their correct domain group

## Non-Goals / Invariants

- **No route changes.** Every `href` stays exactly as it is; bookmarks and deep links keep working.
- **No permission-key changes.** The `permission` strings on items and the tier-filtering logic are untouched.
- **No rendering/behavior changes.** Collapsible sections, chevron rotation, auto-expand on active child, the 80px icon-collapse mode, and permission filtering all stay as implemented. Only the `navItems` data changes.
- No backend or API changes.

## New Sidebar Structure

Order and contents, top to bottom. Renames are marked.

| # | Section | Items (in order) |
|---|---------|------------------|
| 1 | **Home** | (single item, `/`) — unchanged |
| 2 | **Tomorrow's Plan** | (single item, `/plan`) — unchanged |
| 3 | **Signals** *(renamed from "Strategic Hub")* | Intel Hub `/signals`, Strategies `/strategies`, Track Record `/signals/track-record` |
| 4 | **Market** | Live Market `/market/live`, Terminal `/market`, Movers & Shakers `/market/movers`, **Market Activity** *(renamed from "Deep Dive")* `/market/activity`, Sector Rotation `/market/rotation`, **PA Screener** *(shortened from "Global PA Screener")* `/market/pa-screener`, Social Highlights `/social` |
| 5 | **Floorsheet** | Floorsheet `/floorsheet`, Bulk Transactions `/market/bulk`, Matching Transactions `/market/matching`, Volume Profile `/market/volume-profile` |
| 6 | **Portfolio** *(renamed from "Finfolio")* | My Portfolio `/portfolio`, Performance `/portfolio/performance`, Income `/portfolio/income`, Transactions `/portfolio/transactions`, Watchlist `/portfolio/watchlist`, Trade Plans `/portfolio/plans`, Paper Trading `/paper-trading` |
| 7 | **Broker Research** *(renamed from "Accumulation")* | Command Center `/accumulation/dashboard`, Smart Money `/accumulation/smart-money`, Broker Trends `/accumulation/trends`, Focus Ranking `/accumulation/focus-ranking`, Price Study `/accumulation/price-study`, Broker Favorites `/accumulation/favorites`, Accumulators Navigator `/accumulation/navigator`, Below Cost Positions `/accumulation/below-cost`, **Accumulation History** *(moved from Floorsheet)* `/accumulation/history`, **Share Transfer** *(moved from Floorsheet)* `/accumulation/share-transfer` |
| 8 | **AI Tools** *(renamed from "Stockastic AI")* | Chat `/chat`, Notebooks `/notebook` |
| 9 | **Admin** *(renamed from "Administration")* | **Users** *(shortened from "User Management")* `/admin/users`, Financials `/admin/financials`, Pipeline `/admin/pipeline` |

### Summary of moves and renames

- **Moves:** Accumulation History and Share Transfer leave Floorsheet → Broker Research (they were already under `/accumulation/*` routes).
- **Section reorder:** Signals moves from position 7 up to position 3 (morning prep reads signals before watching the market).
- **Group renames:** Strategic Hub → Signals, Finfolio → Portfolio, Accumulation → Broker Research, Stockastic AI → AI Tools, Administration → Admin.
- **Item renames:** Deep Dive → Market Activity, Global PA Screener → PA Screener, User Management → Users.

## Implementation Notes

- All changes are within the `navItems` constant in `DashboardLayout.tsx` (currently lines 26–115). Reorder array entries, edit `label` strings, and move two subitem objects between sections.
- Grep the frontend for old labels ("Finfolio", "Strategic Hub", "Stockastic AI", "Deep Dive", "Global PA Screener", "User Management") in page titles, breadcrumbs, tests, or copy that refers to the nav group, and update those references for consistency. Do **not** rename routes, directories, permission keys, or backend identifiers.

## Testing

- Run the frontend test suite; update any test that asserts on old labels or nav order.
- Manual verification: sidebar renders 9 sections in the order above with correct items; clicking each item navigates to the unchanged route; active-child auto-expand still works; a non-admin user does not see Admin (permission filtering intact).

## Deploy

localhost:3000 serves the Docker-built frontend — seeing the change requires a frontend image rebuild plus a hard refresh.
