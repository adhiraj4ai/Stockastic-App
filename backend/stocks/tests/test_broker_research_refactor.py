"""Smoke tests for broker_research.py structural refactor.

These tests verify:
- Public functions return the correct types
- Extracted private helpers return correct types
- Helpers handle empty input gracefully
"""
import pytest
from unittest.mock import patch, MagicMock, call
from collections import defaultdict
from datetime import date, timedelta


# ─── Helpers for patching Django DB / cache ──────────────────────────────────

def _mock_exec(monkeypatch, return_value=None):
    import stocks.services.broker_research as br
    monkeypatch.setattr(br, '_exec', lambda q, p=None: return_value or [])


def _mock_cache_miss(monkeypatch):
    import stocks.services.broker_research as br
    mock_cache = MagicMock()
    mock_cache.get.return_value = None
    mock_cache.set.return_value = None
    monkeypatch.setattr(br, 'cache', mock_cache)


def _make_cursor_conn(rows=None, description=None):
    """Build a mock connection whose cursor returns given rows."""
    mock_cursor = MagicMock()
    mock_cursor.__enter__ = lambda s: s
    mock_cursor.__exit__ = MagicMock(return_value=False)
    mock_cursor.fetchall.return_value = rows or []
    mock_cursor.description = description or []
    mock_conn = MagicMock()
    mock_conn.cursor.return_value = mock_cursor
    return mock_conn, mock_cursor


# ─── _build_accumulation_flows_where ────────────────────────────────────────

class TestBuildAccumulationFlowsWhere:
    def test_returns_tuple(self):
        from stocks.services.broker_research import _build_accumulation_flows_where
        where_parts, params = _build_accumulation_flows_where('All', None)
        assert isinstance(where_parts, list)
        assert isinstance(params, list)

    def test_base_where_has_four_clauses(self):
        from stocks.services.broker_research import _build_accumulation_flows_where
        where_parts, params = _build_accumulation_flows_where('All', None)
        assert len(where_parts) == 4
        assert params == []

    def test_sector_filter_appended(self):
        from stocks.services.broker_research import _build_accumulation_flows_where
        where_parts, params = _build_accumulation_flows_where('Finance', None)
        assert len(where_parts) == 5
        assert 'Finance' in params

    def test_symbol_filter_appended(self):
        from stocks.services.broker_research import _build_accumulation_flows_where
        where_parts, params = _build_accumulation_flows_where('All', 'NABIL')
        assert len(where_parts) == 5
        assert 'NABIL' in params

    def test_both_filters_appended(self):
        from stocks.services.broker_research import _build_accumulation_flows_where
        where_parts, params = _build_accumulation_flows_where('Finance', 'NABIL')
        assert len(where_parts) == 6
        assert len(params) == 2


# ─── _build_accumulation_flows_query ────────────────────────────────────────

class TestBuildAccumulationFlowsQuery:
    def test_returns_string(self):
        from stocks.services.broker_research import _build_accumulation_flows_query
        result = _build_accumulation_flows_query(30, "c.status = 'A'")
        assert isinstance(result, str)

    def test_contains_days(self):
        from stocks.services.broker_research import _build_accumulation_flows_query
        result = _build_accumulation_flows_query(30, "c.status = 'A'")
        assert '30' in result

    def test_contains_where_clause(self):
        from stocks.services.broker_research import _build_accumulation_flows_query
        result = _build_accumulation_flows_query(7, "c.status = 'A'")
        assert "c.status = 'A'" in result


# ─── accumulation_flows (public) ─────────────────────────────────────────────

