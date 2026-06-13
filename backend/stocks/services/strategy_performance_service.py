# backend/stocks/services/strategy_performance_service.py
from __future__ import annotations

from typing import Any

from stocks.constants import PROFIT_FACTOR_DEFAULT

_FIELD_ALIASES: dict[str, str] = {
    "direction": "signal",
    "start_date": "generated_date",
    "end_date": "closed_date",
    "entry_price": "ltp",
    "entry_strength": "strength",
}

_FETCH_FIELDS = (
    "id", "source", "symbol", "direction", "status",
    "pnl_percent", "start_date", "end_date",
    "entry_price", "target_price", "stop_loss_price",
    "entry_strength", "signal_tier",
)

_RESOLVED_STATUSES = ("WON", "LOST")
_ALL_STATUSES = ("WON", "LOST", "ACTIVE")
_PNL_BUCKETS = (
    ("< -5%", None, -5),
    ("-5% to -2%", -5, -2),
    ("-2% to 0%", -2, 0),
    ("0% to 2%", 0, 2),
    ("2% to 5%", 2, 5),
    ("5% to 10%", 5, 10),
    ("> 10%", 10, None),
)


def compute_performance_detailed(user) -> dict[str, Any]:
    episodes = _fetch_episodes(user)
    source_groups = _group_by_source(episodes)
    engines: list[dict] = []
    total_profit = total_loss = total_resolved = total_won = 0
    total_signals = len(episodes)

    for source, sigs in source_groups.items():
        stats = _compute_engine_stats(source, sigs)
        engines.append(stats)
        total_profit += sum(float(e["pnl_percent"] or 0) for e in sigs if float(e["pnl_percent"] or 0) > 0)
        total_loss += abs(sum(float(e["pnl_percent"] or 0) for e in sigs if float(e["pnl_percent"] or 0) < 0))
        total_resolved += stats["won"] + stats["lost"]
        total_won += stats["won"]

    engines.sort(key=lambda e: e["profit_factor"], reverse=True)
    return _build_response(
        engines,
        total_signals=total_signals,
        total_resolved=total_resolved,
        total_won=total_won,
        total_profit=total_profit,
        total_loss=total_loss,
    )


def _fetch_episodes(user) -> list[dict]:
    from stocks.models.signal import SignalEpisode
    qs = SignalEpisode.objects.filter(
        status__in=_ALL_STATUSES
    ).values(*_FETCH_FIELDS).order_by("source", "start_date")
    rows = list(qs)
    for row in rows:
        for src_field, canonical in _FIELD_ALIASES.items():
            row[canonical] = row[src_field]
    return rows


def _group_by_source(episodes: list[dict]) -> dict[str, list[dict]]:
    groups: dict[str, list[dict]] = {}
    for ep in episodes:
        groups.setdefault(ep["source"], []).append(ep)
    return groups


def _compute_engine_stats(source: str, episodes: list[dict]) -> dict:
    won = [s for s in episodes if s["status"] == "WON"]
    lost = [s for s in episodes if s["status"] == "LOST"]
    active = [s for s in episodes if s["status"] == "ACTIVE"]
    won_pnls = [float(s["pnl_percent"] or 0) for s in won]
    lost_pnls = [float(s["pnl_percent"] or 0) for s in lost]
    all_pnls = won_pnls + lost_pnls
    n_resolved = len(won) + len(lost)
    win_rate = (len(won) / n_resolved * 100) if n_resolved > 0 else 0.0
    avg_win = sum(won_pnls) / len(won_pnls) if won_pnls else 0.0
    avg_loss = sum(lost_pnls) / len(lost_pnls) if lost_pnls else 0.0
    gross_profit = sum(p for p in all_pnls if p > 0)
    gross_loss = abs(sum(p for p in all_pnls if p < 0))
    profit_factor = _compute_profit_factor(gross_profit, gross_loss)
    wr_dec = win_rate / 100
    expectancy = round((wr_dec * avg_win) + ((1 - wr_dec) * avg_loss), 2) if n_resolved > 0 else 0.0
    max_wins, max_losses = _compute_win_loss_streak(won + lost)
    avg_days = _compute_avg_days(won + lost)
    monthly_perf, consistency = _compute_monthly_perf_and_consistency(won + lost)
    top, worst = _compute_top_worst_symbols(won + lost)
    buy_sell = _compute_buy_sell_stats(episodes)
    return _build_stats_dict(
        source, episodes, won, lost, active,
        win_rate, avg_win, avg_loss, gross_profit, gross_loss,
        profit_factor, expectancy, max_wins, max_losses, avg_days,
        monthly_perf, consistency, all_pnls, buy_sell, top, worst,
    )


def _build_stats_dict(
    source, episodes, won, lost, active,
    win_rate, avg_win, avg_loss, gross_profit, gross_loss,
    profit_factor, expectancy, max_wins, max_losses, avg_days,
    monthly_perf, consistency, all_pnls, buy_sell, top, worst,
) -> dict:
    return {
        "source": source,
        "total": len(episodes),
        "won": len(won), "lost": len(lost), "active": len(active),
        "win_rate": round(win_rate, 1),
        "avg_win_pnl": round(avg_win, 2), "avg_loss_pnl": round(avg_loss, 2),
        "profit_factor": profit_factor, "expectancy": expectancy,
        "max_consecutive_wins": max_wins, "max_consecutive_losses": max_losses,
        "avg_days_to_close": avg_days,
        "best_signal_pnl": round(max(all_pnls), 2) if all_pnls else 0,
        "worst_signal_pnl": round(min(all_pnls), 2) if all_pnls else 0,
        "consistency_score": consistency,
        "monthly_performance": monthly_perf,
        "pnl_distribution": _compute_pnl_buckets(all_pnls),
        "buy_stats": buy_sell["buy"],
        "sell_stats": buy_sell["sell"],
        "top_symbols": top, "worst_symbols": worst,
        "_gross_profit": gross_profit, "_gross_loss": gross_loss,
        "_n_resolved": len(won) + len(lost), "_n_won": len(won),
    }


