# backend/stocks/tests/test_ingest_validation.py
"""Ingress validation for manually uploaded daily price rows."""
from stocks.models import DailyStockPrice
from stocks.services.ingest_validation import validate_price_rows


def _row(**kw):
    base = dict(ticker="TEST", date="2025-01-01", open=100, high=105,
                low=98, close=102, volume=500)
    base.update(kw)
    return DailyStockPrice(**base)


def test_clean_row_passes():
    valid, rejected = validate_price_rows([_row()])
    assert len(valid) == 1 and rejected == []


def test_zero_close_rejected():
    valid, rejected = validate_price_rows([_row(close=0)])
    assert valid == [] and rejected[0][1] == "non-positive close"


def test_negative_volume_rejected():
    valid, rejected = validate_price_rows([_row(volume=-5)])
    assert valid == [] and rejected[0][1] == "negative field"


def test_inconsistent_ohlc_clamped():
    # NEPSE bonds/debentures can arrive with high/low that don't span open/close.
    # Instead of rejecting, clamp so the bar is always coherent.

    # low=103 > open=100: clamp to min(103, open=100, close=102) = 100
    valid, rejected = validate_price_rows([_row(low=103)])
    assert len(valid) == 1 and rejected == []
    assert float(valid[0].low) == 100

    # high=99 < close=102: clamp to max(99, open=100, close=102) = 102
    valid, rejected = validate_price_rows([_row(high=99)])
    assert len(valid) == 1 and rejected == []
    assert float(valid[0].high) == 102


def test_missing_ohl_backfilled_to_close():
    # Source files use 0 for absent open/high/low ('-' in the CSV). Instead of
    # storing an incoherent bar (High=0 < Close), the legs are back-filled.
    valid, rejected = validate_price_rows([_row(open=0, high=0, low=0, close=102)])
    assert len(valid) == 1 and rejected == []
    bar = valid[0]
    assert float(bar.open) == 102 and float(bar.high) == 102 and float(bar.low) == 102


def test_partial_missing_legs_forced_coherent():
    # Non-zero open above the close with missing H/L: H/L must span open & close.
    valid, rejected = validate_price_rows([_row(open=110, high=0, low=0, close=102)])
    assert len(valid) == 1 and rejected == []
    bar = valid[0]
    assert float(bar.high) == 110 and float(bar.low) == 102


def test_mixed_batch_partitions():
    valid, rejected = validate_price_rows([_row(), _row(ticker="BAD", close=0)])
    assert len(valid) == 1 and len(rejected) == 1 and rejected[0][0] == "BAD"
