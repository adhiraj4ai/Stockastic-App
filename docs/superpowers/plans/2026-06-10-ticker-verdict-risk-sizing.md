# Ticker Verdict + Position-Aware Risk Sizing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the plan engine's confluence/freshness/analogs/catalysts on the ticker page via an on-demand per-symbol verdict endpoint, and add whole-share risk sizing with a draft-TradePlan bridge.

**Architecture:** New `stocks/services/ticker_verdict.py` composes the existing plan-engine services (`confluence`, `analogs`, `catalysts`, `rank_opportunities(symbols=[X])`) into a per-symbol verdict, cached 15 min per symbol at the view layer with the per-user `sizing` block attached outside the cache. New pure `stocks/services/position_sizing.py` powers sizing in both the verdict and the plan overlay. Frontend: `TickerVerdict` panel + zone badges in `TickerSignals`, sizing + Draft-trade-plan on `PickCard`, via a shared `draftTradePlan` helper that posts to the existing nested-legs trade-plans API.

**Tech Stack:** Django 5 + DRF + django cache (backend, pytest), Next.js 15 + shadcn/ui + sonner + vitest (frontend).

**Spec:** `docs/superpowers/specs/2026-06-10-ticker-verdict-risk-sizing-design.md`

---

## Established facts (verified by code scouts — trust these)

- **TradePlan API**: `POST /api/stocks/trade-plans/` (router `trade-plans`, `stocks/urls.py:14`). Nested writable legs. Payload: `{account: id|null, ticker, thesis, risk_budget_pct, target_price|null, legs: [{leg_number, price_target, allocation_pct, stop_loss_price, notes?}]}`. Validation: ≥1 leg, allocations sum to exactly 100, `stop_loss_price < price_target` per leg.
- **PortfolioAccount** fields: `balance` Decimal(12,2), `default_risk_percentage` Decimal(4,2) default 2.00, `account_type` (`LIVE`/`PAPER`). Existing default-account convention: `.first()`.
- **`rank_opportunities(symbols=[X], limit=N)`** genuinely restricts the scan to those symbols (strategy loop + engine-episode filter).
- **`_compute_current_acc_signals(sector_mapping)`** (`stocks/views/sector_rotation.py:62`) expects a **`{symbol: sector}`** dict (it does `all_symbols = list(sector_mapping.keys())` and `sector = sector_mapping.get(sym)`), and returns `{sector: {acc_intensity, ...}}`.
- **BUG (fix in Task 1)**: `stocks/services/daily_plan.py::_sector_intensities` builds `{sector: [symbols]}` and passes it — so the loaders receive sector names as symbols, frames come back empty, and the function silently returns `{}` (sector component neutral for everything).
- **`DailyStockPrice` is managed=False** — its table doesn't exist in the test DB. All price access in tests goes through patchable indirections (`_load_price_df`-style), per the existing plan test suite. **Check `Company`'s Meta before writing tests that create Companies**; if it is also unmanaged, patch the query instead (instructions inline in Task 1).
- Frontend: ticker page is `src/app/(authenticated)/ticker/[ticker]/page.tsx`; `TickerSignals` lives in the `signals` TabsContent receiving `{symbol, currentPrice, intelligence, fundamental}` and fetches its own data in a `Promise.all`. Toasts via `import { toast } from 'sonner'`. The existing create-plan form (`src/components/CreateTradePlanForm.tsx:70-82`) posts string decimals (e.g. `"2.00"`, allocation `"100"`).
- Backend tests: `cd /Users/jugalraj/Documents/Projects/Stockastic/backend && .venv/bin/python -m pytest ...` (bare python lacks talib). Frontend: `cd frontend && npx vitest run ...`; known pre-existing failure: `ChatInterface.test.tsx` (1 test).

## File structure

**Backend — create:** `stocks/services/position_sizing.py`, `stocks/services/ticker_verdict.py`, `stocks/views/ticker_verdict.py`, `tests/test_position_sizing_service.py`, `tests/test_ticker_verdict.py`.
**Backend — modify:** `stocks/services/daily_plan.py` (bug fix), `stocks/views/plan.py` (overlay sizing), `stocks/views/__init__.py`, `stocks/urls.py`, `tests/test_daily_plan.py`, `tests/test_plan_api.py`.
**Frontend — create:** `src/lib/draftTradePlan.ts`, `src/components/ticker/TickerVerdict.tsx`, `src/__tests__/unit/TickerVerdict.test.tsx`, `src/__tests__/unit/DraftTradePlan.test.ts`.
**Frontend — modify:** `src/app/(authenticated)/ticker/[ticker]/page.tsx`, `src/components/ticker/TickerSignals.tsx`, `src/components/plan/PickCard.tsx`, `src/app/(authenticated)/plan/page.tsx`, `src/__tests__/unit/PlanPickCard.test.tsx`.

---

### Task 1: Fix the sector-intensity mapping bug

**Files:**
- Modify: `backend/stocks/services/daily_plan.py` (`_sector_intensities`, ~line 38)
- Test: `backend/tests/test_daily_plan.py` (append)

- [ ] **Step 1: Write the failing regression test** (append to `tests/test_daily_plan.py`; `pytest`, `patch` already imported there)

```python
@pytest.mark.django_db
class TestSectorIntensities:
    @patch("stocks.views.sector_rotation._compute_current_acc_signals")
    def test_passes_symbol_keyed_mapping(self, mock_compute):
        from stocks.models import Company
        from stocks.services.daily_plan import _sector_intensities
        Company.objects.create(symbol="NABIL", name="Nabil Bank", sector="Banking")
        mock_compute.return_value = {"Banking": {"acc_intensity": 5.2}}
        out = _sector_intensities()
        called_mapping = mock_compute.call_args[0][0]
        # Regression: the helper used to pass {sector: [symbols]}, which the
        # downstream function reads as symbol keys → empty frames → {}.
        assert called_mapping == {"NABIL": "Banking"}
        assert out == {"NABIL": 5.2}
```

PRE-CHECK: open `stocks/models/market.py` and confirm whether `Company` has `managed = False`. If it does, `Company.objects.create` will fail in the test DB — replace the Company creation + query by patching the queryset call:

```python
        with patch("stocks.services.daily_plan.Company") as mock_company:
            mock_company.objects.exclude.return_value.values_list.return_value = [("NABIL", "Banking")]
            ...
```

