"""Deterministic prose renderers for the daily plan + per-user actions.

Shared by chat tools and the nightly briefing task. NO LLM calls here —
the text is built straight from the plan payload and overlay dicts.
"""


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

    # Picks section
    if picks:
        lines.append("Top setups (confluence-ranked):")
        for i, p in enumerate(picks, 1):
            sym = p.get("symbol", "?")
            score = p.get("confluence_score") or 0
            entry = p.get("entry") or {}
            targets = p.get("targets") or {}
            status = entry.get("status", "")
            zl = entry.get("zone_low")
            zh = entry.get("zone_high")
            close = entry.get("latest_close")
            tp = targets.get("tp1")
            sl = targets.get("sl")

            zone_str = (f"entry zone {zl:.1f}–{zh:.1f}" if zl is not None and zh is not None else "no zone")
            close_str = (f" (close {close:.0f})" if close is not None else "")
            tp_sl_str = ""
            if tp is not None and sl is not None:
                tp_sl_str = f", TP {tp:.0f} / SL {sl:.0f}"
            elif tp is not None:
                tp_sl_str = f", TP {tp:.0f}"
            elif sl is not None:
                tp_sl_str = f", SL {sl:.0f}"

            status_tag = f" [{status}]" if status else ""
            line = f"{i}. {sym} — {score}/100{status_tag}, {zone_str}{close_str}{tp_sl_str}"

            analog = p.get("analog")
            if analog:
                n = analog.get("n")
                med3d = analog.get("fwd_3d_median_pct")
                wr = analog.get("win_rate_3d")
                if n and med3d is not None:
                    wr_str = f", {wr*100:.0f}% win" if wr is not None else ""
                    line += f"; similar setups (n={n}): {med3d:+.1f}% median 3d{wr_str}"

            catalyst = p.get("catalyst")
            if catalyst:
                line += f"; catalyst: {catalyst.get('type', '')} in {catalyst.get('days_away', '?')}d"

            lines.append(line)
    else:
        lines.append("No qualifying setups — consider sitting out.")

    # Watch section (top 5)
    if watch:
        watch_items = watch[:5]
        watch_parts = [
            f"{w.get('symbol')} ({w.get('confluence_score')}, {(w.get('entry') or {}).get('status', '?')})"
            for w in watch_items
        ]
        lines.append(f"Watch (not actionable yet): {', '.join(watch_parts)}")

    # Catalysts section (top 8)
    if catalysts:
        cat_lines = []
        for c in catalysts[:8]:
            sym = c.get("symbol", "?")
            ctype = c.get("type", "")
            days = c.get("days_away", "?")
            detail = c.get("detail", "")
            cat_lines.append(f"{sym} {ctype.lower().replace('_', ' ')} in {days}d ({detail})")
        lines.append("Catalysts next 14d: " + "; ".join(cat_lines))

    return "\n".join(lines)


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
