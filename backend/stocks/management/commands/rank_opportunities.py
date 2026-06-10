"""Rank today's NEPSE opportunities (validated, regime-tagged).

Usage: python manage.py rank_opportunities [--symbols NABIL,API] [--limit 30] [--out <dir>]
"""
import json
import os
from django.core.management.base import BaseCommand
from stocks.services.opportunity_engine import rank_opportunities


class Command(BaseCommand):
    help = "Rank today's opportunities by validated fee-net expectancy."

    def add_arguments(self, parser):
        parser.add_argument("--symbols", type=str, default=None)
        parser.add_argument("--limit", type=int, default=30)
        parser.add_argument("--out", type=str, default=None)

    def handle(self, *args, **opts):
        syms = [s.strip() for s in opts["symbols"].split(",")] if opts["symbols"] else None
        result = rank_opportunities(symbols=syms, limit=opts["limit"])
        reg = result["regime"]
        self.stdout.write(
            f"\nMarket regime: {reg['regime']} (breadth {reg['breadth']}) as of {reg['as_of']}\n"
        )
        self.stdout.write(
            f"{'Producer':<22}{'Sym':<8}{'Dir':<5}{'Exp%':>7} {'p':>6} {'trust':<12}{'liveWR':>7}"
        )
        for o in result["opportunities"]:
            self.stdout.write(
                f"{str(o['producer'])[:21]:<22}{o['symbol']:<8}{o['direction']:<5}"
                f"{(o['expectancy'] * 100):>7.2f} {o['pvalue']:>6.3f} {o['trust']:<12}"
                f"{(o['live_win_rate'] * 100):>6.0f}%"
            )
        self.stdout.write(
            self.style.SUCCESS(
                f"\n{len(result['opportunities'])} opportunities ({reg['regime']})."
            )
        )
        if opts["out"]:
            os.makedirs(opts["out"], exist_ok=True)
            out_path = os.path.join(opts["out"], "opportunities.json")
            with open(out_path, "w") as f:
                json.dump(result, f, indent=2, default=str)
            self.stdout.write(f"Wrote {opts['out']}/opportunities.json")
