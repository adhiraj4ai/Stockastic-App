"""Normalize FinancialReport.fiscal_year to the canonical '0XX-0XX' form.

Seeds and the scraper wrote mixed formats ('2081/82', '082/083', '072-073');
fiscal_year is ordered lexically so mixed formats broke every "latest report"
query. Rows whose normalized key collides with an existing row keep the row
holding more data (non-null eps/net_profit), deleting the other.
"""
from django.db import migrations


def normalize_rows(apps, schema_editor):
    from stocks.utils import normalize_fiscal_year

    FinancialReport = apps.get_model('stocks', 'FinancialReport')

    for report in FinancialReport.objects.all().iterator():
        normalized = normalize_fiscal_year(report.fiscal_year)
        if normalized == report.fiscal_year:
            continue

        collision = FinancialReport.objects.filter(
            ticker=report.ticker,
            fiscal_year=normalized,
            report_type=report.report_type,
            quarter=report.quarter,
        ).exclude(pk=report.pk).first()

        if collision:
            def richness(r):
                return sum(
                    1 for v in (r.eps, r.net_profit, r.book_value, r.balance_sheet, r.profit_loss)
                    if v is not None
                )
            if richness(report) > richness(collision):
                collision.delete()
            else:
                report.delete()
                continue

        report.fiscal_year = normalized
        report.save(update_fields=['fiscal_year'])


class Migration(migrations.Migration):

    dependencies = [
        ('stocks', '0037_notification_severity'),
    ]

    operations = [
        migrations.RunPython(normalize_rows, migrations.RunPython.noop),
    ]
