"""Shared utilities for all chat tool modules."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from stocks.models.portfolio import PortfolioAccount

from chat._user_context import push_card


_SCOPE_RANK: dict[str, int] = {"SYMBOL": 3, "SECTOR": 2, "ALL": 1, "DEFAULT": 0}


def _jsonable(value: Any) -> Any:
    """Recursively coerce Decimals, dates, and other Django values to JSON-safe types."""
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
    return value


def _result(
    text: str,
    *,
    card: dict | None = None,
    is_error: bool = False,
    _tool_name: str = "",
) -> dict:
    """Build the SDK tool-result shape and side-channel the card."""
    if card is not None:
        push_card(_tool_name, _jsonable(card))
    return {
        "content": [{"type": "text", "text": text}],
        "is_error": is_error,
    }


def _resolve_account(user, account_id: str | int | None) -> PortfolioAccount | None:
    if account_id in (None, "", "all"):
        return None
    try:
        return PortfolioAccount.objects.get(id=int(account_id), user=user)
    except (PortfolioAccount.DoesNotExist, ValueError, TypeError):
        return None


def _enrich_strategy_signal(s) -> dict:
    scope = (s.metadata or {}).get("optimization_scope", "DEFAULT")
    return {
        "strategy": s.strategy.name if s.strategy else "",
        "strategy_id": s.strategy.id if s.strategy else None,
        "signal": s.direction,
        "date": s.start_date.isoformat(),
        "last_close": float(s.entry_price) if s.entry_price else None,
        "pnl_pct": float(s.strategy.pnl_percent or 0) if s.strategy else 0,
        "win_rate": float(s.strategy.win_rate or 0) if s.strategy else 0,
        "sharpe": float(s.strategy.sharpe_ratio or 0) if s.strategy else 0,
        "max_drawdown": float(s.strategy.max_drawdown or 0) if s.strategy else 0,
        "best_objective": (s.strategy.best_objective or "balanced") if s.strategy else "balanced",
        "optimization_scope": scope,
    }


def _rank_strategy_signals(strat_signals: list) -> tuple[list[dict], str | None]:
    """Enrich SignalEpisode objects with strategy performance metrics and rank them."""
    enriched = [_enrich_strategy_signal(s) for s in strat_signals]
    enriched.sort(
        key=lambda x: (
            _SCOPE_RANK.get(x["optimization_scope"], 0),
            x["win_rate"],
            x["sharpe"],
            x["pnl_pct"],
        ),
        reverse=True,
    )
    best = enriched[0]["strategy"] if enriched else None
    return enriched, best


def score_candidate(
    *, expected_return_pct, win_rate, concentration_pct, health_score
):
    """Manager Scorecard: blend return, win rate, and risk into a 0–100 score."""
    ret = max(-20.0, min(40.0, float(expected_return_pct)))
    ret_norm = (ret + 20.0) / 60.0
    wr_norm = max(0.0, min(100.0, float(win_rate))) / 100.0
    health_norm = max(0.0, min(100.0, float(health_score))) / 100.0

    score = (0.45 * ret_norm + 0.40 * wr_norm + 0.15 * health_norm) * 100.0

    conc = max(0.0, float(concentration_pct))
    if conc > 25.0:
        score -= min(30.0, (conc - 25.0))
    return max(0.0, min(100.0, score))
