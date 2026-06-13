"""
Smoke tests for extracted helpers in the misc view refactor (Phase 5 Task 6).
No Django DB is required for pure-logic helpers; DB-touching helpers are tested
via lightweight mocking.
"""
import pytest
import pandas as pd
import numpy as np
from unittest.mock import patch, MagicMock
from datetime import date, timedelta


# ---------------------------------------------------------------------------
# price_forecast helpers
# ---------------------------------------------------------------------------

class TestPriceForecastHelpers:
    """Tests for pure-logic helpers extracted from price_forecast.py."""

    def test_identify_events_filters_correctly(self):
        from stocks.views.price_forecast import _identify_events
        data = pd.DataFrame({
            'intensity': [5.0, 1.0, 8.0, None],
            'volume_spike': [1.5, 2.0, 0.8, 1.5],
        })
        result = _identify_events(data, min_intensity=3.0)
        assert len(result) == 1
        assert result.iloc[0]['intensity'] == 5.0

    def test_identify_events_requires_volume_spike(self):
        from stocks.views.price_forecast import _identify_events
        data = pd.DataFrame({
            'intensity': [10.0],
            'volume_spike': [1.0],  # exactly 1.0 is NOT > 1.2
        })
        result = _identify_events(data, min_intensity=3.0)
        assert result.empty

    def test_build_daily_acc_groups_by_symbol_date(self):
        from stocks.views.price_forecast import _build_daily_acc
        df = pd.DataFrame({
            'symbol': ['ABC', 'ABC', 'XYZ'],
            'transaction_date': pd.to_datetime(['2024-01-01', '2024-01-01', '2024-01-01']),
            'cumulative_net': [100.0, 200.0, 50.0],
        })
        result = _build_daily_acc(df)
        abc_row = result[result['symbol'] == 'ABC']
        assert len(abc_row) == 1
        assert float(abc_row.iloc[0]['total_net']) == 300.0

    def test_resolve_date_range_returns_strings(self):
        from stocks.views.price_forecast import _resolve_date_range
        features = pd.DataFrame({'date': pd.to_datetime(['2024-01-01', '2024-06-01'])})
        date_from, date_to = _resolve_date_range(features, date(2023, 1, 1))
        assert date_from == '2024-01-01'
        assert date_to == '2024-06-01'

    def test_resolve_date_range_fallback_on_empty(self):
        from stocks.views.price_forecast import _resolve_date_range
        features = pd.DataFrame({'date': pd.Series([], dtype='datetime64[ns]')})
        start_date = date(2024, 1, 1)
        date_from, date_to = _resolve_date_range(features, start_date)
        assert date_from == str(start_date)

    def test_empty_study_response_structure(self):
        from stocks.views.price_forecast import _empty_study_response
        result = _empty_study_response(date(2024, 1, 1))
        assert 'study' in result
        study = result['study']
        assert study['total_events'] == 0
        assert study['symbols_covered'] == 0
        assert 'lags' in study

    def test_compute_lag_stats_with_data(self):
        from stocks.views.price_forecast import _compute_lag_stats
        import pandas as pd
        # Construct events_with_returns with a return_5d column
        df = pd.DataFrame({'return_5d': [2.0, -1.0, 3.0, 4.0]})
        key, wr, avg, med, p25, p75 = _compute_lag_stats(df, 5)
        assert key == '5d'
        assert wr == pytest.approx(0.75, abs=0.01)  # 3 out of 4 positive
        assert avg is not None

    def test_compute_lag_stats_empty_series(self):
        from stocks.views.price_forecast import _compute_lag_stats
        df = pd.DataFrame({'return_5d': pd.Series([], dtype=float)})
        key, wr, avg, med, p25, p75 = _compute_lag_stats(df, 5)
        assert key == '5d'
        assert wr is None

    def test_build_price_lookup_deduplicates(self):
        from stocks.views.price_forecast import _build_price_lookup
        features = pd.DataFrame({
            'ticker': ['ABC', 'ABC'],
            'date': pd.to_datetime(['2024-01-01', '2024-01-01']),
            'close': [100.0, 100.0],
        })
        lookup = _build_price_lookup(features)
        assert len(lookup) == 1


# ---------------------------------------------------------------------------
# fibonacci helpers
# ---------------------------------------------------------------------------