class TestAccumulationFlows:
    def test_returns_list(self, monkeypatch):
        _mock_cache_miss(monkeypatch)
        _mock_exec(monkeypatch, return_value=[])
        from stocks.services.broker_research import accumulation_flows
        result = accumulation_flows()
        assert isinstance(result, list)

    def test_returns_cached_value(self, monkeypatch):
        import stocks.services.broker_research as br
        mock_cache = MagicMock()
        mock_cache.get.return_value = [{'symbol': 'NABIL'}]
        monkeypatch.setattr(br, 'cache', mock_cache)
        from stocks.services.broker_research import accumulation_flows
        result = accumulation_flows()
        assert result == [{'symbol': 'NABIL'}]

    def test_empty_result_on_no_rows(self, monkeypatch):
        _mock_cache_miss(monkeypatch)
        _mock_exec(monkeypatch, return_value=[])
        from stocks.services.broker_research import accumulation_flows
        result = accumulation_flows('1D', 'All', None)
        assert result == []


# ─── _build_broker_trends_sql_fragments ─────────────────────────────────────

class TestBuildBrokerTrendsSqlFragments:
    def test_returns_dict(self):
        from stocks.services.broker_research import _build_broker_trends_sql_fragments
        result = _build_broker_trends_sql_fragments('NABIL')
        assert isinstance(result, dict)

    def test_has_required_keys(self):
        from stocks.services.broker_research import _build_broker_trends_sql_fragments
        result = _build_broker_trends_sql_fragments('NABIL')
        assert 'symbol_sql_floorsheet' in result
        assert 'symbol_sql_accum' in result
        assert 'symbol_sql_where' in result
        assert 'cumnet_where' in result
        assert 'limit_clause' in result

    def test_no_symbol_gives_limit(self):
        from stocks.services.broker_research import _build_broker_trends_sql_fragments
        result = _build_broker_trends_sql_fragments('')
        assert 'LIMIT' in result['limit_clause']

    def test_with_symbol_no_limit(self):
        from stocks.services.broker_research import _build_broker_trends_sql_fragments
        result = _build_broker_trends_sql_fragments('NABIL')
        assert result['limit_clause'] == ''


# ─── _build_broker_trends_params ────────────────────────────────────────────

class TestBuildBrokerTrendsParams:
    def test_empty_symbol_returns_empty_list(self):
        from stocks.services.broker_research import _build_broker_trends_params
        assert _build_broker_trends_params('') == []

    def test_symbol_returns_four_params(self):
        from stocks.services.broker_research import _build_broker_trends_params
        result = _build_broker_trends_params('NABIL')
        assert result == ['NABIL', 'NABIL', 'NABIL', 'NABIL']


# ─── broker_trends (public) ──────────────────────────────────────────────────

class TestBrokerTrends:
    def test_returns_list(self, monkeypatch):
        _mock_exec(monkeypatch, return_value=[])
        from stocks.services.broker_research import broker_trends
        result = broker_trends()
        assert isinstance(result, list)

    def test_no_symbol_returns_list(self, monkeypatch):
        _mock_exec(monkeypatch, return_value=[])
        from stocks.services.broker_research import broker_trends
        result = broker_trends(symbol=None, range_key='ALL')
        assert isinstance(result, list)


# ─── _build_below_cost_where ─────────────────────────────────────────────────

class TestBuildBelowCostWhere:
    def test_returns_tuple(self):
        from stocks.services.broker_research import _build_below_cost_where
        clause, params = _build_below_cost_where('All')
        assert isinstance(clause, str)
        assert isinstance(params, list)

    def test_no_sector_no_params(self):
        from stocks.services.broker_research import _build_below_cost_where
        _, params = _build_below_cost_where('All')
        assert params == []

    def test_sector_adds_param(self):
        from stocks.services.broker_research import _build_below_cost_where
        _, params = _build_below_cost_where('Finance')
        assert 'Finance' in params


# ─── below_cost (public) ─────────────────────────────────────────────────────

class TestBelowCost:
    def test_returns_list(self, monkeypatch):
        _mock_exec(monkeypatch, return_value=[])
        from stocks.services.broker_research import below_cost
        result = below_cost()
        assert isinstance(result, list)

    def test_empty_when_no_rows(self, monkeypatch):
        _mock_exec(monkeypatch, return_value=[])
        from stocks.services.broker_research import below_cost
        assert below_cost('1M', 'All') == []


