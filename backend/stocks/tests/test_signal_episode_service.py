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


from stocks.models import DailyStockPrice
from stocks.services.signal_episode.service import evaluate_active_episodes


def _price(d, high, low, close):
    return DailyStockPrice.objects.create(
        ticker="NABIL", date=date(2026, 1, d),
        open=Decimal(close), high=Decimal(high), low=Decimal(low),
        close=Decimal(close), volume=Decimal("1000"),
    )


@pytest.mark.django_db
def test_buy_episode_hits_target_marks_won():
    _ingest(1, "BUY", close="100", target="110", stop="95")
    _price(1, high="101", low="99", close="100")   # entry day — must NOT trigger
    _price(2, high="112", low="100", close="111")  # target hit
    evaluate_active_episodes()
    ep = SignalEpisode.objects.get(symbol="NABIL")
    assert ep.status == "WON" and ep.exit_reason == "TARGET"
    assert ep.exit_price == Decimal("110") and ep.end_date == date(2026, 1, 2)
    assert ep.pnl_percent == Decimal("10.00")


@pytest.mark.django_db
def test_entry_day_is_not_evaluated():
    _ingest(1, "BUY", close="100", target="100.5", stop="95")
    _price(1, high="200", low="100", close="100")  # huge high on entry day
    evaluate_active_episodes()
    assert SignalEpisode.objects.get(symbol="NABIL").status == "ACTIVE"


@pytest.mark.django_db
def test_episode_without_plan_is_skipped():
    _ingest(1, "BUY", close="100")  # no target/stop (user-strategy case)
    _price(2, high="500", low="1", close="250")
    evaluate_active_episodes()
    assert SignalEpisode.objects.get(symbol="NABIL").status == "ACTIVE"


@pytest.mark.django_db
def test_days_held_counts_trading_days_only():
    ep = _open_episode(symbol="HELD")
    ep.last_signal_date = date(2026, 1, 9)
    ep.save()
    # Only 3 trading rows in the window despite the 9-day calendar span.
    for d in (1, 5, 9):
        DailyStockPrice.objects.create(
            ticker="HELD", date=date(2026, 1, d), open=Decimal("1"),
            high=Decimal("1"), low=Decimal("1"), close=Decimal("1"), volume=Decimal("1"),
        )
    assert ep.days_held() == 3
