"""On-demand per-symbol verdict: the plan engine's confluence/freshness/analogs/
catalysts for ANY symbol, for the ticker page. Sizing is attached by the view
per request (it is user-specific and must stay out of the shared cache)."""
import logging
from datetime import date

from stocks.services.analogs import analog_stats
from stocks.services.catalysts import upcoming_catalysts
from stocks.services.confluence import confluence_score, entry_status
from stocks.services.daily_plan import SELL_SIDE_SOURCES, _signal_age_trading_days
from stocks.services.opportunity_engine import rank_opportunities

logger = logging.getLogger(__name__)


def _load_price_df(symbol):
    """Patchable indirection (same pattern as daily_plan/analogs)."""
    from stocks.services.backtest_harness import load_price_df
    return load_price_df(symbol)


def _sector_intensity_for(symbol):
    """The symbol's sector acc_intensity, or None. Reuses the sector-rotation
    helper restricted to one sector's peers (keeps load bounded)."""
    from stocks.models import Company
    from stocks.views.sector_rotation import _compute_current_acc_signals
    company = Company.objects.filter(symbol=symbol).first()
    if company is None or not company.sector:
        return None
    peers = Company.objects.filter(sector=company.sector).values_list("symbol", flat=True)
    mapping = {s: company.sector for s in peers}
    try:
        per_sector = _compute_current_acc_signals(mapping)
    except Exception:
        logger.exception("sector intensity failed for %s; using neutral", symbol)
        return None
    return (per_sector.get(company.sector) or {}).get("acc_intensity")


def _best_opportunity_row(symbol):
    """Best non-DIVERGENT opportunity row for the symbol, or None."""
    try:
        result = rank_opportunities(symbols=[symbol], limit=10)
    except Exception:
        logger.exception("rank_opportunities failed for %s", symbol)
        return None
    best = None
    for row in result.get("opportunities", []):
        if row.get("trust") == "DIVERGENT":
            continue
        if best is None or (row.get("score") or 0) > (best.get("score") or 0):
            best = row
    return best


def _collect_episodes(active, has_prices, price_df):
    """Build serializable episode list from active SignalEpisode objects."""
    if not has_prices:
        return []
    episodes = []
    for ep in active:
        age = _signal_age_trading_days(price_df, ep.last_signal_date)
        status, _, _ = entry_status(ep.entry_price, age, price_df)
        episodes.append({
            "source": ep.source,
            "direction": ep.direction,
            "entry_price": float(ep.entry_price),
            "strength": ep.entry_strength,
            "age_days": age,
            "status": status,
            "last_signal_date": ep.last_signal_date.isoformat(),
        })
    return episodes


def _build_entry_targets(buy_eps, has_prices, price_df):
    """Return (entry dict, targets dict) for the most-recent BUY episode."""
    empty_targets = {"tp1": None, "sl": None}
    if not buy_eps or not has_prices:
        return None, empty_targets
    anchor = max(buy_eps, key=lambda e: e.last_signal_date)
    age = _signal_age_trading_days(price_df, anchor.last_signal_date)
    status, zone_low, zone_high = entry_status(anchor.entry_price, age, price_df)
    entry = {
        "price": float(anchor.entry_price),
        "zone_low": round(zone_low, 2),
        "zone_high": round(zone_high, 2),
        "status": status,
        "last_signal_age_days": age,
        "latest_close": float(price_df["Close"].iloc[-1]),
    }
    targets = {
        "tp1": float(anchor.target_price) if anchor.target_price else None,
        "sl": float(anchor.stop_loss_price) if anchor.stop_loss_price else None,
    }
    return entry, targets


def build_verdict(symbol):
    """JSON-serializable verdict dict for one symbol (no user data — cacheable)."""
    from stocks.models import SignalEpisode
    symbol = symbol.upper()
    price_df = _load_price_df(symbol)
    has_prices = price_df is not None and not price_df.empty
    active = list(SignalEpisode.objects.filter(end_date__isnull=True, symbol=symbol))
    buy_eps = [e for e in active if e.direction == "BUY" and e.source not in SELL_SIDE_SOURCES]
    sell_sources = {e.source for e in active
                    if not (e.direction == "BUY" and e.source not in SELL_SIDE_SOURCES)}
    episodes = _collect_episodes(active, has_prices, price_df)
    opp_row = _best_opportunity_row(symbol)
    score, components = confluence_score(
        buy_sources={e.source for e in buy_eps},
        sell_sources=sell_sources,
        opportunity_row=opp_row,
        episode_metadatas=[e.metadata for e in buy_eps],
        sector_intensity=_sector_intensity_for(symbol),
    )
    entry, targets = _build_entry_targets(buy_eps, has_prices, price_df)
    catalyst = next((c for c in upcoming_catalysts() if c["symbol"] == symbol), None)
    return {
        "symbol": symbol, "as_of": date.today().isoformat(),
        "confluence_score": score, "components": components,
        "entry": entry, "targets": targets, "episodes": episodes,
        "analog": analog_stats(symbol) if has_prices else None,
        "catalyst": catalyst,
    }
