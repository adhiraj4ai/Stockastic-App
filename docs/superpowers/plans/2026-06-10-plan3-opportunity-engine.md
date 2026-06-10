# Plan 3: Opportunity Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Turn the validated measurements from Plans 1–2 into the product: a daily, ranked list of the best NEPSE opportunities — ranked by *validated, fee-net expectancy*, cross-checked against the *live `SignalEpisode` track record*, tagged with the current *market regime*, and exposed via an API endpoint + chat tools. Answers one question: "what are today's best trustworthy opportunities, and how sure are we?"

**Architecture:** A pure `expectancy.py` (NumPy) computes avg-win/avg-loss/expectancy from the per-trade returns Plan 1 already captures. A `live_validation.py` service compares each producer's backtest expectation against its realized `SignalEpisode` outcomes (the true out-of-sample loop). A `market_regime.py` derives a NEPSE breadth regime from the basket (no dependency on an index price series). An `opportunity_engine.py` service joins today's per-(strategy×symbol) signals with validated expectancy (Plan 1 fees), FDR significance (Plan 2), live-track-record confirmation, and the regime tag into a ranked list — surfaced by a management command, a DRF endpoint, and two chat tools. No new heavy models; one lightweight `OpportunitySnapshot` (optional cache) only if needed.

**Tech Stack:** Django, DRF, backtesting.py 0.6.5, Claude Agent SDK chat tools, NumPy. Run ALL tests/commands in Docker: `docker-compose exec -T backend pytest <args>` / `... python manage.py <args>` (talib + DB live; `./backend` bind-mounted).

**Branch:** `git checkout strategy-upgrade-phase0 && git checkout -b strategy-upgrade-phase3-opportunity-engine`

**Builds on (already merged in phase0):**
- Plan 1: `run_backtest` net-of-NEPSE-fees + adjusted prices; `research_universe`.
- Plan 2: `normalize_metrics` has `trade_returns`/`wins`/`losses`; `statistics.py` (`wilson_interval`, `bootstrap_pvalue`, `benjamini_hochberg`, `winrate_is_reportable`); scorecard `.confidence` block; `evaluate_over_basket`.
- `SignalEpisode` (fields incl. `producer_key`, `direction`, `status` WON/LOST/ACTIVE/FLIPPED, `pnl_percent`, `entry/target/stop`); `make_producer_key(source, strategy_id)`.
- `StrategyService.infer_current_signal(strategy, symbol) -> {signal, close, date, ...}` (direction today, no levels, no persist).
- Chat: `@tool` decorator → `ALL_TOOLS` → `tool_id(name)` in `subagents.py` `BUY_SELL_STRATEGIST.tools`; restart backend to load.

**Pre-existing failing test (ignore throughout):** `stocks/tests/test_position_sizing.py::test_aggressive_risk`.

---

## Design decisions (read before Task 1)

- **Expectancy is the ranking currency.** Per (strategy×symbol): `avg_win = mean(positive trade returns)`, `avg_loss = mean(|negative trade returns|)`, `expectancy = win_rate·avg_win − loss_rate·avg_loss` (in return-fraction units, already net of NEPSE fees because Plan 1 charged them inside the backtest). Rank by expectancy, not raw return — a 60%-win strategy with tiny edge can rank below a 45%-win strategy with large payoff.
- **Trust = backtest AND live agree.** A backtest expectancy is a *hypothesis*; the realized `SignalEpisode` record is *evidence*. The engine assigns a `trust` tier: `CONFIRMED` (backtest positive AND live track record positive with enough resolved episodes), `UNCONFIRMED` (not enough live episodes yet), `DIVERGENT` (backtest positive but live negative — overfit suspect, demoted). This is the heart of the research engine — no backtest cleverness substitutes for live confirmation.
- **Regime is breadth, not a single index.** Market regime = fraction of the research universe trading above its 200-day SMA (RISK_ON ≥ 0.6, RISK_OFF ≤ 0.4, else NEUTRAL). Robust, uses only `DailyStockPrice`, and is a more honest NEPSE-wide measure than one index print. Opportunities are *tagged* with the current regime and (where data allows) their expectancy *conditioned* on past same-regime days.
- **Don't re-run 41×24 backtests live.** The opportunity ranking reuses persisted scorecard/experiment metrics + the Plan-5/2 ranking JSON where available, and only calls `infer_current_signal` (cheap, single-symbol, to-latest-bar) to find *which* (strategy×symbol) pairs are signalling *today*. Heavy basket scoring stays in the offline `rank_strategies`/scorecard path.
- **Propose, don't trade.** This is a research/insights engine — the opportunity surface and chat tools are read-only recommendations with confidence; they never place orders.

