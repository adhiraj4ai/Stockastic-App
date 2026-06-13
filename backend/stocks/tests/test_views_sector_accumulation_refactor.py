"""
Smoke tests for the refactored sector_rotation and accumulation_mixin view helpers.
All DB/ORM calls are mocked so no live database is required.
"""

import datetime
from collections import defaultdict
from unittest.mock import MagicMock, patch

import numpy as np
import pandas as pd
import pytest


# ---------------------------------------------------------------------------
# Helpers from sector_rotation
# ---------------------------------------------------------------------------

from stocks.views.sector_rotation import (
    _aggregate_daily_acc,
    _aggregate_sector_acc_signals,
    _build_sector_acc_result,
    _calculate_avg,
    _collect_symbol_signals,
    _compute_symbol_signal,
    _finalize_sector_acc_results,
    _format_sector_result,
    _get_closest_close,
    _market_return_at,
    _safe_stats,
    _sector_return_at,
)


# ---------------------------------------------------------------------------
# _aggregate_daily_acc
# ---------------------------------------------------------------------------

class TestAggregateDailyAcc:
    def test_sums_cumulative_net_per_symbol_date(self):
        acc_df = pd.DataFrame([
            {'symbol': 'NABIL', 'transaction_date': pd.Timestamp('2024-01-01'), 'cumulative_net': 100},
            {'symbol': 'NABIL', 'transaction_date': pd.Timestamp('2024-01-01'), 'cumulative_net': 50},
            {'symbol': 'NABIL', 'transaction_date': pd.Timestamp('2024-01-02'), 'cumulative_net': 200},
        ])
        result = _aggregate_daily_acc(acc_df)
        jan1 = result[result['symbol'] == 'NABIL']
        assert jan1[jan1['date'] == pd.Timestamp('2024-01-01')]['total_net'].iloc[0] == 150
        assert jan1[jan1['date'] == pd.Timestamp('2024-01-02')]['total_net'].iloc[0] == 200

    def test_returns_dataframe_with_correct_columns(self):
        acc_df = pd.DataFrame([
            {'symbol': 'X', 'transaction_date': pd.Timestamp('2024-03-01'), 'cumulative_net': 10},
        ])
        result = _aggregate_daily_acc(acc_df)
        assert set(result.columns) >= {'symbol', 'date', 'total_net'}


# ---------------------------------------------------------------------------
# _compute_symbol_signal
# ---------------------------------------------------------------------------

class TestComputeSymbolSignal:
    def _make_price_df(self, n=25):
        dates = pd.date_range('2024-01-01', periods=n)
        return pd.DataFrame({'ticker': 'SYM', 'date': dates, 'close': 100.0, 'volume': 1000.0})

    def _make_daily_acc(self, n=25):
        dates = pd.date_range('2024-01-01', periods=n)
        return pd.DataFrame({'symbol': 'SYM', 'date': dates, 'total_net': list(range(n))})

    def test_returns_signal_dict_with_expected_keys(self):
        sig = _compute_symbol_signal('SYM', self._make_price_df(), self._make_daily_acc())
        assert sig is not None
        assert 'net_acc_10d' in sig
        assert 'intensity' in sig

    def test_returns_none_when_insufficient_data(self):
        price_df = self._make_price_df(n=5)
        daily_acc = self._make_daily_acc(n=5)
        sig = _compute_symbol_signal('SYM', price_df, daily_acc)
        assert sig is None

    def test_intensity_is_clamped_to_50(self):
        dates = pd.date_range('2024-01-01', periods=25)
        price_df = pd.DataFrame({'ticker': 'SYM', 'date': dates, 'close': 100.0, 'volume': 1.0})
        # huge net accumulation → would exceed 50 without clamp
        daily_acc = pd.DataFrame({'symbol': 'SYM', 'date': dates, 'total_net': [i * 10_000 for i in range(25)]})
        sig = _compute_symbol_signal('SYM', price_df, daily_acc)
        assert sig is not None
        assert abs(sig['intensity']) <= 50.0


