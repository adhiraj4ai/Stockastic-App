# backend/stocks/tests/test_strategy_performance_service.py
import pytest
from unittest.mock import patch, MagicMock
from django.contrib.auth.models import User


@pytest.fixture
def user(db):
    return User.objects.create_user(username="perf_test_user", password="pw")


@pytest.mark.django_db
def test_fetch_episodes_returns_list(user):
    from stocks.services.strategy_performance_service import _fetch_episodes
    result = _fetch_episodes(user)
    assert isinstance(result, list)


@pytest.mark.django_db
def test_fetch_episodes_normalises_field_names(user):
    from stocks.services.strategy_performance_service import _fetch_episodes
    result = _fetch_episodes(user)
    assert isinstance(result, list)
    for row in result:
        assert "signal" in row
        assert "generated_date" in row
        assert "closed_date" in row
        assert "ltp" in row
        assert "strength" in row


def test_group_by_source_empty():
    from stocks.services.strategy_performance_service import _group_by_source
    assert _group_by_source([]) == {}


def test_group_by_source_groups_correctly():
    from stocks.services.strategy_performance_service import _group_by_source
    episodes = [
        {"source": "engine_a", "symbol": "NABIL"},
        {"source": "engine_b", "symbol": "NMB"},
        {"source": "engine_a", "symbol": "SCB"},
    ]
    result = _group_by_source(episodes)
    assert set(result.keys()) == {"engine_a", "engine_b"}
    assert len(result["engine_a"]) == 2


def test_streak_all_wins():
    from stocks.services.strategy_performance_service import _compute_win_loss_streak
    from datetime import date
    episodes = [
        {"status": "WON", "generated_date": date(2025, 1, 1)},
        {"status": "WON", "generated_date": date(2025, 1, 2)},
        {"status": "WON", "generated_date": date(2025, 1, 3)},
    ]
    max_wins, max_losses = _compute_win_loss_streak(episodes)
    assert max_wins == 3 and max_losses == 0


def test_streak_alternating():
    from stocks.services.strategy_performance_service import _compute_win_loss_streak
    from datetime import date
    episodes = [
        {"status": "WON",  "generated_date": date(2025, 1, 1)},
        {"status": "LOST", "generated_date": date(2025, 1, 2)},
        {"status": "LOST", "generated_date": date(2025, 1, 3)},
        {"status": "WON",  "generated_date": date(2025, 1, 4)},
    ]
    max_wins, max_losses = _compute_win_loss_streak(episodes)
    assert max_wins == 1 and max_losses == 2


def test_streak_empty():
    from stocks.services.strategy_performance_service import _compute_win_loss_streak
    assert _compute_win_loss_streak([]) == (0, 0)


def test_monthly_perf_basic():
    from stocks.services.strategy_performance_service import _compute_monthly_perf
    from datetime import date
    episodes = [
        {"status": "WON",  "generated_date": date(2025, 3, 5), "pnl_percent": 4.0},
        {"status": "LOST", "generated_date": date(2025, 3, 10), "pnl_percent": -2.0},
        {"status": "WON",  "generated_date": date(2025, 4, 1), "pnl_percent": 3.0},
    ]
    result = _compute_monthly_perf(episodes)
    assert isinstance(result, list) and len(result) == 2
    march = next(r for r in result if r["month"] == "2025-03")
    assert march["won"] == 1 and march["lost"] == 1 and march["pnl"] == 2.0


def test_monthly_perf_empty():
    from stocks.services.strategy_performance_service import _compute_monthly_perf
    assert _compute_monthly_perf([]) == []


def test_pnl_buckets_all_keys_present():
    from stocks.services.strategy_performance_service import _compute_pnl_buckets
    result = _compute_pnl_buckets([])
    expected_keys = {"< -5%", "-5% to -2%", "-2% to 0%", "0% to 2%", "2% to 5%", "5% to 10%", "> 10%"}
    assert set(result.keys()) == expected_keys


def test_pnl_buckets_correct_placement():
    from stocks.services.strategy_performance_service import _compute_pnl_buckets
    result = _compute_pnl_buckets([-6.0, -3.5, -1.0, 1.0, 3.0, 7.0, 11.0])
    assert result["< -5%"] == 1 and result["-5% to -2%"] == 1
    assert result["-2% to 0%"] == 1 and result["0% to 2%"] == 1


