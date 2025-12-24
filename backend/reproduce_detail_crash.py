import os
import django
from django.conf import settings

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'stockastic.settings')
django.setup()

from stocks.models import StockFundamental
from stocks.serializers import StockFundamentalSerializer
from stocks.views import _enrich_fundamental_data

def test_scope_logic():
    print("Testing Scope Logic...")
    
    ticker = "UNKNOWN_SYMBOL"
    fundamental_data = None
    # fundamental variable not initialized here
    
    try:
        # Simulate DoesNotExist
        raise Exception("DoesNotExist")
        fundamental = "Should not be reached"
    except Exception:
        fundamental_data = None
        
    try:
        # Simulate usage in response
        print(f"Passing variable: {fundamental}")
    except UnboundLocalError as e:
        print(f"CRASH VERIFIED: {e}")
    except NameError as e:
        print(f"CRASH VERIFIED: {e}")

if __name__ == '__main__':
    test_scope_logic()
