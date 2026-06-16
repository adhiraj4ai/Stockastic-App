import pytest
from django.contrib.auth import get_user_model
from django.db import IntegrityError

from chat.models import CompanyChatSummary

User = get_user_model()


@pytest.fixture
def user(db):
    return User.objects.create(username="alice")


def test_defaults_and_str(user):
    row = CompanyChatSummary.objects.create(user=user, symbol="NMB")
    assert row.summary == ""
    assert row.last_message is None
    assert str(row) == f"{user.pk}:NMB"


def test_user_symbol_is_unique(user):
    CompanyChatSummary.objects.create(user=user, symbol="NMB")
    with pytest.raises(IntegrityError):
        CompanyChatSummary.objects.create(user=user, symbol="NMB")
