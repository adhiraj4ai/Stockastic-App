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
        user = User.objects.get(username=auth_client.user.username)
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
