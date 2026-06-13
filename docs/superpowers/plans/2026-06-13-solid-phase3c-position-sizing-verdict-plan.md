# SOLID Refactor — Phase 3c: PositionSizingService, TickerVerdict, and DailyPlan Refactors

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose three over-long service functions (`calculate_position_size`, `_generate_warnings`, `build_verdict`, `build_daily_plan`, `user_overlay`) into focused helpers so that every function/method body in `stocks/services/` is ≤30 lines.

**Architecture:** Each large method is split at its natural seam — validation, computation, and result-assembly — with each extracted helper carrying exactly one responsibility. Module-level private functions replace inline logic blocks; no class changes beyond adding private `@staticmethod` helpers to `PositionSizingService`. Tests are written before implementation (TDD: red → green → refactor).

**Tech Stack:** Python 3.11, Django 5.2, pytest, pytest-django

---

## Task 1 — Slim `PositionSizingService._generate_warnings` into 4 warning helpers

- [x] **1.1 Write failing tests**

  Create `backend/stocks/tests/test_position_sizing_refactor.py`:

  ```python
  import pytest
  from decimal import Decimal
  from stocks.services.position_sizing import PositionSizingService


  class TestRiskWarning:
      def test_no_warning_below_threshold(self):
          assert PositionSizingService._risk_warning(2.0) == []

      def test_medium_warning_above_3_pct(self):
          result = PositionSizingService._risk_warning(4.0)
          assert len(result) == 1
          assert result[0]["severity"] == "MEDIUM"

      def test_high_warning_above_5_pct(self):
          result = PositionSizingService._risk_warning(6.0)
          assert len(result) == 1
          assert result[0]["severity"] == "HIGH"

      def test_boundary_exactly_5_pct_is_medium(self):
          result = PositionSizingService._risk_warning(5.0)
          assert result[0]["severity"] == "MEDIUM"

      def test_boundary_exactly_3_pct_no_warning(self):
          assert PositionSizingService._risk_warning(3.0) == []


  class TestPositionWarning:
      def test_no_warning_below_25_pct(self):
          assert PositionSizingService._position_warning(20.0) == []

      def test_medium_warning_above_25_pct(self):
          result = PositionSizingService._position_warning(30.0)
          assert len(result) == 1
          assert result[0]["severity"] == "MEDIUM"

      def test_high_warning_above_50_pct(self):
          result = PositionSizingService._position_warning(55.0)
          assert len(result) == 1
          assert result[0]["severity"] == "HIGH"

      def test_boundary_exactly_50_pct_is_medium(self):
          result = PositionSizingService._position_warning(50.0)
          assert result[0]["severity"] == "MEDIUM"


  class TestSharesWarning:
      def test_critical_when_zero_shares(self):
          result = PositionSizingService._shares_warning(0)
          assert len(result) == 1
          assert result[0]["severity"] == "CRITICAL"
          assert result[0]["type"] == "INSUFFICIENT_CAPITAL"

      def test_low_warning_when_fewer_than_10(self):
          result = PositionSizingService._shares_warning(5)
          assert len(result) == 1
          assert result[0]["severity"] == "LOW"
          assert result[0]["type"] == "LOW_SHARES"

      def test_no_warning_when_10_or_more(self):
          assert PositionSizingService._shares_warning(10) == []

      def test_no_warning_for_large_share_count(self):
          assert PositionSizingService._shares_warning(500) == []


  class TestLeverageWarning:
      def test_critical_when_investment_exceeds_balance(self):
          result = PositionSizingService._leverage_warning(
              total_investment=Decimal("120000"),
              account_balance=Decimal("100000"),
          )
          assert len(result) == 1
          assert result[0]["severity"] == "CRITICAL"
          assert result[0]["type"] == "OVER_LEVERAGE"

      def test_no_warning_when_investment_equals_balance(self):
          assert PositionSizingService._leverage_warning(
              Decimal("100000"), Decimal("100000")
          ) == []

      def test_no_warning_when_investment_below_balance(self):
          assert PositionSizingService._leverage_warning(
              Decimal("80000"), Decimal("100000")
          ) == []


  class TestGenerateWarningsDelegates:
      def test_combines_all_four_helpers(self):
          # Zero shares → CRITICAL from _shares_warning;
          # 6% risk → HIGH from _risk_warning; rest benign.
          result = PositionSizingService._generate_warnings(
              risk_percentage=6.0,
              position_size_percentage=10.0,
              max_shares=0,
              total_investment=Decimal("0"),
              account_balance=Decimal("100000"),
          )
          severities = {w["severity"] for w in result}
          assert "HIGH" in severities
          assert "CRITICAL" in severities
  ```

- [x] **1.2 Run tests — confirm red**

  ```bash
  cd /Users/jugalraj/Documents/Projects/Stockastic/backend
  source venv/bin/activate
  pytest stocks/tests/test_position_sizing_refactor.py -x
  ```