## File structure

| File | Status | Responsibility |
|---|---|---|
| `backend/stocks/services/backtest_harness/expectancy.py` | Create | Pure: `expectancy_stats(trade_returns)` → avg_win/avg_loss/expectancy/payoff |
| `backend/stocks/services/backtest_harness/evaluate.py` | Modify | Add expectancy to `card.confidence` |
| `backend/stocks/services/live_validation.py` | Create | `producer_track_record()` + `trust_tier(backtest_expectancy, live)` |
| `backend/stocks/services/market_regime.py` | Create | `current_regime(as_of=None)` from universe breadth |
| `backend/stocks/services/opportunity_engine.py` | Create | `rank_opportunities(...)` — join signals × expectancy × trust × regime |
| `backend/stocks/management/commands/rank_opportunities.py` | Create | CLI + JSON report |
| `backend/stocks/views/opportunity.py` | Create | `GET /api/stocks/opportunities/` (DRF) |
| `backend/stocks/urls.py` | Modify | Route the endpoint |
| `backend/chat/tools.py` | Modify | `get_top_opportunities`, `explain_opportunity` tools + ALL_TOOLS |
| `backend/chat/subagents.py` | Modify | Add tool_ids to BUY_SELL_STRATEGIST |
| `backend/stocks/tests/test_expectancy.py` | Create | expectancy math |
| `backend/stocks/tests/test_live_validation.py` | Create | track record + trust tier |
| `backend/stocks/tests/test_market_regime.py` | Create | breadth regime |
| `backend/stocks/tests/test_opportunity_engine.py` | Create | ranking join + ordering |

---

### Task 1: Expectancy math + surface in scorecard

**Files:** Create `backtest_harness/expectancy.py`; modify `evaluate.py`; test `test_expectancy.py`.

- [ ] **Step 1: Write failing tests**

```python
# backend/stocks/tests/test_expectancy.py
"""Per-strategy expectancy from per-trade returns."""
import pytest
from stocks.services.backtest_harness.expectancy import expectancy_stats


def test_expectancy_basic():
    # 3 wins avg +0.10, 1 loss -0.20 over 4 trades.
    s = expectancy_stats([0.10, 0.10, 0.10, -0.20])
    assert s["wins"] == 3 and s["losses"] == 1
    assert s["avg_win"] == pytest.approx(0.10)
    assert s["avg_loss"] == pytest.approx(0.20)        # reported positive
    assert s["win_rate"] == pytest.approx(0.75)
    # expectancy = 0.75*0.10 - 0.25*0.20 = 0.075 - 0.05 = 0.025
    assert s["expectancy"] == pytest.approx(0.025)
    assert s["payoff_ratio"] == pytest.approx(0.5)     # avg_win/avg_loss


def test_expectancy_all_wins_has_no_avg_loss():
    s = expectancy_stats([0.05, 0.03, 0.04])
    assert s["losses"] == 0 and s["avg_loss"] == 0.0
    assert s["expectancy"] == pytest.approx(0.04)
    assert s["payoff_ratio"] == 0.0                    # undefined → 0


def test_expectancy_empty():
    s = expectancy_stats([])
    assert s["expectancy"] == 0.0 and s["wins"] == 0 and s["losses"] == 0


def test_breakeven_counts_as_loss():
    # r == 0 is not a win (consistent with Plan-2 wins convention r>0)
    s = expectancy_stats([0.0, 0.10])
    assert s["wins"] == 1 and s["losses"] == 1
```

- [ ] **Step 2: Run → fail.** `docker-compose exec -T backend pytest stocks/tests/test_expectancy.py -v`

- [ ] **Step 3: Implement**

