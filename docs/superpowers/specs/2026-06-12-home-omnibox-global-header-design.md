# Global Header + Home Omnibox + Trader Greeting — Design

**Date:** 2026-06-12
**Status:** Approved (user confirmed design in session)

## Goal

1. Show the `DashboardLayout` top header on every authenticated page.
2. Rework the home page (`TickerLanding`) around a single "omnibox" that serves both ticker search and AI chat.
3. Greet the user with a rotating, market-phase-aware trading prompt.

## 1. Header on every page

`DashboardLayout` already renders a fixed top header unless `hideHeader` is passed.
Remove the `hideHeader` opt-out from all six call sites:

| Page | File | Notes |
|---|---|---|
| Home | `components/TickerLanding.tsx` | Title "Home", subtitle "Ticker Intelligence" |
| Chat | `app/(authenticated)/chat/ChatPageClient.tsx` | Full-height workspace: inner container becomes `calc(100vh - 56px)` under the fixed header |
| Notebook | `app/(authenticated)/notebook/page.tsx` | Same height treatment as chat |
| Admin Users | `app/(authenticated)/admin/users/UsersManagementClient.tsx` | De-dupe any in-page title bar the header now covers |
| Admin Pipeline | `app/(authenticated)/admin/pipeline/PipelinePageClient.tsx` | Same |
| Admin Financials | `app/(authenticated)/admin/financials/FinancialsPageClient.tsx` | Same |

The header is 56px (`h-14`) and `DashboardLayout` already applies `pt-[72px]` to content when the header is visible.

## 2. Home omnibox

One large input replaces the current search box. No mode toggle.

- Typing runs the existing debounced `/api/stocks/companies/?search=` lookup.
- Dropdown: ticker matches first, then a persistent final row
  `✦ Ask Stockastic AI — "<typed text>"` (hidden when the user lacks the `chat` permission).
- Enter resolves intent:
  - Looks like a question (contains whitespace or `?`) → `/chat?q=<text>`.
  - Exact symbol match, else first company result → `/ticker/SYMBOL`.
  - No matches and single token → `/ticker/<UPPERCASED TOKEN>` (current behavior).
- Arrow-key navigation across all dropdown rows including the AI row; Escape closes.
- `ChatPageClient` accepts `?q=<text>`: pre-fills the composer and auto-sends once on mount.
- Portfolio / Discover quick-pick chips below the omnibox are unchanged.

## 3. Greeting

Above the omnibox:

- Line 1: time-of-day greeting + display name ("Good evening, Rajan.").
- Line 2: one curated prompt from a market-phase pool:
  - **pre-open** (Sun–Thu before 11:00), **open** (Sun–Thu 11:00–15:00), **closed** (after 15:00 and Fri/Sat).
- Selection is date-seeded (day-of-year modulo pool size) so it rotates daily and is stable within a day.
- Pure client-side; NEPSE hours hard-coded (Sun–Thu 11:00–15:00 local time). No API call.

## Out of scope

- Sidebar/nav changes, other pages' content, backend changes.

## Testing

- Unit tests (Jest, existing `__tests__/` conventions): intent resolution (symbol vs question), greeting phase + date-seeded selection.
- Manual: header present on all six former opt-out pages without layout breakage; omnibox → ticker and → chat flows.

## Deploy note

localhost:3000 serves the Docker-built frontend — verifying live requires an image rebuild + hard refresh.
