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


class TestGenerateAllDelegates:
    def test_generate_all_delegates_to_orchestrator(self):
        with patch('stocks.services.signal_generation_service.default_orchestrator') as mock_orch:
            mock_orch.generate_all.return_value = 42
            result = SignalGenerationService.generate_all(None)
        mock_orch.generate_all.assert_called_once_with(None)
        assert result == 42

    def test_generate_all_passes_progress_callback(self):
        cb = lambda x: x
        with patch('stocks.services.signal_generation_service.default_orchestrator') as mock_orch:
            mock_orch.generate_all.return_value = 5
            SignalGenerationService.generate_all(cb)
        mock_orch.generate_all.assert_called_once_with(cb)


class TestGenerateAllSignalsTask:
    def test_task_delegates_to_orchestrator(self):
        from stocks.tasks import generate_all_signals_task
        with patch('stocks.tasks.default_orchestrator') as mock_orch, \
             patch('stocks.tasks.evaluate_active_episodes', return_value=3):
            mock_orch.generate_all.return_value = 7
            result = generate_all_signals_task()
        mock_orch.generate_all.assert_called_once_with(None)
        assert result['signals_saved'] == 7

    def test_task_returns_episodes_closed(self):
        from stocks.tasks import generate_all_signals_task
        with patch('stocks.tasks.default_orchestrator') as mock_orch, \
             patch('stocks.tasks.evaluate_active_episodes', return_value=5):
            mock_orch.generate_all.return_value = 10
            result = generate_all_signals_task()
        assert result['episodes_closed'] == 5


class TestGenerateForDate:
    def test_distribution_alert_generate_for_date_calls_run(self):
        from stocks.services.signals.generators.distribution_alert import DistributionAlertGenerator
        gen = DistributionAlertGenerator()
        with patch.object(gen, '_run', return_value=[]) as mock_run:
            gen.generate_for_date(target_date='2026-01-01')
        mock_run.assert_called_once_with(target_date='2026-01-01')

    def test_distribution_alert_generate_for_date_returns_run_result(self):
        from stocks.services.signals.generators.distribution_alert import DistributionAlertGenerator
        gen = DistributionAlertGenerator()
        sentinel = [{'signal': 'SELL'}]
        with patch.object(gen, '_run', return_value=sentinel):
            result = gen.generate_for_date(target_date='2026-01-01')
        assert result is sentinel

    def test_below_cost_reversal_generate_for_date_calls_run(self):
        from stocks.services.signals.generators.below_cost_reversal import BelowCostReversalGenerator
        gen = BelowCostReversalGenerator()
        with patch.object(gen, '_run', return_value=[]) as mock_run:
            gen.generate_for_date(target_date='2026-01-01')
        mock_run.assert_called_once_with(target_date='2026-01-01')

    def test_below_cost_reversal_generate_for_date_returns_run_result(self):
        from stocks.services.signals.generators.below_cost_reversal import BelowCostReversalGenerator
        gen = BelowCostReversalGenerator()
        sentinel = [{'signal': 'BUY'}]
        with patch.object(gen, '_run', return_value=sentinel):
            result = gen.generate_for_date(target_date='2026-01-01')
        assert result is sentinel

    def test_volume_breakout_generate_for_date_calls_run(self):
        from stocks.services.signals.generators.volume_breakout import VolumeBreakoutGenerator
        gen = VolumeBreakoutGenerator()
        with patch.object(gen, '_run', return_value=[]) as mock_run:
            gen.generate_for_date(target_date='2026-01-01')
        mock_run.assert_called_once_with(target_date='2026-01-01')

    def test_volume_breakout_generate_for_date_returns_run_result(self):
        from stocks.services.signals.generators.volume_breakout import VolumeBreakoutGenerator
        gen = VolumeBreakoutGenerator()
        sentinel = [{'signal': 'BUY'}]
        with patch.object(gen, '_run', return_value=sentinel):
            result = gen.generate_for_date(target_date='2026-01-01')
        assert result is sentinel

    def test_concentration_shift_generate_for_date_calls_run(self):
        from stocks.services.signals.generators.concentration_shift import ConcentrationShiftGenerator
        gen = ConcentrationShiftGenerator()
        with patch.object(gen, '_run', return_value=[]) as mock_run:
            gen.generate_for_date(target_date='2026-01-01')
        mock_run.assert_called_once_with(target_date='2026-01-01')

    def test_concentration_shift_generate_for_date_returns_run_result(self):
        from stocks.services.signals.generators.concentration_shift import ConcentrationShiftGenerator
        gen = ConcentrationShiftGenerator()
        sentinel = [{'signal': 'BUY'}]
        with patch.object(gen, '_run', return_value=sentinel):
            result = gen.generate_for_date(target_date='2026-01-01')
        assert result is sentinel

    def test_generate_for_date_default_target_date_is_none(self):
        from stocks.services.signals.generators.distribution_alert import DistributionAlertGenerator
        gen = DistributionAlertGenerator()
        with patch.object(gen, '_run', return_value=[]) as mock_run:
            gen.generate_for_date()
        mock_run.assert_called_once_with(target_date=None)

    def test_backtest_engine_calls_generate_for_date(self):
        from stocks.services.signals.generators.distribution_alert import DistributionAlertGenerator
        gen = DistributionAlertGenerator()
        with patch.object(gen, 'generate_for_date', return_value=[]) as mock_gfd:
            gen.generate_for_date(target_date='2026-01-15')
        mock_gfd.assert_called_once_with(target_date='2026-01-15')
