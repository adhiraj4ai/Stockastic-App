# backend/stocks/tests/test_total_return_service.py
import pytest
from decimal import Decimal
from datetime import date
from django.contrib.auth import get_user_model
from stocks.models.portfolio import PortfolioItem
from stocks.models.market import DailyStockPrice
from stocks.services import total_return_service as trs
from stocks.services.total_return_service import TotalReturnService

pytestmark = pytest.mark.django_db
User = get_user_model()


def _price(ticker, close):
    DailyStockPrice.objects.create(ticker=ticker, date=date(2026, 1, 2),
                                   open=close, high=close, low=close, close=close, volume=100)


def _fake_dividends(cash_by_ticker, realized_by_ticker, bonus_by_ticker):
    history = [{"ticker": t, "cash_dividend_net": v, "bonus_shares": bonus_by_ticker.get(t, 0)}
               for t, v in cash_by_ticker.items()]
    realized = [{"ticker": t, "realized_pnl": v} for t, v in realized_by_ticker.items()]
    return {"history": history, "realized_pnl": realized,
            "summary": {"total_cash_net": float(sum(cash_by_ticker.values())),
                        "total_realized_pnl": float(sum(realized_by_ticker.values()))}}


def test_flat_price_with_dividends_shows_positive_total_return(monkeypatch):
    user = User.objects.create_user(username="d1", password="p")
    PortfolioItem.objects.create(user=user, ticker="NABIL", quantity=100, buy_price=Decimal("500"),
                                 wacc=Decimal("500"))
    _price("NABIL", 500)   # flat: zero unrealized
    monkeypatch.setattr(trs.DividendService, "calculate_dividends",
                        staticmethod(lambda u: _fake_dividends({"NABIL": 4000.0}, {}, {})))
    out = TotalReturnService.compute(user)
    row = next(h for h in out["holdings"] if h["ticker"] == "NABIL")
    assert row["unrealized"] == pytest.approx(0.0)
    assert row["cash_dividends_net"] == pytest.approx(4000.0)
    assert row["total_return_abs"] == pytest.approx(4000.0)         # dividends alone
    assert row["total_return_pct"] == pytest.approx(4000.0 / (100 * 500) * 100)


def test_price_gain_plus_dividends_sum(monkeypatch):
    user = User.objects.create_user(username="d2", password="p")
    PortfolioItem.objects.create(user=user, ticker="NABIL", quantity=100, buy_price=Decimal("500"),
                                 wacc=Decimal("500"))
    _price("NABIL", 600)   # +100/share -> +10,000 unrealized
    monkeypatch.setattr(trs.DividendService, "calculate_dividends",
                        staticmethod(lambda u: _fake_dividends({"NABIL": 4000.0}, {}, {})))
    out = TotalReturnService.compute(user)
    row = next(h for h in out["holdings"] if h["ticker"] == "NABIL")
    assert row["unrealized"] == pytest.approx(10000.0)
    assert row["total_return_abs"] == pytest.approx(14000.0)


def test_bonus_not_double_counted(monkeypatch):
    # Holding already includes bonus shares (qty up, wacc diluted). Reported bonus count is
    # informational; total return must equal unrealized + cash, NOT + bonus value.
    user = User.objects.create_user(username="d3", password="p")
    PortfolioItem.objects.create(user=user, ticker="NABIL", quantity=110, buy_price=Decimal("454.55"),
                                 wacc=Decimal("454.55"))   # 100 bought + 10 bonus, cost flat
    _price("NABIL", 500)
    monkeypatch.setattr(trs.DividendService, "calculate_dividends",
                        staticmethod(lambda u: _fake_dividends({"NABIL": 0.0}, {}, {"NABIL": 10})))
    out = TotalReturnService.compute(user)
    row = next(h for h in out["holdings"] if h["ticker"] == "NABIL")
    assert row["bonus_shares_received"] == 10
    expected_unrealized = 110 * 500 - 110 * 454.55
    assert row["total_return_abs"] == pytest.approx(expected_unrealized, abs=1.0)  # no +bonus value


def test_summary_aggregates_realized_and_cash(monkeypatch):
    user = User.objects.create_user(username="d4", password="p")
    PortfolioItem.objects.create(user=user, ticker="NABIL", quantity=100, buy_price=Decimal("500"),
                                 wacc=Decimal("500"))
    _price("NABIL", 550)
    monkeypatch.setattr(trs.DividendService, "calculate_dividends",
                        staticmethod(lambda u: _fake_dividends({"NABIL": 4000.0}, {"OHL": 2000.0}, {})))
    out = TotalReturnService.compute(user)
    s = out["summary"]
    assert s["total_cash_dividends"] == pytest.approx(4000.0)
    assert s["total_realized_pnl"] == pytest.approx(2000.0)
    # portfolio total = held unrealized (5,000) + cash (4,000) + realized (2,000)
    assert s["portfolio_total_return"] == pytest.approx(5000.0 + 4000.0 + 2000.0)
