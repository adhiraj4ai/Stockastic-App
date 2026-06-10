# NepseAPI Live Data Integration — Design

**Date:** 2026-06-10
**Status:** Approved (design), pending implementation plan
**Author:** brainstormed with Claude

## 1. Goal & Scope

Replace the manual daily CSV uploads with a **manually-triggered** pull from the
[NepseAPI-Unofficial](https://github.com/surajrimal07/NepseAPI-Unofficial) service that
populates the existing market-data tables, plus a new index table.

The integration must satisfy a hard requirement: **a future change to the external API
(or a switch to a different data provider) must not impact the rest of the system.** This
is achieved with an anti-corruption layer — the rest of Stockastic never sees the API's
response shape.

### Datasets in scope
- Daily prices → `DailyStockPrice`
- Floorsheet → `DailyFloorsheet`
- Market summary (turnover/volume/transactions, top gainers/losers/turnovers/volumes) → `DailyMarketSummary`
- Company list → `Company`
- Indices: NEPSE index + sub-indices (Banking, Development Bank, Finance, Hydropower,
  Microfinance, Non-Life/Life Insurance, Investment, Manufacturing, Trading, Hotels,
  Others, Sensitive, Float, etc.) → **new** `DailyIndexValue`

### Decisions (from brainstorming)
- **Primary goal:** automate EOD ingestion (replace manual CSV uploads).
- **API source:** configurable via env var; default to the public instance, switchable to self-hosted.
- **Trigger:** manual only — a button in the existing pipeline UI (mirrors today's CSV workflow).
- **Architecture:** anti-corruption layer (provider interface + canonical DTOs + adapter + factory + ingestion service).

### Out of scope (explicitly deferred to future phases)
- Scheduled / Celery-Beat automation (the provider interface makes this a trivial later add).
- Intraday / real-time / WebSocket live layer; live frontend display.
- The NepseAPI MCP server (port 8080).
- Removing the existing CSV upload — it is **retained as a fallback** so the system never
  hard-depends on the external API.

## 2. Architecture & Module Layout

New module under `backend/stocks/services/market_data/`:

```
backend/stocks/services/market_data/
  __init__.py
  contracts.py          # canonical DTOs + MarketDataProvider interface + exceptions
  factory.py            # get_provider() — reads env, returns provider via a registry
  ingestion.py          # IngestionService: DTOs -> DB upserts (provider-agnostic)
  providers/
    __init__.py
    http_client.py      # thin httpx wrapper: base URL, timeout, retry, 429 backoff
    nepse_api.py        # NepseApiProvider — the ONLY NepseAPI-aware code
```

### Data flow

```
NepseAPI JSON
   │  (only the adapter knows this shape)
   ▼
[ NepseApiProvider ]  ← swap this one file to change API/provider
   │  emits canonical DTOs (PriceRecord, FloorsheetRecord, IndexRecord, …)
   ▼
[ IngestionService ]  ← provider-agnostic, never changes when the API changes
   │  validates + idempotent upserts
   ▼
DailyStockPrice · DailyFloorsheet · DailyMarketSummary · Company · DailyIndexValue
   │
   ▼
signals · backtests · technical indicators · frontend   (fully insulated)
```

## 3. Contracts (`contracts.py`) — the stable internal boundary

Canonical DTOs as **frozen dataclasses**, one per dataset. They mirror the DB models, not
the API. Downstream code and the ingestion service only ever see these.

- `PriceRecord` — symbol, date, open, high, low, close, volume, prev_close, turnover, conf,
  vwap, trans, diff, range, diff_percent, range_percent, vwap_percent, days_120, days_180,
  weeks_52_high, weeks_52_low. (Mirrors `DailyStockPrice`.)
- `FloorsheetRecord` — transaction_id, symbol, buyer_id, seller_id, quantity, rate, amount,
  date, datetime, buyer_name, seller_name, security_name, transaction_book_id, stock_id.
  (Mirrors `DailyFloorsheet`.)
- `MarketSummaryRecord` — date, total_turnover, total_volume, total_transactions,
  top_gainers, top_losers, top_turnovers, top_volumes, sector_turnover.
  (Mirrors `DailyMarketSummary`.)
- `CompanyRecord` — symbol, name, sector, status. (Mirrors `Company`.)
- `IndexRecord` — index_name, date, value, open, high, low, change, change_percent,
  turnover (optional). (Mirrors new `DailyIndexValue`.)

`MarketDataProvider` interface (typing.Protocol or ABC):

```python
class MarketDataProvider(Protocol):
    name: str
    def fetch_daily_prices(self, date) -> list[PriceRecord]: ...
    def fetch_floorsheet(self, date) -> Iterator[FloorsheetRecord]: ...
    def fetch_market_summary(self, date) -> MarketSummaryRecord: ...
    def fetch_company_list(self) -> list[CompanyRecord]: ...
    def fetch_indices(self, date) -> list[IndexRecord]: ...
```

Exceptions (the core of the "API may change" safety net):

- `ProviderError` — base class.
- `ProviderUnavailableError` — network error, timeout, 5xx, or rate-limited (429).
- `ProviderSchemaError` — a response arrived but expected fields are missing/renamed.
  Raised by the adapter **before any DB write**, so API drift fails loudly and leaves
  existing data untouched instead of silently corrupting it.

## 4. NepseApiProvider (`providers/nepse_api.py`) — the swappable adapter

The **only** module aware of NepseAPI specifics:

- Endpoint paths: `/PriceVolume`, `/Floorsheet`, `/Summary`, `/TopGainers`, `/TopLosers`,
  `/CompanyList`, `/NepseIndex`, and the sub-index route(s). Exact paths/response shapes
  are confirmed during implementation against the live `/docs` (OpenAPI) and real responses.
- Field-name mapping from raw JSON → canonical DTOs, centralized here (replacing the
  scattered defensive key-guessing currently inline in `pipeline.py`).
- Pagination handling for floorsheet (potentially 100k+ rows/day).
- Per-response schema validation: assert the expected keys exist; raise `ProviderSchemaError`
  otherwise.

Switching providers later (ShareSansar, official NEPSE, another scraper) = add a new class
implementing `MarketDataProvider`, register it in the factory, set `NEPSE_API_PROVIDER`.
No other code changes.

### `providers/http_client.py`
Thin wrapper over `httpx` (already a NepseAPI dependency; confirm availability in backend,
else use `requests`):
- Base URL from `settings.NEPSE_API_BASE_URL`.
- Connect/read timeouts; bounded retries with exponential backoff for transient failures.
- Honors `X-RateLimit-*` / `429` by backing off.
- Translates transport failures into `ProviderUnavailableError`.

## 5. IngestionService (`ingestion.py`) — provider-agnostic

One method per dataset; all **idempotent** so re-runs and backfills are safe. Returns an
`IngestResult` (inserted / updated / rejected counts + rejection reasons).

- `ingest_prices(records, date)` — reuse existing `validate_price_rows`
  (`services/ingest_validation.py`); `bulk_create(ignore_conflicts=True)` into
  `DailyStockPrice`.
- `ingest_floorsheet(records)` — batched `bulk_create(ignore_conflicts=True)` over the
  iterator (chunked, e.g. 5k/batch) into `DailyFloorsheet`.
- `ingest_market_summary(record)` — `update_or_create` `DailyMarketSummary` keyed by date.
- `ingest_companies(records)` — `update_or_create` `Company` keyed by symbol.
- `ingest_indices(records)` — `update_or_create` `DailyIndexValue` keyed by (index_name, date).

The service depends only on DTOs + Django models. It contains **no** knowledge of NepseAPI.

## 6. New Model: `DailyIndexValue`

Added to `backend/stocks/models/market.py`, `managed=True` (real Django migration — unlike
the raw `managed=False` price/floorsheet tables).

```python
class DailyIndexValue(models.Model):
    index_name = models.CharField(max_length=64, db_index=True)   # "NEPSE", "Banking", ...
    date = models.DateField(db_index=True)
    value = models.DecimalField(max_digits=14, decimal_places=2)  # close / current
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
```

## 7. Trigger: Management Command + Pipeline Button

### Management command: `ingest_market_data`
`backend/stocks/management/commands/ingest_market_data.py`

- Args:
  - `--datasets` (comma list: `prices,floorsheet,summary,companies,indices`; default all)
  - `--date YYYY-MM-DD` (default: today / latest trading day)
  - `--provider <name>` (optional override of `NEPSE_API_PROVIDER`)
- Flow: `get_provider()` → for each requested dataset, `fetch_*` then `ingest_*`, each in
  its **own try/except** so one dataset failing (e.g. floorsheet schema drift) does not
  block the others.
- Output: progress lines and a final per-dataset summary (succeeded/failed + reason:
  `ProviderSchemaError` vs `ProviderUnavailableError`). Prints a `Total records saved: N`
  line for the stream parser.
- Exit code: non-zero only if **all** requested datasets failed; otherwise zero with a
  summary noting partial failures.

### Pipeline SSE endpoint
`backend/stocks/views/pipeline.py`: new action `ingest_market_data_stream` (GET) that
creates `DataUploadLog(upload_type='API_INGEST')` and calls the existing
`_run_manage_command_stream(['ingest_market_data', ...], log)`. Accepts `?datasets=` and
`?date=` query params. Extend the stdout parser to recognize `Total records saved: N` if
not already covered.

### Model change
Add `('API_INGEST', 'API Ingestion')` to `DataUploadLog.UPLOAD_TYPES`
(`backend/stocks/models/system.py`).

### Frontend
`frontend/src/app/(authenticated)/admin/pipeline/PipelinePageClient.tsx`: a new
**"Fetch from NepseAPI"** card mirroring the existing stream-button cards
(`trigger_indicators_stream` etc.): dataset checkboxes + a date picker (default today),
a Fetch button that opens the SSE stream, renders streamed logs, and calls `fetchHistory()`
on completion. Includes an Abort affordance like the other cards.

### Configuration
- `backend/stockastic/settings.py`:
  - `NEPSE_API_BASE_URL = os.getenv('NEPSE_API_BASE_URL', 'https://nepseapi.surajrimal.dev')`
  - `NEPSE_API_PROVIDER = os.getenv('NEPSE_API_PROVIDER', 'nepseapi')`
- `docker-compose.yml`: pass both env vars to `backend`; add an **optional, commented**
  `nepseapi` service (`surajrimal/nepseapi:latest`) mapped to host port **8001** (avoids the
  8000 collision with the Django backend) for self-hosting.

## 8. Resilience Guarantees (headline requirement)

1. A single adapter is the only API-aware code; providers are swapped via env + factory.
2. Canonical DTOs decouple the wire format from the DB schema.
3. `ProviderSchemaError` is raised before any write — API drift fails loudly and safely.
4. Per-dataset isolation — one dataset's failure does not block the others.
5. Idempotent upserts — safe re-runs and backfills.
6. The manual CSV upload path is retained as a fallback — no hard dependency on the API.
7. Contract tests with recorded JSON fixtures — if NepseAPI's shape changes, a CI test
   breaks first, not production.

## 9. Testing

- **Adapter mapping** (`nepse_api`): recorded-JSON fixtures for each dataset — happy path
  asserts correct DTOs; a "drifted"/missing-field fixture asserts `ProviderSchemaError`.
- **Factory:** returns the correct provider per `NEPSE_API_PROVIDER`; unknown name raises.
- **IngestionService:** DTOs in → expected DB rows out; reuses/extends `validate_price_rows`
  coverage; verifies idempotency (run twice → no duplicates, counts as updates).
- **Command:** smoke test with a **fake provider** injected via the registry (no network);
  asserts per-dataset isolation (one dataset raising still ingests the rest).
- **Live integration:** one end-to-end test hitting the real API, marked skip-by-default
  (run manually / opt-in in CI).

## 10. Affected / New Files (summary)

New:
- `backend/stocks/services/market_data/{__init__,contracts,factory,ingestion}.py`
- `backend/stocks/services/market_data/providers/{__init__,http_client,nepse_api}.py`
- `backend/stocks/management/commands/ingest_market_data.py`
- Migration for `DailyIndexValue`
- Tests under `backend/stocks/tests/` + JSON fixtures

Modified:
- `backend/stocks/models/market.py` (add `DailyIndexValue`)
- `backend/stocks/models/__init__.py` (export `DailyIndexValue`)
- `backend/stocks/models/system.py` (`API_INGEST` upload type)
- `backend/stocks/views/pipeline.py` (`ingest_market_data_stream`; parser tweak)
- `backend/stockastic/settings.py` (env config)
- `docker-compose.yml` (env vars; optional nepseapi service)
- `frontend/src/app/(authenticated)/admin/pipeline/PipelinePageClient.tsx` (Fetch card)
```