# ---------------------------------------------------------------------------
# _aggregate_sector_acc_signals
# ---------------------------------------------------------------------------

class TestAggregateSectorAccSignals:
    def test_groups_symbols_by_sector(self):
        symbol_signals = {
            'NABIL': {'intensity': 5.0, 'net_acc_10d': 100},
            'EBL': {'intensity': 3.0, 'net_acc_10d': 50},
            'UPPER': {'intensity': -2.0, 'net_acc_10d': -30},
        }
        sector_mapping = {'NABIL': 'Banking', 'EBL': 'Banking', 'UPPER': 'Hydro'}
        result = _aggregate_sector_acc_signals(symbol_signals, sector_mapping)
        assert 'Banking' in result
        assert 'Hydro' in result
        assert len(result['Banking']['intensities']) == 2

    def test_ignores_symbols_without_sector(self):
        symbol_signals = {'UNKNOWN': {'intensity': 1.0, 'net_acc_10d': 10}}
        result = _aggregate_sector_acc_signals(symbol_signals, {})
        assert result == {}


# ---------------------------------------------------------------------------
# _build_sector_acc_result
# ---------------------------------------------------------------------------

class TestBuildSectorAccResult:
    def _make_data(self, intensities, net_acc_10d_list, positive_count=1):
        return {
            'intensities': intensities,
            'net_acc_10d_list': net_acc_10d_list,
            'positive_count': positive_count,
            'symbol_intensities': {'SYM': intensities[0]} if intensities else {},
        }

    def test_returns_none_for_empty_intensities(self):
        assert _build_sector_acc_result(self._make_data([], [])) is None

    def test_accumulating_signal_when_positive(self):
        result = _build_sector_acc_result(self._make_data([5.0], [100]))
        assert result['acc_signal'] == 'accumulating'

    def test_distributing_signal_when_negative(self):
        result = _build_sector_acc_result(self._make_data([-5.0], [-100]))
        assert result['acc_signal'] == 'distributing'

    def test_neutral_signal_within_threshold(self):
        result = _build_sector_acc_result(self._make_data([1.0], [10]))
        assert result['acc_signal'] == 'neutral'

    def test_top_accumulated_stocks_max_three(self):
        data = {
            'intensities': [1.0, 2.0, 3.0, 4.0],
            'net_acc_10d_list': [10, 20, 30, 40],
            'positive_count': 4,
            'symbol_intensities': {'A': 1.0, 'B': 2.0, 'C': 3.0, 'D': 4.0},
        }
        result = _build_sector_acc_result(data)
        assert len(result['top_accumulated_stocks']) == 3


# ---------------------------------------------------------------------------
# _collect_symbol_signals and _finalize_sector_acc_results
# ---------------------------------------------------------------------------

class TestCollectAndFinalize:
    def _make_price_acc(self, sym, n=25):
        dates = pd.date_range('2024-01-01', periods=n)
        price_df = pd.DataFrame({'ticker': sym, 'date': dates, 'close': 100.0, 'volume': 1000.0})
        daily_acc = pd.DataFrame({'symbol': sym, 'date': dates, 'total_net': list(range(n))})
        return price_df, daily_acc

    def test_collects_signal_for_common_symbol(self):
        price_df, daily_acc = self._make_price_acc('NABIL')
        result = _collect_symbol_signals(price_df, daily_acc)
        assert 'NABIL' in result

    def test_finalizes_non_empty_sectors(self):
        sector_acc = {
            'Banking': {
                'intensities': [4.0], 'net_acc_10d_list': [100],
                'positive_count': 1, 'symbol_intensities': {'NABIL': 4.0},
            },
            'Empty': {
                'intensities': [], 'net_acc_10d_list': [],
                'positive_count': 0, 'symbol_intensities': {},
            },
        }
        result = _finalize_sector_acc_results(sector_acc)
        assert 'Banking' in result
        assert 'Empty' not in result


