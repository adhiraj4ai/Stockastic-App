"""Integration tests for the ChatSession CRUD endpoints."""
import pytest
from django.urls import reverse
from rest_framework import status

from chat.models import ChatMessage, ChatSession


@pytest.mark.django_db
class TestSessionCreate:
    def test_creates_session_for_authenticated_user(self, auth_client):
        res = auth_client.post(reverse("chat-session-list"), {"title": "NEPSE Outlook"})
        assert res.status_code == status.HTTP_201_CREATED
        assert res.data["title"] == "NEPSE Outlook"
        assert "id" in res.data
        assert ChatSession.objects.count() == 1

    def test_unauthenticated_request_returns_401(self, api_client):
        res = api_client.post(reverse("chat-session-list"), {"title": "Test"})
        assert res.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)

    def test_created_session_belongs_to_requesting_user(self, auth_client, create_user):
        res = auth_client.post(reverse("chat-session-list"), {"title": "My Session"})
        session = ChatSession.objects.get(pk=res.data["id"])
        assert session.user.username == "testuser"

    def test_default_title_accepted(self, auth_client):
        # Omitting title should fall back to the model default "New chat"
        res = auth_client.post(reverse("chat-session-list"), {})
        assert res.status_code == status.HTTP_201_CREATED
        assert res.data["title"] == "New chat"

    def test_title_max_length_255_chars(self, auth_client):
        long_title = "x" * 255
        res = auth_client.post(reverse("chat-session-list"), {"title": long_title})
        assert res.status_code == status.HTTP_201_CREATED

    def test_message_count_is_zero_on_creation(self, auth_client):
        res = auth_client.post(reverse("chat-session-list"), {"title": "New"})
        assert res.data["message_count"] == 0


@pytest.mark.django_db
class TestSessionList:
    def test_returns_only_own_sessions(self, auth_client, create_user):
        # Create a session for testuser
        auth_client.post(reverse("chat-session-list"), {"title": "My Session"})

        # Create a different user with their own session
        other = create_user(username="other", password="pw")
        from rest_framework.test import APIClient
        other_client = APIClient()
        other_client.force_authenticate(user=other)
        other_client.post(reverse("chat-session-list"), {"title": "Other Session"})

        # testuser should see only their own session
        res = auth_client.get(reverse("chat-session-list"))
        assert res.status_code == status.HTTP_200_OK
        assert len(res.data) == 1
        assert res.data[0]["title"] == "My Session"

    def test_ordered_most_recent_first(self, auth_client):
        auth_client.post(reverse("chat-session-list"), {"title": "Old"})
        auth_client.post(reverse("chat-session-list"), {"title": "New"})
        res = auth_client.get(reverse("chat-session-list"))
        titles = [s["title"] for s in res.data]
        assert titles[0] == "New"

    def test_empty_list_for_new_user(self, auth_client):
        # No sessions created yet
        res = auth_client.get(reverse("chat-session-list"))
        assert res.status_code == status.HTTP_200_OK
        assert res.data == []

    def test_unauthenticated_returns_401(self, api_client):
        res = api_client.get(reverse("chat-session-list"))
        assert res.status_code in (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN)


@pytest.mark.django_db
class TestSessionDetail:
    def _create_session(self, client, title="Session"):
        res = client.post(reverse("chat-session-list"), {"title": title})
        return res.data["id"]

    def test_retrieve_own_session(self, auth_client):
        sid = self._create_session(auth_client, "My Details")
        res = auth_client.get(reverse("chat-session-detail", kwargs={"pk": sid}))
        assert res.status_code == status.HTTP_200_OK
        assert res.data["title"] == "My Details"

    def test_cannot_retrieve_other_users_session(self, auth_client, create_user):
        sid = self._create_session(auth_client)

        other = create_user(username="other", password="pw")
        from rest_framework.test import APIClient
        other_client = APIClient()
        other_client.force_authenticate(user=other)
        res = other_client.get(reverse("chat-session-detail", kwargs={"pk": sid}))
        assert res.status_code == status.HTTP_404_NOT_FOUND

    def test_nonexistent_session_returns_404(self, auth_client):
        res = auth_client.get(
            reverse("chat-session-detail", kwargs={"pk": "00000000-0000-0000-0000-000000000000"})
        )
        assert res.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