(For that fallback, move the `from stocks.models import Company` import in `_sector_intensities` to a module-level `from stocks.models import Company` in `daily_plan.py` so the patch target exists — note which path you took in your report.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/jugalraj/Documents/Projects/Stockastic/backend && .venv/bin/python -m pytest tests/test_daily_plan.py -v -k SectorIntensities`
Expected: FAIL — `called_mapping` is `{"Banking": ["NABIL"]}` (sector-keyed), `out == {}` or `{"NABIL": None}`.

- [ ] **Step 3: Fix the implementation** — replace `_sector_intensities` in `stocks/services/daily_plan.py`:

```python
def _sector_intensities():
    """symbol → sector acc_intensity, via the sector-rotation helper."""
    from stocks.models import Company
    from stocks.views.sector_rotation import _compute_current_acc_signals
    symbol_to_sector = {
        symbol: sector
        for symbol, sector in Company.objects.exclude(sector="").values_list("symbol", "sector")
    }
    if not symbol_to_sector:
        return {}
    try:
        per_sector = _compute_current_acc_signals(symbol_to_sector)
    except Exception:
        logger.exception("sector intensity computation failed; using neutral")
        return {}
    return {
        symbol: (per_sector.get(sector) or {}).get("acc_intensity")
        for symbol, sector in symbol_to_sector.items()
    }
```

(The `defaultdict` import stays — it's used elsewhere in the module.)

- [ ] **Step 4: Run tests**

Run: `.venv/bin/python -m pytest tests/test_daily_plan.py -v`
Expected: all pass (12 prior + 1 new).

- [ ] **Step 5: Commit**

```bash
git add stocks/services/daily_plan.py tests/test_daily_plan.py
git commit -m "fix(plan): sector intensities passed sector-keyed mapping, silently neutralizing the sector component"
```

---

### Task 2: Position-sizing service

**Files:**
- Create: `backend/stocks/services/position_sizing.py`
- Test: `backend/tests/test_position_sizing_service.py`

- [ ] **Step 1: Write the failing tests** — create `tests/test_position_sizing_service.py`:

```python
import pytest
from decimal import Decimal
from stocks.services.position_sizing import size_position, default_account_for, sizing_map_for_user


class TestSizePosition:
    def test_happy_path(self):
        # 1,000,000 balance, 1% risk = 10,000 risk; entry 612, stop 562 → 50/share → 200 shares
        out = size_position(balance=1_000_000, risk_pct=1.0, entry=612.0, stop=562.0)
        assert out == {
            "shares": 200,
            "risk_amount": 10000.0,
            "position_value": 122400.0,
            "risk_pct": 1.0,
            "entry": 612.0,
            "stop": 562.0,
        }

    def test_floors_to_whole_shares(self):
        out = size_position(balance=100_000, risk_pct=2.0, entry=613.0, stop=600.0)
        assert out["shares"] == 153  # 2000 / 13 = 153.8 → 153

    def test_unsizeable_cases(self):
        assert size_position(100_000, 2.0, entry=600.0, stop=600.0) is None  # zero risk/share
        assert size_position(100_000, 2.0, entry=600.0, stop=610.0) is None  # stop above entry
        assert size_position(100_000, 2.0, entry=600.0, stop=None) is None
        assert size_position(0, 2.0, entry=600.0, stop=590.0) is None
        assert size_position(100_000, 0, entry=600.0, stop=590.0) is None
        assert size_position(1_000, 1.0, entry=600.0, stop=400.0) is None    # < 1 share


@pytest.mark.django_db
class TestDefaultAccountFor:
    def test_prefers_live_account(self, create_user):
        from stocks.models import PortfolioAccount
        user = create_user(username="s1", password="x")
        PortfolioAccount.objects.create(user=user, name="Paper", account_type="PAPER",
                                        balance=Decimal("500000"))
        live = PortfolioAccount.objects.create(user=user, name="Live", account_type="LIVE",
                                               balance=Decimal("1000000"))
        assert default_account_for(user).id == live.id

    def test_falls_back_to_first_then_none(self, create_user):
        from stocks.models import PortfolioAccount
        u1 = create_user(username="s2", password="x")
        paper = PortfolioAccount.objects.create(user=u1, name="Paper", account_type="PAPER",
                                                balance=Decimal("500000"))
        assert default_account_for(u1).id == paper.id
        u2 = create_user(username="s3", password="x")
        assert default_account_for(u2) is None


@pytest.mark.django_db
class TestSizingMapForUser:
    def test_maps_picks_with_entry_and_stop(self, create_user):
        from stocks.models import PortfolioAccount
        user = create_user(username="s4", password="x")
        PortfolioAccount.objects.create(user=user, name="Live", account_type="LIVE",
                                        balance=Decimal("1000000"),
                                        default_risk_percentage=Decimal("1.00"))
        picks = [
            {"symbol": "NABIL", "entry": {"latest_close": 612.0, "status": "IN_ZONE", "price": 610.0},
             "targets": {"tp1": 700.0, "sl": 562.0}},
            {"symbol": "NOSL", "entry": {"latest_close": 100.0, "status": "IN_ZONE", "price": 100.0},
             "targets": {"tp1": 120.0, "sl": None}},
        ]
        out = sizing_map_for_user(user, picks)
        assert out["NABIL"]["shares"] == 200
        assert out["NABIL"]["account_name"] == "Live"
        assert "NOSL" not in out  # no stop → unsizeable

    def test_empty_without_account(self, create_user):
        user = create_user(username="s5", password="x")
        assert sizing_map_for_user(user, [{"symbol": "X"}]) == {}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/test_position_sizing_service.py -v`
Expected: FAIL with `ModuleNotFoundError`.

- [ ] **Step 3: Implement** — create `stocks/services/position_sizing.py`:

```python
"""Whole-share position sizing from account risk budget (NEPSE trades integer shares)."""
import math


def size_position(balance, risk_pct, entry, stop):
    """Risk-budget sizing → dict or None when unsizeable.

    shares = floor(balance * risk_pct% / (entry - stop)); None if < 1 share,
    missing/inverted stop, or non-positive balance/risk.
    """
    if not balance or not risk_pct or entry is None or stop is None:
        return None
    balance, risk_pct, entry, stop = float(balance), float(risk_pct), float(entry), float(stop)
    if balance <= 0 or risk_pct <= 0:
        return None
    per_share_risk = entry - stop
    if per_share_risk <= 0:
        return None
    risk_amount = balance * risk_pct / 100.0
    shares = math.floor(risk_amount / per_share_risk)
    if shares < 1:
        return None
    return {
        "shares": shares,
        "risk_amount": round(risk_amount, 2),
        "position_value": round(shares * entry, 2),
        "risk_pct": risk_pct,
        "entry": entry,
        "stop": stop,
    }


def default_account_for(user):
    """The user's sizing account: first LIVE account, else first account, else None."""
    from stocks.models import PortfolioAccount
    qs = PortfolioAccount.objects.filter(user=user).order_by("id")
    return qs.filter(account_type="LIVE").first() or qs.first()


def _sizing_entry(entry_block):
    """Spec: size at current close when IN_ZONE, else at the signal entry price."""
    if not entry_block:
        return None
    if entry_block.get("status") == "IN_ZONE":
        return entry_block.get("latest_close")
    return entry_block.get("price")


def sizing_block_for(account, entry_block, stop):
    """One pick/verdict sizing dict (adds account fields) or None."""
    if account is None:
        return None
    sized = size_position(account.balance, account.default_risk_percentage,
                          _sizing_entry(entry_block), stop)
    if sized is None:
        return None
    sized["account_id"] = account.id
    sized["account_name"] = account.name
    return sized


def sizing_map_for_user(user, picks):
    """{symbol: sizing block} for plan picks that are sizeable for this user."""
    account = default_account_for(user)
    if account is None:
        return {}
    out = {}
    for pick in picks:
        block = sizing_block_for(account, pick.get("entry"), (pick.get("targets") or {}).get("sl"))
        if block:
            out[pick["symbol"]] = block
    return out
```

- [ ] **Step 4: Run tests**

Run: `.venv/bin/python -m pytest tests/test_position_sizing_service.py -v`
Expected: all PASS. (If `PortfolioAccount` field for risk is named differently, you were told wrong — it is `default_risk_percentage`; verify in `stocks/models/portfolio.py:14` and keep the model's spelling.)

- [ ] **Step 5: Commit**

```bash
git add stocks/services/position_sizing.py tests/test_position_sizing_service.py
git commit -m "feat(sizing): whole-share risk sizing service"
```

---

### Task 3: Ticker verdict service

**Files:**
- Create: `backend/stocks/services/ticker_verdict.py`
- Test: `backend/tests/test_ticker_verdict.py`

- [ ] **Step 1: Write the failing tests** — create `tests/test_ticker_verdict.py`:

```python
import pytest
import numpy as np
import pandas as pd
from datetime import date
from decimal import Decimal
from unittest.mock import patch


def _price_df(closes, start="2026-04-01"):
    idx = pd.bdate_range(start, periods=len(closes))
    s = pd.Series(closes, index=idx, dtype=float)
    return pd.DataFrame({"Open": s, "High": s + 2, "Low": s - 2, "Close": s,
                         "Volume": np.full(len(s), 1000.0)}, index=idx)


def _episode(**kw):
    from stocks.models import SignalEpisode
    defaults = dict(source="SMART_MONEY", producer_key="SMART_MONEY", symbol="NABIL",
                    direction="BUY", start_date=date(2026, 6, 10),
                    last_signal_date=date(2026, 6, 10), entry_price=Decimal("100"),
                    target_price=Decimal("120"), stop_loss_price=Decimal("90"),
                    entry_strength=80,
                    metadata={"inst_net_5d": 150000, "markup_percent": -2.0})
    defaults.update(kw)
    return SignalEpisode.objects.create(**defaults)


@pytest.mark.django_db
class TestBuildVerdict:
    @patch("stocks.services.ticker_verdict.analog_stats", return_value={"n": 8, "fwd_3d_median_pct": 1.5})
    @patch("stocks.services.ticker_verdict.upcoming_catalysts",
           return_value=[{"symbol": "NABIL", "type": "BOOK_CLOSE", "date": "2026-06-18",
                          "days_away": 6, "detail": "x"},
                         {"symbol": "OTHER", "type": "BOOK_CLOSE", "date": "2026-06-15",
                          "days_away": 3, "detail": "y"}])
    @patch("stocks.services.ticker_verdict._sector_intensity_for", return_value=12.4)
    @patch("stocks.services.ticker_verdict.rank_opportunities")
    @patch("stocks.services.ticker_verdict._load_price_df")
    def test_full_verdict(self, mock_prices, mock_opps, *_):
        from stocks.services.ticker_verdict import build_verdict
        mock_prices.return_value = _price_df([100.0] * 30)
        mock_opps.return_value = {"opportunities": [
            {"symbol": "NABIL", "trust": "CONFIRMED", "pvalue": 0.02, "edge": 0.15, "score": 0.1},
            {"symbol": "NABIL", "trust": "DIVERGENT", "pvalue": 0.01, "edge": 0.5, "score": -1.0},
        ], "exits": []}
        for src in ("SMART_MONEY", "ICHIMOKU", "VOLUME_BREAKOUT"):
            _episode(source=src, producer_key=src)
        _episode(source="DISTRIBUTION_ALERT", producer_key="DISTRIBUTION_ALERT",
                 direction="SELL", entry_price=Decimal("100"), metadata={})

        v = build_verdict("NABIL")

        assert v["symbol"] == "NABIL"
        # 0.35*engine + 0.35*opp + 0.20*acc + 0.10*sector
        # engine: 3 buys - 1 conflict = 2 → 50; opp CONFIRMED sig → 100; acc → 100; sector 12.4 → 100
        assert v["confluence_score"] == round(0.35 * 50 + 0.35 * 100 + 0.20 * 100 + 0.10 * 100)
        assert v["components"]["opportunity"]["trust"] == "CONFIRMED"  # DIVERGENT row filtered
        assert v["entry"]["status"] == "IN_ZONE"
        assert v["targets"] == {"tp1": 120.0, "sl": 90.0}
        assert len(v["episodes"]) == 4
        buy_row = next(e for e in v["episodes"] if e["source"] == "SMART_MONEY")
        assert buy_row["status"] == "IN_ZONE" and buy_row["direction"] == "BUY"
        assert v["analog"]["n"] == 8
        assert v["catalyst"]["type"] == "BOOK_CLOSE" and v["catalyst"]["symbol"] == "NABIL"
        import json
        json.dumps(v)  # payload must be JSON-serializable

    @patch("stocks.services.ticker_verdict.analog_stats", return_value=None)
    @patch("stocks.services.ticker_verdict.upcoming_catalysts", return_value=[])
    @patch("stocks.services.ticker_verdict._sector_intensity_for", return_value=None)
    @patch("stocks.services.ticker_verdict.rank_opportunities",
           return_value={"opportunities": [], "exits": []})
    @patch("stocks.services.ticker_verdict._load_price_df")
    def test_no_active_buy_episodes(self, mock_prices, *_):
        from stocks.services.ticker_verdict import build_verdict
        mock_prices.return_value = _price_df([100.0] * 30)
        v = build_verdict("EMPTY")
        assert v["entry"] is None
        assert v["episodes"] == []
        assert v["confluence_score"] == round(0.10 * 50)  # only neutral sector contributes

    @patch("stocks.services.ticker_verdict.analog_stats", return_value=None)
    @patch("stocks.services.ticker_verdict.upcoming_catalysts", return_value=[])
    @patch("stocks.services.ticker_verdict._sector_intensity_for", return_value=None)
    @patch("stocks.services.ticker_verdict.rank_opportunities",
           return_value={"opportunities": [], "exits": []})
    @patch("stocks.services.ticker_verdict._load_price_df", return_value=pd.DataFrame())
    def test_no_price_data(self, *_):
        from stocks.services.ticker_verdict import build_verdict
        _episode(symbol="NOPX", producer_key="SMART_MONEY")
        v = build_verdict("NOPX")
        assert v["entry"] is None and v["episodes"] == []
```

NOTE for `test_no_active_buy_episodes`: sector None → `sector_component(None)` is 50 → score `round(0.1*50)=5`. If your implementation computes engine/opp/acc honestly as 0, that is the expected value.

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/test_ticker_verdict.py -v`
Expected: `ModuleNotFoundError`.

- [ ] **Step 3: Implement** — create `stocks/services/ticker_verdict.py`:

```python
"""On-demand per-symbol verdict: the plan engine's confluence/freshness/analogs/
catalysts for ANY symbol, for the ticker page. Sizing is attached by the view
per request (it is user-specific and must stay out of the shared cache)."""
import logging
from datetime import date

import pandas as pd

from stocks.services.analogs import analog_stats
from stocks.services.catalysts import upcoming_catalysts
from stocks.services.confluence import confluence_score, entry_status
from stocks.services.daily_plan import SELL_SIDE_SOURCES, _signal_age_trading_days
from stocks.services.opportunity_engine import rank_opportunities

logger = logging.getLogger(__name__)


def _load_price_df(symbol):
    """Patchable indirection (same pattern as daily_plan/analogs)."""
    from stocks.services.backtest_harness import load_price_df
    return load_price_df(symbol)


def _sector_intensity_for(symbol):
    """The symbol's sector acc_intensity, or None. Reuses the sector-rotation
    helper restricted to one sector's peers (keeps load bounded)."""
    from stocks.models import Company
    from stocks.views.sector_rotation import _compute_current_acc_signals
    company = Company.objects.filter(symbol=symbol).first()
    if company is None or not company.sector:
        return None
    peers = Company.objects.filter(sector=company.sector).values_list("symbol", flat=True)
    mapping = {s: company.sector for s in peers}
    try:
        per_sector = _compute_current_acc_signals(mapping)
    except Exception:
        logger.exception("sector intensity failed for %s; using neutral", symbol)
        return None
    return (per_sector.get(company.sector) or {}).get("acc_intensity")


def _best_opportunity_row(symbol):
    """Best non-DIVERGENT opportunity row for the symbol, or None."""
    try:
        result = rank_opportunities(symbols=[symbol], limit=10)
    except Exception:
        logger.exception("rank_opportunities failed for %s", symbol)
        return None
    best = None
    for row in result.get("opportunities", []):
        if row.get("trust") == "DIVERGENT":
            continue
        if best is None or (row.get("score") or 0) > (best.get("score") or 0):
            best = row
    return best


def build_verdict(symbol):
    """JSON-serializable verdict dict for one symbol (no user data — cacheable)."""
    from stocks.models import SignalEpisode

    symbol = symbol.upper()
    price_df = _load_price_df(symbol)
    has_prices = price_df is not None and not price_df.empty

    active = list(SignalEpisode.objects.filter(end_date__isnull=True, symbol=symbol))
    buy_eps = [e for e in active
               if e.direction == "BUY" and e.source not in SELL_SIDE_SOURCES]
    sell_sources = {e.source for e in active
                    if not (e.direction == "BUY" and e.source not in SELL_SIDE_SOURCES)}

    episodes = []
    if has_prices:
        for ep in active:
            age = _signal_age_trading_days(price_df, ep.last_signal_date)
            status, _, _ = entry_status(ep.entry_price, age, price_df)
            episodes.append({
                "source": ep.source,
                "direction": ep.direction,
                "entry_price": float(ep.entry_price),
                "strength": ep.entry_strength,
                "age_days": age,
                "status": status,
                "last_signal_date": ep.last_signal_date.isoformat(),
            })

    opp_row = _best_opportunity_row(symbol)
    score, components = confluence_score(
        buy_sources={e.source for e in buy_eps},
        sell_sources=sell_sources,
        opportunity_row=opp_row,
        episode_metadatas=[e.metadata for e in buy_eps],
        sector_intensity=_sector_intensity_for(symbol),
    )

    entry = None
    targets = {"tp1": None, "sl": None}
    if buy_eps and has_prices:
        anchor = max(buy_eps, key=lambda e: e.last_signal_date)
        age = _signal_age_trading_days(price_df, anchor.last_signal_date)
        status, zone_low, zone_high = entry_status(anchor.entry_price, age, price_df)
        entry = {
            "price": float(anchor.entry_price),
            "zone_low": round(zone_low, 2),
            "zone_high": round(zone_high, 2),
            "status": status,
            "last_signal_age_days": age,
            "latest_close": float(price_df["Close"].iloc[-1]),
        }
        targets = {
            "tp1": float(anchor.target_price) if anchor.target_price else None,
            "sl": float(anchor.stop_loss_price) if anchor.stop_loss_price else None,
        }

    catalyst = next((c for c in upcoming_catalysts() if c["symbol"] == symbol), None)

    return {
        "symbol": symbol,
        "as_of": date.today().isoformat(),
        "confluence_score": score,
        "components": components,
        "entry": entry,
        "targets": targets,
        "episodes": episodes,
        "analog": analog_stats(symbol) if has_prices else None,
        "catalyst": catalyst,
    }
```

NOTE on `as_of`/`date.today()`: fine here (plain service, not a Workflow script).

- [ ] **Step 4: Run tests**

Run: `.venv/bin/python -m pytest tests/test_ticker_verdict.py -v`
Expected: 3 passed. If `test_no_active_buy_episodes` disagrees on the exact score, recompute by hand from `confluence.WEIGHTS` and fix the IMPLEMENTATION if it deviates from the plan-builder semantics (the test value follows the weights).

- [ ] **Step 5: Commit**

```bash
git add stocks/services/ticker_verdict.py tests/test_ticker_verdict.py
git commit -m "feat(verdict): per-symbol verdict service composing the plan engine"
```

---

### Task 4: Verdict API endpoint (cache + per-request sizing)

**Files:**
- Create: `backend/stocks/views/ticker_verdict.py`
- Modify: `backend/stocks/views/__init__.py`, `backend/stocks/urls.py`
- Test: `backend/tests/test_ticker_verdict.py` (append)

- [ ] **Step 1: Write the failing tests** (append to `tests/test_ticker_verdict.py`)

```python
@pytest.mark.django_db
class TestTickerVerdictAPI:
    def _fake_verdict(self, symbol="NABIL"):
        return {"symbol": symbol, "as_of": "2026-06-10", "confluence_score": 81,
                "components": {}, "episodes": [],
                "entry": {"price": 100.0, "zone_low": 96.0, "zone_high": 104.0,
                          "status": "IN_ZONE", "last_signal_age_days": 1,
                          "latest_close": 101.0},
                "targets": {"tp1": 120.0, "sl": 90.0}, "analog": None, "catalyst": None}

    def test_returns_verdict_with_sizing(self, auth_client):
        from decimal import Decimal as D
        from django.contrib.auth.models import User
        from django.core.cache import cache
        from stocks.models import PortfolioAccount
        cache.clear()
        user = User.objects.get(username="testuser")
        PortfolioAccount.objects.create(user=user, name="Live", account_type="LIVE",
                                        balance=D("1000000"),
                                        default_risk_percentage=D("1.00"))
        with patch("stocks.views.ticker_verdict.build_verdict",
                   return_value=self._fake_verdict()) as mock_build:
            resp = auth_client.get("/api/stocks/ticker-verdict/NABIL/")
        assert resp.status_code == 200
        data = resp.json()
        assert data["confluence_score"] == 81
        # entry IN_ZONE → sized at latest_close 101; 10000 / (101-90) = 909
        assert data["sizing"]["shares"] == 909
        assert data["sizing"]["account_name"] == "Live"
        mock_build.assert_called_once()

    def test_cache_hit_skips_recompute_but_not_sizing(self, auth_client):
        from django.core.cache import cache
        cache.clear()
        with patch("stocks.views.ticker_verdict.build_verdict",
                   return_value=self._fake_verdict()) as mock_build:
            auth_client.get("/api/stocks/ticker-verdict/NABIL/")
            resp2 = auth_client.get("/api/stocks/ticker-verdict/NABIL/")
        assert mock_build.call_count == 1  # second call served from cache
        assert resp2.json()["sizing"] is None  # testuser has no account → sizing per-request

    def test_requires_auth(self, api_client):
        resp = api_client.get("/api/stocks/ticker-verdict/NABIL/")
        assert resp.status_code in (401, 403)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/test_ticker_verdict.py -v -k API`
Expected: 404s (route missing).

- [ ] **Step 3: Implement** — create `stocks/views/ticker_verdict.py`:

```python
from django.core.cache import cache
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from ..services.ticker_verdict import build_verdict
from ..services.position_sizing import default_account_for, sizing_block_for

CACHE_TTL = 900  # 15 min — verdict is symbol-level; sizing is attached per request


class TickerVerdictView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, symbol):
        symbol = symbol.upper()
        cache_key = f"ticker_verdict:{symbol}"
        verdict = cache.get(cache_key)
        if verdict is None:
            verdict = build_verdict(symbol)
            cache.set(cache_key, verdict, CACHE_TTL)
        data = dict(verdict)  # don't mutate the cached dict
        data["sizing"] = sizing_block_for(
            default_account_for(request.user),
            verdict.get("entry"),
            (verdict.get("targets") or {}).get("sl"),
        )
        return Response(data)
```

Modify `stocks/views/__init__.py` — add `from . import ticker_verdict`.
Modify `stocks/urls.py` — add `ticker_verdict` to the views import list and, near the plan routes:

```python
path('ticker-verdict/<str:symbol>/', ticker_verdict.TickerVerdictView.as_view(), name='ticker_verdict'),
```

- [ ] **Step 4: Run tests**

Run: `.venv/bin/python -m pytest tests/test_ticker_verdict.py -v`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add stocks/views/ticker_verdict.py stocks/views/__init__.py stocks/urls.py tests/test_ticker_verdict.py
git commit -m "feat(verdict): cached ticker-verdict endpoint with per-request sizing"
```

---

### Task 5: Plan overlay sizing map

**Files:**
- Modify: `backend/stocks/views/plan.py` (PlanTodayView.get)
- Test: `backend/tests/test_plan_api.py` (append)

- [ ] **Step 1: Write the failing test** (append to `tests/test_plan_api.py`; add `from decimal import Decimal` to its imports if missing)

```python
    def test_today_overlay_includes_sizing_for_picks(self, auth_client):
        from django.contrib.auth.models import User
        from stocks.models import DailyTradingPlan, PortfolioAccount
        user = User.objects.get(username="testuser")
        PortfolioAccount.objects.create(user=user, name="Live", account_type="LIVE",
                                        balance=Decimal("1000000"),
                                        default_risk_percentage=Decimal("1.00"))
        DailyTradingPlan.objects.create(
            date=date(2026, 6, 12), regime="RISK_ON",
            payload={"picks": [{"symbol": "NABIL",
                                "entry": {"latest_close": 101.0, "status": "IN_ZONE",
                                          "price": 100.0},
                                "targets": {"tp1": 120.0, "sl": 90.0}}],
                     "watch": [], "exits": [], "catalysts": [], "market_context": {}},
        )
        resp = auth_client.get("/api/stocks/plan/today/")
        assert resp.status_code == 200
        sizing = resp.json()["overlay"]["sizing"]
        assert sizing["NABIL"]["shares"] == 909  # 10000 / (101 - 90)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_plan_api.py -v -k sizing`
Expected: FAIL — `KeyError: 'sizing'`.

- [ ] **Step 3: Implement** — in `stocks/views/plan.py`, add the import and extend `PlanTodayView.get`:

```python
from ..services.position_sizing import sizing_map_for_user
```

and in `PlanTodayView.get`, after `data["overlay"] = user_overlay(request.user)`:

```python
        data["overlay"]["sizing"] = sizing_map_for_user(
            request.user, plan.payload.get("picks", []))
```

- [ ] **Step 4: Run tests**

Run: `.venv/bin/python -m pytest tests/test_plan_api.py -v`
Expected: all pass (prior tests assert `set(overlay.keys()) == {...}` — UPDATE that assertion in `test_today_returns_latest_plan_with_overlay` to include `"sizing"`).

- [ ] **Step 5: Run the full backend feature suite + commit**

Run: `.venv/bin/python -m pytest tests/test_confluence.py tests/test_daily_plan.py tests/test_analogs.py tests/test_catalysts.py tests/test_plan_api.py tests/test_position_sizing_service.py tests/test_ticker_verdict.py -q`
Expected: all pass.

```bash
git add stocks/views/plan.py tests/test_plan_api.py
git commit -m "feat(sizing): per-user sizing map on the plan overlay"
```

---

### Task 6: `draftTradePlan` helper + `TickerVerdict` component (TDD)

**Files:**
- Create: `frontend/src/lib/draftTradePlan.ts`, `frontend/src/components/ticker/TickerVerdict.tsx`
- Test: `frontend/src/__tests__/unit/DraftTradePlan.test.ts`, `frontend/src/__tests__/unit/TickerVerdict.test.tsx`

- [ ] **Step 1: Write the failing helper test** — create `src/__tests__/unit/DraftTradePlan.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import api from '@/lib/api';
import { draftTradePlan } from '@/lib/draftTradePlan';

vi.mock('@/lib/api', () => ({
    default: { get: vi.fn(), post: vi.fn() },
}));

describe('draftTradePlan', () => {
    beforeEach(() => vi.clearAllMocks());

    it('posts the trade-plans contract with one full-allocation leg', async () => {
        vi.mocked(api.post).mockResolvedValue({ data: { id: 7 } });
        const res = await draftTradePlan({
            ticker: 'NABIL', accountId: 3, riskPct: 1.0,
            entry: 612, stop: 585, target: 640, thesis: 'verdict 81/100',
        });
        expect(api.post).toHaveBeenCalledWith('/api/stocks/trade-plans/', {
            ticker: 'NABIL',
            account: 3,
            risk_budget_pct: '1.00',
            target_price: '640.00',
            thesis: 'verdict 81/100',
            legs: [{
                leg_number: 1,
                price_target: '612.00',
                allocation_pct: '100',
                stop_loss_price: '585.00',
            }],
        });
        expect(res.id).toBe(7);
    });

    it('omits target_price when absent', async () => {
        vi.mocked(api.post).mockResolvedValue({ data: { id: 8 } });
        await draftTradePlan({ ticker: 'X', accountId: null, riskPct: 2, entry: 100, stop: 95, target: null, thesis: '' });
        const payload = vi.mocked(api.post).mock.calls[0][1] as Record<string, unknown>;
        expect(payload.target_price).toBeNull();
        expect(payload.account).toBeNull();
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /Users/jugalraj/Documents/Projects/Stockastic/frontend && npx vitest run src/__tests__/unit/DraftTradePlan.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the helper** — create `src/lib/draftTradePlan.ts`:

```ts
import api from '@/lib/api';

export interface DraftTradePlanArgs {
    ticker: string;
    accountId: number | null;
    riskPct: number;
    entry: number;
    stop: number;
    target: number | null;
    thesis: string;
}

// The trade-plans serializer expects string decimals and legs summing to 100%.
export async function draftTradePlan(args: DraftTradePlanArgs) {
    const res = await api.post('/api/stocks/trade-plans/', {
        ticker: args.ticker,
        account: args.accountId,
        risk_budget_pct: args.riskPct.toFixed(2),
        target_price: args.target != null ? args.target.toFixed(2) : null,
        thesis: args.thesis,
        legs: [{
            leg_number: 1,
            price_target: args.entry.toFixed(2),
            allocation_pct: '100',
            stop_loss_price: args.stop.toFixed(2),
        }],
    });
    return res.data;
}
```

- [ ] **Step 4: Write the failing component test** — create `src/__tests__/unit/TickerVerdict.test.tsx`:

```tsx
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import api from '@/lib/api';
import TickerVerdict from '@/components/ticker/TickerVerdict';

vi.mock('@/lib/api', () => ({
    default: { get: vi.fn(), post: vi.fn() },
}));

const verdict = {
    symbol: 'NABIL', as_of: '2026-06-10', confluence_score: 81,
    components: {
        engine_agreement: { score: 75, active_buy_sources: ['SMART_MONEY', 'ICHIMOKU', 'VOLUME_BREAKOUT'], conflicting_sources: [] },
        opportunity: { score: 100, trust: 'CONFIRMED', edge: 0.15, pvalue: 0.02 },
        accumulation: { score: 100 },
        sector: { score: 100, acc_intensity: 12.4 },
    },
    entry: { price: 612, zone_low: 598.4, zone_high: 625.6, status: 'IN_ZONE', last_signal_age_days: 1, latest_close: 610 },
    targets: { tp1: 640, sl: 585 },
    episodes: [], analog: { n: 14, fwd_1d_median_pct: 0.8, fwd_3d_median_pct: 2.1, fwd_5d_median_pct: 2.9, win_rate_3d: 0.64 },
    catalyst: { type: 'BOOK_CLOSE', date: '2026-06-18', days_away: 6, detail: 'x' },
    sizing: { shares: 200, risk_amount: 10000, position_value: 122400, risk_pct: 1.0, entry: 610, stop: 585, account_id: 3, account_name: 'Live' },
};

describe('TickerVerdict', () => {
    beforeEach(() => vi.clearAllMocks());

    it('renders score, chips, sizing and drafts a trade plan', async () => {
        vi.mocked(api.get).mockResolvedValue({ data: verdict });
        vi.mocked(api.post).mockResolvedValue({ data: { id: 9 } });
        render(<TickerVerdict symbol="NABIL" />);
        expect(await screen.findByText('81')).toBeInTheDocument();
        expect(screen.getByText(/3 engines/i)).toBeInTheDocument();
        expect(screen.getByText(/CONFIRMED/)).toBeInTheDocument();
        expect(screen.getByText(/in zone/i)).toBeInTheDocument();
        expect(screen.getByText(/200 shares/i)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /draft trade plan/i }));
        await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
        const payload = vi.mocked(api.post).mock.calls[0][1] as Record<string, unknown>;
        expect(payload.ticker).toBe('NABIL');
        expect(payload.account).toBe(3);
    });

    it('renders empty state without active setups and no draft button without sizing', async () => {
        vi.mocked(api.get).mockResolvedValue({
            data: { ...verdict, confluence_score: 5, entry: null, sizing: null, analog: null, catalyst: null },
        });
        render(<TickerVerdict symbol="EMPTY" />);
        expect(await screen.findByText(/no active setups/i)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /draft trade plan/i })).not.toBeInTheDocument();
    });
});
```

- [ ] **Step 5: Implement the component** — create `src/components/ticker/TickerVerdict.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Layers, CalendarClock, TrendingUp, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { draftTradePlan } from '@/lib/draftTradePlan';

