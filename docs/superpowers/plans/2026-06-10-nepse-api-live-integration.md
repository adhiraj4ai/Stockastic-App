# NepseAPI Live Data Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a manually-triggered, end-of-day data pull from the NepseAPI-Unofficial service that populates Stockastic's market-data tables (prices, floorsheet, market summary, companies, indices) behind an anti-corruption layer, so a future API change touches exactly one file.

**Architecture:** A `MarketDataProvider` interface + frozen canonical DTOs decouple the rest of the system from the external API. A single `NepseApiProvider` adapter is the only code that knows NepseAPI URLs/field names; it maps raw JSON → DTOs and raises `ProviderSchemaError` *before* any DB write if the shape drifts. A provider-agnostic `IngestionService` idempotently upserts DTOs into Django models. A `ingest_market_data` management command orchestrates per-dataset (isolated) ingestion, surfaced through the existing pipeline SSE/streaming UI as a "Fetch from NepseAPI" button. The manual CSV upload path is retained as a fallback.

**Tech Stack:** Django 5.1 + DRF, Celery (not used here — manual trigger only), `requests` (already a backend dep), Postgres (raw `managed=False` tables for prices/floorsheet), Next.js/React frontend, pytest (`backend/stocks/tests/`).

---

## Field-name strategy (read before Task 4)

NepseAPI is a thin pass-through over the upstream `nepse` Python library, so the exact JSON
keys (e.g. `openPrice` vs `open`) are owned upstream and **must be confirmed against real
responses**, not guessed. This plan handles that safely:

1. **Task 1** ships a `capture_nepse_fixtures` command. The implementing engineer runs it once
   against the configured API to save **real** JSON into `backend/stocks/tests/fixtures/nepse/`.
2. Each adapter maps via a single per-dataset `FIELD_MAP` dict + a `_pick()` helper. The
   `FIELD_MAP` values below are seeded with the upstream NEPSE schema's known key names.
3. Every mapping task includes a **verify step**: print the captured fixture's keys and confirm
   the `FIELD_MAP` matches; if a key differs, change it in the one `FIELD_MAP` and nowhere else.
4. Committed fixtures (hand-written to the seeded shape) make the unit tests deterministic and
   network-free; the capture command lets you overwrite them with live data to re-verify.

This is the "API change = one-file edit" guarantee in practice: drift shows up as a failing
mapping test and is fixed in a `FIELD_MAP`.

---

## File Structure

**New files**
- `backend/stocks/services/market_data/__init__.py` — public exports
- `backend/stocks/services/market_data/contracts.py` — DTOs, `MarketDataProvider`, exceptions
- `backend/stocks/services/market_data/factory.py` — `get_provider()` + registry
- `backend/stocks/services/market_data/ingestion.py` — `IngestionService`, `IngestResult`
- `backend/stocks/services/market_data/providers/__init__.py`
- `backend/stocks/services/market_data/providers/http_client.py` — `NepseHttpClient`
- `backend/stocks/services/market_data/providers/nepse_api.py` — `NepseApiProvider`
- `backend/stocks/management/commands/ingest_market_data.py` — orchestration command
- `backend/stocks/management/commands/capture_nepse_fixtures.py` — fixture capture utility
- `backend/stocks/tests/fixtures/nepse/*.json` — recorded sample responses
- `backend/stocks/tests/test_market_data_contracts.py`
- `backend/stocks/tests/test_nepse_provider.py`
- `backend/stocks/tests/test_market_data_factory.py`
- `backend/stocks/tests/test_market_data_ingestion.py`
- `backend/stocks/tests/test_ingest_market_data_command.py`

**Modified files**
- `backend/stocks/models/market.py` — add `DailyIndexValue`
- `backend/stocks/models/__init__.py` — export `DailyIndexValue`
- `backend/stocks/models/system.py` — add `API_INGEST` upload type
- `backend/stockastic/settings.py` — `NEPSE_API_BASE_URL`, `NEPSE_API_PROVIDER`
- `backend/stocks/views/pipeline.py` — `ingest_market_data_stream` action + parser line
- `frontend/src/app/(authenticated)/admin/pipeline/PipelinePageClient.tsx` — Fetch card
- `docker-compose.yml` — env vars + optional `nepseapi` service

---

## Task 1: Scaffold module, settings config, and fixture-capture command

**Files:**
- Create: `backend/stocks/services/market_data/__init__.py`
- Create: `backend/stocks/services/market_data/providers/__init__.py`
- Create: `backend/stocks/management/commands/capture_nepse_fixtures.py`
- Modify: `backend/stockastic/settings.py` (end of file)

- [ ] **Step 1: Create the package files**

`backend/stocks/services/market_data/__init__.py`:
```python
"""Market-data ingestion: anti-corruption layer over external NEPSE data providers.

The rest of Stockastic depends only on the canonical DTOs and the
``MarketDataProvider`` interface defined in ``contracts``. Provider-specific
knowledge lives entirely in ``providers/``. Swap providers via ``factory.get_provider``.
"""
```

`backend/stocks/services/market_data/providers/__init__.py`:
```python
"""Concrete MarketDataProvider implementations. Adding a provider here +
registering it in ``factory`` is the ONLY change needed to switch data sources."""
```

- [ ] **Step 2: Add settings config**

Append to `backend/stockastic/settings.py`:
```python
# ── External market-data provider (NepseAPI etc.) ──────────────────────────
# Default to the free public instance; override to a self-hosted container in prod.
NEPSE_API_BASE_URL = os.getenv("NEPSE_API_BASE_URL", "https://nepseapi.surajrimal.dev")
NEPSE_API_PROVIDER = os.getenv("NEPSE_API_PROVIDER", "nepseapi")
NEPSE_API_TIMEOUT = float(os.getenv("NEPSE_API_TIMEOUT", "30"))
```
(If `import os` is not already at the top of settings.py, confirm it is — Django settings always import os; do not add a duplicate.)

- [ ] **Step 3: Create the fixture-capture command**

