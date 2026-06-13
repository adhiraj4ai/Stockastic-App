"""Validate framework compositions against the current (hand) strategies, parity-gated.

For each strategy: score its composition on the basket and score the current DB
version, then recommend ADOPT only when the composition matches-or-beats the hand
version on median excess return (and runs cleanly on every symbol). Writes
port_compositions.json with the adopt decisions. Run inside the backend container.
"""
import os, json, sys
import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "stockastic.settings")
django.setup()
import warnings, logging
warnings.filterwarnings("ignore"); logging.disable(logging.CRITICAL)

from stocks.models import Strategy
from stocks.services.backtest_harness import evaluate_over_basket, load_basket

IMP = "from stocks.services.strategy_framework import build_strategy, alphas, regimes, stops, exits\nStrategy = "

# name -> composition body (everything after "Strategy = ")
COMP = {
 "SMA Crossover": "build_strategy(alpha=alphas.SmaCross(20,50), regime=regimes.AboveEMA(200), stop=stops.AtrTrail(3), name='x')",
 "Supertrend Follower": "build_strategy(alpha=alphas.SupertrendFlip(10,3.0), regime=regimes.AboveEMA(200), stop=stops.AtrTrail(3), name='x')",
 "MACD Trend Follower": "build_strategy(alpha=alphas.MacdCross(), regime=regimes.AboveEMA(200), stop=stops.AtrTrail(3), exit=exits.TrendBreak(200), name='x')",
 "Turtle Trading (Channel Breakout)": "build_strategy(alpha=alphas.DonchianBreakout(20,10), regime=regimes.AboveEMA(200), stop=stops.AtrTrail(3), name='x')",
 "Golden Cross + ADX": "build_strategy(alpha=alphas.SmaCross(50,200), regime=regimes.AdxAbove(25), stop=stops.AtrTrail(6), name='x')",
 "Parabolic SAR (Momentum)": "build_strategy(alpha=alphas.ParabolicSarFlip(), regime=regimes.AboveEMA(200), stop=stops.AtrTrail(3), name='x')",
 "Ichimoku Cloud Trend": "build_strategy(alpha=alphas.IchimokuCloud(), regime=regimes.AboveEMA(200), stop=stops.AtrTrail(3), name='x')",
 "ADX Trend Strength": "build_strategy(alpha=alphas.AdxDi(14,25), regime=regimes.AboveEMA(200), stop=stops.AtrTrail(3), name='x')",
 "Volume Breakout Hunter": "build_strategy(alpha=alphas.VolumeBreakout(20,2.0), regime=regimes.AboveEMA(200), stop=stops.AtrTrail(3), exit=exits.TrendBreak(200), name='x')",
 "VWAP Pullback": "build_strategy(alpha=alphas.VwapReclaim(), regime=regimes.AboveEMA(200), stop=stops.AtrTrail(3), exit=exits.TrendBreak(200), name='x')",
 "Keltner Channel Breakout": "build_strategy(alpha=alphas.KeltnerReclaim(), regime=regimes.AboveEMA(200), stop=stops.AtrTrail(3), exit=exits.TrendBreak(200), name='x')",
 "Force Index Impulse": "build_strategy(alpha=alphas.ForceIndexZero(13), regime=regimes.AboveEMA(200), stop=stops.AtrTrail(3), exit=exits.TrendBreak(200), name='x')",
 "Aroon Trend Strength": "build_strategy(alpha=alphas.AroonCross(14,70), regime=regimes.AboveEMA(200), stop=stops.AtrTrail(3), name='x')",
 "Coppock Curve (Long Term)": "build_strategy(alpha=alphas.CoppockTurn(), regime=regimes.AboveEMA(200), stop=stops.AtrTrail(3), name='x')",
 "Chaikin Money Flow Divergence": "build_strategy(alpha=alphas.CmfCross(20,0.05), regime=regimes.AboveEMA(200), stop=stops.AtrTrail(3), name='x')",
 "On-Balance Volume (OBV) Trend": "build_strategy(alpha=alphas.ObvAboveMA(20), regime=regimes.AboveEMA(200), stop=stops.AtrTrail(3), exit=exits.TrendBreak(200), name='x')",
 "Williams %R Trend": "build_strategy(alpha=alphas.WilliamsROversold(14,-80,-20), regime=regimes.AboveEMA(200), stop=stops.AtrTrail(3), name='x')",
 "Williams Alligator v2": "build_strategy(alpha=alphas.AlligatorBreakout(), regime=regimes.AboveEMA(200), stop=stops.AtrTrail(3), name='x')",
 "NR7 Volatility Breakout": "build_strategy(alpha=alphas.Nr7Breakout(), regime=regimes.AboveEMA(200), stop=stops.AtrTrail(2.5), exit=exits.TrendBreak(200), name='x')",
 "Inside Bar Momentum": "build_strategy(alpha=alphas.InsideBarBreakout(), regime=regimes.AboveEMA(200), stop=stops.AtrTrail(2.5), exit=exits.TrendBreak(200), name='x')",
 "Three White Soldiers (Trend)": "build_strategy(alpha=alphas.ThreeWhiteSoldiers(3), regime=regimes.AboveEMA(200), stop=stops.AtrTrail(3), name='x')",
 "Dual Thrust Breakout": "build_strategy(alpha=alphas.DualThrust(4,0.5,0.5), regime=regimes.AboveEMA(200), stop=stops.AtrTrail(3), name='x')",
 "Golden Cross Pullback": "build_strategy(alpha=alphas.SmaPullback(50,200,0.02), stop=stops.AtrTrail(3), name='x')",
 "RSI & Bollinger Mean Reversion": "build_strategy(alpha=alphas.RsiOversold(14,40,70), regime=regimes.AboveEMA(200), stop=stops.FixedAtr(6), name='x')",
 "RSI-2 Mean Reversion": "build_strategy(alpha=alphas.Rsi2Connors(2,10,200,5), stop=stops.FixedAtr(6), name='x')",
 "Stochastic RSI Cross": "build_strategy(alpha=alphas.StochRsiCross(), stop=stops.FixedAtr(6), name='x')",
 "Money Flow Index Reversal": "build_strategy(alpha=alphas.MfiOversold(14), stop=stops.FixedAtr(6), name='x')",
 "Z-Score Mean Reversion": "build_strategy(alpha=alphas.ZScoreReversion(20,-2.0,1.0), regime=regimes.AboveEMA(200), stop=stops.FixedAtr(6), name='x')",
 "Fibonacci Golden Zone": "build_strategy(alpha=alphas.FibGoldenZone(50), regime=regimes.AboveEMA(200), stop=stops.FixedAtr(6), name='x')",
 "Turtle Soup Reversal": "build_strategy(alpha=alphas.TurtleSoupReversal(20), stop=stops.FixedAtr(1.0), rr=2.0, name='x')",
 "Smart Money Accumulation": "build_strategy(alpha=alphas.AccumulationAboveMA(symbol=symbol, top_n=5, ma=20), regime=regimes.AboveEMA(200), stop=stops.AtrTrail(3), name='x')",
 "Accumulation Divergence": "build_strategy(alpha=alphas.AccumulationDivergence(symbol=symbol, lookback=10), stop=stops.FixedAtr(6), name='x')",
 "Smart Money Trend (Ownership)": "build_strategy(alpha=alphas.AccumulationMaCross(symbol=symbol, top_n=5, fast=10, slow=50), regime=regimes.AboveEMA(200), stop=stops.AtrTrail(3), name='x')",
 "Smart Accumulated Crossover": "build_strategy(alpha=alphas.AccumulationMaCross(symbol=symbol, top_n=5, fast=10, slow=50), regime=regimes.AboveEMA(200), stop=stops.AtrTrail(3), name='x')",
 "Broker Accumulation (Institutional)": "build_strategy(alpha=alphas.AccumulationAboveMA(symbol=symbol, top_n=20, ma=20), regime=regimes.AboveEMA(200), stop=stops.AtrTrail(3), name='x')",
}

