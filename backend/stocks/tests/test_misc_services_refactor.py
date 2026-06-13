"""Tests for the Phase-4 SOLID refactor of miscellaneous service files.

Covers extracted helpers in:
  - strategy_scan.py
  - portfolio_drafts.py
  - finance.py
  - analogs.py
  - strategy_framework/base.py
  - data_sync_service.py
  - catalysts.py
  - ingest_validation.py
"""
import datetime
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest


# ─────────────────────────────────────────────────────────────────────────────
# strategy_scan helpers
# ─────────────────────────────────────────────────────────────────────────────
class TestStrategyScanHelpers:
    def test_pick_best_selects_top_return_that_beats_bh(self):
        from stocks.services.strategy_scan import _pick_best

        rows = [
            {"return_pct": 30.0, "buy_hold_return_pct": 20.0, "num_trades": 5,
             "beats_bh": True, "sortino": 1.0, "win_rate_reportable": True},
            {"return_pct": 50.0, "buy_hold_return_pct": 60.0, "num_trades": 5,
             "beats_bh": False, "sortino": 2.0, "win_rate_reportable": True},
            {"return_pct": 40.0, "buy_hold_return_pct": 30.0, "num_trades": 5,
             "beats_bh": True, "sortino": 0.5, "win_rate_reportable": True},
        ]
        ranked, best, best_ra = _pick_best(rows, min_trades=3)

        assert ranked[0]["return_pct"] == 50.0
        assert best["return_pct"] == 40.0   # highest that beats B&H
        assert best_ra["sortino"] == 2.0    # max sortino among active

    def test_pick_best_falls_back_to_ranked_when_none_beat_bh(self):
        from stocks.services.strategy_scan import _pick_best

        rows = [
            {"return_pct": 10.0, "buy_hold_return_pct": 20.0, "num_trades": 5,
             "beats_bh": False, "sortino": 0.5, "win_rate_reportable": True},
        ]
        _, best, _ = _pick_best(rows, min_trades=3)
        assert best["return_pct"] == 10.0

    def test_build_scan_result_shape(self):
        from stocks.services.strategy_scan import _build_scan_result

        rows = [{"beats_bh": True}, {"beats_bh": False}]
        result = _build_scan_result(
            "NABIL", ("1y",), False, {"1y": 5.0}, rows, [],
            ranked=rows, best=rows[0], best_ra=rows[0],
        )
        assert result["symbol"] == "NABIL"
        assert result["count"] == 2
        assert result["beating_bh"] == 1

    def test_scan_strategy_returns_error_when_no_backtests_ok(self):
        from stocks.services.strategy_scan import _scan_strategy

        failing_result = SimpleNamespace(ok=False)
        s = SimpleNamespace(id=1, name="TestStrat", spec=None)
        bh_by_tf = {}

        with patch("stocks.services.strategy_scan.run_backtest", return_value=failing_result):
            row, err = _scan_strategy(s, "TEST", ("1y",), False, 5, bh_by_tf)

        assert row is None
        assert err["error"] == "no successful backtest"


# ─────────────────────────────────────────────────────────────────────────────
# portfolio_drafts helpers
# ─────────────────────────────────────────────────────────────────────────────
class TestPortfolioDraftsHelpers:
    def _make_draft(self, status, is_expired=False, result=None):
        Status = SimpleNamespace(CONFIRMED="CONFIRMED", PENDING="PENDING", EXPIRED="EXPIRED")
        return SimpleNamespace(
            status=status, is_expired=is_expired, result=result,
            pk=1, user=None, account=None, payload={}, kind=None,
            save=MagicMock(),
        )

    def test_guard_returns_result_when_already_confirmed(self):
        from stocks.services.portfolio_drafts import _guard_draft_status, PortfolioActionDraft

        draft = MagicMock()
        draft.status = PortfolioActionDraft.Status.CONFIRMED
        draft.result = {"ok": True}

        result = _guard_draft_status(draft)
        assert result == {"ok": True}

    def test_guard_raises_on_non_pending_non_confirmed(self):
        from stocks.services.portfolio_drafts import _guard_draft_status, DraftError, PortfolioActionDraft

        draft = MagicMock()
        draft.status = PortfolioActionDraft.Status.EXPIRED

        with pytest.raises(DraftError, match="cannot be confirmed"):
            _guard_draft_status(draft)

    def test_guard_marks_expired_and_raises(self):
        from stocks.services.portfolio_drafts import _guard_draft_status, DraftError, PortfolioActionDraft

        draft = MagicMock()
        draft.status = PortfolioActionDraft.Status.PENDING
        draft.is_expired = True

        with pytest.raises(DraftError, match="expired"):
            _guard_draft_status(draft)
        draft.save.assert_called_once()

    def test_guard_returns_none_for_pending_non_expired(self):
        from stocks.services.portfolio_drafts import _guard_draft_status, PortfolioActionDraft

        draft = MagicMock()
        draft.status = PortfolioActionDraft.Status.PENDING
        draft.is_expired = False

        assert _guard_draft_status(draft) is None


