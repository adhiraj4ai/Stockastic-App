# backend/stocks/management/commands/rank_strategies.py
"""Rank every strategy on the basket with multiple-testing-aware significance.

For each strategy: economic pass (5-verdict scorecard) + pooled win-rate CI +
bootstrap p-value that its edge differs from zero. Benjamini-Hochberg across the
whole family yields q-values; ``survives_fdr`` marks strategies whose edge holds
up after correcting for having tried many. Output ranks by (survives_fdr,
economic pass, median excess return).

Usage: python manage.py rank_strategies [--alpha 0.05] [--out <dir>]
"""
import json
import os

from django.core.management.base import BaseCommand

from stocks.models import Strategy
from stocks.services.backtest_harness import load_basket, evaluate_over_basket
from stocks.services.backtest_harness.statistics import benjamini_hochberg


class Command(BaseCommand):
    help = "Rank strategies on the basket with FDR-corrected significance."

    def add_arguments(self, parser):
        parser.add_argument("--alpha", type=float, default=0.05)
        parser.add_argument("--out", type=str, default=None)

    def handle(self, *args, **opts):
        basket, dropped = load_basket()
        if dropped:
            self.stdout.write(self.style.WARNING(
                f"Dropped {len(dropped)} thin tickers: " + ", ".join(t for t, _ in dropped)
            ))
        strategies = list(Strategy.objects.all().order_by("id"))
        rows = []
        for s in strategies:
            card = evaluate_over_basket(s, basket, strategy_name=s.name)
            c = card.confidence or {}
            rows.append({
                "name": s.name,
                "passed": card.passed,
                "median_excess_return_pct": card.aggregates.get("median_excess_return_pct"),
                "pooled_win_rate": c.get("pooled_win_rate"),
                "win_rate_ci": c.get("win_rate_ci"),
                "win_rate_reportable": c.get("win_rate_reportable"),
                "pvalue": c.get("excess_pvalue", 1.0),
                "total_trades": c.get("total_trades", 0),
            })

        rejected, qvals = benjamini_hochberg([r["pvalue"] for r in rows], alpha=opts["alpha"])
        for r, rej, q in zip(rows, rejected, qvals):
            r["survives_fdr"] = bool(rej)
            r["qvalue"] = round(q, 4)

        rows.sort(key=lambda r: (
            not r["survives_fdr"], not r["passed"],
            -(r["median_excess_return_pct"] or -1e9),
        ))

        self.stdout.write(f"\n{'Strategy':<34} pass fdr  medExc%   winRate(CI)         q")
        for r in rows:
            wr = (f"{r['pooled_win_rate']:.0f}% "
                  f"[{r['win_rate_ci'][0]*100:.0f}-{r['win_rate_ci'][1]*100:.0f}]"
                  if r["win_rate_reportable"] else "(low-n)")
            self.stdout.write(
                f"{r['name'][:33]:<34} "
                f"{'Y' if r['passed'] else '.'}    "
                f"{'Y' if r['survives_fdr'] else '.'}   "
                f"{(r['median_excess_return_pct'] or 0):>7.1f}  {wr:<18} {r['qvalue']}"
            )
        survivors = sum(1 for r in rows if r["survives_fdr"])
        self.stdout.write(self.style.SUCCESS(
            f"\n{survivors}/{len(rows)} survive FDR@{opts['alpha']}; "
            f"{sum(1 for r in rows if r['passed'])}/{len(rows)} pass the economic bar."
        ))

        if opts["out"]:
            os.makedirs(opts["out"], exist_ok=True)
            with open(os.path.join(opts["out"], "ranking.json"), "w") as f:
                json.dump(rows, f, indent=2)
            self.stdout.write(f"Wrote {opts['out']}/ranking.json")
