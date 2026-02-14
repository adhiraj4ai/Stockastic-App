import pytest
from django.urls import reverse
from rest_framework import status

@pytest.mark.django_db
class TestCompaniesAPI:
    def test_list_companies(self, auth_client):
        url = reverse('companies-list')
        response = auth_client.get(url)
        assert response.status_code == status.HTTP_200_OK

    def test_search_companies(self, auth_client):
        url = reverse('companies-list')
        response = auth_client.get(url, {'search': 'NABIL'})
        assert response.status_code == status.HTTP_200_OK
