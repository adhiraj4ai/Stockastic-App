"""
Regression test: POST /api/stocks/transactions/ must persist settlement_date
for paper-account BUY transactions (T+2 gate).

RED  → settlement_date is NULL (bug)
GREEN → settlement_date is non-NULL after fix
"""
import pytest
from decimal import Decimal
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from stocks.models.portfolio import PortfolioAccount, AccountType, PortfolioTransaction

pytestmark = pytest.mark.django_db
User = get_user_model()

TRANSACTIONS_URL = '/api/stocks/transactions/'


def _paper_account(user, balance='100000'):
    return PortfolioAccount.objects.create(
        user=user,
        name='paper',
        account_type=AccountType.PAPER,
        balance=Decimal(balance),
    )


def test_paper_buy_via_rest_persists_settlement_date():
    user = User.objects.create_user(username='settle_test', password='pass')
    account = _paper_account(user)

    client = APIClient()
    client.force_authenticate(user=user)

    payload = {
        'ticker': 'NABIL',
        'transaction_type': 'BUY',
        'quantity': 10,
        'rate': '500.00',
        'account': account.pk,
        'transaction_date': '2026-06-26',
    }

    response = client.post(TRANSACTIONS_URL, payload, format='json')
    assert response.status_code == 201, response.data

    txn = PortfolioTransaction.objects.get(pk=response.data['id'])
    assert txn.settlement_date is not None, (
        'settlement_date must be set for paper-account BUY (T+2); got NULL'
    )
