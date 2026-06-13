"""Tests for SignalGenerationService helper extraction (SOLID Phase 3a)."""
from datetime import date
from unittest.mock import patch, MagicMock
import pytest
from stocks.services.signal_generation_service import SignalGenerationService


class TestBuildPriceLevels:
    def test_returns_empty_dict_when_ltp_zero(self):
        assert SignalGenerationService._build_price_levels({'signal': 'BUY'}, 0) == {}

    def test_returns_empty_dict_when_ltp_negative(self):
        assert SignalGenerationService._build_price_levels({'signal': 'BUY'}, -5) == {}

    def test_buy_signal_uses_wac_stop_loss_when_wac_valid(self):
        sig = {'signal': 'BUY', 'metadata': {'top_broker_wac': 90}}
        result = SignalGenerationService._build_price_levels(sig, 100)
        assert result['sl'] == round(90 * 0.98, 2)
        assert result['tp1'] == round(100 * 1.05, 2)
        assert result['tp2'] == round(100 * 1.10, 2)
        assert result['tp3'] == round(100 * 1.15, 2)

    def test_buy_signal_uses_ltp_stop_loss_when_wac_zero(self):
        sig = {'signal': 'BUY', 'metadata': {'top_broker_wac': 0}}
        result = SignalGenerationService._build_price_levels(sig, 100)
        assert result['sl'] == round(100 * 0.95, 2)

    def test_buy_signal_uses_ltp_stop_loss_when_wac_above_ltp(self):
        sig = {'signal': 'BUY', 'metadata': {'top_broker_wac': 120}}
        result = SignalGenerationService._build_price_levels(sig, 100)
        assert result['sl'] == round(100 * 0.95, 2)

    def test_sell_signal_returns_downside_targets(self):
        sig = {'signal': 'SELL'}
        result = SignalGenerationService._build_price_levels(sig, 100)
        assert result['tp1'] == round(100 * 0.95, 2)
        assert result['tp2'] == round(100 * 0.90, 2)
        assert result['tp3'] == round(100 * 0.85, 2)
        assert result['sl'] == round(100 * 1.05, 2)

    def test_hold_signal_returns_empty_dict(self):
        sig = {'signal': 'HOLD'}
        assert SignalGenerationService._build_price_levels(sig, 100) == {}


class TestPersistOne:
    def test_returns_false_on_exception(self):
        sig = {
            'signal': 'BUY', 'symbol': 'NABIL', 'metadata': {},
            'ltp': 100, 'strength': 70, 'signal_tier': 'Gold', 'rationale': 'test',
        }
        with patch(
            'stocks.services.signal_generation_service.ingest_reading',
            side_effect=Exception('DB error'),
        ):
            result = SignalGenerationService._persist_one(
                'ingest', sig, date.today()
            )
        assert result is False

    def test_returns_true_on_success_for_ingest_source(self):
        sig = {
            'signal': 'BUY', 'symbol': 'NABIL', 'metadata': {},
            'ltp': 100, 'strength': 70, 'signal_tier': 'Gold', 'rationale': 'test',
        }
        mock_reading = MagicMock()
        with patch(
            'stocks.services.signal_generation_service.engine_reading',
            return_value=mock_reading,
        ), patch(
            'stocks.services.signal_generation_service.ingest_reading',
            return_value=MagicMock(),
        ):
            result = SignalGenerationService._persist_one('ingest', sig, date.today())
        assert result is True

    def test_routes_engine_source_correctly(self):
        sig = {'signal': 'BUY', 'symbol': 'NABIL', 'metadata': {}}
        today = date.today()
        with patch('stocks.services.signal_generation_service.engine_reading') as mock_engine:
            mock_engine.return_value = MagicMock()
            with patch('stocks.services.signal_generation_service.ingest_reading'):
                result = SignalGenerationService._persist_one('engine', sig, today)
        mock_engine.assert_called_once()
        assert result is True
