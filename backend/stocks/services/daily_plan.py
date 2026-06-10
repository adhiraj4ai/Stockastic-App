"""Builds the precomputed Next-Day Trading Plan and the per-user overlay.

Global plan: one DailyTradingPlan row per next trading date, generated nightly
after signal generation. Overlay: cheap read-time queries per user.
"""
import logging
from datetime import date, timedelta
from collections import defaultdict

import pandas as pd

from stocks.services.market_regime import current_regime
from stocks.services.opportunity_engine import rank_opportunities
from stocks.services.confluence import confluence_score, entry_status
from stocks.services.analogs import analog_stats
from stocks.services.catalysts import upcoming_catalysts

logger = logging.getLogger(__name__)

MAX_PICKS = 5
SELL_SIDE_SOURCES = {"DISTRIBUTION_ALERT"}  # SELL-direction episodes also count as conflicts


def next_trading_date(after):
    """Next NEPSE session strictly after `after` (NEPSE closed Friday & Saturday)."""
    d = after + timedelta(days=1)
    while d.weekday() in (4, 5):  # Fri=4, Sat=5
        d += timedelta(days=1)
    return d


def _load_price_df(symbol):
    """Indirection over backtest_harness.load_price_df (patchable in tests)."""
    from stocks.services.backtest_harness import load_price_df
    return load_price_df(symbol)


def _sector_intensities():
    """symbol -> sector acc_intensity, via the sector-rotation helper."""
    from stocks.models import Company
    from stocks.views.sector_rotation import _compute_current_acc_signals
    mapping = defaultdict(list)
    for symbol, sector in Company.objects.exclude(sector="").values_list("symbol", "sector"):
        mapping[sector].append(symbol)
    try:
        per_sector = _compute_current_acc_signals(dict(mapping))
    except Exception:
        logger.exception("sector intensity computation failed; using neutral")
        return {}
    out = {}
    for sector, info in per_sector.items():
        for symbol in mapping.get(sector, []):
            out[symbol] = info.get("acc_intensity")
    return out


def _signal_age_trading_days(price_df, last_signal_date):
    """Trading days elapsed since the signal, measured on the symbol's own bars."""
    ts = pd.Timestamp(last_signal_date)
    return int((price_df.index > ts).sum())


def _market_context(as_of):
    from stocks.models import DailyMarketSummary
    summary = DailyMarketSummary.objects.filter(date__lte=as_of).order_by("-date").first()
    if not summary:
        return {}
    return {
        "as_of": summary.date.isoformat(),
        "total_turnover": float(summary.total_turnover or 0),
        "total_volume": float(summary.total_volume or 0),
    }


def build_daily_plan(as_of=None):
    """Build and upsert the plan. `as_of` = latest completed session (default: latest price date)."""
    from stocks.models import DailyStockPrice, DailyTradingPlan, SignalEpisode

    if as_of is None:
        latest = DailyStockPrice.objects.order_by("-date").values_list("date", flat=True).first()
        if latest is None:
            raise ValueError("no price data; cannot build plan")
        as_of = latest

    regime_info = current_regime(as_of=as_of)
    opp_result = rank_opportunities(limit=50)
    opp_by_symbol = {}
    for row in opp_result.get("opportunities", []):
        if row.get("trust") == "DIVERGENT":
            continue  # spec: DIVERGENT never feeds a pick
        cur = opp_by_symbol.get(row["symbol"])
        if cur is None or (row.get("score") or 0) > (cur.get("score") or 0):
            opp_by_symbol[row["symbol"]] = row

    active = SignalEpisode.objects.filter(end_date__isnull=True)
    buy_eps, sell_sources = defaultdict(list), defaultdict(set)
    for ep in active:
        if ep.direction == "BUY" and ep.source not in SELL_SIDE_SOURCES:
            buy_eps[ep.symbol].append(ep)
        else:
            sell_sources[ep.symbol].add(ep.source)

    sector_by_symbol = _sector_intensities()

    candidates = []
    for symbol, eps in buy_eps.items():
        price_df = _load_price_df(symbol)
        if price_df is None or price_df.empty:
            continue
        price_df = price_df.loc[: pd.Timestamp(as_of)]
        if price_df.empty:
            continue
        score, components = confluence_score(
            buy_sources={e.source for e in eps},
            sell_sources=sell_sources.get(symbol, set()),
            opportunity_row=opp_by_symbol.get(symbol),
            episode_metadatas=[e.metadata for e in eps],
            sector_intensity=sector_by_symbol.get(symbol),
        )
        anchor = max(eps, key=lambda e: e.last_signal_date)  # freshest episode anchors the entry
        age = _signal_age_trading_days(price_df, anchor.last_signal_date)
        status, zone_low, zone_high = entry_status(anchor.entry_price, age, price_df)
        candidates.append({
            "symbol": symbol,
            "direction": "BUY",
            "confluence_score": score,
            "components": components,
            "entry": {
                "price": float(anchor.entry_price),
                "zone_low": round(zone_low, 2),
                "zone_high": round(zone_high, 2),
                "status": status,
                "last_signal_age_days": age,
                "latest_close": float(price_df["Close"].iloc[-1]),
            },
            "targets": {
                "tp1": float(anchor.target_price) if anchor.target_price else None,
                "sl": float(anchor.stop_loss_price) if anchor.stop_loss_price else None,
            },
            "analog": None,
            "catalyst": None,
        })

    candidates.sort(key=lambda c: -c["confluence_score"])
    in_zone = [c for c in candidates if c["entry"]["status"] == "IN_ZONE"]
    picks = in_zone[:MAX_PICKS]
    others = [c for c in candidates if c not in picks]

    catalysts = upcoming_catalysts(as_of=as_of)
    catalyst_by_symbol = {c["symbol"]: c for c in catalysts}
    for pick in picks:
        pick["analog"] = analog_stats(pick["symbol"], as_of=as_of)
        pick["catalyst"] = catalyst_by_symbol.get(pick["symbol"])

    exits = [
        {"symbol": row["symbol"], "producer": row.get("producer"), "close": row.get("close")}
        for row in opp_result.get("exits", [])
    ]

    plan_date = next_trading_date(as_of)
    plan, _created = DailyTradingPlan.objects.update_or_create(
        date=plan_date,
        defaults={
            "regime": regime_info.get("regime", "UNKNOWN"),
            "breadth": regime_info.get("breadth"),
            "payload": {
                "as_of": as_of.isoformat(),
                "picks": picks,
                "watch": others[:10],  # remaining candidates (overflow IN_ZONE beyond top-5, plus EXTENDED/STALE)
                "exits": exits,
                "catalysts": catalysts,
                "market_context": _market_context(as_of),
            },
        },
    )
    return plan
