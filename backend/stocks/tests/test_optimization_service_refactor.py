"""
Tests for the refactored optimization_service helpers.

Each extracted helper gets at least one test covering:
  - correct return type
  - edge/empty input handled gracefully
"""
import numpy as np
import pandas as pd
import pytest
from unittest.mock import MagicMock, patch


# ---------------------------------------------------------------------------
# Helpers imported at module scope so individual tests stay concise
# ---------------------------------------------------------------------------

from stocks.services.optimization_service import (
    SafeTa,
    _resolve_code,
    _build_local_scope,
    _extract_strategy_class,
    _inject_params,
    _score_ticker,
    _eval_params,
    _build_optuna_objective,
    _persist_experiment,
    _NAMED_STRATEGY_CODES,
    OptimizationService,
)
import talib


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def safe_ta():
    return SafeTa(talib)


@pytest.fixture
def price_series():
    np.random.seed(42)
    data = np.cumsum(np.random.randn(100)) + 100
    return pd.Series(data, name='close')


@pytest.fixture
def ohlc_arrays(price_series):
    c = price_series.values
    h = c + np.abs(np.random.randn(len(c))) * 0.5
    l = c - np.abs(np.random.randn(len(c))) * 0.5
    return h, l, c


# ---------------------------------------------------------------------------
# SafeTa._ichimoku_lines
# ---------------------------------------------------------------------------

class TestIchimokuLines:
    def test_returns_four_arrays(self, safe_ta, ohlc_arrays):
        h, l, c = ohlc_arrays
        n = len(h)
        result = safe_ta._ichimoku_lines(h, l, n, tenkan=9, kijun=26, senkou=52)
        assert len(result) == 4
        for arr in result:
            assert isinstance(arr, np.ndarray)
            assert len(arr) == n

    def test_tenkan_all_nan_for_short_input(self, safe_ta):
        h = np.array([1.0, 2.0])
        l = np.array([0.5, 1.0])
        n = len(h)
        tenkan_sen, kijun_sen, senkou_a, senkou_b = safe_ta._ichimoku_lines(h, l, n, tenkan=9, kijun=26, senkou=52)
        # With only 2 bars, all lines requiring >=9 bars should be NaN
        assert np.all(np.isnan(tenkan_sen))


# ---------------------------------------------------------------------------
# SafeTa._ichimoku_chikou
# ---------------------------------------------------------------------------

class TestIchimokuChikou:
    def test_length_matches_input(self, safe_ta, price_series):
        c = price_series.values
        n = len(c)
        chikou = safe_ta._ichimoku_chikou(c, n, kijun=26)
        assert len(chikou) == n

    def test_tail_is_nan(self, safe_ta, price_series):
        c = price_series.values
        n = len(c)
        kijun = 26
        chikou = safe_ta._ichimoku_chikou(c, n, kijun=kijun)
        # The last kijun entries should be NaN (no future close to lag into)
        assert np.all(np.isnan(chikou[n - kijun:]))


# ---------------------------------------------------------------------------
# SafeTa._ichimoku_span_df
# ---------------------------------------------------------------------------

class TestIchimokuSpanDf:
    def test_returns_dataframe_with_correct_columns(self, safe_ta):
        n = 50
        senkou_a = np.random.rand(n)
        senkou_b = np.random.rand(n)
        idx = pd.RangeIndex(n)
        span_df = safe_ta._ichimoku_span_df(senkou_a, senkou_b, n, kijun=26, idx=idx)
        assert isinstance(span_df, pd.DataFrame)
        assert 'ISA_9' in span_df.columns
        assert 'ISB_26' in span_df.columns

    def test_empty_when_n_less_than_kijun(self, safe_ta):
        n = 5
        senkou_a = np.random.rand(n)
        senkou_b = np.random.rand(n)
        idx = pd.RangeIndex(n)
        span_df = safe_ta._ichimoku_span_df(senkou_a, senkou_b, n, kijun=26, idx=idx)
        # All entries should be NaN because n <= kijun
        assert span_df['ISA_9'].isna().all()