`backend/stocks/management/commands/capture_nepse_fixtures.py`:
```python
"""Capture real NepseAPI responses into test fixtures.

Run once (against the configured NEPSE_API_BASE_URL) to record ground-truth
JSON, then verify the provider FIELD_MAPs against the captured keys:

    python manage.py capture_nepse_fixtures
"""
import json
import os

import requests
from django.conf import settings
from django.core.management.base import BaseCommand

ENDPOINTS = {
    "price_volume": "/PriceVolume",
    "summary": "/Summary",
    "top_gainers": "/TopGainers",
    "top_losers": "/TopLosers",
    "company_list": "/CompanyList",
    "nepse_index": "/NepseIndex",
    "floorsheet": "/Floorsheet",
}

FIXTURE_DIR = os.path.join(
    settings.BASE_DIR, "stocks", "tests", "fixtures", "nepse"
)


class Command(BaseCommand):
    help = "Capture live NepseAPI responses into test fixtures."

    def handle(self, *args, **options):
        os.makedirs(FIXTURE_DIR, exist_ok=True)
        base = settings.NEPSE_API_BASE_URL.rstrip("/")
        headers = {"User-Agent": "Stockastic/1.0", "Accept": "application/json"}
        for name, path in ENDPOINTS.items():
            url = f"{base}{path}"
            try:
                resp = requests.get(url, headers=headers, timeout=settings.NEPSE_API_TIMEOUT)
                resp.raise_for_status()
                payload = resp.json()
            except Exception as e:  # noqa: BLE001 - capture utility, log and continue
                self.stderr.write(f"FAILED {name} ({url}): {e}")
                continue
            out = os.path.join(FIXTURE_DIR, f"{name}.json")
            with open(out, "w") as fh:
                json.dump(payload, fh, indent=2)
            keys = sorted(payload[0].keys()) if isinstance(payload, list) and payload else (
                sorted(payload.keys()) if isinstance(payload, dict) else "(scalar/list)"
            )
            self.stdout.write(f"Saved {name}: top-level keys = {keys}")
        self.stdout.write("Fixture capture complete.")
```

- [ ] **Step 4: Create the fixtures directory with a keep file**

```bash
mkdir -p backend/stocks/tests/fixtures/nepse
touch backend/stocks/tests/fixtures/nepse/.gitkeep
```

- [ ] **Step 5: Sanity-check the command is registered**

Run: `cd backend && python manage.py help capture_nepse_fixtures`
Expected: prints the help text without error (no network call yet).

- [ ] **Step 6: Commit**

```bash
git add backend/stocks/services/market_data backend/stocks/management/commands/capture_nepse_fixtures.py backend/stocks/tests/fixtures/nepse/.gitkeep backend/stockastic/settings.py
git commit -m "feat(market-data): scaffold provider module, settings, fixture capture"
```

---

## Task 2: Canonical contracts — DTOs, exceptions, provider interface

**Files:**
- Create: `backend/stocks/services/market_data/contracts.py`
- Test: `backend/stocks/tests/test_market_data_contracts.py`

- [ ] **Step 1: Write the failing test**

`backend/stocks/tests/test_market_data_contracts.py`:
```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest stocks/tests/test_market_data_contracts.py -v`
Expected: FAIL — `ModuleNotFoundError: ... market_data.contracts`.

- [ ] **Step 3: Implement contracts**

`backend/stocks/services/market_data/contracts.py`:
```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest stocks/tests/test_market_data_contracts.py -v`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/services/market_data/contracts.py backend/stocks/tests/test_market_data_contracts.py
git commit -m "feat(market-data): canonical DTOs, exceptions, provider interface"
```

---

## Task 3: HTTP client wrapper

**Files:**
- Create: `backend/stocks/services/market_data/providers/http_client.py`
- Test: `backend/stocks/tests/test_nepse_provider.py` (the http-client section)

- [ ] **Step 1: Write the failing test**

`backend/stocks/tests/test_nepse_provider.py`:
```python
from unittest.mock import MagicMock, patch

import pytest
import requests

from stocks.services.market_data.contracts import ProviderUnavailableError
from stocks.services.market_data.providers.http_client import NepseHttpClient


def _resp(json_payload, status=200):
    m = MagicMock()
    m.status_code = status
    m.json.return_value = json_payload
    m.raise_for_status.side_effect = (
        None if status < 400 else requests.HTTPError(f"{status}")
    )
    return m


def test_get_json_returns_payload():
    client = NepseHttpClient(base_url="https://example.test", timeout=5)
    with patch("requests.Session.get", return_value=_resp({"ok": 1})) as g:
        assert client.get_json("/Summary") == {"ok": 1}
        called_url = g.call_args[0][0]
        assert called_url == "https://example.test/Summary"


def test_get_json_raises_unavailable_on_timeout():
    client = NepseHttpClient(base_url="https://example.test", timeout=5, retries=0)
    with patch("requests.Session.get", side_effect=requests.Timeout("slow")):
        with pytest.raises(ProviderUnavailableError):
            client.get_json("/Summary")


def test_get_json_raises_unavailable_on_5xx():
    client = NepseHttpClient(base_url="https://example.test", timeout=5, retries=0)
    with patch("requests.Session.get", return_value=_resp({}, status=503)):
        with pytest.raises(ProviderUnavailableError):
            client.get_json("/Summary")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest stocks/tests/test_nepse_provider.py -v`
Expected: FAIL — `ModuleNotFoundError: ... providers.http_client`.

- [ ] **Step 3: Implement the client**

`backend/stocks/services/market_data/providers/http_client.py`:
```python
"""Thin HTTP wrapper used by HTTP-based providers.

Normalizes all transport failures (timeout, connection error, 4xx/5xx, rate
limit) into ProviderUnavailableError so callers never see raw requests errors.
"""
from __future__ import annotations

import time

import requests

from ..contracts import ProviderUnavailableError


