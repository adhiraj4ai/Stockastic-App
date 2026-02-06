import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'stockastic.settings')
django.setup()

from stocks.models import Company

total = Company.all_objects.count()
equities = Company.objects.count()
filtered = total - equities

print(f"Total companies (all_objects): {total}")
print(f"Equity companies (objects): {equities}")
print(f"Filtered out: {filtered}")

# Show some examples of filtered companies
print("\nExamples of filtered companies:")
filtered_companies = Company.all_objects.exclude(
    pk__in=Company.objects.values_list('symbol', flat=True)
)[:5]

for company in filtered_companies:
    print(f"  - {company.symbol}: {company.name} ({company.instrument_type})")
