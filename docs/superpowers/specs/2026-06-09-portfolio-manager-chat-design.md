# Portfolio Manager — Chat Agent

**Date:** 2026-06-09
**Branch:** TBD (new branch from `main`)
**Status:** Draft — awaiting user review

---

## Problem

The chat assistant has a `portfolio-advisor` subagent, but it is strictly **read-only**: its prompt says "You do NOT make buy/sell decisions" and it only reports holdings, risk, and watchlist. Meanwhile the backend already has rich portfolio machinery the chat never touches — `process_transaction` (BUY/SELL with NEPSE fees + CGT), portfolio optimization (`perform_portfolio_optimization`, skfolio), `rebalancing_metrics` / `rebalance_suggestions`, `suggest_exits` (ATR/swing stop & target tiers), `PortfolioTarget` allocation targets, and the multi-leg `TradePlan` / `TradePlanLeg` system.

The user wants a chat-driven **Portfolio Manager** that looks after almost every aspect of portfolio management — recording trades, optimizing allocation, managing stops/targets, and building signal-driven plans — with an explicit bias toward **high win rate and high returns**, while keeping a human in the loop for every state change.

---

## Goal

A new **`portfolio-manager`** chat subagent that, on request, analyzes the user's portfolio and **proposes concrete, itemized actions** the user confirms with one tap. Confirmation executes deterministically against the existing backend services — the manager never mutates state directly inside the LLM loop.

Capabilities:
1. **Record buy/sell trades** (`propose_trade`)
2. **Manage stops & targets** (`propose_exits`)
3. **Allocation optimize + rebalance** (`propose_rebalance`)
4. **Signal-driven trade plans** (`propose_trade_plan`)

All ranked by a **Manager Scorecard** that blends expected return with the win-rate / track record of the strategies and signals backing each ticker.

---

## Non-Goals

- **No autonomous writes.** Every state change passes through an explicit user Confirm.
- **No new optimization math.** Reuses `perform_portfolio_optimization`, `suggest_exits`, `rebalancing_metrics`, `PositionSizingService`.
- **No changes to the read-only `portfolio-advisor`.** It stays as-is; the orchestrator routes analysis to it and action to the manager.
- **No live order placement.** Trades are recorded into the user's portfolio ledger (as today), not sent to a broker.
- **No automatic price-triggered execution.** (Same boundary as the existing TradePlan spec.)

---

## Architecture

### Agent topology

```
orchestrator (Task tool only)
├── market-analyst        (read, unchanged)
├── stock-analyst         (read, unchanged)
├── buy-sell-strategist   (read, unchanged)
├── portfolio-advisor     (read, unchanged — reports, never acts)
└── portfolio-manager     (NEW — reads + proposes actions)   ← this spec
```

- New `AgentDefinition` `PORTFOLIO_MANAGER` in `backend/chat/subagents.py`, registered as `"portfolio-manager"` in `AGENTS`.
- Model `opus`, `effort="high"`, `maxTurns≈8` (parity with the strategist — it reasons over multiple data sources before drafting).
- New prompt `backend/chat/prompts/portfolio_manager.yaml`.
- Orchestrator prompt (`prompts/orchestrator.yaml`) gains a routing entry: action verbs about the user's own portfolio ("rebalance me", "trim my losers", "set stops on X", "buy/sell N of X", "build me a plan", "optimize my portfolio") → `portfolio-manager`; pure analysis ("how am I doing", "my risk") stays with `portfolio-advisor`.

### Tools available to `portfolio-manager`

Read (reused, already defined in `tools.py`):
`get_portfolio_overview`, `get_holdings`, `get_watchlist`, `get_risk_profile`,
`get_sector_allocation`, `get_rebalance_targets`, `get_realized_pnl`,
`get_portfolio_accounts`, `get_signals_for_ticker`, `get_signal_track_record`,
`get_strategy_performance`, `calc_position_size`, `get_stock_quote`.

New `propose_*` tools (this spec): `propose_trade`, `propose_exits`, `propose_rebalance`, `propose_trade_plan`.

Each `propose_*` tool is **read + compute + persist-draft only**. It returns prose for the model and pushes a `proposal` card (carrying a `draft_id`) via the existing `push_card` side-channel. It performs **no** mutating writes.

