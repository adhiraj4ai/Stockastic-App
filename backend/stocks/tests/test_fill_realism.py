# backend/stocks/tests/test_fill_realism.py
"""Guard: orders decided on bar N's close must fill at bar N+1's open.

If the harness ever fills at the decision bar's close (lookahead), the
synthetic series below yields ~+14% instead of ~0%, and this test fails.
"""
import pandas as pd

from stocks.services.backtest_harness.runner import run_backtest

_PROBE_CODE = """
from backtesting import Strategy

class ProbeStrategy(Strategy):
    def init(self):
        pass

    def next(self):
        if not self.position and self.data.Close[-1] >= 105:
            self.buy()
"""


def _gap_df():
    # Bars 0-9 flat at 100. Bar 10 closes at 105 (signal). Bar 11 gaps open
    # to 120 and the series stays at 120. Honest fill price: 120 (≈0% return
    # net of fees). Lookahead fill price: 105 (≈ +14%).
    rows = []
    for _ in range(10):
        rows.append((100.0, 100.0, 100.0, 100.0))
    rows.append((100.0, 106.0, 99.0, 105.0))   # signal bar
    rows.append((120.0, 121.0, 119.0, 120.0))  # gap bar — honest entry here
    for _ in range(13):
        rows.append((120.0, 120.0, 120.0, 120.0))
    idx = pd.date_range("2025-01-01", periods=len(rows), freq="D")
    df = pd.DataFrame(rows, columns=["Open", "High", "Low", "Close"], index=idx)
    df["Volume"] = 10_000.0
    return df


def test_entry_fills_at_next_open_not_signal_close():
    res = run_backtest(_PROBE_CODE, "TEST", df=_gap_df(), commission=0.0, spread=0.0)
    assert res.ok, res.error
    assert res.metrics["num_trades"] >= 0
    # Honest next-open fill at 120 -> ~0% return. Lookahead fill at 105 -> ~+14%.
    assert res.metrics["return_pct"] < 5.0, (
        "Entry appears to fill at the signal bar's close — lookahead bias!"
    )
