from __future__ import annotations
from dataclasses import dataclass, field
from typing import Protocol, runtime_checkable
from django.contrib.auth.models import User


@dataclass
class Alert:
    notification_type: str
    title: str
    message: str
    ticker: str | None = None
    redirect_url: str | None = None
    portfolio_item_id: int | None = None
    watchlist_item_id: int | None = None
    metadata: dict = field(default_factory=dict)
    severity: str | None = None


@runtime_checkable
class IAlertChecker(Protocol):
    def check(self, user: User) -> list[Alert]:
        ...