- [x] **1.3 Implement the 4 warning helpers + slim `_generate_warnings`**

  In `backend/stocks/services/position_sizing.py`, add four `@staticmethod` methods to `PositionSizingService` and replace the body of `_generate_warnings`:

  ```python
  @staticmethod
  def _risk_warning(risk_percentage: float) -> list:
      if risk_percentage > 5:
          return [{"type": "HIGH_RISK", "severity": "HIGH",
                   "message": f"Risk percentage {risk_percentage}% exceeds recommended 5% maximum"}]
      if risk_percentage > 3:
          return [{"type": "ELEVATED_RISK", "severity": "MEDIUM",
                   "message": f"Risk percentage {risk_percentage}% is above the recommended 3% guideline"}]
      return []

  @staticmethod
  def _position_warning(position_size_percentage) -> list:
      pct = float(position_size_percentage)
      if pct > 50:
          return [{"type": "LARGE_POSITION", "severity": "HIGH",
                   "message": f"Position size {pct:.1f}% of account is very large"}]
      if pct > 25:
          return [{"type": "LARGE_POSITION", "severity": "MEDIUM",
                   "message": f"Position size {pct:.1f}% of account is above recommended 25%"}]
      return []

  @staticmethod
  def _shares_warning(max_shares: int) -> list:
      if max_shares == 0:
          return [{"type": "INSUFFICIENT_CAPITAL", "severity": "CRITICAL",
                   "message": "Insufficient capital to open even a single share position"}]
      if max_shares < 10:
          return [{"type": "LOW_SHARES", "severity": "LOW",
                   "message": f"Only {max_shares} shares — consider increasing capital or reducing risk"}]
      return []

  @staticmethod
  def _leverage_warning(total_investment, account_balance) -> list:
      if total_investment > account_balance:
          return [{"type": "OVER_LEVERAGE", "severity": "CRITICAL",
                   "message": "Total investment exceeds account balance — margin required"}]
      return []

  @staticmethod
  def _generate_warnings(risk_percentage, position_size_percentage, max_shares, total_investment, account_balance):
      return (
          PositionSizingService._risk_warning(risk_percentage)
          + PositionSizingService._position_warning(position_size_percentage)
          + PositionSizingService._shares_warning(max_shares)
          + PositionSizingService._leverage_warning(total_investment, account_balance)
      )
  ```

- [x] **1.4 Run tests — confirm green**

  ```bash
  cd /Users/jugalraj/Documents/Projects/Stockastic/backend
  pytest stocks/tests/test_position_sizing_refactor.py -x
  ```

- [x] **1.5 Commit**

  ```bash
  cd /Users/jugalraj/Documents/Projects/Stockastic/backend
  git add stocks/services/position_sizing.py stocks/tests/test_position_sizing_refactor.py
  git commit -m "refactor(position-sizing): extract 4 warning helpers; slim _generate_warnings to 5 lines"
  ```

---

## Task 2 — Slim `PositionSizingService.calculate_position_size` with `_compute_core` and `_append_rr_fields`

- [ ] **2.1 Write failing tests**

  Append to `backend/stocks/tests/test_position_sizing_refactor.py`:

  ```python
  from decimal import Decimal


  class TestComputeCore:
      def test_basic_computation(self):
          balance = Decimal("100000")
          risk_pct = Decimal("2")
          entry = Decimal("500")
          stop_loss = Decimal("450")
          risk_amount, risk_per_share, max_shares, total_investment, max_loss, pos_pct = (
              PositionSizingService._compute_core(balance, risk_pct, entry, stop_loss)
          )
          assert risk_amount == Decimal("2000")       # 100000 * 2/100
          assert risk_per_share == Decimal("50")       # 500 - 450
          assert max_shares == 40                      # int(2000 / 50)
          assert total_investment == Decimal("20000")  # 40 * 500
          assert max_loss == Decimal("2000")           # 40 * 50
          # pos_pct = 20000/100000*100 = 20
          assert pos_pct == Decimal("20")

      def test_returns_six_tuple(self):
          result = PositionSizingService._compute_core(
              Decimal("50000"), Decimal("1"), Decimal("200"), Decimal("180")
          )
          assert len(result) == 6


  class TestAppendRrFields:
      def test_adds_rr_keys_to_result(self):
          result = {
              "entry_price": 500.0,
              "stop_loss_price": 450.0,
              "warnings": [],
          }
          PositionSizingService._append_rr_fields(
              result,
              target_price=Decimal("600"),
              entry=Decimal("500"),
              risk_per_share=Decimal("50"),
              max_shares=40,
              warnings=result["warnings"],
          )
          assert "reward_per_share" in result
          assert "risk_reward_ratio" in result
          assert "potential_profit" in result
          assert result["risk_reward_ratio"] == pytest.approx(2.0)  # (600-500)/50

      def test_appends_poor_rr_warning_when_ratio_below_1_5(self):
          result = {"warnings": []}
          warnings = result["warnings"]
          PositionSizingService._append_rr_fields(
              result,
              target_price=Decimal("520"),
              entry=Decimal("500"),
              risk_per_share=Decimal("50"),
              max_shares=10,
              warnings=warnings,
          )
          types = [w["type"] for w in warnings]
          assert "POOR_RISK_REWARD" in types

      def test_no_poor_rr_warning_when_ratio_above_1_5(self):
          result = {"warnings": []}
          warnings = result["warnings"]
          PositionSizingService._append_rr_fields(
              result,
              target_price=Decimal("600"),
              entry=Decimal("500"),
              risk_per_share=Decimal("50"),
              max_shares=40,
              warnings=warnings,
          )
          types = [w["type"] for w in warnings]
          assert "POOR_RISK_REWARD" not in types


  class TestCalculatePositionSizeIntegration:
      def test_returns_expected_keys(self):
          result = PositionSizingService.calculate_position_size(
              account_balance=100000,
              risk_percentage=2,
              entry_price=500,
              stop_loss_price=450,
          )
          expected_keys = {
              "max_shares", "total_investment", "risk_amount", "max_loss_if_stopped",
              "risk_per_share", "position_size_percentage", "warnings",
              "account_balance", "risk_percentage", "entry_price", "stop_loss_price",
          }
          assert expected_keys.issubset(result.keys())

      def test_includes_rr_fields_when_target_provided(self):
          result = PositionSizingService.calculate_position_size(
              account_balance=100000,
              risk_percentage=2,
              entry_price=500,
              stop_loss_price=450,
              target_price=600,
          )
          assert "risk_reward_ratio" in result
          assert "potential_profit" in result

      def test_no_rr_fields_when_target_omitted(self):
          result = PositionSizingService.calculate_position_size(
              account_balance=100000,
              risk_percentage=2,
              entry_price=500,
              stop_loss_price=450,
          )
          assert "risk_reward_ratio" not in result
  ```