---

## The draft → confirm gate (core safety mechanism)

A chat turn is one-shot SSE; cards are display-only render payloads with no callback into a running agent. Confirmation is therefore decoupled from the LLM turn:

1. **Propose.** A `propose_*` tool computes the exact action(s), writes a `PortfolioActionDraft` row (`status=PENDING`), and emits a `proposal` card with the `draft_id` and a fully itemized preview (shares, price, fees, CGT, resulting allocation, risk delta).
2. **Render.** Frontend `ProposalCard.tsx` (registered in `GenUIRegistry`) shows the itemized actions with **Confirm / Cancel** (Edit = Cancel + ask the manager to adjust, no inline editor in v1).
3. **Confirm.** The button calls `POST /api/portfolio/drafts/{id}/confirm`. The endpoint:
   - re-validates: draft belongs to `request.user`, `status == PENDING`, not expired;
   - **executes at the drafted parameters** (recorded price/quantity/levels — no live re-fetch, per decision: the user is recording their own fills);
   - replays the saved payload deterministically through `PortfolioService` / model writes inside a transaction;
   - sets `status=CONFIRMED`, stores a result summary + links to created rows;
   - returns the execution result for the card to render inline (success state).
   - **Idempotent:** re-confirming a `CONFIRMED` draft is a no-op returning the prior result.
4. **Cancel.** `POST /api/portfolio/drafts/{id}/cancel` sets `status=CANCELLED`.
5. **Expiry.** Drafts carry `expires_at` (default end of next trading day) for hygiene; expired drafts cannot be confirmed (HTTP 409) and the manager is asked to re-draft.

No mutating write ever happens inside the bypass-permissions LLM loop. What the user confirms is exactly what the saved payload encodes.

---

## Data Model

New model `PortfolioActionDraft` in `backend/stocks/models/portfolio.py`.

| Field | Type | Notes |
|-------|------|-------|
| `id` | BigAuto | |
| `user` | FK → User | owner; all queries scoped to this |
| `account` | FK → PortfolioAccount (nullable) | target account, if scoped |
| `session` | FK → chat.ChatSession (nullable, SET_NULL) | chat turn that produced it |
| `kind` | CharField choices | `TRADE` \| `EXITS` \| `REBALANCE` \| `TRADE_PLAN` |
| `status` | CharField choices | `PENDING` \| `CONFIRMED` \| `CANCELLED` \| `EXPIRED` |
| `title` | CharField | one-line human summary (e.g. "Sell 50 NICA @ Rs 412") |
| `payload` | JSONField | exact, typed execution parameters (see per-kind shapes below) |
| `preview` | JSONField | render data for the card (itemized lines, fees, totals, risk delta) |
| `result` | JSONField (default dict) | populated on confirm: created txn/plan/item ids + summary |
| `expires_at` | DateTimeField | confirm rejected after this |
| `created_at` | DateTimeField auto | |
| `confirmed_at` | DateTimeField (nullable) | |

`payload` is the contract between the propose tool and the confirm executor. It is self-contained: the executor never re-derives anything from the LLM.

> **Migration note:** `backend/stocks/migrations` is **gitignored** in this repo (per project history). The migration for `PortfolioActionDraft` must be created with `makemigrations` in each environment; it will not travel in git. The plan must call this out as an explicit step.

### Per-kind `payload` shapes

**`TRADE`**
```json
{
  "account_id": 1,
  "trades": [
    {"ticker": "NICA", "txn_type": "SELL", "quantity": 50, "rate": 412.00,
     "fees": {"commission": 74.16, "sebon_fee": 3.09, "dp_charge": 25.0, "cgt": 103.5},
     "net": 20415.0}
  ]
}
```
Confirm → for each trade, `PortfolioService.process_transaction(user, ticker, txn_type, quantity, rate, account, commission, sebon_fee, dp_charge)`.

**`EXITS`**
```json
{
  "items": [
    {"item_id": 12, "ticker": "SHL", "stop_loss_price": 480.00, "target_price": 560.00, "strategy": "atr_conservative"}
  ]
}
```
Confirm → set `PortfolioItem.stop_loss_price` / `target_price` for each owned item.

