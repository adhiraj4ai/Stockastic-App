"""Tests for notification_service cleanup (SOLID Phase 3a)."""
from unittest.mock import patch, MagicMock
import pytest
from stocks.services.notification_service import (
    create_notification,
    get_latest_price,
    get_latest_day_change,
    SEVERITY_MAP,
)


class TestPublicApiPreserved:
    def test_severity_map_is_dict_with_keys(self):
        assert isinstance(SEVERITY_MAP, dict)
        assert 'INFO' in SEVERITY_MAP or len(SEVERITY_MAP) > 0

    def test_get_latest_price_returns_none_for_nonexistent_ticker(self):
        with patch('stocks.services.notification_service.DailyStockPrice') as MockPrice:
            MockPrice.objects.filter.return_value.order_by.return_value.first.return_value = None
            result = get_latest_price('FAKE_TICKER')
        assert result is None

    def test_get_latest_day_change_returns_none_for_nonexistent_ticker(self):
        with patch('stocks.services.notification_service.DailyStockPrice') as MockPrice:
            MockPrice.objects.filter.return_value.order_by.return_value.first.return_value = None
            result = get_latest_day_change('FAKE_TICKER')
        assert result is None


class TestDeadFunctionsGone:
    def test_check_price_targets_not_in_module(self):
        import stocks.services.notification_service as m
        assert not hasattr(m, 'check_price_targets')

    def test_check_all_users_not_in_module(self):
        import stocks.services.notification_service as m
        assert not hasattr(m, 'check_all_users')

    def test_check_stop_loss_not_in_module(self):
        import stocks.services.notification_service as m
        assert not hasattr(m, 'check_stop_loss')


class TestTriggerCheckViewUsesOrchestrator:
    def test_trigger_check_calls_orchestrator_run(self):
        from django.test import RequestFactory
        from django.contrib.auth import get_user_model
        User = get_user_model()
        user = MagicMock(spec=User)
        user.id = 1
        user.is_authenticated = True

        factory = RequestFactory()
        request = factory.post('/api/stocks/notifications/trigger_check/')
        request.user = user

        with patch('stocks.views.notifications.default_orchestrator') as mock_orch:
            mock_orch.run.return_value = 3
            with patch('stocks.views.notifications.cache') as mock_cache:
                mock_cache.get.return_value = None
                from stocks.views.notifications import NotificationViewSet
                vs = NotificationViewSet()
                vs.request = request
                vs.format_kwarg = None
                vs.kwargs = {}
                response = vs.trigger_check(request)
        mock_orch.run.assert_called_once_with(user)
        assert response.status_code == 200