- [ ] **2.2 Run tests — confirm red**

  ```bash
  cd /Users/jugalraj/Documents/Projects/Stockastic/backend
  source venv/bin/activate
  pytest stocks/tests/test_position_sizing_refactor.py::TestComputeCore \
         stocks/tests/test_position_sizing_refactor.py::TestAppendRrFields \
         stocks/tests/test_position_sizing_refactor.py::TestCalculatePositionSizeIntegration -x
  ```

- [ ] **2.3 Implement `_compute_core`, `_append_rr_fields`, and slim `calculate_position_size`**

  Add to `PositionSizingService`:

  ```python
  POOR_RR_THRESHOLD = Decimal("1.5")

  @staticmethod
  def _compute_core(balance: Decimal, risk_pct: Decimal, entry: Decimal, stop_loss: Decimal):
      risk_amount = balance * (risk_pct / Decimal("100"))
      risk_per_share = entry - stop_loss
      max_shares = int(risk_amount / risk_per_share)
      total_investment = Decimal(str(max_shares)) * entry
      max_loss = Decimal(str(max_shares)) * risk_per_share
      pos_pct = (total_investment / balance) * Decimal("100")
      return risk_amount, risk_per_share, max_shares, total_investment, max_loss, pos_pct

  @staticmethod
  def _append_rr_fields(result: dict, target_price: Decimal, entry: Decimal,
                        risk_per_share: Decimal, max_shares: int, warnings: list) -> None:
      reward_per_share = target_price - entry
      ratio = reward_per_share / risk_per_share
      potential_profit = reward_per_share * Decimal(str(max_shares))
      result["reward_per_share"] = float(reward_per_share)
      result["risk_reward_ratio"] = float(ratio)
      result["potential_profit"] = float(potential_profit)
      if ratio < PositionSizingService.POOR_RR_THRESHOLD:
          warnings.append({
              "type": "POOR_RISK_REWARD", "severity": "MEDIUM",
              "message": f"Risk/reward ratio {float(ratio):.2f} is below recommended 1.5",
          })
  ```

  Replace `calculate_position_size` body with:

  ```python
  @staticmethod
  def calculate_position_size(
      account_balance: float,
      risk_percentage: float,
      entry_price: float,
      stop_loss_price: float,
      target_price: Optional[float] = None,
  ) -> Dict:
      PositionSizingService._validate_inputs(account_balance, risk_percentage, entry_price, stop_loss_price)
      balance = Decimal(str(account_balance))
      risk_pct = Decimal(str(risk_percentage))
      entry = Decimal(str(entry_price))
      stop_loss = Decimal(str(stop_loss_price))
      risk_amount, risk_per_share, max_shares, total_investment, max_loss, pos_pct = (
          PositionSizingService._compute_core(balance, risk_pct, entry, stop_loss)
      )
      warnings = PositionSizingService._generate_warnings(
          risk_percentage, pos_pct, max_shares, total_investment, balance
      )
      result = {
          "max_shares": max_shares,
          "total_investment": float(total_investment),
          "risk_amount": float(risk_amount),
          "max_loss_if_stopped": float(max_loss),
          "risk_per_share": float(risk_per_share),
          "position_size_percentage": float(pos_pct),
          "warnings": warnings,
          "account_balance": float(balance),
          "risk_percentage": float(risk_pct),
          "entry_price": float(entry),
          "stop_loss_price": float(stop_loss),
      }
      if target_price is not None:
          PositionSizingService._append_rr_fields(
              result, Decimal(str(target_price)), entry, risk_per_share, max_shares, warnings
          )
      return result
  ```

- [ ] **2.4 Run full position-sizing test suite — confirm green**

  ```bash
  cd /Users/jugalraj/Documents/Projects/Stockastic/backend
  pytest stocks/tests/test_position_sizing_refactor.py -v
  ```

- [ ] **2.5 Commit**

  ```bash
  cd /Users/jugalraj/Documents/Projects/Stockastic/backend
  git add stocks/services/position_sizing.py stocks/tests/test_position_sizing_refactor.py
  git commit -m "refactor(position-sizing): extract _compute_core + _append_rr_fields; slim calculate_position_size to ≤30 lines"
  ```

---

## Task 3 — Slim `build_verdict` with `_collect_episodes` and `_build_entry_targets`

