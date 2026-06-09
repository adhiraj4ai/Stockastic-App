# backend/stocks/tests/test_signal_episode_service.py
import pytest
from datetime import date
from decimal import Decimal
from django.db import IntegrityError
from stocks.models import SignalEpisode


def _open_episode(symbol="NABIL", source="SMART_MONEY", direction="BUY", strategy=None):
    return SignalEpisode.objects.create(
        source=source, strategy=strategy,
        producer_key=SignalEpisode.make_producer_key(source, strategy.id if strategy else None),
        symbol=symbol, direction=direction,
        start_date=date(2026, 1, 1), last_signal_date=date(2026, 1, 1),
        entry_price=Decimal("100"),
    )


@pytest.mark.django_db
def test_cannot_have_two_open_episodes_same_producer_symbol():
    _open_episode()
    with pytest.raises(IntegrityError):
        _open_episode()


@pytest.mark.django_db
def test_engine_producers_with_null_strategy_still_constrained():
    # Regression: nullable strategy must NOT defeat the partial unique index.
    _open_episode(source="SMART_MONEY", strategy=None)
    with pytest.raises(IntegrityError):
        _open_episode(source="SMART_MONEY", strategy=None)


from stocks.services.signal_episode.reading import SignalReading
from stocks.services.signal_episode.service import ingest_reading


def _reading(d, direction, close="100", target=None, stop=None, strength=10):
    return SignalReading(
        date=date(2026, 1, d), direction=direction, close=Decimal(close),
        target_price=Decimal(target) if target else None,
        stop_loss_price=Decimal(stop) if stop else None, strength=strength,
    )


def _ingest(d, direction, **kw):
    return ingest_reading(source="SMART_MONEY", strategy=None, symbol="NABIL",
                          reading=_reading(d, direction, **kw))


@pytest.mark.django_db
def test_ten_day_buy_run_is_one_episode():
    for day in range(1, 11):
        _ingest(day, "BUY")
    eps = SignalEpisode.objects.filter(symbol="NABIL")
    assert eps.count() == 1
    ep = eps.first()
    assert ep.start_date == date(2026, 1, 1)
    assert ep.last_signal_date == date(2026, 1, 10)
    assert ep.end_date is None and ep.status == "ACTIVE"


@pytest.mark.django_db
def test_flip_closes_and_opens_opposite():
    _ingest(1, "BUY", close="100")
    _ingest(2, "SELL", close="110")
    buy = SignalEpisode.objects.get(symbol="NABIL", direction="BUY")
    sell = SignalEpisode.objects.get(symbol="NABIL", direction="SELL")
    assert buy.status == "FLIPPED" and buy.exit_reason == "SIGNAL_FLIP"
    assert buy.exit_price == Decimal("110") and buy.end_date == date(2026, 1, 2)
    assert sell.status == "ACTIVE" and sell.start_date == date(2026, 1, 2)


@pytest.mark.django_db
def test_peak_strength_tracks_max():
    _ingest(1, "BUY", strength=20)
    _ingest(2, "BUY", strength=55)
    _ingest(3, "BUY", strength=40)
    assert SignalEpisode.objects.get(symbol="NABIL").peak_strength == 55
