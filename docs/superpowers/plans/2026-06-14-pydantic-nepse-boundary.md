# Pydantic at the NEPSE Data Boundary — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-rolled `_num` / `_pick` / `_req_num` validation in the NEPSE provider with pydantic v2 models, so external API drift is caught by declarative schemas instead of bespoke helpers — without changing any observable behaviour.

**Architecture:** Two layers, preserving the existing boundary. (1) Canonical DTOs in `contracts.py` become **frozen pydantic models** — same field names/types/defaults, now validated at construction. (2) New **inbound parsing models** in the provider mirror the raw NEPSE JSON via `AliasChoices` (the first-present-key behaviour) plus one shared before-validator (the comma-stripping / `"-"`-sentinel coercion). The provider validates each raw row with `Model.model_validate(...)`, wraps `ValidationError` as `ProviderSchemaError`, then maps to the canonical DTO. The `*_MAP` dicts stay as the single source of truth for alias names — `AliasChoices(*PRICE_MAP["close"])`.

**Tech Stack:** Python, Django 5.2, pydantic v2 (already installed transitively via the `anthropic` SDK), pytest.

**Why this scope only:** DRF serializers (HTTP I/O) and Agent SDK tool schemas are deliberately untouched — pydantic there fights the framework. This plan covers the external-data boundary, where untrusted JSON enters the system. Env-settings validation (`pydantic-settings`) is explicitly out of scope.

**Behaviour contract that MUST NOT change (current tests encode this — keep them green):**
- Optional numeric field with `None` / `""` / `"-"` → `None`.
- Required numeric field with `"-"` or any unparseable value → `ProviderSchemaError` (never silently `0`/`None`).
- Required string/numeric field absent under *all* candidate keys → `ProviderSchemaError`.
- Numeric strings with thousands commas (`"1,234.5"`) parse to `1234.5`.
- Company `status` normalised to canonical codes (`A`/`S`/`D`, else pass-through).
- `date` is injected by the caller (`on`), never read from the row.
- Floorsheet `datetime` parses ISO, falls back to midnight-on-`on` for missing/invalid.
- Index payload accepted as either `{name: {...}}` dict or `[{...}]` list.

---

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `backend/requirements.txt` | Modify | Pin `pydantic` as a direct dependency (currently only transitive). |
| `backend/stocks/services/market_data/contracts.py` | Modify | Canonical DTOs become frozen pydantic `BaseModel`s; exceptions and the `Protocol` unchanged. |
| `backend/stocks/services/market_data/providers/nepse_schemas.py` | Create | Inbound pydantic models (raw-JSON → validated) + shared coercion validator. The only place that knows raw field aliases. |
| `backend/stocks/services/market_data/providers/nepse_api.py` | Modify | Provider methods use inbound models via `model_validate`; delete `_num`/`_pick`/`_req_num`. Keep `*_MAP`, `_norm_company_status`, `_rows`. |
| `backend/stocks/tests/test_market_data_contracts.py` | Modify | Add tests for pydantic construction-time validation + frozen-via-`ValidationError`. |
| `backend/stocks/tests/test_nepse_provider.py` | Unchanged | Existing characterization tests are the regression net — they must stay green. |
| `backend/stocks/tests/test_nepse_schemas.py` | Create | Unit tests for inbound models in isolation (coercion, aliases, required-field errors). |

**Run all backend tests from `backend/` with venv active:** `source venv/bin/activate`. Substitute `python` accordingly (this shell aliases it inside the venv).

---

### Task 1: Pin pydantic as a direct dependency

**Files:**
- Modify: `backend/requirements.txt`
- Test: `backend/stocks/tests/test_pydantic_available.py` (Create)

- [ ] **Step 1: Write the failing test**

Create `backend/stocks/tests/test_pydantic_available.py`:

```python
def test_pydantic_v2_is_importable():
    import pydantic

    major = int(pydantic.VERSION.split(".")[0])
    assert major >= 2, f"need pydantic v2, got {pydantic.VERSION}"
```

- [ ] **Step 2: Run test to verify current state**

