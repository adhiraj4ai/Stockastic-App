# broker-intelligence Chat Subagent — Design Spec

**Date:** 2026-06-11
**Status:** Approved (full tool suite, shared existing tools, generic table card, service-layer extraction)

## Goal

Add a sixth subagent, **broker-intelligence**, to the Stockastic chat system (`backend/chat/`), making the Broker Research analytics suite (accumulation flows, smart money, broker trends, focus ranking, favorites, navigator signals, below-cost, history, share transfers, broker portfolio, price-study forecast) conversationally available. Today chat covers only thin slices of this domain (`get_accumulation`, `get_floorsheet_whales`, `get_broker_trades_for_stock`).

## Context (verified 2026-06-11)

- Chat = Task-only orchestrator (`chat/agent.py`, `chat/prompts/orchestrator.yaml`) + 5 subagents in `chat/subagents.py` (`AGENTS` dict ~line 213). Tools live in `chat/tools.py` (`ALL_TOOLS` ~line 3078, `tool_id()` ~line 3158), pattern: `@tool(name, desc, args)` async handler + `sync_to_async` ORM + `_result(prose, card=...)` side-channeling cards via `push_card` to SSE.
- Broker Research analytics are mostly **inline raw SQL inside view methods**: `stocks/views/accumulation_mixin.py` (accumulation :61, broker_trends :333, below_cost :439, broker_favorites :553, brokers_graph :695), `stocks/views/floorsheet.py` (broker_transfer :110, smart_money :274, broker_focus_ranking :410), `stocks/views/broker.py` (signals/Navigator :296, get_broker_portfolio :517, accumulation_history :592), `stocks/views/price_forecast.py` (AccumulationForecastView :406 + helper functions).
- Latency: mixin SQL queries 1–5s with existing 5-min Redis caches; focus ranking <1s (pre-aggregated tables); per-symbol forecast 5–15s cold with helpers reusable; **market-wide price study (30–120s) is excluded from chat**.

## Components

### 1. Service layer extraction — `backend/stocks/services/broker_research.py` (new)

One function per feature, extracted **behavior-identical** from the views listed above:

| Function | Extracted from | Parameters |
|---|---|---|
| `accumulation_flows(range_key, sector="All", symbol=None)` | `AccumulationMixin.accumulation` | range key per existing `RANGE_MAP` |
| `broker_trends(symbol=None, range_key="ALL")` | `AccumulationMixin.broker_trends` | |
| `below_cost(range_key="ALL", sector="All")` | `AccumulationMixin.below_cost` | |
| `broker_favorites(broker_id, range_key="3M")` | `AccumulationMixin.broker_favorites` | |
| `smart_money(range_key="1D")` | `FloorsheetViewSet.smart_money` | |
| `focus_ranking(range_key="1W")` | `FloorsheetViewSet.broker_focus_ranking` | |
| `share_transfers(symbol, broker1, broker2, range_key="1M")` | `FloorsheetViewSet.broker_transfer` | |
| `navigator_signals()` | `BrokerViewSet.signals` | |
| `broker_portfolio(broker_id)` | `get_broker_portfolio` | |
| `accumulation_history(broker_id, symbol, page=1, page_size=250)` | `accumulation_history` view | |
| `accumulation_forecast(symbol, min_intensity=3.0)` | `AccumulationForecastView` logic (reusing the existing `_load_price_df`/`_compute_features`/`_build_projection` helpers in `price_forecast.py`) | per-symbol ONLY |

Rules:
- The existing Redis caches (e.g. 5-min cache in `accumulation_mixin.py:74-77`) **move into the service functions** (same keys, same TTLs) so web views and chat tools share cache hits.
- The corresponding view methods become thin wrappers calling these functions; their HTTP request parsing, permission classes, and response envelope stay unchanged. `AccumulationForecastView` keeps its `@cache_page`; the service function additionally gets a low-level 4-hour cache keyed `(symbol, min_intensity)` so chat calls are cached independently of the HTTP layer.
- Behavior-identical is a hard requirement: extraction must not change SQL, ordering, limits, thresholds, or response shapes.

### 2. Eleven new chat tools — `chat/tools.py`

All read-only, all registered in `ALL_TOOLS`, all following the established `@tool` + `sync_to_async` + `_result` pattern. Prose returned to the model is a compact summary (top-N rows, key aggregates), never a full table dump.

