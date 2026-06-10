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
    FLOOR_MAP = {
        "transaction_id": ("contractId", "transactionId", "id"),
        "symbol": ("stockSymbol", "securityCode", "symbol"),
        "buyer_id": ("buyerMemberId", "buyer_id"),
        "seller_id": ("sellerMemberId", "seller_id"),
        "quantity": ("contractQuantity", "quantity"),
        "rate": ("contractRate", "rate"),
        "amount": ("contractAmount", "amount"),
        "date": ("businessDate", "date"),
        "datetime": ("tradeTime", "transactionTime", "tradeDateTime"),
        "book_id": ("tradeBookId", "contractId"),
        "stock_id": ("stockId",),
        "buyer_name": ("buyerBrokerName", "buyerMemberName"),
        "seller_name": ("sellerBrokerName", "sellerMemberName"),
        "security_name": ("securityName",),
    }
    COMPANY_MAP = {
        "symbol": ("symbol", "securitySymbol"),
        "name": ("companyName", "securityName", "name"),
        "sector": ("sectorName", "sector"),
        "status": ("status",),
    }
    SUMMARY_FIELDS = {
        "total_turnover": ("Total Turnover Rs:", "totalTurnover"),
        "total_volume": ("Total Traded Shares", "totalTradedShares"),
        "total_transactions": ("Total Transactions", "totalTransactions"),
    }
    INDEX_FIELDS = {
        "value": ("currentValue", "index", "value", "close"),
        "change": ("change", "pointChange"),
        "change_percent": ("perChange", "percentageChange", "percentChange"),
        "turnover": ("turnover",),
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
            # NEPSE uses "-" for no-trade rows; _pick sees it as "present" but _num() yields None.
            # A required price that cannot be parsed is treated as schema drift, not silently dropped.
            close = _num(_pick(row, self.PRICE_MAP["close"], required=True, ctx="PriceVolume.close"))
            if close is None:
                raise ProviderSchemaError(
                    f"PriceVolume.close: unparseable/sentinel value for {symbol!r}; row keys={sorted(row.keys())}"
                )
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

    def fetch_floorsheet(self, on: _date) -> Iterator[FloorsheetRecord]:
        payload = self.client.get_json("/Floorsheet")
        rows = self._rows(payload, "Floorsheet")
        for row in rows:
            tid = _pick(row, self.FLOOR_MAP["transaction_id"], required=True, ctx="Floorsheet.id")
            dt_raw = _pick(row, self.FLOOR_MAP["datetime"], required=False, ctx="")
            try:
                dt = datetime.fromisoformat(str(dt_raw)) if dt_raw else datetime.combine(on, datetime.min.time())
            except ValueError:
                dt = datetime.combine(on, datetime.min.time())
            yield FloorsheetRecord(
                transaction_id=int(tid),
                symbol=str(_pick(row, self.FLOOR_MAP["symbol"], required=True, ctx="Floorsheet.symbol")),
                buyer_id=int(_num(_pick(row, self.FLOOR_MAP["buyer_id"], required=True, ctx="Floorsheet.buyer")) or 0),
                seller_id=int(_num(_pick(row, self.FLOOR_MAP["seller_id"], required=True, ctx="Floorsheet.seller")) or 0),
                quantity=int(_num(_pick(row, self.FLOOR_MAP["quantity"], required=True, ctx="Floorsheet.qty")) or 0),
                rate=_num(_pick(row, self.FLOOR_MAP["rate"], required=True, ctx="Floorsheet.rate")) or 0.0,
                amount=_num(_pick(row, self.FLOOR_MAP["amount"], required=False, ctx="")) or 0.0,
                date=on,
                datetime=dt,
                transaction_book_id=int(_num(_pick(row, self.FLOOR_MAP["book_id"], required=False, ctx="")) or 0),
                stock_id=int(_num(_pick(row, self.FLOOR_MAP["stock_id"], required=False, ctx="")) or 0),
                buyer_name=_pick(row, self.FLOOR_MAP["buyer_name"], required=False, ctx=""),
                seller_name=_pick(row, self.FLOOR_MAP["seller_name"], required=False, ctx=""),
                security_name=_pick(row, self.FLOOR_MAP["security_name"], required=False, ctx=""),
            )

    def fetch_market_summary(self, on: _date) -> MarketSummaryRecord:
        summary = self.client.get_json("/Summary")
        if not isinstance(summary, dict):
            raise ProviderSchemaError(f"Summary: expected dict, got {type(summary).__name__}")
        turnover = _num(_pick(summary, self.SUMMARY_FIELDS["total_turnover"], required=True, ctx="Summary.turnover"))
        volume = _num(_pick(summary, self.SUMMARY_FIELDS["total_volume"], required=True, ctx="Summary.volume"))
        txns = _num(_pick(summary, self.SUMMARY_FIELDS["total_transactions"], required=True, ctx="Summary.txns"))
        gainers = self._rows(self.client.get_json("/TopGainers"), "TopGainers")
        losers = self._rows(self.client.get_json("/TopLosers"), "TopLosers")
        return MarketSummaryRecord(
            date=on,
            total_turnover=turnover,
            total_volume=int(volume),
            total_transactions=int(txns),
            top_gainers=list(gainers),
            top_losers=list(losers),
        )

    def fetch_company_list(self) -> List[CompanyRecord]:
        rows = self._rows(self.client.get_json("/CompanyList"), "CompanyList")
        out: List[CompanyRecord] = []
        for row in rows:
            out.append(CompanyRecord(
                symbol=str(_pick(row, self.COMPANY_MAP["symbol"], required=True, ctx="CompanyList.symbol")),
                name=str(_pick(row, self.COMPANY_MAP["name"], required=True, ctx="CompanyList.name")),
                sector=_pick(row, self.COMPANY_MAP["sector"], required=False, ctx=""),
                status=_pick(row, self.COMPANY_MAP["status"], required=False, ctx=""),
            ))
        return out

    def fetch_indices(self, on: _date) -> List[IndexRecord]:
        payload = self.client.get_json("/NepseIndex")
        if isinstance(payload, dict):
            items = list(payload.items())  # {name: {...}}
        elif isinstance(payload, list):
            items = [(None, row) for row in payload]
        else:
            raise ProviderSchemaError(f"NepseIndex: unexpected type {type(payload).__name__}")
        out: List[IndexRecord] = []
        for key, row in items:
            if not isinstance(row, dict):
                continue
            name = key or row.get("index") or row.get("indexName")
            if not name:
                raise ProviderSchemaError("NepseIndex: row missing an index name")
            out.append(IndexRecord(
                index_name=str(name),
                date=on,
                value=_num(_pick(row, self.INDEX_FIELDS["value"], required=True, ctx=f"NepseIndex[{name}].value")),
                change=_num(_pick(row, self.INDEX_FIELDS["change"], required=False, ctx="")),
                change_percent=_num(_pick(row, self.INDEX_FIELDS["change_percent"], required=False, ctx="")),
                turnover=_num(_pick(row, self.INDEX_FIELDS["turnover"], required=False, ctx="")),
            ))
        return out