# ---------------------------------------------------------------------------
# _calculate_avg
# ---------------------------------------------------------------------------

class TestCalculateAvg:
    def test_empty_returns_zero(self):
        assert _calculate_avg([]) == 0.0

    def test_average_is_rounded_to_two_decimals(self):
        assert _calculate_avg([1, 2, 3]) == pytest.approx(2.0)


# ---------------------------------------------------------------------------
# _safe_stats
# ---------------------------------------------------------------------------

class TestSafeStats:
    def test_returns_none_triple_for_empty_series(self):
        wr, avg, med = _safe_stats(pd.Series([], dtype=float))
        assert wr is None and avg is None and med is None

    def test_win_rate_is_fraction_above_zero(self):
        wr, avg, med = _safe_stats(pd.Series([1.0, -1.0, 2.0]))
        assert wr == pytest.approx(2 / 3, abs=1e-4)


# ---------------------------------------------------------------------------
# _get_closest_close
# ---------------------------------------------------------------------------

class TestGetClosestClose:
    def _make_pivot(self):
        dates = pd.date_range('2024-01-01', periods=5)
        df = pd.DataFrame({'NABIL': [10.0, 11.0, 12.0, 13.0, 14.0]}, index=dates)
        return df

    def test_exact_date_returns_value(self):
        pivot = self._make_pivot()
        val = _get_closest_close(pivot, 'NABIL', pd.Timestamp('2024-01-01'), tolerance=0)
        assert val == pytest.approx(10.0)

    def test_unknown_ticker_returns_none(self):
        pivot = self._make_pivot()
        assert _get_closest_close(pivot, 'UNKNOWN', pd.Timestamp('2024-01-01')) is None

    def test_falls_through_to_next_date_within_tolerance(self):
        pivot = self._make_pivot()
        # 2024-01-06 is not in index, but 2024-01-07 would be offset=1 → not in index either
        # tolerance=2 should find 2024-01-02 (offset=0 misses, offset=1 hits 2024-01-07 → miss, offset=2 → 2024-01-08 → miss)
        # Use a date one day before first available
        val = _get_closest_close(pivot, 'NABIL', pd.Timestamp('2023-12-31'), tolerance=2)
        assert val == pytest.approx(10.0)


# ---------------------------------------------------------------------------
# _format_sector_result
# ---------------------------------------------------------------------------

class TestFormatSectorResult:
    def test_includes_all_required_keys(self):
        data = {'count': 5, 'returns': defaultdict(list, {'daily': [1.0, 2.0]})}
        acc_signals = {'Banking': {'acc_intensity': 3.5, 'acc_net_10d': 100, 'acc_signal': 'accumulating', 'acc_stocks_count': 3}}
        result = _format_sector_result('Banking', data, acc_signals)
        required = {'sector', 'stock_count', 'daily_return', 'acc_intensity', 'acc_signal'}
        assert required <= result.keys()

    def test_defaults_to_neutral_when_no_acc_signal(self):
        data = {'count': 2, 'returns': defaultdict(list)}
        result = _format_sector_result('Hydro', data, {})
        assert result['acc_signal'] == 'neutral'
        assert result['acc_intensity'] == 0.0


# ---------------------------------------------------------------------------
# Helpers from accumulation_mixin
# ---------------------------------------------------------------------------

from stocks.views.accumulation_mixin import (
    _build_aggressive_where,
    _build_broker_history_series,
    _compute_leader_stats,
    _format_aggressive_results,
    _split_buy_sell_leaders,
)


class TestBuildAggressiveWhere:
    def test_all_sector_has_no_extra_sector_param(self):
        where_clause, params = _build_aggressive_where('All')
        # Base clause includes sectorName != Unknown, but no = %s binding for 'All'
        assert params == []
        assert '"sectorName" = %s' not in where_clause

    def test_specific_sector_appends_filter_and_param(self):
        where_clause, params = _build_aggressive_where('Banking')
        assert '"sectorName" = %s' in where_clause
        assert 'Banking' in params