class TestFibonacciHelpers:
    """Tests for swing-point and Fibonacci helpers."""

    def test_find_swing_points_detects_high(self):
        from stocks.views.fibonacci import find_swing_points
        prices = [
            {'high': float(i), 'low': float(i - 1), 'date': f'2024-01-{i:02d}'}
            for i in range(1, 12)
        ]
        prices[5]['high'] = 20.0  # clear spike at index 5
        raw = find_swing_points(prices, lookback=2)
        highs = [p for p in raw if p['type'] == 'high']
        assert any(p['price'] == 20.0 for p in highs)

    def test_build_zigzag_alternates(self):
        from stocks.views.fibonacci import build_zigzag
        raw = [
            {'index': 0, 'price': 10, 'type': 'high', 'date': 'd0'},
            {'index': 1, 'price': 12, 'type': 'high', 'date': 'd1'},  # should replace
            {'index': 2, 'price': 5,  'type': 'low',  'date': 'd2'},
        ]
        zigzag = build_zigzag(raw)
        assert len(zigzag) == 2
        assert zigzag[0]['price'] == 12

    def test_get_anchor_points_uptrend(self):
        from stocks.views.fibonacci import get_anchor_points
        zigzag = [
            {'index': 0, 'price': 50, 'type': 'low',  'date': 'd0'},
            {'index': 1, 'price': 100, 'type': 'high', 'date': 'd1'},
        ]
        low, high, trend = get_anchor_points(zigzag)
        assert trend == 'UPTREND'
        assert high['price'] == 100

    def test_get_anchor_points_too_few(self):
        from stocks.views.fibonacci import get_anchor_points
        low, high, trend = get_anchor_points([{'index': 0, 'price': 50, 'type': 'low', 'date': 'd'}])
        assert low is None and high is None and trend is None

    def test_compute_fib_levels_count(self):
        from stocks.views.fibonacci import _compute_fib_levels
        levels = _compute_fib_levels(anchor_0=100.0, anchor_100=50.0, current_price=75.0)
        assert len(levels) == 7

    def test_find_current_zone_between_levels(self):
        from stocks.views.fibonacci import _find_current_zone
        levels = [
            {'label': '0%', 'price': 50.0},
            {'label': '23.6%', 'price': 61.8},
            {'label': '38.2%', 'price': 69.1},
        ]
        zone = _find_current_zone(levels, current_price=65.0)
        assert zone is not None
        assert zone['lower'] == '23.6%'


# ---------------------------------------------------------------------------
# volume_profile helpers
# ---------------------------------------------------------------------------

class TestVolumeProfileHelpers:
    """Tests for volume profile computation helpers."""

    def test_bin_profile_reduces_bins(self):
        from stocks.views.volume_profile import _bin_profile
        prices = [float(i) for i in range(200)]  # 200 unique prices
        volumes = [1.0] * 200
        df = pd.DataFrame({'price': prices, 'volume': volumes})
        profile = _bin_profile(df)
        assert len(profile) <= 50  # capped at MAX_BINS

    def test_bin_profile_exact_prices_below_max(self):
        from stocks.views.volume_profile import _bin_profile
        df = pd.DataFrame({'price': [10.0, 20.0, 30.0], 'volume': [100.0, 200.0, 50.0]})
        profile = _bin_profile(df)
        assert len(profile) == 3

    def test_compute_value_area_covers_70pct(self):
        from stocks.views.volume_profile import _compute_value_area
        profile = pd.DataFrame({
            'price': [10.0, 20.0, 30.0, 40.0, 50.0],
            'volume': [10.0, 100.0, 200.0, 80.0, 10.0],
        })
        poc_price = 30.0
        total_volume = profile['volume'].sum()
        val, vah = _compute_value_area(profile, poc_price, total_volume)
        assert val <= poc_price <= vah

    def test_build_bars_marks_poc(self):
        from stocks.views.volume_profile import _build_bars
        profile = pd.DataFrame({'price': [10.0, 20.0, 30.0], 'volume': [50.0, 300.0, 100.0]})
        bars = _build_bars(profile, poc_price=20.0, val=15.0, vah=25.0)
        poc_bars = [b for b in bars if b['is_poc']]
        assert len(poc_bars) == 1
        assert poc_bars[0]['price'] == 20.0


# ---------------------------------------------------------------------------
# floorsheet helpers
# ---------------------------------------------------------------------------

