# backend/stocks/services/signal_episode/backfill.py
from .service import ingest_reading, evaluate_active_episodes


def replay_producer_symbol(source, strategy, symbol, readings):
    """Replay a chronologically-sorted list of SignalReading for one producer/symbol.
    Per spec §4: ingest the day's reading first, then evaluate TP/SL (which only looks
    at prices strictly after each episode's start_date, so same-day entry is safe)."""
    for reading in sorted(readings, key=lambda r: r.date):
        ingest_reading(source=source, strategy=strategy, symbol=symbol, reading=reading)
        evaluate_active_episodes()
