# backend/stocks/tests/test_signal_episode_backfill.py
import pytest
from datetime import date
from decimal import Decimal
from stocks.models import SignalEpisode, DailyStockPrice
from stocks.services.signal_episode.reading import SignalReading
from stocks.services.signal_episode.backfill import replay_producer_symbol


def _reading(d, direction, close="100", target=None, stop=None):
    return SignalReading(
        date=date(2026, 1, d), direction=direction, close=Decimal(close),
        target_price=Decimal(target) if target else None,
        stop_loss_price=Decimal(stop) if stop else None,
    )


@pytest.mark.django_db
def test_replay_buy_then_sell_run_yields_two_episodes():
    for d in range(1, 11):
        DailyStockPrice.objects.create(
            ticker="NABIL", date=date(2026, 1, d), open=Decimal("100"),
            high=Decimal("101"), low=Decimal("99"), close=Decimal("100"), volume=Decimal("1"),
        )
    readings = [_reading(d, "BUY") for d in range(1, 6)] + [_reading(d, "SELL") for d in range(6, 11)]
    replay_producer_symbol(source="SMART_MONEY", strategy=None, symbol="NABIL", readings=readings)
    eps = list(SignalEpisode.objects.filter(symbol="NABIL").order_by("start_date"))
    assert len(eps) == 2
    assert eps[0].direction == "BUY" and eps[0].status == "FLIPPED" and eps[0].end_date == date(2026, 1, 6)
    assert eps[1].direction == "SELL" and eps[1].status == "ACTIVE"


@pytest.mark.django_db
def test_replay_tp_hit_then_no_reentry():
    for d in range(1, 8):
        DailyStockPrice.objects.create(
            ticker="NABIL", date=date(2026, 1, d), open=Decimal("100"),
            high=Decimal("120") if d >= 3 else Decimal("101"),
            low=Decimal("99"), close=Decimal("100"), volume=Decimal("1"),
        )
    readings = [_reading(d, "BUY", target="110", stop="95") for d in range(1, 8)]
    replay_producer_symbol(source="SMART_MONEY", strategy=None, symbol="NABIL", readings=readings)
    eps = list(SignalEpisode.objects.filter(symbol="NABIL"))
    assert len(eps) == 1                       # no re-entry while BUY persists
    assert eps[0].status == "WON" and eps[0].end_date == date(2026, 1, 3)