# ---------------------------------------------------------------------------
# SafeTa.ichimoku (public)
# ---------------------------------------------------------------------------

class TestIchimoku:
    def test_returns_tuple_of_two_dataframes(self, safe_ta, ohlc_arrays):
        h, l, c = ohlc_arrays
        high = pd.Series(h)
        low = pd.Series(l)
        close = pd.Series(c)
        result = safe_ta.ichimoku(high, low, close)
        assert isinstance(result, tuple)
        assert len(result) == 2
        assert isinstance(result[0], pd.DataFrame)
        assert isinstance(result[1], pd.DataFrame)

    def test_main_df_has_expected_columns(self, safe_ta, ohlc_arrays):
        h, l, c = ohlc_arrays
        df, _ = safe_ta.ichimoku(pd.Series(h), pd.Series(l), pd.Series(c))
        for col in ('ISA_9', 'ISB_26', 'ITS_9', 'IKS_26', 'ICS'):
            assert col in df.columns


# ---------------------------------------------------------------------------
# SafeTa._supertrend_bands
# ---------------------------------------------------------------------------

class TestSupertrendBands:
    def test_returns_upper_lower_same_length(self, safe_ta, ohlc_arrays):
        h, l, c = ohlc_arrays
        atr = talib.ATR(h, l, c, timeperiod=10)
        upper, lower = safe_ta._supertrend_bands(h, l, c, period=10, mult=3.0, atr=atr)
        assert len(upper) == len(h)
        assert len(lower) == len(h)

    def test_upper_above_lower(self, safe_ta, ohlc_arrays):
        h, l, c = ohlc_arrays
        atr = talib.ATR(h, l, c, timeperiod=10)
        upper, lower = safe_ta._supertrend_bands(h, l, c, period=10, mult=3.0, atr=atr)
        valid = ~(np.isnan(upper) | np.isnan(lower))
        assert np.all(upper[valid] >= lower[valid])


# ---------------------------------------------------------------------------
# SafeTa._supertrend_loop
# ---------------------------------------------------------------------------

class TestSupertrendLoop:
    def test_returns_trend_and_direction_arrays(self, safe_ta, ohlc_arrays):
        h, l, c = ohlc_arrays
        n = len(c)
        atr = talib.ATR(h, l, c, timeperiod=10)
        upper, lower = safe_ta._supertrend_bands(h, l, c, period=10, mult=3.0, atr=atr)
        trend, direction = safe_ta._supertrend_loop(c, n, atr, upper, lower)
        assert len(trend) == n
        assert len(direction) == n

    def test_direction_values_are_plus_minus_one(self, safe_ta, ohlc_arrays):
        h, l, c = ohlc_arrays
        n = len(c)
        atr = talib.ATR(h, l, c, timeperiod=10)
        upper, lower = safe_ta._supertrend_bands(h, l, c, period=10, mult=3.0, atr=atr)
        _, direction = safe_ta._supertrend_loop(c, n, atr, upper, lower)
        valid = ~np.isnan(direction)
        assert set(direction[valid]).issubset({1.0, -1.0})


# ---------------------------------------------------------------------------
# SafeTa.supertrend (public)
# ---------------------------------------------------------------------------

class TestSupertrend:
    def test_returns_dataframe_with_four_columns(self, safe_ta, ohlc_arrays):
        h, l, c = ohlc_arrays
        df = safe_ta.supertrend(pd.Series(h), pd.Series(l), pd.Series(c))
        assert isinstance(df, pd.DataFrame)
        assert df.shape[1] == 4


# ---------------------------------------------------------------------------
# _resolve_code
# ---------------------------------------------------------------------------

