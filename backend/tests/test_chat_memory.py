import asyncio
import pytest

from chat import _user_context


def _call(tool_fn, args):
    return asyncio.run(tool_fn.handler(args))


@pytest.mark.django_db(transaction=True)
class TestUserMemoryTools:
    def _user(self, create_user, name="memuser"):
        user = create_user(username=name, password="x")
        _user_context.set_user(user)
        return user

    def test_remember_and_dedupe(self, create_user):
        from chat.models import UserMemory
        from chat.tools import remember_about_user
        user = self._user(create_user)
        out = _call(remember_about_user, {"fact": "Risk-averse; prefers 1% risk per trade"})
        assert not out.get("is_error")
        assert UserMemory.objects.filter(user=user).count() == 1
        _call(remember_about_user, {"fact": "Risk-averse; prefers 1% risk per trade"})
        assert UserMemory.objects.filter(user=user).count() == 1  # exact dupe ignored

    def test_cap_and_hygiene(self, create_user):
        from chat.models import UserMemory
        from chat.tools import remember_about_user
        user = self._user(create_user, "memcap")
        for i in range(30):
            UserMemory.objects.create(user=user, content=f"fact {i}")
        out = _call(remember_about_user, {"fact": "one too many"})
        assert "30" in out["content"][0]["text"]  # cap message mentions the limit
        assert UserMemory.objects.filter(user=user).count() == 30
        # hygiene: newlines stripped, content capped at 220
        UserMemory.objects.filter(user=user).delete()
        _call(remember_about_user, {"fact": "line1\nline2" + "x" * 300})
        saved = UserMemory.objects.get(user=user)
        assert "\n" not in saved.content and len(saved.content) <= 220

    def test_forget_by_substring(self, create_user):
        from chat.models import UserMemory
        from chat.tools import remember_about_user, forget_about_user
        user = self._user(create_user, "memforget")
        _call(remember_about_user, {"fact": "Hates hydropower stocks"})
        _call(remember_about_user, {"fact": "Long-term horizon"})
        out = _call(forget_about_user, {"match": "hydro"})
        assert "Hates hydropower" in out["content"][0]["text"]
        assert UserMemory.objects.filter(user=user).count() == 1


@pytest.mark.django_db
class TestMemoryInjection:
    def test_format_prompt_includes_memory(self, create_user):
        from chat.agent import _format_prompt
        user = create_user(username="injuser", password="x")
        rendered = _format_prompt(user, "hello", memory=["Risk-averse", "Holds NABIL long-term"])
        assert "Risk-averse" in rendered and "Holds NABIL long-term" in rendered
        assert "hello" in rendered

    def test_format_prompt_without_memory(self, create_user):
        from chat.agent import _format_prompt
        user = create_user(username="injuser2", password="x")
        rendered = _format_prompt(user, "hello", memory=[])
        assert "hello" in rendered  # renders cleanly with no facts