Run: `pytest stocks/tests/test_pydantic_available.py -v`
Expected: PASS if the `anthropic` SDK already pulled pydantic v2 (likely). If it FAILS with `ModuleNotFoundError`, that confirms pydantic is missing and Step 3 fixes it.

- [ ] **Step 3: Add the direct dependency**

In `backend/requirements.txt`, add under the chat-agent block (near `anthropic>=0.45.0`, around line 38):

```
pydantic>=2.6,<3
```

Then install: `pip install -r requirements.txt`

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest stocks/tests/test_pydantic_available.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/requirements.txt backend/stocks/tests/test_pydantic_available.py
git commit -m "build(deps): pin pydantic v2 as a direct dependency"
```

---

### Task 2: Convert canonical DTOs to frozen pydantic models

The five DTOs in `contracts.py` move from `@dataclass(frozen=True)` to pydantic `BaseModel` with `frozen=True`. Field names, types, and defaults are identical, so every consumer (`ingestion.py` attribute access, all provider tests) keeps working. `model_config = ConfigDict(frozen=True)` makes assignment raise `ValidationError`; the existing `test_price_record_is_frozen` uses `pytest.raises(Exception)`, which still passes.

**Files:**
- Modify: `backend/stocks/services/market_data/contracts.py:1-99`
- Test: `backend/stocks/tests/test_market_data_contracts.py` (add cases)

- [ ] **Step 1: Write the failing tests**

Append to `backend/stocks/tests/test_market_data_contracts.py`:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest stocks/tests/test_market_data_contracts.py -v`
Expected: `test_price_record_validates_types_at_construction` and `test_price_record_frozen_raises_validation_error` FAIL (dataclass accepts `"not-a-number"` and raises `FrozenInstanceError`, not `ValidationError`).

- [ ] **Step 3: Rewrite the DTOs as pydantic models**

Replace lines 1-99 of `backend/stocks/services/market_data/contracts.py` (everything from the module docstring through the end of `IndexRecord`, i.e. up to but NOT including the `# ── Provider interface ──` section) with:

```python
"""Canonical internal data contracts for market-data ingestion.

These DTOs are the stable boundary between external providers and the rest of
Stockastic. They mirror the DB models, NOT any provider's JSON shape. Provider
adapters map raw responses into these; the ingestion service consumes only these.
"""
from __future__ import annotations

from datetime import date as _date, datetime
from typing import Iterator, List, Optional, Protocol, runtime_checkable

from pydantic import BaseModel, ConfigDict, Field


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
class _FrozenRecord(BaseModel):
    """Immutable, validated value object. Subclasses are the ingestion boundary."""

    model_config = ConfigDict(frozen=True)


class PriceRecord(_FrozenRecord):
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


class FloorsheetRecord(_FrozenRecord):
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


class MarketSummaryRecord(_FrozenRecord):
    date: _date
    total_turnover: float
    total_volume: int
    total_transactions: int
    top_gainers: List[dict] = Field(default_factory=list)
    top_losers: List[dict] = Field(default_factory=list)
    top_turnovers: List[dict] = Field(default_factory=list)
    top_volumes: List[dict] = Field(default_factory=list)
    sector_turnover: dict = Field(default_factory=dict)


class CompanyRecord(_FrozenRecord):
    symbol: str
    name: str
    sector: Optional[str] = None
    status: Optional[str] = None


class IndexRecord(_FrozenRecord):
    index_name: str
    date: _date
    value: float
    open: Optional[float] = None
    high: Optional[float] = None
    low: Optional[float] = None
    change: Optional[float] = None
    change_percent: Optional[float] = None
    turnover: Optional[float] = None
```

Leave the `# ── Provider interface ──` `Protocol` block (current lines 101-117) exactly as-is — it references the DTO names and is unaffected.

- [ ] **Step 4: Run the contract + provider suites to verify green**

