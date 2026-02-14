import pytest
from django.urls import reverse
from rest_framework import status
from stocks.models import Portfolio, PortfolioAccount

@pytest.mark.django_db
class TestPortfolioAPI:
    def test_create_portfolio(self, auth_client):
        url = reverse('portfolio-list')
        data = {'name': 'Retirement Fund', 'description': 'Long term savings'}
        response = auth_client.post(url, data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['name'] == 'Retirement Fund'

    def test_get_portfolios(self, auth_client, create_user):
        # Create a portfolio for the user (assuming auth_client user is created in fixture)
        # We need to get the user instance first. 
        # In a real scenario, we'd use the model directly or via API.
        url = reverse('portfolio-list')
        auth_client.post(url, {'name': 'Test Portfolio'})
        
        response = auth_client.get(url)
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1

    def test_create_account(self, auth_client):
        p_response = auth_client.post(reverse('portfolio-list'), {'name': 'P1'})
        portfolio_id = p_response.data['id']
        
        url = reverse('portfolio-accounts-list')
        data = {
            'portfolio': portfolio_id,
            'broker_name': 'TMS',
            'account_number': '12345',
            'broker_code': '58',
            'initial_balance': 100000
        }
        response = auth_client.post(url, data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['broker_code'] == '58'

    def test_create_transaction(self, auth_client):
        # Setup: Create Portfolio -> Account
        p_response = auth_client.post(reverse('portfolio-list'), {'name': 'P1'})
        portfolio_id = p_response.data['id']
        
        a_response = auth_client.post(reverse('portfolio-accounts-list'), {
            'portfolio': portfolio_id,
            'broker_name': 'TMS',
            'account_number': '12345',
            'broker_code': '58',
            'initial_balance': 100000
        })
        account_id = a_response.data['id']

        # Create Transaction
        url = reverse('portfolio-transactions-list')
        data = {
            'portfolio': portfolio_id,
            'account': account_id,
            'ticker': 'NABIL',
            'transaction_type': 'BUY',
            'quantity': 10,
            'rate': 500,
            'transaction_date': '2024-01-01T12:00:00Z' # Models use DateTimeField
        }
        response = auth_client.post(url, data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['ticker'] == 'NABIL'

    def test_portfolio_optimize_empty(self, auth_client):
        url = reverse('portfolio-optimize')
        response = auth_client.get(url)
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "Portfolio is empty" in response.data['error']

    def test_calculate_position_size(self, auth_client):
        url = reverse('portfolio-calculate-position-size')
        data = {
            'entry_price': 500,
            'stop_loss_price': 450,
            'risk_percentage': 2.0
        }
        response = auth_client.post(url, data, format='json')
        assert response.status_code == status.HTTP_200_OK
        assert 'position_size' in response.data

    def test_delete_transaction(self, auth_client):
        # Create txn
        p_response = auth_client.post(reverse('portfolio-list'), {'name': 'P1'})
        a_response = auth_client.post(reverse('portfolio-accounts-list'), {
            'portfolio': p_response.data['id'], 'broker_name': 'B1', 'account_number': '1', 'initial_balance': 100
        })
        t_response = auth_client.post(reverse('portfolio-transactions-list'), {
            'portfolio': p_response.data['id'], 'account': a_response.data['id'],
            'ticker': 'NABIL', 'transaction_type': 'BUY', 'quantity': 10, 'rate': 500,
            'transaction_date': '2024-01-01T12:00:00Z'
        })
        txn_id = t_response.data['id']
        
        url = reverse('portfolio-transactions-detail', kwargs={'pk': txn_id})
        response = auth_client.delete(url)
        assert response.status_code == status.HTTP_204_NO_CONTENT
