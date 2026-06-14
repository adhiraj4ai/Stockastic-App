"""Inbound pydantic models — the ONLY place that maps raw NEPSE JSON keys.

Each model mirrors one provider response row. A shared `mode="before"`
model-validator resolves each canonical field to the first aliased key whose
value is present (not None/""), reproducing the legacy `_pick`. The
`_coerce_number` field-validator reproduces the comma-stripping / "-"-sentinel
coercion. Required fields are typed non-optional, so a sentinel/missing value
becomes None and fails validation -> ValidationError, which the provider
re-raises as ProviderSchemaError.
"""
from __future__ import annotations

from typing import ClassVar, Optional

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

# Candidate key names per logical field (first present key wins). Single source
# of truth for raw NEPSE field names.
PRICE_ALIASES = {
    "symbol": ("symbol", "stockSymbol", "securitySymbol"),
    "close": ("closePrice", "lastTradedPrice", "ltp", "close"),
    "open": ("openPrice", "open"),
    "high": ("highPrice", "high"),
    "low": ("lowPrice", "low"),
    "volume": ("totalTradedQuantity", "totalTradeQuantity", "volume"),
    "turnover": ("totalTradedValue", "totalTradeValue", "amount", "turnover"),
    "prev_close": ("previousClose", "previousDayClosePrice", "prev_close"),
    "vwap": ("averageTradedPrice", "vwap"),
    "trans": ("totalTrades", "totalTransactions", "trans"),
    "weeks_52_high": ("fiftyTwoWeekHigh", "weeks_52_high"),
    "weeks_52_low": ("fiftyTwoWeekLow", "weeks_52_low"),
}

_NUMERIC_SENTINELS = (None, "", "-")
_ABSENT_VALUES = (None, "")


def _coerce_number(value):
    """Mirror legacy `_num`: sentinels -> None, strip commas, else float.

    Returns None for anything unparseable; on a required field that None fails
    validation -> ValidationError -> ProviderSchemaError.
    """
    if value in _NUMERIC_SENTINELS:
        return None
    try:
        return float(str(value).replace(",", ""))
    except (TypeError, ValueError):
        return None


def _pick_alias(row: dict, keys: tuple[str, ...]):
    """First aliased key whose value is present (not None/""), else None.

    Mirrors legacy `_pick`: a None/"" value is skipped so a later alias can
    supply the value. "-" is NOT skipped here (numeric coercion handles it).
    """
    for key in keys:
        if key in row and row[key] not in _ABSENT_VALUES:
            return row[key]
    return None


class _RawRow(BaseModel):
    model_config = ConfigDict(extra="ignore")
    ALIASES: ClassVar[dict] = {}

    @model_validator(mode="before")
    @classmethod
    def _resolve_aliases(cls, data):
        if not isinstance(data, dict):
            return data
        return {field: _pick_alias(data, keys) for field, keys in cls.ALIASES.items()}


class RawPriceRow(_RawRow):
    ALIASES: ClassVar[dict] = PRICE_ALIASES

    symbol: str
    close: float
    open: Optional[float] = None
    high: Optional[float] = None
    low: Optional[float] = None
    volume: Optional[float] = None
    turnover: Optional[float] = None
    prev_close: Optional[float] = None
    vwap: Optional[float] = None
    trans: Optional[int] = None
    weeks_52_high: Optional[float] = None
    weeks_52_low: Optional[float] = None

    @field_validator(
        "close", "open", "high", "low", "volume", "turnover",
        "prev_close", "vwap", "trans", "weeks_52_high", "weeks_52_low",
        mode="before",
    )
    @classmethod
    def _clean_numbers(cls, value):
        return _coerce_number(value)
