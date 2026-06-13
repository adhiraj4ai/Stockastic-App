# View & Chat Streaming Decomposition Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract StrategyPerformanceService from the 217-line `performance_detailed()` view action and decompose `stream_chat()` into focused async helpers, each ≤30 lines.

**Architecture:** `strategy_performance_service.py` provides 8 pure functions; `stream_chat()` becomes a ≤30-line dispatcher that delegates to typed async handlers per message kind; shared tool-result block handling is extracted to avoid duplication between `AssistantMessage` and `UserMessage` processing.

**Tech Stack:** Django 5.2, DRF, Claude Agent SDK, pytest-asyncio, pytest-django

---

## Part A — StrategyPerformanceService

### Task 1: Add `PROFIT_FACTOR_DEFAULT` to `stocks/constants.py`

**Files:**
- Edit: `backend/stocks/constants.py`
- Edit: `backend/stocks/tests/test_constants.py`

- [ ] Step 1 — Write a failing test. Append to `backend/stocks/tests/test_constants.py`:

```python
def test_profit_factor_default_value():
    from stocks.constants import PROFIT_FACTOR_DEFAULT
    assert PROFIT_FACTOR_DEFAULT == 999.0
    assert isinstance(PROFIT_FACTOR_DEFAULT, float)
```

- [ ] Step 2 — Run the test and confirm it fails:

```bash
cd backend && pytest stocks/tests/test_constants.py::test_profit_factor_default_value -v
# Expected: FAILED — ImportError: cannot import name 'PROFIT_FACTOR_DEFAULT'
```

- [ ] Step 3 — Add the constant to `backend/stocks/constants.py` (append after the last existing constant):

```python
# strategy_performance_service.py — profit factor when gross_loss is zero
PROFIT_FACTOR_DEFAULT: float = 999.0
```

- [ ] Step 4 — Run the test and confirm it passes:

```bash
cd backend && pytest stocks/tests/test_constants.py::test_profit_factor_default_value -v
# Expected: PASSED
```

---

### Task 2: Create `strategy_performance_service.py` — `_fetch_episodes` first

**Files:**
- Create: `backend/stocks/services/strategy_performance_service.py`
- Create: `backend/stocks/tests/test_strategy_performance_service.py`

- [ ] Step 1 — Write a failing test for `_fetch_episodes`. Create `backend/stocks/tests/test_strategy_performance_service.py`:

```python
# backend/stocks/tests/test_strategy_performance_service.py
import pytest
from unittest.mock import patch, MagicMock
from django.contrib.auth.models import User


@pytest.fixture
def user(db):
    return User.objects.create_user(username="perf_test_user", password="pw")


@pytest.mark.django_db
def test_fetch_episodes_returns_list(user):
    from stocks.services.strategy_performance_service import _fetch_episodes
    # No episodes in DB yet — should return an empty list, not raise
    result = _fetch_episodes(user)
    assert isinstance(result, list)


@pytest.mark.django_db
def test_fetch_episodes_normalises_field_names(user):
    """Each episode dict must carry the normalised aliases used downstream."""
    from stocks.services.strategy_performance_service import _fetch_episodes
    from stocks.models.signal_episode import SignalEpisode

    # Create a minimal SignalEpisode row
    ep = SignalEpisode.objects.create(
        user=user,
        source="test_engine",
        symbol="NABIL",
        direction="BUY",
        status="WON",
        pnl_percent=5.5,
    )
    result = _fetch_episodes(user)
    assert len(result) >= 1
    row = next(r for r in result if r["id"] == ep.id)
    # normalised aliases must be present
    assert "signal" in row
    assert "generated_date" in row
    assert "closed_date" in row
    assert "ltp" in row
    assert "strength" in row
    assert row["signal"] == "BUY"
```

- [ ] Step 2 — Run and confirm failure:

```bash
cd backend && pytest stocks/tests/test_strategy_performance_service.py -v
# Expected: FAILED — ModuleNotFoundError
```

- [ ] Step 3 — Create `backend/stocks/services/strategy_performance_service.py` with `_fetch_episodes` only:

```python
# backend/stocks/services/strategy_performance_service.py
"""Pure-function service for per-engine signal performance analytics.

All helpers are module-level functions (no class needed — no shared mutable
state, no DI requirements). Each is ≤30 lines and has a single responsibility.
"""
from __future__ import annotations

from collections import defaultdict
from typing import Any

from stocks.constants import PROFIT_FACTOR_DEFAULT
from stocks.models.signal_episode import SignalEpisode


_EPISODE_STATUSES = ("WON", "LOST", "ACTIVE")

_FIELD_ALIASES: dict[str, str] = {
    "direction": "signal",
    "start_date": "generated_date",
    "end_date": "closed_date",
    "entry_price": "ltp",
    "entry_strength": "strength",
}


def _fetch_episodes(user) -> list[dict]:
    """Return all signal episodes for *user* with normalised field aliases."""
    rows = list(
        SignalEpisode.objects.filter(
            status__in=_EPISODE_STATUSES,
        ).values(
            "id", "source", "symbol", "direction", "status",
            "pnl_percent", "start_date", "end_date",
            "entry_price", "target_price", "stop_loss_price",
            "entry_strength", "signal_tier",
        ).order_by("source", "start_date")
    )
    for ep in rows:
        for src_field, alias in _FIELD_ALIASES.items():
            ep[alias] = ep[src_field]
    return rows
```

- [ ] Step 4 — Run tests and confirm they pass:

```bash
cd backend && pytest stocks/tests/test_strategy_performance_service.py -v
# Expected: PASSED (or skip on missing SignalEpisode FK — adjust fixture if needed)
```

---

### Task 3: Add remaining helpers to `strategy_performance_service.py`

**Files:**
- Edit: `backend/stocks/services/strategy_performance_service.py`
- Edit: `backend/stocks/tests/test_strategy_performance_service.py`

- [ ] Step 1 — Write failing tests for each helper. Append to `backend/stocks/tests/test_strategy_performance_service.py`:

```python
# ── _group_by_source ──────────────────────────────────────────────────────────

def test_group_by_source_empty():
    from stocks.services.strategy_performance_service import _group_by_source
    assert _group_by_source([]) == {}


def test_group_by_source_groups_correctly():
    from stocks.services.strategy_performance_service import _group_by_source
    episodes = [
        {"source": "engine_a", "symbol": "NABIL"},
        {"source": "engine_b", "symbol": "NMB"},
        {"source": "engine_a", "symbol": "SCB"},
    ]
    result = _group_by_source(episodes)
    assert set(result.keys()) == {"engine_a", "engine_b"}
    assert len(result["engine_a"]) == 2
    assert len(result["engine_b"]) == 1


# ── _compute_win_loss_streak ──────────────────────────────────────────────────

def test_streak_all_wins():
    from stocks.services.strategy_performance_service import _compute_win_loss_streak
    from datetime import date
    episodes = [
        {"status": "WON", "generated_date": date(2025, 1, 1)},
        {"status": "WON", "generated_date": date(2025, 1, 2)},
        {"status": "WON", "generated_date": date(2025, 1, 3)},
    ]
    max_wins, max_losses = _compute_win_loss_streak(episodes)
    assert max_wins == 3
    assert max_losses == 0


def test_streak_alternating():
    from stocks.services.strategy_performance_service import _compute_win_loss_streak
    from datetime import date
    episodes = [
        {"status": "WON",  "generated_date": date(2025, 1, 1)},
        {"status": "LOST", "generated_date": date(2025, 1, 2)},
        {"status": "LOST", "generated_date": date(2025, 1, 3)},
        {"status": "WON",  "generated_date": date(2025, 1, 4)},
    ]
    max_wins, max_losses = _compute_win_loss_streak(episodes)
    assert max_wins == 1
    assert max_losses == 2


def test_streak_empty():
    from stocks.services.strategy_performance_service import _compute_win_loss_streak
    assert _compute_win_loss_streak([]) == (0, 0)


# ── _compute_monthly_perf ─────────────────────────────────────────────────────

def test_monthly_perf_basic():
    from stocks.services.strategy_performance_service import _compute_monthly_perf
    from datetime import date
    episodes = [
        {"status": "WON",  "generated_date": date(2025, 3, 5), "pnl_percent": 4.0},
        {"status": "LOST", "generated_date": date(2025, 3, 10), "pnl_percent": -2.0},
        {"status": "WON",  "generated_date": date(2025, 4, 1), "pnl_percent": 3.0},
    ]
    result = _compute_monthly_perf(episodes)
    assert isinstance(result, list)
    # should have 2 months
    assert len(result) == 2
    march = next(r for r in result if r["month"] == "2025-03")
    assert march["won"] == 1
    assert march["lost"] == 1
    assert march["pnl"] == 2.0


def test_monthly_perf_empty():
    from stocks.services.strategy_performance_service import _compute_monthly_perf
    assert _compute_monthly_perf([]) == []


# ── _compute_pnl_buckets ──────────────────────────────────────────────────────

def test_pnl_buckets_all_keys_present():
    from stocks.services.strategy_performance_service import _compute_pnl_buckets
    result = _compute_pnl_buckets([])
    expected_keys = {"< -5%", "-5% to -2%", "-2% to 0%", "0% to 2%", "2% to 5%", "5% to 10%", "> 10%"}
    assert set(result.keys()) == expected_keys
    assert all(v == 0 for v in result.values())


def test_pnl_buckets_correct_placement():
    from stocks.services.strategy_performance_service import _compute_pnl_buckets
    result = _compute_pnl_buckets([-6.0, -3.5, -1.0, 1.0, 3.0, 7.0, 11.0])
    assert result["< -5%"] == 1
    assert result["-5% to -2%"] == 1
    assert result["-2% to 0%"] == 1
    assert result["0% to 2%"] == 1
    assert result["2% to 5%"] == 1
    assert result["5% to 10%"] == 1
    assert result["> 10%"] == 1


# ── _compute_buy_sell_stats ───────────────────────────────────────────────────

def test_buy_sell_stats_keys():
    from stocks.services.strategy_performance_service import _compute_buy_sell_stats
    result = _compute_buy_sell_stats([])
    for direction in ("buy", "sell"):
        assert direction in result
        assert set(result[direction].keys()) == {"total", "won", "lost", "active", "win_rate"}


def test_buy_sell_stats_win_rate():
    from stocks.services.strategy_performance_service import _compute_buy_sell_stats
    episodes = [
        {"signal": "BUY", "status": "WON"},
        {"signal": "BUY", "status": "WON"},
        {"signal": "BUY", "status": "LOST"},
        {"signal": "SELL", "status": "LOST"},
    ]
    result = _compute_buy_sell_stats(episodes)
    assert result["buy"]["total"] == 3
    assert result["buy"]["won"] == 2
    assert result["buy"]["win_rate"] == pytest.approx(66.7, rel=0.01)
    assert result["sell"]["total"] == 1
    assert result["sell"]["win_rate"] == 0


# ── _compute_engine_stats ─────────────────────────────────────────────────────

def test_compute_engine_stats_structure():
    from stocks.services.strategy_performance_service import _compute_engine_stats
    from datetime import date
    episodes = [
        {"source": "eng", "symbol": "NABIL", "signal": "BUY", "direction": "BUY",
         "status": "WON", "pnl_percent": 5.0,
         "generated_date": date(2025, 1, 1), "closed_date": date(2025, 1, 10),
         "ltp": 1000, "strength": 80, "signal_tier": "A",
         "target_price": 1100, "stop_loss_price": 950},
        {"source": "eng", "symbol": "NMB", "signal": "BUY", "direction": "BUY",
         "status": "LOST", "pnl_percent": -2.0,
         "generated_date": date(2025, 2, 1), "closed_date": date(2025, 2, 5),
         "ltp": 500, "strength": 60, "signal_tier": "B",
         "target_price": 520, "stop_loss_price": 480},
    ]
    result = _compute_engine_stats("eng", episodes)
    required_keys = {
        "source", "total", "won", "lost", "active", "win_rate",
        "avg_win_pnl", "avg_loss_pnl", "profit_factor", "expectancy",
        "max_consecutive_wins", "max_consecutive_losses", "avg_days_to_close",
        "best_signal_pnl", "worst_signal_pnl", "consistency_score",
        "monthly_performance", "pnl_distribution", "buy_stats", "sell_stats",
        "top_symbols", "worst_symbols",
    }
    assert required_keys <= set(result.keys())
    assert result["source"] == "eng"
    assert result["total"] == 2
    assert result["won"] == 1
    assert result["lost"] == 1


def test_compute_engine_stats_profit_factor_default():
    """When there are no losses, profit_factor falls back to PROFIT_FACTOR_DEFAULT."""
    from stocks.services.strategy_performance_service import _compute_engine_stats
    from stocks.constants import PROFIT_FACTOR_DEFAULT
    from datetime import date
    episodes = [
        {"source": "eng", "symbol": "NABIL", "signal": "BUY", "direction": "BUY",
         "status": "WON", "pnl_percent": 10.0,
         "generated_date": date(2025, 1, 1), "closed_date": date(2025, 1, 5),
         "ltp": 1000, "strength": 90, "signal_tier": "A",
         "target_price": 1100, "stop_loss_price": 950},
    ]
    result = _compute_engine_stats("eng", episodes)
    assert result["profit_factor"] == PROFIT_FACTOR_DEFAULT


# ── _build_response ───────────────────────────────────────────────────────────

def test_build_response_structure():
    from stocks.services.strategy_performance_service import _build_response
    engines = [
        {"source": "eng_a", "total": 10, "won": 7, "lost": 3, "active": 0,
         "win_rate": 70.0, "profit_factor": 2.5},
        {"source": "eng_b", "total": 5, "won": 2, "lost": 3, "active": 0,
         "win_rate": 40.0, "profit_factor": 0.8},
    ]
    result = _build_response(engines, total_signals=15, total_resolved=13,
                             total_won=9, total_profit=35.0, total_loss=10.0)
    assert "engines" in result
    assert "overall" in result
    assert result["engines"][0]["source"] == "eng_a"  # sorted by profit_factor desc
    overall = result["overall"]
    assert overall["total_signals"] == 15
    assert overall["net_pnl"] == pytest.approx(25.0)
    assert overall["best_engine"] == "eng_a"
    assert overall["worst_engine"] == "eng_b"
```