# ─────────────────────────────────────────────────────────────────────────────
# finance helpers
# ─────────────────────────────────────────────────────────────────────────────
class TestFinanceHelpers:
    def test_xirr_returns_none_for_single_cashflow(self):
        from stocks.services.finance import xirr
        assert xirr([(datetime.date(2024, 1, 1), -100)]) is None

    def test_xirr_returns_none_when_no_sign_change(self):
        from stocks.services.finance import xirr
        flows = [(datetime.date(2024, 1, 1), 100), (datetime.date(2024, 6, 1), 200)]
        assert xirr(flows) is None

    def test_xirr_prepare_rejects_single_flow(self):
        from stocks.services.finance import _xirr_prepare
        assert _xirr_prepare([(datetime.date(2024, 1, 1), -100)]) is None

    def test_xirr_prepare_returns_amounts_and_years(self):
        from stocks.services.finance import _xirr_prepare
        flows = [(datetime.date(2024, 1, 1), -1000), (datetime.date(2025, 1, 1), 1100)]
        result = _xirr_prepare(flows)
        assert result is not None
        amounts, years = result
        assert amounts[0] == -1000.0
        assert abs(years[1] - 1.0) < 0.01

    def test_xirr_newton_converges_on_simple_case(self):
        from stocks.services.finance import _xirr_newton
        # npv function with known root at r=0.1
        def npv(r):
            return -1000 + 1100 / (1 + r)
        result = _xirr_newton(npv, 0.05)
        assert result is not None
        assert abs(result - 0.1) < 1e-5

    def test_xirr_bisection_finds_root(self):
        from stocks.services.finance import _xirr_bisection
        def npv(r):
            return -1000 + 1100 / (1 + r)
        result = _xirr_bisection(npv)
        assert result is not None
        assert abs(result - 0.1) < 1e-5


# ─────────────────────────────────────────────────────────────────────────────
# analogs helpers
# ─────────────────────────────────────────────────────────────────────────────
class TestAnalogsHelpers:
    def test_fingerprint_returns_tuple(self):
        import pandas as pd
        from stocks.services.analogs import _fingerprint

        intensity = pd.Series([5.0, 2.0])
        rsi = pd.Series([45.0, 35.0])

        fp = _fingerprint(intensity, rsi, None, 0)
        assert fp == ("MILD", "LOW", None)

    def test_find_match_positions_matches_fingerprint(self):
        import pandas as pd
        from stocks.services.analogs import _find_match_positions

        intensity = pd.Series([5.0, 5.0, 5.0])
        rsi = pd.Series([45.0, 45.0, 45.0])
        valid = pd.Series([True, True, True])
        today_fp = ("MILD", "LOW", None)

        df = pd.DataFrame({"Close": [100, 101, 102]})
        positions = _find_match_positions(df, intensity, rsi, None, valid, today_fp)
        assert positions == [0, 1]   # excludes last (today)

    def test_compute_signals_returns_none_intensity_when_no_accumulation(self):
        import pandas as pd
        import numpy as np
        from stocks.services.analogs import _compute_signals

        df = pd.DataFrame(
            {"Close": np.random.rand(100) + 1, "Volume": np.random.rand(100) * 1000},
            index=pd.date_range("2023-01-01", periods=100),
        )
        with patch("stocks.services.analogs._daily_total_accumulation", return_value=None):
            intensity, rsi, regime = _compute_signals(df, "TEST")
        assert intensity is None


# ─────────────────────────────────────────────────────────────────────────────
# strategy_framework/base helpers
# ─────────────────────────────────────────────────────────────────────────────
class TestBuildStrategyHelpers:
    def test_composed_try_entry_does_nothing_when_alpha_no_entry(self):
        from stocks.services.strategy_framework.base import _composed_try_entry

        alpha = MagicMock()
        alpha.entry.return_value = False
        strat = MagicMock()

        _composed_try_entry(strat, alpha, None, None, None, 100.0)
        strat.buy.assert_not_called()

    def test_composed_try_entry_calls_buy_when_signal(self):
        from stocks.services.strategy_framework.base import _composed_try_entry

        alpha = MagicMock()
        alpha.entry.return_value = True
        strat = MagicMock()

        _composed_try_entry(strat, alpha, None, None, None, 100.0)
        strat.buy.assert_called_once()

    def test_build_strategy_returns_strategy_class(self):
        from backtesting import Strategy as _BTStrategy
        from stocks.services.strategy_framework.base import Alpha, build_strategy

        class SimpleAlpha(Alpha):
            def entry(self, strat):
                return True

        cls = build_strategy(SimpleAlpha(), name="TestStrat")
        assert issubclass(cls, _BTStrategy)
        assert cls.__name__ == "TestStrat"