# ─── _fetch_broker_favorites_raw ────────────────────────────────────────────

class TestFetchBrokerFavoritesRaw:
    def test_returns_list(self, monkeypatch):
        mock_conn, _ = _make_cursor_conn(rows=[], description=[])
        import stocks.services.broker_research as br
        monkeypatch.setattr(br, 'connections', {'default': mock_conn})
        from stocks.services.broker_research import _fetch_broker_favorites_raw
        result = _fetch_broker_favorites_raw(1, 90)
        assert isinstance(result, list)


# ─── _build_broker_favorites_base ───────────────────────────────────────────

class TestBuildBrokerFavoritesBase:
    def test_empty_rows_returns_empty_list(self):
        from stocks.services.broker_research import _build_broker_favorites_base
        result = _build_broker_favorites_base([])
        assert result == []

    def test_maps_columns_correctly(self):
        from stocks.services.broker_research import _build_broker_favorites_base
        row = ('NABIL', 'Nabil Bank', 1000, 500.0, 200, 300, 100, 50000.0)
        result = _build_broker_favorites_base([row])
        assert len(result) == 1
        assert result[0]['symbol'] == 'NABIL'
        assert result[0]['name'] == 'Nabil Bank'


# ─── _compute_rsi_roc ────────────────────────────────────────────────────────

class TestComputeRsiRoc:
    def test_returns_tuple(self):
        from stocks.services.broker_research import _compute_rsi_roc
        prices = [{'close': 100 + i, 'date': date(2024, 1, i + 1)} for i in range(20)]
        rsi, roc = _compute_rsi_roc(prices)
        assert isinstance(rsi, float)
        assert isinstance(roc, float)

    def test_empty_prices_returns_zeros(self):
        from stocks.services.broker_research import _compute_rsi_roc
        rsi, roc = _compute_rsi_roc([])
        assert rsi == 0
        assert roc == 0

    def test_single_price_returns_zeros(self):
        from stocks.services.broker_research import _compute_rsi_roc
        prices = [{'close': 100, 'date': date(2024, 1, 1)}]
        rsi, roc = _compute_rsi_roc(prices)
        assert rsi == 0
        assert roc == 0


# ─── _enrich_broker_favorites_with_prices ────────────────────────────────────

class TestEnrichBrokerFavoritesWithPrices:
    def test_empty_base_results(self, monkeypatch):
        import stocks.services.broker_research as br
        monkeypatch.setattr(br, '_build_price_map_for_favorites', lambda syms: (None, None))
        from stocks.services.broker_research import _enrich_broker_favorites_with_prices
        result = _enrich_broker_favorites_with_prices([])
        assert result == []

    def test_no_prices_sets_zeros(self, monkeypatch):
        import stocks.services.broker_research as br
        monkeypatch.setattr(br, '_build_price_map_for_favorites', lambda syms: (None, None))
        from stocks.services.broker_research import _enrich_broker_favorites_with_prices
        base = [{'symbol': 'NABIL', 'name': 'Nabil', 'current_net': 0,
                 'wac': 0, 'qty_accumulated': 0, 'buy_qty': 0, 'sell_qty': 0, 'net_amount': 0}]
        result = _enrich_broker_favorites_with_prices(base)
        assert isinstance(result, list)
        assert result[0]['ltp'] == 0


# ─── broker_favorites (public) ───────────────────────────────────────────────

class TestBrokerFavorites:
    def test_returns_list(self, monkeypatch):
        import stocks.services.broker_research as br
        monkeypatch.setattr(br, '_fetch_broker_favorites_raw', lambda b, d: [])
        monkeypatch.setattr(br, '_build_broker_favorites_base', lambda rows: [])
        monkeypatch.setattr(br, '_enrich_broker_favorites_with_prices', lambda r: r)
        from stocks.services.broker_research import broker_favorites
        result = broker_favorites(1, '3M')
        assert isinstance(result, list)


