import pytest
from django.urls import reverse
from rest_framework import status
from unittest.mock import patch

@pytest.mark.django_db
class TestMarketAPI:
    def test_search_stocks(self, auth_client):
        url = reverse('search_stocks')
        response = auth_client.get(url, {'q': 'NAB'})
        assert response.status_code == status.HTTP_200_OK
        # Mocking data might be needed if DB is empty, but for now checking status

    def test_stock_summary(self, auth_client):
        url = reverse('stock_summary')
        response = auth_client.get(url)
        assert response.status_code == status.HTTP_200_OK

    def test_market_activity(self, auth_client):
        url = reverse('market_activity')
        response = auth_client.get(url)
        assert response.status_code == status.HTTP_200_OK

    def test_stock_dividends(self, auth_client):
        url = reverse('stock_dividends', kwargs={'ticker': 'NABIL'})
        response = auth_client.get(url)
        assert response.status_code in [status.HTTP_200_OK, status.HTTP_404_NOT_FOUND]

    def test_stock_financials(self, auth_client):
        url = reverse('stock_financials', kwargs={'ticker': 'NABIL'})
        response = auth_client.get(url)
        assert response.status_code in [status.HTTP_200_OK, status.HTTP_404_NOT_FOUND]

    def test_sector_history(self, auth_client):
        url = reverse('sector_history', kwargs={'sector_name': 'Commercial Banks'})
        response = auth_client.get(url)
        assert response.status_code in [status.HTTP_200_OK, status.HTTP_404_NOT_FOUND]

    def test_floorsheet_list(self, auth_client):
        url = reverse('floorsheet_list')
        response = auth_client.get(url)
        assert response.status_code == status.HTTP_200_OK

    def test_stock_chart_data(self, auth_client):
        url = reverse('chart_history', kwargs={'ticker': 'NABIL'})
        response = auth_client.get(url)
        assert response.status_code in [status.HTTP_200_OK, status.HTTP_404_NOT_FOUND]

    def test_fibonacci_levels(self, auth_client):
        url = reverse('fibonacci_levels', kwargs={'ticker': 'NABIL'})
        response = auth_client.get(url)
        assert response.status_code in [status.HTTP_200_OK, status.HTTP_404_NOT_FOUND]