class TestResolveCode:
    def test_known_alias_returns_code_string(self):
        result = _resolve_code('broker_accumulation_v1')
        assert isinstance(result, str)
        assert 'BrokerAccumulationStrategy' in result

    def test_ichimoku_alias_resolved(self):
        result = _resolve_code('ichimoku_accumulation_v1')
        assert 'IchimokuAccumulation' in result

    def test_ichimoku_prefix_resolved(self):
        result = _resolve_code('ichimoku_accumulation_v1_extra')
        assert 'IchimokuAccumulation' in result

    def test_unknown_alias_returned_as_is(self):
        raw = "class MyStrategy(Strategy): pass"
        assert _resolve_code(raw) == raw

    def test_all_named_aliases_resolve(self):
        for alias in _NAMED_STRATEGY_CODES:
            result = _resolve_code(alias)
            assert isinstance(result, str)
            assert len(result) > 0


# ---------------------------------------------------------------------------
# _inject_params
# ---------------------------------------------------------------------------

class TestInjectParams:
    def test_replaces_integer_param(self):
        code = "fast = 10  # range: [5, 50]"
        result = _inject_params(code, {'fast': 20})
        assert 'fast = 20' in result

    def test_replaces_float_param(self):
        code = "mult = 3.0  # range: [1.0, 5.0]"
        result = _inject_params(code, {'mult': 2.5})
        assert 'mult = 2.5' in result

    def test_no_params_unchanged(self):
        code = "x = 1"
        assert _inject_params(code, {}) == code


# ---------------------------------------------------------------------------
# _build_local_scope
# ---------------------------------------------------------------------------

class TestBuildLocalScope:
    def test_contains_required_keys(self):
        scope = _build_local_scope()
        for key in ('Backtest', 'Strategy', 'crossover', 'SMA', 'pd', 'np', 'ta', 'talib'):
            assert key in scope

    def test_ta_is_safe_ta_instance(self):
        scope = _build_local_scope()
        assert isinstance(scope['ta'], SafeTa)


# ---------------------------------------------------------------------------
# _extract_strategy_class
# ---------------------------------------------------------------------------

class TestExtractStrategyClass:
    def test_returns_strategy_subclass(self):
        from backtesting import Strategy
        code = """
from backtesting import Strategy
class DummyStrategy(Strategy):
    def init(self): pass
    def next(self): pass
"""
        scope = _build_local_scope()
        klass = _extract_strategy_class(code, scope)
        assert klass is not None
        assert issubclass(klass, Strategy)

    def test_returns_none_on_syntax_error(self):
        scope = _build_local_scope()
        klass = _extract_strategy_class("this is not python %%", scope)
        assert klass is None

    def test_returns_none_when_no_strategy_defined(self):
        scope = _build_local_scope()
        klass = _extract_strategy_class("x = 1 + 1", scope)
        assert klass is None


# ---------------------------------------------------------------------------
# _score_ticker
# ---------------------------------------------------------------------------

class TestScoreTicker:
    def test_returns_none_for_short_dataframe(self):
        from backtesting import Strategy
        class DummyStrategy(Strategy):
            def init(self): pass
            def next(self): pass

        short_df = pd.DataFrame({'Open': [1.0], 'High': [1.1], 'Low': [0.9], 'Close': [1.0], 'Volume': [100]})
        result = _score_ticker(DummyStrategy, short_df, 'win_rate')
        assert result is None

    def test_returns_none_on_backtest_exception(self):
        # A strategy that crashes should return None, not propagate
        from backtesting import Strategy
        class CrashStrategy(Strategy):
            def init(self): raise RuntimeError("boom")
            def next(self): pass

        dates = pd.date_range('2020-01-01', periods=50)
        df = pd.DataFrame({
            'Open': np.ones(50), 'High': np.ones(50) * 1.1,
            'Low': np.ones(50) * 0.9, 'Close': np.ones(50), 'Volume': np.ones(50) * 1000,
        }, index=dates)
        result = _score_ticker(CrashStrategy, df, 'win_rate')
        assert result is None


