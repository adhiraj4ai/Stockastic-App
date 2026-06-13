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
