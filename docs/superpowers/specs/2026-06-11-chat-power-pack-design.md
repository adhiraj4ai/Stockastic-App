# Chat Power Pack (Tier 1 + 2) — Design

**Date:** 2026-06-11
**Status:** Approved direction (user: "let's do it" / "Focus on Tier 1 and 2")
**Builds on:** chat MCP tools (52, incl. get_tomorrows_plan/get_ticker_verdict),
plan engine (`DailyTradingPlan`, `user_overlay`, `sizing_map_for_user`, `entry_statuses`),
propose-then-confirm portfolio manager (`PortfolioActionDraft`, `TradePlan`).

## Problem

Chat is knowledgeable but passive and amnesiac: it cannot answer "what should I do
with MY positions tomorrow?", never initiates contact, forgets the user between
sessions, cannot write to the watchlist or set alerts, and is unaccountable for its
own past recommendations.

## Verified architecture facts (scouted)

- Prompt assembly: `chat/agent.py` `_format_prompt(user, message)` renders
  `orchestrator.yaml`'s user template with `{date}/{username}/{message}`;
  `_safe_prompt_value` sanitizes. `run_chat_session` is async; ORM work needs
  `sync_to_async`. `str.format` substitutes values literally (braces in VALUES are
  not re-interpreted), so injected memory text needs hygiene (length cap, control
  chars) but not brace-escaping.
- `ChatSession{id uuid, user, title, sdk_session_id, created_at, updated_at}`;
  `ChatMessage{session, role user|assistant, text, blocks JSON, token counts}`.
  Assistant messages are normally persisted by `streaming.py` with a typed `blocks`
  stream; frontend deep-links via `/chat?session=<id>` (ChatPageClient reads
  `searchParams.get('session')`).
- chat app migrations are tracked (latest 0005).
- `WatchlistItem{user, ticker unique-together, target_price, stop_loss_price,
  alert_enabled, notes}`. Notification type `WATCHLIST_ENTRY = 'Entry Opportunity'`
  already exists; `check_all_user_notifications` (hourly beat) fans out per-user
  checks in `stocks/services/notification_service.py`.
- `PortfolioActionDraft{kind, status PENDING|CONFIRMED|CANCELLED|EXPIRED, payload,
  preview, result}`; `TradePlan{status OPEN|CLOSED|CANCELLED}` + legs
  (PENDING|EXECUTED|SKIPPED, executed legs link a PortfolioTransaction).
- No preference/memory storage exists anywhere in the backend.

## Feature 1 — `get_my_actions` tool (Tier 1)

One MCP tool wrapping the existing read-time services:
`daily_plan.user_overlay(user)` + `position_sizing.sizing_map_for_user(user, picks)`
against the latest `DailyTradingPlan`. Prose sections: positions near SL/TP,
active SELL signals against holdings, watchlist triggers, and sized plan picks
("SHL: ≈200 shares, risks 1% of Live"). Card `{"type": "my_actions", ...}`.
Empty state: "Nothing needs your attention tomorrow." Registered on
portfolio_advisor, portfolio_manager, buy_sell_strategist.

The prose builder is shared with Feature 2's briefing (one helper, two consumers).

## Feature 2 — Proactive morning briefing (Tier 1)

After `generate_daily_plan_task` succeeds (not SKIPPED), for each entitled user
(same `daily_plan` TierPermission set + superusers):

1. Idempotency: skip if a `ChatSession(user=user, title="Morning Briefing — <plan.date>")`
   already exists.
2. Create the session + ONE assistant `ChatMessage` whose text is a deterministic
   briefing rendered from the plan payload + that user's overlay/sizing — **no LLM
   call** (cost-free, instant, per-user personalized). `blocks` must match what the
   frontend renderer expects for plain text (implementer verifies the block shape
   against the chat renderer; fallback contract: a single text block).
3. The existing `DAILY_PLAN_READY` notification's `redirect_url` becomes
   `/chat?session=<session.id>` for that user (deep-link straight into the briefing).

Renderer: new `chat/briefing.py` exposing `render_plan_briefing(plan, overlay=None,
sizing=None) -> str`; `get_tomorrows_plan` refactors its plan-prose onto the same
helper (single source of truth).

