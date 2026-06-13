from dataclasses import dataclass, field
from typing import Protocol, List, runtime_checkable


@dataclass
class Alert:
    notification_type: str
    title: str
    message: str
    redirect_url: str
    ticker: str | None = None
    portfolio_item_id: int | None = None
    watchlist_item_id: int | None = None
    metadata: dict = field(default_factory=dict)
    severity: str | None = None


@runtime_checkable
class IAlertChecker(Protocol):
    def check(self, user) -> List[Alert]:
        ...
