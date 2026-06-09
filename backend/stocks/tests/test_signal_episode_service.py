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
