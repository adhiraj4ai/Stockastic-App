import pytest
from django.urls import reverse
from rest_framework import status

@pytest.mark.django_db
class TestFundamentalsAPI:
    def test_fundamentals_list(self, auth_client):
        url = reverse('fundamentals-list')
        response = auth_client.get(url)
        assert response.status_code == status.HTTP_200_OK

    def test_financial_reports_list(self, auth_client):
        url = reverse('financial-reports-list')
        response = auth_client.get(url)
        assert response.status_code == status.HTTP_200_OK

    def test_stock_dividends(self, auth_client):
        url = reverse('stock_dividends', kwargs={'ticker': 'NABIL'})
        response = auth_client.get(url)
        assert response.status_code == status.HTTP_200_OK

    def test_stock_financials(self, auth_client):
        url = reverse('stock_financials', kwargs={'ticker': 'NABIL'})
        response = auth_client.get(url)
        assert response.status_code == status.HTTP_200_OK
