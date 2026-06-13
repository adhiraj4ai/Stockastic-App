# broker-intelligence Chat Subagent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the sixth chat subagent, broker-intelligence, exposing the full Broker Research suite as 11 read-only MCP tools, per the spec at `docs/superpowers/specs/2026-06-11-broker-intelligence-subagent-design.md`.

**Architecture:** Extract the inline view analytics into `backend/stocks/services/broker_research.py` (behavior-identical, caches move with them; views become thin wrappers), wrap them as chat tools in `backend/chat/tools.py`, define the agent in `chat/subagents.py` + `chat/prompts/broker_intelligence.yaml`, add orchestrator routing, and add one generic `broker_table` card to the chat frontend.

**Tech Stack:** Django + DRF + raw SQL + Redis cache (backend), claude_agent_sdk `@tool`/`AgentDefinition`, pytest (run via `docker exec stockastic-backend pytest`), Next.js chat frontend (vitest).

**Read the spec first** — it defines the invariants. Key ones: extraction must not change SQL/ordering/limits/thresholds/response shapes; tools are read-only; market-wide price study is NEVER exposed; prose to the model is a compact summary, full tables go in cards.

---

## File Structure

- Create: `backend/stocks/services/broker_research.py` — all 11 service functions
- Create: `backend/tests/unit/test_broker_research_services.py` — equivalence + unit tests
- Create: `backend/tests/unit/test_broker_intelligence_tools.py` — chat tool tests
- Create: `backend/chat/prompts/broker_intelligence.yaml` — agent prompt
- Modify: `backend/stocks/views/accumulation_mixin.py` (actions at :61, :333, :439, :553), `backend/stocks/views/floorsheet.py` (:110, :274, :410), `backend/stocks/views/broker.py` (:296, :517, :592), `backend/stocks/views/price_forecast.py` (forecast logic ~:406)
- Modify: `backend/chat/tools.py` (11 new tools + ALL_TOOLS), `backend/chat/subagents.py` (new AgentDefinition + AGENTS), `backend/chat/prompts/orchestrator.yaml` (team + routing)
- Modify: frontend `GenUIRegistry.tsx` + Create `frontend/src/components/chat/gen-ui/BrokerTableCard.tsx` + test

All backend commands run as `docker exec stockastic-backend pytest <path>` from the repo root. Frontend commands run in `frontend/`.

---

### Task 1: Service extraction — AccumulationMixin features

**Files:**
- Create: `backend/stocks/services/broker_research.py`
- Modify: `backend/stocks/views/accumulation_mixin.py` (`accumulation` :61, `broker_trends` :333, `below_cost` :439, `broker_favorites` :553)
- Test: `backend/tests/unit/test_broker_research_services.py`

- [ ] **Step 1: Write the failing equivalence tests**

Create `backend/tests/unit/test_broker_research_services.py`. These tests call the EXISTING HTTP endpoint and the NEW service function with identical parameters and assert byte-equal payloads — proving the extraction is behavior-identical. Reuse the auth/data fixtures used by `backend/tests/test_companies_api.py` (read that file and import/copy its fixture usage — `auth_client`/`create_user` live in `backend/tests/conftest.py`).

```python
"""Equivalence tests: broker_research service functions == the view endpoints they were extracted from."""
import pytest

from stocks.services import broker_research

pytestmark = pytest.mark.django_db


class TestAccumulationMixinExtraction:
    def test_accumulation_flows_matches_endpoint(self, auth_client):
        resp = auth_client.get("/api/companies/accumulation/?range=1D&sector=All")
        assert resp.status_code == 200
        direct = broker_research.accumulation_flows(range_key="1D", sector="All", symbol=None)
        assert resp.json() == direct

    def test_broker_trends_matches_endpoint(self, auth_client):
        resp = auth_client.get("/api/companies/broker_trends/?range=ALL")
        assert resp.status_code == 200
        direct = broker_research.broker_trends(symbol=None, range_key="ALL")
        assert resp.json() == direct

    def test_below_cost_matches_endpoint(self, auth_client):
        resp = auth_client.get("/api/companies/below_cost/?range=ALL&sector=All")
        assert resp.status_code == 200
        direct = broker_research.below_cost(range_key="ALL", sector="All")
        assert resp.json() == direct

    def test_broker_favorites_matches_endpoint(self, auth_client):
        resp = auth_client.get("/api/companies/broker_favorites/?broker=1&range=3M")
        assert resp.status_code == 200
        direct = broker_research.broker_favorites(broker_id=1, range_key="3M")
        assert resp.json() == direct
```

