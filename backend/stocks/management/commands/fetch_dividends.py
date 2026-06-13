"""Scrape per-company dividend history (bonus %, cash %, book-close date) from
ShareSansar and upsert ``Dividend`` rows — the data source for the corporate-
action price-adjustment engine (``backfill_corporate_actions``).

Follows the same scraping pattern as ``fetch_fundamentals``: GET the company
page for the ShareSansar company id + CSRF token, then POST the
``company-dividend`` DataTables endpoint.

Usage:
    python manage.py fetch_dividends --basket            # the 24 evaluation tickers
    python manage.py fetch_dividends --ticker NABIL
    python manage.py fetch_dividends --all               # every active equity
After a run:  python manage.py backfill_corporate_actions
"""
import random
import re
import time
from datetime import datetime
from decimal import Decimal, InvalidOperation

from django.core.management.base import BaseCommand, CommandError
from curl_cffi import requests

from stocks.models import Company, Dividend

_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
_BASE = "https://www.sharesansar.com"


def _dec(value):
    """'10.5263' / '' / None → Decimal (0 for blank/garbage)."""
    if value in (None, ""):
        return Decimal("0")
    try:
        return Decimal(str(value).replace(",", "").strip())
    except (InvalidOperation, ValueError):
        return Decimal("0")


def _parse_book_close(value):
    """'2024-11-25 [Closed]' → date | None."""
    if not value:
        return None
    m = re.match(r"(\d{4}-\d{2}-\d{2})", str(value).strip())
    if not m:
        return None
    return datetime.strptime(m.group(1), "%Y-%m-%d").date()


class Command(BaseCommand):
    help = "Fetch dividend history (bonus/cash %, book-close) from ShareSansar into Dividend rows."

    def add_arguments(self, parser):
        parser.add_argument("--ticker", help="Single ticker")
        parser.add_argument("--basket", action="store_true", help="The pinned evaluation basket")
        parser.add_argument("--all", action="store_true", help="Every active equity (slow)")

    def handle(self, *args, **opts):
        if opts.get("ticker"):
            tickers = [opts["ticker"].upper()]
        elif opts.get("basket"):
            from stocks.services.backtest_harness.basket import DEFAULT_BASKET
            tickers = list(DEFAULT_BASKET)
        elif opts.get("all"):
            tickers = list(Company.objects.values_list("symbol", flat=True))
        else:
            raise CommandError("Provide --ticker, --basket, or --all.")

        session = requests.Session()
        created = updated = skipped = failed = 0

        for idx, ticker in enumerate(tickers):
            self.stdout.write(f"[{idx + 1}/{len(tickers)}] {ticker}...")
            try:
                rows = self._fetch_company_dividends(session, ticker)
            except Exception as exc:  # noqa: BLE001 — one bad company must not kill the run
                self.stdout.write(self.style.WARNING(f"  failed: {exc}"))
                failed += 1
                continue

            for row in rows:
                book_close = _parse_book_close(row.get("bookclose_date"))
                bonus = _dec(row.get("bonus_share"))
                cash = _dec(row.get("cash_dividend"))
                total = _dec(row.get("total_dividend")) or (bonus + cash)
                fiscal_year = (row.get("year") or "").strip()
                if not fiscal_year or (bonus == 0 and cash == 0):
                    skipped += 1
                    continue
                _, was_created = Dividend.objects.update_or_create(
                    ticker=ticker,
                    fiscal_year=fiscal_year,
                    defaults={
                        "bonus_percent": bonus,
                        "cash_percent": cash,
                        "total_percent": total,
                        "book_close_date": book_close,
                    },
                )
                created += was_created
                updated += not was_created

            time.sleep(random.uniform(1.0, 2.5))  # politeness, matches fetch_fundamentals

        self.stdout.write(self.style.SUCCESS(
            f"Done. created={created} updated={updated} skipped(no-dividend-rows)={skipped} "
            f"companies_failed={failed}. Now run: python manage.py backfill_corporate_actions"
        ))

    def _fetch_company_dividends(self, session, ticker):
        """GET company page → companyid + CSRF; POST the DataTables dividend endpoint."""
        page_url = f"{_BASE}/company/{ticker.lower()}"
        resp = session.get(page_url, headers={"User-Agent": _UA}, impersonate="chrome", timeout=15)
        if resp.status_code != 200:
            raise RuntimeError(f"company page HTTP {resp.status_code}")
        html = resp.text

        cid_m = re.search(r'id="companyid"[^>]*>(\d+)</div>', html)
        if not cid_m:
            raise RuntimeError("no companyid on page (delisted or renamed?)")
        tok_m = (re.search(r'<meta name="_token" content="([^"]+)"', html)
                 or re.search(r'name="_token"\s+value="([^"]+)"', html))
        if not tok_m:
            raise RuntimeError("no CSRF token on page")

        headers = {
            "X-CSRF-Token": tok_m.group(1),
            "X-Requested-With": "XMLHttpRequest",
            "Referer": page_url,
            "Origin": _BASE,
        }
        # DataTables server-side endpoint: requires draw/start/length, and the
        # server CAPS length at 50 (length=200 → HTTP 202 with zero rows).
        # Paginate with `start` until a short page signals the end.
        rows, start, page = [], 0, 50
        while True:
            post_resp = session.post(
                f"{_BASE}/company-dividend",
                headers=headers,
                data={"company": cid_m.group(1), "draw": "1",
                      "start": str(start), "length": str(page)},
                impersonate="chrome",
                timeout=15,
            )
            if post_resp.status_code != 200:
                raise RuntimeError(f"dividend endpoint HTTP {post_resp.status_code}")
            batch = post_resp.json().get("data") or []
            rows.extend(batch)
            if len(batch) < page:
                return rows
            start += page
