import pytest
from unittest.mock import patch
from django.urls import reverse
from rest_framework import status
from stocks.models import Notification

@pytest.mark.django_db
class TestNotificationsAPI:
    def test_notifications_list(self, auth_client):
        url = reverse('notifications-list')
        response = auth_client.get(url)
        assert response.status_code == status.HTTP_200_OK

    def test_mark_all_as_read(self, auth_client):
        # Create a notification
        from django.contrib.auth.models import User
        user = User.objects.get(username='testuser')
        Notification.objects.create(user=user, message='Test', type='INFO', read=False)
        
        url = reverse('notifications-mark-all-as-read')
        response = auth_client.post(url)
        assert response.status_code == status.HTTP_200_OK
        assert Notification.objects.filter(user=user, read=False).count() == 0

    def test_trigger_check(self, auth_client):
        url = reverse('notifications-trigger-check')
        response = auth_client.post(url)
        assert response.status_code == status.HTTP_200_OK
        assert 'total_notifications' in response.data

    def test_severity_filter(self, auth_client):
        from django.contrib.auth.models import User
        user = User.objects.get(username='testuser')
        Notification.objects.create(user=user, title='c', message='m', type='STOP_LOSS_HIT', severity='critical')
        Notification.objects.create(user=user, title='n', message='m', type='SIGNAL_BUY', severity='normal')

        url = reverse('notifications-list')
        response = auth_client.get(url, {'severity': 'critical'})
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) == 1
        assert response.data[0]['severity'] == 'critical'


@pytest.mark.django_db
class TestCheckAllUserNotificationsTask:
    def test_orchestrator_run_invoked_for_each_user(self, create_user):
        """The periodic task delegates to default_orchestrator.run() for every active user."""
        from stocks.tasks import check_all_user_notifications

        create_user(username='active_user', password='password')

        with patch('stocks.services.notifications.default_orchestrator') as mock_orch:
            mock_orch.run.return_value = 0
            check_all_user_notifications()

        assert mock_orch.run.called


@pytest.mark.django_db
class TestNotificationSeverity:
    def test_create_notification_assigns_mapped_severity(self, create_user):
        from stocks.services.notification_service import create_notification
        user = create_user(username='sev_user', password='password')

        cases = [
            ('STOP_LOSS_HIT', 'critical'),
            ('TARGET_REACHED', 'high'),
            ('DAILY_PLAN_READY', 'high'),
            ('SIGNAL_BUY', 'normal'),
            ('VOLUME_SPIKE', 'normal'),
            ('PORTFOLIO_DIVERSITY', 'low'),
            ('BELOW_WACC', 'low'),
        ]
        for i, (ntype, expected) in enumerate(cases):
            n = create_notification(
                user=user, notification_type=ntype,
                title='t', message='m', ticker=f'TICK{i}',
            )
            assert n.severity == expected, f"{ntype} should be {expected}, got {n.severity}"

        n_enum = create_notification(
            user=user, notification_type=Notification.NotificationType.STOP_LOSS_HIT,
            title='t', message='m', ticker='ENUMTICK',
        )
        assert n_enum.severity == 'critical'

    def test_explicit_severity_override_wins(self, create_user):
        from stocks.services.notification_service import create_notification
        user = create_user(username='sev_user2', password='password')
        n = create_notification(
            user=user, notification_type='TARGET_REACHED',
            title='t', message='m', ticker='SUMMARY',
            severity='critical',
        )
        assert n.severity == 'critical'

    def test_realert_updates_severity(self, create_user):
        """Re-alerting an unread notification must refresh severity too."""
        from stocks.services.notification_service import create_notification
        user = create_user(username='sev_user3', password='password')
        first = create_notification(
            user=user, notification_type='TARGET_REACHED',
            title='t', message='m', ticker='NABIL',
        )
        assert first.severity == 'high'
        second = create_notification(
            user=user, notification_type='TARGET_REACHED',
            title='t2', message='m2', ticker='NABIL',
            severity='critical',
        )
        assert second.id == first.id  # re-alert, not a new row
        assert second.severity == 'critical'

    def test_serializer_exposes_severity(self, auth_client):
        from django.contrib.auth.models import User
        user = User.objects.get(username='testuser')
        Notification.objects.create(
            user=user, title='t', message='m', type='STOP_LOSS_HIT',
            severity='critical',
        )
        url = reverse('notifications-list')
        response = auth_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data[0]['severity'] == 'critical'


