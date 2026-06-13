# backend/stocks/management/commands/backfill_corporate_actions.py
"""Seed CorporateAction rows from existing Dividend records (bonus shares).

Idempotent: re-running updates factors in place and never duplicates
(unique on ticker/ex_date/action_type).

Usage: python manage.py backfill_corporate_actions [--ticker NABIL] [--dry-run]
"""
from django.core.management.base import BaseCommand

from stocks.models import CorporateAction, Dividend
from stocks.services.backtest_harness.adjustments import bonus_adjustment_factor


class Command(BaseCommand):
    help = "Backfill CorporateAction (BONUS) rows from Dividend records."

    def add_arguments(self, parser):
        parser.add_argument("--ticker", help="Limit to one ticker")
        parser.add_argument("--dry-run", action="store_true")

    def _build_queryset(self, opts):
        qs = Dividend.objects.filter(
            bonus_percent__gt=0, book_close_date__isnull=False
        ).order_by("ticker", "book_close_date")
        if opts.get("ticker"):
            qs = qs.filter(ticker=opts["ticker"])
        return qs

    def _process_dividend(self, div, opts, counters):
        factor = bonus_adjustment_factor(div.bonus_percent)
        if opts["dry_run"]:
            self.stdout.write(
                f"DRY {div.ticker} BONUS {div.bonus_percent}% "
                f"ex={div.book_close_date} factor={factor:.6f}"
            )
            counters["skipped"] += 1
            return
        _, was_created = CorporateAction.objects.update_or_create(
            ticker=div.ticker,
            ex_date=div.book_close_date,
            action_type=CorporateAction.ActionType.BONUS,
            defaults={
                "ratio_percent": div.bonus_percent,
                "adjustment_factor": factor,
                "source": "DIVIDEND_BACKFILL",
            },
        )
        counters["created"] += was_created
        counters["updated"] += not was_created

    def handle(self, *args, **opts):
        qs = self._build_queryset(opts)
        counters = {"created": 0, "updated": 0, "skipped": 0}
        for div in qs:
            self._process_dividend(div, opts, counters)
        self.stdout.write(self.style.SUCCESS(
            f"Done. created={counters['created']} updated={counters['updated']} "
            f"dry_run_rows={counters['skipped']} "
            f"(source dividends with bonus: {qs.count()})"
        ))
