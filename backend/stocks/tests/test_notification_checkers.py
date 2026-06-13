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

    with patch('stocks.services.notifications.checkers.portfolio.PortfolioItem') as MockItem, \
         patch.object(checker, '_fetch_price', return_value=None):
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
         patch.object(checker, '_fetch_price', return_value=235.0):
        MockItem.objects.filter.return_value = [item]
        alerts = checker.check(user)

    stop_loss_alerts = [a for a in alerts if a.notification_type == 'STOP_LOSS_HIT']
    assert len(stop_loss_alerts) == 1
    assert stop_loss_alerts[0].ticker == 'ADBL'
    assert stop_loss_alerts[0].severity is not None  # severity must now be set


def test_watchlist_checker_implements_ialertchecker():
    from stocks.services.notifications.base import IAlertChecker
    from stocks.services.notifications.checkers.watchlist import WatchlistChecker
    assert isinstance(WatchlistChecker(), IAlertChecker)


def test_watchlist_checker_target_hit_produces_alert():
    from stocks.services.notifications.checkers.watchlist import WatchlistChecker
    from unittest.mock import patch, MagicMock

    item = MagicMock()
    item.ticker = 'NABIL'
    item.target_price = 1000.0
    item.stop_loss_price = None
    item.id = 5

    user = MagicMock()
    checker = WatchlistChecker()

    with patch('stocks.services.notifications.checkers.watchlist.WatchlistItem') as MockWL, \
         patch.object(checker, '_fetch_price', return_value=1050.0):
        MockWL.objects.filter.return_value = [item]
        alerts = checker.check(user)

    target_alerts = [a for a in alerts if a.notification_type == 'TARGET_REACHED']
    assert len(target_alerts) == 1
    assert target_alerts[0].ticker == 'NABIL'
    assert target_alerts[0].severity is not None


import pytest


@pytest.mark.parametrize("checker_path,cls_name", [
    ("stocks.services.notifications.checkers.zone_entry", "ZoneEntryChecker"),
    ("stocks.services.notifications.checkers.active_signal", "ActiveSignalChecker"),
    ("stocks.services.notifications.checkers.signals", "SignalsChecker"),
    ("stocks.services.notifications.checkers.whale_watch", "WhaleWatchChecker"),
    ("stocks.services.notifications.checkers.accumulation_trend", "AccumulationTrendChecker"),
    ("stocks.services.notifications.checkers.technical", "TechnicalChecker"),
    ("stocks.services.notifications.checkers.broker_discovery", "BrokerDiscoveryChecker"),
    ("stocks.services.notifications.checkers.portfolio_management", "PortfolioManagementChecker"),
])
def test_checker_implements_protocol(checker_path, cls_name):
    import importlib
    from stocks.services.notifications.base import IAlertChecker
    mod = importlib.import_module(checker_path)
    cls = getattr(mod, cls_name)
    assert isinstance(cls(), IAlertChecker)


def test_orchestrator_calls_all_registered_checkers():
    from stocks.services.notifications.orchestrator import NotificationOrchestrator
    from stocks.services.notifications.base import Alert
    from unittest.mock import MagicMock, patch

    calls = []

    class CountingChecker:
        def check(self, user):
            calls.append(user)
            return [Alert(
                notification_type='TEST',
                title='T', message='M',
                redirect_url='/', ticker='X',
            )]

    user = MagicMock()
    orchestrator = NotificationOrchestrator(checkers=[CountingChecker(), CountingChecker()])

    with patch.object(orchestrator, '_persist', return_value=True):
        count = orchestrator.run(user)

    assert len(calls) == 2
    assert count == 2


def test_orchestrator_tolerates_checker_exception():
    from stocks.services.notifications.orchestrator import NotificationOrchestrator
    from unittest.mock import MagicMock

    class BrokenChecker:
        def check(self, user):
            raise RuntimeError("db gone")

    user = MagicMock()
    orchestrator = NotificationOrchestrator(checkers=[BrokenChecker()])
    count = orchestrator.run(user)  # must not raise
    assert count == 0