- [ ] **3.1 Write failing tests**

  Create `backend/stocks/tests/test_ticker_verdict_refactor.py`:

  ```python
  import pytest
  import pandas as pd
  from unittest.mock import MagicMock, patch
  from datetime import date


  class TestCollectEpisodes:
      def test_returns_empty_list_when_no_prices(self):
          from stocks.services.ticker_verdict import _collect_episodes
          result = _collect_episodes(active=[MagicMock()], has_prices=False, price_df=None)
          assert result == []

      def test_returns_empty_list_when_active_is_empty(self):
          from stocks.services.ticker_verdict import _collect_episodes
          price_df = pd.DataFrame(
              {"Close": [100.0, 102.0]},
              index=pd.to_datetime(["2026-06-10", "2026-06-11"]),
          )
          result = _collect_episodes(active=[], has_prices=True, price_df=price_df)
          assert result == []

      def test_returns_correct_structure_for_one_episode(self):
          from stocks.services.ticker_verdict import _collect_episodes

          price_df = pd.DataFrame(
              {"Close": [100.0, 102.0, 104.0]},
              index=pd.to_datetime(["2026-06-09", "2026-06-10", "2026-06-11"]),
          )
          ep = MagicMock()
          ep.source = "RSI_OVERSOLD"
          ep.direction = "BUY"
          ep.entry_price = 100.0
          ep.entry_strength = 0.8
          ep.last_signal_date = date(2026, 6, 9)

          with patch("stocks.services.ticker_verdict.entry_status", return_value=("IN_ZONE", 99.0, 101.0)):
              result = _collect_episodes(active=[ep], has_prices=True, price_df=price_df)

          assert len(result) == 1
          item = result[0]
          assert item["source"] == "RSI_OVERSOLD"
          assert item["direction"] == "BUY"
          assert item["entry_price"] == 100.0
          assert item["strength"] == 0.8
          assert item["status"] == "IN_ZONE"
          assert "age_days" in item
          assert "last_signal_date" in item


  class TestBuildEntryTargets:
      def test_returns_none_entry_and_empty_targets_when_no_buy_eps(self):
          from stocks.services.ticker_verdict import _build_entry_targets
          entry, targets = _build_entry_targets(buy_eps=[], has_prices=True, price_df=MagicMock())
          assert entry is None
          assert targets == {"tp1": None, "sl": None}

      def test_returns_none_entry_when_no_prices(self):
          from stocks.services.ticker_verdict import _build_entry_targets
          ep = MagicMock()
          entry, targets = _build_entry_targets(buy_eps=[ep], has_prices=False, price_df=None)
          assert entry is None
          assert targets == {"tp1": None, "sl": None}

      def test_returns_entry_dict_with_expected_keys(self):
          from stocks.services.ticker_verdict import _build_entry_targets

          price_df = pd.DataFrame(
              {"Close": [100.0, 102.0, 104.0]},
              index=pd.to_datetime(["2026-06-09", "2026-06-10", "2026-06-11"]),
          )
          ep = MagicMock()
          ep.entry_price = 100.0
          ep.target_price = 120.0
          ep.stop_loss_price = 90.0
          ep.last_signal_date = date(2026, 6, 9)

          with patch("stocks.services.ticker_verdict.entry_status", return_value=("IN_ZONE", 99.0, 101.0)):
              entry, targets = _build_entry_targets(buy_eps=[ep], has_prices=True, price_df=price_df)

          assert entry is not None
          assert set(entry.keys()) == {"price", "zone_low", "zone_high", "status", "last_signal_age_days", "latest_close"}
          assert targets["tp1"] == pytest.approx(120.0)
          assert targets["sl"] == pytest.approx(90.0)
  ```

- [ ] **3.2 Run tests — confirm red**

  ```bash
  cd /Users/jugalraj/Documents/Projects/Stockastic/backend
  source venv/bin/activate
  pytest stocks/tests/test_ticker_verdict_refactor.py -x
  ```

- [ ] **3.3 Implement `_collect_episodes` and `_build_entry_targets` as module-level functions**

  In `backend/stocks/services/ticker_verdict.py`, add the two helpers (these are module-level functions, not methods):

  ```python
  def _collect_episodes(active, has_prices, price_df):
      if not has_prices:
          return []
      episodes = []
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
      return episodes


  def _build_entry_targets(buy_eps, has_prices, price_df):
      empty_targets = {"tp1": None, "sl": None}
      if not buy_eps or not has_prices:
          return None, empty_targets
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
      return entry, targets
  ```

  Replace `build_verdict` body with:

  ```python
  def build_verdict(symbol):
      from stocks.models import SignalEpisode
      symbol = symbol.upper()
      price_df = _load_price_df(symbol)
      has_prices = price_df is not None and not price_df.empty
      active = list(SignalEpisode.objects.filter(end_date__isnull=True, symbol=symbol))
      buy_eps = [e for e in active if e.direction == "BUY" and e.source not in SELL_SIDE_SOURCES]
      sell_sources = {e.source for e in active if not (e.direction == "BUY" and e.source not in SELL_SIDE_SOURCES)}
      episodes = _collect_episodes(active, has_prices, price_df)
      opp_row = _best_opportunity_row(symbol)
      score, components = confluence_score(
          buy_sources={e.source for e in buy_eps},
          sell_sources=sell_sources,
          opportunity_row=opp_row,
          episode_metadatas=[e.metadata for e in buy_eps],
          sector_intensity=_sector_intensity_for(symbol),
      )
      entry, targets = _build_entry_targets(buy_eps, has_prices, price_df)
      catalyst = next((c for c in upcoming_catalysts() if c["symbol"] == symbol), None)
      return {
          "symbol": symbol, "as_of": date.today().isoformat(),
          "confluence_score": score, "components": components,
          "entry": entry, "targets": targets, "episodes": episodes,
          "analog": analog_stats(symbol) if has_prices else None,
          "catalyst": catalyst,
      }
  ```

- [ ] **3.4 Run tests — confirm green**

  ```bash
  cd /Users/jugalraj/Documents/Projects/Stockastic/backend
  pytest stocks/tests/test_ticker_verdict_refactor.py -v
  ```

- [ ] **3.5 Commit**

  ```bash
  cd /Users/jugalraj/Documents/Projects/Stockastic/backend
  git add stocks/services/ticker_verdict.py stocks/tests/test_ticker_verdict_refactor.py
  git commit -m "refactor(ticker-verdict): extract _collect_episodes + _build_entry_targets; slim build_verdict to ≤30 lines"
  ```

