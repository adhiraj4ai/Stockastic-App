import os
import django
import json
from django.test import RequestFactory
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'stockastic.settings')
os.environ['DB_PORT'] = '5432'
django.setup()

from stocks.views.pipeline import PipelineViewSet

def test_pipeline_endpoints():
    factory = RequestFactory()
    viewset = PipelineViewSet.as_view({
        'get': 'history',
        'post': 'upload_floorsheet',
    })
    
    print("Testing /history/...")
    request = factory.get('/api/stocks/pipeline/history/')
    response = PipelineViewSet.as_view({'get': 'history'})(request)
    print(f"Status: {response.status_code}")
    assert response.status_code == 200
    
    print("\nTesting /upload_floorsheet/...")
    dummy_data = [
        {
            "contractId": 2026012005032577,
            "stockSymbol": "TEST",
            "buyerMemberId": 1,
            "sellerMemberId": 2,
            "contractQuantity": 100,
            "contractRate": 500.0,
            "contractAmount": 50000.0,
            "businessDate": "2026-02-05",
            "tradeBookId": 9999,
            "stockId": 1,
            "tradeTime": "2026-02-05T12:00:00"
        }
    ]
    file_content = json.dumps(dummy_data).encode('utf-8')
    uploaded_file = SimpleUploadedFile("floorsheet.json", file_content, content_type="application/json")
    
    request = factory.post('/api/stocks/pipeline/upload_floorsheet/', {'file': uploaded_file}, format='multipart')
    response = PipelineViewSet.as_view({'post': 'upload_floorsheet'})(request)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.data}")
    assert response.status_code == 200

    print("\nTesting /trigger_indicators_stream/...")
    request = factory.get('/api/stocks/pipeline/trigger_indicators_stream/')
    response = PipelineViewSet.as_view({'get': 'trigger_indicators_stream'})(request)
    print(f"Status: {response.status_code}")
    assert response.status_code == 200
    assert response['Content-Type'] == 'text/event-stream'

    print("\nTesting /optimize_strategies_stream/...")
    request = factory.get('/api/stocks/pipeline/optimize_strategies_stream/', {'all_symbols': 'true'})
    response = PipelineViewSet.as_view({'get': 'optimize_strategies_stream'})(request)
    print(f"Status: {response.status_code}")
    assert response.status_code == 200

    print("\nTesting /daily_prices/...")
    price_csv = "Symbol,Open,High,Low,Close,Volume\nTEST,100,110,90,105,\"1,000\""
    uploaded_csv = SimpleUploadedFile("prices.csv", price_csv.encode('utf-8'), content_type="text/csv")
    request = factory.post('/api/stocks/pipeline/daily_prices/', {'file': uploaded_csv, 'date': '2026-02-05'})
    response = PipelineViewSet.as_view({'post': 'daily_prices'})(request)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.data}")
    assert response.status_code == 200

    print("\nTesting /fetch_daily_prices_from_github/...")
    request = factory.post('/api/stocks/pipeline/fetch_daily_prices_from_github/', {'date': '2026-01-20'})
    response = PipelineViewSet.as_view({'post': 'fetch_daily_prices_from_github'})(request)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.data}")
    assert response.status_code == 200

    print("\nAll tests passed!")

if __name__ == "__main__":
    try:
        test_pipeline_endpoints()
    except Exception as e:
        print(f"\nTest failed: {e}")
        import traceback
        traceback.print_exc()
