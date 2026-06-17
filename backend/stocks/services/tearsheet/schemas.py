from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Optional

from pydantic import BaseModel, ConfigDict, field_validator

_SENTINELS = (None, "", "-", "None")


def _to_decimal(value: object) -> Optional[Decimal]:
    if value in _SENTINELS:
        return None
    try:
        return Decimal(str(value).replace(",", ""))
    except InvalidOperation:
        return None


class RawFinancialRow(BaseModel):
    model_config = ConfigDict(extra="ignore")

    particular: str
    fiscal_year: str
    value: Optional[Decimal] = None

    @field_validator("value", mode="before")
    @classmethod
    def _coerce_value(cls, v):
        return _to_decimal(v)


class RawDividendRow(BaseModel):
    model_config = ConfigDict(extra="ignore")

    fiscal_year: str
    bonus_dividend: Optional[Decimal] = None
    cash_dividend: Optional[Decimal] = None
    book_closure_date: Optional[str] = None

    @field_validator("bonus_dividend", "cash_dividend", mode="before")
    @classmethod
    def _coerce_amounts(cls, v):
        return _to_decimal(v)


class RawStockInfo(BaseModel):
    model_config = ConfigDict(extra="ignore")

    full_name: str
    symbol: str
    formatted_sector: Optional[str] = None
