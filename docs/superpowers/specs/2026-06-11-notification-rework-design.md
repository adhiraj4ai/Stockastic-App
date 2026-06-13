# Notification System Rework — Design

**Date:** 2026-06-11
**Status:** Approved
**Scope:** Notification service (backend), notification UI (bell dropdown, `/notifications` page, home card), and popups (toasts).

## Problem

1. **Popups are off-theme.** New-alert toasts use sonner's stock `richColors` styling — saturated green/red/amber surfaces that clash with the app's restrained warm-neutral + indigo design language (flat surfaces, hairline borders, tabular numerals).
2. **Popups are functionally thin.** They show title + message + a "View" link. No inline data, no mark-as-read on dismiss, no quick actions, and every one of the ~28 notification types fires the same toast — a whale-watch summary interrupts identically to a stop-loss hit.
3. **Three surfaces, three implementations.** `AlertsDropdown.tsx`, `notifications/page.tsx`, and `home/WatchlistAlerts.tsx` each maintain their own type→icon/color logic and their own polling loop (60s / page-load / 15s). Rich `metadata` JSON stored by the backend is mostly never rendered.
4. **No severity model.** The backend treats all types equally; the page infers "severity" heuristically in the frontend.

## Decisions (validated with user)

- Popups must support: context navigation, inline data from metadata, dismiss-marks-read, and type-specific quick actions.
- Delivery stays **REST polling**, but centralized in a single provider (no SSE/WebSocket).
- **Severity tiers are built-in** (backend-assigned per type); no user preferences UI in this iteration.
- Popups are **adaptive**: three visual variants (quiet line / data card / action panel) chosen per notification, plus a bell-only tier that never pops.
- Bell dropdown and notifications page keep their layout structure but get unified config and metadata-enriched rows.

## Architecture

```
backend                                  frontend
───────                                  ────────
SEVERITY_MAP ─┐                          lib/notifications/config.ts  (registry)
create_notification() ──> Notification   ├── popup renderer (toast.custom)
  · severity field            │          ├── AlertsDropdown rows
  · metadata contract         │          ├── /notifications page rows + detail dialog
check_* functions ────────────┘          └── home WatchlistAlerts card
                                                   ▲
GET /notifications/  <──── poll 20s ──── NotificationProvider (context)
POST mark_as_read / mark_all_as_read              │
                                          markRead / unreadCount / triggerCheck
```

## 1. Frontend notification registry

New module: `frontend/src/lib/notifications/config.ts`.

One entry per notification type:

```ts
interface NotificationTypeConfig {
  icon: LucideIcon;
  tone: 'danger' | 'success' | 'warning' | 'info' | 'accent'; // maps to theme-token classes
  category: 'portfolio' | 'watchlist' | 'signals' | 'technical' | 'broker' | 'market' | 'system';
  severity: 'critical' | 'high' | 'normal' | 'low';   // fallback; backend value wins
  variant: 'panel' | 'card' | 'line' | 'none';        // popup variant
  buildRoute(n: Notification): string | null;          // prefers n.redirect_url
  quickActions?(n: Notification): Array<{ label: string; href: string }>;
}
```

Shared helpers in the same module:

- `renderMetrics(metadata)` → ordered `{label, value, tone}` list for the metrics strip (LTP, level, P/L%).
- `getVariant(n)` → registry variant, escalated to `panel` when `metadata.symbols?.length > 1` or `ticker === 'SUMMARY'`.
- `getSeverity(n)` → `n.severity ?? registry fallback`.

All three surfaces and the popup renderer import from this module. The per-file `ALERT_STYLES`/icon maps in `AlertsDropdown.tsx`, `notifications/page.tsx`, and `WatchlistAlerts.tsx` are deleted.

## 2. Backend — severity + metadata contract

### Severity field

- `Notification.severity = CharField(max_length=10, choices=..., default='normal', db_index=True)` + migration.
- `create_notification()` derives severity from a module-level `SEVERITY_MAP` keyed by type; accepts an explicit `severity=` override (used e.g. when a portfolio summary contains ≥1 stop-loss hit → escalate to `critical`).
- `NotificationSerializer` adds `severity` to fields.

### Severity map

| Severity | Types |
|---|---|
| critical | STOP_LOSS_HIT |
| high | TARGET_REACHED, TAKE_PROFIT, SIGNIFICANT_GAIN, SIGNIFICANT_LOSS, SIGNAL_STRONG_BUY, SIGNAL_STRONG_SELL, WATCHLIST_ENTRY, WATCHLIST_BREAKOUT, DAILY_PLAN_READY, WHALE_ENTRY, PRICE_ALERT |
| normal | SIGNAL_BUY, SIGNAL_SELL, VOLUME_SPIKE, RSI_OVERSOLD, RSI_OVERBOUGHT, MACD_BULLISH, MACD_BEARISH, GOLDEN_CROSS, DEATH_CROSS, CONSISTENT_BUYING, CONSISTENT_SELLING, SECTOR_PUMP, MARKET_BREADTH_SHIFT, TREND_BUY_5D, WHALE_BUY, WHALE_SELL, INFO, SUCCESS, WARNING |
| low | PORTFOLIO_DIVERSITY, BELOW_WACC |

### Metadata contract

Every check function populates the keys its type's UI rendering needs. Standard keys (all optional per type, but required where listed):

