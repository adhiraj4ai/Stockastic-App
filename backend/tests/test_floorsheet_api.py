import pytest
from django.urls import reverse
from rest_framework import status

@pytest.mark.django_db
class TestFloorsheetAPI:
    def test_floorsheet_summary(self, auth_client):
        # The list action was implemented to return a status message
        url = reverse('floorsheet-analytics-list')
        response = auth_client.get(url)
        assert response.status_code == status.HTTP_200_OK

    def test_floorsheet_summary_action(self, auth_client):
        url = reverse('floorsheet-analytics-summary')
        response = auth_client.get(url)
        assert response.status_code == status.HTTP_200_OK

    def test_smart_money(self, auth_client):
        url = reverse('floorsheet-analytics-smart-money')
        response = auth_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert 'leaderboard' in response.data

    def test_broker_portfolio(self, auth_client):
        url = reverse('broker_portfolio')
        response = auth_client.get(url, {'broker': '58'})
        assert response.status_code == status.HTTP_200_OK

    def test_broker_accumulation_history(self, auth_client):
        url = reverse('broker-accumulation-history')
        response = auth_client.get(url, {'broker': '58', 'ticker': 'NABIL'})
        assert response.status_code == status.HTTP_200_OK
