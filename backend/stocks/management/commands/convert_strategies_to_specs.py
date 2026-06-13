"""Auto-convert the strategies that map cleanly to compositions into declarative specs.

For each named strategy we set `spec` and re-render `code = spec_to_code(spec)` so it
becomes a first-class Composed strategy (builder-editable). Idempotent; only touches the
listed names; everything else stays Custom. Minimal specs rely on registry defaults;
non-default params (and rr / extra exits) are stated explicitly so behaviour is preserved.
"""

from django.core.management.base import BaseCommand
from stocks.models import Strategy
from stocks.services.strategy_framework import validate_spec, spec_to_code, SpecError


def _spec(alpha, regime=None, stop=None, exit=None, rr=None):
    s = {"version": 1, "alpha": alpha}
    if regime:
        s["regime"] = regime
    if stop:
        s["stop"] = stop
    if exit:
        s["exit"] = exit
    if rr is not None:
        s["rr"] = rr
    return s


def _a(t, **p):  # node helper
    return {"type": t, "params": p} if p else {"type": t}


ABOVE_EMA = _a("AboveEMA")
ATR_TRAIL = _a("AtrTrail")
FIXED_ATR = _a("FixedAtr")
TREND_BREAK = _a("TrendBreak")

# name -> spec  (validated compositions that matched or beat their hand version)
SPECS = {
    "Supertrend Follower": _spec(_a("SupertrendFlip"), ABOVE_EMA, ATR_TRAIL),
    "Turtle Trading (Channel Breakout)": _spec(_a("DonchianBreakout"), ABOVE_EMA, ATR_TRAIL),
    "Parabolic SAR (Momentum)": _spec(_a("ParabolicSarFlip"), ABOVE_EMA, ATR_TRAIL),
    "Ichimoku Cloud Trend": _spec(_a("IchimokuCloud"), ABOVE_EMA, ATR_TRAIL),
    "ADX Trend Strength": _spec(_a("AdxDi"), ABOVE_EMA, ATR_TRAIL),
    "Keltner Channel Breakout": _spec(_a("KeltnerReclaim"), ABOVE_EMA, ATR_TRAIL, [TREND_BREAK]),
    "Aroon Trend Strength": _spec(_a("AroonCross"), ABOVE_EMA, ATR_TRAIL),
    "Coppock Curve (Long Term)": _spec(_a("CoppockTurn"), ABOVE_EMA, ATR_TRAIL),
    "Chaikin Money Flow Divergence": _spec(_a("CmfCross"), ABOVE_EMA, ATR_TRAIL),
    "On-Balance Volume (OBV) Trend": _spec(_a("ObvAboveMA"), ABOVE_EMA, ATR_TRAIL, [TREND_BREAK]),
    "Williams Alligator v2": _spec(_a("AlligatorBreakout"), ABOVE_EMA, ATR_TRAIL),
    "Inside Bar Momentum": _spec(_a("InsideBarBreakout"), ABOVE_EMA, _a("AtrTrail", atr_multiplier=2.5), [TREND_BREAK]),
    "RSI & Bollinger Mean Reversion": _spec(_a("RsiOversold"), ABOVE_EMA, FIXED_ATR),
    "RSI-2 Mean Reversion": _spec(_a("Rsi2Connors"), None, FIXED_ATR),
    "Money Flow Index Reversal": _spec(_a("MfiOversold"), None, FIXED_ATR),
    "Fibonacci Golden Zone": _spec(_a("FibGoldenZone"), ABOVE_EMA, FIXED_ATR),
    "Turtle Soup Reversal": _spec(_a("TurtleSoupReversal"), None, _a("FixedAtr", atr_multiplier=1.0), rr=2.0),
    "Smart Money Accumulation": _spec(_a("AccumulationAboveMA"), ABOVE_EMA, ATR_TRAIL),
    "Accumulation Divergence": _spec(_a("AccumulationDivergence"), None, FIXED_ATR),
    "Broker Accumulation (Institutional)": _spec(_a("AccumulationAboveMA", top_brokers=20), ABOVE_EMA, ATR_TRAIL),
    "Z-Score Mean Reversion": _spec(_a("ZScoreReversion"), ABOVE_EMA, FIXED_ATR),
    "MACD + Parabolic SAR": _spec(_a("MacdCross"), ABOVE_EMA, ATR_TRAIL, [TREND_BREAK]),
}


class Command(BaseCommand):
    help = "Set declarative specs on the strategies that map cleanly to compositions."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **opts):
        converted, skipped = 0, 0
        for name, spec in SPECS.items():
            try:
                validate_spec(spec)
                code = spec_to_code(spec)
            except SpecError as e:
                self.stdout.write(self.style.ERROR(f"BAD SPEC {name}: {e}"))
                continue
            qs = Strategy.objects.filter(name=name)
            if not qs.exists():
                self.stdout.write(self.style.WARNING(f"skip (not found): {name}"))
                skipped += 1
                continue
            if not opts["dry_run"]:
                qs.update(spec=spec, code=code)
            self.stdout.write(self.style.SUCCESS(f"converted: {name}"))
            converted += 1
        self.stdout.write(f"\n{converted} converted, {skipped} skipped"
                          + (" (dry run)" if opts["dry_run"] else ""))
