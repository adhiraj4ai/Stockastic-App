# Chat: Optimal Strategy Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich `get_signals_for_ticker` with per-strategy performance metrics and teach the buy-sell-strategist to rank signals by those metrics before issuing a verdict.

**Architecture:** Extract a pure `_rank_strategy_signals` helper in `chat/tools.py` that enriches and sorts StrategySignal objects by scope → win_rate → sharpe, update `get_signals_for_ticker` to use it and prepend a best-strategy prose anchor, then update `strategist.yaml` to apply weighted tallying and lead the verdict with the primary strategy.

**Tech Stack:** Django ORM (Strategy, StrategySignal models already in scope), pytest, YAML prompt files.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `backend/chat/tools.py` | Modify | Add `_SCOPE_RANK` constant + `_rank_strategy_signals` helper; update `get_signals_for_ticker` |
| `backend/chat/prompts/strategist.yaml` | Modify | Update Step 1 with ranking workflow + weighted tally; update verdict format |
| `backend/tests/unit/test_chat_tools_signals.py` | Create | Unit tests for `_rank_strategy_signals` (pure function, no DB) |

---

## Task 1: Write failing tests for `_rank_strategy_signals`

**Files:**
- Create: `backend/tests/unit/test_chat_tools_signals.py`

- [ ] **Step 1: Create the test file**

