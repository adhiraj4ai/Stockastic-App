"""Provider-agnostic ingestion: canonical DTOs -> DB models, idempotently.

Contains NO knowledge of any external API. Each method is independent so one
dataset failing never blocks another (the command isolates calls).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Iterable, List, Tuple

from stocks.models import (
    Company, DailyFloorsheet, DailyIndexValue, DailyMarketSummary, DailyStockPrice,
)
from stocks.services.ingest_validation import validate_price_rows
from .contracts import (
    CompanyRecord, FloorsheetRecord, IndexRecord, MarketSummaryRecord, PriceRecord,
)


def _dec(v):
    return None if v is None else Decimal(str(v))


@dataclass
class IngestResult:
    dataset: str
    inserted: int = 0
    updated: int = 0
    rejected: int = 0
    rejections: List[Tuple[str, str]] = field(default_factory=list)

    @property
    def total(self) -> int:
        return self.inserted + self.updated


class IngestionService:
    def ingest_prices(self, records: Iterable[PriceRecord]) -> IngestResult:
        res = IngestResult("prices")
        items = [
            DailyStockPrice(
                ticker=r.symbol, date=r.date,
                open=_dec(r.open), high=_dec(r.high), low=_dec(r.low),
                close=_dec(r.close), volume=_dec(r.volume), prev_close=_dec(r.prev_close),
                turnover=_dec(r.turnover), vwap=_dec(r.vwap), trans=r.trans,
                weeks_52_high=_dec(r.weeks_52_high), weeks_52_low=_dec(r.weeks_52_low),
            )
            for r in records
        ]
        valid, rejected = validate_price_rows(items)
        DailyStockPrice.objects.bulk_create(valid, ignore_conflicts=True)
        res.inserted = len(valid)
        res.rejected = len(rejected)
        res.rejections = rejected
        return res

    def ingest_floorsheet(self, records: Iterable[FloorsheetRecord], batch=5000) -> IngestResult:
        res = IngestResult("floorsheet")
        buf: List[DailyFloorsheet] = []

        def flush():
            if buf:
                DailyFloorsheet.objects.bulk_create(buf, ignore_conflicts=True)
                res.inserted += len(buf)
                buf.clear()

        for r in records:
            buf.append(DailyFloorsheet(
                transaction_id=r.transaction_id, symbol=r.symbol,
                buyer_id=r.buyer_id, seller_id=r.seller_id,
                transaction_quantity=r.quantity, transaction_rate=_dec(r.rate),
                transaction_amount=_dec(r.amount), transaction_date=r.date,
                transaction_book_id=r.transaction_book_id, stock_id=r.stock_id,
                buyer_name=r.buyer_name, seller_name=r.seller_name,
                transaction_datetime=r.datetime, security_name=r.security_name,
            ))
            if len(buf) >= batch:
                flush()
        flush()
        return res

    def ingest_market_summary(self, record: MarketSummaryRecord) -> IngestResult:
        res = IngestResult("summary")
        _, created = DailyMarketSummary.objects.update_or_create(
            date=record.date,
            defaults=dict(
                total_turnover=_dec(record.total_turnover),
                total_volume=record.total_volume,
                total_transactions=record.total_transactions,
                top_gainers=record.top_gainers, top_losers=record.top_losers,
                top_turnovers=record.top_turnovers, top_volumes=record.top_volumes,
                sector_turnover=record.sector_turnover,
            ),
        )
        res.inserted, res.updated = (1, 0) if created else (0, 1)
        return res

    def ingest_companies(self, records: Iterable[CompanyRecord]) -> IngestResult:
        res = IngestResult("companies")
        for r in records:
            _, created = Company.all_objects.update_or_create(
                symbol=r.symbol,
                defaults=dict(name=r.name, sector=r.sector or "", status=r.status or "A"),
            )
            if created:
                res.inserted += 1
            else:
                res.updated += 1
        return res

    def ingest_indices(self, records: Iterable[IndexRecord]) -> IngestResult:
        res = IngestResult("indices")
        for r in records:
            _, created = DailyIndexValue.objects.update_or_create(
                index_name=r.index_name, date=r.date,
                defaults=dict(
                    value=_dec(r.value), open=_dec(r.open), high=_dec(r.high),
                    low=_dec(r.low), change=_dec(r.change),
                    change_percent=_dec(r.change_percent), turnover=_dec(r.turnover),
                ),
            )
            if created:
                res.inserted += 1
            else:
                res.updated += 1
        return res