# ─── _fetch_smart_money_leaderboard ─────────────────────────────────────────

class TestFetchSmartMoneyLeaderboard:
    def test_returns_tuple(self):
        from stocks.services.broker_research import _fetch_smart_money_leaderboard
        with patch('stocks.models.market.DailyFloorsheet.objects') as mock_obj:
            mock_obj.filter.return_value.values.return_value.annotate.return_value.order_by.return_value.__getitem__ = MagicMock(return_value=[])
            leaderboard, broker_ids = _fetch_smart_money_leaderboard(date(2024, 1, 1), ['NABIL'])
        assert isinstance(leaderboard, list)
        assert isinstance(broker_ids, list)

    def test_empty_when_no_transactions(self):
        from stocks.services.broker_research import _fetch_smart_money_leaderboard
        with patch('stocks.models.market.DailyFloorsheet.objects') as mock_obj:
            mock_obj.filter.return_value.values.return_value.annotate.return_value.order_by.return_value.__getitem__ = MagicMock(return_value=[])
            leaderboard, broker_ids = _fetch_smart_money_leaderboard(date(2024, 1, 1), [])
        assert leaderboard == []
        assert broker_ids == []


# ─── _compute_smart_money_kpi ─────────────────────────────────────────────────

class TestComputeSmartMoneyKpi:
    def test_returns_dict(self):
        from stocks.services.broker_research import _compute_smart_money_kpi
        result = _compute_smart_money_kpi([], [])
        assert isinstance(result, dict)

    def test_kpi_keys_present(self):
        from stocks.services.broker_research import _compute_smart_money_kpi
        result = _compute_smart_money_kpi([], [1, 2])
        assert 'total_whale_volume' in result
        assert 'total_whale_amount' in result
        assert 'active_symbols' in result
        assert 'active_brokers' in result

    def test_active_brokers_matches_input(self):
        from stocks.services.broker_research import _compute_smart_money_kpi
        result = _compute_smart_money_kpi([], [1, 2, 3])
        assert result['active_brokers'] == 3

    def test_empty_signals_gives_zero_totals(self):
        from stocks.services.broker_research import _compute_smart_money_kpi
        result = _compute_smart_money_kpi([], [])
        assert result['total_whale_volume'] == 0
        assert result['total_whale_amount'] == 0


# ─── smart_money (public) ─────────────────────────────────────────────────────

class TestSmartMoney:
    def test_returns_dict(self, monkeypatch):
        import stocks.services.broker_research as br
        monkeypatch.setattr(br, '_fetch_smart_money_leaderboard', lambda sd, syms: ([], []))
        monkeypatch.setattr(br, '_fetch_smart_money_signals', lambda sd, ids, syms, d: [])
        monkeypatch.setattr(br, '_compute_smart_money_kpi', lambda sigs, ids: {
            'total_whale_volume': 0, 'total_whale_amount': 0,
            'active_symbols': 0, 'active_brokers': 0,
        })
        monkeypatch.setattr(br, '_fetch_smart_money_symbol_flows', lambda sd, ids, syms: [])

        mock_company = MagicMock()
        mock_company.objects.values_list.return_value = []
        mock_price = MagicMock()
        mock_price.objects.order_by.return_value.values_list.return_value.first.return_value = None

        with patch('stocks.models.market.Company.objects') as mock_co, \
             patch('stocks.services.broker_research.DailyStockPrice') as mock_dsp:
            mock_co.values_list.return_value = []
            mock_dsp.objects.order_by.return_value.values_list.return_value.first.return_value = None
            from stocks.services.broker_research import smart_money
            result = smart_money('1D')
        assert isinstance(result, dict)
        assert 'leaderboard' in result
        assert 'signals' in result
        assert 'kpi' in result
        assert 'symbol_flows' in result


# ─── _compute_history_delta ──────────────────────────────────────────────────

