"""Deterministic prose renderers for the daily plan + per-user actions.

Shared by chat tools and the nightly briefing task. NO LLM calls here —
the text is built straight from the plan payload and overlay dicts.
"""


def render_my_actions(overlay: dict, sizing: dict, picks: list) -> str:
    """Per-user 'what needs my attention' section from user_overlay + sizing."""
    lines: list[str] = []

    positions = (overlay or {}).get("positions_near_action") or []
    if positions:
        lines.append("Positions near action:")
        for p in positions:
            lines.append(f"- {p['ticker']}: close {p['close']:.1f} near {p['near'].replace('_', ' ')}")

    flips = (overlay or {}).get("signal_flips") or []
    if flips:
        lines.append("Signals against your holdings:")
        for f in flips:
            lines.append(f"- {f['symbol']}: {f['source'].replace('_', ' ').title()} active since {f['since']}")

    triggers = (overlay or {}).get("watchlist_triggers") or []
    if triggers:
        lines.append("Watchlist triggers:")
        for w in triggers:
            tgt = f" (entry target {w['target_price']:.1f})" if w.get("target_price") is not None else ""
            lines.append(f"- {w['ticker']}: close {w['close']:.1f}{tgt}")

    sized = [(p, (sizing or {}).get(p.get("symbol"))) for p in (picks or [])]
    sized = [(p, s) for p, s in sized if s]
    if sized:
        lines.append("Sized plan picks (risk-budget based):")
        for p, s in sized:
            lines.append(
                f"- {p['symbol']} ({p['confluence_score']}/100): ≈{s['shares']} shares, "
                f"risks {s['risk_pct']}% of {s['account_name']}"
            )

    if not lines:
        return "Nothing needs your attention tomorrow — no positions near stops/targets, no signals against holdings, no watchlist triggers."
    return "\n".join(lines)