interface Sizing {
    shares: number; risk_amount: number; position_value: number; risk_pct: number;
    entry: number; stop: number; account_id: number; account_name: string;
}

interface Verdict {
    symbol: string;
    confluence_score: number;
    components: {
        engine_agreement: { score: number; active_buy_sources: string[]; conflicting_sources: string[] };
        opportunity: { score: number; trust: string | null };
        accumulation: { score: number };
        sector: { score: number; acc_intensity: number | null };
    };
    entry: { price: number; zone_low: number; zone_high: number; status: string; latest_close: number } | null;
    targets: { tp1: number | null; sl: number | null };
    analog: { n: number; fwd_3d_median_pct: number; win_rate_3d: number } | null;
    catalyst: { type: string; days_away: number } | null;
    sizing: Sizing | null;
}

const STATUS_STYLES: Record<string, string> = {
    IN_ZONE: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    EXTENDED: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    STALE: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};

export default function TickerVerdict({ symbol }: { symbol: string }) {
    const [verdict, setVerdict] = useState<Verdict | null>(null);
    const [loading, setLoading] = useState(true);
    const [drafting, setDrafting] = useState(false);

    useEffect(() => {
        setLoading(true);
        api.get(`/api/stocks/ticker-verdict/${symbol}/`)
            .then(res => setVerdict(res.data))
            .catch(() => setVerdict(null))
            .finally(() => setLoading(false));
    }, [symbol]);

    if (loading || !verdict) return null;

    const { components, entry, targets, analog, catalyst, sizing } = verdict;
    const engineCount = components.engine_agreement.active_buy_sources.length;
    const conflicts = components.engine_agreement.conflicting_sources;

    const onDraft = async () => {
        if (!sizing || targets.sl == null) return;
        setDrafting(true);
        try {
            await draftTradePlan({
                ticker: verdict.symbol,
                accountId: sizing.account_id,
                riskPct: sizing.risk_pct,
                entry: sizing.entry,
                stop: sizing.stop,
                target: targets.tp1,
                thesis: `Verdict ${verdict.confluence_score}/100 — ${engineCount} engine(s), ${components.opportunity.trust ?? 'no validated edge'}`,
            });
            toast.success('Trade plan drafted — review it in Portfolio → Trade Plans.');
        } catch {
            toast.error('Could not draft the trade plan.');
        } finally {
            setDrafting(false);
        }
    };

    if (!entry) {
        return (
            <Card>
                <CardContent className="py-6 text-center text-sm text-muted-foreground">
                    No active setups on {verdict.symbol}.
                    {catalyst && <span> Book close in {catalyst.days_away}d.</span>}
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="overflow-hidden">
            <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                    <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Verdict</p>
                    <div className="flex items-center gap-2">
                        <Badge className={cn('text-[10px] font-bold uppercase', STATUS_STYLES[entry.status] || '')}>
                            {entry.status.replace(/_/g, ' ')}
                        </Badge>
                        <span className="text-3xl font-black tabular-nums">{verdict.confluence_score}</span>
                    </div>
                </div>

                <div className="flex flex-wrap gap-1.5 text-[10px] font-semibold">
                    <Badge variant="outline" className="gap-1"><Layers size={10} /> {engineCount} engines</Badge>
                    {components.opportunity.trust && <Badge variant="outline">{components.opportunity.trust}</Badge>}
                    {conflicts.length > 0 && (
                        <Badge variant="outline" className="text-rose-600 dark:text-rose-400">
                            {conflicts.length} conflicting
                        </Badge>
                    )}
                    {catalyst && (
                        <Badge variant="outline" className="gap-1 text-orange-600 dark:text-orange-400">
                            <CalendarClock size={10} /> {catalyst.type.replace(/_/g, ' ').toLowerCase()} in {catalyst.days_away}d
                        </Badge>
                    )}
                </div>

                {analog && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <TrendingUp size={12} className="text-emerald-500 shrink-0" />
                        <span>Similar setups (n={analog.n}): {analog.fwd_3d_median_pct >= 0 ? '+' : ''}{analog.fwd_3d_median_pct.toFixed(1)}% median over 3d, {Math.round(analog.win_rate_3d * 100)}% win rate</span>
                    </div>
                )}

                {sizing && targets.sl != null && (
                    <div className="flex items-center justify-between border-t pt-3 text-xs">
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <Wallet size={12} className="shrink-0" />
                            <span>
                                ≈ <span className="font-bold text-foreground">{sizing.shares} shares</span>
                                {' '}· Rs {Math.round(sizing.position_value).toLocaleString()}
                                {' '}· risks {sizing.risk_pct}% (Rs {Math.round(sizing.risk_amount).toLocaleString()}) of {sizing.account_name}
                            </span>
                        </div>
                        <Button size="sm" variant="outline" onClick={onDraft} disabled={drafting}>
                            {drafting ? 'Drafting…' : 'Draft trade plan'}
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
```

- [ ] **Step 6: Run both test files**

Run: `npx vitest run src/__tests__/unit/DraftTradePlan.test.ts src/__tests__/unit/TickerVerdict.test.tsx`
Expected: 4 passed. If text-matching fails on split elements, adjust JSX so the asserted strings render contiguously (keep test expectations as written).

- [ ] **Step 7: Commit**

```bash
git add src/lib/draftTradePlan.ts src/components/ticker/TickerVerdict.tsx src/__tests__/unit/DraftTradePlan.test.ts src/__tests__/unit/TickerVerdict.test.tsx
git commit -m "feat(verdict): TickerVerdict panel + draftTradePlan helper"
```

---

### Task 7: Wire verdict into the ticker page + zone badges in TickerSignals

**Files:**
- Modify: `frontend/src/app/(authenticated)/ticker/[ticker]/page.tsx` (signals TabsContent)
- Modify: `frontend/src/components/ticker/TickerSignals.tsx`

- [ ] **Step 1: Slot the panel** — in the ticker page's `signals` TabsContent (currently rendering `<TickerSignals symbol={ticker} ... />`), import `TickerVerdict` and render it ABOVE TickerSignals:

```tsx
import TickerVerdict from '@/components/ticker/TickerVerdict';
...
<TabsContent value="signals" forceMount className="mt-0 data-[state=inactive]:hidden">
    <div className="space-y-6">
        <TickerVerdict symbol={ticker} />
        <TickerSignals symbol={ticker} currentPrice={data.price.close} intelligence={intelligence} fundamental={data.fundamental} />
    </div>
</TabsContent>
```

(Read the actual JSX first — preserve existing props/classes; only wrap with the spacing div and add the panel.)

- [ ] **Step 2: Zone badges in TickerSignals** — in `src/components/ticker/TickerSignals.tsx`:

(a) Add the verdict fetch to the existing `Promise.all` in its `fetchAll` (it already `.catch(() => null)`s each call):

```tsx
const [stratRes, signalRes, intelRes, verdictRes] = await Promise.all([
    api.get('/api/stocks/strategies/').catch(() => null),
    api.get('/api/stocks/signals/', { params: { symbol, page_size: 100 } }).catch(() => null),
    api.get('/api/stocks/generated-signals/', { params: { symbol, page_size: 100 } }).catch(() => null),
    api.get(`/api/stocks/ticker-verdict/${symbol}/`).catch(() => null),
]);
```

(b) New state `const [zoneBySource, setZoneBySource] = useState<Record<string, string>>({});` populated from the verdict payload:

```tsx
const eps = verdictRes?.data?.episodes ?? [];
setZoneBySource(Object.fromEntries(eps.map((e: any) => [e.source, e.status])));
```

(c) In the `IntelCard` row rendering (where the existing `getFreshness` date badge renders), add a zone badge when the row's source has a status — pass `zoneStatus={zoneBySource[signal.source]}` into `IntelCard` and render next to the freshness badge:

```tsx
{zoneStatus && (
    <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border',
        zoneStatus === 'IN_ZONE' && 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
        zoneStatus === 'EXTENDED' && 'text-amber-500 bg-amber-500/10 border-amber-500/20',
        zoneStatus === 'STALE' && 'text-slate-400 bg-slate-400/10 border-slate-400/20')}>
        {zoneStatus.replace(/_/g, ' ')}
    </span>
)}
```

READ the component first: `IntelCard` is defined inside this file (~line 718) — match its actual prop plumbing and badge markup style (it already renders `getFreshness` badges around line 749); keep the date-based badge, the zone badge is additive.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit 2>&1 | grep -vE "__tests__" | head -5` → no errors.
Run: `npx vitest run` → only the pre-existing ChatInterface failure (the existing `TickerSignalsFundamentals` test mocks `api.get` returning `{data: []}` for everything — the new verdict fetch tolerates that shape via `?.episodes ?? []`; verify it still passes).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(authenticated)/ticker/[ticker]/page.tsx" src/components/ticker/TickerSignals.tsx
git commit -m "feat(verdict): verdict panel on ticker page + entry-zone badges on signals"
```

---

### Task 8: Sizing + draft button on plan picks

**Files:**
- Modify: `frontend/src/components/plan/PickCard.tsx`, `frontend/src/app/(authenticated)/plan/page.tsx`
- Test: `frontend/src/__tests__/unit/PlanPickCard.test.tsx` (append)

- [ ] **Step 1: Write the failing test** (append to `PlanPickCard.test.tsx`; its api mock must gain `post: vi.fn()` — update the `vi.mock('@/lib/api', ...)` block if the file doesn't mock api yet; PickCard previously didn't call api, so ADD the mock):

```tsx
import { fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import api from '@/lib/api';

vi.mock('@/lib/api', () => ({
    default: { get: vi.fn(), post: vi.fn() },
}));

const sizing = { shares: 200, risk_amount: 10000, position_value: 122400, risk_pct: 1.0,
                 entry: 610, stop: 585, account_id: 3, account_name: 'Live' };

describe('PickCard sizing', () => {
    it('shows sizing line and drafts a plan', async () => {
        vi.mocked(api.post).mockResolvedValue({ data: { id: 5 } });
        render(<PickCard pick={basePick} sizing={sizing} />);
        expect(screen.getByText(/200 shares/i)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /draft trade plan/i }));
        await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    });

    it('renders without sizing exactly as before', () => {
        render(<PickCard pick={basePick} />);
        expect(screen.queryByText(/shares/i)).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /draft trade plan/i })).not.toBeInTheDocument();
    });
});
```

NOTE: the existing link test uses `getByRole('link')` — adding a button does not break it, but if any test asserts on exact element counts, fix the SELECTORS, not the component.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/__tests__/unit/PlanPickCard.test.tsx`
Expected: new tests FAIL (no sizing prop).