class TestComputeHistoryDelta:
    def _make_record(self, buy=100, buy_amt=5000, sell=10, sell_amt=500, net=90):
        h = MagicMock()
        h.cumulative_buy = buy
        h.cumulative_buy_amount = buy_amt
        h.cumulative_sell = sell
        h.cumulative_sell_amount = sell_amt
        h.cumulative_net = net
        h.transaction_date.strftime.return_value = '2024-01-01'
        return h

    def test_returns_dict(self):
        from stocks.services.broker_research import _compute_history_delta
        h = self._make_record()
        prev_h = self._make_record(buy=80, buy_amt=4000, sell=5, sell_amt=250, net=75)
        result = _compute_history_delta(h, prev_h)
        assert isinstance(result, dict)
        assert result['buy_qty'] == 20.0
        assert result['sell_qty'] == 5.0
        assert result['net_quantity'] == 15.0

    def test_first_record_no_prev(self):
        from stocks.services.broker_research import _compute_history_delta
        h = self._make_record()
        result = _compute_history_delta(h, None)
        assert result['buy_qty'] == 100.0
        assert result['sell_qty'] == 10.0
        assert result['net_quantity'] == 90.0


# ─── accumulation_history (public) ───────────────────────────────────────────

class TestAccumulationHistory:
    def test_returns_list(self):
        with patch('stocks.models.DailyCumulativeAccumulation.objects') as mock_obj:
            mock_obj.filter.return_value.order_by.return_value = []
            from stocks.services.broker_research import accumulation_history
            result = accumulation_history(1, 'NABIL')
        assert isinstance(result, list)

    def test_empty_history_returns_empty_list(self):
        with patch('stocks.models.DailyCumulativeAccumulation.objects') as mock_obj:
            mock_obj.filter.return_value.order_by.return_value = []
            from stocks.services.broker_research import accumulation_history
            result = accumulation_history(1, 'NABIL', page=1, page_size=250)
        assert result == []


# ─── _build_broker_portfolio_query ───────────────────────────────────────────

class TestBuildBrokerPortfolioQuery:
    def test_returns_string(self):
        from stocks.services.broker_research import _build_broker_portfolio_query
        result = _build_broker_portfolio_query()
        assert isinstance(result, str)

    def test_contains_key_sql_parts(self):
        from stocks.services.broker_research import _build_broker_portfolio_query
        result = _build_broker_portfolio_query()
        assert 'daily_cumulative_accumulation' in result
        assert 'SELECT' in result


# ─── broker_portfolio (public) ───────────────────────────────────────────────

class TestBrokerPortfolio:
    def test_returns_dict(self, monkeypatch):
        import stocks.services.broker_research as br
        monkeypatch.setattr(br, '_exec_broker_portfolio', lambda broker_id, query: [])
        from stocks.services.broker_research import broker_portfolio
        result = broker_portfolio(1)
        assert isinstance(result, dict)
        assert 'broker_id' in result
        assert 'holdings' in result
        assert 'total_value' in result

    def test_empty_portfolio(self, monkeypatch):
        import stocks.services.broker_research as br
        monkeypatch.setattr(br, '_exec_broker_portfolio', lambda broker_id, query: [])
        from stocks.services.broker_research import broker_portfolio
        result = broker_portfolio(999)
        assert result['holdings'] == []
        assert result['total_value'] == 0


# ─── _fetch_navigator_raw ────────────────────────────────────────────────────

class TestFetchNavigatorRaw:
    def test_returns_list(self, monkeypatch):
        import stocks.services.broker_research as br
        mock_conn, mock_cursor = _make_cursor_conn(
            rows=[], description=[('symbol',), ('name',)]
        )
        monkeypatch.setattr(br, 'connections', {'default': mock_conn})
        from stocks.services.broker_research import _fetch_navigator_raw
        result = _fetch_navigator_raw()
        assert isinstance(result, list)