Known limitation (accepted v1): the seeded message is not in the SDK conversation
context — when the user replies, the orchestrator starts fresh and recovers context
via `get_tomorrows_plan`/`get_my_actions`. Documented in the orchestrator prompt
("a session titled 'Morning Briefing' begins from the day's plan — call
get_tomorrows_plan/get_my_actions to refresh context").

## Feature 3 — Persistent user memory (Tier 1)

- New model `UserMemory` (chat app): `user FK (related_name chat_memories)`,
  `content CharField(220)`, `created_at`, `updated_at`. Cap 30 facts/user.
- Tools (registered on ALL five subagents):
  - `remember_about_user(fact)` — stores a short durable fact (risk appetite,
    horizon, aversions, constraints). Dedupes exact matches; at the cap, rejects
    with instructions to `forget` first. Hygiene: strip newlines/control chars,
    220-char cap.
  - `forget_about_user(match)` — deletes facts containing the substring; reports
    what was removed.
- Injection (read path is automatic, not a tool): `run_chat_session` fetches the
  user's facts via `sync_to_async` and passes them into `_format_prompt`; the
  orchestrator user template gains a `{memory}` placeholder rendered as
  "Known about this user:\n- fact\n- fact" (or "(nothing recorded)"). Subagents
  inherit it through the orchestrator's Task delegations.
- Tool descriptions instruct the model to save durable preferences when the user
  states them, and never to store secrets/credentials.

## Feature 4 — Watchlist + zone-alert write tools (Tier 2)

- `add_to_watchlist(symbol, target_price?, stop_loss_price?, notes?, alerts?)` —
  upserts the user's `WatchlistItem` (unique user+ticker → update on conflict);
  `alert_enabled=True` by default when any level is given or `alerts` true.
  Direct write (low stakes) with a confirmation sentence stating exactly what was
  set. Validates the symbol exists (Company lookup; warn-but-allow on miss since
  Company is the equity-only manager).
- `remove_from_watchlist(symbol)` — deletes; reports.
- Zone-entry alerts: new `check_zone_entry_alerts(user)` in
  `notification_service.py` — for each watchlist item with `alert_enabled`, if the
  latest plan's `entry_statuses` map says IN_ZONE, `create_notification` with the
  existing `WATCHLIST_ENTRY` type ("<SYM> is in its entry zone (canonical ATR
  zone)"), redirect `/ticker/<SYM>`. Wired into `check_all_user_notifications`
  (hourly beat; `create_notification`'s dedup prevents spam). Chat "alert me when X
  enters its zone" = add_to_watchlist with alerts on — no new alert model.
- Registered on portfolio_advisor, portfolio_manager, buy_sell_strategist.

## Feature 5 — Chat action record (Tier 2)

`get_chat_action_record()` tool: an honest accounting of what chat has proposed
and what came of it:

- `PortfolioActionDraft` counts by kind × status (proposed / confirmed / cancelled /
  expired) over the last 90 days.
- `TradePlan` summary: open/closed/cancelled, legs executed vs skipped; for
  executed legs, the linked `PortfolioTransaction`s (entry price recorded).
- Realized outcomes: where confirmed drafts'/legs' transactions can be linked
  (implementer reads `PortfolioActionDraft.result` and `TradePlanLeg.transaction`
  to determine what is reliably linkable; reports honestly what is NOT measurable
  rather than inventing attribution).
- Registered on buy_sell_strategist + portfolio_manager; the strategist's
  description/prompt tells it to consult the record when conviction-weighting its
  advice (self-calibration analogue of the CONFIRMED/DIVERGENT trust layer).

## Out of scope (explicitly)

LLM-narrated briefings (deterministic text v1), per-user token budgets (Tier 3),
chart cards, Nepali localization, memory beyond flat facts (no embeddings),
new alert types beyond zone-entry.

## Testing

Follow `tests/test_chat_plan_tools.py` conventions (`asyncio.run(tool.handler(args))`,
`django_db(transaction=True)`, user injected via `chat._user_context.set_user`).
- Memory: remember/dedupe/cap/forget; injection renders facts into the formatted
  prompt (unit-test `_format_prompt` with a seeded user).
- My-actions: seeded plan + holdings/watchlist → prose sections; empty state.
- Briefing: renderer unit (plan + overlay → text); task creates session+message
  idempotently, notification redirect updated, SKIPPED path creates nothing.
- Watchlist tools: create/update/delete + alert flag; zone-alert check creates a
  WATCHLIST_ENTRY notification when entry_statuses says IN_ZONE, none otherwise.
- Action record: seeded drafts/plans → counts; honest "not measurable" wording.