def test_buy_sell_stats_keys():
    from stocks.services.strategy_performance_service import _compute_buy_sell_stats
    result = _compute_buy_sell_stats([])
    for d in ("buy", "sell"):
        assert d in result
        assert set(result[d].keys()) == {"total", "won", "lost", "active", "win_rate"}


def test_buy_sell_stats_win_rate():
    from stocks.services.strategy_performance_service import _compute_buy_sell_stats
    import pytest
    episodes = [
        {"signal": "BUY", "status": "WON"},
        {"signal": "BUY", "status": "WON"},
        {"signal": "BUY", "status": "LOST"},
        {"signal": "SELL", "status": "LOST"},
    ]
    result = _compute_buy_sell_stats(episodes)
    assert result["buy"]["total"] == 3 and result["buy"]["won"] == 2
    assert result["buy"]["win_rate"] == pytest.approx(66.7, rel=0.01)


def test_compute_engine_stats_structure():
    from stocks.services.strategy_performance_service import _compute_engine_stats
    from datetime import date
    episodes = [
        {"source": "eng", "symbol": "NABIL", "signal": "BUY", "direction": "BUY",
         "status": "WON", "pnl_percent": 5.0,
         "generated_date": date(2025, 1, 1), "closed_date": date(2025, 1, 10),
         "ltp": 1000, "strength": 80, "signal_tier": "A",
         "target_price": 1100, "stop_loss_price": 950},
        {"source": "eng", "symbol": "NMB", "signal": "BUY", "direction": "BUY",
         "status": "LOST", "pnl_percent": -2.0,
         "generated_date": date(2025, 2, 1), "closed_date": date(2025, 2, 5),
         "ltp": 500, "strength": 60, "signal_tier": "B",
         "target_price": 520, "stop_loss_price": 480},
    ]
    result = _compute_engine_stats("eng", episodes)
    required_keys = {
        "source", "total", "won", "lost", "active", "win_rate",
        "avg_win_pnl", "avg_loss_pnl", "profit_factor", "expectancy",
        "max_consecutive_wins", "max_consecutive_losses", "avg_days_to_close",
        "best_signal_pnl", "worst_signal_pnl", "consistency_score",
        "monthly_performance", "pnl_distribution", "buy_stats", "sell_stats",
        "top_symbols", "worst_symbols",
    }
    assert required_keys <= set(result.keys())
    assert result["total"] == 2 and result["won"] == 1


def test_compute_engine_stats_profit_factor_default():
    from stocks.services.strategy_performance_service import _compute_engine_stats
    from stocks.constants import PROFIT_FACTOR_DEFAULT
    from datetime import date
    episodes = [
        {"source": "eng", "symbol": "NABIL", "signal": "BUY", "direction": "BUY",
         "status": "WON", "pnl_percent": 10.0,
         "generated_date": date(2025, 1, 1), "closed_date": date(2025, 1, 5),
         "ltp": 1000, "strength": 90, "signal_tier": "A",
         "target_price": 1100, "stop_loss_price": 950},
    ]
    result = _compute_engine_stats("eng", episodes)
    assert result["profit_factor"] == PROFIT_FACTOR_DEFAULT


def test_build_response_structure():
    import pytest
    from stocks.services.strategy_performance_service import _build_response
    engines = [
        {"source": "eng_a", "total": 10, "won": 7, "lost": 3, "active": 0,
         "win_rate": 70.0, "profit_factor": 2.5},
        {"source": "eng_b", "total": 5, "won": 2, "lost": 3, "active": 0,
         "win_rate": 40.0, "profit_factor": 0.8},
    ]
    result = _build_response(engines, total_signals=15, total_resolved=13,
                             total_won=9, total_profit=35.0, total_loss=10.0)
    assert "engines" in result and "overall" in result
    assert result["engines"][0]["source"] == "eng_a"
    assert result["overall"]["net_pnl"] == pytest.approx(25.0)
    assert result["overall"]["best_engine"] == "eng_a"