class NepseHttpClient:
    def __init__(self, base_url: str, timeout: float = 30, retries: int = 2,
                 backoff: float = 1.5):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.retries = retries
        self.backoff = backoff
        self.session = requests.Session()
        self.session.headers.update(
            {"User-Agent": "Stockastic/1.0", "Accept": "application/json"}
        )

    def get_json(self, path: str, params: dict | None = None):
        url = f"{self.base_url}{path}"
        last_err: Exception | None = None
        for attempt in range(self.retries + 1):
            try:
                resp = self.session.get(url, params=params, timeout=self.timeout)
                if resp.status_code == 429:
                    raise ProviderUnavailableError(f"rate-limited (429) for {url}")
                resp.raise_for_status()
                return resp.json()
            except ProviderUnavailableError:
                raise
            except (requests.RequestException, ValueError) as e:
                last_err = e
                if attempt < self.retries:
                    time.sleep(self.backoff ** attempt)
        raise ProviderUnavailableError(f"request failed for {url}: {last_err}")
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest stocks/tests/test_nepse_provider.py -v`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/services/market_data/providers/http_client.py backend/stocks/tests/test_nepse_provider.py
git commit -m "feat(market-data): HTTP client wrapper with error normalization"
```

---

## Task 4: NepseApiProvider — prices mapping (with verifiable FIELD_MAP)

**Files:**
- Create: `backend/stocks/services/market_data/providers/nepse_api.py`
- Create: `backend/stocks/tests/fixtures/nepse/price_volume.json`
- Test: `backend/stocks/tests/test_nepse_provider.py` (append)

- [ ] **Step 1: Create a committed price fixture (seeded shape)**

`backend/stocks/tests/fixtures/nepse/price_volume.json`:
```json
[
  {
    "symbol": "NABIL",
    "securityName": "Nabil Bank Limited",
    "openPrice": 500.0,
    "highPrice": 512.0,
    "lowPrice": 498.0,
    "closePrice": 510.0,
    "previousClose": 505.0,
    "totalTradedQuantity": 12345,
    "totalTradedValue": 6300000.0,
    "totalTrades": 210,
    "averageTradedPrice": 506.5,
    "fiftyTwoWeekHigh": 640.0,
    "fiftyTwoWeekLow": 410.0,
    "businessDate": "2026-06-10"
  }
]
```

- [ ] **Step 2: Write the failing test (append to test_nepse_provider.py)**

```python
import json
import os
from datetime import date

from django.conf import settings

from stocks.services.market_data.contracts import PriceRecord, ProviderSchemaError
from stocks.services.market_data.providers.nepse_api import NepseApiProvider

FIX = os.path.join(settings.BASE_DIR, "stocks", "tests", "fixtures", "nepse")


def _load(name):
    with open(os.path.join(FIX, name)) as fh:
        return json.load(fh)


def _provider_returning(payload):
    """NepseApiProvider whose HTTP client returns a canned payload."""
    prov = NepseApiProvider(base_url="https://example.test")
    prov.client.get_json = lambda path, params=None: payload  # type: ignore
    return prov


def test_map_prices_from_fixture():
    prov = _provider_returning(_load("price_volume.json"))
    recs = prov.fetch_daily_prices(date(2026, 6, 10))
    assert len(recs) == 1
    r = recs[0]
    assert isinstance(r, PriceRecord)
    assert r.symbol == "NABIL"
    assert r.close == 510.0
    assert r.open == 500.0
    assert r.high == 512.0
    assert r.volume == 12345
    assert r.prev_close == 505.0
    assert r.weeks_52_high == 640.0


def test_map_prices_raises_schema_error_on_missing_key():
    # Drift: 'closePrice'/'lastTradedPrice' both absent -> cannot resolve close
    prov = _provider_returning([{"symbol": "NABIL", "openPrice": 1.0}])
    with pytest.raises(ProviderSchemaError):
        prov.fetch_daily_prices(date(2026, 6, 10))
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && python -m pytest stocks/tests/test_nepse_provider.py -v`
Expected: FAIL — `ModuleNotFoundError: ... providers.nepse_api`.

- [ ] **Step 4: Implement NepseApiProvider with the prices mapping**

`backend/stocks/services/market_data/providers/nepse_api.py`:
```python
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && python -m pytest stocks/tests/test_nepse_provider.py -v`
Expected: prices + http-client tests pass.

- [ ] **Step 6: VERIFY FIELD_MAP against real data (do this once, in the real backend env)**

Run: `cd backend && python manage.py capture_nepse_fixtures`
Then open `stocks/tests/fixtures/nepse/price_volume.json` (now real data) and confirm the
keys match `PRICE_MAP`. If any differ, update the candidate tuple in `PRICE_MAP` only, then
re-run Step 5. Commit the real fixture.

- [ ] **Step 7: Commit**

```bash
git add backend/stocks/services/market_data/providers/nepse_api.py backend/stocks/tests/fixtures/nepse/price_volume.json backend/stocks/tests/test_nepse_provider.py
git commit -m "feat(market-data): NepseApiProvider price mapping with schema guard"
```

---

## Task 5: NepseApiProvider — floorsheet, summary, companies, indices

**Files:**
- Modify: `backend/stocks/services/market_data/providers/nepse_api.py`
- Create: `backend/stocks/tests/fixtures/nepse/{floorsheet,summary,top_gainers,top_losers,company_list,nepse_index}.json`
- Test: `backend/stocks/tests/test_nepse_provider.py` (append)

- [ ] **Step 1: Create committed fixtures (seeded shapes)**

`floorsheet.json`:
```json
[
  {
    "contractId": 202606100001,
    "stockSymbol": "NABIL",
    "buyerMemberId": 58,
    "sellerMemberId": 12,
    "contractQuantity": 100,
    "contractRate": 510.0,
    "contractAmount": 51000.0,
    "businessDate": "2026-06-10",
    "tradeTime": "2026-06-10T11:30:00",
    "tradeBookId": 999,
    "stockId": 131,
    "buyerBrokerName": "Broker 58",
    "sellerBrokerName": "Broker 12",
    "securityName": "Nabil Bank Limited"
  }
]
```

`summary.json`:
```json
{
  "Total Turnover Rs:": 4489236458.2,
  "Total Traded Shares": 12540423,
  "Total Transactions": 85879,
  "Total Scrips Traded": 242
}
```

