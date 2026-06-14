"""Inbound pydantic models — the ONLY place that maps raw NEPSE JSON keys.

Each model mirrors one provider response row. `AliasChoices` reproduces the
"first present key wins" behaviour; the shared `_coerce_number` before-validator
reproduces the comma-stripping / "-"-sentinel coercion. Required fields are
typed non-optional, so a sentinel/missing value raises ValidationError, which
the provider re-raises as ProviderSchemaError.
"""
from __future__ import annotations

from typing import Optional

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator

# Candidate key names per logical field (first match wins). Single source of
# truth shared with the provider's mapping intent.
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

_SENTINELS = (None, "", "-")


def _coerce_number(value):
    """Mirror the legacy `_num`: sentinels -> None, strip commas, else float.

    Returns None for anything unparseable. On a required (non-optional) field a
    None result fails validation -> ValidationError -> ProviderSchemaError.
    """
    if value in _SENTINELS:
        return None
    try:
        return float(str(value).replace(",", ""))
    except (TypeError, ValueError):
        return None


def _alias(field_keys) -> AliasChoices:
    return AliasChoices(*field_keys)


class _RawRow(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")


class RawPriceRow(_RawRow):
    symbol: str = Field(validation_alias=_alias(PRICE_ALIASES["symbol"]))
    close: float = Field(validation_alias=_alias(PRICE_ALIASES["close"]))
    open: Optional[float] = Field(default=None, validation_alias=_alias(PRICE_ALIASES["open"]))
    high: Optional[float] = Field(default=None, validation_alias=_alias(PRICE_ALIASES["high"]))
    low: Optional[float] = Field(default=None, validation_alias=_alias(PRICE_ALIASES["low"]))
    volume: Optional[float] = Field(default=None, validation_alias=_alias(PRICE_ALIASES["volume"]))
    turnover: Optional[float] = Field(default=None, validation_alias=_alias(PRICE_ALIASES["turnover"]))
    prev_close: Optional[float] = Field(default=None, validation_alias=_alias(PRICE_ALIASES["prev_close"]))
    vwap: Optional[float] = Field(default=None, validation_alias=_alias(PRICE_ALIASES["vwap"]))
    trans: Optional[int] = Field(default=None, validation_alias=_alias(PRICE_ALIASES["trans"]))
    weeks_52_high: Optional[float] = Field(default=None, validation_alias=_alias(PRICE_ALIASES["weeks_52_high"]))
    weeks_52_low: Optional[float] = Field(default=None, validation_alias=_alias(PRICE_ALIASES["weeks_52_low"]))

    @field_validator(
        "close", "open", "high", "low", "volume", "turnover",
        "prev_close", "vwap", "trans", "weeks_52_high", "weeks_52_low",
        mode="before",
    )
    @classmethod
    def _clean_numbers(cls, value):
        return _coerce_number(value)
