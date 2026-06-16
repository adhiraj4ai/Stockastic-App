"""
market_views package — re-exports all public names so that
    from stocks.views import market
    market.search_stocks(...)   # still works
"""

from .search_stocks import search_stocks
from .health_check import health_check
from .stock_history import stock_history
from .stock_summary import stock_summary
from .analyze_activity import analyze_activity
from .batch_indicators import batch_indicators
from .sector_history import sector_history
from .stock_floorsheet import stock_floorsheet
from .stock_dividends import stock_dividends
from .stock_financials import stock_financials
from .floorsheet_list import floorsheet_list
from .stock_detail import stock_detail
from .company_chat_summary import company_chat_summary
from .company_analysis_timeline import company_analysis_timeline
from .run_company_analysis import run_company_analysis
from .company_viewset import CompanyViewSet
from .financial_report_viewset import FinancialReportViewSet
from .stock_fundamental_viewset import StockFundamentalViewSet

# Private helpers re-exported for backward-compatibility (used in tests)
from ._fundamental_enrichment import _enrich_fundamental_data

__all__ = [
    'search_stocks',
    'health_check',
    'stock_history',
    'stock_summary',
    'analyze_activity',
    'batch_indicators',
    'sector_history',
    'stock_floorsheet',
    'stock_dividends',
    'stock_financials',
    'floorsheet_list',
    'stock_detail',
    'company_chat_summary',
    'company_analysis_timeline',
    'run_company_analysis',
    'CompanyViewSet',
    'FinancialReportViewSet',
    'StockFundamentalViewSet',
    '_enrich_fundamental_data',
]
