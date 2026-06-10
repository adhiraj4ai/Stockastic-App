"""Canonical internal data contracts for market-data ingestion.

These DTOs are the stable boundary between external providers and the rest of
Stockastic. They mirror the DB models, NOT any provider's JSON shape. Provider
adapters map raw responses into these; the ingestion service consumes only these.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date as _date, datetime
from typing import Iterator, List, Optional, Protocol, runtime_checkable


# ── Exceptions ─────────────────────────────────────────────────────────────
class ProviderError(Exception):
    """Base class for all market-data provider failures."""


class ProviderUnavailableError(ProviderError):
    """Transport failure: network down, timeout, 5xx, or rate-limited."""


class ProviderSchemaError(ProviderError):
    """Response arrived but its shape/fields are not what we expect.

    Raised by adapters BEFORE any DB write so external API drift fails loudly
    and leaves stored data untouched instead of silently corrupting it.
    """


# ── Canonical DTOs ─────────────────────────────────────────────────────────
@dataclass(frozen=True)
class PriceRecord:
    symbol: str
    date: _date
    close: float
    open: Optional[float] = None
    high: Optional[float] = None
    low: Optional[float] = None
    volume: Optional[float] = None
    prev_close: Optional[float] = None
    turnover: Optional[float] = None
    vwap: Optional[float] = None
    trans: Optional[int] = None
    weeks_52_high: Optional[float] = None
    weeks_52_low: Optional[float] = None


@dataclass(frozen=True)
class FloorsheetRecord:
    transaction_id: int
    symbol: str
    buyer_id: int
    seller_id: int
    quantity: int
    rate: float
    amount: float
    date: _date
    datetime: datetime
    transaction_book_id: int = 0
    stock_id: int = 0
    buyer_name: Optional[str] = None
    seller_name: Optional[str] = None
    security_name: Optional[str] = None


@dataclass(frozen=True)
class MarketSummaryRecord:
    date: _date
    total_turnover: float
    total_volume: int
    total_transactions: int
    top_gainers: List[dict] = field(default_factory=list)
    top_losers: List[dict] = field(default_factory=list)
    top_turnovers: List[dict] = field(default_factory=list)
    top_volumes: List[dict] = field(default_factory=list)
    sector_turnover: dict = field(default_factory=dict)


@dataclass(frozen=True)
class CompanyRecord:
    symbol: str
    name: str
    sector: Optional[str] = None
    status: Optional[str] = None


@dataclass(frozen=True)
class IndexRecord:
    index_name: str
    date: _date
    value: float
    open: Optional[float] = None
    high: Optional[float] = None
    low: Optional[float] = None
    change: Optional[float] = None
    change_percent: Optional[float] = None
    turnover: Optional[float] = None


# ── Provider interface ─────────────────────────────────────────────────────
@runtime_checkable
class MarketDataProvider(Protocol):
    """Stable interface every data source must implement.

    Methods raise ProviderUnavailableError (transport) or ProviderSchemaError
    (unexpected shape). They must never write to the DB.
    """

    name: str

    def fetch_daily_prices(self, on: _date) -> List[PriceRecord]: ...
    def fetch_floorsheet(self, on: _date) -> Iterator[FloorsheetRecord]: ...
    def fetch_market_summary(self, on: _date) -> MarketSummaryRecord: ...
    def fetch_company_list(self) -> List[CompanyRecord]: ...
    def fetch_indices(self, on: _date) -> List[IndexRecord]: ...
