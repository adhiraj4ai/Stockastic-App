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
    def test_all_check_functions_invoked_including_active_signal(self, create_user):
        """Regression: check_active_signal_alerts was never imported, so the
        hourly task raised a NameError that was swallowed per-user and the
        active-signal alerts never fired. Assert every check runs."""
        from stocks.tasks import check_all_user_notifications

        create_user(username='active_user', password='password')

        ns = 'stocks.services.notification_service'
        with patch(f'{ns}.check_portfolio_alerts', return_value=0) as m_portfolio, \
             patch(f'{ns}.check_watchlist_alerts', return_value=0) as m_watchlist, \
             patch(f'{ns}.check_signal_alerts', return_value=0) as m_signal, \
             patch(f'{ns}.check_whale_watch_alerts', return_value=0) as m_whale, \
             patch(f'{ns}.check_zone_entry_alerts', return_value=0) as m_zone, \
             patch(f'{ns}.check_active_signal_alerts', return_value=0) as m_active:
            result = check_all_user_notifications()

        # No NameError reached the swallowing except -> every check ran once.
        assert m_portfolio.called
        assert m_watchlist.called
        assert m_signal.called
        assert m_whale.called
        assert m_zone.called
        assert m_active.called
        assert 'total_active_signal_notifications' in result


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