- [ ] Step 2 — Run and confirm failures:

```bash
cd backend && pytest stocks/tests/test_strategy_performance_service.py -v
# Expected: multiple FAILED — functions not yet implemented
```

- [ ] Step 3 — Implement all remaining helpers. Replace `backend/stocks/services/strategy_performance_service.py` with the full implementation:

```python
# backend/stocks/services/strategy_performance_service.py
"""Pure-function service for per-engine signal performance analytics."""
from __future__ import annotations

from collections import defaultdict
from typing import Any

from stocks.constants import PROFIT_FACTOR_DEFAULT
from stocks.models.signal_episode import SignalEpisode


_EPISODE_STATUSES = ("WON", "LOST", "ACTIVE")
_PNL_BUCKET_BOUNDARIES = [
    ("< -5%",      lambda p: p < -5),
    ("-5% to -2%", lambda p: -5 <= p < -2),
    ("-2% to 0%",  lambda p: -2 <= p < 0),
    ("0% to 2%",   lambda p: 0 <= p < 2),
    ("2% to 5%",   lambda p: 2 <= p < 5),
    ("5% to 10%",  lambda p: 5 <= p < 10),
    ("> 10%",      lambda p: p >= 10),
]
_FIELD_ALIASES: dict[str, str] = {
    "direction": "signal",
    "start_date": "generated_date",
    "end_date": "closed_date",
    "entry_price": "ltp",
    "entry_strength": "strength",
}


def compute_performance_detailed(user) -> dict:
    """Entry point: compute full per-engine performance analytics for *user*."""
    episodes = _fetch_episodes(user)
    grouped = _group_by_source(episodes)
    totals = {"profit": 0.0, "loss": 0.0, "resolved": 0, "won": 0}
    engines = []
    for source, eps in grouped.items():
        stats = _compute_engine_stats(source, eps)
        totals["profit"] += stats.pop("_gross_profit")
        totals["loss"] += stats.pop("_gross_loss")
        totals["resolved"] += stats.pop("_n_resolved")
        totals["won"] += stats.pop("_n_won")
        engines.append(stats)
    return _build_response(
        engines,
        total_signals=len(episodes),
        total_resolved=totals["resolved"],
        total_won=totals["won"],
        total_profit=totals["profit"],
        total_loss=totals["loss"],
    )


def _fetch_episodes(user) -> list[dict]:
    """Query DB for all signal episodes; apply field-name aliases in-place."""
    rows = list(
        SignalEpisode.objects.filter(
            status__in=_EPISODE_STATUSES,
        ).values(
            "id", "source", "symbol", "direction", "status",
            "pnl_percent", "start_date", "end_date",
            "entry_price", "target_price", "stop_loss_price",
            "entry_strength", "signal_tier",
        ).order_by("source", "start_date")
    )
    for ep in rows:
        for src_field, alias in _FIELD_ALIASES.items():
            ep[alias] = ep[src_field]
    return rows


def _group_by_source(episodes: list[dict]) -> dict[str, list[dict]]:
    """Partition episode list into a dict keyed by source (engine name)."""
    groups: dict[str, list[dict]] = defaultdict(list)
    for ep in episodes:
        groups[ep["source"]].append(ep)
    return dict(groups)


def _compute_engine_stats(source: str, episodes: list[dict]) -> dict:
    """Aggregate all per-engine metrics into a single flat dict.

    Internal accumulation keys (_gross_profit, _gross_loss, _n_resolved,
    _n_won) are prefixed with '_' so the caller can pop them before the
    response is built.
    """
    won = [s for s in episodes if s["status"] == "WON"]
    lost = [s for s in episodes if s["status"] == "LOST"]
    active = [s for s in episodes if s["status"] == "ACTIVE"]
    resolved = won + lost
    won_pnls = [float(s["pnl_percent"] or 0) for s in won]
    lost_pnls = [float(s["pnl_percent"] or 0) for s in lost]
    all_pnls = won_pnls + lost_pnls

    n_won, n_lost, n_resolved = len(won), len(lost), len(resolved)
    win_rate = (n_won / n_resolved * 100) if n_resolved > 0 else 0.0
    avg_win = sum(won_pnls) / len(won_pnls) if won_pnls else 0.0
    avg_loss = sum(lost_pnls) / len(lost_pnls) if lost_pnls else 0.0
    gross_profit = sum(p for p in all_pnls if p > 0)
    gross_loss = abs(sum(p for p in all_pnls if p < 0))
    profit_factor = (
        round(gross_profit / gross_loss, 2) if gross_loss > 0
        else (PROFIT_FACTOR_DEFAULT if gross_profit > 0 else 0)
    )
    wr_dec = win_rate / 100
    expectancy = round((wr_dec * avg_win) + ((1 - wr_dec) * avg_loss), 2) if n_resolved > 0 else 0.0
    max_wins, max_losses = _compute_win_loss_streak(resolved)
    avg_days = _compute_avg_days(resolved)
    monthly_perf, consistency = _compute_monthly_perf_and_consistency(resolved)
    top_symbols, worst_symbols = _compute_top_worst_symbols(resolved)
    return {
        "source": source,
        "total": len(episodes),
        "won": n_won, "lost": n_lost, "active": len(active),
        "win_rate": round(win_rate, 1),
        "avg_win_pnl": round(avg_win, 2), "avg_loss_pnl": round(avg_loss, 2),
        "profit_factor": profit_factor, "expectancy": expectancy,
        "max_consecutive_wins": max_wins, "max_consecutive_losses": max_losses,
        "avg_days_to_close": avg_days,
        "best_signal_pnl": round(max(all_pnls), 2) if all_pnls else 0,
        "worst_signal_pnl": round(min(all_pnls), 2) if all_pnls else 0,
        "consistency_score": consistency,
        "monthly_performance": monthly_perf,
        "pnl_distribution": _compute_pnl_buckets(all_pnls),
        "buy_stats": _compute_buy_sell_stats(episodes)["buy"],
        "sell_stats": _compute_buy_sell_stats(episodes)["sell"],
        "top_symbols": top_symbols, "worst_symbols": worst_symbols,
        # accumulation keys consumed by compute_performance_detailed
        "_gross_profit": gross_profit, "_gross_loss": gross_loss,
        "_n_resolved": n_resolved, "_n_won": n_won,
    }


def _compute_win_loss_streak(resolved: list[dict]) -> tuple[int, int]:
    """Return (max_consecutive_wins, max_consecutive_losses) over resolved episodes."""
    max_wins = max_losses = cur_wins = cur_losses = 0
    for ep in sorted(resolved, key=lambda x: x["generated_date"]):
        if ep["status"] == "WON":
            cur_wins += 1
            cur_losses = 0
            max_wins = max(max_wins, cur_wins)
        else:
            cur_losses += 1
            cur_wins = 0
            max_losses = max(max_losses, cur_losses)
    return max_wins, max_losses


def _compute_avg_days(resolved: list[dict]) -> float:
    """Return average calendar days between generated_date and closed_date."""
    days = [
        (s["closed_date"] - s["generated_date"]).days
        for s in resolved
        if s["generated_date"] and s["closed_date"]
        and (s["closed_date"] - s["generated_date"]).days >= 0
    ]
    return round(sum(days) / len(days), 1) if days else 0.0


def _compute_monthly_perf(resolved: list[dict]) -> list[dict]:
    """Return last-6-months performance list (oldest first) for resolved episodes."""
    monthly: dict[str, dict] = defaultdict(lambda: {"won": 0, "lost": 0, "pnl": 0.0})
    for ep in resolved:
        if not ep["generated_date"]:
            continue
        key = ep["generated_date"].strftime("%Y-%m")
        monthly[key]["pnl"] += float(ep["pnl_percent"] or 0)
        if ep["status"] == "WON":
            monthly[key]["won"] += 1
        else:
            monthly[key]["lost"] += 1
    sorted_months = sorted(monthly.items(), key=lambda x: x[0], reverse=True)[:6]
    return [
        {"month": m, "won": d["won"], "lost": d["lost"], "pnl": round(d["pnl"], 2)}
        for m, d in reversed(sorted_months)
    ]


def _compute_monthly_perf_and_consistency(resolved: list[dict]) -> tuple[list[dict], int]:
    """Return (monthly_perf list, consistency_score %) for resolved episodes."""
    monthly: dict[str, dict] = defaultdict(lambda: {"won": 0, "lost": 0, "pnl": 0.0})
    for ep in resolved:
        if not ep["generated_date"]:
            continue
        key = ep["generated_date"].strftime("%Y-%m")
        monthly[key]["pnl"] += float(ep["pnl_percent"] or 0)
        if ep["status"] == "WON":
            monthly[key]["won"] += 1
        else:
            monthly[key]["lost"] += 1
    profitable = sum(1 for d in monthly.values() if d["pnl"] > 0)
    consistency = round(profitable / (len(monthly) or 1) * 100)
    sorted_months = sorted(monthly.items(), key=lambda x: x[0], reverse=True)[:6]
    perf = [
        {"month": m, "won": d["won"], "lost": d["lost"], "pnl": round(d["pnl"], 2)}
        for m, d in reversed(sorted_months)
    ]
    return perf, consistency


def _compute_pnl_buckets(pnls: list[float]) -> dict[str, int]:
    """Bin each PnL value into one of 7 percentage-range buckets."""
    buckets: dict[str, int] = {label: 0 for label, _ in _PNL_BUCKET_BOUNDARIES}
    for p in pnls:
        for label, predicate in _PNL_BUCKET_BOUNDARIES:
            if predicate(p):
                buckets[label] += 1
                break
    return buckets


def _compute_buy_sell_stats(episodes: list[dict]) -> dict[str, dict]:
    """Return separate win/loss stats for BUY and SELL directions."""
    result = {}
    for direction, key in (("BUY", "buy"), ("SELL", "sell")):
        subset = [s for s in episodes if s["signal"] == direction]
        n_won = sum(1 for s in subset if s["status"] == "WON")
        n_lost = sum(1 for s in subset if s["status"] == "LOST")
        n_active = sum(1 for s in subset if s["status"] == "ACTIVE")
        n_resolved = n_won + n_lost
        result[key] = {
            "total": len(subset), "won": n_won, "lost": n_lost, "active": n_active,
            "win_rate": round(n_won / n_resolved * 100, 1) if n_resolved > 0 else 0,
        }
    return result


def _compute_top_worst_symbols(resolved: list[dict]) -> tuple[list[str], list[str]]:
    """Return (top_5_symbol_names, worst_5_symbol_names) by cumulative PnL."""
    sym_pnl: dict[str, dict] = defaultdict(lambda: {"pnl": 0.0, "count": 0})
    for ep in resolved:
        pnl = float(ep["pnl_percent"] or 0)
        sym_pnl[ep["symbol"]]["pnl"] += pnl
        sym_pnl[ep["symbol"]]["count"] += 1
    sorted_syms = sorted(sym_pnl.items(), key=lambda x: x[1]["pnl"], reverse=True)
    top = [s[0] for s in sorted_syms[:5] if s[1]["pnl"] > 0]
    worst = [s[0] for s in sorted_syms[-5:] if s[1]["pnl"] < 0]
    return top, worst


def _build_response(
    engines: list[dict],
    *,
    total_signals: int,
    total_resolved: int,
    total_won: int,
    total_profit: float,
    total_loss: float,
) -> dict:
    """Sort engines by profit_factor and assemble the final response dict."""
    engines.sort(key=lambda e: e["profit_factor"], reverse=True)
    overall_wr = round(total_won / total_resolved * 100, 1) if total_resolved > 0 else 0.0
    return {
        "engines": engines,
        "overall": {
            "total_signals": total_signals,
            "total_resolved": total_resolved,
            "overall_win_rate": overall_wr,
            "total_profit_pnl": round(total_profit, 2),
            "total_loss_pnl": round(-total_loss, 2),
            "net_pnl": round(total_profit - total_loss, 2),
            "best_engine": engines[0]["source"] if engines else None,
            "worst_engine": engines[-1]["source"] if engines else None,
        },
    }
```

