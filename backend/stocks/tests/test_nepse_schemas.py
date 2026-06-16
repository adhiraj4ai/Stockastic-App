import pytest
from pydantic import ValidationError

from stocks.services.market_data.providers.nepse_schemas import RawPriceRow


def test_price_row_picks_first_present_alias():
    row = RawPriceRow.model_validate({"stockSymbol": "NABIL", "ltp": "510"})
    assert row.symbol == "NABIL"
    assert row.close == 510.0


def test_price_row_strips_commas():
    row = RawPriceRow.model_validate({"symbol": "NABIL", "closePrice": "1,234.5"})
    assert row.close == 1234.5


def test_price_row_optional_sentinel_becomes_none():
    row = RawPriceRow.model_validate(
        {"symbol": "NABIL", "closePrice": "510", "openPrice": "-"}
    )
    assert row.open is None


def test_price_row_required_dash_close_raises():
    with pytest.raises(ValidationError):
        RawPriceRow.model_validate({"symbol": "NABIL", "closePrice": "-"})


def test_price_row_missing_required_close_raises():
    with pytest.raises(ValidationError):
        RawPriceRow.model_validate({"symbol": "NABIL", "openPrice": "1.0"})


def test_price_row_skips_null_first_alias():
    # Legacy _pick skipped a None first-alias and fell through; preserve that.
    row = RawPriceRow.model_validate(
        {"symbol": "NABIL", "closePrice": None, "lastTradedPrice": "510"}
    )
    assert row.close == 510.0


def test_price_row_skips_empty_first_alias():
    row = RawPriceRow.model_validate(
        {"symbol": "NABIL", "closePrice": "", "ltp": "510"}
    )
    assert row.close == 510.0


def test_price_row_zero_is_not_sentinel():
    row = RawPriceRow.model_validate({"symbol": "NABIL", "closePrice": 0})
    assert row.close == 0.0