# ---------------------------------------------------------------------------
# _eval_params
# ---------------------------------------------------------------------------

class TestEvalParams:
    def test_returns_none_when_no_strategy_class(self):
        model = MagicMock()
        model.code = "not valid python %%"
        result = _eval_params(model, {}, {}, 'win_rate')
        assert result is None

    def test_returns_none_for_empty_eval_map(self):
        model = MagicMock()
        model.code = """
from backtesting import Strategy
class S(Strategy):
    def init(self): pass
    def next(self): pass
"""
        result = _eval_params(model, {}, {}, 'win_rate')
        assert result is None


# ---------------------------------------------------------------------------
# _build_optuna_objective
# ---------------------------------------------------------------------------

class TestBuildOptunaObjective:
    def test_returns_callable(self):
        model = MagicMock()
        model.code = "x = 1"
        obj = _build_optuna_objective(model, {}, {}, 'win_rate')
        assert callable(obj)

    def test_returns_sentinel_when_eval_returns_none(self):
        model = MagicMock()
        model.code = "not python %%"
        param_ranges = {'fast': [5, 20]}
        import optuna
        study = optuna.create_study()
        obj = _build_optuna_objective(model, param_ranges, {}, 'win_rate')
        trial = study.ask()
        result = obj(trial)
        assert result == -9999


# ---------------------------------------------------------------------------
# _persist_experiment
# ---------------------------------------------------------------------------

class TestPersistExperiment:
    @patch('stocks.services.optimization_service.StrategyExperiment')
    def test_creates_experiment_record(self, mock_experiment):
        study = MagicMock()
        study.best_value = 60.0
        study.best_params = {'fast': 10}
        study.trials = [MagicMock()]

        strategy_model = MagicMock()
        _persist_experiment(
            strategy_model, 'SYMBOL', 'NABIL',
            '2023-01-01', '2024-01-01',
            study, oos_value=55.0,
        )
        mock_experiment.objects.create.assert_called_once()

    @patch('stocks.services.optimization_service.StrategyExperiment')
    def test_oos_accepted_true_when_oos_gte_half_is(self, mock_experiment):
        study = MagicMock()
        study.best_value = 60.0
        study.best_params = {}
        study.trials = []

        strategy_model = MagicMock()
        _persist_experiment(strategy_model, 'SYMBOL', 'X', '2023-01-01', '2024-01-01', study, oos_value=30.0)

        _, kwargs = mock_experiment.objects.create.call_args
        assert kwargs['metrics']['oos_accepted'] is True

    @patch('stocks.services.optimization_service.StrategyExperiment')
    def test_oos_accepted_false_when_oos_too_low(self, mock_experiment):
        study = MagicMock()
        study.best_value = 60.0
        study.best_params = {}
        study.trials = []

        strategy_model = MagicMock()
        _persist_experiment(strategy_model, 'SYMBOL', 'X', '2023-01-01', '2024-01-01', study, oos_value=10.0)

        _, kwargs = mock_experiment.objects.create.call_args
        assert kwargs['metrics']['oos_accepted'] is False


# ---------------------------------------------------------------------------
# OptimizationService.extract_param_ranges (existing public method)
# ---------------------------------------------------------------------------

class TestExtractParamRanges:
    def test_parses_integer_ranges(self):
        code = "fast = 10  # range: [5, 50]"
        result = OptimizationService.extract_param_ranges(code)
        assert result == {'fast': [5, 50]}

    def test_parses_float_ranges(self):
        code = "mult = 3.0  # range: [1.0, 5.0]"
        result = OptimizationService.extract_param_ranges(code)
        assert result == {'mult': [1.0, 5.0]}

    def test_empty_code_returns_empty_dict(self):
        assert OptimizationService.extract_param_ranges("") == {}
