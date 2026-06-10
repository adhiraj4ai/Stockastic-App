"""NepseApiProvider — the ONLY module that knows NepseAPI URLs and field names.

To switch data sources, write a new provider implementing MarketDataProvider
and register it in factory.py. Nothing else in the codebase changes.

Field names below come from the upstream `nepse` library schema. Run
`manage.py capture_nepse_fixtures` and confirm these FIELD_MAPs against the
captured keys; on drift, change the value here only.
"""
from __future__ import annotations

from datetime import date as _date, datetime
from typing import Iterator, List, Optional

from django.conf import settings

from ..contracts import (
    CompanyRecord,
    FloorsheetRecord,
    IndexRecord,
    MarketSummaryRecord,
    PriceRecord,
    ProviderSchemaError,
)
from .http_client import NepseHttpClient


def _num(v) -> Optional[float]:
    if v is None or v == "" or v == "-":
        return None
    try:
        return float(str(v).replace(",", ""))
    except (TypeError, ValueError):
        return None


def _pick(row: dict, keys: tuple[str, ...], *, required: bool, ctx: str):
    """Return the first present key's value; raise ProviderSchemaError if a
    required field is missing under all candidate keys."""
    for k in keys:
        if k in row and row[k] not in (None, ""):
            return row[k]
    if required:
        raise ProviderSchemaError(
            f"{ctx}: none of {keys} present in response row keys={sorted(row.keys())}"
        )
    return None


class NepseApiProvider:
    name = "nepseapi"

    # Candidate key names per logical field (first match wins).
    PRICE_MAP = {
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

    def __init__(self, base_url: str | None = None, timeout: float | None = None):
        self.client = NepseHttpClient(
            base_url=base_url or settings.NEPSE_API_BASE_URL,
            timeout=timeout if timeout is not None else settings.NEPSE_API_TIMEOUT,
        )

    @staticmethod
    def _rows(payload, ctx: str) -> list:
        if isinstance(payload, list):
            return payload
        if isinstance(payload, dict):
            for key in ("data", "rows", "result", "content"):
                if isinstance(payload.get(key), list):
                    return payload[key]
        raise ProviderSchemaError(f"{ctx}: expected a list, got {type(payload).__name__}")

    def fetch_daily_prices(self, on: _date) -> List[PriceRecord]:
        payload = self.client.get_json("/PriceVolume")
        rows = self._rows(payload, "PriceVolume")
        out: List[PriceRecord] = []
        for row in rows:
            symbol = _pick(row, self.PRICE_MAP["symbol"], required=True, ctx="PriceVolume.symbol")
            close = _num(_pick(row, self.PRICE_MAP["close"], required=True, ctx="PriceVolume.close"))
            out.append(PriceRecord(
                symbol=str(symbol),
                date=on,
                close=close,
                open=_num(_pick(row, self.PRICE_MAP["open"], required=False, ctx="")),
                high=_num(_pick(row, self.PRICE_MAP["high"], required=False, ctx="")),
                low=_num(_pick(row, self.PRICE_MAP["low"], required=False, ctx="")),
                volume=_num(_pick(row, self.PRICE_MAP["volume"], required=False, ctx="")),
                turnover=_num(_pick(row, self.PRICE_MAP["turnover"], required=False, ctx="")),
                prev_close=_num(_pick(row, self.PRICE_MAP["prev_close"], required=False, ctx="")),
                vwap=_num(_pick(row, self.PRICE_MAP["vwap"], required=False, ctx="")),
                trans=(int(t) if (t := _num(_pick(row, self.PRICE_MAP["trans"], required=False, ctx=""))) is not None else None),
                weeks_52_high=_num(_pick(row, self.PRICE_MAP["weeks_52_high"], required=False, ctx="")),
                weeks_52_low=_num(_pick(row, self.PRICE_MAP["weeks_52_low"], required=False, ctx="")),
            ))
        return out

    # Remaining methods are implemented in Task 5.
    def fetch_floorsheet(self, on: _date) -> Iterator[FloorsheetRecord]:
        raise NotImplementedError

    def fetch_market_summary(self, on: _date) -> MarketSummaryRecord:
        raise NotImplementedError

    def fetch_company_list(self) -> List[CompanyRecord]:
        raise NotImplementedError

    def fetch_indices(self, on: _date) -> List[IndexRecord]:
        raise NotImplementedError