Run: `pytest stocks/tests/test_market_data_contracts.py stocks/tests/test_nepse_provider.py -v`
Expected: PASS — all new cases pass, and the existing characterization tests (which construct DTOs via the provider) still pass because field shapes are identical. Note: pydantic coerces `MarketSummaryRecord(total_volume=int(volume))` etc. exactly as before.

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/services/market_data/contracts.py backend/stocks/tests/test_market_data_contracts.py
git commit -m "refactor(market-data): make canonical DTOs frozen pydantic models"
```

---

### Task 3: Inbound parsing model for prices

Introduce `nepse_schemas.py` with the shared coercion validator and the first inbound model, `RawPriceRow`. The before-validator reproduces `_num` exactly: `None`/`""`/`"-"` → `None`, commas stripped, unparseable → `None`. Applied to every numeric field, this makes optional fields tolerate sentinels (→ `None`) while required fields (typed non-optional `float`/`int`) reject `None` with a `ValidationError`, which the provider maps to `ProviderSchemaError` — the exact current contract.

**Files:**
- Create: `backend/stocks/services/market_data/providers/nepse_schemas.py`
- Modify: `backend/stocks/services/market_data/providers/nepse_api.py` (`fetch_daily_prices`)
- Test: `backend/stocks/tests/test_nepse_schemas.py` (Create)

- [ ] **Step 1: Write the failing tests**

Create `backend/stocks/tests/test_nepse_schemas.py`:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest stocks/tests/test_nepse_schemas.py -v`
Expected: FAIL with `ModuleNotFoundError: ... nepse_schemas`.

- [ ] **Step 3: Create the schemas module**

Create `backend/stocks/services/market_data/providers/nepse_schemas.py`:

```python
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
```

Note on `trans`: `_coerce_number` returns a float; pydantic coerces a whole-number float to `int` in lax mode (NEPSE transaction counts are integers). This matches the legacy `int(t)`.

- [ ] **Step 4: Run schema tests to verify they pass**

Run: `pytest stocks/tests/test_nepse_schemas.py -v`
Expected: PASS (all five cases).

- [ ] **Step 5: Refactor `fetch_daily_prices` to use the model**

In `backend/stocks/services/market_data/providers/nepse_api.py`, add to the imports (after the `.http_client` import, around line 25):

```python
from .nepse_schemas import RawPriceRow
```

Replace the `fetch_daily_prices` method (current lines 151-179) with:

```python
    def fetch_daily_prices(self, on: _date) -> List[PriceRecord]:
        payload = self.client.get_json("/PriceVolume")
        rows = self._rows(payload, "PriceVolume")
        return [self._price_record(row, on) for row in rows]

    @staticmethod
    def _price_record(row: dict, on: _date) -> PriceRecord:
        try:
            raw = RawPriceRow.model_validate(row)
        except ValidationError as exc:
            raise ProviderSchemaError(
                f"PriceVolume: {exc.error_count()} invalid field(s); "
                f"row keys={sorted(row.keys())}"
            ) from exc
        return PriceRecord(date=on, **raw.model_dump())
```

Add `ValidationError` to the imports at the top of the file (after `from django.conf import settings`, around line 15):

```python
from pydantic import ValidationError
```

- [ ] **Step 6: Run the price tests to verify they pass**

Run: `pytest stocks/tests/test_nepse_provider.py -k "price" -v`
Expected: PASS — `test_map_prices_from_fixture`, `test_map_prices_raises_schema_error_on_missing_key`, `test_map_prices_raises_schema_error_on_dash_close` all green. The `"-"`-close case now raises `ValidationError` inside `_price_record`, re-raised as `ProviderSchemaError`.

- [ ] **Step 7: Commit**

```bash
git add backend/stocks/services/market_data/providers/nepse_schemas.py backend/stocks/services/market_data/providers/nepse_api.py backend/stocks/tests/test_nepse_schemas.py
git commit -m "refactor(nepse): parse price rows via pydantic inbound model"
```

---

### Task 4: Inbound parsing model for floorsheet

Floorsheet has required ints (`buyer_id`, `seller_id`, `quantity`, `transaction_id`) and a required `rate`, an optional `amount` that defaults to `0.0`, and a `datetime` that parses ISO or falls back to midnight-on-`on`. The model handles field coercion; the date-fallback stays in the method (it depends on `on`).

