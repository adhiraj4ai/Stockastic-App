"""Capture real NepseAPI responses into test fixtures.

Run once (against the configured NEPSE_API_BASE_URL) to record ground-truth
JSON, then verify the provider FIELD_MAPs against the captured keys:

    python manage.py capture_nepse_fixtures
"""
import json
import os

import requests
from django.conf import settings
from django.core.management.base import BaseCommand

ENDPOINTS = {
    "price_volume": "/PriceVolume",
    "summary": "/Summary",
    "top_gainers": "/TopGainers",
    "top_losers": "/TopLosers",
    "company_list": "/CompanyList",
    "nepse_index": "/NepseIndex",
    "floorsheet": "/Floorsheet",
}

FIXTURE_DIR = os.path.join(
    settings.BASE_DIR, "stocks", "tests", "fixtures", "nepse"
)


class Command(BaseCommand):
    help = "Capture live NepseAPI responses into test fixtures."

    def handle(self, *args, **options):
        os.makedirs(FIXTURE_DIR, exist_ok=True)
        base = settings.NEPSE_API_BASE_URL.rstrip("/")
        headers = {"User-Agent": "Stockastic/1.0", "Accept": "application/json"}
        for name, path in ENDPOINTS.items():
            url = f"{base}{path}"
            try:
                resp = requests.get(url, headers=headers, timeout=settings.NEPSE_API_TIMEOUT)
                resp.raise_for_status()
                payload = resp.json()
            except Exception as e:  # noqa: BLE001 - capture utility, log and continue
                self.stderr.write(f"FAILED {name} ({url}): {e}")
                continue
            out = os.path.join(FIXTURE_DIR, f"{name}.json")
            with open(out, "w") as fh:
                json.dump(payload, fh, indent=2)
            keys = sorted(payload[0].keys()) if isinstance(payload, list) and payload else (
                sorted(payload.keys()) if isinstance(payload, dict) else "(scalar/list)"
            )
            self.stdout.write(f"Saved {name}: top-level keys = {keys}")
        self.stdout.write("Fixture capture complete.")