# ─────────────────────────────────────────────────────────────────────────────
# data_sync_service helpers
# ─────────────────────────────────────────────────────────────────────────────
class TestDataSyncServiceHelpers:
    def test_collect_company_indicators_skips_empty(self):
        from stocks.services.data_sync_service import DataSyncService

        company = SimpleNamespace(symbol="TEST", sector="Finance")
        sector_data, stock_results = {}, {}

        with patch("stocks.services.data_sync_service.get_technical_indicators", return_value=[]):
            DataSyncService._collect_company_indicators(company, sector_data, stock_results)

        assert "TEST" not in stock_results

    def test_collect_company_indicators_populates_sector_data(self):
        from stocks.services.data_sync_service import DataSyncService

        company = SimpleNamespace(symbol="NABIL", sector="Finance")
        sector_data, stock_results = {}, {}
        indicators = [{"name": "RSI", "raw_value": 55.0}]

        with patch("stocks.services.data_sync_service.get_technical_indicators", return_value=indicators):
            DataSyncService._collect_company_indicators(company, sector_data, stock_results)

        assert "NABIL" in stock_results
        assert "Finance" in sector_data
        assert sector_data["Finance"]["RSI"][0]["ticker"] == "NABIL"


# ─────────────────────────────────────────────────────────────────────────────
# catalysts helpers
# ─────────────────────────────────────────────────────────────────────────────
class TestCatalystsHelpers:
    def test_book_close_items_yields_correct_shape(self):
        from stocks.services.catalysts import _book_close_items

        as_of = datetime.date(2025, 1, 1)
        end = datetime.date(2025, 1, 15)

        mock_div = SimpleNamespace(
            ticker="NABIL", fiscal_year="2080-81",
            bonus_percent=10, cash_percent=5,
            book_close_date=datetime.date(2025, 1, 10),
        )
        mock_dividend_cls = MagicMock()
        mock_dividend_cls.objects.filter.return_value = [mock_div]

        with patch("stocks.models.Dividend", mock_dividend_cls):
            items = list(_book_close_items(as_of, end))

        assert len(items) == 1
        assert items[0]["type"] == "BOOK_CLOSE"
        assert items[0]["days_away"] == 9

    def test_dividend_announced_items_yields_correct_shape(self):
        from stocks.services.catalysts import _dividend_announced_items

        as_of = datetime.date(2025, 1, 1)
        end = datetime.date(2025, 1, 15)

        mock_report = SimpleNamespace(
            ticker="SCB", fiscal_year="2080-81",
            dividend_announced_date=datetime.date(2025, 1, 5),
        )
        mock_fr_cls = MagicMock()
        mock_fr_cls.objects.filter.return_value = [mock_report]

        with patch("stocks.models.FinancialReport", mock_fr_cls):
            items = list(_dividend_announced_items(as_of, end))

        assert len(items) == 1
        assert items[0]["type"] == "DIVIDEND_ANNOUNCED"
        assert items[0]["days_away"] == 4


# ─────────────────────────────────────────────────────────────────────────────
# ingest_validation helpers
# ─────────────────────────────────────────────────────────────────────────────
class TestIngestValidationHelpers:
    def _make_row(self, ticker="TEST", close=100, open=None, high=None, low=None, volume=1000):
        return SimpleNamespace(
            ticker=ticker, close=close, open=open, high=high, low=low, volume=volume
        )

    def test_rejection_reason_nonpositive_close(self):
        from stocks.services.ingest_validation import _rejection_reason
        row = self._make_row(close=0)
        assert _rejection_reason(row) == "non-positive close"

    def test_rejection_reason_negative_field(self):
        from stocks.services.ingest_validation import _rejection_reason
        row = self._make_row(close=100, volume=-1)
        assert _rejection_reason(row) == "negative field"

    def test_rejection_reason_none_for_valid(self):
        from stocks.services.ingest_validation import _rejection_reason
        row = self._make_row(close=100, open=95, high=105, low=90, volume=500)
        assert _rejection_reason(row) is None

    def test_clamp_ohlc_backfills_missing_legs(self):
        from stocks.services.ingest_validation import _clamp_ohlc
        row = SimpleNamespace(close=100, open=None, high=None, low=None)
        _clamp_ohlc(row)
        assert row.open == 100
        assert row.high == 100
        assert row.low == 100

    def test_clamp_ohlc_clamps_inconsistent_high_low(self):
        from stocks.services.ingest_validation import _clamp_ohlc
        row = SimpleNamespace(close=105, open=100, high=90, low=110)
        _clamp_ohlc(row)
        assert row.high >= max(100, 105)
        assert row.low <= min(100, 105)

    def test_validate_price_rows_partitions_correctly(self):
        from stocks.services.ingest_validation import validate_price_rows

        good = SimpleNamespace(ticker="A", close=100, open=95, high=105, low=90, volume=1000)
        bad = SimpleNamespace(ticker="B", close=0, open=0, high=0, low=0, volume=0)
        valid, rejected = validate_price_rows([good, bad])
        assert len(valid) == 1
        assert len(rejected) == 1
        assert rejected[0][0] == "B"
