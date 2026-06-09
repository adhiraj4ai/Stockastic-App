# Portfolio: Multi-Leg Trade Plans

**Date:** 2026-06-09
**Branch:** TBD (new branch from main)
**Status:** Approved

---

## Problem

The existing `PositionSizingCalculator` is a stateless calculator — it computes a single entry size but has no concept of staged entries, and nothing is saved. Traders entering volatile Nepal market stocks often want to scale in: partial entry now, more at a pullback, more on breakout confirmation. There is no tool to plan, save, and track those staged entries.

---

## Goal

A persisted **multi-leg trade planning tool**: plan a staged entry for a ticker with up to 5 price levels (legs), track risk across all legs, and execute each leg as a real `PortfolioTransaction` when the price is reached.

No new computation models. Reuses `PortfolioService.process_transaction()` for execution.

---

## Scope

- **In scope:** Two new models (`TradePlan`, `TradePlanLeg`), one new API viewset, one new frontend page `/portfolio/plans`
- **Out of scope:** Automatic execution (price alerts triggering legs), chat integration, strategy signal linkage, short-sell legs

---

## Data Model

Both models live in `backend/stocks/models/portfolio.py`.

### `TradePlan`

| Field | Type | Notes |
|-------|------|-------|
| `user` | FK → User | owner |
| `account` | FK → PortfolioAccount (nullable) | which account to execute against |
| `ticker` | CharField(10) | Nepal stock symbol |
| `thesis` | TextField (optional) | trade rationale |
| `risk_budget_pct` | DecimalField(4,2) | max % of account balance to risk on this trade total |
| `target_price` | DecimalField(10,2) (optional) | plan-level take-profit target, used for R/R display |
| `status` | CharField choices | `OPEN` \| `CLOSED` \| `CANCELLED` |
| `created_at` | DateTimeField auto | |

### `TradePlanLeg`

| Field | Type | Notes |
|-------|------|-------|
| `plan` | FK → TradePlan | parent plan |
| `leg_number` | IntegerField | display order (1…5) |
| `price_target` | DecimalField(10,2) | intended entry price |
| `allocation_pct` | DecimalField(5,2) | % of total planned position; all legs must sum to 100 |
| `stop_loss_price` | DecimalField(10,2) | must be < `price_target` |
| `status` | CharField choices | `PENDING` \| `EXECUTED` \| `SKIPPED` |
| `transaction` | FK → PortfolioTransaction (nullable) | set when executed |
| `notes` | TextField (optional) | per-leg notes |

### Lifecycle

- **Execute a leg:** calls `PortfolioService.process_transaction()`, sets `leg.transaction`, sets `leg.status = EXECUTED`
- **Auto-close:** when all legs are `EXECUTED` or `SKIPPED`, plan `status` → `CLOSED`
- **Cancel plan:** sets `plan.status = CANCELLED`; executed leg transactions are preserved
- **Delete a linked transaction:** post-delete signal resets leg to `PENDING` and nulls `leg.transaction`

---

## API

New `TradePlanViewSet` registered at `/api/trade-plans/`.

### Endpoints

| Method | URL | Action |
|--------|-----|--------|
| `GET` | `/api/trade-plans/` | List user's plans; filter by `?status=OPEN` |
| `POST` | `/api/trade-plans/` | Create plan with legs (nested write) |
| `GET` | `/api/trade-plans/{id}/` | Detail — includes legs + computed summary |
| `PATCH` | `/api/trade-plans/{id}/` | Update thesis, risk_budget_pct |
| `DELETE` | `/api/trade-plans/{id}/` | Soft-cancel (status → CANCELLED) |
| `POST` | `/api/trade-plans/{id}/execute_leg/` | Execute one leg |
| `POST` | `/api/trade-plans/{id}/skip_leg/` | Mark one leg as SKIPPED |

### `POST /api/trade-plans/` request body (nested write)

```json
{
  "ticker": "NABIL",
  "account": 1,
  "thesis": "Banking sector recovery play",
  "risk_budget_pct": "2.00",
  "target_price": "1350.00",
  "legs": [
    {"leg_number": 1, "price_target": "1200.00", "allocation_pct": "40.00", "stop_loss_price": "1140.00"},
    {"leg_number": 2, "price_target": "1150.00", "allocation_pct": "35.00", "stop_loss_price": "1095.00"},
    {"leg_number": 3, "price_target": "1100.00", "allocation_pct": "25.00", "stop_loss_price": "1045.00"}
  ]
}
```

