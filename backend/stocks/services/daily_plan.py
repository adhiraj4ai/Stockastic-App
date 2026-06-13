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


def _company_sector_pairs():
    """Return (symbol, sector) pairs for all companies with a known sector."""
    from stocks.models import Company
    return Company.objects.exclude(sector="").values_list("symbol", "sector")


def _sector_intensities():
    """symbol → sector acc_intensity, via the sector-rotation helper."""
    from stocks.views.sector_rotation import _compute_current_acc_signals
    symbol_to_sector = {
        symbol: sector
        for symbol, sector in _company_sector_pairs()
    }
    if not symbol_to_sector:
        return {}
    try:
        per_sector = _compute_current_acc_signals(symbol_to_sector)
    except Exception:
        logger.exception("sector intensity computation failed; using neutral")
        return {}
    return {
        symbol: (per_sector.get(sector) or {}).get("acc_intensity")
        for symbol, sector in symbol_to_sector.items()
    }


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
    entry_statuses = {c["symbol"]: c["entry"]["status"] for c in candidates}
    in_zone = [c for c in candidates if c["entry"]["status"] == "IN_ZONE"]
    picks = in_zone[:MAX_PICKS]
    others = [c for c in candidates if c not in picks]

    catalysts = upcoming_catalysts(as_of=as_of)
    # reversed: catalysts are date-ascending, so the nearest one wins per symbol
    catalyst_by_symbol = {c["symbol"]: c for c in reversed(catalysts)}
    for pick in picks:
        pick["analog"] = analog_stats(pick["symbol"], as_of=as_of)
        pick["catalyst"] = catalyst_by_symbol.get(pick["symbol"])

    exits = [
        {"symbol": row["symbol"], "producer": row.get("producer"), "close": row.get("close")}
        for row in opp_result.get("exits", [])
    ]

    plan_date = next_trading_date(as_of)
    existing = DailyTradingPlan.objects.filter(date=plan_date).first()
    regenerated = existing is None or existing.payload.get("as_of") != as_of.isoformat()
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
                "entry_statuses": entry_statuses,
            },
        },
    )
    plan.was_regenerated = regenerated  # transient flag for the nightly task (holiday guard)
    return plan


NEAR_PCT = 0.02  # "within 2%" per spec


def _latest_closes(tickers):
    """ticker → latest close (float) for the given tickers."""
    from stocks.models import DailyStockPrice
    out = {}
    for t in set(tickers):
        row = (DailyStockPrice.objects.filter(ticker=t, close__isnull=False)
               .order_by("-date").values_list("close", flat=True).first())
        if row is not None:
            out[t] = float(row)
    return out


def _near(close, level):
    return level is not None and float(level) > 0 and abs(close - float(level)) / float(level) <= NEAR_PCT


def user_overlay(user):
    """Per-user actions for tomorrow. Cheap indexed queries; safe for read-time use.

    Watchlist semantics: target_price is a desired BUY-ENTRY level, so it triggers
    when close <= target (price came down to entry level) OR proximity within 2% of
    either level.
    """
    from stocks.models import PortfolioItem, SignalEpisode, WatchlistItem

    items = list(PortfolioItem.objects.filter(user=user))
    watch = list(WatchlistItem.objects.filter(user=user))
    closes = _latest_closes([i.ticker for i in items] + [w.ticker for w in watch]) if (items or watch) else {}

    positions = []
    for item in items:
        close = closes.get(item.ticker)
        if close is None:
            continue
        near = None
        if _near(close, item.stop_loss_price) or (
            item.stop_loss_price is not None and close <= float(item.stop_loss_price)
        ):
            near = "STOP_LOSS"
        else:
            for level, label in ((item.target_price, "TP1"), (item.target_price_2, "TP2"),
                                 (item.target_price_3, "TP3")):
                if _near(close, level) or (level is not None and close >= float(level)):
                    near = label
                    break
        if near:
            positions.append({"ticker": item.ticker, "near": near, "close": close,
                              "stop_loss_price": float(item.stop_loss_price) if item.stop_loss_price else None,
                              "target_price": float(item.target_price) if item.target_price else None})

    held = {i.ticker for i in items}
    flips = [
        {"symbol": ep.symbol, "source": ep.source, "since": ep.start_date.isoformat(),
         "strength": ep.entry_strength}
        for ep in SignalEpisode.objects.filter(
            end_date__isnull=True, direction="SELL", symbol__in=held)
    ]

    triggers = []
    for w in watch:
        close = closes.get(w.ticker)
        if close is None:
            continue
        if (_near(close, w.target_price) or _near(close, w.stop_loss_price)
                or (w.target_price is not None and close <= float(w.target_price))):
            triggers.append({"ticker": w.ticker, "close": close,
                             "target_price": float(w.target_price) if w.target_price else None,
                             "stop_loss_price": float(w.stop_loss_price) if w.stop_loss_price else None})

    return {"positions_near_action": positions, "signal_flips": flips,
            "watchlist_triggers": triggers}
