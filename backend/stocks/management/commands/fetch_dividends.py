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

    def _resolve_tickers(self, opts):
        if opts.get("ticker"):
            return [opts["ticker"].upper()]
        if opts.get("basket"):
            from stocks.services.backtest_harness.basket import DEFAULT_BASKET
            return list(DEFAULT_BASKET)
        if opts.get("all"):
            return list(Company.objects.values_list("symbol", flat=True))
        raise CommandError("Provide --ticker, --basket, or --all.")

    def _upsert_dividend_row(self, ticker, row, counters):
        bonus = _dec(row.get("bonus_share"))
        cash = _dec(row.get("cash_dividend"))
        total = _dec(row.get("total_dividend")) or (bonus + cash)
        fiscal_year = (row.get("year") or "").strip()
        if not fiscal_year or (bonus == 0 and cash == 0):
            counters["skipped"] += 1
            return
        _, was_created = Dividend.objects.update_or_create(
            ticker=ticker,
            fiscal_year=fiscal_year,
            defaults={
                "bonus_percent": bonus,
                "cash_percent": cash,
                "total_percent": total,
                "book_close_date": _parse_book_close(row.get("bookclose_date")),
            },
        )
        counters["created"] += was_created
        counters["updated"] += not was_created

    def handle(self, *args, **opts):
        tickers = self._resolve_tickers(opts)
        session = requests.Session()
        counters = {"created": 0, "updated": 0, "skipped": 0, "failed": 0}
        for idx, ticker in enumerate(tickers):
            self.stdout.write(f"[{idx + 1}/{len(tickers)}] {ticker}...")
            try:
                rows = self._fetch_company_dividends(session, ticker)
            except Exception as exc:  # noqa: BLE001
                self.stdout.write(self.style.WARNING(f"  failed: {exc}"))
                counters["failed"] += 1
                continue
            for row in rows:
                self._upsert_dividend_row(ticker, row, counters)
            time.sleep(random.uniform(1.0, 2.5))
        self.stdout.write(self.style.SUCCESS(
            f"Done. created={counters['created']} updated={counters['updated']} "
            f"skipped(no-dividend-rows)={counters['skipped']} "
            f"companies_failed={counters['failed']}. "
            f"Now run: python manage.py backfill_corporate_actions"
        ))

    def _parse_company_page(self, session, page_url):
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
        return cid_m.group(1), tok_m.group(1)

    def _paginate_dividend_endpoint(self, session, company_id, headers):
        """Paginate DataTables endpoint (server CAPs length at 50)."""
        rows, start, page = [], 0, 50
        while True:
            post_resp = session.post(
                f"{_BASE}/company-dividend",
                headers=headers,
                data={"company": company_id, "draw": "1",
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

    def _fetch_company_dividends(self, session, ticker):
        """GET company page → companyid + CSRF; POST the DataTables dividend endpoint."""
        page_url = f"{_BASE}/company/{ticker.lower()}"
        company_id, csrf_token = self._parse_company_page(session, page_url)
        headers = {
            "X-CSRF-Token": csrf_token,
            "X-Requested-With": "XMLHttpRequest",
            "Referer": page_url,
            "Origin": _BASE,
        }
        return self._paginate_dividend_endpoint(session, company_id, headers)
