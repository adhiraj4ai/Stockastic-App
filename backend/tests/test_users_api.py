import pytest
from django.urls import reverse
from rest_framework import status
from django.contrib.auth.models import User

@pytest.mark.django_db
class TestUsersAPI:
    def test_token_obtain_pair(self, api_client, create_user):
        user = create_user(username='testuser', password='password')
        url = reverse('token_obtain_pair')
        data = {'username': 'testuser', 'password': 'password'}
        response = api_client.post(url, data)
        assert response.status_code == status.HTTP_200_OK
        assert 'access' in response.data
        assert 'refresh' in response.data

    def test_token_refresh(self, api_client, create_user):
        user = create_user(username='testuser', password='password')
        url = reverse('token_obtain_pair')
        data = {'username': 'testuser', 'password': 'password'}
        response = api_client.post(url, data)
        refresh_token = response.data['refresh']
        
        url_refresh = reverse('token_refresh')
        data_refresh = {'refresh': refresh_token}
        response_refresh = api_client.post(url_refresh, data_refresh)
        assert response_refresh.status_code == status.HTTP_200_OK
        assert 'access' in response_refresh.data

    def test_get_current_user_auto_create_profile(self, auth_client):
        # We assume auth_client creates a user. We can verify if profile is returned.
        url = reverse('user_me')
        response = auth_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        # The view ensures profile exists and flattens it.
        # Check for flattened fields (from research in views.py)
        assert 'username' in response.data
        assert 'nickname' in response.data # Profile field

    def test_update_user_profile(self, auth_client):
        url = reverse('user_me')
        data = {
            'first_name': 'Test',
            'last_name': 'Tester',
            'nickname': 'testy',
            'email': 'test@example.com'
        }
        response = auth_client.put(url, data, format='json')
        assert response.status_code == status.HTTP_200_OK
        # Profile fields should be updated
        # Note: Serializer might return nested or flat. 
        # View says it returns serializer.data after perform_update? No, it returns Response(serializer.data).
        # And GET flattens. Let's check GET again to verify.
        get_response = auth_client.get(url)
        assert get_response.data['nickname'] == 'testy'
        assert get_response.data['first_name'] == 'Test'

    def test_change_password_success(self, auth_client):
        url = reverse('change_password')
        data = {
            'current_password': 'password',
            'new_password': 'newpassword123'
        }
        response = auth_client.post(url, data)
        assert response.status_code == status.HTTP_200_OK
        assert response.data['message'] == "Password updated successfully"

    def test_change_password_invalid_current(self, auth_client):
        url = reverse('change_password')
        data = {
            'current_password': 'wrongpassword',
            'new_password': 'newpassword123'
        }
        response = auth_client.post(url, data)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data['error'] == "Incorrect current password"

    def test_change_password_too_short(self, auth_client):
        url = reverse('change_password')
        data = {
            'current_password': 'password',
            'new_password': 'short'
        }
        response = auth_client.post(url, data)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "New password must be at least 6 characters" in response.data['error']
