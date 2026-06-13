"""Backtest strategies over the evaluation basket and score them vs buy-and-hold.

Examples:
    # baseline snapshot of every strategy in the DB
    python manage.py backtest_basket --all --baseline --out backtest_reports/baseline

    # one strategy on a custom symbol set
    python manage.py backtest_basket --strategy "RsiBollingerReversion" --symbols NABIL,NICA

    # out-of-sample evaluation (last 30% of each series)
    python manage.py backtest_basket --all --oos-fraction 0.3 --out backtest_reports/oos
"""

import os

from django.core.management.base import BaseCommand, CommandError

from stocks.models import Strategy
from stocks.services.backtest_harness import (
    DEFAULT_BASKET,
    load_basket,
    evaluate_over_basket,
    write_report,
)


class Command(BaseCommand):
    help = "Backtest strategies across the basket and score them against buy-and-hold."

    def add_arguments(self, parser):
        parser.add_argument("--strategy", type=str, help="Strategy name (exact) to evaluate.")
        parser.add_argument("--all", action="store_true", help="Evaluate every Strategy in the DB.")
        parser.add_argument("--symbols", type=str, help="Comma-separated tickers (default: pinned basket).")
        parser.add_argument("--oos-fraction", type=float, default=None,
                            help="Evaluate only the last fraction of each series (e.g. 0.3).")
        parser.add_argument("--out", type=str, default=None, help="Output directory for report files.")
        parser.add_argument("--baseline", action="store_true", help="Label this run as the pre-upgrade baseline.")

    def _resolve_strategies(self, opts):
        if opts["all"]:
            return list(Strategy.objects.all().order_by("id"))
        strategies = list(Strategy.objects.filter(name=opts["strategy"]))
        if not strategies:
            raise CommandError(f"No strategy named '{opts['strategy']}'.")
        return strategies

    def _resolve_basket(self, opts):
        names = [s.strip() for s in opts["symbols"].split(",")] if opts["symbols"] else None
        basket, dropped = load_basket(names)
        if dropped:
            self.stdout.write(self.style.WARNING(
                f"Dropped {len(dropped)} thin tickers: " + ", ".join(f"{t}({n})" for t, n in dropped)
            ))
        if not basket:
            raise CommandError("No usable tickers in basket.")
        return basket

    def _evaluate_strategy(self, s, basket, opts):
        card = evaluate_over_basket(s, basket, oos_fraction=opts["oos_fraction"], strategy_name=s.name)
        verdict = self.style.SUCCESS("PASS") if card.passed else self.style.ERROR("FAIL")
        a = card.aggregates
        self.stdout.write(
            f"  [{verdict}] {s.name:<34} "
            f"excess={a.get('median_excess_return_pct', '—')}%  "
            f"sortino={a.get('median_strategy_sortino', '—')}  "
            f"trades={a.get('median_trades', '—')}  "
            f"ok={a.get('symbols_ok', 0)}/{a.get('symbols_total', 0)}"
        )
        return card

    def _write_report_if_requested(self, cards, opts):
        if not opts["out"]:
            return
        label = "baseline" if opts["baseline"] else None
        out_dir = opts["out"]
        if not os.path.isabs(out_dir):
            out_dir = os.path.join(os.getcwd(), out_dir)
        paths = write_report(cards, out_dir, label=label)
        self.stdout.write(self.style.SUCCESS(f"Report written: {paths['md']}"))

    def handle(self, *args, **opts):
        if not opts["all"] and not opts["strategy"]:
            raise CommandError("Provide --strategy <name> or --all.")
        strategies = self._resolve_strategies(opts)
        basket = self._resolve_basket(opts)
        self.stdout.write(
            f"Evaluating {len(strategies)} strateg{'y' if len(strategies) == 1 else 'ies'} "
            f"over {len(basket)} symbols"
            + (f" (OOS last {opts['oos_fraction']:.0%})" if opts["oos_fraction"] else "")
            + "..."
        )
        cards = [self._evaluate_strategy(s, basket, opts) for s in strategies]
        passed = sum(1 for c in cards if c.passed)
        self.stdout.write("")
        self.stdout.write(f"Summary: {passed}/{len(cards)} passed the basket bar.")
        self._write_report_if_requested(cards, opts)
