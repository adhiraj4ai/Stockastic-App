# backend/stocks/services/backtest_harness/expectancy.py
"""Expectancy from a list of per-trade returns (fractions, fee-net via Plan 1).

expectancy = win_rate * avg_win - loss_rate * avg_loss   (per-trade, same units).
Positive expectancy = the strategy makes money per trade on average, after costs.
"""
__all__ = ["expectancy_stats"]


def expectancy_stats(trade_returns):
    rets = [float(r) for r in (trade_returns or [])]
    n = len(rets)
    if n == 0:
        return {"wins": 0, "losses": 0, "win_rate": 0.0, "avg_win": 0.0,
                "avg_loss": 0.0, "expectancy": 0.0, "payoff_ratio": 0.0}
    wins = [r for r in rets if r > 0]
    losses = [r for r in rets if r <= 0]
    avg_win = (sum(wins) / len(wins)) if wins else 0.0
    avg_loss = (abs(sum(losses) / len(losses))) if losses else 0.0
    win_rate = len(wins) / n
    loss_rate = len(losses) / n
    expectancy = win_rate * avg_win - loss_rate * avg_loss
    payoff = (avg_win / avg_loss) if avg_loss > 0 else 0.0
    return {
        "wins": len(wins), "losses": len(losses), "win_rate": win_rate,
        "avg_win": avg_win, "avg_loss": avg_loss,
        "expectancy": expectancy, "payoff_ratio": payoff,
    }
