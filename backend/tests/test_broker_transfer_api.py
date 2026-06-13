import pytest
from django.urls import reverse
from rest_framework import status
from stocks.models import DailyFloorsheet
from decimal import Decimal
import datetime

def _seed_nabil_transfer_floorsheet():
    """Seed two NABIL floorsheet rows representing a broker-transfer pair."""
    DailyFloorsheet.objects.create(
        transaction_id="TX1",
        transaction_date="2024-01-01",
        symbol="NABIL",
        buyer_id="58",
        seller_id="42",
        transaction_quantity=100,
        transaction_rate=Decimal("500"),
        transaction_amount=Decimal("50000"),
    )
    DailyFloorsheet.objects.create(
        transaction_id="TX2",
        transaction_date="2024-01-02",
        symbol="NABIL",
        buyer_id="42",
        seller_id="58",
        transaction_quantity=150,
        transaction_rate=Decimal("510"),
        transaction_amount=Decimal("76500"),
    )


def _assert_nabil_transfer_summary(data):
    """Assert expected aggregates for the seeded NABIL transfer pair."""
    assert data['summary']['total_volume'] == 250
    assert data['summary']['total_amount'] == 126500
    assert data['summary']['total_transactions'] == 2
    assert len(data['daily_stats']) == 2
    assert len(data['transactions']) == 2


@pytest.mark.django_db
class TestBrokerTransferAPI:
    def test_broker_transfer_success(self, auth_client):
        _seed_nabil_transfer_floorsheet()

        url = reverse('floorsheet-analytics-broker-transfer')
        response = auth_client.get(url, {
            'symbol': 'NABIL',
            'broker1': '58',
            'broker2': '42',
            'start_date': '2024-01-01',
            'end_date': '2024-01-02',
        })

        assert response.status_code == status.HTTP_200_OK
        _assert_nabil_transfer_summary(response.data)

    def test_broker_transfer_missing_params(self, auth_client):
        url = reverse('floorsheet-analytics-broker-transfer')
        response = auth_client.get(url, {'symbol': 'NABIL'})
        assert response.status_code == status.HTTP_400_BAD_REQUEST
