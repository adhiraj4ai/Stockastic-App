"""Deterministic prose renderers for the daily plan + per-user actions.

Shared by chat tools and the nightly briefing task. NO LLM calls here —
the text is built straight from the plan payload and overlay dicts.
"""


def _format_tp_sl(tp, sl) -> str:
    """Format TP/SL annotation string."""
    if tp is not None and sl is not None:
        return f", TP {tp:.0f} / SL {sl:.0f}"
    if tp is not None:
        return f", TP {tp:.0f}"
    if sl is not None:
        return f", SL {sl:.0f}"
    return ""


def _format_pick_line(i: int, p: dict) -> str:
    """Format a single pick into a briefing line."""
    sym = p.get("symbol", "?")
    score = p.get("confluence_score") or 0
    entry = p.get("entry") or {}
    targets = p.get("targets") or {}
    status = entry.get("status", "")
    zl, zh = entry.get("zone_low"), entry.get("zone_high")
    close = entry.get("latest_close")
    tp, sl = targets.get("tp1"), targets.get("sl")

    zone_str = f"entry zone {zl:.1f}–{zh:.1f}" if zl is not None and zh is not None else "no zone"
    close_str = f" (close {close:.0f})" if close is not None else ""
    status_tag = f" [{status}]" if status else ""
    line = f"{i}. {sym} — {score}/100{status_tag}, {zone_str}{close_str}{_format_tp_sl(tp, sl)}"

    analog = p.get("analog")
    if analog:
        n, med3d, wr = analog.get("n"), analog.get("fwd_3d_median_pct"), analog.get("win_rate_3d")
        if n and med3d is not None:
            wr_str = f", {wr*100:.0f}% win" if wr is not None else ""
            line += f"; similar setups (n={n}): {med3d:+.1f}% median 3d{wr_str}"

    catalyst = p.get("catalyst")
    if catalyst:
        line += f"; catalyst: {catalyst.get('type', '')} in {catalyst.get('days_away', '?')}d"
    return line


def _picks_section(picks: list) -> list[str]:
    """Render the picks section lines."""
    if not picks:
        return ["No qualifying setups — consider sitting out."]
    lines = ["Top setups (confluence-ranked):"]
    lines += [_format_pick_line(i, p) for i, p in enumerate(picks, 1)]
    return lines


def _watch_section(watch: list) -> list[str]:
    """Render the watch section lines (top 5)."""
    if not watch:
        return []
    parts = [
        f"{w.get('symbol')} ({w.get('confluence_score')}, {(w.get('entry') or {}).get('status', '?')})"
        for w in watch[:5]
    ]
    return [f"Watch (not actionable yet): {', '.join(parts)}"]


def _catalysts_section(catalysts: list) -> list[str]:
    """Render the catalysts section lines (top 8)."""
    if not catalysts:
        return []
    cat_lines = [
        f"{c.get('symbol', '?')} {c.get('type', '').lower().replace('_', ' ')} in {c.get('days_away', '?')}d ({c.get('detail', '')})"
        for c in catalysts[:8]
    ]
    return ["Catalysts next 14d: " + "; ".join(cat_lines)]


def render_plan_briefing(plan) -> str:
    """Render the daily trading plan into briefing prose.

    Accepts any object with ``.date`` / ``.regime`` / ``.breadth`` / ``.payload``.
    """
    payload = plan.payload or {}
    picks = payload.get("picks") or []
    watch = payload.get("watch") or []
    catalysts = payload.get("catalysts") or []

    breadth_pct = f"{plan.breadth * 100:.0f}%" if plan.breadth is not None else "n/a"
    lines = [f"Plan for {plan.date} (regime {plan.regime}, breadth {breadth_pct}):"]
    lines += _picks_section(picks)
    lines += _watch_section(watch)
    lines += _catalysts_section(catalysts)
    return "\n".join(lines)


def _positions_lines(overlay: dict) -> list[str]:
    positions = (overlay or {}).get("positions_near_action") or []
    if not positions:
        return []
    out = ["Positions near action:"]
    out += [f"- {p['ticker']}: close {p['close']:.1f} near {p['near'].replace('_', ' ')}" for p in positions]
    return out


def _flips_lines(overlay: dict) -> list[str]:
    flips = (overlay or {}).get("signal_flips") or []
    if not flips:
        return []
    out = ["Signals against your holdings:"]
    out += [f"- {f['symbol']}: {f['source'].replace('_', ' ').title()} active since {f['since']}" for f in flips]
    return out


def _triggers_lines(overlay: dict) -> list[str]:
    triggers = (overlay or {}).get("watchlist_triggers") or []
    if not triggers:
        return []
    out = ["Watchlist triggers:"]
    for w in triggers:
        tgt = f" (entry target {w['target_price']:.1f})" if w.get("target_price") is not None else ""
        out.append(f"- {w['ticker']}: close {w['close']:.1f}{tgt}")
    return out


def _sized_lines(picks: list, sizing: dict) -> list[str]:
    sized = [(p, (sizing or {}).get(p.get("symbol"))) for p in (picks or [])]
    sized = [(p, s) for p, s in sized if s]
    if not sized:
        return []
    out = ["Sized plan picks (risk-budget based):"]
    out += [
        f"- {p['symbol']} ({p['confluence_score']}/100): ≈{s['shares']} shares, risks {s['risk_pct']}% of {s['account_name']}"
        for p, s in sized
    ]
    return out


def render_my_actions(overlay: dict, sizing: dict, picks: list) -> str:
    """Per-user 'what needs my attention' section from user_overlay + sizing."""
    lines: list[str] = (
        _positions_lines(overlay)
        + _flips_lines(overlay)
        + _triggers_lines(overlay)
        + _sized_lines(picks, sizing)
    )
    if not lines:
        return "Nothing needs your attention tomorrow — no positions near stops/targets, no signals against holdings, no watchlist triggers."
    return "\n".join(lines)