**Files:**
- Modify: `backend/stocks/services/market_data/providers/nepse_schemas.py`
- Modify: `backend/stocks/services/market_data/providers/nepse_api.py` (`fetch_floorsheet`)
- Test: `backend/stocks/tests/test_nepse_schemas.py`

- [ ] **Step 1: Write the failing tests**

Append to `backend/stocks/tests/test_nepse_schemas.py`:

```python
from stocks.services.market_data.providers.nepse_schemas import RawFloorsheetRow


def test_floorsheet_row_maps_required_fields():
    row = RawFloorsheetRow.model_validate({
        "contractId": 202606100001, "stockSymbol": "NABIL",
        "buyerMemberId": 58, "sellerMemberId": 12,
        "contractQuantity": 100, "contractRate": "510",
    })
    assert row.transaction_id == 202606100001
    assert row.symbol == "NABIL"
    assert row.buyer_id == 58 and row.seller_id == 12
    assert row.quantity == 100 and row.rate == 510.0
    assert row.amount == 0.0  # optional, defaults


def test_floorsheet_row_required_dash_rate_raises():
    with pytest.raises(ValidationError):
        RawFloorsheetRow.model_validate({
            "contractId": 1, "stockSymbol": "NABIL", "buyerMemberId": 58,
            "sellerMemberId": 12, "contractQuantity": 100, "contractRate": "-",
        })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest stocks/tests/test_nepse_schemas.py -k floorsheet -v`
Expected: FAIL with `ImportError: cannot import name 'RawFloorsheetRow'`.

- [ ] **Step 3: Add the floorsheet model**

Append to `backend/stocks/services/market_data/providers/nepse_schemas.py`:

```python
FLOOR_ALIASES = {
    "transaction_id": ("contractId", "transactionId", "id"),
    "symbol": ("stockSymbol", "securityCode", "symbol"),
    "buyer_id": ("buyerMemberId", "buyer_id"),
    "seller_id": ("sellerMemberId", "seller_id"),
    "quantity": ("contractQuantity", "quantity"),
    "rate": ("contractRate", "rate"),
    "amount": ("contractAmount", "amount"),
    "datetime": ("tradeTime", "transactionTime", "tradeDateTime"),
    "book_id": ("tradeBookId",),
    "stock_id": ("stockId",),
    "buyer_name": ("buyerBrokerName", "buyerMemberName"),
    "seller_name": ("sellerBrokerName", "sellerMemberName"),
    "security_name": ("securityName",),
}


class RawFloorsheetRow(_RawRow):
    transaction_id: int = Field(validation_alias=_alias(FLOOR_ALIASES["transaction_id"]))
    symbol: str = Field(validation_alias=_alias(FLOOR_ALIASES["symbol"]))
    buyer_id: int = Field(validation_alias=_alias(FLOOR_ALIASES["buyer_id"]))
    seller_id: int = Field(validation_alias=_alias(FLOOR_ALIASES["seller_id"]))
    quantity: int = Field(validation_alias=_alias(FLOOR_ALIASES["quantity"]))
    rate: float = Field(validation_alias=_alias(FLOOR_ALIASES["rate"]))
    amount: float = Field(default=0.0, validation_alias=_alias(FLOOR_ALIASES["amount"]))
    transaction_book_id: int = Field(default=0, validation_alias=_alias(FLOOR_ALIASES["book_id"]))
    stock_id: int = Field(default=0, validation_alias=_alias(FLOOR_ALIASES["stock_id"]))
    raw_datetime: Optional[str] = Field(default=None, validation_alias=_alias(FLOOR_ALIASES["datetime"]))
    buyer_name: Optional[str] = Field(default=None, validation_alias=_alias(FLOOR_ALIASES["buyer_name"]))
    seller_name: Optional[str] = Field(default=None, validation_alias=_alias(FLOOR_ALIASES["seller_name"]))
    security_name: Optional[str] = Field(default=None, validation_alias=_alias(FLOOR_ALIASES["security_name"]))

    @field_validator(
        "transaction_id", "buyer_id", "seller_id", "quantity",
        "rate", "amount", "transaction_book_id", "stock_id",
        mode="before",
    )
    @classmethod
    def _clean_numbers(cls, value):
        return _coerce_number(value)

    @field_validator("raw_datetime", mode="before")
    @classmethod
    def _stringify_datetime(cls, value):
        return None if value in _SENTINELS else str(value)
```