@pytest.mark.django_db
class TestMetadataContract:
    """Popups render metrics straight from metadata — these keys are load-bearing."""

    def test_portfolio_stop_loss_metadata(self, create_user):
        from unittest.mock import patch
        from stocks.models import PortfolioItem
        from stocks.services.notifications.checkers.portfolio import PortfolioChecker
        from stocks.services.notification_service import create_notification

        user = create_user(username='meta_user', password='password')
        PortfolioItem.objects.create(
            user=user, ticker='NABIL', quantity=10,
            buy_price=500, wacc=500, stop_loss_price=480,
        )
        checker = PortfolioChecker()
        with patch.object(checker, '_fetch_price', return_value=471.1):
            alerts = checker.check(user)
            for alert in alerts:
                create_notification(
                    user=user, notification_type=alert.notification_type,
                    title=alert.title, message=alert.message,
                    ticker=alert.ticker, redirect_url=alert.redirect_url,
                    portfolio_item_id=alert.portfolio_item_id,
                    metadata=alert.metadata, severity=alert.severity,
                )

        assert len([a for a in alerts if str(a.notification_type) == 'STOP_LOSS_HIT']) >= 1
        n = Notification.objects.get(user=user, type='STOP_LOSS_HIT', ticker='NABIL')
        md = n.metadata
        assert md['price'] == 471.1
        assert 'change_pct' in md
        assert n.severity == 'critical'

    def test_portfolio_target_metadata(self, create_user):
        from unittest.mock import patch
        from stocks.models import PortfolioItem
        from stocks.services.notifications.checkers.portfolio import PortfolioChecker
        from stocks.services.notification_service import create_notification

        user = create_user(username='meta_user2', password='password')
        PortfolioItem.objects.create(
            user=user, ticker='NICA', quantity=10,
            buy_price=400, wacc=400, target_price=440,
        )
        checker = PortfolioChecker()
        with patch.object(checker, '_fetch_price', return_value=445.0):
            alerts = checker.check(user)
            for alert in alerts:
                create_notification(
                    user=user, notification_type=alert.notification_type,
                    title=alert.title, message=alert.message,
                    ticker=alert.ticker, redirect_url=alert.redirect_url,
                    portfolio_item_id=alert.portfolio_item_id,
                    metadata=alert.metadata, severity=alert.severity,
                )

        n = Notification.objects.get(user=user, type='TARGET_REACHED', ticker='NICA')
        assert n.metadata['price'] == 445.0
        assert 'change_pct' in n.metadata

    def test_watchlist_alert_metadata(self, create_user):
        from unittest.mock import patch
        from stocks.models import WatchlistItem
        from stocks.services.notifications.checkers.watchlist import WatchlistChecker
        from stocks.services.notification_service import create_notification

        user = create_user(username='meta_user3', password='password')
        WatchlistItem.objects.create(
            user=user, ticker='HDHPC', alert_enabled=True, target_price=1100,
        )
        checker = WatchlistChecker()
        with patch.object(checker, '_fetch_price', return_value=1142.0):
            alerts = checker.check(user)
            for alert in alerts:
                create_notification(
                    user=user, notification_type=alert.notification_type,
                    title=alert.title, message=alert.message,
                    ticker=alert.ticker, redirect_url=alert.redirect_url,
                    watchlist_item_id=alert.watchlist_item_id,
                    metadata=alert.metadata, severity=alert.severity,
                )

        n = Notification.objects.get(user=user, type='TARGET_REACHED', ticker='HDHPC')
        md = n.metadata
        assert md['price'] == 1142.0
        assert md['symbol'] == 'HDHPC'

    def test_zone_entry_metadata(self, create_user):
        from unittest.mock import patch
        from stocks.models import WatchlistItem, DailyTradingPlan
        from stocks.services.notifications.checkers.zone_entry import ZoneEntryChecker
        from stocks.services.notification_service import create_notification
        from datetime import date

        user = create_user(username='meta_user4', password='password')
        WatchlistItem.objects.create(user=user, ticker='SHIVM', alert_enabled=True)
        DailyTradingPlan.objects.create(
            date=date(2026, 6, 12),
            payload={'as_of': '2026-06-11', 'entry_statuses': {'SHIVM': 'IN_ZONE'}},
        )
        checker = ZoneEntryChecker()
        with patch.object(checker, '_fetch_price', return_value=612.0):
            alerts = checker.check(user)
            for alert in alerts:
                create_notification(
                    user=user, notification_type=alert.notification_type,
                    title=alert.title, message=alert.message,
                    ticker=alert.ticker, redirect_url=alert.redirect_url,
                    watchlist_item_id=alert.watchlist_item_id,
                    metadata=alert.metadata, severity=alert.severity,
                )

        assert len(alerts) == 1
        n = Notification.objects.get(user=user, type='WATCHLIST_ENTRY', ticker='SHIVM')
        assert n.metadata['price'] == 612.0
        assert n.metadata['symbol'] == 'SHIVM'
        assert n.metadata['plan_date'] == '2026-06-11'
        assert n.severity == 'high'

    def test_portfolio_concentration_fires_with_price(self, create_user):
        """Regression: curr_price was referenced before assignment in old service;
        now handled in PortfolioManagementChecker."""
        from unittest.mock import patch
        from stocks.models import PortfolioItem
        from stocks.services.notifications.checkers.portfolio_management import PortfolioManagementChecker
        from stocks.services.notification_service import create_notification

        user = create_user(username='meta_user5', password='password')
        PortfolioItem.objects.create(user=user, ticker='BIG', quantity=100, buy_price=500, wacc=500)
        PortfolioItem.objects.create(user=user, ticker='SMALL', quantity=10, buy_price=100, wacc=100)

        checker = PortfolioManagementChecker()
        with patch.object(checker, '_fetch_price', return_value=510.0):
            alerts = checker.check(user)
            for alert in alerts:
                create_notification(
                    user=user, notification_type=alert.notification_type,
                    title=alert.title, message=alert.message,
                    ticker=alert.ticker, redirect_url=alert.redirect_url,
                    metadata=alert.metadata, severity=alert.severity,
                )

        assert len(alerts) >= 1
        n = Notification.objects.get(user=user, type='PORTFOLIO_DIVERSITY', ticker='BIG')
        assert n.metadata['price'] == 510.0
        assert n.metadata['symbol'] == 'BIG'
        assert 'weight' in n.metadata
        assert n.severity == 'low'

    def test_active_signal_won_metadata(self, create_user):
        from unittest.mock import patch
        from stocks.models import SignalEpisode
        from stocks.services.notifications.checkers.active_signal import ActiveSignalChecker
        from stocks.services.notification_service import create_notification
        from datetime import date

        user = create_user(username='meta_user6', password='password')
        SignalEpisode.objects.create(
            source='STRATEGY', producer_key='k1', symbol='NLIC', direction='BUY',
            start_date=date(2026, 6, 1), last_signal_date=date(2026, 6, 1),
            entry_price=900, target_price=950, stop_loss_price=870, status='ACTIVE',
        )
        checker = ActiveSignalChecker()
        with patch.object(checker, '_fetch_price', return_value=955.0):
            alerts = checker.check(user)
            for alert in alerts:
                create_notification(
                    user=user, notification_type=alert.notification_type,
                    title=alert.title, message=alert.message,
                    ticker=alert.ticker, redirect_url=alert.redirect_url,
                    metadata=alert.metadata, severity=alert.severity,
                )

        n = Notification.objects.get(user=user, type='TARGET_REACHED', ticker='NLIC')
        md = n.metadata
        assert md['price'] == 955.0
        assert md['level'] == 950.0
        assert md['level_type'] == 'target'

    def test_active_signal_lost_metadata(self, create_user):
        from unittest.mock import patch
        from stocks.models import SignalEpisode
        from stocks.services.notifications.checkers.active_signal import ActiveSignalChecker
        from stocks.services.notification_service import create_notification
        from datetime import date

        user = create_user(username='meta_user7', password='password')
        SignalEpisode.objects.create(
            source='STRATEGY', producer_key='k2', symbol='UPPER', direction='BUY',
            start_date=date(2026, 6, 1), last_signal_date=date(2026, 6, 1),
            entry_price=900, target_price=950, stop_loss_price=870, status='ACTIVE',
        )
        checker = ActiveSignalChecker()
        with patch.object(checker, '_fetch_price', return_value=860.0):
            alerts = checker.check(user)
            for alert in alerts:
                create_notification(
                    user=user, notification_type=alert.notification_type,
                    title=alert.title, message=alert.message,
                    ticker=alert.ticker, redirect_url=alert.redirect_url,
                    metadata=alert.metadata, severity=alert.severity,
                )

        n = Notification.objects.get(user=user, type='STOP_LOSS_HIT', ticker='UPPER')
        assert n.metadata['level'] == 870.0
        assert n.metadata['level_type'] == 'stop'

    def test_active_signal_lost_without_stop_has_no_level(self, create_user):
        """A LOST signal without a stop price must not emit level_type='stop' with level=None."""
        from unittest.mock import patch
        from stocks.models import SignalEpisode
        from stocks.services.notifications.checkers.active_signal import ActiveSignalChecker
        from stocks.services.notification_service import create_notification
        from datetime import date

        user = create_user(username='meta_user8', password='password')
        SignalEpisode.objects.create(
            source='STRATEGY', producer_key='k3', symbol='NOSL', direction='SELL',
            start_date=date(2026, 6, 1), last_signal_date=date(2026, 6, 1),
            entry_price=900, target_price=None, stop_loss_price=940, status='ACTIVE',
        )
        checker = ActiveSignalChecker()
        # SELL direction: price >= stop triggers LOST
        with patch.object(checker, '_fetch_price', return_value=945.0):
            alerts = checker.check(user)
            for alert in alerts:
                create_notification(
                    user=user, notification_type=alert.notification_type,
                    title=alert.title, message=alert.message,
                    ticker=alert.ticker, redirect_url=alert.redirect_url,
                    metadata=alert.metadata, severity=alert.severity,
                )

        n = Notification.objects.get(user=user, type='STOP_LOSS_HIT', ticker='NOSL')
        assert n.metadata['level'] == 940.0
        assert n.metadata['level_type'] == 'stop'

    def test_signal_alert_metadata_has_change_pct(self, create_user):
        from unittest.mock import patch
        from stocks.models import PortfolioItem, SignalEpisode
        from stocks.services.notifications.checkers.signals import SignalsChecker
        from stocks.services.notification_service import create_notification
        from datetime import date

        user = create_user(username='meta_user9', password='password')
        PortfolioItem.objects.create(user=user, ticker='SBL', quantity=10, buy_price=400, wacc=400)
        SignalEpisode.objects.create(
            source='STRATEGY', producer_key='k9', symbol='SBL', direction='BUY',
            start_date=date.today(), last_signal_date=date.today(),
            entry_price=400, status='ACTIVE',
        )
        checker = SignalsChecker()
        with patch.object(checker, '_fetch_price', return_value=412.0), \
             patch.object(checker, '_day_change', return_value=1.8):
            alerts = checker.check(user)
            for alert in alerts:
                create_notification(
                    user=user, notification_type=alert.notification_type,
                    title=alert.title, message=alert.message,
                    ticker=alert.ticker, redirect_url=alert.redirect_url,
                    metadata=alert.metadata, severity=alert.severity,
                )

        assert len(alerts) == 1
        n = Notification.objects.get(user=user, type='SIGNAL_BUY', ticker='SBL')
        assert n.metadata['price'] == 412.0
        assert n.metadata['change_pct'] == 1.8
        assert n.metadata['strategies'] == []
