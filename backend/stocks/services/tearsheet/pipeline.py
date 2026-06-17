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


def scrape_annual(symbol: str, fetcher, use_cache: bool = True) -> dict:
    symbol = symbol.upper()
    fin = _get(fetcher, symbol, "financials", {"symbol": symbol}, use_cache)
    div = _get(fetcher, symbol, "dividend", {"symbol": symbol}, use_cache)
    info = _get(fetcher, symbol, "corporate_action",
                {"symbols[]": symbol}, use_cache)
    stock_info = RawStockInfo.model_validate(info["stockInfo"][0])
    reports = build_annual_reports([RawFinancialRow.model_validate(r) for r in fin])
    dividends = build_dividends(
        [RawDividendRow.model_validate(r) for r in div["dividend"]])
    load_company(stock_info)
    n_reports = load_annual_reports(symbol, reports)
    n_div = load_dividends(symbol, dividends)
    return {"reports": n_reports, "dividends": n_div, "company": stock_info.full_name}
