import re
from datetime import datetime
from decimal import Decimal
from django.core.management.base import BaseCommand
from stocks.models import DailyIndexValue
from curl_cffi import requests

_INDEX_URL = "https://merolagani.com/Indices.aspx"
_INDEX_PATTERN = re.compile(
    r'<td class="text-center[^>]*>(\d+)</td>\s*'
    r'<td class="text-center[^>]*>(\d{4}/\d{2}/\d{2})</td>\s*'
    r'<td class="text-right[^>]*>([\d\.,\-]+)</td>\s*'
    r'<td class="text-right[^>]*>([\d\.,\-]+)</td>\s*'
    r'<td class="text-right[^>]*>([\d\.,\-]+)%</td>'
)
_UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
       "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")


class Command(BaseCommand):
    help = 'Scrapes the daily NEPSE Index values from MeroLagani Indices page'

    def _fetch_html(self):
        resp = requests.get(_INDEX_URL, headers={"User-Agent": _UA}, impersonate="chrome", timeout=15)
        if resp.status_code != 200:
            self.stdout.write(self.style.ERROR(f"Failed to fetch indices. Status code: {resp.status_code}"))
            return None
        return resp.text

    def _upsert_row(self, m):
        parsed_date = datetime.strptime(m[1].replace("/", "-"), "%Y-%m-%d").date()
        _, created = DailyIndexValue.objects.update_or_create(
            index_name="NEPSE Index",
            date=parsed_date,
            defaults={
                "value": Decimal(m[2].replace(",", "")),
                "change": Decimal(m[3].replace(",", "")),
                "change_percent": Decimal(m[4].replace(",", "")),
            },
        )
        return created

    def handle(self, *args, **options):
        self.stdout.write(f"Fetching indices from {_INDEX_URL}...")
        try:
            html = self._fetch_html()
            if html is None:
                return
            matches = _INDEX_PATTERN.findall(html)
            self.stdout.write(f"Parsed {len(matches)} rows from page HTML.")
            created_count = sum(1 for m in matches if self._upsert_row(m))
            updated_count = len(matches) - created_count
            self.stdout.write(self.style.SUCCESS(
                f"Successfully scraped indices: {created_count} created, {updated_count} updated."
            ))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Error scraping indices: {e}"))