- [ ] **Step 3: Implement** — in `src/components/plan/PickCard.tsx`:

(a) Export the sizing shape and accept the optional prop:

```tsx
export interface PickSizing {
    shares: number; risk_amount: number; position_value: number; risk_pct: number;
    entry: number; stop: number; account_id: number; account_name: string;
}

export function PickCard({ pick, sizing }: { pick: PlanPick; sizing?: PickSizing | null }) {
```

(b) Add imports: `Button` from `@/components/ui/button`, `Wallet` from lucide, `toast` from `sonner`, `useState` from react, `draftTradePlan` from `@/lib/draftTradePlan` (component already has `'use client'`).

(c) After the analog block, render the sizing row (same structure as TickerVerdict's):

```tsx
{sizing && targets.sl != null && (
    <div className="flex items-center justify-between border-t pt-2 text-xs">
        <span className="text-muted-foreground">
            ≈ <span className="font-bold text-foreground">{sizing.shares} shares</span>
            {' '}· risks {sizing.risk_pct}% of {sizing.account_name}
        </span>
        <Button size="sm" variant="outline" disabled={drafting} onClick={onDraft}>
            {drafting ? 'Drafting…' : 'Draft trade plan'}
        </Button>
    </div>
)}
```

with the handler inside the component:

```tsx
const [drafting, setDrafting] = useState(false);
const onDraft = async () => {
    if (!sizing || targets.sl == null) return;
    setDrafting(true);
    try {
        await draftTradePlan({
            ticker: pick.symbol, accountId: sizing.account_id, riskPct: sizing.risk_pct,
            entry: sizing.entry, stop: sizing.stop, target: targets.tp1,
            thesis: `Plan pick ${pick.confluence_score}/100`,
        });
        toast.success('Trade plan drafted — review it in Portfolio → Trade Plans.');
    } catch {
        toast.error('Could not draft the trade plan.');
    } finally {
        setDrafting(false);
    }
};
```

(d) In `src/app/(authenticated)/plan/page.tsx`: extend the `Overlay` interface with `sizing?: Record<string, PickSizing>;` (import the type from PickCard) and pass it through in BOTH pick grids (top setups and watch):

```tsx
{picks.map(p => <PickCard key={p.symbol} pick={p} sizing={overlay?.sizing?.[p.symbol]} />)}
```

(watch entries usually won't have sizing — the map only contains picks — so passing the lookup is harmless.)

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run src/__tests__/unit/PlanPickCard.test.tsx` → all pass (3 prior + 2 new).
Run: `npx tsc --noEmit 2>&1 | grep -v __tests__ | head -5` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/plan/PickCard.tsx "src/app/(authenticated)/plan/page.tsx" src/__tests__/unit/PlanPickCard.test.tsx
git commit -m "feat(sizing): sizing line + draft-trade-plan action on plan picks"
```

---

### Task 9: Full verification

- [ ] **Step 1: Backend feature suite**

Run: `cd /Users/jugalraj/Documents/Projects/Stockastic/backend && .venv/bin/python -m pytest tests/test_confluence.py tests/test_daily_plan.py tests/test_analogs.py tests/test_catalysts.py tests/test_plan_api.py tests/test_position_sizing_service.py tests/test_ticker_verdict.py -q`
Expected: all pass.

- [ ] **Step 2: Full backend suite (regressions)**

Run: `.venv/bin/python -m pytest tests/ -q --ignore=tests/test_portfolio_api.py 2>&1 | tail -3`
Expected: no NEW failures vs the known 28 pre-existing (+ the ignored stale collection file).

- [ ] **Step 3: Frontend**

Run: `cd ../frontend && npx vitest run 2>&1 | tail -3 && npx tsc --noEmit 2>&1 | grep -v __tests__ | head -3`
Expected: only the pre-existing ChatInterface failure; typecheck clean.

- [ ] **Step 4: Migration check**

Run: `cd ../backend && .venv/bin/python manage.py makemigrations --check --dry-run`
Expected: "No changes detected" (this feature adds NO models).

- [ ] **Step 5: Deployment note**

Backend is volume-mounted into Docker (live on restart); frontend needs `docker compose build frontend && docker compose up -d frontend` + hard refresh. Verdict endpoint warms its 15-min cache on first hit per symbol.

---

## Self-Review Notes

- **Spec coverage:** verdict endpoint+cache+sizing-out-of-cache (T3/T4), sector single-symbol helper preferred-path (T3 `_sector_intensity_for`), per-episode freshness + TickerSignals badges (T3/T7), analog/catalyst on ticker (T3/T6), TickerVerdict panel + empty state (T6/T7), sizing service + verdict block + overlay map (T2/T4/T5), draft-TradePlan with real API contract (T6/T8), Intel-Hub freshness explicitly out of scope. Plus the sector-mapping bug fix (T1) found during scouting.
- **Type consistency:** `sizing` block keys (`shares/risk_amount/position_value/risk_pct/entry/stop/account_id/account_name`) identical across `position_sizing.py`, verdict view, overlay map, `Sizing`/`PickSizing` TS interfaces. `entry_status` and `confluence_score` signatures match the shipped Task-2/3 services.
- **Known judgment calls:** verdict for a symbol with zero activity still returns an honest low score (no fake neutrality); `allocation_pct: '100'` single leg satisfies the sum-to-100 validation; `rank_opportunities` failure degrades to opportunity-component 0 with a logged exception rather than a 500.