class TestFloorsheetHelpers:
    """Tests for floorsheet view helpers."""

    def test_build_net_positions_computes_correctly(self):
        from stocks.views.floorsheet import _build_net_positions
        buy_map = {1: {'buy_qty': 500, 'buy_amount': 5000.0}}
        sell_map = {1: {'sell_qty': 200, 'sell_amount': 2000.0}, 2: {'sell_qty': 100, 'sell_amount': 1000.0}}
        positions = _build_net_positions(buy_map, sell_map)
        broker1 = next(p for p in positions if p['broker_id'] == 1)
        assert broker1['net_qty'] == 300
        broker2 = next(p for p in positions if p['broker_id'] == 2)
        assert broker2['net_qty'] == -100

    def test_build_smart_activity_skips_zero_brokers(self):
        from stocks.views.floorsheet import _build_smart_activity
        global_smart_ids = {1, 2, 3}
        buy_map = {1: {'buy_qty': 500, 'buy_amount': 1000.0}}
        sell_map = {2: {'sell_qty': 200, 'sell_amount': 500.0}}
        activity = _build_smart_activity(global_smart_ids, buy_map, sell_map)
        # broker 3 has zero activity and should be skipped
        assert all(a['broker_id'] != 3 for a in activity)
        assert len(activity) == 2

    def test_format_buyers_computes_pct(self):
        from stocks.views.floorsheet import _format_buyers
        top_buyers_qs = [{'buyer_id': 1, 'buy_qty': 100, 'buy_amount': 1000.0}]
        result = _format_buyers(top_buyers_qs, total_vol=200)
        assert result[0]['pct'] == 50.0


# ---------------------------------------------------------------------------
# signal_alerts helpers
# ---------------------------------------------------------------------------

class TestSignalAlertsHelpers:
    """Tests for signal alerts helper functions."""

    def test_build_summary_initialises_all_keys(self):
        from stocks.views.signal_alerts import _build_summary, _UI_MAP
        # Patch SignalEpisode.objects to return empty queryset
        with patch('stocks.views.signal_alerts.SignalEpisode') as mock_ep:
            mock_ep.objects.filter.return_value.values.return_value.annotate.return_value = []
            summary = _build_summary(latest_date='2024-01-01')
        expected_keys = set(_UI_MAP.values())
        assert set(summary.keys()) == expected_keys
        assert all(v == 0 for v in summary.values())

    def test_cat_map_covers_all_ui_keys(self):
        from stocks.views.signal_alerts import _CAT_MAP, _UI_MAP
        assert len(_CAT_MAP) == 10
        assert len(_UI_MAP) == 10

    def test_symbols_for_category_invalid_returns_none(self):
        from stocks.views.signal_alerts import _symbols_for_category
        result = _symbols_for_category('invalid_category', '2024-01-01')
        assert result is None


# ---------------------------------------------------------------------------
# pipeline helpers
# ---------------------------------------------------------------------------

class TestPipelineHelpers:
    """Tests for pipeline view helpers."""

    def test_parse_numeric_handles_blank(self):
        from stocks.views.pipeline import _parse_numeric
        assert _parse_numeric('') == 0
        assert _parse_numeric(None) == 0
        assert _parse_numeric('-') == 0

    def test_parse_numeric_handles_comma_separator(self):
        from stocks.views.pipeline import _parse_numeric
        assert _parse_numeric('1,234.56') == pytest.approx(1234.56)

    def test_extract_symbol_from_normalised_row(self):
        from stocks.views.pipeline import _extract_symbol
        assert _extract_symbol({'Symbol': 'ABC'}) == 'ABC'
        assert _extract_symbol({'symbol': 'XYZ'}) == 'XYZ'
        assert _extract_symbol({'Ticker': 'DEF'}) == 'DEF'
        assert _extract_symbol({}) is None

    def test_update_records_found_signals(self):
        from stocks.views.pipeline import _update_records_found
        assert _update_records_found("Total signals saved: 99", 0) == 99
        assert _update_records_found("Saved: 50, Skipped: 10", 0) == 50
        assert _update_records_found("Evaluation complete: 3 WON, 7 LOST", 0) == 10

    def test_update_records_found_no_match_preserves(self):
        from stocks.views.pipeline import _update_records_found
        result = _update_records_found("Some unrelated log line", 42)
        assert result == 42

    def test_extract_floorsheet_list_from_dict(self):
        from stocks.views.pipeline import _extract_floorsheet_list
        data = {'data': [{'contractId': 1}]}
        assert _extract_floorsheet_list(data) == [{'contractId': 1}]

    def test_extract_floorsheet_list_from_list(self):
        from stocks.views.pipeline import _extract_floorsheet_list
        data = [{'contractId': 1}]
        assert _extract_floorsheet_list(data) == data

    def test_extract_floorsheet_list_invalid_raises(self):
        from stocks.views.pipeline import _extract_floorsheet_list
        with pytest.raises(ValueError):
            _extract_floorsheet_list({'unknown_key': []})

    def test_normalise_row_strips_whitespace(self):
        from stocks.views.pipeline import _normalise_row
        result = _normalise_row({' Symbol ': 'ABC', ' Open ': '100'})
        assert 'Symbol' in result
        assert result['Symbol'] == 'ABC'