- [ ] Step 4 — Run tests and confirm all pass:

```bash
cd backend && pytest stocks/tests/test_strategy_performance_service.py -v
# Expected: all PASSED
```

---

### Task 4: Slim `performance_detailed()` in `strategy.py`

**Files:**
- Edit: `backend/stocks/views/strategy.py`

- [ ] Step 1 — Replace the body of `performance_detailed()` (lines 1136–1352) with a ≤30-line delegator. The function currently starts at line 1136; replace everything inside it:

```python
    def performance_detailed(self, request):
        """
        Deep per-engine analytics: profit factor, expectancy, streaks,
        monthly performance, PnL distribution, buy/sell splits, top symbols.
        """
        from stocks.services.strategy_performance_service import compute_performance_detailed

        return Response(compute_performance_detailed(request.user))
```

- [ ] Step 2 — Run strategy-related tests and confirm no regressions:

```bash
cd backend && pytest stocks/tests/ -k "strategy" -v
# Expected: all previously passing tests still PASSED
```

- [ ] Step 3 — Run the full test suite to confirm nothing else broke:

```bash
cd backend && pytest stocks/tests/ -v
# Expected: all PASSED (or same pre-existing failures only)
```

---

### Task 5: Commit Part A

- [ ] Step 1 — Stage and commit:

```bash
git add backend/stocks/constants.py \
        backend/stocks/services/strategy_performance_service.py \
        backend/stocks/tests/test_constants.py \
        backend/stocks/tests/test_strategy_performance_service.py \
        backend/stocks/views/strategy.py
git commit -m "refactor(strategy): extract StrategyPerformanceService"
```

---

## Part B — Chat Streaming Decomposition

### Task 6: Extract helpers into `streaming.py`

**Files:**
- Edit: `backend/chat/streaming.py`

The full current `stream_chat()` spans lines 85–291 (207 lines). All extracted helpers stay in the same file; no new module is needed.

- [ ] Step 1 — Write failing tests first. Create `backend/chat/tests/test_streaming_helpers.py`:

```python
# backend/chat/tests/test_streaming_helpers.py
"""Unit tests for the extracted streaming helpers.

All SDK types are mocked so no real agent is invoked and no DB is touched for
pure-function tests.
"""
import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ── _empty_usage ──────────────────────────────────────────────────────────────

def test_empty_usage_returns_zero_dict():
    from chat.streaming import _empty_usage
    result = _empty_usage()
    assert result == {
        "input_tokens": 0,
        "output_tokens": 0,
        "cache_read_input_tokens": 0,
        "cache_creation_input_tokens": 0,
    }


def test_empty_usage_all_values_are_int():
    from chat.streaming import _empty_usage
    result = _empty_usage()
    assert all(isinstance(v, int) for v in result.values())


# ── _accumulate_usage ─────────────────────────────────────────────────────────

def test_accumulate_usage_adds_values():
    from chat.streaming import _accumulate_usage
    total = {"input_tokens": 10, "output_tokens": 5,
             "cache_read_input_tokens": 0, "cache_creation_input_tokens": 0}
    _accumulate_usage(total, {"input_tokens": 3, "output_tokens": 2,
                               "cache_read_input_tokens": 1, "cache_creation_input_tokens": 0})
    assert total["input_tokens"] == 13
    assert total["output_tokens"] == 7
    assert total["cache_read_input_tokens"] == 1


def test_accumulate_usage_none_is_noop():
    from chat.streaming import _accumulate_usage
    total = {"input_tokens": 5, "output_tokens": 3,
             "cache_read_input_tokens": 0, "cache_creation_input_tokens": 0}
    _accumulate_usage(total, None)
    assert total["input_tokens"] == 5


def test_accumulate_usage_handles_none_values_in_dict():
    """Individual keys with None value must be treated as 0, not raise TypeError."""
    from chat.streaming import _accumulate_usage
    total = {"input_tokens": 5, "output_tokens": 0,
             "cache_read_input_tokens": 0, "cache_creation_input_tokens": 0}
    _accumulate_usage(total, {"input_tokens": None, "output_tokens": 2,
                               "cache_read_input_tokens": None, "cache_creation_input_tokens": 0})
    assert total["input_tokens"] == 5
    assert total["output_tokens"] == 2


# ── _handle_stream_event (async generator) ────────────────────────────────────

@pytest.mark.asyncio
async def test_handle_stream_event_text_delta():
    from chat.streaming import _handle_stream_event
    msg = MagicMock()
    msg.event = {"type": "content_block_delta", "delta": {"type": "text_delta", "text": "hello"}}
    msg.parent_tool_use_id = None
    blocks: list = []
    seen: set = set()
    frames = [frame async for frame in _handle_stream_event(msg, blocks, seen)]
    assert len(frames) == 1
    parsed = json.loads(frames[0].decode().split("data: ")[1])
    assert parsed["kind"] == "text"
    assert parsed["text"] == "hello"
    assert parsed["subagent"] is None


@pytest.mark.asyncio
async def test_handle_stream_event_thinking_delta():
    from chat.streaming import _handle_stream_event
    msg = MagicMock()
    msg.event = {"type": "content_block_delta",
                 "delta": {"type": "thinking_delta", "thinking": "...reasoning..."}}
    msg.parent_tool_use_id = "parent-id"
    blocks: list = []
    seen: set = set()
    frames = [frame async for frame in _handle_stream_event(msg, blocks, seen)]
    assert len(frames) == 1
    parsed = json.loads(frames[0].decode().split("data: ")[1])
    assert parsed["kind"] == "thinking"
    assert parsed["subagent"] == "subagent"


@pytest.mark.asyncio
async def test_handle_stream_event_message_start_new_subagent():
    from chat.streaming import _handle_stream_event
    msg = MagicMock()
    msg.event = {"type": "message_start", "message": {"model": "claude-sonnet-4-5"}}
    msg.parent_tool_use_id = "tool-abc"
    blocks: list = []
    seen: set = set()
    frames = [frame async for frame in _handle_stream_event(msg, blocks, seen)]
    assert len(frames) == 1
    parsed = json.loads(frames[0].decode().split("data: ")[1])
    assert parsed["kind"] == "subagent_start"
    assert "tool-abc" in seen
    assert len(blocks) == 1


@pytest.mark.asyncio
async def test_handle_stream_event_message_start_duplicate_subagent():
    """Second message_start for the same parent must produce no frame."""
    from chat.streaming import _handle_stream_event
    msg = MagicMock()
    msg.event = {"type": "message_start", "message": {"model": "claude-sonnet-4-5"}}
    msg.parent_tool_use_id = "tool-abc"
    blocks: list = []
    seen = {"tool-abc"}  # already announced
    frames = [frame async for frame in _handle_stream_event(msg, blocks, seen)]
    assert frames == []
    assert len(blocks) == 0


# ── _handle_tool_result_blocks (async generator) ──────────────────────────────

@pytest.mark.asyncio
async def test_handle_tool_result_blocks_emits_tool_result_frame():
    from chat.streaming import _handle_tool_result_blocks
    from claude_agent_sdk import ToolResultBlock
    block = MagicMock(spec=ToolResultBlock)
    block.tool_use_id = "tool-1"
    block.content = "result text"
    block.is_error = False
    blocks: list = []
    with patch("chat.streaming._user_context") as mock_ctx:
        mock_ctx.take_cards.return_value = []
        frames = [
            frame async for frame in _handle_tool_result_blocks(
                [block], blocks, subagent_marker=None
            )
        ]
    assert len(frames) == 1
    parsed = json.loads(frames[0].decode().split("data: ")[1])
    assert parsed["kind"] == "tool_result"
    assert parsed["id"] == "tool-1"
    assert parsed["is_error"] is False
    assert parsed["text"] == "result text"


@pytest.mark.asyncio
async def test_handle_tool_result_blocks_emits_card_frames():
    from chat.streaming import _handle_tool_result_blocks
    from claude_agent_sdk import ToolResultBlock
    block = MagicMock(spec=ToolResultBlock)
    block.tool_use_id = "tool-2"
    block.content = "ok"
    block.is_error = False
    blocks: list = []
    card = {"type": "portfolio_snapshot", "data": {"x": 1}, "tool": "get_portfolio"}
    with patch("chat.streaming._user_context") as mock_ctx:
        mock_ctx.take_cards.return_value = [card]
        frames = [
            frame async for frame in _handle_tool_result_blocks(
                [block], blocks, subagent_marker=None
            )
        ]
    assert len(frames) == 2
    card_parsed = json.loads(frames[1].decode().split("data: ")[1])
    assert card_parsed["kind"] == "card"
    assert card_parsed["type"] == "portfolio_snapshot"


# ── _handle_result_message ────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_handle_result_message_yields_usage_frame():
    from chat.streaming import _handle_result_message, _empty_usage
    from claude_agent_sdk import ResultMessage
    msg = MagicMock(spec=ResultMessage)
    msg.session_id = "sdk-session-xyz"
    msg.usage = {"input_tokens": 100, "output_tokens": 50,
                 "cache_read_input_tokens": 10, "cache_creation_input_tokens": 5}
    msg.total_cost_usd = 0.002
    msg.duration_ms = 1234
    usage_total = _empty_usage()
    frame, new_session_id = await _handle_result_message(msg, usage_total, "old-session")
    parsed = json.loads(frame.decode().split("data: ")[1])
    assert parsed["input_tokens"] == 100
    assert parsed["cost_usd"] == 0.002
    assert new_session_id == "sdk-session-xyz"


@pytest.mark.asyncio
async def test_handle_result_message_preserves_old_session_id_if_none():
    from chat.streaming import _handle_result_message, _empty_usage
    from claude_agent_sdk import ResultMessage
    msg = MagicMock(spec=ResultMessage)
    msg.session_id = None
    msg.usage = None
    msg.total_cost_usd = 0.0
    msg.duration_ms = 0
    usage_total = _empty_usage()
    _frame, new_session_id = await _handle_result_message(msg, usage_total, "old-session")
    assert new_session_id == "old-session"


# ── _persist_turn ─────────────────────────────────────────────────────────────

@pytest.mark.asyncio
@pytest.mark.django_db
async def test_persist_turn_creates_chat_message(db):
    from chat.streaming import _persist_turn
    from chat.models import ChatSession
    from django.contrib.auth.models import User

    user = await User.objects.acreate(username="stream_test_user", password="pw")
    session = await ChatSession.objects.acreate(user=user, title="test")
    blocks = [{"kind": "text", "text": "Hello world", "subagent": None}]
    usage_total = {
        "input_tokens": 10, "output_tokens": 5,
        "cache_read_input_tokens": 0, "cache_creation_input_tokens": 0,
    }
    msg_id = await _persist_turn(session, blocks, usage_total, final_session_id="sdk-123")
    assert msg_id is not None
    # reload session to verify sdk_session_id was updated
    await session.arefresh_from_db()
    assert session.sdk_session_id == "sdk-123"
```