class TestSessionUpdate:
    def _create_session(self, client, title="Session"):
        res = client.post(reverse("chat-session-list"), {"title": title})
        return res.data["id"]

    def test_patch_updates_title(self, auth_client):
        sid = self._create_session(auth_client, "Old Title")
        res = auth_client.patch(
            reverse("chat-session-detail", kwargs={"pk": sid}), {"title": "New Title"}
        )
        assert res.status_code == status.HTTP_200_OK
        assert res.data["title"] == "New Title"

    def test_put_updates_session(self, auth_client):
        sid = self._create_session(auth_client, "Original")
        res = auth_client.put(
            reverse("chat-session-detail", kwargs={"pk": sid}), {"title": "Replaced"}
        )
        assert res.status_code == status.HTTP_200_OK
        assert res.data["title"] == "Replaced"

    def test_cannot_update_other_users_session(self, auth_client, create_user):
        sid = self._create_session(auth_client)
        other = create_user(username="other", password="pw")
        from rest_framework.test import APIClient
        other_client = APIClient()
        other_client.force_authenticate(user=other)
        res = other_client.patch(
            reverse("chat-session-detail", kwargs={"pk": sid}), {"title": "Hijacked"}
        )
        assert res.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
class TestSessionDelete:
    def _create_session(self, client, title="Session"):
        res = client.post(reverse("chat-session-list"), {"title": title})
        return res.data["id"]

    def test_delete_own_session(self, auth_client):
        sid = self._create_session(auth_client)
        res = auth_client.delete(reverse("chat-session-detail", kwargs={"pk": sid}))
        assert res.status_code == status.HTTP_204_NO_CONTENT
        assert not ChatSession.objects.filter(pk=sid).exists()

    def test_delete_cascades_to_messages(self, auth_client, create_user):
        sid = self._create_session(auth_client)
        session = ChatSession.objects.get(pk=sid)
        ChatMessage.objects.create(session=session, role="user", text="Hello")
        ChatMessage.objects.create(session=session, role="assistant", text="Hi back")

        auth_client.delete(reverse("chat-session-detail", kwargs={"pk": sid}))
        assert ChatMessage.objects.filter(session_id=sid).count() == 0

    def test_cannot_delete_other_users_session(self, auth_client, create_user):
        sid = self._create_session(auth_client)
        other = create_user(username="other", password="pw")
        from rest_framework.test import APIClient
        other_client = APIClient()
        other_client.force_authenticate(user=other)
        res = other_client.delete(reverse("chat-session-detail", kwargs={"pk": sid}))
        assert res.status_code == status.HTTP_404_NOT_FOUND
        assert ChatSession.objects.filter(pk=sid).exists()


@pytest.mark.django_db
class TestMessagesEndpoint:
    def test_returns_messages_in_chronological_order(self, auth_client):
        res = auth_client.post(reverse("chat-session-list"), {"title": "Chat"})
        sid = res.data["id"]
        session = ChatSession.objects.get(pk=sid)

        ChatMessage.objects.create(session=session, role="user", text="First")
        ChatMessage.objects.create(session=session, role="assistant", text="Second")

        res = auth_client.get(reverse("chat-session-messages", kwargs={"pk": sid}))
        assert res.status_code == status.HTTP_200_OK
        assert len(res.data) == 2
        assert res.data[0]["text"] == "First"
        assert res.data[1]["text"] == "Second"

    def test_empty_session_returns_empty_list(self, auth_client):
        res = auth_client.post(reverse("chat-session-list"), {"title": "Empty"})
        sid = res.data["id"]
        res = auth_client.get(reverse("chat-session-messages", kwargs={"pk": sid}))
        assert res.status_code == status.HTTP_200_OK
        assert res.data == []

    def test_cannot_view_other_users_session_messages(self, auth_client, create_user):
        res = auth_client.post(reverse("chat-session-list"), {"title": "Private"})
        sid = res.data["id"]

        other = create_user(username="other", password="pw")
        from rest_framework.test import APIClient
        other_client = APIClient()
        other_client.force_authenticate(user=other)
        res = other_client.get(reverse("chat-session-messages", kwargs={"pk": sid}))
        assert res.status_code == status.HTTP_404_NOT_FOUND