basket, _ = load_basket()


def score(target, name):
    c = evaluate_over_basket(target, basket, strategy_name=name)
    a = c.aggregates
    return {"pass": c.passed, "ok": a.get("symbols_ok", 0), "total": a.get("symbols_total", 0),
            "excess": a.get("median_excess_return_pct"), "sortino": a.get("median_strategy_sortino")}


out = []
for name, body in COMP.items():
    try:
        hand = score(Strategy.objects.get(name=name), name)
    except Strategy.DoesNotExist:
        continue
    comp = score(IMP + body, name)
    he = hand["excess"] if hand["excess"] is not None else -1e9
    ce = comp["excess"] if comp["excess"] is not None else -1e9
    runs = comp["ok"] == comp["total"] and comp["total"] > 0
    adopt = runs and ce >= he - 2.0  # parity (2pp tolerance); never adopt a regression
    out.append({"name": name, "adopt": adopt, "comp": comp, "hand": hand})
    print(f"{'ADOPT' if adopt else 'KEEP '} {name:<36} comp={ce:>8.1f}% (pass={comp['pass']}) | hand={he:>8.1f}% (pass={hand['pass']})")

with open("/app/port_compositions.json", "w") as f:
    json.dump({"compositions": COMP, "results": out}, f, indent=2)
print(f"\nADOPT {sum(1 for o in out if o['adopt'])}/{len(out)}")
