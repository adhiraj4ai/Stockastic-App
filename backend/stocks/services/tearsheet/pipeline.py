from __future__ import annotations

from . import cache as cache_module
from .loader import load_annual_reports, load_company, load_dividends
from .schemas import RawDividendRow, RawFinancialRow, RawStockInfo
from .transformer import build_annual_reports, build_dividends

_ENDPOINTS = {
    "financials": "/sastoshare/tearsheet/filter/financials",
    "dividend": "/sastoshare/tearsheet/filter/dividend",
    "corporate_action": "/sastoshare/portfolio/corporate_action",
}


def _get(fetcher, symbol, dataset, params, use_cache):
    if use_cache:
        cached = cache_module.read(symbol, dataset)
        if cached is not None:
            return cached
    payload = fetcher.fetch(_ENDPOINTS[dataset], params)
    if use_cache:
        cache_module.write(symbol, dataset, payload)
    return payload


def fetch_datasets(symbol: str, fetcher, use_cache: bool = True) -> dict:
    """Fetch raw payloads while the browser is open. Must NOT touch the DB:
    callers run this inside the Playwright (async) context, where Django's
    synchronous ORM is unavailable."""
    symbol = symbol.upper()
    return {
        "financials": _get(fetcher, symbol, "financials", {"symbol": symbol}, use_cache),
        "dividend": _get(fetcher, symbol, "dividend", {"symbol": symbol}, use_cache),
        "corporate_action": _get(
            fetcher, symbol, "corporate_action", {"symbols[]": symbol}, use_cache),
    }


def load_datasets(symbol: str, raw: dict) -> dict:
    """Validate, transform, and persist raw payloads. Runs after the browser is
    closed, in a normal synchronous DB context."""
    symbol = symbol.upper()
    info = RawStockInfo.model_validate(raw["corporate_action"]["stockInfo"][0])
    reports = build_annual_reports(
        [RawFinancialRow.model_validate(r) for r in raw["financials"]])
    dividends = build_dividends(
        [RawDividendRow.model_validate(r) for r in raw["dividend"]["dividend"]])
    load_company(info)
    n_reports = load_annual_reports(symbol, reports)
    n_div = load_dividends(symbol, dividends)
    return {"reports": n_reports, "dividends": n_div, "company": info.full_name}
