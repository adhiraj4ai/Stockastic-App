import pytest
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