# ─── _classify_navigator_signal ──────────────────────────────────────────────

class TestClassifyNavigatorSignal:
    def test_returns_tuple(self):
        from stocks.services.broker_research import _classify_navigator_signal
        row = {'ltp': 100.0, 'top_broker_wac': 200.0, 'inst_net_5d': 0, 'cluster_count': 0, 'close_5d': 100.0}
        result = _classify_navigator_signal(row)
        assert isinstance(result, tuple)
        assert len(result) == 3

    def test_platinum_signal(self):
        from stocks.services.broker_research import _classify_navigator_signal
        row = {'ltp': 100.0, 'top_broker_wac': 100.0, 'inst_net_5d': 50000, 'cluster_count': 2, 'close_5d': 100.0}
        signal_type, _, strength = _classify_navigator_signal(row)
        assert signal_type == 'Platinum Buy'
        assert strength == 'Exceptional'

    def test_no_signal_returns_none_tuple(self):
        from stocks.services.broker_research import _classify_navigator_signal
        row = {'ltp': 100.0, 'top_broker_wac': 200.0, 'inst_net_5d': 0, 'cluster_count': 0, 'close_5d': 100.0}
        signal_type, rationale, strength = _classify_navigator_signal(row)
        assert signal_type is None
        assert rationale is None
        assert strength is None


# ─── _build_navigator_signal_row ─────────────────────────────────────────────

class TestBuildNavigatorSignalRow:
    def test_returns_none_for_no_signal(self):
        from stocks.services.broker_research import _build_navigator_signal_row
        row = {'ltp': 100.0, 'top_broker_wac': 200.0, 'inst_net_5d': 0, 'cluster_count': 0, 'close_5d': 100.0}
        result = _build_navigator_signal_row(row)
        assert result is None

    def test_returns_dict_for_signal(self):
        from stocks.services.broker_research import _build_navigator_signal_row
        row = {'symbol': 'NABIL', 'ltp': 100.0, 'top_broker_wac': 100.0, 'inst_net_5d': 50000, 'cluster_count': 2, 'close_5d': 100.0}
        result = _build_navigator_signal_row(row)
        assert isinstance(result, dict)
        assert 'signal_type' in result
        assert 'strength' in result


# ─── navigator_signals (public) ──────────────────────────────────────────────

class TestNavigatorSignals:
    def test_returns_list(self, monkeypatch):
        import stocks.services.broker_research as br
        _mock_cache_miss(monkeypatch)
        monkeypatch.setattr(br, '_fetch_navigator_raw', lambda: [])
        from stocks.services.broker_research import navigator_signals
        result = navigator_signals()
        assert isinstance(result, list)

    def test_returns_cached(self, monkeypatch):
        import stocks.services.broker_research as br
        mock_cache = MagicMock()
        mock_cache.get.return_value = [{'signal_type': 'Gold Signal'}]
        monkeypatch.setattr(br, 'cache', mock_cache)
        from stocks.services.broker_research import navigator_signals
        result = navigator_signals()
        assert result == [{'signal_type': 'Gold Signal'}]


# ─── _resolve_share_transfer_dates ───────────────────────────────────────────

class TestResolveShareTransferDates:
    def test_no_range_key_returns_passthrough(self):
        from stocks.services.broker_research import _resolve_share_transfer_dates
        start, end = _resolve_share_transfer_dates(None, '2024-01-01', '2024-06-01')
        assert start == '2024-01-01'
        assert end == '2024-06-01'

    def test_range_key_overrides_dates(self, monkeypatch):
        import stocks.services.broker_research as br
        mock_dsp = MagicMock()
        mock_dsp.objects.order_by.return_value.first.return_value = MagicMock(date=date(2024, 6, 1))
        monkeypatch.setattr(br, 'DailyStockPrice', mock_dsp)
        from stocks.services.broker_research import _resolve_share_transfer_dates
        start, end = _resolve_share_transfer_dates('1M', None, None)
        assert isinstance(start, str)
        assert isinstance(end, str)


