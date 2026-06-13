"""Smoke-test: verify all public names from stocks.views.market are importable."""
import pytest


def test_search_stocks_importable():
    from stocks.views.market import search_stocks
    assert search_stocks is not None


def test_health_check_importable():
    from stocks.views.market import health_check
    assert health_check is not None


def test_stock_history_importable():
    from stocks.views.market import stock_history
    assert stock_history is not None


def test_stock_summary_importable():
    from stocks.views.market import stock_summary
    assert stock_summary is not None


def test_analyze_activity_importable():
    from stocks.views.market import analyze_activity
    assert analyze_activity is not None


def test_batch_indicators_importable():
    from stocks.views.market import batch_indicators
    assert batch_indicators is not None


def test_sector_history_importable():
    from stocks.views.market import sector_history
    assert sector_history is not None


def test_stock_floorsheet_importable():
    from stocks.views.market import stock_floorsheet
    assert stock_floorsheet is not None


def test_stock_dividends_importable():
    from stocks.views.market import stock_dividends
    assert stock_dividends is not None


def test_stock_financials_importable():
    from stocks.views.market import stock_financials
    assert stock_financials is not None


def test_floorsheet_list_importable():
    from stocks.views.market import floorsheet_list
    assert floorsheet_list is not None


def test_stock_detail_importable():
    from stocks.views.market import stock_detail
    assert stock_detail is not None


def test_company_viewset_importable():
    from stocks.views.market import CompanyViewSet
    assert CompanyViewSet is not None


def test_financial_report_viewset_importable():
    from stocks.views.market import FinancialReportViewSet
    assert FinancialReportViewSet is not None


def test_stock_fundamental_viewset_importable():
    from stocks.views.market import StockFundamentalViewSet
    assert StockFundamentalViewSet is not None


def test_enrich_fundamental_data_importable():
    """Backward-compat: test code imports this private helper directly."""
    from stocks.views.market import _enrich_fundamental_data
    assert _enrich_fundamental_data is not None
