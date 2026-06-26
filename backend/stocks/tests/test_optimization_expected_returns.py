import pytest
import pandas as pd
from unittest.mock import patch
from stocks.services.optimization import perform_portfolio_optimization

pytestmark = pytest.mark.django_db


def test_result_includes_annualized_expected_returns():
    # Two tickers, deterministic upward drift so the mean is positive and checkable.
    idx = pd.date_range("2024-01-01", periods=120, freq="D")
    df = pd.DataFrame({"AAA": [100 * (1.001 ** i) for i in range(120)],
                       "BBB": [50 * (1.002 ** i) for i in range(120)]}, index=idx)
    with patch("stocks.services.optimization.fetch_price_data", return_value=df):
        out = perform_portfolio_optimization(["AAA", "BBB"],
                                             current_holdings={"AAA": {"quantity": 10, "price": 100},
                                                               "BBB": {"quantity": 10, "price": 50}},
                                             method="equal")
    assert out["success"] is True
    er = out["expected_returns"]
    expected = df.pct_change().dropna().mean() * 252
    assert er["AAA"] == pytest.approx(expected["AAA"], rel=1e-6)
    assert er["BBB"] == pytest.approx(expected["BBB"], rel=1e-6)


def test_single_stock_result_has_empty_expected_returns():
    out = perform_portfolio_optimization(["AAA"], current_holdings={"AAA": {"quantity": 5, "price": 100}})
    assert out["expected_returns"] == {}