class TestFormatAggressiveResults:
    def test_splits_into_accumulators_and_distributors(self):
        results = [
            {'intensity': 10, 'symbol': 'A'},
            {'intensity': -8, 'symbol': 'B'},
            {'intensity': 6, 'symbol': 'C'},
        ]
        data = _format_aggressive_results(results)
        assert len(data['accumulators']) == 2
        assert len(data['distributors']) == 1

    def test_capped_at_ten_each(self):
        results = [{'intensity': i, 'symbol': str(i)} for i in range(1, 20)]
        data = _format_aggressive_results(results)
        assert len(data['accumulators']) == 10


class TestBuildBrokerHistorySeries:
    def test_converts_rows_to_sorted_date_dicts(self):
        rows = [
            (datetime.date(2024, 1, 2), 'B1', 200),
            (datetime.date(2024, 1, 1), 'B1', 100),
        ]
        result = _build_broker_history_series(rows)
        assert result[0]['date'] == '2024-01-01'
        assert result[1]['date'] == '2024-01-02'
        assert result[0]['B1'] == 100

    def test_merges_multiple_brokers_on_same_date(self):
        rows = [
            (datetime.date(2024, 1, 1), 'B1', 100),
            (datetime.date(2024, 1, 1), 'B2', 200),
        ]
        result = _build_broker_history_series(rows)
        assert len(result) == 1
        assert result[0]['B1'] == 100
        assert result[0]['B2'] == 200


class TestComputeLeaderStats:
    def test_computes_net_qty_and_amt(self):
        buyers = {1: {'buy_qty': 100, 'buy_amt': 5000}}
        sellers = {1: {'sell_qty': 40, 'sell_amt': 2000}}
        stats = _compute_leader_stats(buyers, sellers)
        assert len(stats) == 1
        row = stats[0]
        assert row['net_qty'] == 60
        assert row['net_amt'] == 3000

    def test_handles_broker_only_in_sellers(self):
        buyers = {}
        sellers = {5: {'sell_qty': 20, 'sell_amt': 1000}}
        stats = _compute_leader_stats(buyers, sellers)
        assert stats[0]['broker'] == 5
        assert stats[0]['net_qty'] == -20


class TestSplitBuySellLeaders:
    def _make_stats(self):
        return [
            {'broker': i, 'net_qty': i * 10, 'net_amt': i * 100,
             'buy_qty': i * 10, 'sell_qty': 0, 'buy_rate': 1.0, 'sell_rate': 0.0}
            for i in range(-5, 6)
        ]

    def test_buy_leaders_sorted_descending(self):
        stats = self._make_stats()
        buy, sell = _split_buy_sell_leaders(stats, is_all=False)
        assert buy[0]['net_qty'] >= buy[-1]['net_qty']

    def test_sell_leaders_have_positive_net_values(self):
        stats = self._make_stats()
        _, sell = _split_buy_sell_leaders(stats, is_all=False)
        for entry in sell:
            assert entry['net_qty'] >= 0
            assert entry['net_amt'] >= 0

    def test_is_all_uses_net_amt_sort_key(self):
        stats = [
            {'broker': 1, 'net_qty': 5, 'net_amt': 1000,
             'buy_qty': 10, 'sell_qty': 5, 'buy_rate': 1.0, 'sell_rate': 0.8},
            {'broker': 2, 'net_qty': 10, 'net_amt': 500,
             'buy_qty': 15, 'sell_qty': 5, 'buy_rate': 0.9, 'sell_rate': 0.7},
        ]
        buy, _ = _split_buy_sell_leaders(stats, is_all=True)
        assert buy[0]['broker'] == 1  # higher net_amt wins
