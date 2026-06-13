"""Write basket scorecards to machine-readable JSON + human-readable markdown."""

import json
import os
from datetime import datetime

__all__ = ["write_report"]


def _fail_reasons(card):
    return [k for k, v in card.verdicts.items() if not v]


def _sort_cards(scorecards):
    """Return scorecards sorted worst-first (failures, then by median excess return)."""
    return sorted(scorecards, key=lambda c: (c.passed, c.aggregates.get("median_excess_return_pct", -1e9)))


def _build_payload(cards, label):
    """Build the JSON-serializable summary payload from a sorted card list."""
    return {
        "label": label,
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "total": len(cards),
        "passed": sum(1 for c in cards if c.passed),
        "failed": sum(1 for c in cards if not c.passed),
        "strategies": [c.to_dict() for c in cards],
    }


def _md_table_row(i, c):
    """Render one markdown table row for a scorecard."""
    a = c.aggregates
    verdict = "PASS" if c.passed else "FAIL"
    reasons = "" if c.passed else ", ".join(_fail_reasons(c))
    return (
        f"| {i} | {c.strategy_name} | {verdict} | "
        f"{a.get('median_excess_return_pct', '-')} | "
        f"{a.get('median_strategy_sortino', '-')} | "
        f"{a.get('median_strategy_return_over_dd', '-')} | "
        f"{a.get('median_buyhold_return_over_dd', '-')} | "
        f"{a.get('median_trades', '-')} | "
        f"{a.get('symbols_ok', 0)}/{a.get('symbols_total', 0)} | {reasons} |"
    )


def _build_md_lines(cards, payload):
    """Build all markdown lines for the summary report."""
    label = payload["label"]
    lines = [
        f"# Backtest Basket Report{f' - {label}' if label else ''}",
        "",
        f"Generated: {payload['generated_at']}",
        f"Strategies: {payload['total']}  |  Passed: {payload['passed']}  |  Failed: {payload['failed']}",
        "",
        "| # | Strategy | Verdict | Med Excess % | Med Sortino | Med Ret/DD | BH Ret/DD | Med Trades | OK/Total | Fail reasons |",
        "|---|----------|---------|-------------:|------------:|-----------:|----------:|-----------:|:--------:|--------------|",
    ]
    for i, c in enumerate(cards, 1):
        lines.append(_md_table_row(i, c))
    lines.append("")
    erroring = [c for c in cards if c.errors]
    if erroring:
        lines += ["## Symbol-level errors", ""]
        for c in erroring:
            lines.append(f"### {c.strategy_name}")
            for sym, err in c.errors:
                lines.append(f"- `{sym}`: {err}")
            lines.append("")
    return lines


def write_report(scorecards, out_dir, label=None):
    """Write summary.json and summary.md for a list of ScoreCards.

    Sorted worst-first (failures, then by median excess return) so the most
    broken strategies are at the top - the point of the baseline snapshot.
    """
    os.makedirs(out_dir, exist_ok=True)
    cards = _sort_cards(scorecards)
    payload = _build_payload(cards, label)
    json_path = os.path.join(out_dir, "summary.json")
    with open(json_path, "w") as f:
        json.dump(payload, f, indent=2)
    md_lines = _build_md_lines(cards, payload)
    md_path = os.path.join(out_dir, "summary.md")
    with open(md_path, "w") as f:
        f.write("\n".join(md_lines))
    return {"json": json_path, "md": md_path}
