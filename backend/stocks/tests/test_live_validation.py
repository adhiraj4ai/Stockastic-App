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
    assert tr["avg_pnl_pct"] == pytest.approx((7*5.0 + 3*-3.0) / 10)


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
    _ep("ENGINE_D", "API", "WON", 4.0)
    tr = producer_track_record("ENGINE_D")
    assert trust_tier(backtest_expectancy=0.03, live=tr) == "UNCONFIRMED"
