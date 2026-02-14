import pytest
from django.urls import reverse
from rest_framework import status

@pytest.mark.django_db
class TestChatAPI:
    def test_create_session(self, auth_client):
        url = reverse('chat-session-list')
        data = {'title': 'New Analysis Session'}
        response = auth_client.post(url, data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['title'] == 'New Analysis Session'

    def test_get_sessions(self, auth_client):
        url = reverse('chat-session-list')
        auth_client.post(url, {'title': 'Session 1'})
        response = auth_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1

    def test_send_message(self, auth_client):
        # Create session
        s_response = auth_client.post(reverse('chat-session-list'), {'title': 'Chat'})
        session_id = s_response.data['id']
        
        # Send message
        url = reverse('chat-session-add-message', kwargs={'pk': session_id})
        data = {'content': 'Hello AI', 'role': 'user'}
        response = auth_client.post(url, data)
        assert response.status_code == status.HTTP_201_CREATED

    def test_get_session_detail(self, auth_client):
        s_response = auth_client.post(reverse('chat-session-list'), {'title': 'S1'})
        session_id = s_response.data['id']
        
        url = reverse('chat-session-detail', kwargs={'pk': session_id})
        response = auth_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert response.data['title'] == 'S1'

    def test_delete_session(self, auth_client):
        s_response = auth_client.post(reverse('chat-session-list'), {'title': 'To Delete'})
        session_id = s_response.data['id']
        
        url = reverse('chat-session-detail', kwargs={'pk': session_id})
        response = auth_client.delete(url)
        assert response.status_code == status.HTTP_204_NO_CONTENT

    def test_update_session_title(self, auth_client):
        s_response = auth_client.post(reverse('chat-session-list'), {'title': 'Old Title'})
        session_id = s_response.data['id']
        
        url = reverse('chat-session-detail', kwargs={'pk': session_id})
        response = auth_client.patch(url, {'title': 'New Title'})
        assert response.status_code == status.HTTP_200_OK
        assert response.data['title'] == 'New Title'
