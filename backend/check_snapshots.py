
import os
import django
import sys
sys.path.append('/app')
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "stockastic.settings")
django.setup()

from stocks.models import PortfolioSnapshot
from django.contrib.auth.models import User

print("Checking PortfolioSnapshot data...")
count = PortfolioSnapshot.objects.count()
print(f"Total Snapshots: {count}")

if count > 0:
    first = PortfolioSnapshot.objects.first()
    print(f"First Snapshot: User={first.user.username}, Date={first.date}, Value={first.total_value}")
    
    users = User.objects.all()
    for u in users:
        c = PortfolioSnapshot.objects.filter(user=u).count()
        print(f"User {u.username}: {c} snapshots")
else:
    print("NO DATA FOUND")
