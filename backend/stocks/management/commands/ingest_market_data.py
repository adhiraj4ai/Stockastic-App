"""Pull market data from the configured provider and ingest it, per-dataset.

Each dataset is isolated: a failure (transport or schema drift) in one does not
block the others. Existing data is untouched on failure.

    python manage.py ingest_market_data --datasets prices,floorsheet,summary,companies,indices --date 2026-06-10
"""
from __future__ import annotations

from datetime import date, datetime

from django.core.management.base import BaseCommand

from stocks.services.market_data.contracts import ProviderError
from stocks.services.market_data.factory import get_provider
from stocks.services.market_data.ingestion import IngestionService

ALL_DATASETS = ["prices", "floorsheet", "summary", "companies", "indices"]


class Command(BaseCommand):
    help = "Ingest market data from the configured external provider."

    def add_arguments(self, parser):
        parser.add_argument("--datasets", default=",".join(ALL_DATASETS))
        parser.add_argument("--date", default=None)
        parser.add_argument("--provider", default=None)

    def handle(self, *args, **opts):
        on = (
            datetime.strptime(opts["date"], "%Y-%m-%d").date()
            if opts["date"] else date.today()
        )
        datasets = [d.strip() for d in opts["datasets"].split(",") if d.strip()]
        provider = get_provider(opts["provider"])
        svc = IngestionService()
        self.stdout.write(f"Provider: {provider.name} | date: {on} | datasets: {datasets}")

        total_saved = 0
        any_ok = False
        for ds in datasets:
            try:
                if ds == "prices":
                    res = svc.ingest_prices(provider.fetch_daily_prices(on))
                elif ds == "floorsheet":
                    res = svc.ingest_floorsheet(provider.fetch_floorsheet(on))
                elif ds == "summary":
                    res = svc.ingest_market_summary(provider.fetch_market_summary(on))
                elif ds == "companies":
                    res = svc.ingest_companies(provider.fetch_company_list())
                elif ds == "indices":
                    res = svc.ingest_indices(provider.fetch_indices(on))
                else:
                    self.stdout.write(f"  {ds}: SKIPPED (unknown dataset)")
                    continue
                any_ok = True
                total_saved += res.total
                self.stdout.write(
                    f"  {ds}: OK — inserted={res.inserted} updated={res.updated} "
                    f"rejected={res.rejected}"
                )
            except ProviderError as e:
                self.stdout.write(f"  {ds}: FAILED — {type(e).__name__}: {e}")
            except Exception as e:  # noqa: BLE001 — isolate unexpected per-dataset errors
                self.stdout.write(f"  {ds}: FAILED — {type(e).__name__}: {e}")

        self.stdout.write(f"Total records saved: {total_saved}")
        if not any_ok:
            # Non-zero exit only when EVERY dataset failed.
            raise SystemExit(1)
