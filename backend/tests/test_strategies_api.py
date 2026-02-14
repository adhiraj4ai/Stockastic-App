import pytest
from django.urls import reverse
from rest_framework import status

@pytest.mark.django_db
class TestStrategiesAPI:
    def test_create_strategy(self, auth_client):
        url = reverse('strategies-list')
        data = {
            'name': 'My Strategy',
            'description': 'Test Strat',
            'parameters': {'ma_period': 20}
        }
        response = auth_client.post(url, data)
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['name'] == 'My Strategy'

    def test_get_strategies(self, auth_client):
        url = reverse('strategies-list')
        response = auth_client.get(url)
        assert response.status_code == status.HTTP_200_OK

    def test_publish_strategy(self, auth_client):
        # Create strategy
        s_res = auth_client.post(reverse('strategies-list'), {
            'name': 'S1', 'description': 'desc', 'code': 'class S(Strategy): pass'
        })
        strat_id = s_res.data['id']
        
        # Create experiment for it
        from stocks.models import StrategyExperiment, ScopeType
        exp = StrategyExperiment.objects.create(
            strategy_id=strat_id,
            user=auth_client.user if hasattr(auth_client, 'user') else None, # Fixture doesn't attach user to client usually unless customized
            # Actually our auth_client fixture logs in, so we might need to get user from DB
            user_id=1, # Mock or get actual
            run_type='BACKTEST',
            scope_type=ScopeType.SYMBOL,
            scope_value='NABIL',
            start_date='2024-01-01',
            end_date='2024-01-31'
        )
        
        url = reverse('strategies-publish', kwargs={'pk': strat_id})
        response = auth_client.post(url, {'experiment_id': exp.id})
        assert response.status_code == status.HTTP_200_OK

    def test_strategy_recommendations(self, auth_client):
        url = reverse('strategies-recommendations')
        response = auth_client.get(url)
        assert response.status_code == status.HTTP_200_OK

    def test_strategy_backtest(self, auth_client):
        s_res = auth_client.post(reverse('strategies-list'), {
            'name': 'S2', 'description': 'desc', 'code': 'class S(Strategy): pass'
        })
        url = reverse('strategies-backtest', kwargs={'pk': s_res.data['id']})
        response = auth_client.post(url, {'symbol': 'NABIL'})
        # Might return 400 if no data, but status should be handled
        assert response.status_code in [status.HTTP_200_OK, status.HTTP_400_BAD_REQUEST]

    def test_strategy_signals_list(self, auth_client):
        url = reverse('strategy-signals-list')
        response = auth_client.get(url)
        assert response.status_code == status.HTTP_200_OK

    def test_strategy_signals_tracking(self, auth_client):
        url = reverse('strategy-signals-tracking')
        response = auth_client.get(url)
        assert response.status_code == status.HTTP_200_OK