---

## Task 4 — Slim `build_daily_plan` helpers

- [ ] **4.1 Write failing tests**

  Create `backend/stocks/tests/test_daily_plan_refactor.py`:

  ```python
  import pytest
  from collections import defaultdict
  from unittest.mock import patch, MagicMock
  from datetime import date


  class TestFetchOpportunities:
      def test_returns_empty_dicts_when_no_opportunities(self):
          from stocks.services.daily_plan import _fetch_opportunities
          with patch("stocks.services.daily_plan.rank_opportunities", return_value={"opportunities": [], "exits": []}):
              opp_result, opp_by_symbol = _fetch_opportunities()
          assert opp_result == {"opportunities": [], "exits": []}
          assert opp_by_symbol == {}

      def test_excludes_divergent_rows(self):
          from stocks.services.daily_plan import _fetch_opportunities
          rows = [
              {"symbol": "NABIL", "score": 0.9, "trust": "DIVERGENT"},
              {"symbol": "SCB", "score": 0.7, "trust": "CONVERGING"},
          ]
          with patch("stocks.services.daily_plan.rank_opportunities", return_value={"opportunities": rows, "exits": []}):
              _, opp_by_symbol = _fetch_opportunities()
          assert "NABIL" not in opp_by_symbol
          assert "SCB" in opp_by_symbol

      def test_keeps_highest_scoring_row_per_symbol(self):
          from stocks.services.daily_plan import _fetch_opportunities
          rows = [
              {"symbol": "NABIL", "score": 0.5, "trust": "CONVERGING"},
              {"symbol": "NABIL", "score": 0.9, "trust": "CONVERGING"},
          ]
          with patch("stocks.services.daily_plan.rank_opportunities", return_value={"opportunities": rows, "exits": []}):
              _, opp_by_symbol = _fetch_opportunities()
          assert opp_by_symbol["NABIL"]["score"] == 0.9


  class TestFetchActiveEpisodes:
      def test_returns_empty_defaultdicts_when_no_episodes(self):
          from stocks.services.daily_plan import _fetch_active_episodes
          with patch("stocks.services.daily_plan.SignalEpisode") as mock_model:
              mock_model.objects.filter.return_value = []
              buy_eps, sell_sources = _fetch_active_episodes()
          assert dict(buy_eps) == {}
          assert dict(sell_sources) == {}

      def test_routes_buy_episodes_to_buy_eps(self):
          from stocks.services.daily_plan import _fetch_active_episodes
          ep = MagicMock()
          ep.direction = "BUY"
          ep.source = "RSI_OVERSOLD"
          ep.symbol = "NABIL"
          with patch("stocks.services.daily_plan.SignalEpisode") as mock_model:
              mock_model.objects.filter.return_value = [ep]
              buy_eps, sell_sources = _fetch_active_episodes()
          assert "NABIL" in buy_eps
          assert ep in buy_eps["NABIL"]

      def test_routes_sell_side_sources_to_sell_sources(self):
          from stocks.services.daily_plan import _fetch_active_episodes, SELL_SIDE_SOURCES
          ep = MagicMock()
          ep.direction = "BUY"
          ep.source = next(iter(SELL_SIDE_SOURCES))  # e.g. DISTRIBUTION_ALERT
          ep.symbol = "SCB"
          with patch("stocks.services.daily_plan.SignalEpisode") as mock_model:
              mock_model.objects.filter.return_value = [ep]
              buy_eps, sell_sources = _fetch_active_episodes()
          assert "SCB" not in buy_eps
          assert ep.source in sell_sources["SCB"]


  class TestBuildCandidates:
      def test_returns_empty_list_when_buy_eps_empty(self):
          from stocks.services.daily_plan import _build_candidates
          result = _build_candidates(
              buy_eps=defaultdict(list),
              sell_sources=defaultdict(set),
              opp_by_symbol={},
              sector_by_symbol={},
              as_of=date.today(),
          )
          assert result == []

      def test_skips_symbols_with_no_price_data(self):
          from stocks.services.daily_plan import _build_candidates
          buy_eps = defaultdict(list)
          ep = MagicMock()
          ep.last_signal_date = date.today()
          buy_eps["NABIL"].append(ep)
          with patch("stocks.services.daily_plan._load_price_df", return_value=None):
              result = _build_candidates(
                  buy_eps=buy_eps,
                  sell_sources=defaultdict(set),
                  opp_by_symbol={},
                  sector_by_symbol={},
                  as_of=date.today(),
              )
          assert result == []
  ```

- [ ] **4.2 Run tests — confirm red**

  ```bash
  cd /Users/jugalraj/Documents/Projects/Stockastic/backend
  source venv/bin/activate
  pytest stocks/tests/test_daily_plan_refactor.py -x
  ```

