"""Provider selection. Swapping the external data source is: register a class
here + set NEPSE_API_PROVIDER. No other code changes."""
from __future__ import annotations

from django.conf import settings

from .contracts import MarketDataProvider
from .providers.nepse_api import NepseApiProvider

_REGISTRY: dict[str, type] = {
    "nepseapi": NepseApiProvider,
}


def register_provider(name: str, cls: type) -> None:
    _REGISTRY[name] = cls


def get_provider(name: str | None = None) -> MarketDataProvider:
    key = name or getattr(settings, "NEPSE_API_PROVIDER", "nepseapi")
    try:
        cls = _REGISTRY[key]
    except KeyError:
        raise ValueError(
            f"Unknown market-data provider '{key}'. Registered: {sorted(_REGISTRY)}"
        )
    return cls()
