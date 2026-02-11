import os
import django
from rest_framework.test import APIRequestFactory
from stocks.views.market import CompanyViewSet

# Setup is handled by manage.py shell, but just in case
# os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
# django.setup()

factory = APIRequestFactory()
view = CompanyViewSet.as_view({'get': 'broker_favorites'})

print("--- Test 1: Full List Request (No Pagination Params) ---")
# Only broker is required now. Range defaults to 3M.
request = factory.get('/?broker=58&range=3M')
response = view(request)
print(f"Status: {response.status_code}")
if response.status_code == 200:
    data = response.data
    # Expecting a list directly
    if isinstance(data, list):
        print(f"Response is a list with {len(data)} items.")
        if data:
            first = data[0]
            print(f"First Item Keys: {list(first.keys())}")
            print(f"Has Net Amount: {'net_amount' in first}")
            print(f"Net Amount Value: {first.get('net_amount')}")
            print(f"Qty Value: {first.get('qty_accumulated')}")
            print(f"LTP: {first.get('ltp')}, ROC: {first.get('roc')}")
    else:
        print(f"Response is NOT a list. Type: {type(data)}")
        print(f"Keys: {list(data.keys()) if isinstance(data, dict) else 'N/A'}")
else:
    print(f"Error: {response.data}")