- [ ] **4.3 Implement the 5 helpers and slim `build_daily_plan`**

  In `backend/stocks/services/daily_plan.py`, add these module-level functions (before `build_daily_plan`):

  ```python
  def _fetch_opportunities():
      """Rank opportunities and index by symbol, excluding DIVERGENT rows."""
      opp_result = rank_opportunities(limit=50)
      opp_by_symbol = {}
      for row in opp_result.get("opportunities", []):
          if row.get("trust") == "DIVERGENT":
              continue
          cur = opp_by_symbol.get(row["symbol"])
          if cur is None or (row.get("score") or 0) > (cur.get("score") or 0):
              opp_by_symbol[row["symbol"]] = row
      return opp_result, opp_by_symbol


  def _fetch_active_episodes():
      """Load all open SignalEpisodes and partition into buy_eps and sell_sources."""
      from stocks.models import SignalEpisode
      buy_eps, sell_sources = defaultdict(list), defaultdict(set)
      for ep in SignalEpisode.objects.filter(end_date__isnull=True):
          if ep.direction == "BUY" and ep.source not in SELL_SIDE_SOURCES:
              buy_eps[ep.symbol].append(ep)
          else:
              sell_sources[ep.symbol].add(ep.source)
      return buy_eps, sell_sources


  def _build_candidate_for_symbol(symbol, eps, sell_sources, opp_by_symbol, sector_by_symbol, as_of):
      """Return a candidate dict for one symbol, or None if price data is unavailable."""
      price_df = _load_price_df(symbol)
      if price_df is None or price_df.empty:
          return None
      price_df = price_df.loc[: pd.Timestamp(as_of)]
      if price_df.empty:
          return None
      score, components = confluence_score(
          buy_sources={e.source for e in eps},
          sell_sources=sell_sources.get(symbol, set()),
          opportunity_row=opp_by_symbol.get(symbol),
          episode_metadatas=[e.metadata for e in eps],
          sector_intensity=sector_by_symbol.get(symbol),
      )
      anchor = max(eps, key=lambda e: e.last_signal_date)
      age = _signal_age_trading_days(price_df, anchor.last_signal_date)
      status, zone_low, zone_high = entry_status(anchor.entry_price, age, price_df)
      return {
          "symbol": symbol, "direction": "BUY",
          "confluence_score": score, "components": components,
          "entry": {
              "price": float(anchor.entry_price), "zone_low": round(zone_low, 2),
              "zone_high": round(zone_high, 2), "status": status,
              "last_signal_age_days": age, "latest_close": float(price_df["Close"].iloc[-1]),
          },
          "targets": {
              "tp1": float(anchor.target_price) if anchor.target_price else None,
              "sl": float(anchor.stop_loss_price) if anchor.stop_loss_price else None,
          },
          "analog": None, "catalyst": None,
      }


  def _build_candidates(buy_eps, sell_sources, opp_by_symbol, sector_by_symbol, as_of):
      """Build and sort candidate dicts for all symbols with open BUY episodes."""
      candidates = []
      for symbol, eps in buy_eps.items():
          candidate = _build_candidate_for_symbol(
              symbol, eps, sell_sources, opp_by_symbol, sector_by_symbol, as_of
          )
          if candidate is not None:
              candidates.append(candidate)
      candidates.sort(key=lambda c: -c["confluence_score"])
      return candidates


  def _attach_analogs_catalysts(picks, as_of):
      """Mutate each pick in-place, attaching analog stats and nearest catalyst."""
      catalysts = upcoming_catalysts(as_of=as_of)
      catalyst_by_symbol = {c["symbol"]: c for c in reversed(catalysts)}
      for pick in picks:
          pick["analog"] = analog_stats(pick["symbol"], as_of=as_of)
          pick["catalyst"] = catalyst_by_symbol.get(pick["symbol"])
      return catalysts


  def _upsert_plan(plan_date, as_of, regime_info, picks, others, exits, catalysts, entry_statuses):
      """Create or update the DailyTradingPlan row and return the instance."""
      from stocks.models import DailyTradingPlan
      existing = DailyTradingPlan.objects.filter(date=plan_date).first()
      regenerated = existing is None or existing.payload.get("as_of") != as_of.isoformat()
      plan, _created = DailyTradingPlan.objects.update_or_create(
          date=plan_date,
          defaults={
              "regime": regime_info.get("regime", "UNKNOWN"),
              "breadth": regime_info.get("breadth"),
              "payload": {
                  "as_of": as_of.isoformat(),
                  "picks": picks, "watch": others[:10],
                  "exits": exits, "catalysts": catalysts,
                  "market_context": _market_context(as_of),
                  "entry_statuses": entry_statuses,
              },
          },
      )
      plan.was_regenerated = regenerated
      return plan
  ```

  Replace `build_daily_plan` body with:

  ```python
  def build_daily_plan(as_of=None):
      """Build and upsert the plan. `as_of` = latest completed session (default: latest price date)."""
      from stocks.models import DailyStockPrice
      if as_of is None:
          latest = DailyStockPrice.objects.order_by("-date").values_list("date", flat=True).first()
          if latest is None:
              raise ValueError("no price data; cannot build plan")
          as_of = latest
      regime_info = current_regime(as_of=as_of)
      opp_result, opp_by_symbol = _fetch_opportunities()
      buy_eps, sell_sources = _fetch_active_episodes()
      sector_by_symbol = _sector_intensities()
      candidates = _build_candidates(buy_eps, sell_sources, opp_by_symbol, sector_by_symbol, as_of)
      entry_statuses = {c["symbol"]: c["entry"]["status"] for c in candidates}
      in_zone = [c for c in candidates if c["entry"]["status"] == "IN_ZONE"]
      picks = in_zone[:MAX_PICKS]
      others = [c for c in candidates if c not in picks]
      catalysts = _attach_analogs_catalysts(picks, as_of)
      exits = [
          {"symbol": row["symbol"], "producer": row.get("producer"), "close": row.get("close")}
          for row in opp_result.get("exits", [])
      ]
      plan_date = next_trading_date(as_of)
      return _upsert_plan(plan_date, as_of, regime_info, picks, others, exits, catalysts, entry_statuses)
  ```

- [ ] **4.4 Run tests — confirm green**

  ```bash
  cd /Users/jugalraj/Documents/Projects/Stockastic/backend
  pytest stocks/tests/test_daily_plan_refactor.py -v
  ```

