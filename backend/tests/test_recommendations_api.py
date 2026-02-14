import pytest
from django.urls import reverse
from rest_framework import status

@pytest.mark.django_db
class TestRecommendationsAPI:
    def test_broker_accumulation_recommendations(self, auth_client):
        url = reverse('broker_accumulation_recommendations')
        response = auth_client.get(url)
        assert response.status_code == status.HTTP_200_OK

    def test_broker_accumulation_history(self, auth_client):
        url = reverse('broker_accumulation_history')
        response = auth_client.get(url, {'symbol': 'NABIL'})
        assert response.status_code == status.HTTP_200_OK

    def test_smart_accumulated_crossover_recommendations(self, auth_client):
        url = reverse('smart_accumulated_crossover_recommendations')
        response = auth_client.get(url)
        assert response.status_code == status.HTTP_200_OK

    def test_smart_accumulated_crossover_history(self, auth_client):
        url = reverse('smart_accumulated_crossover_history')
        response = auth_client.get(url, {'symbol': 'NABIL'})
        assert response.status_code == status.HTTP_200_OK

    def test_ichimoku_accumulation_recommendations(self, auth_client):
        url = reverse('ichimoku_accumulation_recommendations')
        response = auth_client.get(url)
        assert response.status_code == status.HTTP_200_OK

    def test_ichimoku_accumulation_history(self, auth_client):
        url = reverse('ichimoku_accumulation_history')
        response = auth_client.get(url, {'symbol': 'NABIL'})
        assert response.status_code == status.HTTP_200_OK
