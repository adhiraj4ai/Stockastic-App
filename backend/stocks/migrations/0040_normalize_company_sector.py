"""Normalize Company.sector to canonical NEPSE spellings.

NEPSE's company master returns aliases that differ only in casing/spacing
(e.g. 'HYDROPOWER' vs 'Hydro Power'). The financials page keys its sector
filter off exact template names, so aliased rows were silently dropped from
the listing. Ingestion now canonicalises on write; this backfills existing
rows. Historical models use a plain manager, so every row is visited.
"""
from django.db import migrations


def normalize_company_sectors(apps, schema_editor):
    from stocks.services.market_data.sectors import normalize_sector

    Company = apps.get_model('stocks', 'Company')

    # companies is an externally-managed table; skip when it has not been
    # provisioned yet (e.g. a fresh test database before fixtures create it).
    if Company._meta.db_table not in schema_editor.connection.introspection.table_names():
        return

    for company in Company.objects.all().iterator():
        canonical = normalize_sector(company.sector)
        if canonical != company.sector:
            company.sector = canonical
            company.save(update_fields=['sector'])


class Migration(migrations.Migration):

    dependencies = [
        ('stocks', '0039_extended_fundamental_metrics'),
    ]

    operations = [
        migrations.RunPython(normalize_company_sectors, migrations.RunPython.noop),
    ]