- [ ] **4.5 Run full stocks test suite to catch regressions**

  ```bash
  cd /Users/jugalraj/Documents/Projects/Stockastic/backend
  pytest stocks/ -x --timeout=60
  ```

- [ ] **4.6 Commit**

  ```bash
  cd /Users/jugalraj/Documents/Projects/Stockastic/backend
  git add stocks/services/daily_plan.py stocks/tests/test_daily_plan_refactor.py
  git commit -m "refactor(daily-plan): extract _fetch_opportunities, _fetch_active_episodes, _build_candidates, _attach_analogs_catalysts, _upsert_plan; slim build_daily_plan to ≤30 lines"
  ```

---

## Task 5 — Slim `user_overlay` helpers

`user_overlay` (lines 211-265, 55 lines) has three distinct loops: portfolio position proximity checks, sell-signal flip detection for held positions, and watchlist entry trigger checks. Extract each loop into its own helper.

- [ ] **5.1 Write failing tests**

  Append to `backend/stocks/tests/test_daily_plan_refactor.py`:

  ```python
  class TestNearPositionActions:
      def test_returns_empty_when_no_closes(self):
          from stocks.services.daily_plan import _near_position_actions
          item = MagicMock()
          item.ticker = "NABIL"
          result = _near_position_actions(items=[item], closes={})
          assert result == []

      def test_flags_stop_loss_proximity(self):
          from stocks.services.daily_plan import _near_position_actions
          item = MagicMock()
          item.ticker = "NABIL"
          item.stop_loss_price = 95.0
          item.target_price = 120.0
          item.target_price_2 = None
          item.target_price_3 = None
          # close at 95 — exactly at stop loss
          result = _near_position_actions(items=[item], closes={"NABIL": 95.0})
          assert len(result) == 1
          assert result[0]["near"] == "STOP_LOSS"

      def test_flags_target_price_proximity(self):
          from stocks.services.daily_plan import _near_position_actions
          item = MagicMock()
          item.ticker = "SCB"
          item.stop_loss_price = 80.0
          item.target_price = 120.0
          item.target_price_2 = None
          item.target_price_3 = None
          # close at 120 — at TP1
          result = _near_position_actions(items=[item], closes={"SCB": 120.0})
          assert len(result) == 1
          assert result[0]["near"] == "TP1"

      def test_excludes_items_without_action_level(self):
          from stocks.services.daily_plan import _near_position_actions
          item = MagicMock()
          item.ticker = "MEGA"
          item.stop_loss_price = 80.0
          item.target_price = 120.0
          item.target_price_2 = None
          item.target_price_3 = None
          # close at 100 — far from both levels
          result = _near_position_actions(items=[item], closes={"MEGA": 100.0})
          assert result == []


  class TestSignalFlips:
      def test_returns_flips_for_held_symbols(self):
          from stocks.services.daily_plan import _signal_flips_for_held
          ep = MagicMock()
          ep.symbol = "NABIL"
          ep.source = "RSI_OVERBOUGHT"
          ep.start_date = date(2026, 6, 10)
          ep.start_date.isoformat = lambda: "2026-06-10"
          ep.entry_strength = 0.7
          with patch("stocks.services.daily_plan.SignalEpisode") as mock_model:
              mock_model.objects.filter.return_value = [ep]
              result = _signal_flips_for_held(held={"NABIL"})
          assert len(result) == 1
          assert result[0]["symbol"] == "NABIL"

      def test_returns_empty_when_no_held(self):
          from stocks.services.daily_plan import _signal_flips_for_held
          result = _signal_flips_for_held(held=set())
          assert result == []


  class TestWatchlistTriggers:
      def test_triggers_when_close_at_or_below_target(self):
          from stocks.services.daily_plan import _watchlist_triggers
          w = MagicMock()
          w.ticker = "NABIL"
          w.target_price = 100.0
          w.stop_loss_price = None
          result = _watchlist_triggers(watch=[w], closes={"NABIL": 100.0})
          assert len(result) == 1
          assert result[0]["ticker"] == "NABIL"

      def test_excludes_when_far_from_all_levels(self):
          from stocks.services.daily_plan import _watchlist_triggers
          w = MagicMock()
          w.ticker = "SCB"
          w.target_price = 100.0
          w.stop_loss_price = None
          result = _watchlist_triggers(watch=[w], closes={"SCB": 150.0})
          assert result == []

      def test_returns_empty_when_no_closes(self):
          from stocks.services.daily_plan import _watchlist_triggers
          w = MagicMock()
          w.ticker = "MEGA"
          w.target_price = 100.0
          w.stop_loss_price = None
          result = _watchlist_triggers(watch=[w], closes={})
          assert result == []
  ```

- [ ] **5.2 Run tests — confirm red**

  ```bash
  cd /Users/jugalraj/Documents/Projects/Stockastic/backend
  source venv/bin/activate
  pytest stocks/tests/test_daily_plan_refactor.py::TestNearPositionActions \
         stocks/tests/test_daily_plan_refactor.py::TestSignalFlips \
         stocks/tests/test_daily_plan_refactor.py::TestWatchlistTriggers -x
  ```