Note: the legacy code defaulted a missing/`"-"` `amount` to `0.0` via `or 0.0`; the model's `default=0.0` plus the sentinel→`None` coercion does NOT cover a present-but-`"-"` amount (that yields `None`, not `0.0`). Add a validator to preserve exact behaviour — append to `RawFloorsheetRow`:

```python
    @field_validator("amount")
    @classmethod
    def _amount_defaults_zero(cls, value):
        return 0.0 if value is None else value
```

`book_id`/`stock_id` legacy default was `int(... or 0)`; `default=0` plus sentinel→`None` coercion would feed `None` into an `int` field and fail. Mirror the `amount` fix — append:

```python
    @field_validator("transaction_book_id", "stock_id")
    @classmethod
    def _int_defaults_zero(cls, value):
        return 0 if value is None else value
```

- [ ] **Step 4: Run schema tests to verify they pass**

Run: `pytest stocks/tests/test_nepse_schemas.py -k floorsheet -v`
Expected: PASS.

- [ ] **Step 5: Refactor `fetch_floorsheet`**

In `nepse_api.py` add to the schemas import line:

```python
from .nepse_schemas import RawFloorsheetRow, RawPriceRow
```

Replace `fetch_floorsheet` (current lines 181-208) with:

```python
    def fetch_floorsheet(self, on: _date) -> Iterator[FloorsheetRecord]:
        payload = self.client.get_json("/Floorsheet")
        rows = self._rows(payload, "Floorsheet")
        # _rows validates the envelope eagerly; per-row errors raise lazily.
        for row in rows:
            yield self._floorsheet_record(row, on)

    @staticmethod
    def _floorsheet_record(row: dict, on: _date) -> FloorsheetRecord:
        try:
            raw = RawFloorsheetRow.model_validate(row)
        except ValidationError as exc:
            raise ProviderSchemaError(
                f"Floorsheet: {exc.error_count()} invalid field(s); "
                f"row keys={sorted(row.keys())}"
            ) from exc
        data = raw.model_dump(exclude={"raw_datetime"})
        return FloorsheetRecord(
            date=on,
            datetime=NepseApiProvider._parse_floor_datetime(raw.raw_datetime, on),
            **data,
        )

    @staticmethod
    def _parse_floor_datetime(raw_dt: Optional[str], on: _date) -> datetime:
        if not raw_dt:
            return datetime.combine(on, datetime.min.time())
        try:
            return datetime.fromisoformat(raw_dt)
        except ValueError:
            return datetime.combine(on, datetime.min.time())
```

- [ ] **Step 6: Run floorsheet provider tests**

Run: `pytest stocks/tests/test_nepse_provider.py -k floorsheet -v`
Expected: PASS — `test_map_floorsheet` and `test_map_floorsheet_raises_on_unparseable_required` green.

- [ ] **Step 7: Commit**

```bash
git add backend/stocks/services/market_data/providers/nepse_schemas.py backend/stocks/services/market_data/providers/nepse_api.py backend/stocks/tests/test_nepse_schemas.py
git commit -m "refactor(nepse): parse floorsheet rows via pydantic inbound model"
```

---

### Task 5: Inbound models for summary, company, and index

Three remaining endpoints. Company `status` normalisation becomes a field validator (domain logic kept verbatim from `_norm_company_status`). Summary merges separate endpoints — the orchestration stays in the method; only the three required numerics move to a model. Index accepts dict-or-list payloads — the shape handling stays in the method; per-row fields move to a model.

**Files:**
- Modify: `backend/stocks/services/market_data/providers/nepse_schemas.py`
- Modify: `backend/stocks/services/market_data/providers/nepse_api.py`
- Test: `backend/stocks/tests/test_nepse_schemas.py`

- [ ] **Step 1: Write the failing tests**

Append to `backend/stocks/tests/test_nepse_schemas.py`:

```python
from stocks.services.market_data.providers.nepse_schemas import (
    RawCompanyRow, RawIndexRow, RawSummary,
)


def test_summary_maps_three_required_numerics():
    s = RawSummary.model_validate({
        "Total Turnover Rs:": "4,489,236,458.2",
        "Total Traded Shares": "12,540,423",
        "Total Transactions": "85,879",
    })
    assert s.total_turnover == 4489236458.2
    assert s.total_volume == 12540423
    assert s.total_transactions == 85879


def test_summary_missing_required_raises():
    with pytest.raises(ValidationError):
        RawSummary.model_validate({"Total Turnover Rs:": "1"})


def test_company_status_normalised():
    assert RawCompanyRow.model_validate(
        {"symbol": "NABIL", "companyName": "Nabil", "status": "Active"}
    ).status == "A"
    assert RawCompanyRow.model_validate(
        {"symbol": "XYZ", "companyName": "Xyz", "status": "Suspended"}
    ).status == "S"


def test_index_row_required_dash_value_raises():
    with pytest.raises(ValidationError):
        RawIndexRow.model_validate({"currentValue": "-"})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest stocks/tests/test_nepse_schemas.py -k "summary or company or index" -v`
Expected: FAIL with `ImportError` for the new names.

- [ ] **Step 3: Add the three models + status normaliser**

Append to `backend/stocks/services/market_data/providers/nepse_schemas.py`:

```python
SUMMARY_ALIASES = {
    "total_turnover": ("Total Turnover Rs:", "totalTurnover"),
    "total_volume": ("Total Traded Shares", "totalTradedShares"),
    "total_transactions": ("Total Transactions", "totalTransactions"),
}
COMPANY_ALIASES = {
    "symbol": ("symbol", "securitySymbol"),
    "name": ("companyName", "securityName", "name"),
    "sector": ("sectorName", "sector"),
    "status": ("status",),
}
INDEX_ALIASES = {
    "value": ("currentValue", "value", "close"),
    "change": ("change", "pointChange"),
    "change_percent": ("perChange", "percentageChange", "percentChange"),
    "turnover": ("turnover",),
}


def normalize_company_status(raw):
    """Translate the external status vocabulary into the app's canonical codes.

    Company.objects (EquityManager) filters status == 'A', so active/listed
    companies MUST normalize to 'A' or they become invisible app-wide. Unknown
    values pass through unchanged (visible in data rather than mislabeled).
    """
    if raw is None:
        return None
    s = str(raw).strip().lower()
    if s in ("a", "active", "listed", "open", "trading"):
        return "A"
    if s.startswith("susp"):
        return "S"
    if s.startswith("delist") or s in ("d", "inactive", "i", "closed"):
        return "D"
    return str(raw)


class RawSummary(_RawRow):
    total_turnover: float = Field(validation_alias=_alias(SUMMARY_ALIASES["total_turnover"]))
    total_volume: int = Field(validation_alias=_alias(SUMMARY_ALIASES["total_volume"]))
    total_transactions: int = Field(validation_alias=_alias(SUMMARY_ALIASES["total_transactions"]))

    @field_validator("total_turnover", "total_volume", "total_transactions", mode="before")
    @classmethod
    def _clean_numbers(cls, value):
        return _coerce_number(value)


class RawCompanyRow(_RawRow):
    symbol: str = Field(validation_alias=_alias(COMPANY_ALIASES["symbol"]))
    name: str = Field(validation_alias=_alias(COMPANY_ALIASES["name"]))
    sector: Optional[str] = Field(default=None, validation_alias=_alias(COMPANY_ALIASES["sector"]))
    status: Optional[str] = Field(default=None, validation_alias=_alias(COMPANY_ALIASES["status"]))

    @field_validator("status", mode="before")
    @classmethod
    def _normalize_status(cls, value):
        return normalize_company_status(value)


class RawIndexRow(_RawRow):
    value: float = Field(validation_alias=_alias(INDEX_ALIASES["value"]))
    change: Optional[float] = Field(default=None, validation_alias=_alias(INDEX_ALIASES["change"]))
    change_percent: Optional[float] = Field(default=None, validation_alias=_alias(INDEX_ALIASES["change_percent"]))
    turnover: Optional[float] = Field(default=None, validation_alias=_alias(INDEX_ALIASES["turnover"]))

    @field_validator("value", "change", "change_percent", "turnover", mode="before")
    @classmethod
    def _clean_numbers(cls, value):
        return _coerce_number(value)
```