```python
"""Unit tests for chat.tools._rank_strategy_signals — pure ranking helper."""
from datetime import date
from decimal import Decimal
from unittest.mock import Mock

import pytest

from chat.tools import _rank_strategy_signals


def _make_signal(
    name="StratA",
    strategy_id=1,
    signal="BUY",
    win_rate=50.0,
    sharpe=1.0,
    pnl_percent=10.0,
    max_drawdown=5.0,
    best_objective="balanced",
    optimization_scope="DEFAULT",
    last_close=None,
):
    """Factory for mock StrategySignal objects."""
    strat = Mock()
    strat.name = name
    strat.id = strategy_id
    strat.win_rate = Decimal(str(win_rate))
    strat.sharpe_ratio = Decimal(str(sharpe))
    strat.pnl_percent = Decimal(str(pnl_percent))
    strat.max_drawdown = Decimal(str(max_drawdown))
    strat.best_objective = best_objective

    sig = Mock()
    sig.strategy = strat
    sig.signal = signal
    sig.date = date(2026, 6, 9)
    sig.last_close = Decimal(str(last_close)) if last_close is not None else None
    sig.metadata = {"optimization_scope": optimization_scope}
    return sig


class TestRankStrategySignals:
    def test_returns_empty_list_and_none_for_no_signals(self):
        enriched, best = _rank_strategy_signals([])
        assert enriched == []
        assert best is None

    def test_single_signal_is_best(self):
        sig = _make_signal(name="GoldenCross", win_rate=62.0, sharpe=1.4, optimization_scope="SYMBOL")
        enriched, best = _rank_strategy_signals([sig])
        assert best == "GoldenCross"
        assert len(enriched) == 1

    def test_enriched_fields_present(self):
        sig = _make_signal(
            name="MACD_SAR",
            strategy_id=7,
            signal="SELL",
            win_rate=55.5,
            sharpe=1.2,
            pnl_percent=18.3,
            max_drawdown=8.1,
            best_objective="profit",
            optimization_scope="SECTOR",
            last_close=1250.0,
        )
        enriched, _ = _rank_strategy_signals([sig])
        e = enriched[0]
        assert e["strategy"] == "MACD_SAR"
        assert e["strategy_id"] == 7
        assert e["signal"] == "SELL"
        assert e["date"] == "2026-06-09"
        assert e["last_close"] == 1250.0
        assert e["win_rate"] == 55.5
        assert e["sharpe"] == 1.2
        assert e["pnl_pct"] == 18.3
        assert e["max_drawdown"] == 8.1
        assert e["best_objective"] == "profit"
        assert e["optimization_scope"] == "SECTOR"

    def test_scope_rank_symbol_beats_sector(self):
        sector_sig = _make_signal(name="Sector", win_rate=70.0, sharpe=2.0, optimization_scope="SECTOR")
        symbol_sig = _make_signal(name="Symbol", win_rate=40.0, sharpe=0.5, optimization_scope="SYMBOL")
        enriched, best = _rank_strategy_signals([sector_sig, symbol_sig])
        assert best == "Symbol"
        assert enriched[0]["strategy"] == "Symbol"

    def test_scope_rank_sector_beats_all(self):
        all_sig = _make_signal(name="All", win_rate=80.0, sharpe=3.0, optimization_scope="ALL")
        sector_sig = _make_signal(name="Sector", win_rate=50.0, sharpe=1.0, optimization_scope="SECTOR")
        _, best = _rank_strategy_signals([all_sig, sector_sig])
        assert best == "Sector"

    def test_scope_rank_all_beats_default(self):
        default_sig = _make_signal(name="Default", win_rate=90.0, sharpe=5.0, optimization_scope="DEFAULT")
        all_sig = _make_signal(name="All", win_rate=30.0, sharpe=0.1, optimization_scope="ALL")
        _, best = _rank_strategy_signals([default_sig, all_sig])
        assert best == "All"

    def test_win_rate_tiebreaker_within_same_scope(self):
        low_wr = _make_signal(name="LowWR", win_rate=40.0, sharpe=1.0, optimization_scope="ALL")
        high_wr = _make_signal(name="HighWR", win_rate=70.0, sharpe=1.0, optimization_scope="ALL")
        _, best = _rank_strategy_signals([low_wr, high_wr])
        assert best == "HighWR"

    def test_sharpe_tiebreaker_when_scope_and_win_rate_equal(self):
        low_sh = _make_signal(name="LowSharpe", win_rate=60.0, sharpe=0.8, optimization_scope="SECTOR")
        high_sh = _make_signal(name="HighSharpe", win_rate=60.0, sharpe=2.1, optimization_scope="SECTOR")
        _, best = _rank_strategy_signals([low_sh, high_sh])
        assert best == "HighSharpe"

    def test_pnl_pct_tiebreaker_when_all_else_equal(self):
        low_pnl = _make_signal(name="LowPnl", win_rate=55.0, sharpe=1.5, pnl_percent=5.0, optimization_scope="ALL")
        high_pnl = _make_signal(name="HighPnl", win_rate=55.0, sharpe=1.5, pnl_percent=20.0, optimization_scope="ALL")
        _, best = _rank_strategy_signals([low_pnl, high_pnl])
        assert best == "HighPnl"

    def test_missing_metadata_defaults_to_default_scope(self):
        sig = _make_signal(name="NoMeta", optimization_scope="SYMBOL")
        sig.metadata = None  # explicitly clear metadata
        enriched, _ = _rank_strategy_signals([sig])
        assert enriched[0]["optimization_scope"] == "DEFAULT"

    def test_missing_optimization_scope_key_defaults_to_default(self):
        sig = _make_signal(name="NoKey")
        sig.metadata = {"some_other_key": "value"}  # no optimization_scope key
        enriched, _ = _rank_strategy_signals([sig])
        assert enriched[0]["optimization_scope"] == "DEFAULT"

    def test_null_win_rate_treated_as_zero(self):
        sig = _make_signal(name="NullWR", win_rate=0.0, optimization_scope="ALL")
        sig.strategy.win_rate = None
        enriched, _ = _rank_strategy_signals([sig])
        assert enriched[0]["win_rate"] == 0.0

    def test_empty_best_objective_becomes_balanced(self):
        sig = _make_signal(name="EmptyObj", best_objective="")
        enriched, _ = _rank_strategy_signals([sig])
        assert enriched[0]["best_objective"] == "balanced"

    def test_null_last_close_becomes_none(self):
        sig = _make_signal(name="NoClose", last_close=None)
        enriched, _ = _rank_strategy_signals([sig])
        assert enriched[0]["last_close"] is None
```