def _compute_profit_factor(gross_profit: float, gross_loss: float) -> float:
    if gross_loss > 0:
        return round(gross_profit / gross_loss, 2)
    return PROFIT_FACTOR_DEFAULT if gross_profit > 0 else 0


def _compute_win_loss_streak(resolved: list[dict]) -> tuple[int, int]:
    if not resolved:
        return (0, 0)
    sorted_ep = sorted(resolved, key=lambda x: x["generated_date"])
    max_wins = max_losses = cur_wins = cur_losses = 0
    for ep in sorted_ep:
        if ep["status"] == "WON":
            cur_wins += 1
            cur_losses = 0
            max_wins = max(max_wins, cur_wins)
        else:
            cur_losses += 1
            cur_wins = 0
            max_losses = max(max_losses, cur_losses)
    return (max_wins, max_losses)


def _compute_avg_days(resolved: list[dict]) -> float:
    days_list = [
        (ep["closed_date"] - ep["generated_date"]).days
        for ep in resolved
        if ep["generated_date"] and ep["closed_date"]
        and (ep["closed_date"] - ep["generated_date"]).days >= 0
    ]
    return round(sum(days_list) / len(days_list), 1) if days_list else 0


def _compute_monthly_perf_and_consistency(resolved: list[dict]) -> tuple[list[dict], int]:
    monthly_perf = _compute_monthly_perf(resolved)
    profitable = sum(1 for m in monthly_perf if m["pnl"] > 0)
    total_months = len(monthly_perf) or 1
    consistency = round(profitable / total_months * 100)
    return (monthly_perf, consistency)


def _compute_monthly_perf(resolved: list[dict]) -> list[dict]:
    monthly: dict[str, dict] = {}
    for ep in resolved:
        if not ep.get("generated_date"):
            continue
        key = ep["generated_date"].strftime("%Y-%m")
        if key not in monthly:
            monthly[key] = {"won": 0, "lost": 0, "pnl": 0.0}
        monthly[key]["pnl"] += float(ep["pnl_percent"] or 0)
        if ep["status"] == "WON":
            monthly[key]["won"] += 1
        else:
            monthly[key]["lost"] += 1
    sorted_months = sorted(monthly.items(), key=lambda x: x[0], reverse=True)[:6]
    return [
        {"month": m, "won": d["won"], "lost": d["lost"], "pnl": round(d["pnl"], 2)}
        for m, d in reversed(sorted_months)
    ]


def _compute_pnl_buckets(pnls: list[float]) -> dict[str, int]:
    buckets = {label: 0 for label, _, _ in _PNL_BUCKETS}
    for p in pnls:
        for label, low, high in _PNL_BUCKETS:
            if (low is None or p >= low) and (high is None or p < high):
                buckets[label] += 1
                break
    return buckets


def _compute_buy_sell_stats(episodes: list[dict]) -> dict[str, dict]:
    result = {}
    for direction in ("BUY", "SELL"):
        key = direction.lower()
        sigs = [e for e in episodes if e.get("signal") == direction]
        won = sum(1 for e in sigs if e["status"] == "WON")
        lost = sum(1 for e in sigs if e["status"] == "LOST")
        active = sum(1 for e in sigs if e["status"] == "ACTIVE")
        resolved = won + lost
        result[key] = {
            "total": len(sigs), "won": won, "lost": lost, "active": active,
            "win_rate": round(won / resolved * 100, 1) if resolved > 0 else 0,
        }
    return result


def _compute_top_worst_symbols(resolved: list[dict]) -> tuple[list[str], list[str]]:
    sym_pnl: dict[str, dict] = {}
    for ep in resolved:
        sym = ep["symbol"]
        if sym not in sym_pnl:
            sym_pnl[sym] = {"pnl": 0.0, "count": 0}
        sym_pnl[sym]["pnl"] += float(ep["pnl_percent"] or 0)
        sym_pnl[sym]["count"] += 1
    sorted_syms = sorted(sym_pnl.items(), key=lambda x: x[1]["pnl"], reverse=True)
    top = [s for s, d in sorted_syms[:5] if d["pnl"] > 0]
    worst = [s for s, d in sorted_syms[-5:] if d["pnl"] < 0]
    return (top, worst)


def _build_response(
    engines: list[dict],
    *,
    total_signals: int,
    total_resolved: int,
    total_won: int,
    total_profit: float,
    total_loss: float,
) -> dict[str, Any]:
    overall_wr = round(total_won / total_resolved * 100, 1) if total_resolved > 0 else 0
    best_engine = engines[0]["source"] if engines else None
    worst_engine = engines[-1]["source"] if engines else None
    return {
        "engines": engines,
        "overall": {
            "total_signals": total_signals,
            "total_resolved": total_resolved,
            "overall_win_rate": overall_wr,
            "total_profit_pnl": round(total_profit, 2),
            "total_loss_pnl": round(-total_loss, 2),
            "net_pnl": round(total_profit - total_loss, 2),
            "best_engine": best_engine,
            "worst_engine": worst_engine,
        },
    }
