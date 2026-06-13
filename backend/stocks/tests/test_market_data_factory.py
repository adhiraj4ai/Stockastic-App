import pytest
from django.test import override_settings

from stocks.services.market_data.factory import get_provider, register_provider
from stocks.services.market_data.providers.nepse_api import NepseApiProvider


def test_get_provider_returns_nepseapi_by_default():
    with override_settings(NEPSE_API_PROVIDER="nepseapi"):
        assert isinstance(get_provider(), NepseApiProvider)


def test_get_provider_explicit_name_overrides_setting():
    assert isinstance(get_provider("nepseapi"), NepseApiProvider)


def test_unknown_provider_raises():
    with pytest.raises(ValueError):
        get_provider("does-not-exist")


def test_register_provider_adds_to_registry():
    class Dummy:
        name = "dummy"

        def __init__(self, **kw):
            pass

    register_provider("dummy", Dummy)
    assert isinstance(get_provider("dummy"), Dummy)
