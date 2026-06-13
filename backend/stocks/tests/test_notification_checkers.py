import pytest


def test_alert_dataclass_has_required_fields():
    from stocks.services.notifications.base import Alert
    alert = Alert(
        notification_type='STOP_LOSS_HIT',
        title='ADBL Stop-Loss Hit',
        message='ADBL hit your stop-loss at Rs. 250.00.',
        ticker='ADBL',
        redirect_url='/portfolio?tab=holdings',
        metadata={'price': 250.0},
    )
    assert alert.notification_type == 'STOP_LOSS_HIT'
    assert alert.ticker == 'ADBL'
    assert alert.metadata == {'price': 250.0}


def test_ialertchecker_protocol_is_runtime_checkable():
    from stocks.services.notifications.base import IAlertChecker

    class FakeChecker:
        def check(self, user):
            return []

    assert isinstance(FakeChecker(), IAlertChecker)


def test_ialertchecker_protocol_rejects_missing_check():
    from stocks.services.notifications.base import IAlertChecker

    class BadChecker:
        pass

    assert not isinstance(BadChecker(), IAlertChecker)


def test_portfolio_checker_implements_ialertchecker():
    from stocks.services.notifications.base import IAlertChecker
    from stocks.services.notifications.checkers.portfolio import PortfolioChecker
    assert isinstance(PortfolioChecker(), IAlertChecker)


def test_portfolio_checker_returns_list():
    from stocks.services.notifications.checkers.portfolio import PortfolioChecker
    from unittest.mock import patch, MagicMock

    user = MagicMock()
    checker = PortfolioChecker()

    with patch('stocks.services.notifications.checkers.portfolio.PortfolioItem') as MockItem:
        MockItem.objects.filter.return_value = []
        result = checker.check(user)

    assert isinstance(result, list)


def test_portfolio_checker_stop_loss_produces_alert():
    from stocks.services.notifications.checkers.portfolio import PortfolioChecker
    from unittest.mock import patch, MagicMock

    item = MagicMock()
    item.ticker = 'ADBL'
    item.stop_loss_price = 240.0
    item.target_price = None
    item.target_price_2 = None
    item.target_price_3 = None
    item.wacc = 260.0
    item.buy_price = 260.0
    item.id = 1

    user = MagicMock()
    checker = PortfolioChecker()

    with patch('stocks.services.notifications.checkers.portfolio.PortfolioItem') as MockItem, \
         patch('stocks.services.notifications.checkers.portfolio.get_latest_price', return_value=235.0):
        MockItem.objects.filter.return_value = [item]
        alerts = checker.check(user)

    stop_loss_alerts = [a for a in alerts if a.notification_type == 'STOP_LOSS_HIT']
    assert len(stop_loss_alerts) == 1
    assert stop_loss_alerts[0].ticker == 'ADBL'
