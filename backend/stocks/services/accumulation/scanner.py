"""Daily scanner: score the liquid universe, persist ranked candidates."""
import math
from datetime import date
from decimal import Decimal

import numpy as np
import pandas as pd

from stocks.models import AccumulationCandidate, Strategy
from stocks.services.accumulation.calibration import ACCUMULATION_STRATEGY_NAME
from stocks.services.accumulation.score_service import AccumulationScoreService, ScoreParams
from stocks.services.accumulation.universe import liquid_universe
from stocks.services.backtest_harness.runner import load_price_df

ENTRY_SCORE_THRESHOLD_DEFAULT = 70.0
STOP_ATR_MULT = 3.0
TARGET_RR = 2.0
ATR_PERIOD = 14


def _atr(price_df, period=ATR_PERIOD):
    high, low, close = price_df["High"], price_df["Low"], price_df["Close"]
    prev_close = close.shift(1)
    tr = pd.concat([(high - low),
                    (high - prev_close).abs(),
                    (low - prev_close).abs()], axis=1).max(axis=1)
    tr = tr.fillna(high - low)
    return float(tr.rolling(period).mean().iloc[-1])


def suggested_levels(price_df):
    entry = float(price_df["Close"].iloc[-1])
    atr = _atr(price_df)
    if not atr or math.isnan(atr):
        atr = entry * 0.02
    stop = entry - STOP_ATR_MULT * atr
    target = entry + TARGET_RR * (entry - stop)
    return (Decimal(str(round(entry, 2))),
            Decimal(str(round(stop, 2))),
            Decimal(str(round(target, 2))))


class AccumulationScanner:

    @staticmethod
    def _config():
        strat = Strategy.objects.filter(name=ACCUMULATION_STRATEGY_NAME).first()
        spec = (strat.spec if strat else None) or {}
        bp = spec.get("best_params", {})
        params = ScoreParams(**{k: v for k, v in bp.items()
                                if k in ScoreParams.__dataclass_fields__})
        state = spec.get("validation_state", "research")
        threshold = float(bp.get("entry_threshold", ENTRY_SCORE_THRESHOLD_DEFAULT))
        return params, state, threshold

    @staticmethod
    def _build_candidate(symbol, as_of, params, state, threshold):
        df = load_price_df(symbol)
        if df is None or df.empty:
            return None
        score = AccumulationScoreService.score_series(symbol, df, params)
        if float(score.iloc[-1]) < threshold:
            return None
        entry, stop, target = suggested_levels(df)
        return dict(symbol=symbol, scan_date=as_of,
                    score=Decimal(str(round(float(score.iloc[-1]), 2))),
                    factors=AccumulationScoreService.factor_breakdown(symbol, df, params),
                    suggested_entry=entry, suggested_stop=stop, suggested_target=target,
                    validation_state=state, status=AccumulationCandidate.Status.ACTIVE)

    @staticmethod
    def scan_and_save_candidates(as_of=None):
        as_of = as_of or date.today()
        AccumulationCandidate.objects.filter(
            status=AccumulationCandidate.Status.ACTIVE).update(
            status=AccumulationCandidate.Status.EXPIRED)
        params, state, threshold = AccumulationScanner._config()
        written = 0
        for symbol in liquid_universe(as_of):
            row = AccumulationScanner._build_candidate(symbol, as_of, params, state, threshold)
            if row:
                AccumulationCandidate.objects.update_or_create(
                    symbol=symbol, scan_date=as_of, defaults=row)
                written += 1
        return written
