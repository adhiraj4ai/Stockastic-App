# Plan Generate Button — Design Spec

**Date:** 2026-06-13  
**Branch:** feat/nepse-api-integration

## Summary

Add a "Generate plan" button to the `/plan` page so any logged-in user can trigger plan generation on demand, without waiting for the 17:30 Celery beat run.

## Backend

### New endpoint

`POST /api/stocks/plan/generate/`  
Permission: `IsAuthenticated`  
View: `PlanGenerateView` in `backend/stocks/views/plan.py`

**Logic:**
1. Call `build_daily_plan()` from `stocks.services.daily_plan`.
2. Compute user overlay and sizing (same as `PlanTodayView.get`).
3. Return the serialized plan + overlay on success (HTTP 200).
4. On any exception, return `{ "detail": "<message>" }` with HTTP 400.

**Response shape:** identical to `GET /api/stocks/plan/today/` so the frontend can set plan state directly from the response.

### URL registration

`path('plan/generate/', plan.PlanGenerateView.as_view(), name='plan_generate')`  
Added in `stocks/urls.py` alongside the existing plan routes.

## Frontend

### Button placement

In the controls bar (`/plan/page.tsx`), right side (`ml-auto flex-wrap` div), after the "Generated at" chip.

### Button spec

- Component: existing `Button`, `variant="outline"`, `size="sm"`
- Icon: `RefreshCw` from lucide-react (spins while generating via `animate-spin` class)
- Label: "Generate plan" (idle) / "Generating…" (in-flight)
- Disabled while `generating === true` (prevents double-submit)

### State

New `generating: boolean` state in `PlanPage`. No new component file.

### Handler

```
POST /api/stocks/plan/generate/
```
- On success: set `plan` to response data, clear `historyDate` and `historyPlan`, `toast.success("Plan generated.")`.
- On error: `toast.error("Could not generate plan: " + detail)`.

## Edge cases

| Scenario | Behaviour |
|---|---|
| Plan already exists for today | `build_daily_plan()` is idempotent — returns existing row; button acts as a refresh |
| Generation takes 5–15s | Spinner + disabled button prevents double-submit; existing plan stays visible |
| No price data / service error | Backend returns 400; frontend shows toast.error |
| User viewing a history date | On success, history is cleared and latest (freshly generated) plan is shown |

## Testing

One new backend test in `tests/test_daily_plan.py`:
- POST to `/api/stocks/plan/generate/` with authenticated user
- Mock `build_daily_plan` to return a plan fixture
- Assert HTTP 200 and response contains `date`, `picks`, `overlay` keys

No new frontend tests (pattern mirrors the existing draft-trade-plan button).

## Out of scope

- Notifications on manual generate (those fire from the Celery task path only)
- Rate limiting the generate endpoint
- Staff-only gating (all authenticated users can trigger)