`top_gainers.json`:
```json
[{"symbol": "ABC", "pointChange": 40.0, "percentageChange": 9.5, "ltp": 460.0}]
```

`top_losers.json`:
```json
[{"symbol": "XYZ", "pointChange": -30.0, "percentageChange": -8.0, "ltp": 345.0}]
```

`company_list.json`:
```json
[{"symbol": "NABIL", "companyName": "Nabil Bank Limited", "sectorName": "Commercial Banks", "status": "Active"}]
```

`nepse_index.json`:
```json
{
  "NEPSE Index": {"index": "NEPSE Index", "currentValue": 2650.5, "change": 12.3, "perChange": 0.47},
  "Banking": {"index": "Banking", "currentValue": 1450.2, "change": -3.1, "perChange": -0.21}
}
```

- [ ] **Step 2: Write the failing tests (append)**

```python
from datetime import date as _d

from stocks.services.market_data.contracts import (
    CompanyRecord, FloorsheetRecord, IndexRecord, MarketSummaryRecord,
)


def test_map_floorsheet():
    prov = _provider_returning(_load("floorsheet.json"))
    recs = list(prov.fetch_floorsheet(_d(2026, 6, 10)))
    assert len(recs) == 1
    r = recs[0]
    assert isinstance(r, FloorsheetRecord)
    assert r.transaction_id == 202606100001
    assert r.symbol == "NABIL"
    assert r.quantity == 100 and r.rate == 510.0
    assert r.buyer_id == 58 and r.seller_id == 12


def test_map_market_summary_merges_gainers_losers():
    prov = NepseApiProvider(base_url="https://example.test")
    payloads = {
        "/Summary": _load("summary.json"),
        "/TopGainers": _load("top_gainers.json"),
        "/TopLosers": _load("top_losers.json"),
    }
    prov.client.get_json = lambda path, params=None: payloads[path]  # type: ignore
    rec = prov.fetch_market_summary(_d(2026, 6, 10))
    assert isinstance(rec, MarketSummaryRecord)
    assert rec.total_turnover == 4489236458.2
    assert rec.total_transactions == 85879
    assert rec.top_gainers and rec.top_gainers[0]["symbol"] == "ABC"
    assert rec.top_losers and rec.top_losers[0]["symbol"] == "XYZ"


def test_map_company_list():
    prov = _provider_returning(_load("company_list.json"))
    recs = prov.fetch_company_list()
    assert recs[0] == CompanyRecord(
        symbol="NABIL", name="Nabil Bank Limited",
        sector="Commercial Banks", status="Active",
    )


def test_map_indices_from_dict():
    prov = _provider_returning(_load("nepse_index.json"))
    recs = prov.fetch_indices(_d(2026, 6, 10))
    by_name = {r.index_name: r for r in recs}
    assert isinstance(by_name["Banking"], IndexRecord)
    assert by_name["NEPSE Index"].value == 2650.5
    assert by_name["Banking"].change == -3.1
```

- [ ] **Step 3: Run to verify failure**

Run: `cd backend && python -m pytest stocks/tests/test_nepse_provider.py -v`
Expected: FAIL — `NotImplementedError` for the new methods.

- [ ] **Step 4: Implement the four methods (replace the NotImplementedError stubs)**

In `nepse_api.py`, add the field maps as class attributes (next to `PRICE_MAP`):
```python
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
```

Replace the four stub methods with:
```python
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && python -m pytest stocks/tests/test_nepse_provider.py -v`
Expected: all provider tests pass.

- [ ] **Step 6: VERIFY FIELD_MAPs against real data**

Re-run `python manage.py capture_nepse_fixtures`, confirm each fixture's keys match the maps,
adjust candidate tuples as needed, re-run Step 5, and commit the real fixtures.

- [ ] **Step 7: Commit**

```bash
git add backend/stocks/services/market_data/providers/nepse_api.py backend/stocks/tests/fixtures/nepse/ backend/stocks/tests/test_nepse_provider.py
git commit -m "feat(market-data): NepseApiProvider floorsheet/summary/company/index mapping"
```

---

## Task 6: Provider factory + registry

**Files:**
- Create: `backend/stocks/services/market_data/factory.py`
- Test: `backend/stocks/tests/test_market_data_factory.py`

- [ ] **Step 1: Write the failing test**

`backend/stocks/tests/test_market_data_factory.py`:
```python
import pytest
from django.test import override_settings

from stocks.services.market_data.factory import get_provider, register_provider
from stocks.services.market_data.providers.nepse_api import NepseApiProvider


def test_get_provider_returns_nepseapi_by_default():
    with override_settings(NEPSE_API_PROVIDER="nepseapi"):
        assert isinstance(get_provider(), NepseApiProvider)


def test_get_provider_explicit_name_overrides_setting():
    assert isinstance(get_provider("nepseapi"), NepseApiProvider)


def test_unknown_provider_raises():
    with pytest.raises(ValueError):
        get_provider("does-not-exist")


def test_register_provider_adds_to_registry():
    class Dummy:
        name = "dummy"

        def __init__(self, **kw):
            pass

    register_provider("dummy", Dummy)
    assert isinstance(get_provider("dummy"), Dummy)
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && python -m pytest stocks/tests/test_market_data_factory.py -v`
Expected: FAIL — `ModuleNotFoundError: ... market_data.factory`.

- [ ] **Step 3: Implement the factory**

`backend/stocks/services/market_data/factory.py`:
```python
"""Provider selection. Swapping the external data source is: register a class
here + set NEPSE_API_PROVIDER. No other code changes."""
from __future__ import annotations

from django.conf import settings

from .contracts import MarketDataProvider
from .providers.nepse_api import NepseApiProvider

_REGISTRY: dict[str, type] = {
    "nepseapi": NepseApiProvider,
}


def register_provider(name: str, cls: type) -> None:
    _REGISTRY[name] = cls


def get_provider(name: str | None = None) -> MarketDataProvider:
    key = name or getattr(settings, "NEPSE_API_PROVIDER", "nepseapi")
    try:
        cls = _REGISTRY[key]
    except KeyError:
        raise ValueError(
            f"Unknown market-data provider '{key}'. Registered: {sorted(_REGISTRY)}"
        )
    return cls()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest stocks/tests/test_market_data_factory.py -v`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/services/market_data/factory.py backend/stocks/tests/test_market_data_factory.py