- [ ] **Step 2: Run tests to verify they fail (function doesn't exist yet)**

```bash
cd /Users/jugalraj/Documents/Projects/Stockastic/backend
python -m pytest tests/unit/test_chat_tools_signals.py -v 2>&1 | head -30
```

Expected: `ImportError: cannot import name '_rank_strategy_signals' from 'chat.tools'`

---

## Task 2: Implement `_rank_strategy_signals` in `chat/tools.py`

**Files:**
- Modify: `backend/chat/tools.py` — add constant + helper after the `_result` helper block (around line 81)

- [ ] **Step 1: Add `_SCOPE_RANK` constant and `_rank_strategy_signals` after the existing `_resolve_account` helper (after line 89)**

Insert these two blocks immediately after `_resolve_account` ends (after line 89 in the current file), before the first `@tool` decorator:

```python
# ─────────────────────────────────────────────────────────────────────────────
# Strategy signal ranking
# ─────────────────────────────────────────────────────────────────────────────

_SCOPE_RANK: dict[str, int] = {"SYMBOL": 3, "SECTOR": 2, "ALL": 1, "DEFAULT": 0}


def _rank_strategy_signals(strat_signals: list) -> tuple[list[dict], str | None]:
    """Enrich StrategySignal objects with strategy performance metrics and rank them.

    Ranking order (descending priority):
        1. optimization_scope: SYMBOL > SECTOR > ALL > DEFAULT
        2. win_rate
        3. sharpe_ratio
        4. pnl_percent (tiebreaker)

    Returns:
        (enriched_list, best_strategy_name)
        best_strategy_name is None when strat_signals is empty.
    """
    enriched = []
    for s in strat_signals:
        scope = (s.metadata or {}).get("optimization_scope", "DEFAULT")
        enriched.append({
            "strategy": s.strategy.name,
            "strategy_id": s.strategy.id,
            "signal": s.signal,
            "date": s.date.isoformat(),
            "last_close": float(s.last_close) if s.last_close else None,
            "pnl_pct": float(s.strategy.pnl_percent or 0),
            "win_rate": float(s.strategy.win_rate or 0),
            "sharpe": float(s.strategy.sharpe_ratio or 0),
            "max_drawdown": float(s.strategy.max_drawdown or 0),
            "best_objective": s.strategy.best_objective or "balanced",
            "optimization_scope": scope,
        })

    enriched.sort(
        key=lambda x: (
            _SCOPE_RANK.get(x["optimization_scope"], 0),
            x["win_rate"],
            x["sharpe"],
            x["pnl_pct"],
        ),
        reverse=True,
    )

    best = enriched[0]["strategy"] if enriched else None
    return enriched, best
```

- [ ] **Step 2: Run unit tests to verify they pass**

```bash
cd /Users/jugalraj/Documents/Projects/Stockastic/backend
python -m pytest tests/unit/test_chat_tools_signals.py -v
```

Expected: all 14 tests PASS.

- [ ] **Step 3: Commit the helper + tests**

```bash
git add backend/chat/tools.py backend/tests/unit/test_chat_tools_signals.py
git commit -m "feat(chat): add _rank_strategy_signals helper with unit tests"
```

---

## Task 3: Update `get_signals_for_ticker` to use the helper

**Files:**
- Modify: `backend/chat/tools.py` — `get_signals_for_ticker` inner `_run()` function (current lines 496–531)

- [ ] **Step 1: Replace the `strat_data` list comprehension and prose line in `_run()`**

Replace the entire block from `strat_data = [` through `prose = f"{ticker}: ...` with:

```python
        strat_data, best_strategy = _rank_strategy_signals(strat_signals)
        gen_data = [
            {
                "source": g.source,
                "signal": g.signal,
                "tier": g.signal_tier,
                "strength": float(g.strength),
                "status": g.status,
                "ltp": float(g.ltp),
                "target": float(g.target_price) if g.target_price else None,
                "stop": float(g.stop_loss_price) if g.stop_loss_price else None,
                "date": g.generated_date.isoformat(),
            }
            for g in gen_signals
        ]
        buys = sum(1 for s in strat_data if s["signal"] == "BUY") + sum(1 for g in gen_data if g["signal"] == "BUY")
        sells = sum(1 for s in strat_data if s["signal"] == "SELL") + sum(1 for g in gen_data if g["signal"] == "SELL")
        verdict = "BUY" if buys > sells else "SELL" if sells > buys else "HOLD"

        if best_strategy and strat_data:
            best = strat_data[0]
            anchor = (
                f"best strategy: {best['strategy']} "
                f"(WR {best['win_rate']:.1f}%, Sharpe {best['sharpe']:.2f}, "
                f"scope: {best['optimization_scope']}) · "
            )
        else:
            anchor = ""
        prose = f"{anchor}{ticker}: {buys} buy / {sells} sell signals · verdict {verdict}."
```

- [ ] **Step 2: Verify the Django dev server can import without errors**

```bash
cd /Users/jugalraj/Documents/Projects/Stockastic/backend
python -c "from chat.tools import get_signals_for_ticker, _rank_strategy_signals; print('OK')"
```

Expected output: `OK`

- [ ] **Step 3: Run the full unit test suite to confirm no regressions**

```bash
cd /Users/jugalraj/Documents/Projects/Stockastic/backend
python -m pytest tests/unit/ -v
```

Expected: all tests PASS (no failures).

- [ ] **Step 4: Commit**

```bash
git add backend/chat/tools.py
git commit -m "feat(chat): enrich get_signals_for_ticker with strategy metrics + best-strategy anchor"
```

---

## Task 4: Update `strategist.yaml` with ranking workflow

**Files:**
- Modify: `backend/chat/prompts/strategist.yaml`

- [ ] **Step 1: Replace Step 1 and the verdict format block**

The full new content of `backend/chat/prompts/strategist.yaml`:

```yaml
system: |
  You are the Stockastic Buy/Sell Strategist — you synthesize signal data,
  technical analysis context, and portfolio risk into a single, defensible
  BUY / SELL / HOLD verdict with precise entry, stop, and target levels.
  You are the last decision gate before capital is deployed.

  ## Your Tools

  - `get_signals_for_ticker` — aggregated signals from strategy backtests and
    smart-money generated signals; returns buy count, sell count, verdict,
    plus full signal detail with entry/stop/target where available.
    Strategy signals now include: pnl_pct, win_rate, sharpe, max_drawdown,
    best_objective, optimization_scope, and a pre-computed best-strategy anchor
    in the prose summary.
  - `get_signal_track_record` — historical win/loss/active stats for a signal
    source; use to weight how much confidence to place in each source
  - `calc_position_size` — given account balance, entry, stop-loss, target,
    and risk %, returns max shares, total cost, R/R ratio, and risk warnings

  ## Decision Framework

  ### Step 1: Retrieve & Tally Signals

  Call `get_signals_for_ticker`. The response includes:
  - Strategy signals enriched with performance metrics (pnl_pct, win_rate,
    sharpe, max_drawdown, best_objective, optimization_scope) — already sorted
    best-first by the tool
  - Smart-money generated signals (source, tier, strength, target, stop)
  - A prose anchor in the summary identifying the best strategy

  **Primary strategy:** The tool pre-ranks strategy signals by:
  1. optimization_scope: SYMBOL > SECTOR > ALL > DEFAULT
     (a strategy optimized specifically for this symbol outranks a generic one)
  2. win_rate descending
  3. sharpe descending

  The first entry in `strategy_signals` is the **primary strategy** for this
  symbol. Name it explicitly in your verdict.

  **Weighted tally** — apply these multipliers before counting BUY/SELL for
  the confluence score:
  - Strategy signal, win_rate > 55%: weight 2×
  - Strategy signal, win_rate 40–55%: weight 1×
  - Strategy signal, win_rate < 40%: weight 0.5×
  - Smart-money signals: weight 1.5× (more timely but noisier)

  **best_objective awareness:**
  - `"win_rate"` → conservative, high-reliability entries; suits risk-averse
    sizing; note this in your verdict
  - `"profit"` → aggressive optimization; flag higher variance
  - `"balanced"` or `""` → general-purpose; no special note needed

  If provided by the orchestrator, also incorporate technical analysis
  (RSI, MACD, ADX, support/resistance) and fundamental picture.

  ### Step 2: Signal Confluence Scoring
  Score 0–10 based on alignment using the **weighted** BUY/SELL counts:
  - 0–2: All signals disagree → HOLD, conviction low
  - 3–4: Slight signal edge, technicals neutral → HOLD or tentative direction
  - 5–6: Moderate alignment across signals → BUY/SELL, conviction medium
  - 7–8: Strong alignment, technicals confirm → BUY/SELL, conviction high
  - 9–10: All signals aligned + fundamentals + smart money + technicals agree
    → BUY/SELL, conviction very high

  ### Step 3: Market Regime Check
  Before issuing a BUY, consider:
  - Is the broader NEPSE market in a downtrend? (If given context)
  - If market is in distribution, even strong individual setups carry more risk
  - In a bear market or major correction, reduce conviction by one tier

  ### Step 4: Risk/Reward Validation
  - Minimum R/R ratio for any BUY: 2:1 (target at least 2× the risk)
  - Stop-loss must be technically justified (below support, not arbitrary)
  - Target must be at a meaningful level (resistance, prior high, valuation fair value)
  - If R/R < 2:1, the verdict is HOLD regardless of signals — the setup isn't worth it

  ### Step 5: Position Sizing
  If the user provided entry + stop (or if signals have them), call
  `calc_position_size`. Use:
  - Default risk: 2% of account (never exceed 5% without explicit warning)
  - Account balance: from context or default Rs 100,000
  - Always check: does the suggested size create over-concentration vs.
    the portfolio?

  ### Step 6: Portfolio Context Integration
  If holdings data was provided (by orchestrator):
  - If user already holds the stock: a fresh buy is averaging down (flag risk)
  - If stock is a large existing position: more exposure amplifies concentration
  - If user's portfolio is already at > 80% invested: flag liquidity constraint

  ## Verdict Format

  ```
  [TICKER]: BUY / SELL / HOLD
  Conviction: low | medium | high | very high
  Confluence score: X/10
  Primary strategy: [name] (WR X%, Sharpe Y, scope: Z)

  [3 bullets justifying the call — first bullet MUST cite the primary strategy's signal]

  Entry: Rs X | Stop: Rs Y | Target: Rs Z | R/R: N:1
  Position: N shares · Rs total_cost · Risk Rs risk_amount (X% of account)
  [Warning if risk > 5% or R/R < 2:1]
  ```

  ## Rules

  - If signals split evenly (weighted BUY == weighted SELL) → HOLD, conviction low
  - Never recommend > 5% account risk without a bold WARNING
  - Never issue a BUY in a clear downtrend without noting it explicitly
  - Never issue a verdict without data — if signals are missing, say so
  - A high-conviction HOLD is better than a low-confidence BUY

user: |
  Produce a buy/sell/hold verdict for the requested NEPSE ticker.
  Apply the full 6-step decision framework: signal tally → confluence
  score → market regime → R/R validation → position sizing → portfolio context.
  Be rigorous. A well-reasoned HOLD is better than an unfounded BUY.
```

- [ ] **Step 2: Verify the YAML parses cleanly**

```bash
cd /Users/jugalraj/Documents/Projects/Stockastic/backend
python -c "
import yaml
from pathlib import Path
data = yaml.safe_load(Path('chat/prompts/strategist.yaml').read_text())
assert 'system' in data and 'user' in data
assert 'Primary strategy:' in data['system']
assert 'weighted' in data['system'].lower()
print('YAML OK, length:', len(data['system']))
"
```

Expected: `YAML OK, length: <number above 2000>`

- [ ] **Step 3: Run full unit test suite one more time**

```bash
cd /Users/jugalraj/Documents/Projects/Stockastic/backend
python -m pytest tests/unit/ -v
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/chat/prompts/strategist.yaml
git commit -m "feat(chat): update strategist prompt with weighted signal ranking and primary strategy"
```

---

## Self-Review Checklist

- [x] **Spec coverage:**
  - Part 1 (enrich tool): Task 2 + Task 3 cover `_rank_strategy_signals` extraction and integration
  - Part 2 (strategist prompt): Task 4 covers the full ranking workflow, weighted tally, best_objective, and verdict format addition
  - Error handling (missing metadata → DEFAULT, null win_rate → 0): covered in Task 1 tests + Task 2 implementation
  - Prose anchor computed by tool: covered in Task 3 Step 1
- [x] **No placeholders:** All steps contain complete code
- [x] **Type consistency:** `_rank_strategy_signals` signature is `(list) -> tuple[list[dict], str | None]`; used the same way in Task 2 (implementation) and Task 3 (integration). Test factory in Task 1 matches field names in Task 2.
