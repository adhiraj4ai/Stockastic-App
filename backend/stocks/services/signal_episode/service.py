# backend/stocks/services/signal_episode/service.py
import logging
from decimal import Decimal
from django.db import transaction
from ...models import SignalEpisode, DailyStockPrice
from .reading import SignalReading
from .state_machine import decide, EpisodeSnapshot, OPEN, EXTEND, FLIP, SUPPRESS, NOOP

logger = logging.getLogger(__name__)


def _snapshot(ep):
    return None if ep is None else EpisodeSnapshot(direction=ep.direction, exit_reason=ep.exit_reason)


def _open(source, strategy, producer_key, symbol, reading: SignalReading):
    SignalEpisode.objects.create(
        source=source, strategy=strategy, producer_key=producer_key, symbol=symbol,
        direction=reading.direction, start_date=reading.date, last_signal_date=reading.date,
        entry_price=reading.close, target_price=reading.target_price,
        stop_loss_price=reading.stop_loss_price, entry_strength=reading.strength,
        peak_strength=reading.strength, signal_tier=reading.signal_tier,
        rationale=reading.rationale, metadata=reading.metadata, status="ACTIVE",
    )


def _close(ep, reading, status, reason):
    ep.end_date = reading.date
    ep.exit_price = reading.close
    ep.exit_reason = reason
    ep.status = status
    if ep.entry_price:
        if ep.direction == "BUY":
            ep.pnl_percent = (reading.close - ep.entry_price) / ep.entry_price * 100
        else:
            ep.pnl_percent = (ep.entry_price - reading.close) / ep.entry_price * 100
    ep.save()


@transaction.atomic
def ingest_reading(source, strategy, symbol, reading: SignalReading):
    """Apply spec §4A for one producer/symbol/day. Returns the action taken."""
    producer_key = SignalEpisode.make_producer_key(source, strategy.id if strategy else None)
    base = SignalEpisode.objects.filter(producer_key=producer_key, symbol=symbol)
    open_ep = base.filter(end_date__isnull=True).first()
    latest_ep = base.order_by("-start_date").first()

    action = decide(_snapshot(open_ep), _snapshot(latest_ep), reading).action

    if action == EXTEND:
        open_ep.last_signal_date = reading.date
        open_ep.peak_strength = max(open_ep.peak_strength, reading.strength)
        open_ep.save(update_fields=["last_signal_date", "peak_strength", "updated_at"])
    elif action == FLIP:
        _close(open_ep, reading, status="FLIPPED", reason="SIGNAL_FLIP")
        _open(source, strategy, producer_key, symbol, reading)
    elif action == OPEN:
        _open(source, strategy, producer_key, symbol, reading)
    # SUPPRESS / NOOP: nothing
    return action


def _check_hit(direction, target, stop, high, low):
    """Return (status, reason, exit_price) for first TP/SL hit, else None.

    Intrabar tie-break: daily bars carry no intrabar sequence, so when a single
    bar's range spans BOTH the target and the stop, target is checked first and
    therefore wins (the episode closes WON). This is deliberate and consistent.
    """
    if direction == "BUY":
        if target is not None and high >= target:
            return "WON", "TARGET", target
        if stop is not None and low <= stop:
            return "LOST", "STOP", stop
    else:  # SELL
        if target is not None and low <= target:
            return "WON", "TARGET", target
        if stop is not None and high >= stop:
            return "LOST", "STOP", stop
    return None


def evaluate_active_episodes():
    """Spec §4B. Walk prices AFTER start_date; first TP/SL hit closes the episode.
    Episodes without a target AND stop are skipped. Returns count closed."""
    closed = 0
    actives = SignalEpisode.objects.filter(status="ACTIVE")
    for ep in actives:
        if ep.target_price is None and ep.stop_loss_price is None:
            continue
        prices = (DailyStockPrice.objects
                  .filter(ticker=ep.symbol, date__gt=ep.start_date)
                  .order_by("date")
                  .values("date", "high", "low"))
        for p in prices:
            high, low = Decimal(str(p["high"])), Decimal(str(p["low"]))
            hit = _check_hit(ep.direction, ep.target_price, ep.stop_loss_price, high, low)
            if hit:
                status, reason, exit_price = hit
                ep.end_date = p["date"]
                ep.exit_price = exit_price
                ep.exit_reason = reason
                ep.status = status
                if ep.entry_price:
                    if ep.direction == "BUY":
                        ep.pnl_percent = (exit_price - ep.entry_price) / ep.entry_price * 100
                    else:
                        ep.pnl_percent = (ep.entry_price - exit_price) / ep.entry_price * 100
                ep.save()
                closed += 1
                break
    return closed