```python
# backend/stocks/services/backtest_harness/expectancy.py
"""Expectancy from a list of per-trade returns (fractions, fee-net via Plan 1).

expectancy = win_rate * avg_win - loss_rate * avg_loss   (per-trade, same units).
Positive expectancy = the strategy makes money per trade on average, after costs.
"""
__all__ = ["expectancy_stats"]


def expectancy_stats(trade_returns):
    rets = [float(r) for r in (trade_returns or [])]
    n = len(rets)
    if n == 0:
        return {"wins": 0, "losses": 0, "win_rate": 0.0, "avg_win": 0.0,
                "avg_loss": 0.0, "expectancy": 0.0, "payoff_ratio": 0.0}
    wins = [r for r in rets if r > 0]
    losses = [r for r in rets if r <= 0]
    avg_win = (sum(wins) / len(wins)) if wins else 0.0
    avg_loss = (abs(sum(losses) / len(losses))) if losses else 0.0
    win_rate = len(wins) / n
    loss_rate = len(losses) / n
    expectancy = win_rate * avg_win - loss_rate * avg_loss
    payoff = (avg_win / avg_loss) if avg_loss > 0 else 0.0
    return {
        "wins": len(wins), "losses": len(losses), "win_rate": win_rate,
        "avg_win": avg_win, "avg_loss": avg_loss,
        "expectancy": expectancy, "payoff_ratio": payoff,
    }
```

- [ ] **Step 4: Run → pass.** `docker-compose exec -T backend pytest stocks/tests/test_expectancy.py -v` (4 PASS)

- [ ] **Step 5: Surface in scorecard.** In `evaluate.py`, import `from .expectancy import expectancy_stats` and, in the confidence block (after Plan-2 keys), add the pooled expectancy over all symbols' `trade_returns`:
```python
    pooled_trade_returns = [x for r in ok for x in r.metrics.get("trade_returns", [])]
    _exp = expectancy_stats(pooled_trade_returns)
    card.confidence["expectancy"] = round(_exp["expectancy"], 5)
    card.confidence["avg_win"] = round(_exp["avg_win"], 5)
    card.confidence["avg_loss"] = round(_exp["avg_loss"], 5)
    card.confidence["payoff_ratio"] = round(_exp["payoff_ratio"], 3)
```
(`pooled_trade_returns` is the only place pooling is fine — expectancy is a descriptive per-trade average, not a significance test.)

- [ ] **Step 6: Regression** `docker-compose exec -T backend pytest stocks/tests/test_confidence_scorecard.py stocks/tests/test_expectancy.py -v` → PASS.

- [ ] **Step 7: Commit** `git add ...; git commit -m "feat(opp): per-trade expectancy stats + scorecard surfacing"`

---

### Task 2: Backtest-vs-live divergence (trust tiers)

**Files:** Create `services/live_validation.py`; test `test_live_validation.py`.

- [ ] **Step 1: Write failing tests** (use the DB; create SignalEpisode rows in the test)

```python
# backend/stocks/tests/test_live_validation.py
"""Live SignalEpisode track record + trust tiering vs backtest expectancy."""
import datetime as dt
import pytest
from stocks.models import SignalEpisode
from stocks.services.live_validation import producer_track_record, trust_tier, MIN_RESOLVED_FOR_TRUST

pytestmark = pytest.mark.django_db


def _ep(producer, symbol, status, pnl):
    return SignalEpisode.objects.create(
        source=producer, producer_key=producer, symbol=symbol, direction="BUY",
        start_date=dt.date(2025, 1, 1), last_signal_date=dt.date(2025, 1, 1),
        entry_price=100, status=status,
        end_date=None if status == "ACTIVE" else dt.date(2025, 2, 1),
        pnl_percent=pnl,
    )


def test_track_record_counts_and_winrate():
    for _ in range(7):
        _ep("ENGINE_A", "NABIL", "WON", 5.0)
    for _ in range(3):
        _ep("ENGINE_A", "NABIL", "LOST", -3.0)
    _ep("ENGINE_A", "NABIL", "ACTIVE", None)
    tr = producer_track_record("ENGINE_A")
    assert tr["won"] == 7 and tr["lost"] == 3 and tr["active"] == 1
    assert tr["resolved"] == 10
    assert tr["live_win_rate"] == pytest.approx(0.70)
    assert tr["avg_pnl_pct"] == pytest.approx((7*5.0 + 3*-3.0) / 10)  # 2.6


def test_trust_confirmed_when_backtest_and_live_agree():
    for _ in range(MIN_RESOLVED_FOR_TRUST):
        _ep("ENGINE_B", "API", "WON", 4.0)
    tr = producer_track_record("ENGINE_B")
    assert trust_tier(backtest_expectancy=0.03, live=tr) == "CONFIRMED"


def test_trust_divergent_when_live_contradicts_backtest():
    for _ in range(MIN_RESOLVED_FOR_TRUST):
        _ep("ENGINE_C", "API", "LOST", -4.0)
    tr = producer_track_record("ENGINE_C")
    assert trust_tier(backtest_expectancy=0.03, live=tr) == "DIVERGENT"


def test_trust_unconfirmed_when_too_few_resolved():
    _ep("ENGINE_D", "API", "WON", 4.0)  # 1 resolved < threshold
    tr = producer_track_record("ENGINE_D")
    assert trust_tier(backtest_expectancy=0.03, live=tr) == "UNCONFIRMED"
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement**

```python
# backend/stocks/services/live_validation.py
"""Compare a producer's backtest hypothesis against its realized SignalEpisode record.

The realized record is genuine out-of-sample evidence (signals were emitted live,
then resolved by hitting target/stop). trust_tier turns "backtest says good" into
CONFIRMED / UNCONFIRMED / DIVERGENT using that evidence.
"""
from django.db.models import Avg, Count, Q

