import pytest
from rest_framework.test import APIClient
from django.contrib.auth.models import User

@pytest.fixture
def api_client():
    return APIClient()

@pytest.fixture
def create_user(db):
    def make_user(**kwargs):
        return User.objects.create_user(**kwargs)
    return make_user

@pytest.fixture
def auth_client(api_client, create_user):
    user = create_user(username='testuser', password='password')
    api_client.force_authenticate(user=user)
    return api_client