- [ ] Step 2 — Run and confirm failures:

```bash
cd backend && pytest chat/tests/test_streaming_helpers.py -v
# Expected: multiple FAILED — helpers not yet extracted
```

- [ ] Step 3 — Extract helpers into `backend/chat/streaming.py`. Insert the following functions **before** the existing `stream_chat()` definition (after `_is_subagent`). Do **not** delete anything yet:

```python
# ── extracted helpers ─────────────────────────────────────────────────────────

def _empty_usage() -> dict:
    """Return a zeroed token-usage accumulator dict."""
    return {
        "input_tokens": 0,
        "output_tokens": 0,
        "cache_read_input_tokens": 0,
        "cache_creation_input_tokens": 0,
    }


def _accumulate_usage(usage_total: dict, usage: dict | None) -> None:
    """Add *usage* values into *usage_total* in-place; None usage is a no-op."""
    if not usage:
        return
    for k in usage_total:
        usage_total[k] += int(usage.get(k, 0) or 0)


async def _handle_stream_event(
    msg: StreamEvent,
    blocks: list[dict],
    seen_subagents: set[str],
) -> AsyncIterator[bytes]:
    """Yield SSE frames for token-level streaming deltas and subagent announcements."""
    ev = msg.event or {}
    etype = ev.get("type")
    parent = getattr(msg, "parent_tool_use_id", None)
    if etype == "message_start" and parent and parent not in seen_subagents:
        seen_subagents.add(parent)
        payload = {
            "kind": "subagent_start",
            "parent": parent,
            "model": (ev.get("message") or {}).get("model"),
        }
        blocks.append(payload)
        yield _sse("subagent_start", payload)
        return
    if etype != "content_block_delta":
        return
    sub = "subagent" if parent else None
    delta = ev.get("delta") or {}
    if delta.get("type") == "text_delta" and delta.get("text"):
        yield _sse("text", {"kind": "text", "subagent": sub, "text": delta["text"]})
    elif delta.get("type") == "thinking_delta" and delta.get("thinking"):
        yield _sse("thinking", {"kind": "thinking", "subagent": sub, "text": delta["thinking"]})


async def _handle_tool_result_blocks(
    tool_result_blocks,
    blocks: list[dict],
    subagent_marker: str | None,
) -> AsyncIterator[bytes]:
    """Yield tool_result + card SSE frames for a sequence of ToolResultBlock objects."""
    for block in tool_result_blocks:
        text = _content_text(block.content)
        payload = {
            "kind": "tool_result",
            "subagent": subagent_marker,
            "id": block.tool_use_id,
            "is_error": bool(block.is_error),
            "text": text,
        }
        blocks.append(payload)
        yield _sse("tool_result", payload)
        for card in _user_context.take_cards():
            card_payload = {
                "kind": "card",
                "type": card.get("type"),
                "data": card.get("data"),
                "tool": card.get("tool"),
            }
            blocks.append(card_payload)
            yield _sse("card", card_payload)


async def _handle_result_message(
    msg: ResultMessage,
    usage_total: dict,
    final_session_id: str | None,
) -> tuple[bytes, str | None]:
    """Accumulate usage from ResultMessage and return (usage_frame, updated_session_id)."""
    if msg.session_id:
        final_session_id = msg.session_id
    _accumulate_usage(usage_total, msg.usage)
    frame = _sse(
        "usage",
        {
            "input_tokens": usage_total["input_tokens"],
            "output_tokens": usage_total["output_tokens"],
            "cache_read_input_tokens": usage_total["cache_read_input_tokens"],
            "cache_creation_input_tokens": usage_total["cache_creation_input_tokens"],
            "cost_usd": msg.total_cost_usd,
            "duration_ms": msg.duration_ms,
        },
    )
    return frame, final_session_id


async def _persist_turn(
    session: ChatSession,
    blocks: list[dict],
    usage_total: dict,
    final_session_id: str | None,
) -> str | None:
    """Persist the assistant turn to DB; return the new ChatMessage pk as a string."""
    joined_text = "\n".join(
        b["text"] for b in blocks if b.get("kind") == "text" and b.get("text")
    )

    @sync_to_async
    def _save():
        msg = ChatMessage.objects.create(
            session=session,
            role=ChatMessage.ROLE_ASSISTANT,
            text=joined_text,
            blocks=blocks,
            input_tokens=usage_total["input_tokens"],
            output_tokens=usage_total["output_tokens"],
            cache_read_tokens=usage_total["cache_read_input_tokens"],
            cache_creation_tokens=usage_total["cache_creation_input_tokens"],
        )
        if final_session_id and session.sdk_session_id != final_session_id:
            session.sdk_session_id = final_session_id
            session.save(update_fields=["sdk_session_id", "updated_at"])
        else:
            session.save(update_fields=["updated_at"])
        return str(msg.id)

    return await _save()
```