__all__ = ["producer_track_record", "trust_tier", "MIN_RESOLVED_FOR_TRUST"]

# Need at least this many resolved (WON+LOST) live episodes to trust/refute a backtest.
MIN_RESOLVED_FOR_TRUST = 8


def producer_track_record(producer_key):
    """Realized live stats for one producer across all symbols."""
    from stocks.models import SignalEpisode
    qs = SignalEpisode.objects.filter(producer_key=producer_key)
    won = qs.filter(status="WON").count()
    lost = qs.filter(status="LOST").count()
    active = qs.filter(status="ACTIVE").count()
    resolved = won + lost
    avg_pnl = qs.filter(status__in=["WON", "LOST"]).aggregate(a=Avg("pnl_percent"))["a"]
    return {
        "producer_key": producer_key,
        "won": won, "lost": lost, "active": active, "resolved": resolved,
        "live_win_rate": (won / resolved) if resolved else 0.0,
        "avg_pnl_pct": float(avg_pnl) if avg_pnl is not None else 0.0,
    }


def trust_tier(backtest_expectancy, live):
    """CONFIRMED | UNCONFIRMED | DIVERGENT from backtest hypothesis + live evidence.

    - UNCONFIRMED: < MIN_RESOLVED_FOR_TRUST resolved live episodes (not enough evidence).
    - DIVERGENT: backtest says positive edge, but live avg P&L is negative (overfit suspect).
    - CONFIRMED: enough live episodes AND live avg P&L positive AND backtest positive.
    """
    if live["resolved"] < MIN_RESOLVED_FOR_TRUST:
        return "UNCONFIRMED"
    live_positive = live["avg_pnl_pct"] > 0
    bt_positive = (backtest_expectancy or 0) > 0
    if bt_positive and not live_positive:
        return "DIVERGENT"
    if bt_positive and live_positive:
        return "CONFIRMED"
    return "UNCONFIRMED"
```

- [ ] **Step 4: Run → pass** (4 tests). **Step 5: Commit.**

---

### Task 3: Market regime from universe breadth

**Files:** Create `services/market_regime.py`; test `test_market_regime.py`.

- [ ] **Step 1: Write failing tests** (mock the price fetch so no DB dependency on specific data)

```python
# backend/stocks/tests/test_market_regime.py
from unittest import mock
from stocks.services import market_regime


def test_regime_thresholds():
    assert market_regime.classify_breadth(0.75) == "RISK_ON"
    assert market_regime.classify_breadth(0.30) == "RISK_OFF"
    assert market_regime.classify_breadth(0.50) == "NEUTRAL"


def test_current_regime_uses_breadth(monkeypatch):
    monkeypatch.setattr(market_regime, "_universe_breadth", lambda as_of=None: 0.8)
    r = market_regime.current_regime()
    assert r["regime"] == "RISK_ON" and r["breadth"] == 0.8
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement** — `_universe_breadth(as_of)` = fraction of `research_universe()` symbols whose latest close (≤ as_of) is above their 200-day SMA (reuse `load_price_df`; skip symbols with < 200 bars). `classify_breadth(frac)` thresholds (≥0.6 RISK_ON, ≤0.4 RISK_OFF, else NEUTRAL). `current_regime(as_of=None)` returns `{"regime": ..., "breadth": round(frac,3), "as_of": str(as_of or today)}`. Import `research_universe` from `services.universe`.