**`REBALANCE`**
```json
{
  "account_id": 1,
  "method": "max_sharpe",
  "targets": [{"target_type": "SECTOR", "category_name": "Banking", "target_percentage": 35.0}],
  "trades": [ ... same trade objects as TRADE kind ... ]
}
```
Confirm → upsert `PortfolioTarget` rows, then execute the trade legs via `process_transaction`. (Optionally materialize as a `TradePlan` — v1 executes legs directly; staging is `TRADE_PLAN`'s job.)

**`TRADE_PLAN`**
```json
{
  "ticker": "NABIL", "account_id": 1, "thesis": "Banking recovery, RSI-2 win-rate 71%",
  "risk_budget_pct": 2.0, "target_price": 1350.0,
  "legs": [
    {"leg_number": 1, "price_target": 1200.0, "allocation_pct": 40.0, "stop_loss_price": 1140.0},
    {"leg_number": 2, "price_target": 1150.0, "allocation_pct": 35.0, "stop_loss_price": 1095.0},
    {"leg_number": 3, "price_target": 1100.0, "allocation_pct": 25.0, "stop_loss_price": 1045.0}
  ]
}
```
Confirm → create a `TradePlan` + `TradePlanLeg` rows (reuse the existing `TradePlanSerializer` nested-write validation: legs sum to 100%, stop < target). Legs are then executed by the user over time via the existing `/api/trade-plans/{id}/execute_leg/` flow — unchanged.

---

## API

New endpoints on the existing portfolio API surface (a small `PortfolioActionDraftViewSet` or two `@action`s). All scoped to `request.user`.

| Method | URL | Action |
|--------|-----|--------|
| `GET` | `/api/portfolio/drafts/` | List the user's drafts (filter `?status=PENDING`) |
| `GET` | `/api/portfolio/drafts/{id}/` | Detail (payload + preview + result) |
| `POST` | `/api/portfolio/drafts/{id}/confirm/` | Execute the draft (deterministic, idempotent) |
| `POST` | `/api/portfolio/drafts/{id}/cancel/` | Set status = CANCELLED |

Confirm response:
```json
{"status": "CONFIRMED", "kind": "TRADE",
 "result": {"transaction_ids": [88], "message": "Sold 50 NICA @ Rs 412 — net Rs 20,415 credited."}}
```
Errors: `403` (not owner), `404`, `409` (already resolved or expired), `400` (insufficient balance / validation, surfaced from `process_transaction` / serializers).

The executor lives in a service function `confirm_draft(draft)` (in `portfolio_service.py` or a new `services/portfolio_drafts.py`) that switches on `kind` and runs inside `transaction.atomic()`. The viewset is a thin wrapper. This keeps the execution logic unit-testable without HTTP.

---

## Manager Scorecard — "optimize for win rate + high returns"

The manager ranks candidate actions (which holdings to trim, which to add, how to size) using a composite score per ticker, computed from data it already has via its read tools:

- **Return component** — allocation optimizer weights (`perform_portfolio_optimization`, default `max_sharpe`), upside-to-target, and recent momentum.
- **Win-rate component** — the win rate and track record of the strategies/signals backing the ticker, via `_rank_strategy_signals` (already ranks by `optimization_scope` → `win_rate` → `sharpe` → `pnl`) and `get_signal_track_record`. Tickers backed by high-win-rate, well-scoped strategies score higher; weak or contra-signal holdings surface as trim candidates.
- **Risk penalty** — concentration (single-name > 25%, sector > 50%), low health score (< 40), and drawdown reduce the score.

Decision policy the prompt encodes:
- **Trim / sell:** over-concentrated names, holdings with active SELL signals or deteriorating health, positions far above target allocation.
- **Add / size:** high-conviction, high-win-rate setups — **always** position-sized to a risk % (`calc_position_size`) and **always** paired with a protective stop (`propose_exits`).
- **Protect:** every BUY proposal carries a stop-loss; risk management is treated as the lever that protects win rate, not an afterthought.

The scorecard is documented in the prompt and realized through the propose tools' computation — no separate scoring model in v1 beyond a small helper for the composite.

---

## Frontend

- New gen-UI component `frontend/src/components/chat/gen-ui/ProposalCard.tsx`, registered in `GenUIRegistry.tsx` for card `type: "proposal"`.
- Renders: title, kind badge, itemized action lines (per-trade fees/CGT/net, per-item stop/target, per-leg plan rows, target deltas), totals, and a **risk/allocation delta** summary.
- **Confirm / Cancel** buttons call the draft endpoints via the existing Axios client. While pending → spinner; on success → green confirmed state showing the `result.message` and links (e.g. to the holding or the new trade plan); on error → inline error with the server message.
- A confirmed/cancelled card is terminal (buttons disabled) — re-rendering a persisted transcript shows the last known `status` (fetched from `/drafts/{id}/`).

> **FE build caveat (project history):** the frontend is a **baked image (no volume mount)** — every FE change needs `docker compose build frontend && docker compose up -d frontend` to appear. Backend is volume-mounted (live).

---

## Prompt — `portfolio_manager.yaml`

System prompt establishes:
- Role: active manager that **proposes, never executes** — every action becomes a draft the user confirms.
- The four `propose_*` tools and when to use each.
- The Manager Scorecard and decision policy (trim / add / protect) above.
- Hard rules: always size with a risk %, always attach a stop to a BUY, never propose > 5% single-trade account risk without a prominent warning, respect NEPSE conventions (lot size 10, fees, T+1, CGT 5%), never invent prices/signals.
- Output: lead with the recommendation and the "why" (return × win-rate × risk), then call the relevant `propose_*` tool(s) so the user gets confirmable cards; close with what would invalidate the thesis.

`user` initial prompt mirrors the advisor's: "Analyze the user's portfolio and propose the highest-conviction, risk-managed actions; emit confirmable proposals."

---

## Phasing (one spec, three buildable slices)

- **Phase A — Gate + first action:** `PortfolioActionDraft` model + migration step, `confirm_draft` service, draft viewset (`confirm`/`cancel`/list/detail), `ProposalCard.tsx` + registry, the `portfolio-manager` agent + prompt + orchestrator routing, and `propose_trade`. Proves the full draft→confirm loop end-to-end.
- **Phase B — Protection + rebalance:** `propose_exits` (reuses `suggest_exits` logic) and `propose_rebalance` (reuses optimizer + `rebalancing_metrics`).
- **Phase C — Conviction:** `propose_trade_plan` (reuses `TradePlanSerializer` validation) and the full Manager Scorecard helper.

Each phase is independently shippable behind the same gate.

---

## Testing

Following the existing `backend/tests/unit` + `backend/tests/integration` layout:

- **Unit — propose tools:** each `propose_*` builds a `PortfolioActionDraft` with a correct, self-contained `payload` and a sensible `preview`; no mutating writes occur at propose time.
- **Unit — `confirm_draft`:** `TRADE` executes via `process_transaction` and updates holdings/WACC; `EXITS` sets stop/target on owned items only; `REBALANCE` upserts targets + executes legs; `TRADE_PLAN` creates plan + legs (rejects legs not summing to 100, stop ≥ target).
- **Unit — gate invariants:** confirm is idempotent; expired draft → 409; foreign-user draft → 403/404; cancelled draft cannot be confirmed; insufficient balance → 400 with message.
- **Unit — scorecard:** ranking favors high-win-rate, high-return, low-risk candidates; over-concentrated / SELL-signal holdings rank as trims.
- **Integration — full loop:** propose (tool emits card with draft_id) → `GET /drafts/{id}/` → `POST confirm` → verify real `PortfolioTransaction` / `PortfolioItem` / `TradePlan` rows and the returned result summary.

---

## Risks & Open Questions

- **Migration is gitignored** — must `makemigrations` per environment; called out in the plan.
- **No inline edit in v1** — "Edit" = Cancel + re-ask the manager. Acceptable for first cut; an inline editor is a later enhancement.
- **Realized-P/L approximation** — `get_realized_pnl` notes WACC-at-sale isn't tracked per lot; the manager should not over-claim realized figures (prompt guards this).
- **Drift accepted** — confirm executes at drafted price by design; if a draft sits overnight, expiry (`expires_at`) forces a re-draft rather than executing a stale price.
