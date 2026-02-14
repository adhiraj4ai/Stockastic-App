import pytest
from django.urls import reverse
from rest_framework import status

@pytest.mark.django_db
class TestPipelineAPI:
    def test_pipeline_history(self, auth_client):
        url = reverse('pipeline-history')
        response = auth_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert 'results' in response.data

    def test_pipeline_status(self, auth_client):
        url = reverse('pipeline-status')
        response = auth_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert isinstance(response.data, list)

    def test_trigger_signals(self, auth_client):
        url = reverse('pipeline-trigger-signals')
        response = auth_client.post(url, {'symbol': 'NABIL'})
        assert response.status_code == status.HTTP_200_OK
        assert response.data['status'] == 'success'