- [ ] **Step 4: Run → pass. Step 5: smoke-test** `current_regime()` on real data (report the breadth + regime). **Step 6: Commit.**

---

### Task 4: Opportunity ranking service + command

**Files:** Create `services/opportunity_engine.py`, `management/commands/rank_opportunities.py`; test `test_opportunity_engine.py`.

- [ ] **Step 1: Write failing tests** for the pure ranking/scoring core. Factor the scoring into a pure function `score_opportunity(signal_dir, expectancy, pvalue, trust, regime, win_rate_reportable)` that returns a sortable composite, and `rank_opportunities_from_rows(rows, regime)` that sorts a list of pre-built opportunity dicts. Test:
  - a CONFIRMED, significant, positive-expectancy BUY ranks above an UNCONFIRMED one;
  - a DIVERGENT opportunity is demoted below all non-divergent ones regardless of raw expectancy;
  - ordering is deterministic.

```python
# backend/stocks/tests/test_opportunity_engine.py
from stocks.services.opportunity_engine import score_opportunity, rank_opportunities_from_rows


def _opp(name, expectancy, pvalue, trust):
    return {"key": name, "direction": "BUY", "expectancy": expectancy,
            "pvalue": pvalue, "trust": trust, "win_rate_reportable": True}


def test_confirmed_significant_outranks_unconfirmed():
    rows = [_opp("u", 0.05, 0.01, "UNCONFIRMED"), _opp("c", 0.04, 0.01, "CONFIRMED")]
    ranked = rank_opportunities_from_rows(rows, regime="RISK_ON")
    assert ranked[0]["key"] == "c"


def test_divergent_demoted_below_all():
    rows = [_opp("d", 0.20, 0.001, "DIVERGENT"), _opp("u", 0.01, 0.30, "UNCONFIRMED")]
    ranked = rank_opportunities_from_rows(rows, regime="RISK_ON")
    assert ranked[-1]["key"] == "d"


def test_score_rewards_significance_and_expectancy():
    strong = score_opportunity("BUY", 0.05, 0.01, "CONFIRMED", "RISK_ON", True)
    weak = score_opportunity("BUY", 0.01, 0.40, "UNCONFIRMED", "RISK_ON", True)
    assert strong > weak
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement.**
  - `score_opportunity(...)`: base = `expectancy` (fee-net edge). Multiply by a significance factor (`1.0` if `pvalue<=0.05` else `0.5`), a trust factor (`CONFIRMED 1.0`, `UNCONFIRMED 0.7`, `DIVERGENT 0.0`), and a reportability factor (`1.0`/`0.8`). DIVERGENT → score forced ≤ 0 so it sinks. Deterministic.
  - `rank_opportunities_from_rows(rows, regime)`: attach `score` to each, sort by (`trust != DIVERGENT` desc, `score` desc, `key`) so DIVERGENT always last; return list.
  - `rank_opportunities(symbols=None, sources=None, limit=50)` (the DB-backed orchestrator): determine `regime = current_regime()`; for each candidate (USER_STRATEGY strategies via `Strategy.objects` + the engine producers) find symbols signalling **today** — for user strategies call `StrategyService.infer_current_signal(strategy, symbol)` over `research_universe()` (or a passed `symbols` list); for engine producers read the latest ACTIVE `SignalEpisode`s. For each (producer×symbol) that is BUY/SELL today, build an opportunity row: pull the producer's backtest expectancy + p-value from the most recent scorecard/experiment metrics if available (else compute via `evaluate_over_basket` for user strategies — but cache per producer to avoid 41× recompute), the live `trust_tier(...)`, the regime tag, and `infer_current_signal`'s close. Return `rank_opportunities_from_rows(rows, regime["regime"])[:limit]` plus the regime block. **Keep it correct over fast**: it's an offline command; reuse persisted metrics where possible and `log` what was skipped.

- [ ] **Step 4: Run unit tests → pass.**

- [ ] **Step 5: Management command** `rank_opportunities` (`--symbols`, `--limit`, `--out`): calls `rank_opportunities(...)`, prints a table (rank, producer, symbol, dir, expectancy%, p, trust, regime), writes `opportunities.json`. Run it for real in Docker over a small `--symbols NABIL,API,UPPER,NTC,SHIVM` set; report the output and confirm DIVERGENT producers sink and the regime tag prints.

- [ ] **Step 6: Commit.**

---

### Task 5: API endpoint + chat tools

**Files:** Create `views/opportunity.py`; modify `urls.py`, `chat/tools.py`, `chat/subagents.py`.

- [ ] **Step 1: DRF endpoint** `GET /api/stocks/opportunities/?symbols=&limit=` → `{regime: {...}, opportunities: [...]}` via `rank_opportunities(...)`. `permission_classes=[AllowAny]` to match the other public market endpoints (read-only research data). Add the route in `urls.py` next to the other `stocks` function-view routes. Smoke-test with `curl`/Django test client in Docker.

- [ ] **Step 2: Chat tools** in `chat/tools.py`, following the existing `@tool` + `_result(card=...)` pattern:
  - `get_top_opportunities(args)` — args `{limit?: int, symbols?: str}`; calls `rank_opportunities`; returns prose ("Top N opportunities in a RISK_ON market…") + a `card` `{"type": "opportunities", "data": {...}}`. Wrap DB access in `sync_to_async` like sibling tools.
  - `explain_opportunity(args)` — args `{producer: str, symbol: str}`; returns the full breakdown for one opportunity (backtest expectancy + CI + p-value, live track record, trust tier, regime, entry/levels if present) as prose + card.
  Add both to `ALL_TOOLS`. Add `tool_id("get_top_opportunities")` and `tool_id("explain_opportunity")` to `BUY_SELL_STRATEGIST.tools` in `subagents.py`.

- [ ] **Step 3: Verify** the MCP server builds (`docker-compose exec -T backend python -c "import ast; ast.parse(open('chat/tools.py').read()); print('ok')"` and an import smoke test of `ALL_TOOLS` length). Restart backend container; confirm no startup error in logs. (A full chat E2E is out of scope — the existing chat tests cover the harness.)

- [ ] **Step 4: Commit.**

---

### Task 6: Summary report + memory

- [ ] **Step 1:** Write `backend/backtest_reports/phase3_opportunities/SUMMARY.md` from a real `rank_opportunities` run: how many opportunities surfaced today, the regime, how many CONFIRMED vs UNCONFIRMED vs DIVERGENT, and which producers diverge (backtest-good-but-live-bad). Frame against the goal: this is the daily "best validated opportunities" surface; CONFIRMED + significant + positive-expectancy are the ones to act on.
- [ ] **Step 2:** Update `memory/project_strategy_upgrade.md` with a Plan-3 paragraph (expectancy ranking; live-validation trust tiers on `SignalEpisode`; breadth regime; `/api/stocks/opportunities/` + `get_top_opportunities`/`explain_opportunity` chat tools). Note the frontend opportunity page is NOT built (baked image; backend-only this plan) as a tracked follow-up.

---

## Self-review checklist (done at planning time)

- **Roadmap coverage:** daily opportunity ranking by validated net expectancy (Tasks 1,4); backtest-vs-live `SignalEpisode` divergence (Task 2); regime conditioning (Task 3 + tag in Task 4); chat `get_top_opportunities`/`explain_opportunity` (Task 5). Broker-accumulation event-study rebrand and the frontend page are deferred (noted) — the engine ingests engine-producer episodes already via Task 4, so the analytics value is captured without the forecast-UI rework.
- **Reuses, doesn't duplicate:** expectancy from Plan-1 `trade_returns`; significance from Plan-2 `excess_pvalue`; live record from existing `SignalEpisode`; signals from existing `infer_current_signal`/episodes. No new heavy models.
- **Type consistency:** `expectancy_stats` returns the dict consumed in `evaluate.py` and the engine; `producer_track_record` returns the `live` dict consumed by `trust_tier`; `score_opportunity`/`rank_opportunities_from_rows` operate on the opportunity-row dict shape built in `rank_opportunities`.
- **Cost guard:** the live ranking avoids 41×24 recompute by reusing persisted metrics and only calling cheap single-symbol `infer_current_signal`; `rank_opportunities` caches per-producer backtest metrics within a run.
- **No placeholders in pure-logic tasks (1,2,3);** Tasks 4–5 specify exact signatures, routes, and the registration pattern; the DB-orchestration step says read the real `infer_current_signal`/episode shapes before wiring.
- **Read-only:** no order placement anywhere (research engine).