git commit -m "feat(market-data): provider factory + registry"
```

---

## Task 7: DailyIndexValue model + migration

**Files:**
- Modify: `backend/stocks/models/market.py` (append the class)
- Modify: `backend/stocks/models/__init__.py`
- Create: migration (generated)

- [ ] **Step 1: Add the model**

Append to `backend/stocks/models/market.py`:
```python
class DailyIndexValue(models.Model):
    index_name = models.CharField(max_length=64, db_index=True)
    date = models.DateField(db_index=True)
    value = models.DecimalField(max_digits=14, decimal_places=2)
    open = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    high = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    low = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    change = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    change_percent = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    turnover = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)

    class Meta:
        db_table = 'daily_index_value'
        unique_together = ('index_name', 'date')
        ordering = ['-date', 'index_name']
        indexes = [models.Index(fields=['index_name', 'date'])]

    def __str__(self):
        return f"{self.index_name} {self.date}: {self.value}"
```

- [ ] **Step 2: Export it**

In `backend/stocks/models/__init__.py`, add `DailyIndexValue` to the existing
`from .market import (...)` group (alongside `DailyMarketSummary`).

- [ ] **Step 3: Generate the migration**

Run: `cd backend && python manage.py makemigrations stocks`
Expected: "Create model DailyIndexValue" migration created.

- [ ] **Step 4: Apply it**

Run: `cd backend && python manage.py migrate stocks`
Expected: migration applies cleanly.

- [ ] **Step 5: Verify import**

Run: `cd backend && python -c "import django,os; os.environ.setdefault('DJANGO_SETTINGS_MODULE','stockastic.settings'); django.setup(); from stocks.models import DailyIndexValue; print('ok')"`
Expected: prints `ok`.

- [ ] **Step 6: Commit**

```bash
git add backend/stocks/models/market.py backend/stocks/models/__init__.py backend/stocks/migrations/
git commit -m "feat(market-data): DailyIndexValue model + migration"
```

---

## Task 8: IngestionService (provider-agnostic upserts)

**Files:**
- Create: `backend/stocks/services/market_data/ingestion.py`
- Test: `backend/stocks/tests/test_market_data_ingestion.py`

> Note: `DailyStockPrice`/`DailyFloorsheet` are `managed=False` (raw tables). The existing
> `backend/stocks/tests/conftest.py` already creates the `DailyStockPrice` table once per
> session via the schema editor (see its `django_db_setup` fixture), so price ingestion can be
> tested directly against the DB. `DailyFloorsheet` is **not** created by conftest, so do not
> assert floorsheet rows against the DB here — the command test (Task 9) exercises floorsheet
> via a fake provider returning an empty iterator. Managed targets (`DailyIndexValue`,
> `DailyMarketSummary`, `Company`) are created normally by the test runner.

- [ ] **Step 1: Write the failing test**

`backend/stocks/tests/test_market_data_ingestion.py`:
```python
from datetime import date

import pytest

from stocks.models import Company, DailyIndexValue, DailyMarketSummary
from stocks.services.market_data.contracts import (
    CompanyRecord, IndexRecord, MarketSummaryRecord, PriceRecord,
)
from stocks.services.market_data.ingestion import IngestionService

pytestmark = pytest.mark.django_db


def test_ingest_indices_upserts_idempotently():
    svc = IngestionService()
    recs = [IndexRecord(index_name="NEPSE", date=date(2026, 6, 10), value=2650.5, change=12.3)]
    r1 = svc.ingest_indices(recs)
    assert r1.inserted == 1
    # Re-run with a changed value -> update, not duplicate
    recs2 = [IndexRecord(index_name="NEPSE", date=date(2026, 6, 10), value=2660.0)]
    r2 = svc.ingest_indices(recs2)
    assert r2.updated == 1
    row = DailyIndexValue.objects.get(index_name="NEPSE", date=date(2026, 6, 10))
    assert float(row.value) == 2660.0
    assert DailyIndexValue.objects.count() == 1


def test_ingest_companies_upserts():
    svc = IngestionService()
    svc.ingest_companies([CompanyRecord(symbol="NABIL", name="Nabil Bank", sector="Banks")])
    assert Company.objects.filter(symbol="NABIL").exists()


def test_ingest_market_summary_upserts():
    svc = IngestionService()
    rec = MarketSummaryRecord(
        date=date(2026, 6, 10), total_turnover=4_489_236_458.2,
        total_volume=12_540_423, total_transactions=85_879,
        top_gainers=[{"symbol": "ABC"}],
    )
    svc.ingest_market_summary(rec)
    row = DailyMarketSummary.objects.get(date=date(2026, 6, 10))
    assert row.total_transactions == 85_879
    assert row.top_gainers == [{"symbol": "ABC"}]