- [ ] **5.3 Implement the 3 helpers and slim `user_overlay`**

  In `backend/stocks/services/daily_plan.py`, add these module-level functions (before `user_overlay`):

  ```python
  def _near_position_actions(items, closes):
      """Return position-action alerts for portfolio items near key price levels."""
      positions = []
      for item in items:
          close = closes.get(item.ticker)
          if close is None:
              continue
          near = None
          if _near(close, item.stop_loss_price) or (
              item.stop_loss_price is not None and close <= float(item.stop_loss_price)
          ):
              near = "STOP_LOSS"
          else:
              for level, label in (
                  (item.target_price, "TP1"),
                  (item.target_price_2, "TP2"),
                  (item.target_price_3, "TP3"),
              ):
                  if _near(close, level) or (level is not None and close >= float(level)):
                      near = label
                      break
          if near:
              positions.append({
                  "ticker": item.ticker, "near": near, "close": close,
                  "stop_loss_price": float(item.stop_loss_price) if item.stop_loss_price else None,
                  "target_price": float(item.target_price) if item.target_price else None,
              })
      return positions


  def _signal_flips_for_held(held):
      """Return open SELL-direction episodes for symbols currently held in portfolio."""
      if not held:
          return []
      from stocks.models import SignalEpisode
      return [
          {"symbol": ep.symbol, "source": ep.source,
           "since": ep.start_date.isoformat(), "strength": ep.entry_strength}
          for ep in SignalEpisode.objects.filter(end_date__isnull=True, direction="SELL", symbol__in=held)
      ]


  def _watchlist_triggers(watch, closes):
      """Return watchlist items whose close has reached or is near the desired entry level."""
      triggers = []
      for w in watch:
          close = closes.get(w.ticker)
          if close is None:
              continue
          if (
              _near(close, w.target_price)
              or _near(close, w.stop_loss_price)
              or (w.target_price is not None and close <= float(w.target_price))
          ):
              triggers.append({
                  "ticker": w.ticker, "close": close,
                  "target_price": float(w.target_price) if w.target_price else None,
                  "stop_loss_price": float(w.stop_loss_price) if w.stop_loss_price else None,
              })
      return triggers
  ```

  Replace `user_overlay` body with:

  ```python
  def user_overlay(user):
      """Per-user actions for tomorrow. Cheap indexed queries; safe for read-time use."""
      from stocks.models import PortfolioItem, WatchlistItem
      items = list(PortfolioItem.objects.filter(user=user))
      watch = list(WatchlistItem.objects.filter(user=user))
      closes = _latest_closes([i.ticker for i in items] + [w.ticker for w in watch]) if (items or watch) else {}
      positions = _near_position_actions(items, closes)
      held = {i.ticker for i in items}
      flips = _signal_flips_for_held(held)
      triggers = _watchlist_triggers(watch, closes)
      return {"positions_near_action": positions, "signal_flips": flips, "watchlist_triggers": triggers}
  ```

- [ ] **5.4 Run all daily-plan tests — confirm green**

  ```bash
  cd /Users/jugalraj/Documents/Projects/Stockastic/backend
  pytest stocks/tests/test_daily_plan_refactor.py -v
  ```

- [ ] **5.5 Run full stocks test suite**

  ```bash
  cd /Users/jugalraj/Documents/Projects/Stockastic/backend
  pytest stocks/ -x --timeout=60
  ```

- [ ] **5.6 Commit**

  ```bash
  cd /Users/jugalraj/Documents/Projects/Stockastic/backend
  git add stocks/services/daily_plan.py stocks/tests/test_daily_plan_refactor.py
  git commit -m "refactor(daily-plan): extract _near_position_actions, _signal_flips_for_held, _watchlist_triggers; slim user_overlay to ≤10 lines"
  ```

---

## Task 6 — Final 30-line check

- [ ] **6.1 Run the AST scanner against all services**

  ```bash
  cd /Users/jugalraj/Documents/Projects/Stockastic/backend
  source venv/bin/activate
  python - << 'EOF'
  import ast
  from pathlib import Path
  violations = []
  for p in Path('stocks/services').rglob('*.py'):
      try:
          tree = ast.parse(p.read_text())
          for n in ast.walk(tree):
              if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)):
                  lines = n.end_lineno - n.lineno + 1
                  if lines > 30:
                      violations.append(f"{p}:{n.lineno} {n.name}()={lines}")
      except Exception as exc:
          violations.append(f"{p}: parse error — {exc}")
  print('\n'.join(violations) or "All ≤30 lines ✓")
  EOF
  ```

  Expected output: `All ≤30 lines ✓`

- [ ] **6.2 Fix any remaining violations** before committing. Re-run the scanner until it is clean.

- [ ] **6.3 Run the complete test suite one final time**

  ```bash
  cd /Users/jugalraj/Documents/Projects/Stockastic/backend
  pytest stocks/ --timeout=60
  ```

- [ ] **6.4 Final commit (if any fixes were needed in 6.2)**

  ```bash
  cd /Users/jugalraj/Documents/Projects/Stockastic/backend
  git add -p
  git commit -m "refactor(services): fix remaining 30-line violations found by AST scanner"
  ```

---

## Summary of extractions

| File | Before | New helpers | After |
|---|---|---|---|
| `position_sizing.py` | `_generate_warnings` 61 ln | `_risk_warning`, `_position_warning`, `_shares_warning`, `_leverage_warning` | 5 ln |
| `position_sizing.py` | `calculate_position_size` 99 ln | `_compute_core`, `_append_rr_fields` | ≤30 ln |
| `ticker_verdict.py` | `build_verdict` 70 ln | `_collect_episodes`, `_build_entry_targets` | ≤30 ln |
| `daily_plan.py` | `build_daily_plan` 108 ln | `_fetch_opportunities`, `_fetch_active_episodes`, `_build_candidate_for_symbol`, `_build_candidates`, `_attach_analogs_catalysts`, `_upsert_plan` | ≤30 ln |
| `daily_plan.py` | `user_overlay` 55 ln | `_near_position_actions`, `_signal_flips_for_held`, `_watchlist_triggers` | ≤10 ln |
