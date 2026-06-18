# nepsealpha tearsheet scraper — design

**Date:** 2026-06-17
**Status:** Approved design, pending spec review → implementation plan
**Source:** `https://nepsealpha.com/sastoshare/tearsheet/<SYMBOL>`

## Goal

On-demand scraper that, given a NEPSE symbol, fetches that company's **annual
financial report** data from the nepsealpha tearsheet and loads it — correct and
up to date — into the existing `FinancialReport` and `Dividend` stores. Replaces
the two hand-transcribed seed commands (`seed_api_annual.py`,
`seed_api_quarterly.py`).

## Verified source analysis (from live probing, 2026-06-17)

- **Cloudflare**: the tearsheet sits behind a Cloudflare managed challenge. A
  plain `requests`/`curl` is 403'd; `curl_cffi impersonate="chrome120"` is
  *intermittent* (some 200, some 403). A **real Chrome via Playwright passes
  reliably**, including the managed challenge that fires on the login POST.
- **Auth**: the tearsheet requires a logged-in nepsealpha (Sastoshare) account.
  Login form: `input[name=email]`, `input[name=password]`, `input[name=remember]`,
  `button[type=submit]`, hidden Laravel `_token` (auto-handled by submitting the
  real form). Credentials supplied via env (browser login, headless run).
- **Data delivery**: the page is server-rendered shell + **JSON endpoints** the
  page's JS calls. No separate scraping of rendered HTML tables needed. Every
  data call carries a per-session token `fsk` (e.g. `Gnw21LX9`) — **not** present
  in page source; it is sniffed from the page's own outgoing request URLs after
  landing on the tearsheet.
- **In-page direct fetch works**: `fetch(url, {headers:{'X-Requested-With':
  'XMLHttpRequest'}, credentials:'include'})` evaluated in the page returns clean
  JSON for each endpoint — no need to click UI tabs.

### Endpoints (verified)

| Dataset | Endpoint (relative) | Shape |
|---|---|---|
| Annual financials | `/sastoshare/tearsheet/filter/financials?symbol=<S>&fsk=<fsk>` | list of 273 rows `{particular, fiscal_year, fiscal_year_value, value, order, sector, symbol, id}` |
| Dividend | `/sastoshare/tearsheet/filter/dividend?symbol=<S>&fsk=<fsk>` | `{dividend: [{bonus_dividend, cash_dividend, book_closure_date, fiscal_year, company_name, status, ...}]}` |
| Company info | `/sastoshare/portfolio/corporate_action?symbols[]=<S>&fsk=<fsk>` | `{news, announcements, stockInfo:[{full_name, symbol, formatted_sector}]}` — only `stockInfo` used |

The financials endpoint returns **annual data only** (10 fiscal years
`072-073`…`081-082`); `type`/`period`/`quarter` query params are ignored, and
`filter/financials-quarterly` is empty. Quarterly therefore needs a separately
discovered endpoint — **deferred** (see Follow-ups).

### Data correctness finding

Symbol `API` is **"Api Power Company Limited"** (sector HYDROPOWER). The existing
seeds mislabel it as *"Arun Valley Hydropower Development Company Limited"* (which
is actually symbol `AHPC`). The scraper corrects `Company.name`/`sector`.

## Scope

**In scope (this phase):**
- Annual financials (balance sheet, P&L, cash flow) → `FinancialReport` (ANNUAL).
- Dividends → `Dividend` table **and** `FinancialReport` dividend fields (both
  stores must be synced — project invariant).
- Company name/sector correction.
- On-demand management command, single symbol, local-only, with politeness
  safeguards + raw-response caching.

**Out of scope:**
- Quarterly financials (deferred — endpoint not yet found).
- Corporate-action / news ingestion (the endpoint is news, not ratio'd actions;
  price-adjustment `CorporateAction` rows already come from the existing
  dividend backfill).
- Server/Docker/scheduled runs (explicitly local on-demand only).

## Architecture

**Chosen:** Provider + Playwright session, direct JSON fetch, mapped to existing
models — mirrors `stocks/services/market_data/providers/` and the "Pydantic at
the NEPSE data boundary" direction.

**Rejected:** (B) scraping rendered HTML tables — fragile, slower; the JSON is
right there. (C) curl_cffi at runtime without a browser — Cloudflare was
intermittent; the in-page fetch is reliable and keeps a single tool.

### Components — new package `backend/stocks/services/tearsheet/`