- [ ] Step 4 — Run helper tests and confirm they pass:

```bash
cd backend && pytest chat/tests/test_streaming_helpers.py -v
# Expected: all PASSED
```

---

### Task 7: Slim `stream_chat()` to ≤30 lines

**Files:**
- Edit: `backend/chat/streaming.py`

- [ ] Step 1 — Replace the body of `stream_chat()` with the slimmed dispatcher. The original function runs from line 85 to line 291; replace it in full:

```python
async def stream_chat(
    *, user, session: ChatSession, prompt: str
) -> AsyncIterator[bytes]:
    """Stream one assistant turn over SSE and persist the assistant message at end."""
    _user_context.reset_cards()
    blocks: list[dict] = []
    seen_subagents: set[str] = set()
    final_session_id: str | None = session.sdk_session_id or None
    usage_total = _empty_usage()

    yield _sse("assistant_start", {"session_id": str(session.id)})

    try:
        async for msg in run_chat_session(
            user=user, sdk_session_id=session.sdk_session_id, prompt=prompt
        ):
            if isinstance(msg, StreamEvent):
                async for frame in _handle_stream_event(msg, blocks, seen_subagents):
                    yield frame
                continue

            if isinstance(msg, AssistantMessage):
                final_session_id, frames = await _process_assistant_message(
                    msg, blocks, seen_subagents, usage_total, final_session_id
                )
                for frame in frames:
                    yield frame

            elif isinstance(msg, UserMessage):
                subagent_marker = "subagent" if _is_subagent(msg) else None
                result_blocks = [b for b in msg.content if isinstance(b, ToolResultBlock)]
                async for frame in _handle_tool_result_blocks(result_blocks, blocks, subagent_marker):
                    yield frame

            elif isinstance(msg, ResultMessage):
                frame, final_session_id = await _handle_result_message(
                    msg, usage_total, final_session_id
                )
                yield frame

        yield _sse("assistant_end", {})

    except Exception:
        import uuid as _uuid
        error_id = _uuid.uuid4().hex[:8]
        log.exception("chat stream error [%s]", error_id)
        yield _sse("error", {"message": f"An internal error occurred (ref {error_id})."})

    persisted_message_id = None
    try:
        persisted_message_id = await _persist_turn(session, blocks, usage_total, final_session_id)
    except Exception:
        log.exception("failed to persist assistant turn")

    yield _sse("done", {
        "session_id": str(session.id),
        "sdk_session_id": final_session_id,
        "message_id": persisted_message_id,
    })
```