| Tool | Service call | Args schema | Card |
|---|---|---|---|
| `get_accumulation_flows` | `accumulation_flows` | `{"range": str, "sector": str, "symbol": str}` (sector/symbol optional) | `broker_table` |
| `get_smart_money_flows` | `smart_money` | `{"range": str}` | `broker_table` |
| `get_broker_trends` | `broker_trends` | `{"symbol": str, "range": str}` (both optional) | `broker_table` |
| `get_broker_focus_ranking` | `focus_ranking` | `{"range": str}` | `broker_table` |
| `get_broker_favorites` | `broker_favorites` | `{"broker_id": int, "range": str}` | `broker_table` |
| `get_navigator_signals` | `navigator_signals` | `{}` | `broker_table` |
| `get_below_cost_positions` | `below_cost` | `{"range": str, "sector": str, "limit": int}` | `broker_table` |
| `get_accumulation_history` | `accumulation_history` | `{"broker_id": int, "symbol": str, "limit": int}` | `broker_table` |
| `get_share_transfers` | `share_transfers` | `{"symbol": str, "broker1": int, "broker2": int, "range": str}` | prose-only |
| `get_broker_portfolio` | `broker_portfolio` | `{"broker_id": int}` | `broker_table` |
| `get_accumulation_forecast` | `accumulation_forecast` | `{"symbol": str, "min_intensity": float}` | prose-only |

`get_accumulation_forecast`'s description warns the model a cold call may take ~10 seconds so it sets user expectations. The market-wide study is NOT exposed.

### 3. The subagent — `chat/subagents.py` + `chat/prompts/broker_intelligence.yaml`

```python
BROKER_INTELLIGENCE = AgentDefinition(
    description=(
        "Broker-flow intelligence specialist. Answers who is accumulating or distributing "
        "a stock, smart-money broker activity, per-broker holdings/favorites/history, "
        "institutional clustering signals (Navigator), positions held below broker cost, "
        "broker-to-broker share transfers, and accumulation-based price projections."
    ),
    prompt=_system("broker_intelligence"),
    tools=[ 11 new tools
            + tool_id("get_accumulation")            # shared — stays on stock-analyst too
            + tool_id("get_floorsheet_whales")       # shared — stays on market-analyst too
            + tool_id("get_broker_trades_for_stock") # shared — stays on market-analyst too
            + tool_id("search_stocks")
            + tool_id("remember_about_user") + tool_id("forget_about_user") ],
    model="sonnet",
    effort="medium",
)
AGENTS["broker-intelligence"] = BROKER_INTELLIGENCE
```

The prompt yaml defines the persona (broker-flow specialist for NEPSE), instructs parallel tool use, compact tables in prose, and to surface broker IDs alongside any known broker names.

### 4. Orchestrator routing — `chat/prompts/orchestrator.yaml`

- Add broker-intelligence to `## Your Team` with its description.
- Add routing rules: questions about broker flows / "which broker" / "who is accumulating" / smart money / broker favorites / below-cost / share transfers / broker portfolios → broker-intelligence. For single-ticker buy/sell decisions where broker context matters, run broker-intelligence in parallel with stock-analyst (and portfolio-advisor where relevant) before buy-sell-strategist.
- Existing routing rules are otherwise untouched.

### 5. Frontend card — one new generic component

A single `broker_table` card type: payload `{type: "broker_table", data: {title, columns: [{key, label, align?, format?}], rows: [...], meta?}}`, rendered by one new component registered in `frontend/.../gen-ui/GenUIRegistry.tsx`. Number formatting via the existing formatters lib. No per-tool components. (Frontend is a baked Docker image — rebuild required to see it.)

## Non-Goals

- No mutations of any kind — this agent is strictly read-only (watchlist mutations stay with the portfolio agents).
- No social/news data (explicitly rejected by user).
- No market-wide price study exposure.
- No changes to existing agents' tool lists beyond sharing the three named tools with the new agent (their definitions/owners unchanged).
- No Celery/background jobs; all tools answer synchronously from existing data + caches.

## Error Handling

- Missing/invalid args → `_result(msg, is_error=True)` (consistent with existing tools).
- Unknown broker ID or symbol, or empty result sets → friendly is_error result naming the lookup that failed.
- Service functions propagate DB errors; tool handlers catch exceptions and return is_error results rather than crashing the agent turn (matching existing tool behavior).

## Testing

All run via `docker exec stockastic-backend pytest`:
1. **Extraction equivalence tests** — for each extracted service function, a fixture-driven test asserting the function's output shape and rows match what the pre-refactor view produced for the same inputs (captured as fixtures during implementation).
2. **Tool tests** — `@pytest.mark.django_db(transaction=True)` + `asyncio.run(tool.handler(args))` per the established pattern (SDK `@tool` object is `SdkMcpTool` with `.handler`): happy path, missing-arg error, empty-data error for each tool.
3. **Registration test** — all 11 tools present in `ALL_TOOLS`; `broker-intelligence` in `AGENTS` with resolvable `tool_id`s; orchestrator yaml mentions the agent.
4. Existing view tests (if any) must stay green after the thin-wrapper refactor.

## Deploy notes

Backend: restart backend container (no migrations — no new models). Frontend: image rebuild + hard refresh for the `broker_table` card component.