| Key | Type | Required for |
|---|---|---|
| `price` | number | all single-ticker price alerts |
| `change_pct` | number | gain/loss/signal/technical alerts |
| `level` + `level_type` (`'stop'`\|`'target'`) | number, string | stop-loss, target, take-profit, watchlist alerts |
| `symbols` | `[{symbol, value?, change_pct?, note?}]` | all SUMMARY/aggregate alerts |
| `strategies` | `string[]` | signal alerts |
| `plan_date`, `picks` | string, array | DAILY_PLAN_READY (already present) |

Work item: audit all 10 `check_*` functions in `notification_service.py` and normalize their `metadata` payloads to this contract. No schema enforcement in the DB; contract is enforced by tests (see §6).

### API

No new endpoints. Existing `mark_as_read`, `mark_all_as_read`, `delete_read`, `trigger_check`, and category filters are reused. `?severity=` filter added to the list endpoint (one-line queryset filter) for the page's severity tabs.

## 3. Centralized polling — `NotificationProvider`

New: `frontend/src/components/notifications/NotificationProvider.tsx` (client context, mounted in the authenticated layout).

- Polls `GET /api/stocks/notifications/` every **20s**; pauses when `document.hidden`.
- Exposes: `notifications`, `unreadCount`, `markRead(id)`, `markAllRead()`, `deleteRead()`, `triggerCheck()`, `isStale` (last poll failed).
- **Replaces** the three independent pollers. `AlertsDropdown`, `/notifications` page, and `WatchlistAlerts` consume the context.
- Popup dispatch lives in the provider: on each poll, unread notifications whose IDs are not in the seen-set fire popups per their variant. Seen IDs persist in `sessionStorage` (`stk-seen-notifications`) so refresh doesn't re-toast.
- Error handling: poll failure → exponential backoff (20s → 40s → 80s, cap 5 min) + `isStale` flag (bell shows a subtle stale dot). `markRead` failure → revert optimistic update + quiet-line error toast.

## 4. Adaptive popups

Custom component rendered via sonner's `toast.custom()` — sonner keeps providing stacking/positioning/lifecycle, but all visuals are ours, built from theme tokens (`--card`, `--border`, `--primary`, `--destructive`, severity accent bar, `tabular-nums`). `richColors` styling is no longer used for notification toasts.

New: `frontend/src/components/notifications/NotificationToast.tsx` (+ a small `notifyPopup(n)` dispatcher).

### Variants

| Variant | Used for | Contents |
|---|---|---|
| **panel** (C) | DAILY_PLAN_READY, WATCHLIST_ENTRY, any multi-symbol summary | title, message, symbol chips, quick actions (e.g. "Open briefing chat" → `/chat?session=`, "View plan"), Dismiss |
| **card** (B) | STOP_LOSS_HIT, TARGET_REACHED, TAKE_PROFIT, SIGNIFICANT_GAIN/LOSS, SIGNAL_STRONG_*, WHALE_ENTRY, PRICE_ALERT, WATCHLIST_BREAKOUT | title + ticker chip, message, metrics strip (`renderMetrics`), primary action ("View position"/ticker), Dismiss |
| **line** (A) | SIGNAL_BUY/SELL, technicals (RSI/MACD/volume/crosses), CONSISTENT_*, SECTOR_PUMP, MARKET_BREADTH_SHIFT, WHALE_BUY/SELL, TREND_BUY_5D, INFO/SUCCESS/WARNING | severity bar, title, ticker chip, one key number, click-through |
| **none** | PORTFOLIO_DIVERSITY, BELOW_WACC | bell badge only |

### Behavior

- Durations: critical → sticky until dismissed; high → 10s; normal → 6s.
- Dismiss (✕ or Dismiss button) → `markRead(id)` via provider; bell badge updates immediately.
- Click-through navigates via `next/navigation` router to `buildRoute(n)`.
- Max 3 visible popups; when a poll yields more, show the 3 highest-severity and one summary line "+N more alerts" that opens the bell dropdown.

## 5. Dropdown + page enrichment (layout unchanged)

- **Row treatment everywhere** (dropdown, page, home card): severity dot, ticker chip, key metric from metadata, relative time, unread indicator — same registry-driven rendering as the popups.
- **Dropdown:** keeps bell + tabs; tabs and their type filters now come from registry categories. Detail dialog renders full metadata (metrics strip, symbol table, strategies list).
- **Page:** keeps category sidebar, date grouping, filters — but severity filter uses the real backend field (`?severity=`) instead of frontend inference. Detail modal gets the same metadata rendering as the dropdown dialog (shared component: `NotificationDetail.tsx`).
- **Home card:** consumes provider (its 15s poll is removed).

## 6. Testing

**Backend** (extend existing suite in `backend/tests/`):
- Severity: `create_notification` assigns the mapped severity per type; explicit override wins; serializer exposes it.
- Metadata contract: for each check function, the notifications it creates carry the required keys for their type (parametrized test against the contract table).
- `?severity=` filter returns only matching rows.

**Frontend:**
- Unit tests for the registry: `getVariant` escalation (summary → panel), `getSeverity` fallback, `renderMetrics` output shapes — if a frontend test runner is configured; otherwise covered by typecheck + manual verification.
- Manual verification: trigger_check flow, popup variants per type (seeded notifications), dismiss-marks-read sync, refresh no-retoast.

## 7. Out of scope (explicit)

- WebSocket/SSE push.
- Per-user notification preference settings.
- Notification archival/auto-cleanup.
- Changes to alert-detection logic (thresholds, dedup windows) beyond metadata normalization.

## 8. Deploy notes

- Django migration for `severity` (Docker: run migrate in backend container).
- Frontend served from Docker image → rebuild image + hard refresh to see changes.
- No Celery beat changes; existing schedules untouched.