# ─── _build_share_transfers_filters ──────────────────────────────────────────

class TestBuildShareTransfersFilters:
    def test_returns_tuple(self):
        from stocks.services.broker_research import _build_share_transfers_filters
        filters, transfer_filter = _build_share_transfers_filters('NABIL', '2024-01-01', '2024-06-01', 1, 2)
        assert filters is not None
        assert transfer_filter is not None

    def test_no_dates_still_works(self):
        from stocks.services.broker_research import _build_share_transfers_filters
        filters, transfer_filter = _build_share_transfers_filters('NABIL', None, None, 1, 2)
        assert filters is not None


# ─── share_transfers (public) ────────────────────────────────────────────────

class TestShareTransfers:
    def test_returns_dict(self, monkeypatch):
        import stocks.services.broker_research as br
        monkeypatch.setattr(br, '_resolve_share_transfer_dates', lambda rk, sd, ed: ('2024-01-01', '2024-06-01'))
        monkeypatch.setattr(br, '_build_share_transfers_filters', lambda sym, sd, ed, b1, b2: (MagicMock(), MagicMock()))
        monkeypatch.setattr(br, '_fetch_transfer_net_acc_map', lambda f, sym: {})
        monkeypatch.setattr(br, '_fetch_transfer_meta_map', lambda f, b1, b2: {})
        monkeypatch.setattr(br, '_fetch_transfer_stats_and_daily', lambda f, b1, b2: (
            {
                'total_volume_1_to_2': 0, 'total_volume_2_to_1': 0,
                'total_amount_1_to_2': 0, 'total_amount_2_to_1': 0,
                'count_1_to_2': 0, 'count_2_to_1': 0,
                'avg_rate_1_to_2': 0, 'avg_rate_2_to_1': 0,
            },
            []
        ))
        mock_dsp = MagicMock()
        mock_dsp.objects.filter.return_value.order_by.return_value = []
        monkeypatch.setattr(br, 'DailyStockPrice', mock_dsp)
        monkeypatch.setattr(br, '_build_daily_stats', lambda qs, mm, nm, pm: [])

        from stocks.services.broker_research import share_transfers
        result = share_transfers('NABIL', 1, 2, '1M')
        assert isinstance(result, dict)
        assert 'summary' in result
        assert 'daily_stats' in result


# ─── _fetch_focus_ranking_raw ─────────────────────────────────────────────────

class TestFetchFocusRankingRaw:
    def test_returns_tuple_of_three(self):
        from stocks.services.broker_research import _fetch_focus_ranking_raw
        with patch('stocks.models.market.DailyBuyerFloorsheet.objects') as mock_buyer, \
             patch('stocks.models.market.DailySellerFloorsheet.objects') as mock_seller:
            mock_buyer.filter.return_value.values.return_value = []
            mock_seller.filter.return_value.values.return_value = []
            result = _fetch_focus_ranking_raw(date(2024, 1, 1))
        assert isinstance(result, tuple)
        assert len(result) == 3


# ─── _compute_focus_daily_rankings ───────────────────────────────────────────

class TestComputeFocusDailyRankings:
    def test_empty_broker_data_returns_empty(self):
        from stocks.services.broker_research import _compute_focus_daily_rankings
        empty = defaultdict(lambda: defaultdict(lambda: defaultdict(dict)))
        dates, daily_rankings, daily_top_brokers = _compute_focus_daily_rankings(empty)
        assert dates == []
        assert daily_rankings == {}
        assert daily_top_brokers == {}


# ─── focus_ranking (public) ──────────────────────────────────────────────────

