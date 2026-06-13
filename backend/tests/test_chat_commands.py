import json

import pytest

from chat.commands import handle_command, parse_command


class TestParseCommand:
    def test_non_commands(self):
        assert parse_command("hello") is None
        assert parse_command("what about /memory?") is None
        assert parse_command("//memory") is None

    def test_memory_variants(self):
        assert parse_command("/memory").name == "memory"
        assert parse_command("/memory list").args == "list"
        assert parse_command("  /memory  add  Likes banks  ").args == "add  Likes banks"
        assert parse_command("/MEMORY clear").name == "memory"

    def test_help(self):
        assert parse_command("/help").name == "help"

    def test_unknown_command_still_parses(self):
        cmd = parse_command("/bogus stuff")
        assert cmd.name == "bogus"


@pytest.mark.django_db
class TestHandleCommand:
    def _facts(self, user):
        from chat.models import UserMemory
        return list(UserMemory.objects.filter(user=user).values_list("content", flat=True))

    def test_list_empty_and_populated(self, create_user):
        from chat.models import UserMemory
        user = create_user(username="cmd1", password="x")
        out = handle_command(user, parse_command("/memory"))
        assert "no facts" in out.lower() or "nothing" in out.lower()
        UserMemory.objects.create(user=user, content="Risk-averse")
        UserMemory.objects.create(user=user, content="Long horizon")
        out = handle_command(user, parse_command("/memory list"))
        assert "1. Risk-averse" in out and "2. Long horizon" in out

    def test_add_with_hygiene_and_cap(self, create_user):
        from chat.models import UserMemory
        user = create_user(username="cmd2", password="x")
        out = handle_command(user, parse_command("/memory add  Hates\nhydro  "))
        assert "Hates hydro" in out
        assert self._facts(user) == ["Hates hydro"]
        for i in range(29):
            UserMemory.objects.create(user=user, content=f"f{i}")
        out = handle_command(user, parse_command("/memory add overflow"))
        assert "30" in out and "overflow" not in self._facts(user)

    def test_forget_by_index_and_substring(self, create_user):
        from chat.models import UserMemory
        user = create_user(username="cmd3", password="x")
        UserMemory.objects.create(user=user, content="alpha fact")
        UserMemory.objects.create(user=user, content="beta fact")
        out = handle_command(user, parse_command("/memory forget 1"))
        assert "alpha fact" in out and self._facts(user) == ["beta fact"]
        out = handle_command(user, parse_command("/memory forget beta"))
        assert self._facts(user) == []

    def test_edit_by_index(self, create_user):
        from chat.models import UserMemory
        user = create_user(username="cmd4", password="x")
        UserMemory.objects.create(user=user, content="old text")
        out = handle_command(user, parse_command("/memory edit 1 new text"))
        assert self._facts(user) == ["new text"] and "new text" in out

    def test_clear_requires_confirm(self, create_user):
        from chat.models import UserMemory
        user = create_user(username="cmd5", password="x")
        UserMemory.objects.create(user=user, content="keep me")
        out = handle_command(user, parse_command("/memory clear"))
        assert "confirm" in out.lower() and self._facts(user) == ["keep me"]
        out = handle_command(user, parse_command("/memory clear confirm"))
        assert self._facts(user) == [] and "1" in out  # reports count deleted

    def test_help_and_unknown(self, create_user):
        user = create_user(username="cmd6", password="x")
        out = handle_command(user, parse_command("/help"))
        assert "/memory" in out
        out = handle_command(user, parse_command("/bogus"))
        assert "/help" in out  # unknown → points at help

    def test_bad_index_errors_gracefully(self, create_user):
        user = create_user(username="cmd7", password="x")
        out = handle_command(user, parse_command("/memory forget 9"))
        assert "no fact" in out.lower() or "not found" in out.lower()
        out = handle_command(user, parse_command("/memory edit abc new"))
        assert "usage" in out.lower() or "index" in out.lower()


@pytest.mark.django_db
class TestSendCommandInterception:
    def _send(self, auth_client, session_id, prompt):
        resp = auth_client.post(f"/api/chat/sessions/{session_id}/send/",
                                data=json.dumps({"prompt": prompt}),
                                content_type="application/json")
        assert resp.status_code == 200
        body = b"".join(resp.streaming_content).decode()
        return body

    def test_memory_command_short_circuits_sdk(self, auth_client):
        from unittest.mock import patch
        from django.contrib.auth.models import User
        from chat.models import ChatMessage, ChatSession
        user = User.objects.get(username="testuser")
        session = ChatSession.objects.create(user=user, title="t")
        with patch("chat.views.stream_chat", side_effect=AssertionError("SDK must not be called")):
            body = self._send(auth_client, session.id, "/memory add Prefers banks")
        assert "event: assistant_start" in body
        assert "event: text" in body and "Prefers banks" in body
        assert "event: done" in body
        msgs = list(ChatMessage.objects.filter(session=session).order_by("created_at"))
        assert [m.role for m in msgs] == ["user", "assistant"]
        assert msgs[1].blocks[0]["kind"] == "text"

    def test_command_exempt_from_rate_limit(self, auth_client):
        from unittest.mock import patch
        from django.contrib.auth.models import User
        from chat.models import ChatSession
        user = User.objects.get(username="testuser")
        session = ChatSession.objects.create(user=user, title="t2")
        with patch("chat.views._rate_limited", side_effect=AssertionError("commands bypass the limiter")):
            body = self._send(auth_client, session.id, "/memory")
        assert "event: done" in body