Note on payload comparison: the service functions must return exactly the python structure the view serializes (so `resp.json() == direct` holds; coerce Decimals/dates the same way the view did — if the view relied on DRF's encoder, return the same primitives the SQL produced and compare against `resp.json()` after a `json.loads(json.dumps(direct, default=str))` round-trip ONLY if needed; prefer matching types exactly).

- [ ] **Step 2: Run to verify failure**

Run: `docker exec stockastic-backend pytest tests/unit/test_broker_research_services.py -x -q`
Expected: FAIL — `ModuleNotFoundError`/`ImportError`: `stocks.services.broker_research` does not exist.

- [ ] **Step 3: Create the service module and move the four view bodies**

Create `backend/stocks/services/broker_research.py`. For each of the four `AccumulationMixin` actions, MOVE the method body (everything after request-param parsing, including the raw SQL, the `RANGE_MAP` lookup, and the Redis cache get/set — e.g. the 5-min cache at `accumulation_mixin.py:74-77`) into a module-level function. The SQL strings, ordering, LIMITs, thresholds, and cache keys/TTLs must be character-identical — this is a MOVE, not a rewrite. Module skeleton:

```python
"""Broker Research analytics service layer.

Extracted behavior-identical from AccumulationMixin / FloorsheetViewSet /
broker.py views so the chat tools and the REST API share one implementation
(and one cache). Functions return the exact structures the views serialize.
"""
from __future__ import annotations

# move the imports the view bodies need (connection, caches, RANGE_MAP, RSI_CTE, models...)


def accumulation_flows(range_key: str = "1D", sector: str = "All", symbol: str | None = None) -> list | dict:
    """Smart-money net flow per symbol with RSI/ROC. Moved from AccumulationMixin.accumulation."""
    ...  # moved body


def broker_trends(symbol: str | None = None, range_key: str = "ALL") -> list | dict:
    """Per-(symbol, broker) cumulative net, WAC, and 5/10/20/50d trends. Moved from AccumulationMixin.broker_trends."""
    ...  # moved body


def below_cost(range_key: str = "ALL", sector: str = "All") -> list | dict:
    """Broker positions where LTP < WAC. Moved from AccumulationMixin.below_cost."""
    ...  # moved body


def broker_favorites(broker_id: int, range_key: str = "3M") -> list | dict:
    """A broker's accumulated names with WAC/RSI/ROC. Moved from AccumulationMixin.broker_favorites."""
    ...  # moved body
```

(The `...` bodies above are the EXISTING view code moved verbatim — read each view method at the line numbers in **Files** and relocate it. If `RANGE_MAP`/`RSI_CTE` are shared by both the remaining view code and the service, move them to `broker_research.py` and import them back into the view module.)

Then rewrite each of the four view actions as a thin wrapper, e.g.:

```python
@action(detail=False, methods=["get"])
def accumulation(self, request):
    return Response(broker_research.accumulation_flows(
        range_key=request.query_params.get("range", "1D"),
        sector=request.query_params.get("sector", "All"),
        symbol=request.query_params.get("symbol") or None,
    ))
```

Match each wrapper's param names/defaults to what the original method parsed (read the original parsing code before deleting it — defaults shown here must be corrected to the actual originals if they differ, and note any corrections in your report).

- [ ] **Step 4: Run tests**

Run: `docker exec stockastic-backend pytest tests/unit/test_broker_research_services.py tests/test_companies_api.py -q`
Expected: new equivalence tests PASS; all pre-existing `test_companies_api.py` tests still PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/services/broker_research.py backend/stocks/views/accumulation_mixin.py backend/tests/unit/test_broker_research_services.py
git commit -m "refactor(broker): extract AccumulationMixin analytics into broker_research service"
```

### Task 2: Service extraction — Floorsheet features

**Files:**
- Modify: `backend/stocks/services/broker_research.py`, `backend/stocks/views/floorsheet.py` (`broker_transfer` :110, `smart_money` :274, `broker_focus_ranking` :410)
- Test: `backend/tests/unit/test_broker_research_services.py`

- [ ] **Step 1: Add failing equivalence tests** (same file, new class):

```python
class TestFloorsheetExtraction:
    def test_smart_money_matches_endpoint(self, auth_client):
        resp = auth_client.get("/api/floorsheet/smart_money/?range=1D")
        assert resp.status_code == 200
        assert resp.json() == broker_research.smart_money(range_key="1D")

    def test_focus_ranking_matches_endpoint(self, auth_client):
        resp = auth_client.get("/api/floorsheet/broker_focus_ranking/?range=1W")
        assert resp.status_code == 200
        assert resp.json() == broker_research.focus_ranking(range_key="1W")

    def test_share_transfers_matches_endpoint(self, auth_client):
        resp = auth_client.get("/api/floorsheet/broker_transfer/?symbol=NABIL&broker1=1&broker2=2&range=1M")
        assert resp.status_code == 200
        assert resp.json() == broker_research.share_transfers(symbol="NABIL", broker1=1, broker2=2, range_key="1M")
```

Check `backend/tests/test_floorsheet_api.py` and `backend/tests/test_broker_transfer_api.py` for the fixtures those endpoints need (floorsheet rows, brokers) and reuse them so the comparisons run against non-empty data where the existing suites do.

- [ ] **Step 2: Run to verify failure** — `docker exec stockastic-backend pytest tests/unit/test_broker_research_services.py::TestFloorsheetExtraction -x -q` → FAIL (`AttributeError: smart_money`).

- [ ] **Step 3: Move the three view bodies** into `broker_research.py` as:

```python
def smart_money(range_key: str = "1D") -> dict:
    """Top-10 whale brokers: leaderboard, per-symbol signals, KPIs. Moved from FloorsheetViewSet.smart_money."""

def focus_ranking(range_key: str = "1W") -> dict:
    """Daily top-broker focus rankings (bump-chart series). Moved from FloorsheetViewSet.broker_focus_ranking."""

def share_transfers(symbol: str, broker1: int, broker2: int, range_key: str = "1M", start_date=None, end_date=None) -> dict:
    """Broker-to-broker transfer summary + daily stats. Moved from FloorsheetViewSet.broker_transfer."""
```

Bodies moved verbatim (ORM aggregations, range maps, validation thresholds); views become thin wrappers exactly as in Task 1 Step 3 — preserve each original's query-param parsing (including `start_date`/`end_date` support in broker_transfer) in the wrapper.

- [ ] **Step 4: Run** — `docker exec stockastic-backend pytest tests/unit/test_broker_research_services.py tests/test_floorsheet_api.py tests/test_broker_transfer_api.py -q` → all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/services/broker_research.py backend/stocks/views/floorsheet.py backend/tests/unit/test_broker_research_services.py
git commit -m "refactor(broker): extract floorsheet smart-money/focus/transfer into broker_research service"
```

### Task 3: Service extraction — broker.py features + forecast

**Files:**
- Modify: `backend/stocks/services/broker_research.py`, `backend/stocks/views/broker.py` (`signals` :296, `get_broker_portfolio` :517, `accumulation_history` :592), `backend/stocks/views/price_forecast.py`
- Test: `backend/tests/unit/test_broker_research_services.py`

- [ ] **Step 1: Add failing equivalence tests:**

```python
class TestBrokerViewExtraction:
    def test_navigator_signals_matches_endpoint(self, auth_client):
        resp = auth_client.get("/api/broker-analysis/signals/")
        assert resp.status_code == 200
        assert resp.json() == broker_research.navigator_signals()

    def test_broker_portfolio_matches_endpoint(self, auth_client):
        resp = auth_client.get("/api/broker_portfolio/?broker_id=1")
        assert resp.status_code == 200
        assert resp.json() == broker_research.broker_portfolio(broker_id=1)

    def test_accumulation_history_matches_endpoint(self, auth_client):
        resp = auth_client.get("/api/accumulation_history/?broker=1&symbol=NABIL&page=1&page_size=50")
        assert resp.status_code == 200
        assert resp.json() == broker_research.accumulation_history(broker_id=1, symbol="NABIL", page=1, page_size=50)


class TestForecastService:
    def test_forecast_returns_projection_for_symbol(self, auth_client):
        # Shape test (not equivalence — view uses @cache_page); requires the
        # price/accumulation fixtures used by the existing forecast/price tests.
        result = broker_research.accumulation_forecast(symbol="NABIL", min_intensity=3.0)
        assert result is None or {"symbol", "current", "study", "projection"} <= set(result.keys())

    def test_forecast_is_cached(self):
        from django.core.cache import cache
        cache.delete("broker_research:forecast:NABIL:3.0")
        broker_research.accumulation_forecast(symbol="NABIL", min_intensity=3.0)
        assert cache.get("broker_research:forecast:NABIL:3.0") is not None
```

- [ ] **Step 2: Run to verify failure** — `docker exec stockastic-backend pytest tests/unit/test_broker_research_services.py::TestBrokerViewExtraction -x -q` → FAIL.

- [ ] **Step 3: Move the three broker.py bodies** (`navigator_signals()`, `broker_portfolio(broker_id)`, `accumulation_history(broker_id, symbol, page=1, page_size=250)`) verbatim, thin-wrap the views, exactly as before. Then add the forecast service in `broker_research.py`:

```python
FORECAST_CACHE_TTL = 4 * 60 * 60  # mirrors the view's @cache_page TTL


def accumulation_forecast(symbol: str, min_intensity: float = 3.0) -> dict | None:
    """Per-symbol accumulation price-study projection. Cached 4h. NEVER market-wide."""
    from django.core.cache import cache

    key = f"broker_research:forecast:{symbol.upper()}:{min_intensity}"
    cached = cache.get(key)
    if cached is not None:
        return cached
    result = _compute_forecast(symbol.upper(), min_intensity)
    if result is not None:
        cache.set(key, result, FORECAST_CACHE_TTL)
    return result
```

`_compute_forecast` = the body of `AccumulationForecastView.get` (price_forecast.py ~:406) minus HTTP handling, calling the existing helpers (`_load_price_df`, `_load_acc_df`, `_build_daily_acc`, `_compute_features`, `_identify_events`, `_compute_forward_returns`, `_compute_study_stats`, `_build_projection`) — import them from `stocks.views.price_forecast` (do NOT move those helpers; they're shared with the market-wide view that stays put). Rewire `AccumulationForecastView.get` to call `broker_research.accumulation_forecast` (it keeps its `@cache_page`). Return `None` when the symbol has no events/data (mirroring whatever empty-case the view returned — preserve its exact empty response in the view wrapper).

- [ ] **Step 4: Run** — `docker exec stockastic-backend pytest tests/unit/test_broker_research_services.py tests/test_recommendations_api.py -q` → PASS (recommendations suite guards the untouched neighbors in broker.py).

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/services/broker_research.py backend/stocks/views/broker.py backend/stocks/views/price_forecast.py backend/tests/unit/test_broker_research_services.py
git commit -m "refactor(broker): extract navigator/portfolio/history + cached per-symbol forecast service"
```

### Task 4: The 11 chat tools

**Files:**
- Modify: `backend/chat/tools.py`
- Test: `backend/tests/unit/test_broker_intelligence_tools.py`

- [ ] **Step 1: Write failing tool tests.** Follow the established pattern from `backend/tests/unit/test_propose_tools.py` (read it first): `@pytest.mark.django_db(transaction=True)` because tools do DB work inside `sync_to_async`; invoke via `asyncio.run(tool.handler(args))` (SDK `@tool` object is `SdkMcpTool` with `.handler`). Create `backend/tests/unit/test_broker_intelligence_tools.py`:

```python
"""Tests for the broker-intelligence chat tools."""
import asyncio

import pytest

from chat import tools as chat_tools

pytestmark = pytest.mark.django_db(transaction=True)


def _call(tool, args):
    return asyncio.run(tool.handler(args))


def _text(result):
    return result["content"][0]["text"]


NEW_TOOLS = [
    "get_accumulation_flows", "get_smart_money_flows", "get_broker_trends",
    "get_broker_focus_ranking", "get_broker_favorites", "get_navigator_signals",
    "get_below_cost_positions", "get_accumulation_history", "get_share_transfers",
    "get_broker_portfolio", "get_accumulation_forecast",
]


def test_all_new_tools_registered():
    names = {t.name for t in chat_tools.ALL_TOOLS}
    assert set(NEW_TOOLS) <= names


def test_accumulation_flows_happy_path():
    res = _call(chat_tools.get_accumulation_flows, {"range": "1D"})
    assert "content" in res
    # With empty fixtures this may be is_error("No ...data"); both shapes are valid results
    assert isinstance(_text(res), str) and _text(res)


def test_broker_favorites_requires_broker_id():
    res = _call(chat_tools.get_broker_favorites, {"range": "3M"})
    assert res.get("is_error") is True
    assert "broker" in _text(res).lower()


def test_share_transfers_requires_all_args():
    res = _call(chat_tools.get_share_transfers, {"symbol": "NABIL"})
    assert res.get("is_error") is True


def test_accumulation_history_requires_broker_and_symbol():
    res = _call(chat_tools.get_accumulation_history, {"symbol": "NABIL"})
    assert res.get("is_error") is True


def test_forecast_requires_symbol():
    res = _call(chat_tools.get_accumulation_forecast, {})
    assert res.get("is_error") is True


def test_navigator_signals_runs_without_args():
    res = _call(chat_tools.get_navigator_signals, {})
    assert "content" in res
```

- [ ] **Step 2: Run to verify failure** — `docker exec stockastic-backend pytest tests/unit/test_broker_intelligence_tools.py -x -q` → FAIL (`AttributeError: get_accumulation_flows`).

- [ ] **Step 3: Implement the 11 tools** in `backend/chat/tools.py`, in a new `# Broker Intelligence` section before the `ALL_TOOLS` registry. Two complete reference implementations — every other tool follows the SAME structure with the parameters from the table below:

```python
# ─────────────────────────────────────────────────────────────────────────────
# Broker Intelligence
# ─────────────────────────────────────────────────────────────────────────────


def _broker_table_card(title: str, columns: list[dict], rows: list[dict], meta: dict | None = None) -> dict:
    """Generic table card payload rendered by BrokerTableCard on the frontend."""
    return {"type": "broker_table", "data": {"title": title, "columns": columns, "rows": rows, "meta": meta or {}}}


@tool(
    "get_broker_favorites",
    "A broker's accumulated stocks over a period: current net position, WAC, buy/sell qty, LTP, RSI/ROC. Requires broker_id.",
    {"broker_id": int, "range": str},
)
async def get_broker_favorites(args: dict) -> dict:
    broker_id = args.get("broker_id")
    range_key = (args.get("range") or "3M").upper()
    if not broker_id:
        return _result("broker_id is required (integer broker number).", is_error=True, _tool_name="get_broker_favorites")

    @sync_to_async
    def _run():
        rows = broker_research.broker_favorites(broker_id=int(broker_id), range_key=range_key)
        if not rows:
            return _result(f"No accumulation activity found for broker {broker_id} in range {range_key}.",
                           is_error=True, _tool_name="get_broker_favorites")
        top = rows[:15]
        lines = [f"Broker {broker_id} favorites ({range_key}), top {len(top)} of {len(rows)} by net amount:"]
        for r in top:
            lines.append(
                f"- {r['symbol']}: net {r['current_net']:,} sh @ WAC {r['wac']:.2f}, LTP {r['ltp']}, ROC {r['roc']}"
            )
        return _result(
            "\n".join(lines),
            card=_broker_table_card(
                f"Broker {broker_id} Favorites ({range_key})",
                [{"key": "symbol", "label": "Symbol"}, {"key": "current_net", "label": "Net Qty", "align": "right", "format": "number"},
                 {"key": "wac", "label": "WAC", "align": "right", "format": "decimal"}, {"key": "ltp", "label": "LTP", "align": "right", "format": "decimal"},
                 {"key": "buy_qty", "label": "Bought", "align": "right", "format": "number"}, {"key": "sell_qty", "label": "Sold", "align": "right", "format": "number"},
                 {"key": "roc", "label": "ROC %", "align": "right", "format": "percent"}, {"key": "rsi", "label": "RSI", "align": "right", "format": "decimal"}],
                rows,
            ),
            _tool_name="get_broker_favorites",
        )

    return await _run()


@tool(
    "get_accumulation_forecast",
    "Accumulation-intensity price projection for ONE symbol: current intensity, historical win rates by horizon, "
    "and p10-p90 price bands for 5/10/20/30 days. Cold call may take ~10s (cached 4h after).",
    {"symbol": str, "min_intensity": float},
)
async def get_accumulation_forecast(args: dict) -> dict:
    symbol = (args.get("symbol") or "").upper().strip()
    min_intensity = float(args.get("min_intensity") or 3.0)
    if not symbol:
        return _result("symbol is required.", is_error=True, _tool_name="get_accumulation_forecast")

    @sync_to_async
    def _run():
        data = broker_research.accumulation_forecast(symbol=symbol, min_intensity=min_intensity)
        if not data:
            return _result(f"No accumulation events found for {symbol} at intensity >= {min_intensity}.",
                           is_error=True, _tool_name="get_accumulation_forecast")
        cur = data.get("current", {})
        proj = (data.get("projection") or {}).get("bands", {})
        lines = [
            f"{symbol} accumulation forecast — LTP {cur.get('ltp')}, current intensity {cur.get('intensity')}, "
            f"volume spike {cur.get('volume_spike')}.",
        ]
        for horizon, band in proj.items():
            lines.append(f"- {horizon}: p10 {band.get('p10')} / p50 {band.get('p50')} / p90 {band.get('p90')}")
        wr = (data.get("study") or {}).get("win_rates")
        if wr:
            lines.append(f"Historical win rates: {wr}")
        return _result("\n".join(lines), _tool_name="get_accumulation_forecast")  # prose-only per spec

    return await _run()
```

Add `from stocks.services import broker_research` next to the other `stocks` imports in `tools.py`. The remaining nine tools use the identical skeleton (validate → `sync_to_async` → service call → empty-data is_error → compact prose (top 10-15 rows / key aggregates) → `_broker_table_card` unless prose-only). Exact parameters:

| Tool name | Description string (verbatim) | Args schema | Service call | Required args | Card |
|---|---|---|---|---|---|
| `get_accumulation_flows` | "Market-wide smart-money accumulation: per-symbol buy/sell/net broker flow with RSI/ROC and top buyers/sellers. Optional sector or symbol filter." | `{"range": str, "sector": str, "symbol": str}` | `accumulation_flows(range_key, sector or "All", symbol or None)` | none (range default "1D") | table: symbol, net_qty, buy_qty, sell_qty, accumulation_ratio, close, rsi, roc |
| `get_smart_money_flows` | "Top-10 whale brokers for a period: leaderboard, their per-symbol net buys, and aggregate whale volume KPIs." | `{"range": str}` | `smart_money(range_key)` | none (default "1D") | table from `symbol_flows`: symbol, smart_buy_qty, net_qty; prose includes leaderboard |
| `get_broker_trends` | "Per-broker cumulative net position, weighted avg cost, and 5/10/20/50-day accumulation trends. Optionally for one symbol; otherwise top global positions." | `{"symbol": str, "range": str}` | `broker_trends(symbol or None, range_key)` | none (range default "ALL") | table: symbol, broker, cumulative_net, wac, ltp, trend_5d, trend_20d, change_20d |
| `get_broker_focus_ranking` | "Which symbols the top brokers focused their buying on each day (rank series over the period)." | `{"range": str}` | `focus_ranking(range_key)` | none (default "1W") | table from `series`: symbol, ltp, appearances, avg_rank |
| `get_navigator_signals` | "Institutional clustering signals: Platinum/Gold/Silver buys and bullish divergences where multiple smart-money brokers accumulate together, with rationale and strength." | `{}` | `navigator_signals()` | none | table: symbol, signal_type, cluster_count, inst_net_5d, top_broker_wac, ltp, strength |
| `get_below_cost_positions` | "Broker positions currently priced below the broker's weighted average cost (underwater accumulations), most underwater first. Optional sector filter." | `{"range": str, "sector": str, "limit": int}` | `below_cost(range_key, sector or "All")` then slice `[:limit or 50]` | none (range default "ALL") | table: symbol, broker, cumulative_net, wac, ltp, roc, rsi, trend_20d |
| `get_accumulation_history` | "Daily buy/sell/net delta history for one broker in one symbol (rates, amounts, cumulative position, WAC)." | `{"broker_id": int, "symbol": str, "limit": int}` | `accumulation_history(broker_id, symbol, page=1, page_size=limit or 60)` | broker_id AND symbol | table: date, buy_qty, buy_rate, sell_qty, sell_rate, net_quantity, cumulative_qty, wac |
| `get_share_transfers` | "Share transfer analysis between two specific brokers in one symbol: volumes each direction, net accumulation, and daily stats." | `{"symbol": str, "broker1": int, "broker2": int, "range": str}` | `share_transfers(symbol, broker1, broker2, range_key)` | symbol AND broker1 AND broker2 | prose-only (summary both directions + last 5 daily stats) |
| `get_broker_portfolio` | "A broker's full current holdings book: quantity, value, WAC, and 5d/10d/1m/3m position trends per symbol." | `{"broker_id": int}` | `broker_portfolio(broker_id)` | broker_id | table: symbol, sector, quantity, value, wac, current_price, trend_5d, trend_1m |

Register ALL 11 in `ALL_TOOLS` under a `# Broker Intelligence` comment (same style as existing groups).

- [ ] **Step 4: Run** — `docker exec stockastic-backend pytest tests/unit/test_broker_intelligence_tools.py -q` → all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/chat/tools.py backend/tests/unit/test_broker_intelligence_tools.py
git commit -m "feat(chat): 11 broker-intelligence tools over the broker_research service"
```

### Task 5: Agent definition, prompt, orchestrator routing

**Files:**
- Create: `backend/chat/prompts/broker_intelligence.yaml`
- Modify: `backend/chat/subagents.py`, `backend/chat/prompts/orchestrator.yaml`
- Test: `backend/tests/unit/test_broker_intelligence_tools.py` (registration tests appended)

- [ ] **Step 1: Append failing registration tests:**

```python
def test_agent_registered_with_resolvable_tools():
    from chat.subagents import AGENTS
    agent = AGENTS.get("broker-intelligence")
    assert agent is not None
    assert agent.model == "sonnet"
    names = {f"mcp__stockastic__{t.name}" for t in chat_tools.ALL_TOOLS}
    assert set(agent.tools) <= names
    for tool_name in NEW_TOOLS:
        assert f"mcp__stockastic__{tool_name}" in agent.tools
    # shared tools per spec
    for shared in ("get_accumulation", "get_floorsheet_whales", "get_broker_trades_for_stock", "search_stocks"):
        assert f"mcp__stockastic__{shared}" in agent.tools


def test_orchestrator_prompt_mentions_agent():
    from pathlib import Path
    text = (Path("chat/prompts/orchestrator.yaml")).read_text(encoding="utf-8")
    assert "broker-intelligence" in text
```

Run: `docker exec stockastic-backend pytest tests/unit/test_broker_intelligence_tools.py::test_agent_registered_with_resolvable_tools -x -q` → FAIL.

- [ ] **Step 2: Create `backend/chat/prompts/broker_intelligence.yaml`** with exactly:

```yaml
system: |
  You are the Stockastic Broker Intelligence specialist — an expert in NEPSE
  broker floorsheet flows who tracks who is accumulating, who is distributing,
  and what the smart money is positioning for. You never guess; every claim is
  grounded in tool data.

  ## Your Tools

  - `get_accumulation_flows` — market-wide per-symbol smart-money net flow (+RSI/ROC)
  - `get_smart_money_flows` — top-10 whale brokers, their per-symbol net buys
  - `get_broker_trends` — per-broker cumulative net / WAC / 5-50d trends (per symbol or global)
  - `get_broker_focus_ranking` — which symbols top brokers focused on, day by day
  - `get_navigator_signals` — institutional clustering signals (Platinum/Gold/Silver/Divergence)
  - `get_below_cost_positions` — broker positions underwater vs their own WAC
  - `get_broker_favorites` — one broker's accumulated names over a period
  - `get_broker_portfolio` — one broker's full holdings book with trends
  - `get_accumulation_history` — daily buy/sell deltas for one broker in one symbol
  - `get_share_transfers` — transfer analysis between two brokers in one symbol
  - `get_accumulation_forecast` — per-symbol price projection from accumulation
    intensity (cold call may take ~10s; tell the user you are computing if so)
  - `get_accumulation` — quick top buyers/sellers for a ticker
  - `get_floorsheet_whales` — top broker buyers by turnover for a date
  - `get_broker_trades_for_stock` — raw buyer/seller breakdown for a ticker
  - `search_stocks` — resolve company names to symbols

  ## Analysis Framework

  - Brokers are identified by integer IDs (e.g. broker 58). Always show the ID;
    include the broker name only if a tool returns one.
  - Accumulation below or near a broker's WAC = conviction positioning; LTP far
    above WAC = the broker is sitting on profit and may distribute.
  - Multiple top brokers clustering in one symbol (navigator signals) is the
    strongest institutional footprint — lead with it when present.
  - Cross-check: rising net accumulation + flat price = quiet accumulation
    (bullish); rising price + falling net = distribution into strength.
  - For "who is accumulating X": get_broker_trends(symbol=X) and
    get_accumulation(X) in parallel, then deepen with get_accumulation_history
    for the leading broker.
  - Run independent tools in parallel for speed.

  ## Output Format

  - Lead with the single most important flow insight in one sentence.
  - Compact tables in prose (top 5-10 rows); the full data is in cards.
  - NPR notation: Rs 1,250.50; quantities with thousands separators; two-decimal
    percentages.
  - Be explicit about period windows ("over the last month", "today").
```

- [ ] **Step 3: Define the agent in `backend/chat/subagents.py`** (after `PORTFOLIO_MANAGER`, before `AGENTS`); also update the module docstring count ("four" → "six" if it still says four):

```python
BROKER_INTELLIGENCE = AgentDefinition(
    description=(
        "Broker-flow intelligence specialist. Answers who is accumulating or distributing "
        "a stock, smart-money broker activity, per-broker holdings/favorites/history, "
        "institutional clustering signals (Navigator), positions held below broker cost, "
        "broker-to-broker share transfers, and accumulation-based price projections. "
        "Use for any question about brokers, 'who is buying/accumulating', smart money "
        "positioning, or broker IDs."
    ),
    prompt=_system("broker_intelligence"),
    initialPrompt=_initial("broker_intelligence"),
    tools=[
        tool_id("get_accumulation_flows"),
        tool_id("get_smart_money_flows"),
        tool_id("get_broker_trends"),
        tool_id("get_broker_focus_ranking"),
        tool_id("get_broker_favorites"),
        tool_id("get_navigator_signals"),
        tool_id("get_below_cost_positions"),
        tool_id("get_accumulation_history"),
        tool_id("get_share_transfers"),
        tool_id("get_broker_portfolio"),
        tool_id("get_accumulation_forecast"),
        tool_id("get_accumulation"),
        tool_id("get_floorsheet_whales"),
        tool_id("get_broker_trades_for_stock"),
        tool_id("search_stocks"),
        tool_id("remember_about_user"),
        tool_id("forget_about_user"),
    ],
    model="sonnet",
    effort="medium",
)
```

and add `"broker-intelligence": BROKER_INTELLIGENCE,` to `AGENTS`.

- [ ] **Step 4: Orchestrator routing — `backend/chat/prompts/orchestrator.yaml`.** Add to `## Your Team` (after portfolio-manager):

```yaml
  - **broker-intelligence** — Broker floorsheet flow specialist: who is accumulating
    or distributing, smart-money whale positioning, per-broker holdings/favorites/
    history, institutional clustering signals, below-cost broker positions, broker-
    to-broker transfers, and accumulation-based price projections.
    Use for any question about brokers, "who is buying/accumulating X", smart money,
    or a specific broker ID.
```

Add to the routing rules list (before the compound-question rule):

```yaml
  - Broker flow question ("which broker", "who is accumulating", smart money,
    broker favorites/portfolio/history, below-cost, share transfers) →
    **broker-intelligence**
  - Single ticker + decision where broker positioning matters → add
    **broker-intelligence** to the parallel set (stock-analyst + portfolio-advisor),
    then **buy-sell-strategist** with all outputs
```

- [ ] **Step 5: Run** — `docker exec stockastic-backend pytest tests/unit/test_broker_intelligence_tools.py tests/test_chat_api.py -q` → all PASS (chat API suite guards agent loading).

- [ ] **Step 6: Commit**

```bash
git add backend/chat/subagents.py backend/chat/prompts/broker_intelligence.yaml backend/chat/prompts/orchestrator.yaml backend/tests/unit/test_broker_intelligence_tools.py
git commit -m "feat(chat): broker-intelligence subagent with orchestrator routing"
```

### Task 6: Frontend broker_table card

**Files:**
- Create: `frontend/src/components/chat/gen-ui/BrokerTableCard.tsx`
- Modify: `frontend/src/components/chat/gen-ui/GenUIRegistry.tsx` (read it first; register `broker_table` following the existing card-type → component pattern)
- Test: `frontend/src/__tests__/unit/BrokerTableCard.test.tsx`

- [ ] **Step 1: Write the failing test** (`frontend/` dir, vitest):

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { BrokerTableCard } from '@/components/chat/gen-ui/BrokerTableCard';

const data = {
    title: 'Broker 58 Favorites (3M)',
    columns: [
        { key: 'symbol', label: 'Symbol' },
        { key: 'current_net', label: 'Net Qty', align: 'right', format: 'number' },
        { key: 'wac', label: 'WAC', align: 'right', format: 'decimal' },
        { key: 'roc', label: 'ROC %', align: 'right', format: 'percent' },
    ],
    rows: [
        { symbol: 'NABIL', current_net: 120000, wac: 498.25, roc: -4.3 },
        { symbol: 'SHLB', current_net: 80000, wac: 312, roc: 12.1 },
    ],
    meta: {},
};

describe('BrokerTableCard', () => {
    it('renders title, headers, and formatted rows', () => {
        render(<BrokerTableCard data={data} />);
        expect(screen.getByText('Broker 58 Favorites (3M)')).toBeInTheDocument();
        expect(screen.getByText('Net Qty')).toBeInTheDocument();
        expect(screen.getByText('NABIL')).toBeInTheDocument();
        expect(screen.getByText('1,20,000')).toBeInTheDocument(); // Nepali grouping via formatNepaliNumber
        expect(screen.getByText('-4.30%')).toBeInTheDocument();
    });

    it('renders nothing useful gracefully when rows are empty', () => {
        render(<BrokerTableCard data={{ ...data, rows: [] }} />);
        expect(screen.getByText(/no data/i)).toBeInTheDocument();
    });
});
```

Run: `npm test -- src/__tests__/unit/BrokerTableCard.test.tsx` → FAIL (module not found).

- [ ] **Step 2: Create `frontend/src/components/chat/gen-ui/BrokerTableCard.tsx`:**

```tsx
'use client';

import { formatNepaliNumber } from '@/lib/formatters';

type Column = { key: string; label: string; align?: 'left' | 'right' | 'center'; format?: 'number' | 'decimal' | 'percent' };
type BrokerTableData = { title: string; columns: Column[]; rows: Record<string, unknown>[]; meta?: Record<string, unknown> };

function formatCell(value: unknown, format?: Column['format']): string {
    if (value === null || value === undefined || value === '') return '–';
    if (format === 'number') return formatNepaliNumber(Number(value));
    if (format === 'decimal') return formatNepaliNumber(Number(value).toFixed(2));
    if (format === 'percent') return `${Number(value).toFixed(2)}%`;
    return String(value);
}

export function BrokerTableCard({ data }: { data: BrokerTableData }) {
    const { title, columns, rows } = data;
    return (
        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 bg-gradient-to-r from-indigo-500/15 to-transparent px-4 py-2.5">
                <span className="text-xs font-semibold text-foreground">{title}</span>
                <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">{rows.length} rows</span>
            </div>
            {rows.length === 0 ? (
                <p className="p-4 text-xs text-muted-foreground">No data for this query.</p>
            ) : (
                <div className="max-h-80 overflow-auto">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="bg-muted/40 sticky top-0">
                                {columns.map(c => (
                                    <th key={c.key} className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-${c.align ?? 'left'}`}>
                                        {c.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, i) => (
                                <tr key={i} className="border-t border-border/50 even:bg-muted/20">
                                    {columns.map(c => {
                                        const raw = row[c.key];
                                        const negative = (c.format === 'percent' || c.format === 'number' || c.format === 'decimal') && Number(raw) < 0;
                                        return (
                                            <td key={c.key} className={`px-3 py-1.5 tabular-nums text-${c.align ?? 'left'} ${negative ? 'text-rose-600 dark:text-rose-400' : 'text-foreground'}`}>
                                                {formatCell(raw, c.format)}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
```

(If the test's `1,20,000` expectation mismatches `formatNepaliNumber`'s actual output for 120000, fix the EXPECTATION to the formatter's real output — the formatter is the source of truth.)

- [ ] **Step 3: Register in `GenUIRegistry.tsx`** — read the file, add `broker_table: BrokerTableCard` (or the equivalent case/entry matching how `accumulation`/`whale_watch` cards are registered) with the import.

- [ ] **Step 4: Run** — `npm test -- src/__tests__/unit/BrokerTableCard.test.tsx` → PASS; `npx tsc --noEmit` → no NEW errors (pre-existing chat test mock errors out of scope).

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/gen-ui/BrokerTableCard.tsx src/components/chat/gen-ui/GenUIRegistry.tsx src/__tests__/unit/BrokerTableCard.test.tsx
git commit -m "feat(chat): generic broker_table gen-ui card"
```

### Task 7: Full verification

- [ ] **Step 1: Backend suite** — `docker exec stockastic-backend pytest -q` → everything green except any documented pre-existing failures (report exact counts and any failures with verbatim output).
- [ ] **Step 2: Frontend** — in `frontend/`: `npm test` (only the known pre-existing ChatInterface tool_use failure) and `npm run build` (success).
- [ ] **Step 3: Smoke the agent loads** — `docker exec stockastic-backend python -c "from chat.subagents import AGENTS; a=AGENTS['broker-intelligence']; print(len(a.tools), 'tools OK')"` → prints `17 tools OK`.

**Deploy note (not in plan scope):** backend container restart (no migrations); frontend image rebuild + hard refresh for the card.