### `execute_leg` request body

```json
{
  "leg_id": 3,
  "rate": 1155.00,
  "quantity": 50
}
```

Returns updated leg with linked transaction. Returns 400 if insufficient balance.

### `skip_leg` request body

```json
{ "leg_id": 3 }
```

Sets `leg.status = SKIPPED`. If all remaining legs are now `EXECUTED` or `SKIPPED`, auto-closes the plan.

### Computed fields on detail response (no extra DB queries)

- `total_allocated_pct` — sum of `allocation_pct` across legs (client validates = 100)
- `executed_legs` / `total_legs` — progress counts
- `per_leg_risk_pct` — `risk_budget_pct / total_legs` (rough guidance per leg)

---

## UI

### New page: `/portfolio/plans`

Added as a tab in the existing portfolio navigation.

### Plans list

Table with one row per plan:

```
Ticker | Progress     | Risk budget | Thesis (truncated) | Created | Actions
NABIL  | 1 / 3 legs   | 2.0%        | "Banking sector…"  | Jun 9   | [View] [Cancel]
```

### Plan detail drawer

Opens on row click. Contains:

**Header:** ticker, thesis, risk budget %, account name

**Legs table:**
```
Leg | Price Target | Allocation | Stop Loss | R/R  | Status   | Action
 1  | Rs. 1,200    | 40%        | Rs. 1,140 | 1:3  | EXECUTED | —
 2  | Rs. 1,150    | 35%        | Rs. 1,095 | 1:4  | PENDING  | [Execute]
 3  | Rs. 1,100    | 25%        | Rs. 1,045 | 1:5  | PENDING  | [Execute]
```

R/R is derived client-side from the plan-level `target_price`:
`(plan.target_price - leg.price_target) / (leg.price_target - leg.stop_loss_price)`.
Displayed as "—" if `plan.target_price` is not set.

**Summary bar:** total committed value, total risk (Rs.), remaining legs count.

### Execute leg modal

Pre-filled with `price_target` as rate and calculated quantity:
`quantity = floor(account_balance * (allocation_pct / 100) / price_target)`

User can adjust rate and quantity before confirming. If `rate` deviates >10% from `price_target`, a warning banner is shown (non-blocking).

### Create plan form

Button "New Trade Plan" at page top. Fields:
1. Ticker (typeahead, existing `CompanySelect` component)
2. Account selector (existing accounts)
3. Risk budget %
4. Thesis (optional textarea)
5. Target price (optional, used for R/R display)
6. Legs builder: add up to 5 legs, each with price target / allocation % / stop loss
6. Live validation: allocation % sum shown; submit disabled until sum = 100%

---

## Validation Rules

| Rule | Enforced at |
|------|-------------|
| Leg `allocation_pct` values must sum to 100 | Serializer |
| `stop_loss_price` < `price_target` | Serializer |
| Cannot execute a leg if `plan.status ≠ OPEN` | View |
| Cannot execute an already-`EXECUTED` or `SKIPPED` leg | View |
| Insufficient account balance → 400 error | `execute_leg` action |
| Rate deviation > 10% from `price_target` → warning (non-blocking) | `execute_leg` action |

---

## Error Handling

- **Cancelling a plan** preserves all executed leg transactions — they are real portfolio movements
- **Deleting a linked `PortfolioTransaction`** (via existing transaction delete endpoint): post-delete signal on `PortfolioTransaction` resets the parent `TradePlanLeg` to `PENDING` and nulls its `transaction` FK
- **No hard deletes** on plans — `DELETE` endpoint only sets `status = CANCELLED`

---

## Testing

- Unit: leg validation — allocation sum, stop-loss ordering, duplicate leg numbers
- Unit: `execute_leg` — successful execution creates transaction and updates leg; plan auto-closes when all legs resolved; insufficient balance returns 400
- Unit: `skip_leg` — sets leg to SKIPPED; plan auto-closes when all legs are EXECUTED or SKIPPED
- Unit: post-delete signal — deleting a linked transaction resets leg to PENDING
- Integration: full lifecycle — create plan → execute legs 1 and 3 → skip leg 2 → plan auto-closes

---

## What This Does NOT Do

- Does not trigger leg execution automatically when price is reached (no price alerts)
- Does not integrate with the chat `buy-sell-strategist` subagent
- Does not support short-sell legs (only BUY transaction type on execution)
- Does not modify the existing `PositionSizingCalculator` component
