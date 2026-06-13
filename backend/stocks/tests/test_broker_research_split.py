"""Smoke tests for the broker_research package split (Phase 5 Task 8).

Verifies that every public function and key private helper can be imported
from the package's top-level namespace and that they are callable.
"""


def test_public_functions_callable():
    from stocks.services.broker_research import (
        accumulation_flows,
        accumulation_history,
        broker_trends,
        broker_favorites,
        focus_ranking,
        smart_money,
        navigator_signals,
        below_cost,
        broker_portfolio,
        share_transfers,
        accumulation_forecast,
    )
    fns = [
        accumulation_flows, accumulation_history, broker_trends, broker_favorites,
        focus_ranking, smart_money, navigator_signals, below_cost, broker_portfolio,
        share_transfers, accumulation_forecast,
    ]
    for fn in fns:
        assert callable(fn), f"{fn} is not callable"


def test_private_helpers_callable():
    from stocks.services.broker_research import (
        _build_accumulation_flows_where,
        _build_accumulation_flows_query,
        _compute_history_delta,
        _build_broker_trends_sql_fragments,
        _build_broker_trends_params,
        _build_broker_trends_query,
        _fetch_broker_favorites_raw,
        _build_broker_favorites_base,
        _compute_rsi_roc,
        _build_price_map_for_favorites,
        _enrich_broker_favorites_with_prices,
        _fetch_focus_ranking_raw,
        _rank_stocks_for_date,
        _compute_focus_daily_rankings,
        _build_ltp_map,
        _build_symbol_series,
        _enrich_focus_ranking_series,
        _fetch_smart_money_leaderboard,
        _fetch_smart_money_signals,
        _compute_smart_money_kpi,
        _fetch_smart_money_symbol_flows,
        _fetch_navigator_raw,
        _classify_navigator_signal,
        _build_navigator_signal_row,
        _build_below_cost_where,
        _build_below_cost_query,
        _build_broker_portfolio_query,
        _exec_broker_portfolio,
        _resolve_share_transfer_dates,
        _build_share_transfers_filters,
        _fetch_transfer_net_acc_map,
        _fetch_transfer_meta_map,
        _fetch_transfer_stats_and_daily,
        _build_daily_stats,
        _build_transfer_summary,
        _load_forecast_data,
        _extract_current_state,
        _compute_study,
        _import_price_forecast_helpers,
        _compute_forecast,
    )
    fns = [
        _build_accumulation_flows_where, _build_accumulation_flows_query, _compute_history_delta,
        _build_broker_trends_sql_fragments, _build_broker_trends_params, _build_broker_trends_query,
        _fetch_broker_favorites_raw, _build_broker_favorites_base, _compute_rsi_roc,
        _build_price_map_for_favorites, _enrich_broker_favorites_with_prices,
        _fetch_focus_ranking_raw, _rank_stocks_for_date, _compute_focus_daily_rankings,
        _build_ltp_map, _build_symbol_series, _enrich_focus_ranking_series,
        _fetch_smart_money_leaderboard, _fetch_smart_money_signals, _compute_smart_money_kpi,
        _fetch_smart_money_symbol_flows, _fetch_navigator_raw, _classify_navigator_signal,
        _build_navigator_signal_row, _build_below_cost_where, _build_below_cost_query,
        _build_broker_portfolio_query, _exec_broker_portfolio,
        _resolve_share_transfer_dates, _build_share_transfers_filters,
        _fetch_transfer_net_acc_map, _fetch_transfer_meta_map, _fetch_transfer_stats_and_daily,
        _build_daily_stats, _build_transfer_summary,
        _load_forecast_data, _extract_current_state, _compute_study,
        _import_price_forecast_helpers, _compute_forecast,
    ]
    for fn in fns:
        assert callable(fn), f"{fn} is not callable"


def test_constants_accessible():
    from stocks.services.broker_research import RANGE_MAP, FORECAST_CACHE_TTL, RSI_CTE
    assert isinstance(RANGE_MAP, dict)
    assert len(RANGE_MAP) > 0
    assert isinstance(FORECAST_CACHE_TTL, int)
    assert isinstance(RSI_CTE, str)


def test_monkeypatch_compat_names_accessible():
    """Names that tests monkeypatch on the broker_research module namespace."""
    import stocks.services.broker_research as br
    assert hasattr(br, '_exec')
    assert hasattr(br, 'cache')
    assert hasattr(br, 'connections')
    assert hasattr(br, 'DailyStockPrice')
    assert callable(br._exec)