Each module single-purpose; all bodies ≤30 lines (helpers extracted).

1. **`session.py` — `TearsheetBrowser`** (context manager). Launches real Chrome
   (`channel="chrome"`, anti-automation flags, `navigator.webdriver` mask), logs
   in with creds from settings, clears Cloudflare, lands on `<symbol>` tearsheet,
   sniffs `fsk`. `fetch(fragment, params) -> dict | list` via in-page
   `fetch(...X-Requested-With...)`. Enforces a **randomized polite delay** and a
   **per-run request cap**. One login per run; browser closed on exit. This is
   the only network/browser-bound piece (isolated behind an interface for DIP).
2. **`schemas.py`** — Pydantic boundary models `RawFinancialRow`,
   `RawDividendRow`, `RawStockInfo`. Coerce `"-"`/`""`/`None` sentinels, strings
   → `Decimal`/`float`, validate required fields. Mirrors `nepse_schemas.py`
   philosophy: a present-but-unparseable required value raises, never degrades to 0.
3. **`mapping.py`** — `PARTICULAR_TO_PATH`: the 27 line items → `(section, key)`
   in the report JSON. An unmapped particular **raises** `TearsheetSchemaError`
   so new line items surface rather than vanish. (Full table below.)
4. **`transformer.py`** — pivots the long-format financial rows into per-fiscal-
   year report payloads: nested `balance_sheet` / `profit_loss` / `cash_flow`
   JSON + scalar columns (`paid_up_capital`, `reserves_and_surplus`, `revenue`,
   `operating_profit`, `net_profit`). Builds dividend payloads. Output JSON shape
   stays compatible with the seed structure + `fundamental_calculator` consumers.
5. **`loader.py`** — idempotent `update_or_create` into `FinancialReport`
   (ANNUAL) and `Dividend`; sets `FinancialReport` dividend fields; upserts/
   corrects `Company` name + sector. Reuses `FinancialReportManager` (fiscal-year
   normalization) and `sync_dividends_from_financials`.
6. **`cache.py`** — JSON file cache of raw responses under
   `backend/.cache/tearsheet/` (gitignored), keyed by `symbol` + date. `--no-cache`
   bypasses. Re-runs don't re-hit the server.
7. **`management/commands/scrape_tearsheet.py`** — orchestrator:
   `python manage.py scrape_tearsheet <SYMBOL> [--annual] [--no-cache]`.
   Pipeline: session → (cache|fetch) → validate → transform → load → report counts.

### `PARTICULAR_TO_PATH` mapping (all 27)

```
# Balance sheet
Property,PlantAndEquipment                          -> balance_sheet.NON_CURRENT_ASSETS.ppe
Wip(ProjectWorkInProgress,UnderDevelopment)         -> balance_sheet.NON_CURRENT_ASSETS.cwip
InvestmentAndFinancialAssets                        -> balance_sheet.NON_CURRENT_ASSETS.financial_assets
TotalNon-CurrentAssets                              -> balance_sheet.TOTALS.non_current_assets
TotalCurrentAssets                                  -> balance_sheet.TOTALS.current_assets
TotalAssets                                         -> balance_sheet.TOTALS.total_assets
ShareCapital                                        -> balance_sheet.LIABILITIES.share_capital  (+scalar paid_up_capital)
ReserveAndSurplus                                   -> balance_sheet.LIABILITIES.reserves        (+scalar reserves_and_surplus)
TotalEquity                                         -> balance_sheet.TOTALS.total_equity
LongTermLoans&Borrowings                            -> balance_sheet.LIABILITIES.long_term_loans
TotalNon-CurrentLiabilities                         -> balance_sheet.TOTALS.non_current_liabilities
ShortTermLoans&Borrowings                           -> balance_sheet.LIABILITIES.short_term_loans
TotalCurrentLiabilities                             -> balance_sheet.TOTALS.current_liabilities
TotalLiabilities                                    -> balance_sheet.TOTALS.total_liabilities
TotalEquityAndLiabilities                           -> balance_sheet.TOTALS.total_equity_and_liabilities
# Profit & loss
Revenue(PowerSales)                                 -> profit_loss.PL.revenue                    (+scalar revenue)
Cogs(Generation,Distribution,Royalty&ProjectExpenses) -> profit_loss.PL.cost_of_sales
GrossProfit                                         -> profit_loss.PL.gross_profit
Depreciation                                        -> profit_loss.PL.depreciation
AdministrativeAndOtherOperatingExpenses             -> profit_loss.PL.admin_expenses
ProfitFromOperation(OperatingProfit)                -> profit_loss.PL.operating_profit           (+scalar operating_profit)
FinanceCost                                         -> profit_loss.PL.finance_costs
ProfitBeforeTax                                     -> profit_loss.PL.profit_before_tax
ProfitForTheYear(NetProfit)                         -> profit_loss.PL.net_profit                 (+scalar net_profit)
# Cash flow
CashFlowsFromOperatingActivities                    -> cash_flow.CF.operating_cash_flow
CashFlowsFromInvestingActivities                    -> cash_flow.CF.investing_cash_flow
CashFlowsFromFinancingActivities                    -> cash_flow.CF.financing_cash_flow
```