def test_ingest_prices_rejects_nonpositive_close():
    svc = IngestionService()
    recs = [
        PriceRecord(symbol="GOOD", date=date(2026, 6, 10), close=100.0),
        PriceRecord(symbol="BAD", date=date(2026, 6, 10), close=0.0),
    ]
    result = svc.ingest_prices(recs)
    assert result.rejected == 1
    assert any(t == "BAD" for t, _ in result.rejections)
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && python -m pytest stocks/tests/test_market_data_ingestion.py -v`
Expected: FAIL — `ModuleNotFoundError: ... market_data.ingestion`.

- [ ] **Step 3: Implement the service**

`backend/stocks/services/market_data/ingestion.py`:
```python
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
            _, created = Company.objects.update_or_create(
                symbol=r.symbol,
                defaults=dict(name=r.name, sector=r.sector or "", status=r.status or ""),
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
```

- [ ] **Step 4: Confirm Company field names**

Run: `cd backend && python -c "import django,os; os.environ.setdefault('DJANGO_SETTINGS_MODULE','stockastic.settings'); django.setup(); from stocks.models import Company; print([f.name for f in Company._meta.fields])"`
Expected: includes `symbol`, `name`, `sector`, `status`. If `status`/`sector` differ, adjust the `defaults` dict in `ingest_companies` accordingly.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && python -m pytest stocks/tests/test_market_data_ingestion.py -v`
Expected: 4 passed. (If price/floorsheet rows hit the unmanaged-table limitation in the test DB, the price test here only exercises `validate_price_rows` + bulk_create; if `bulk_create` errors on a missing table in CI, mark that single assertion path with the project's existing unmanaged-table pattern from `conftest.py`.)

- [ ] **Step 6: Commit**

```bash
git add backend/stocks/services/market_data/ingestion.py backend/stocks/tests/test_market_data_ingestion.py
git commit -m "feat(market-data): provider-agnostic IngestionService with idempotent upserts"
```

---

## Task 9: `ingest_market_data` command (per-dataset isolation)

**Files:**
- Create: `backend/stocks/management/commands/ingest_market_data.py`
- Test: `backend/stocks/tests/test_ingest_market_data_command.py`

- [ ] **Step 1: Write the failing test**

`backend/stocks/tests/test_ingest_market_data_command.py`:
```python
from datetime import date
from io import StringIO

import pytest
from django.core.management import call_command

from stocks.models import DailyIndexValue
from stocks.services.market_data import factory
from stocks.services.market_data.contracts import (
    IndexRecord, ProviderSchemaError,
)

pytestmark = pytest.mark.django_db


class FakeProvider:
    name = "fake"

    def __init__(self, **kw):
        pass

    def fetch_indices(self, on):
        return [IndexRecord(index_name="NEPSE", date=on, value=2650.5)]

    def fetch_company_list(self):
        raise ProviderSchemaError("simulated drift in CompanyList")

    def fetch_daily_prices(self, on):
        return []

    def fetch_floorsheet(self, on):
        return iter(())

    def fetch_market_summary(self, on):
        from stocks.services.market_data.contracts import MarketSummaryRecord
        return MarketSummaryRecord(date=on, total_turnover=1.0, total_volume=1, total_transactions=1)


def test_command_isolates_failing_dataset(monkeypatch):
    factory.register_provider("fake", FakeProvider)
    out = StringIO()
    # indices succeeds, companies fails — command must still finish and ingest indices
    call_command(
        "ingest_market_data",
        "--provider", "fake",
        "--datasets", "indices,companies",
        "--date", "2026-06-10",
        stdout=out,
    )
    text = out.getvalue()
    assert DailyIndexValue.objects.filter(index_name="NEPSE").exists()
    assert "indices: OK" in text
    assert "companies: FAILED" in text
    assert "Total records saved:" in text
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && python -m pytest stocks/tests/test_ingest_market_data_command.py -v`
Expected: FAIL — `CommandError: Unknown command 'ingest_market_data'`.

- [ ] **Step 3: Implement the command**

`backend/stocks/management/commands/ingest_market_data.py`:
```python
"""Pull market data from the configured provider and ingest it, per-dataset.

Each dataset is isolated: a failure (transport or schema drift) in one does not
block the others. Existing data is untouched on failure.

    python manage.py ingest_market_data --datasets prices,floorsheet,summary,companies,indices --date 2026-06-10
"""
from __future__ import annotations

from datetime import date, datetime

from django.core.management.base import BaseCommand

from stocks.services.market_data.contracts import ProviderError
from stocks.services.market_data.factory import get_provider
from stocks.services.market_data.ingestion import IngestionService

ALL_DATASETS = ["prices", "floorsheet", "summary", "companies", "indices"]


class Command(BaseCommand):
    help = "Ingest market data from the configured external provider."

    def add_arguments(self, parser):
        parser.add_argument("--datasets", default=",".join(ALL_DATASETS))
        parser.add_argument("--date", default=None)
        parser.add_argument("--provider", default=None)

    def handle(self, *args, **opts):
        on = (
            datetime.strptime(opts["date"], "%Y-%m-%d").date()
            if opts["date"] else date.today()
        )
        datasets = [d.strip() for d in opts["datasets"].split(",") if d.strip()]
        provider = get_provider(opts["provider"])
        svc = IngestionService()
        self.stdout.write(f"Provider: {provider.name} | date: {on} | datasets: {datasets}")

        total_saved = 0
        any_ok = False
        for ds in datasets:
            try:
                if ds == "prices":
                    res = svc.ingest_prices(provider.fetch_daily_prices(on))
                elif ds == "floorsheet":
                    res = svc.ingest_floorsheet(provider.fetch_floorsheet(on))
                elif ds == "summary":
                    res = svc.ingest_market_summary(provider.fetch_market_summary(on))
                elif ds == "companies":
                    res = svc.ingest_companies(provider.fetch_company_list())
                elif ds == "indices":
                    res = svc.ingest_indices(provider.fetch_indices(on))
                else:
                    self.stderr.write(f"  {ds}: SKIPPED (unknown dataset)")
                    continue
                any_ok = True
                total_saved += res.total
                self.stdout.write(
                    f"  {ds}: OK — inserted={res.inserted} updated={res.updated} "
                    f"rejected={res.rejected}"
                )
            except ProviderError as e:
                self.stderr.write(f"  {ds}: FAILED — {type(e).__name__}: {e}")
            except Exception as e:  # noqa: BLE001 — isolate unexpected per-dataset errors
                self.stderr.write(f"  {ds}: FAILED — {type(e).__name__}: {e}")

        self.stdout.write(f"Total records saved: {total_saved}")
        if not any_ok:
            # Non-zero exit only when EVERY dataset failed.
            raise SystemExit(1)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest stocks/tests/test_ingest_market_data_command.py -v`
Expected: 1 passed (indices ingested, companies reported FAILED, command completes).

- [ ] **Step 5: Commit**

```bash
git add backend/stocks/management/commands/ingest_market_data.py backend/stocks/tests/test_ingest_market_data_command.py
git commit -m "feat(market-data): ingest_market_data command with per-dataset isolation"
```

---

## Task 10: DataUploadLog type + pipeline SSE endpoint

**Files:**
- Modify: `backend/stocks/models/system.py` (add upload type)
- Modify: `backend/stocks/views/pipeline.py` (new action + parser line)

- [ ] **Step 1: Add the upload type**

In `backend/stocks/models/system.py`, add to `DataUploadLog.UPLOAD_TYPES`:
```python
        ('API_INGEST', 'API Ingestion'),
```

- [ ] **Step 2: Generate + apply migration for the choices change**

Run: `cd backend && python manage.py makemigrations stocks && python manage.py migrate stocks`
Expected: an `AlterField` migration for `upload_type` is created and applied.

- [ ] **Step 3: Add the SSE action**

In `backend/stocks/views/pipeline.py`, add this action to `PipelineViewSet` (mirrors the
existing `*_stream` actions):
```python
    @action(detail=False, methods=['get'])
    def ingest_market_data_stream(self, request):
        datasets = request.query_params.get('datasets', 'prices,floorsheet,summary,companies,indices')
        date_str = request.query_params.get('date')
        log_entry = DataUploadLog.objects.create(
            file_name=f'NepseAPI Ingest ({datasets})', upload_type='API_INGEST', status='PENDING'
        )
        args = ['ingest_market_data', '--datasets', datasets]
        if date_str:
            args += ['--date', date_str]
        return self._run_manage_command_stream(args, log_entry)
```

- [ ] **Step 4: Teach the stdout parser the command's count line**

In `_run_manage_command_stream` in `pipeline.py`, alongside the existing regex patterns, add:
```python
                # API ingest: Total records saved: 123
                api_match = re.search(r"Total records saved: (\d+)", line_str)
                if api_match: records_found = int(api_match.group(1))
```

- [ ] **Step 5: Verify endpoint is wired (manual check)**

Run: `cd backend && python manage.py show_urls 2>/dev/null | grep ingest_market_data_stream || echo "use DRF router introspection"`
Expected: route `pipeline/ingest_market_data_stream/` exists. (If `show_urls` is unavailable,
confirm by hitting it once the server runs — Task 11 Step 6.)

- [ ] **Step 6: Commit**

```bash
git add backend/stocks/models/system.py backend/stocks/views/pipeline.py backend/stocks/migrations/
git commit -m "feat(market-data): API_INGEST upload type + pipeline SSE endpoint"
```

---

## Task 11: Frontend "Fetch from NepseAPI" card

**Files:**
- Modify: `frontend/src/app/(authenticated)/admin/pipeline/PipelinePageClient.tsx`

> Follow the existing card pattern (e.g. the Indicators card + `handleRunIndicators`). The
> SSE protocol is identical: GET with `credentials: 'include'`, parse `data: {...}` lines for
> `init`/`log`/`status`/`done`/`error`.

- [ ] **Step 1: Add state for the new card**

Near the other `useState` declarations in the component, add:
```tsx
    const [apiIngestStatus, setApiIngestStatus] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
    const [apiIngestLogs, setApiIngestLogs] = useState<{ type: string; message: string; timestamp: Date }[]>([]);
    const [showApiIngestLogs, setShowApiIngestLogs] = useState(false);
    const [apiDate, setApiDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
    const [apiDatasets, setApiDatasets] = useState<Record<string, boolean>>({
        prices: true, floorsheet: true, summary: true, companies: true, indices: true,
    });
    const apiIngestAbortController = useRef<AbortController | null>(null);
```

- [ ] **Step 2: Add the handler (mirrors handleRunIndicators)**

Add this function alongside the other handlers:
```tsx
    const handleRunApiIngest = async () => {
        if (apiIngestStatus === 'running') return;
        const selected = Object.entries(apiDatasets).filter(([, v]) => v).map(([k]) => k);
        if (selected.length === 0) { toast.error('Select at least one dataset'); return; }

        setApiIngestStatus('running');
        setApiIngestLogs([]);
        setShowApiIngestLogs(true);

        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        const qs = new URLSearchParams({ datasets: selected.join(','), date: apiDate });
        const url = `${apiUrl}/api/stocks/pipeline/ingest_market_data_stream/?${qs.toString()}`;
        apiIngestAbortController.current = new AbortController();

        try {
            const response = await fetch(url, { credentials: 'include', signal: apiIngestAbortController.current.signal });
            if (!response.ok) {
                toast.error(response.status === 401 ? 'Session expired. Please login again.' : `Connection failed: ${response.statusText}`);
                setApiIngestStatus('error');
                return;
            }
            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            if (!reader) { toast.error('Failed to initialize stream reader'); setApiIngestStatus('error'); return; }

            let buffer = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    const t = line.trim();
                    if (!t || !t.startsWith('data: ')) continue;
                    try {
                        const data = JSON.parse(t.substring(6));
                        if (data.type === 'init') continue;
                        if (data.type === 'done') { setApiIngestStatus('completed'); toast.success('Market data ingested!'); fetchHistory(); return; }
                        if (data.type === 'error') { setApiIngestStatus('error'); toast.error(data.message || 'Ingestion error'); return; }
                        if (data.type === 'log' || data.type === 'status') {
                            setApiIngestLogs(prev => [...prev, { type: data.type, message: data.message, timestamp: new Date() }]);
                        }
                    } catch (e) { console.error('Error parsing stream line:', t, e); }
                }
            }
        } catch (error: any) {
            if (error.name === 'AbortError') return;
            console.error('Stream fetch failed:', error);
            setApiIngestStatus('error');
            toast.error('Connection to log stream lost');
        }
    };
```

- [ ] **Step 3: Render the card**

In the JSX where the other pipeline cards are rendered, add a card (match the existing
card/markup classes used by the Indicators card in this file):
```tsx
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div>
            <h3 className="text-sm font-bold text-foreground">Fetch from NepseAPI</h3>
            <p className="text-xs text-muted-foreground">Pull EOD data directly from the live API.</p>
        </div>
        <div className="flex items-center gap-3">
            <label className="text-xs text-muted-foreground">Date</label>
            <input type="date" value={apiDate} onChange={e => setApiDate(e.target.value)}
                   className="rounded-md border border-border bg-background px-2 py-1 text-xs" />
        </div>
        <div className="flex flex-wrap gap-3">
            {Object.keys(apiDatasets).map(ds => (
                <label key={ds} className="flex items-center gap-1.5 text-xs capitalize">
                    <input type="checkbox" checked={apiDatasets[ds]}
                           onChange={e => setApiDatasets(prev => ({ ...prev, [ds]: e.target.checked }))} />
                    {ds}
                </label>
            ))}
        </div>
        <Button onClick={handleRunApiIngest} disabled={apiIngestStatus === 'running'} className="w-full">
            {apiIngestStatus === 'running' ? 'Fetching…' : 'Fetch from NepseAPI'}
        </Button>
        {showApiIngestLogs && (
            <div className="max-h-48 overflow-y-auto rounded-md bg-muted/40 p-3 font-mono text-[11px] space-y-0.5">
                {apiIngestLogs.map((l, i) => (<div key={i} className="text-muted-foreground">{l.message}</div>))}
            </div>
        )}
    </div>
```

- [ ] **Step 4: Typecheck the frontend**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new type errors from `PipelinePageClient.tsx`.

- [ ] **Step 5: Build the frontend Docker image (this project serves the built image)**

Run: `cd /Users/jugalraj/Documents/Projects/Stockastic && docker compose build frontend && docker compose up -d frontend`
Expected: image rebuilds; container restarts. (localhost:3000 serves the Docker-built bundle —
a source change is not visible until rebuild.)

- [ ] **Step 6: Manual smoke test**

Log into the app, open `/admin/pipeline`, find the "Fetch from NepseAPI" card, pick a date,
select datasets, click Fetch. Expected: logs stream in; on completion a new `API_INGEST` row
appears in the pipeline history. (Requires `NEPSE_API_BASE_URL` reachable from the backend
container.)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/\(authenticated\)/admin/pipeline/PipelinePageClient.tsx
git commit -m "feat(market-data): Fetch from NepseAPI card in pipeline UI"
```

---

## Task 12: Config wiring + docs

**Files:**
- Modify: `docker-compose.yml`
- Create: `backend/stocks/tests/test_nepse_live_integration.py`

- [ ] **Step 0: Add a skip-by-default live integration test**

`backend/stocks/tests/test_nepse_live_integration.py`:
```python
"""End-to-end test against the REAL configured NepseAPI. Skipped by default.

Run explicitly with:  RUN_NEPSE_LIVE=1 python -m pytest stocks/tests/test_nepse_live_integration.py -v
This is the canary that catches upstream API drift against live data.
"""
import os
from datetime import date

import pytest

from stocks.services.market_data.factory import get_provider
from stocks.services.market_data.contracts import PriceRecord

pytestmark = pytest.mark.skipif(
    os.getenv("RUN_NEPSE_LIVE") != "1",
    reason="live API test; set RUN_NEPSE_LIVE=1 to run",
)


def test_live_company_list_maps_cleanly():
    prov = get_provider()
    companies = prov.fetch_company_list()
    assert len(companies) > 100  # NEPSE has hundreds of listings
    assert all(c.symbol for c in companies)


def test_live_prices_map_cleanly():
    prov = get_provider()
    prices = prov.fetch_daily_prices(date.today())
    assert prices and isinstance(prices[0], PriceRecord)
    assert all(p.close and p.close > 0 for p in prices)
```

- [ ] **Step 1: Pass env vars to the backend service**

In `docker-compose.yml` under the `backend` service `environment:` block, add:
```yaml
      - NEPSE_API_BASE_URL=${NEPSE_API_BASE_URL:-https://nepseapi.surajrimal.dev}
      - NEPSE_API_PROVIDER=${NEPSE_API_PROVIDER:-nepseapi}
```

- [ ] **Step 2: Add an optional self-hosted service (commented)**

Append to `docker-compose.yml` `services:` (commented — public instance is the default):
```yaml
  # Optional self-hosted NepseAPI. Uncomment and set NEPSE_API_BASE_URL=http://nepseapi:8000
  # in the backend service to use it instead of the public instance.
  # nepseapi:
  #   image: surajrimal/nepseapi:latest
  #   container_name: stockastic-nepseapi
  #   ports:
  #     - "8001:8000"   # host 8001 -> container 8000 (avoids Django's 8000)
  #   restart: unless-stopped
```

- [ ] **Step 3: Validate compose file**

Run: `cd /Users/jugalraj/Documents/Projects/Stockastic && docker compose config >/dev/null && echo "compose ok"`
Expected: prints `compose ok` (YAML valid).

- [ ] **Step 4: Run the full new test suite**

Run: `cd backend && python -m pytest stocks/tests/test_market_data_contracts.py stocks/tests/test_nepse_provider.py stocks/tests/test_market_data_factory.py stocks/tests/test_market_data_ingestion.py stocks/tests/test_ingest_market_data_command.py -v`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml backend/stocks/tests/test_nepse_live_integration.py
git commit -m "chore(market-data): wire NEPSE_API_* env, optional self-host, live canary test"
```

---

## Definition of Done

- [ ] All five new test files pass.
- [ ] `python manage.py capture_nepse_fixtures` run once; FIELD_MAPs verified against real
      responses; real fixtures committed.
- [ ] `DailyIndexValue` migration applied.
- [ ] "Fetch from NepseAPI" card streams logs and writes an `API_INGEST` history row.
- [ ] Switching providers is provably a one-file change: a new class in `providers/` +
      one `register_provider` line + `NEPSE_API_PROVIDER` env — confirmed by the factory test.
- [ ] Manual CSV upload paths (`daily_prices`, `upload_floorsheet`) remain untouched and usable.
```
