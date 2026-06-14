from datetime import date

import pytest

from stocks.services.market_data.contracts import (
    PriceRecord,
    IndexRecord,
    ProviderError,
    ProviderSchemaError,
    ProviderUnavailableError,
)


def test_price_record_is_frozen():
    rec = PriceRecord(symbol="NABIL", date=date(2026, 6, 10), close=500.0)
    with pytest.raises(Exception):
        rec.symbol = "OTHER"  # frozen dataclass


def test_price_record_defaults_optional_fields_to_none():
    rec = PriceRecord(symbol="NABIL", date=date(2026, 6, 10), close=500.0)
    assert rec.open is None and rec.volume is None


def test_index_record_holds_name_and_value():
    rec = IndexRecord(index_name="Banking", date=date(2026, 6, 10), value=1234.5)
    assert rec.index_name == "Banking" and rec.value == 1234.5


def test_schema_error_is_provider_error():
    assert issubclass(ProviderSchemaError, ProviderError)
    assert issubclass(ProviderUnavailableError, ProviderError)


def test_price_record_validates_types_at_construction():
    import pydantic

    with pytest.raises(pydantic.ValidationError):
        PriceRecord(symbol="NABIL", date=date(2026, 6, 10), close="not-a-number")


def test_price_record_frozen_raises_validation_error():
    import pydantic

    rec = PriceRecord(symbol="NABIL", date=date(2026, 6, 10), close=500.0)
    with pytest.raises(pydantic.ValidationError):
        rec.symbol = "OTHER"


def test_company_record_equality_by_fields():
    from stocks.services.market_data.contracts import CompanyRecord

    a = CompanyRecord(symbol="NABIL", name="Nabil", sector="Banks", status="A")
    b = CompanyRecord(symbol="NABIL", name="Nabil", sector="Banks", status="A")
    assert a == b