class TestFocusRanking:
    def test_returns_dict(self, monkeypatch):
        import stocks.services.broker_research as br
        monkeypatch.setattr(br, '_fetch_focus_ranking_raw', lambda sd: (
            defaultdict(lambda: defaultdict(lambda: defaultdict(dict))), [], []
        ))
        monkeypatch.setattr(br, '_compute_focus_daily_rankings', lambda bd: ([], {}, {}))
        monkeypatch.setattr(br, '_enrich_focus_ranking_series', lambda dr, d, ld: ([], []))

        with patch('stocks.models.market.DailyBuyerFloorsheet.objects') as mock_buyer:
            mock_buyer.aggregate.return_value = {'transaction_date__max': date(2024, 6, 1)}
            from stocks.services.broker_research import focus_ranking
            result = focus_ranking('1W')
        assert isinstance(result, dict)
        assert 'dates' in result
        assert 'series' in result


# ─── _load_forecast_data ─────────────────────────────────────────────────────

class TestLoadForecastData:
    def test_function_exists_and_is_callable(self):
        from stocks.services.broker_research import _load_forecast_data
        assert callable(_load_forecast_data)


# ─── _extract_current_state ──────────────────────────────────────────────────

class TestExtractCurrentState:
    def test_empty_df_returns_none(self):
        import pandas as pd
        from stocks.services.broker_research import _extract_current_state
        empty = pd.DataFrame(columns=['ticker', 'date', 'close', 'intensity', 'volume_spike',
                                       'turnover_spike', 'net_acc_10d', 'avg_daily_volume_20d'])
        result = _extract_current_state(empty, 'NABIL')
        assert result is None


# ─── accumulation_forecast (public wrapper) ───────────────────────────────────

class TestAccumulationForecast:
    def test_returns_none_when_compute_returns_none(self, monkeypatch):
        import stocks.services.broker_research as br
        mock_cache = MagicMock()
        mock_cache.get.return_value = None
        monkeypatch.setattr(br, 'cache', mock_cache)
        monkeypatch.setattr(br, '_compute_forecast', lambda s, m: None)

        from stocks.services.broker_research import accumulation_forecast
        result = accumulation_forecast('NABIL')
        assert result is None

    def test_returns_cached_when_available(self, monkeypatch):
        import stocks.services.broker_research as br
        mock_cache = MagicMock()
        mock_cache.get.return_value = {'symbol': 'NABIL'}
        monkeypatch.setattr(br, 'cache', mock_cache)

        from stocks.services.broker_research import accumulation_forecast
        result = accumulation_forecast('NABIL')
        assert result == {'symbol': 'NABIL'}


# ─── _build_transfer_summary ─────────────────────────────────────────────────

class TestBuildTransferSummary:
    def test_returns_dict_with_both_directions(self):
        from stocks.services.broker_research import _build_transfer_summary
        stats = {
            'total_volume_1_to_2': 100, 'total_volume_2_to_1': 200,
            'total_amount_1_to_2': 5000, 'total_amount_2_to_1': 10000,
            'count_1_to_2': 3, 'count_2_to_1': 5,
            'avg_rate_1_to_2': 500.0, 'avg_rate_2_to_1': 500.0,
        }
        result = _build_transfer_summary(stats, 1, 2)
        assert 'broker1_to_broker2' in result
        assert 'broker2_to_broker1' in result

    def test_none_values_coerced_to_zero(self):
        from stocks.services.broker_research import _build_transfer_summary
        stats = {
            'total_volume_1_to_2': None, 'total_volume_2_to_1': None,
            'total_amount_1_to_2': None, 'total_amount_2_to_1': None,
            'count_1_to_2': None, 'count_2_to_1': None,
            'avg_rate_1_to_2': None, 'avg_rate_2_to_1': None,
        }
        result = _build_transfer_summary(stats, 1, 2)
        assert result['broker1_to_broker2']['total_volume'] == 0


# ─── _build_ltp_map ──────────────────────────────────────────────────────────

class TestBuildLtpMap:
    def test_empty_syms_returns_empty(self, monkeypatch):
        from stocks.services.broker_research import _build_ltp_map
        result = _build_ltp_map(set(), date(2024, 6, 1))
        assert result == {}
