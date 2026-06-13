"""Smoke-import test for the portfolio_views package.

Verifies that every class in the refactored package is importable and is a
non-None object.  No HTTP requests are made here.
"""

import pytest

from stocks.views.portfolio_views import (
    PortfolioAccountViewSet,
    PortfolioViewSet,
    PortfolioTransactionViewSet,
    PortfolioTargetViewSet,
    PortfolioPerformanceView,
    TradePlanViewSet,
    PortfolioActionDraftViewSet,
)


@pytest.mark.parametrize("cls", [
    PortfolioAccountViewSet,
    PortfolioViewSet,
    PortfolioTransactionViewSet,
    PortfolioTargetViewSet,
    PortfolioPerformanceView,
    TradePlanViewSet,
    PortfolioActionDraftViewSet,
])
def test_class_is_importable(cls):
    assert cls is not None


def test_portfolio_views_accessible_via_module_alias():
    """stocks.views.__init__ re-exports portfolio_views as portfolio."""
    from stocks.views import portfolio
    assert portfolio.PortfolioViewSet is PortfolioViewSet
    assert portfolio.PortfolioAccountViewSet is PortfolioAccountViewSet
    assert portfolio.PortfolioTransactionViewSet is PortfolioTransactionViewSet
    assert portfolio.PortfolioTargetViewSet is PortfolioTargetViewSet
    assert portfolio.PortfolioPerformanceView is PortfolioPerformanceView
    assert portfolio.TradePlanViewSet is TradePlanViewSet
    assert portfolio.PortfolioActionDraftViewSet is PortfolioActionDraftViewSet
