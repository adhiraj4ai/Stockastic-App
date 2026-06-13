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

    def handle(self, *args, **opts):
        qs = Dividend.objects.filter(
            bonus_percent__gt=0, book_close_date__isnull=False
        ).order_by("ticker", "book_close_date")
        if opts.get("ticker"):
            qs = qs.filter(ticker=opts["ticker"])

        created, updated, skipped = 0, 0, 0
        for div in qs:
            factor = bonus_adjustment_factor(div.bonus_percent)
            if opts["dry_run"]:
                self.stdout.write(
                    f"DRY {div.ticker} BONUS {div.bonus_percent}% "
                    f"ex={div.book_close_date} factor={factor:.6f}"
                )
                skipped += 1
                continue
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
            created += was_created
            updated += not was_created

        self.stdout.write(self.style.SUCCESS(
            f"Done. created={created} updated={updated} dry_run_rows={skipped} "
            f"(source dividends with bonus: {qs.count()})"
        ))
