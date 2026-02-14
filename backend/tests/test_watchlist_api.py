import pytest
from django.urls import reverse
from rest_framework import status

@pytest.mark.django_db
class TestWatchlistAPI:
    def test_create_watchlist_item(self, auth_client):
        url = reverse('watchlist-list')
        data = {'symbol': 'NABIL', 'alert_price': 500}
        response = auth_client.post(url, data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['symbol'] == 'NABIL'

    def test_get_watchlist(self, auth_client):
        url = reverse('watchlist-list')
        response = auth_client.get(url)
        assert response.status_code == status.HTTP_200_OK