You also need to add a small `_process_assistant_message` helper (extracted from the original `AssistantMessage` branch) to keep `stream_chat` under 30 lines. Insert it alongside the other helpers:

```python
async def _process_assistant_message(
    msg: AssistantMessage,
    blocks: list[dict],
    seen_subagents: set[str],
    usage_total: dict,
    final_session_id: str | None,
) -> tuple[str | None, list[bytes]]:
    """Process an AssistantMessage: update usage/session, collect blocks, build frames."""
    if msg.session_id:
        final_session_id = msg.session_id
    _accumulate_usage(usage_total, msg.usage)
    subagent_marker = "subagent" if _is_subagent(msg) else None
    frames: list[bytes] = []
    if _is_subagent(msg) and msg.parent_tool_use_id not in seen_subagents:
        seen_subagents.add(msg.parent_tool_use_id)
        payload = {"kind": "subagent_start", "parent": msg.parent_tool_use_id, "model": msg.model}
        blocks.append(payload)
        frames.append(_sse("subagent_start", payload))
    for block in msg.content:
        if isinstance(block, TextBlock):
            blocks.append({"kind": "text", "subagent": subagent_marker, "text": block.text})
        elif isinstance(block, ThinkingBlock):
            blocks.append({"kind": "thinking", "subagent": subagent_marker, "text": block.thinking})
        elif isinstance(block, ToolUseBlock):
            _user_context.take_cards()
            payload = {"kind": "tool_use", "subagent": subagent_marker,
                       "tool": block.name, "input": block.input, "id": block.id}
            blocks.append(payload)
            frames.append(_sse("tool_use", payload))
        elif isinstance(block, ToolResultBlock):
            # ToolResultBlock in AssistantMessage: collect frames synchronously
            text = _content_text(block.content)
            payload = {"kind": "tool_result", "subagent": subagent_marker,
                       "id": block.tool_use_id, "is_error": bool(block.is_error), "text": text}
            blocks.append(payload)
            frames.append(_sse("tool_result", payload))
            for card in _user_context.take_cards():
                card_payload = {"kind": "card", "type": card.get("type"),
                                "data": card.get("data"), "tool": card.get("tool")}
                blocks.append(card_payload)
                frames.append(_sse("card", card_payload))
    return final_session_id, frames
```

- [ ] Step 2 — Verify line count of `stream_chat` body does not exceed 30:

```bash
grep -n "async def stream_chat\|async def _" backend/chat/streaming.py
# Manually count lines between the def line and the next top-level def
```

---

### Task 8: Run all chat tests

- [ ] Step 1 — Run the full chat test suite:

```bash
cd backend && pytest chat/tests/ -v
# Expected: all PASSED — no regressions in test_saved_analyses.py
```

- [ ] Step 2 — Run the helper-specific tests:

```bash
cd backend && pytest chat/tests/test_streaming_helpers.py -v
# Expected: all PASSED
```

---

### Task 9: Commit Part B

- [ ] Step 1 — Stage and commit:

```bash
git add backend/chat/streaming.py \
        backend/chat/tests/test_streaming_helpers.py
git commit -m "refactor(chat): decompose stream_chat into focused async helpers"
```

---

## Completion Checklist

- [ ] `PROFIT_FACTOR_DEFAULT = 999.0` in `stocks/constants.py`
- [ ] `backend/stocks/services/strategy_performance_service.py` — 8 pure functions, each ≤30 lines
- [ ] `backend/stocks/tests/test_strategy_performance_service.py` — full coverage of all helpers
- [ ] `performance_detailed()` in `strategy.py` — ≤30-line delegator
- [ ] `pytest stocks/tests/ -k "strategy"` — green
- [ ] Commit: `refactor(strategy): extract StrategyPerformanceService`
- [ ] `_empty_usage`, `_accumulate_usage`, `_handle_stream_event`, `_handle_tool_result_blocks`, `_handle_result_message`, `_persist_turn`, `_process_assistant_message` extracted in `streaming.py`
- [ ] `stream_chat()` body ≤30 lines
- [ ] `backend/chat/tests/test_streaming_helpers.py` — all tests pass
- [ ] `pytest chat/tests/ -v` — green, no regressions
- [ ] Commit: `refactor(chat): decompose stream_chat into focused async helpers`
