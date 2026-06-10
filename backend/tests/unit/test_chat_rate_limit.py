"""Unit tests for the chat send-endpoint rate limiter."""

import uuid

import pytest
from django.core.cache import cache

from chat.views import _rate_limited


@pytest.fixture(autouse=True)
def clear_cache_for_test():
    """Wipe any cached rate-limit keys before each test to avoid pollution."""
    yield
    cache.clear()


@pytest.mark.django_db
class TestRateLimited:
    def _unique_user_id(self):
        """Generate a unique integer-like user-id per test run."""
        # Use the integer representation of a UUID truncated to 31 bits so it
        # fits safely in Django's AutoField range.
        return uuid.uuid4().int % (2**31)

    def test_first_ten_calls_are_allowed(self):
        user_id = self._unique_user_id()
        for i in range(10):
            assert _rate_limited(user_id) is False, f"call {i + 1} should be allowed"

    def test_eleventh_call_is_blocked(self):
        user_id = self._unique_user_id()
        for _ in range(10):
            _rate_limited(user_id)
        assert _rate_limited(user_id) is True

    def test_different_users_have_independent_counters(self):
        user_a = self._unique_user_id()
        user_b = self._unique_user_id()
        # Exhaust user_a
        for _ in range(10):
            _rate_limited(user_a)
        assert _rate_limited(user_a) is True
        # user_b is untouched
        assert _rate_limited(user_b) is False

    def test_custom_limit_respected(self):
        user_id = self._unique_user_id()
        # Limit of 3: calls 1-3 pass, call 4 is blocked.
        for i in range(3):
            assert _rate_limited(user_id, limit=3) is False, f"call {i + 1} should pass"
        assert _rate_limited(user_id, limit=3) is True

    def test_counter_resets_after_window(self):
        """After the cache key expires the window resets (simulated by direct delete)."""
        user_id = self._unique_user_id()
        for _ in range(10):
            _rate_limited(user_id)
        assert _rate_limited(user_id) is True
        # Simulate TTL expiry by deleting the key from cache.
        cache.delete(f"chat_send_rl:{user_id}")
        assert _rate_limited(user_id) is False