- [ ] **Step 4: Run schema tests to verify they pass**

Run: `pytest stocks/tests/test_nepse_schemas.py -k "summary or company or index" -v`
Expected: PASS.

- [ ] **Step 5: Refactor the three provider methods**

In `nepse_api.py` update the schemas import to include all five models:

```python
from .nepse_schemas import (
    RawCompanyRow, RawFloorsheetRow, RawIndexRow, RawPriceRow, RawSummary,
)
```

Replace `fetch_market_summary` (current lines 210-226) with:

```python
    def fetch_market_summary(self, on: _date) -> MarketSummaryRecord:
        summary = self.client.get_json("/Summary")
        if not isinstance(summary, dict):
            raise ProviderSchemaError(f"Summary: expected dict, got {type(summary).__name__}")
        try:
            totals = RawSummary.model_validate(summary)
        except ValidationError as exc:
            raise ProviderSchemaError(
                f"Summary: {exc.error_count()} invalid field(s)"
            ) from exc
        gainers = self._rows(self.client.get_json("/TopGainers"), "TopGainers")
        losers = self._rows(self.client.get_json("/TopLosers"), "TopLosers")
        return MarketSummaryRecord(
            date=on,
            total_turnover=totals.total_turnover,
            total_volume=totals.total_volume,
            total_transactions=totals.total_transactions,
            top_gainers=list(gainers),
            top_losers=list(losers),
        )
```

Replace `fetch_company_list` (current lines 228-238) with:

```python
    def fetch_company_list(self) -> List[CompanyRecord]:
        rows = self._rows(self.client.get_json("/CompanyList"), "CompanyList")
        return [self._company_record(row) for row in rows]

    @staticmethod
    def _company_record(row: dict) -> CompanyRecord:
        try:
            raw = RawCompanyRow.model_validate(row)
        except ValidationError as exc:
            raise ProviderSchemaError(
                f"CompanyList: {exc.error_count()} invalid field(s); "
                f"row keys={sorted(row.keys())}"
            ) from exc
        return CompanyRecord(**raw.model_dump())
```

Replace `fetch_indices` (current lines 240-263) with:

```python
    def fetch_indices(self, on: _date) -> List[IndexRecord]:
        payload = self.client.get_json("/NepseIndex")
        items = self._index_items(payload)
        out: List[IndexRecord] = []
        for key, row in items:
            if not isinstance(row, dict):
                continue
            name = key or row.get("index") or row.get("indexName")
            if not name:
                raise ProviderSchemaError("NepseIndex: row missing an index name")
            out.append(self._index_record(str(name), row, on))
        return out

    @staticmethod
    def _index_items(payload):
        if isinstance(payload, dict):
            return list(payload.items())  # {name: {...}}
        if isinstance(payload, list):
            return [(None, row) for row in payload]
        raise ProviderSchemaError(f"NepseIndex: unexpected type {type(payload).__name__}")

    @staticmethod
    def _index_record(name: str, row: dict, on: _date) -> IndexRecord:
        try:
            raw = RawIndexRow.model_validate(row)
        except ValidationError as exc:
            raise ProviderSchemaError(
                f"NepseIndex[{name}]: {exc.error_count()} invalid field(s)"
            ) from exc
        return IndexRecord(index_name=name, date=on, **raw.model_dump())
```

- [ ] **Step 6: Run the full provider suite**

Run: `pytest stocks/tests/test_nepse_provider.py -v`
Expected: PASS — all 16 tests green, including summary-merge, company-status, both index shapes, and all `ProviderSchemaError` cases.

- [ ] **Step 7: Commit**

```bash
git add backend/stocks/services/market_data/providers/nepse_schemas.py backend/stocks/services/market_data/providers/nepse_api.py backend/stocks/tests/test_nepse_schemas.py
git commit -m "refactor(nepse): parse summary/company/index via pydantic models"
```

---