Note: nepsealpha's hydro template provides **totals** for current assets but not
the per-line breakdown (cash/receivables/inventories). The scraped JSON reflects
what the source provides; absent keys are omitted. `fundamental_calculator`
compatibility is verified during implementation.

## Data flow

```
scrape_tearsheet <SYMBOL>
  -> TearsheetBrowser.login() & land on tearsheet (capture fsk + cookies)
  -> for each dataset (financials, dividend, stockInfo):
       cache.get(symbol,dataset) or session.fetch(fragment, {symbol, fsk})
  -> schemas.validate(raw)
  -> transformer.build_*  (long-format -> per-year payloads)
  -> loader.upsert  (FinancialReport ANNUAL + Dividend + Company)
  -> print counts (years loaded, dividends loaded, company corrected?)
```

## Configuration & dependencies

- `settings.py`: `NEPSEALPHA_EMAIL`, `NEPSEALPHA_PASSWORD`,
  `NEPSEALPHA_BASE_URL` (default `https://nepsealpha.com`),
  `NEPSEALPHA_REQUEST_DELAY` (default e.g. 1.5s), `NEPSEALPHA_MAX_REQUESTS`.
- `backend/.env`: `NEPSEALPHA_EMAIL` / `NEPSEALPHA_PASSWORD` (now untracked).
- `requirements.txt`: add `playwright`; document `playwright install chromium`
  (local) — though `channel="chrome"` uses system Chrome.
- `backend/.gitignore`: add `.cache/`.

## Error handling

Dedicated exceptions (parallel to `contracts.ProviderUnavailableError`):
- `TearsheetAuthError` — login failed / still on login page after submit.
- `TearsheetUnavailableError` — Cloudflare not cleared, navigation timeout.
- `TearsheetSchemaError` — Pydantic validation failure or unmapped particular.

Fail loudly; never write silent zeros. Surfacing schema drift is preferred over
silently degraded data (matches `_req_num` philosophy).

## Testing (TDD)

- Commit the captured JSON as fixtures: `stocks/tests/fixtures/tearsheet/`
  (`financials.json`, `dividend.json`, `stockinfo.json` for `API`).
- **No-network unit tests** for `schemas`, `transformer`, `loader`:
  - transformer pivots long-format → correct nested JSON + scalars per year;
  - unmapped particular raises;
  - sentinel/`"-"` handling;
  - loader idempotency (re-run keeps counts stable);
  - loader writes correct company name ("Api Power Company Limited") + syncs both
    dividend stores.
- `TearsheetBrowser` is integration-only (live, local) — excluded from CI; the
  pipeline is testable without a browser because the session is injected (DIP).

## Migration / cleanup

After the scraper reaches parity for `API`:
- Delete `seed_api_annual.py`, `seed_api_quarterly.py` and their tests
  (`test_api_seeder.py`, `test_api_quarterly_seeder.py`).
- These are untracked WIP; their data knowledge is folded into the scraper +
  fixtures (which also fix the company-name bug).

## Security / ToS safeguards (agreed)

- On-demand, **single symbol per run**; no scheduled/bulk jobs.
- Runs from the user's machine and IP only.
- Real Chrome → traffic is indistinguishable from normal browsing (but tied to
  the user's account — not anonymous).
- Randomized polite delay + per-run request cap; cache to avoid re-hitting.

## Follow-ups (not this phase)

- **Quarterly financials**: discover the endpoint via UI quarter-selector capture
  (same proven technique), then add a quarterly transformer/loader path producing
  `FinancialReport` QUARTERLY rows (template `HYDRO_QUARTERLY`).
- Optional: generalize beyond hydro template (sector-specific particular maps).