### Task 6: Delete the legacy helpers and run the full suite

With every method on inbound models, `_num`, `_pick`, `_req_num`, the `_norm_company_status` (moved to `nepse_schemas.normalize_company_status`), and the `*_MAP` class attributes are dead. Remove them.

**Files:**
- Modify: `backend/stocks/services/market_data/providers/nepse_api.py`

- [ ] **Step 1: Confirm nothing else imports the helpers**

Run: `grep -rnE "_num|_pick|_req_num|_norm_company_status|PRICE_MAP|FLOOR_MAP|COMPANY_MAP|SUMMARY_FIELDS|INDEX_FIELDS" backend --include="*.py" | grep -v nepse_schemas`
Expected: only matches inside `nepse_api.py` itself (definitions about to be deleted) and none in other modules or tests.

- [ ] **Step 2: Delete the dead code**

In `backend/stocks/services/market_data/providers/nepse_api.py`:
- Delete the module-level functions `_num` (lines 28-34), `_pick` (37-47), `_norm_company_status` (50-69), and `_req_num` (72-81).
- Delete the class attributes `PRICE_MAP`, `FLOOR_MAP`, `COMPANY_MAP`, `SUMMARY_FIELDS`, `INDEX_FIELDS` (the `# Candidate key names...` block, current lines 87-133). These now live in `nepse_schemas.py` as `*_ALIASES`.
- Keep `_rows` (the envelope unwrapper) and the `__init__`.
- Update the module docstring's reference to "FIELD_MAPs" to point at `nepse_schemas.py`:

```python
"""NepseApiProvider — the ONLY module that knows NepseAPI URLs and endpoints.

To switch data sources, write a new provider implementing MarketDataProvider
and register it in factory.py. Nothing else in the codebase changes.

Raw field-name mappings live in nepse_schemas.py (the inbound models). Run
`manage.py capture_nepse_fixtures` and confirm the *_ALIASES there against the
captured keys; on drift, change the alias tuple in nepse_schemas.py only.
"""
```

- [ ] **Step 3: Run the full market-data test set**

Run: `pytest stocks/tests/test_nepse_provider.py stocks/tests/test_nepse_schemas.py stocks/tests/test_market_data_contracts.py stocks/tests/test_market_data_ingestion.py stocks/tests/test_market_data_factory.py stocks/tests/test_ingest_market_data_command.py -v`
Expected: PASS — entire market-data boundary green.

- [ ] **Step 4: Run the whole backend suite to catch any consumer regressions**

Run: `pytest -q`
Expected: PASS (same pass/fail baseline as before the branch — no new failures). Pay attention to anything importing `contracts` DTOs.

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/services/market_data/providers/nepse_api.py
git commit -m "refactor(nepse): remove hand-rolled validation helpers superseded by pydantic"
```

---

## Self-Review Notes

- **Spec coverage:** Every behaviour-contract bullet maps to a task — optional/required sentinel handling (Tasks 3-5 validators), comma stripping (`_coerce_number`), company status (Task 5), injected `date` (kept as method kwarg, never in models), floorsheet datetime fallback (Task 4 `_parse_floor_datetime`), dict-or-list index (Task 5 `_index_items`).
- **Type consistency:** Inbound model field names match the canonical DTO field names exactly, so `PriceRecord(date=on, **raw.model_dump())` and siblings line up. `raw_datetime` is the one inbound-only field, excluded via `model_dump(exclude=...)`.
- **`live_integration` test:** `test_nepse_live_integration.py` hits the real API and is presumably network-gated/skipped in CI — do not rely on it for this refactor; the fixture-backed tests are the regression net.
- **Risk — pydantic int-from-float coercion:** `trans`, `total_volume`, etc. rely on lax `float → int`. NEPSE sends integer-valued counts, so this matches `int(...)`. If a fractional value ever appears it now raises (stricter than the old silent `int()` truncation) — an improvement, but note it in the PR description.
- **30-line limit:** every new/refactored method stays well under 30 lines (helpers extracted: `_price_record`, `_floorsheet_record`, `_parse_floor_datetime`, `_company_record`, `_index_items`, `_index_record`).
```
